/**
 * ai-generate — Supabase Edge Function
 *
 * POST /functions/v1/ai-generate
 * Headers: Authorization: Bearer <supabase_jwt>
 * Body:    { prompt: string, context?: object }
 *
 * Flow:
 *   1. Validate JWT → get user_id
 *   2. Call check_and_increment_ai_usage RPC (tier gate + quota)
 *   3. Try OpenAI gpt-4o-mini  → on failure, fallback to Gemini 1.5 Flash
 *   4. Return { text, usage: { used, quota, resetsAt } }
 *
 * Env secrets required (set via `supabase secrets set`):
 *   OPENAI_API_KEY
 *   GEMINI_API_KEY
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const OPENAI_API_KEY    = Deno.env.get('OPENAI_API_KEY') ?? '';
const GEMINI_API_KEY    = Deno.env.get('GEMINI_API_KEY') ?? '';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function errorJson(message: string, status: number) {
  return json({ error: message }, status);
}

// ── OpenAI ───────────────────────────────────────────────────────────────────

async function callOpenAI(prompt: string): Promise<string> {
  if (!OPENAI_API_KEY) throw new Error('OpenAI API key not configured.');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model:       'gpt-4o-mini',
      max_tokens:  1024,
      temperature: 0.7,
      messages: [
        {
          role:    'system',
          content: 'You are a helpful assistant. Respond concisely and directly. Do not add preamble or meta-commentary.',
        },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(
      (err as { error?: { message?: string } }).error?.message ??
      `OpenAI error ${res.status}`
    );
  }

  const data = await res.json() as {
    choices: { message: { content: string } }[];
  };

  return data.choices?.[0]?.message?.content?.trim() ?? '';
}

// ── Google Gemini ─────────────────────────────────────────────────────────────

async function callGemini(prompt: string): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error('Gemini API key not configured.');

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role:  'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        maxOutputTokens: 1024,
        temperature:     0.7,
      },
      systemInstruction: {
        parts: [{
          text: 'You are a helpful assistant. Respond concisely and directly. Do not add preamble or meta-commentary.',
        }],
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(
      String((err as { error?: { message?: string } }).error?.message ?? `Gemini error ${res.status}`)
    );
  }

  const data = await res.json() as {
    candidates: { content: { parts: { text: string }[] } }[];
  };

  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
}

// ── Primary → Fallback orchestration ─────────────────────────────────────────

async function generateText(prompt: string): Promise<{ text: string; provider: string }> {
  // 1. Try OpenAI
  try {
    const text = await callOpenAI(prompt);
    return { text, provider: 'openai' };
  } catch (openAIErr) {
    console.warn('[ai-generate] OpenAI failed, trying Gemini fallback:', openAIErr);
  }

  // 2. Fallback to Gemini
  try {
    const text = await callGemini(prompt);
    return { text, provider: 'gemini' };
  } catch (geminiErr) {
    console.error('[ai-generate] Gemini fallback also failed:', geminiErr);
    throw new Error('AI service temporarily unavailable. Please try again in a moment.');
  }
}

// ── Request handler ───────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return errorJson('Method not allowed', 405);
  }

  // ── 1. Authenticate ────────────────────────────────────────────────────────

  const authHeader = req.headers.get('Authorization') ?? '';
  const token      = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) return errorJson('Missing Authorization header', 401);

  // Validate the user's JWT using the anon key + Authorization header
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) return errorJson('Invalid or expired session', 401);

  // ── 2. Quota gate (via service-role to bypass RLS) ─────────────────────────

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: usageData, error: rpcError } = await adminClient.rpc(
    'check_and_increment_ai_usage',
    { p_user_id: user.id }
  );

  if (rpcError) {
    // PostgreSQL custom error codes set in the function:
    //   P0001 → wrong tier (free user)
    //   P0003 → quota exceeded
    const code = (rpcError as { code?: string }).code;

    if (code === 'P0001') {
      return errorJson(
        'AI commands require a Pro or Team plan. Upgrade in the Options page.',
        402
      );
    }
    if (code === 'P0003') {
      return errorJson(
        'Monthly AI quota reached. Resets at the start of next month.',
        429
      );
    }
    console.error('[ai-generate] RPC error:', rpcError);
    return errorJson('Usage check failed. Please try again.', 500);
  }

  // usageData is the new count returned by the RPC function
  const used = usageData as number;

  // ── 3. Parse request body ──────────────────────────────────────────────────

  let body: { prompt?: string; context?: unknown };
  try {
    body = await req.json();
  } catch {
    return errorJson('Invalid JSON body', 400);
  }

  const prompt = (body.prompt ?? '').trim();
  if (!prompt) return errorJson('prompt is required', 400);
  if (prompt.length > 8000) return errorJson('prompt too long (max 8000 chars)', 400);

  // ── 4. Generate text (OpenAI → Gemini fallback) ───────────────────────────

  let result: { text: string; provider: string };
  try {
    result = await generateText(prompt);
  } catch (genErr) {
    const msg = genErr instanceof Error ? genErr.message : 'Generation failed';
    return errorJson(msg, 503);
  }

  // ── 5. Fetch updated quota info for the response ───────────────────────────

  const { data: usageRow } = await adminClient
    .from('ai_usage')
    .select('used, quota, resets_at')
    .eq('user_id', user.id)
    .single();

  return json({
    text:     result.text,
    provider: result.provider,          // 'openai' | 'gemini' — useful for debugging
    usage: {
      used:     usageRow?.used     ?? used,
      quota:    usageRow?.quota    ?? null,
      resetsAt: usageRow?.resets_at ?? null,
    },
  });
});
