/**
 * POST /api/ai/generate
 * Replaces: Supabase Edge Function ai-generate
 *
 * Validates the caller's Supabase JWT, checks AI quota, then calls
 * OpenAI (with Gemini as fallback) and returns the generated text.
 */
import { NextRequest } from 'next/server';
import { requireAuth, adminClient, json, cors } from '@/lib/supabase';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? '';

export async function OPTIONS() { return cors(); }

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);

    // Quota gate (calls check_and_increment_ai_usage RPC)
    const supabase = adminClient();
    const { data: usageData, error: rpcError } = await supabase.rpc(
      'check_and_increment_ai_usage',
      { p_user_id: user.id }
    );

    if (rpcError) {
      const code = (rpcError as { code?: string }).code;
      if (code === 'P0001') return json({ error: 'AI commands require a Pro or Team plan. Upgrade in the Options page.' }, 402);
      if (code === 'P0003') return json({ error: 'Monthly AI quota reached. Resets at the start of next month.' }, 429);
      console.error('[ai/generate] RPC error:', rpcError);
      return json({ error: 'Usage check failed. Please try again.' }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const prompt = (body.prompt ?? '').trim();
    if (!prompt)               return json({ error: 'prompt is required' }, 400);
    if (prompt.length > 8000)  return json({ error: 'prompt too long (max 8000 chars)' }, 400);

    const result = await generateText(prompt);

    const { data: usageRow } = await supabase
      .from('ai_usage')
      .select('used, quota, resets_at')
      .eq('user_id', user.id)
      .single();

    return json({
      text:     result.text,
      provider: result.provider,
      usage: {
        used:     usageRow?.used     ?? usageData as number,
        quota:    usageRow?.quota    ?? null,
        resetsAt: usageRow?.resets_at ?? null,
      },
    });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    return json({ error: e.message ?? 'Internal error' }, e.status ?? 500);
  }
}

// ── OpenAI ────────────────────────────────────────────────────────────────────

async function callOpenAI(prompt: string): Promise<string> {
  if (!OPENAI_API_KEY) throw new Error('OpenAI API key not configured.');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 1024,
      temperature: 0.7,
      messages: [
        { role: 'system', content: 'You are a helpful assistant. Respond concisely and directly. Do not add preamble or meta-commentary.' },
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err.error?.message ?? `OpenAI error ${res.status}`);
  }
  const data = await res.json() as { choices: { message: { content: string } }[] };
  return data.choices?.[0]?.message?.content?.trim() ?? '';
}

async function callGemini(prompt: string): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error('Gemini API key not configured.');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
      systemInstruction: { parts: [{ text: 'You are a helpful assistant. Respond concisely and directly. Do not add preamble or meta-commentary.' }] },
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err.error?.message ?? `Gemini error ${res.status}`);
  }
  const data = await res.json() as { candidates: { content: { parts: { text: string }[] } }[] };
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
}

async function generateText(prompt: string): Promise<{ text: string; provider: string }> {
  try {
    return { text: await callOpenAI(prompt), provider: 'openai' };
  } catch (openAIErr) {
    console.warn('[ai/generate] OpenAI failed, trying Gemini fallback:', openAIErr);
  }
  try {
    return { text: await callGemini(prompt), provider: 'gemini' };
  } catch (geminiErr) {
    console.error('[ai/generate] Gemini fallback also failed:', geminiErr);
  }
  const err = new Error('AI service temporarily unavailable. Please try again in a moment.') as Error & { status?: number };
  err.status = 503;
  throw err;
}
