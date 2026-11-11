/**
 * GET /api/admin/stats
 * Replaces: Supabase Edge Function admin-stats
 */
import { NextRequest } from 'next/server';
import { requireAdmin, adminClient, json, cors } from '@/lib/supabase';

const PLAN_PRICE: Record<string, number> = { pro: 10, ai: 20, team: 0, free: 0 };
const TEAM_SEAT_PRICE = 12;

export async function OPTIONS() { return cors(); }

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const supabase = adminClient();

    const [{ data: planRows }, { count: newThisMonth }, { count: suspendedCount },
           { count: adminCount }, { data: teamRows }, { count: eulaAccepted },
           { count: pastDueCount }] = await Promise.all([
      supabase.from('profiles').select('tier').neq('tier', null),
      supabase.from('profiles').select('*', { count: 'exact', head: true })
        .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('suspended', true),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_admin', true),
      supabase.from('teams').select('seats_purchased'),
      supabase.from('eula_acceptances').select('*', { count: 'exact', head: true }).eq('eula_version', '1.0'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('subscription_status', 'past_due'),
    ]);

    const planCounts: Record<string, number> = { free: 0, pro: 0, ai: 0, team: 0 };
    (planRows ?? []).forEach((r: { tier: string }) => {
      const t = r.tier ?? 'free';
      planCounts[t] = (planCounts[t] ?? 0) + 1;
    });
    const totalUsers = (planRows ?? []).length;

    let mrr = 0;
    mrr += (planCounts['pro'] ?? 0) * PLAN_PRICE['pro'];
    mrr += (planCounts['ai']  ?? 0) * PLAN_PRICE['ai'];
    const totalTeamSeats = (teamRows ?? []).reduce((acc: number, t: { seats_purchased?: number }) => acc + (t.seats_purchased ?? 1), 0);
    mrr += totalTeamSeats * TEAM_SEAT_PRICE;

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
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    return json({ error: e.message ?? 'Internal error' }, e.status ?? 500);
  }
}
