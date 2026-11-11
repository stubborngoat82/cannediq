/**
 * GET /api/admin/teams
 * Replaces: Supabase Edge Function admin-teams
 *
 * Returns every team with its owner profile, members, seat counts, and EULA
 * version. Shape matches the admin dashboard (owner + members[]).
 */
import { NextRequest } from 'next/server';
import { requireAdmin, adminClient, json, cors } from '@/lib/supabase';

interface ProfileRow {
  id: string;
  email?: string;
  full_name?: string;
  tier?: string;
  created_at?: string;
  last_seen_at?: string;
  suspended?: boolean;
  subscription_status?: string;
}

export async function OPTIONS() { return cors(); }

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const supabase = adminClient();

    const { data: teams, error: teamsErr } = await supabase
      .from('teams')
      .select('id, name, created_at, owner_id, seats_purchased')
      .order('created_at', { ascending: false });

    if (teamsErr) return json({ error: teamsErr.message }, 500);
    if (!teams?.length) return json({ teams: [] });

    const teamIds = teams.map((t: { id: string }) => t.id);
    const ownerIds = [...new Set(teams.map((t: { owner_id: string }) => t.owner_id))];

    const { data: ownerProfiles } = await supabase
      .from('profiles')
      .select('id, email, full_name, tier, created_at, last_seen_at, suspended, subscription_status')
      .in('id', ownerIds);

    const ownerMap: Record<string, ProfileRow> = {};
    (ownerProfiles ?? []).forEach((p: ProfileRow) => { ownerMap[p.id] = p; });

    const { data: members } = await supabase
      .from('team_members')
      .select('team_id, user_id, role, created_at')
      .in('team_id', teamIds)
      .order('created_at', { ascending: true });

    const memberUserIds = [...new Set((members ?? []).map((m: { user_id: string }) => m.user_id))];
    const memberProfileMap: Record<string, ProfileRow> = {};
    if (memberUserIds.length > 0) {
      const { data: memberProfiles } = await supabase
        .from('profiles')
        .select('id, email, full_name, tier, created_at, last_seen_at, suspended')
        .in('id', memberUserIds);
      (memberProfiles ?? []).forEach((p: ProfileRow) => { memberProfileMap[p.id] = p; });
    }

    const allUserIds = [...new Set([...ownerIds, ...memberUserIds])];
    const eulaMap: Record<string, string> = {};
    if (allUserIds.length > 0) {
      const { data: eulaRows } = await supabase
        .from('eula_acceptances')
        .select('user_id, eula_version, accepted_at')
        .in('user_id', allUserIds)
        .order('accepted_at', { ascending: false });
      (eulaRows ?? []).forEach((r: { user_id: string; eula_version: string }) => {
        if (!eulaMap[r.user_id]) eulaMap[r.user_id] = r.eula_version;
      });
    }

    const membersByTeam: Record<string, Array<ProfileRow & {
      team_role: string;
      joined_at: string;
      eula_version_accepted: string | null;
    }>> = {};

    (members ?? []).forEach((m: { team_id: string; user_id: string; role: string; created_at: string }) => {
      if (!membersByTeam[m.team_id]) membersByTeam[m.team_id] = [];
      const profile = memberProfileMap[m.user_id] ?? { id: m.user_id };
      membersByTeam[m.team_id].push({
        ...profile,
        id: profile.id ?? m.user_id,
        team_role: m.role,
        joined_at: m.created_at,
        eula_version_accepted: eulaMap[m.user_id] ?? null,
      });
    });

    const result = teams.map((t: {
      id: string;
      name: string;
      created_at: string;
      owner_id: string;
      seats_purchased: number | null;
    }) => {
      const owner = ownerMap[t.owner_id] ?? { id: t.owner_id };
      const teamMem = membersByTeam[t.id] ?? [];
      const nonOwnerMembers = teamMem.filter((m) => m.id !== t.owner_id);
      return {
        id: t.id,
        name: t.name,
        created_at: t.created_at,
        seats_purchased: t.seats_purchased ?? 1,
        seats_used: teamMem.length,
        owner: {
          ...owner,
          team_role: 'owner',
          eula_version_accepted: eulaMap[t.owner_id] ?? null,
        },
        members: nonOwnerMembers,
      };
    });

    return json({ teams: result });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    return json({ error: e.message ?? 'Internal error' }, e.status ?? 500);
  }
}
