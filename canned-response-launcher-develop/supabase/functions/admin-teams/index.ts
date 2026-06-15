/**
 * admin-teams — Supabase Edge Function
 *
 * GET /functions/v1/admin-teams
 * Headers: Authorization: Bearer <admin_jwt>
 *
 * Returns all teams with:
 *   - owner profile
 *   - member list (with profile info)
 *   - seat counts
 *
 * Used by the admin dashboard Teams hierarchy view.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

  // ── Auth + admin check ────────────────────────────────────────────────────────
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

  // ── Fetch all teams ───────────────────────────────────────────────────────────
  const { data: teams, error: teamsErr } = await supabase
    .from('teams')
    .select('id, name, created_at, owner_id, seats_purchased')
    .order('created_at', { ascending: false });

  if (teamsErr) return json({ error: teamsErr.message }, 500);
  if (!teams?.length) return json({ teams: [] });

  const teamIds  = teams.map((t: any) => t.id);
  const ownerIds = [...new Set(teams.map((t: any) => t.owner_id))];

  // ── Fetch all owner profiles ──────────────────────────────────────────────────
  const { data: ownerProfiles } = await supabase
    .from('profiles')
    .select('id, email, full_name, tier, created_at, last_seen_at, suspended, subscription_status')
    .in('id', ownerIds);

  const ownerMap: Record<string, any> = {};
  (ownerProfiles ?? []).forEach((p: any) => { ownerMap[p.id] = p; });

  // ── Fetch all team members ────────────────────────────────────────────────────
  const { data: members } = await supabase
    .from('team_members')
    .select('team_id, user_id, role, created_at')
    .in('team_id', teamIds)
    .order('created_at', { ascending: true });

  // ── Fetch member profiles ─────────────────────────────────────────────────────
  const memberUserIds = [...new Set((members ?? []).map((m: any) => m.user_id))];
  let memberProfileMap: Record<string, any> = {};

  if (memberUserIds.length > 0) {
    const { data: memberProfiles } = await supabase
      .from('profiles')
      .select('id, email, full_name, tier, created_at, last_seen_at, suspended')
      .in('id', memberUserIds);

    (memberProfiles ?? []).forEach((p: any) => { memberProfileMap[p.id] = p; });
  }

  // ── Fetch EULA acceptance for all relevant users ──────────────────────────────
  const allUserIds = [...new Set([...ownerIds, ...memberUserIds])];
  const { data: eulaRows } = await supabase
    .from('eula_acceptances')
    .select('user_id, eula_version')
    .in('user_id', allUserIds);

  const eulaMap: Record<string, string> = {};
  (eulaRows ?? []).forEach((r: any) => {
    if (!eulaMap[r.user_id]) eulaMap[r.user_id] = r.eula_version;
  });

  // ── Group members by team ─────────────────────────────────────────────────────
  const membersByTeam: Record<string, any[]> = {};
  (members ?? []).forEach((m: any) => {
    if (!membersByTeam[m.team_id]) membersByTeam[m.team_id] = [];
    const profile = memberProfileMap[m.user_id] ?? {};
    membersByTeam[m.team_id].push({
      ...profile,
      team_role:            m.role,
      joined_at:            m.created_at,
      eula_version_accepted: eulaMap[m.user_id] ?? null,
    });
  });

  // ── Build response ────────────────────────────────────────────────────────────
  const result = (teams ?? []).map((t: any) => {
    const owner   = ownerMap[t.owner_id] ?? {};
    const teamMem = membersByTeam[t.id] ?? [];
    // Exclude the owner from the members list (they appear as the primary row)
    const nonOwnerMembers = teamMem.filter((m: any) => m.id !== t.owner_id);

    return {
      id:              t.id,
      name:            t.name,
      created_at:      t.created_at,
      seats_purchased: t.seats_purchased ?? 1,
      seats_used:      teamMem.length,
      owner: {
        ...owner,
        team_role:            'owner',
        eula_version_accepted: eulaMap[t.owner_id] ?? null,
      },
      members: nonOwnerMembers,
    };
  });

  return json({ teams: result });
});
