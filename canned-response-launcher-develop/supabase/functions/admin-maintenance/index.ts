/**
 * admin-maintenance — Supabase Edge Function
 *
 * GET  /functions/v1/admin-maintenance
 *   Public (no auth required). Returns { banner_message, maintenance_mode }.
 *   The Chrome extension polls this on startup and every 30 minutes.
 *
 * POST /functions/v1/admin-maintenance
 *   Admin JWT required.
 *   Body: { banner_message?: string | null, maintenance_mode?: boolean }
 *   Updates the singleton maintenance_config row.
 *
 * Deploy with: supabase functions deploy admin-maintenance --no-verify-jwt
 * (The GET route is public; JWT verification is done manually for POST.)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // ── GET — public config read ──────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('maintenance_config')
      .select('banner_message, maintenance_mode, updated_at')
      .eq('id', 1)
      .single();

    if (error) return json({ banner_message: null, maintenance_mode: false }, 200);

    return json({
      banner_message:   data.banner_message   ?? null,
      maintenance_mode: data.maintenance_mode ?? false,
      updated_at:       data.updated_at,
    });
  }

  // ── POST — admin update ───────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return json({ error: 'Missing Authorization header' }, 401);

    // Verify admin
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth:   { persistSession: false },
    });
    const { data: { user }, error: authErr } = await authClient.auth.getUser();
    if (authErr || !user) return json({ error: 'Invalid or expired session' }, 401);

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (!profile?.is_admin) return json({ error: 'Admin access required' }, 403);

    // Parse and validate body
    let body: { banner_message?: string | null; maintenance_mode?: boolean };
    try   { body = await req.json(); }
    catch { return json({ error: 'Invalid JSON body' }, 400); }

    const updates: Record<string, any> = { updated_at: new Date().toISOString(), updated_by: user.id };

    if ('banner_message' in body) {
      const msg = body.banner_message;
      if (msg !== null && typeof msg !== 'string') return json({ error: 'banner_message must be a string or null' }, 400);
      updates.banner_message = msg?.trim() || null;
    }

    if ('maintenance_mode' in body) {
      if (typeof body.maintenance_mode !== 'boolean') return json({ error: 'maintenance_mode must be boolean' }, 400);
      updates.maintenance_mode = body.maintenance_mode;
    }

    const { error: updateErr } = await supabase
      .from('maintenance_config')
      .update(updates)
      .eq('id', 1);

    if (updateErr) return json({ error: updateErr.message }, 500);

    // Return current state
    const { data: current } = await supabase
      .from('maintenance_config')
      .select('banner_message, maintenance_mode, updated_at')
      .eq('id', 1)
      .single();

    return json({ ok: true, config: current });
  }

  return json({ error: 'Method not allowed' }, 405);
});
