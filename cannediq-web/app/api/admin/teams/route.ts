/**
 * GET /api/admin/teams
 * Replaces: Supabase Edge Function admin-teams
 * Returns paginated team list with member counts and owner info.
 */
import { NextRequest } from 'next/server';
import { requireAdmin, adminClient, json, cors } from '@/lib/supabase';

export async function OPTIONS() { return cors(); }

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const url   = new URL(req.url);
    const page  = Math.max(0, parseInt(url.searchParams.get('page')  ?? '0', 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10)));

    const supabase = adminClient();
    const { data: teams, count, error } = await supabase
      .from('teams')
      .select('id, name, owner_id, seats_purchased, created_at, profiles!owner_id(email, tier)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * limit, page * limit + limit - 1);

    if (error) return json({ error: error.message }, 500);

    // Member counts
    const teamIds = (teams ?? []).map((t: { id: string }) => t.id);
    const memberCounts: Record<string, number> = {};
    if (teamIds.length > 0) {
      const { data: memberRows } = await supabase
        .from('team_members').select('team_id').in('team_id', teamIds);
      (memberRows ?? []).forEach((r: { team_id: string }) => {
        memberCounts[r.team_id] = (memberCounts[r.team_id] ?? 0) + 1;
      });
    }

    return json({
      teams: (teams ?? []).map((t: Record<string, unknown>) => ({
        ...t,
        member_count: memberCounts[t.id as string] ?? 0,
      })),
      total: count ?? 0,
      page,
      limit,
    });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    return json({ error: e.message ?? 'Internal error' }, e.status ?? 500);
  }
}
