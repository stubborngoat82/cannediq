/**
 * admin-users — Supabase Edge Function
 *
 * GET  /functions/v1/admin-users?page=0&limit=50&search=&plan=&suspended=
 *   Returns paginated user list with profile + EULA status.
 *
 * PATCH /functions/v1/admin-users
 *   Body: { userId, action: 'set_plan' | 'suspend' | 'unsuspend' | 'set_admin', value? }
 *   Actions:
 *     set_plan    — value: 'free' | 'pro' | 'ai' | 'team'
 *     suspend     — sets suspended = true
 *     unsuspend   — sets suspended = false
 *     set_admin   — value: true | false (grant/revoke admin)
 *
 * All routes require admin JWT.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

async function getAdminUser(token: string, supabase: any) {
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth:   { persistSession: false },
  });
  const { data: { user }, error } = await authClient.auth.getUser();
  if (error || !user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  return profile?.is_admin ? user : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ error: 'Missing Authorization header' }, 401);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const adminUser = await getAdminUser(token, supabase);
  if (!adminUser) return json({ error: 'Admin access required' }, 403);

  // ── GET — user list ───────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const url    = new URL(req.url);
    const page   = Math.max(0, parseInt(url.searchParams.get('page')  ?? '0', 10));
    const limit  = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10)));
    const search = (url.searchParams.get('search') ?? '').trim();
    const plan   = url.searchParams.get('plan') ?? '';
    const susp   = url.searchParams.get('suspended') ?? '';

    // Fetch profiles
    let q = supabase
      .from('profiles')
      .select(
        'id, email, full_name, tier, is_admin, suspended, created_at, last_seen_at, ' +
        'subscription_status, stripe_customer_id',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(page * limit, page * limit + limit - 1);

    if (plan)   q = q.eq('tier', plan);
    if (susp === 'true')  q = q.eq('suspended', true);
    if (susp === 'false') q = q.eq('suspended', false);
    if (search) q = q.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`);

    const { data: profiles, count, error } = await q;
    if (error) return json({ error: error.message }, 500);

    // Fetch EULA acceptance map for these user IDs
    const ids = (profiles ?? []).map((p: any) => p.id);
    let eulaMap: Record<string, string> = {};
    if (ids.length > 0) {
      const { data: eulaRows } = await supabase
        .from('eula_acceptances')
        .select('user_id, eula_version, accepted_at')
        .in('user_id', ids)
        .order('accepted_at', { ascending: false });

      // Keep the most recent acceptance per user
      (eulaRows ?? []).forEach((r: any) => {
        if (!eulaMap[r.user_id]) eulaMap[r.user_id] = r.eula_version;
      });
    }

    const users = (profiles ?? []).map((p: any) => ({
      ...p,
      eula_version_accepted: eulaMap[p.id] ?? null,
    }));

    return json({ users, total: count ?? 0, page, limit });
  }

  // ── PATCH — user actions ──────────────────────────────────────────────────────
  if (req.method === 'PATCH') {
    let body: { userId?: string; action?: string; value?: any };
    try   { body = await req.json(); }
    catch { return json({ error: 'Invalid JSON body' }, 400); }

    const { userId, action, value } = body;
    if (!userId) return json({ error: 'userId is required' }, 400);
    if (!action) return json({ error: 'action is required' }, 400);

    // Prevent admin from suspending or demoting themselves
    if (userId === adminUser.id && ['suspend', 'set_admin'].includes(action)) {
      return json({ error: 'You cannot modify your own admin or suspension status' }, 422);
    }

    let update: Record<string, any> = {};

    switch (action) {
      case 'set_plan': {
        const valid = ['free', 'pro', 'ai', 'team'];
        if (!valid.includes(value)) return json({ error: `Invalid plan. Must be one of: ${valid.join(', ')}` }, 400);
        update = { tier: value };
        break;
      }
      case 'suspend':
        update = { suspended: true };
        break;
      case 'unsuspend':
        update = { suspended: false };
        break;
      case 'set_admin':
        if (typeof value !== 'boolean') return json({ error: 'value must be true or false' }, 400);
        update = { is_admin: value };
        break;
      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }

    const { error: updateErr } = await supabase
      .from('profiles')
      .update(update)
      .eq('id', userId);

    if (updateErr) return json({ error: updateErr.message }, 500);

    return json({ ok: true, userId, action, applied: update });
  }

  return json({ error: 'Method not allowed' }, 405);
});
