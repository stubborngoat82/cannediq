/**
 * admin-stats — Supabase Edge Function
 *
 * GET /functions/v1/admin-stats
 * Headers: Authorization: Bearer <supabase_jwt>  (must be an admin user)
 *
 * Returns aggregate metrics for the cannedIQ admin dashboard:
 *   - User counts by plan
 *   - MRR estimate
 *   - New users this month
 *   - EULA compliance
 *   - Suspended / admin user counts
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const PLAN_PRICE: Record<string, number> = {
  pro:  10,
  ai:   20,
  team: 0,   // team MRR = seats * 12 (handled separately)
  free: 0,
};
const TEAM_SEAT_PRICE = 12;

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  // ── Authenticate + verify admin ───────────────────────────────────────────────
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ error: 'Missing Authorization header' }, 401);

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth:   { persistSession: false },
  });
  const { data: { user }, error: authErr } = await authClient.auth.getUser();
  if (authErr || !user) return json({ error: 'Invalid or expired session' }, 401);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const { data: caller } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!caller?.is_admin) return json({ error: 'Admin access required' }, 403);

  // ── Gather stats ─────────────────────────────────────────────────────────────

  // User counts by plan
  const { data: planRows } = await supabase
    .from('profiles')
    .select('tier')
    .neq('tier', null);

  const planCounts: Record<string, number> = { free: 0, pro: 0, ai: 0, team: 0 };
  (planRows ?? []).forEach((r: any) => {
    const t = r.tier ?? 'free';
    planCounts[t] = (planCounts[t] ?? 0) + 1;
  });
  const totalUsers = (planRows ?? []).length;

  // New users this month
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const { count: newThisMonth } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', monthStart.toISOString());

  // Suspended + admin counts
  const { count: suspendedCount } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('suspended', true);

  const { count: adminCount } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('is_admin', true);

  // MRR — individual plans
  let mrr = 0;
  mrr += (planCounts['pro'] ?? 0) * PLAN_PRICE['pro'];
  mrr += (planCounts['ai']  ?? 0) * PLAN_PRICE['ai'];

  // MRR — team plans: sum seats_purchased across all teams
  const { data: teamRows } = await supabase
    .from('teams')
    .select('seats_purchased');
  const totalTeamSeats = (teamRows ?? []).reduce((acc: number, t: any) => acc + (t.seats_purchased ?? 1), 0);
  mrr += totalTeamSeats * TEAM_SEAT_PRICE;

  // EULA compliance — count distinct users who accepted current version
  const { count: eulaAccepted } = await supabase
    .from('eula_acceptances')
    .select('*', { count: 'exact', head: true })
    .eq('eula_version', '1.0');

  // Failed payments (subscription_status = past_due)
  const { count: pastDueCount } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('subscription_status', 'past_due');

  // ── Response ─────────────────────────────────────────────────────────────────

  return json({
    totalUsers,
    newThisMonth:    newThisMonth    ?? 0,
    suspendedCount:  suspendedCount  ?? 0,
    adminCount:      adminCount      ?? 0,
    planCounts,
    mrr,
    totalTeamSeats,
    eulaCompliance: {
      accepted: eulaAccepted ?? 0,
      total:    totalUsers,
      pct: totalUsers > 0 ? Math.round(((eulaAccepted ?? 0) / totalUsers) * 100) : 0,
    },
    pastDueCount: pastDueCount ?? 0,
  });
});
