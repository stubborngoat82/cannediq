/**
 * GET   /api/admin/users?page=0&limit=50&search=&plan=&suspended=
 * PATCH /api/admin/users  — { userId, action, value? }
 * Replaces: Supabase Edge Function admin-users
 */
import { NextRequest } from 'next/server';
import { requireAdmin, adminClient, json, cors } from '@/lib/supabase';

export async function OPTIONS() { return cors(); }

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireAdmin(req);
    const url      = new URL(req.url);
    const page     = Math.max(0, parseInt(url.searchParams.get('page')  ?? '0', 10));
    const limit    = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10)));
    const search   = url.searchParams.get('search') ?? '';
    const plan     = url.searchParams.get('plan')   ?? '';
    const susp     = url.searchParams.get('suspended') ?? '';

    const supabase = adminClient();
    let q = supabase
      .from('profiles')
      .select(
        'id, email, full_name, tier, is_admin, suspended, created_at, last_seen_at, subscription_status, stripe_customer_id',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(page * limit, page * limit + limit - 1);

    if (plan)            q = q.eq('tier', plan);
    if (susp === 'true') q = q.eq('suspended', true);
    if (susp === 'false') q = q.eq('suspended', false);
    if (search)          q = q.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`);

    const { data: profiles, count, error } = await q;
    if (error) return json({ error: error.message }, 500);

    const ids = (profiles ?? []).map((p: { id: string }) => p.id);
    let eulaMap: Record<string, string> = {};
    if (ids.length > 0) {
      const { data: eulaRows } = await supabase
        .from('eula_acceptances').select('user_id, eula_version, accepted_at')
        .in('user_id', ids).order('accepted_at', { ascending: false });
      (eulaRows ?? []).forEach((r: { user_id: string; eula_version: string }) => {
        if (!eulaMap[r.user_id]) eulaMap[r.user_id] = r.eula_version;
      });
    }

    const users = (profiles ?? []).map((p: Record<string, unknown>) => ({
      ...p,
      eula_version_accepted: eulaMap[p.id as string] ?? null,
    }));

    return json({ users, total: count ?? 0, page, limit });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    return json({ error: e.message ?? 'Internal error' }, e.status ?? 500);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { user: adminUser } = await requireAdmin(req);
    const body = await req.json().catch(() => ({}));
    const { userId, action, value } = body as { userId?: string; action?: string; value?: unknown };

    if (!userId) return json({ error: 'userId is required' }, 400);
    if (!action) return json({ error: 'action is required' }, 400);

    if (userId === adminUser.id && ['suspend', 'set_admin'].includes(action))
      return json({ error: 'You cannot modify your own admin or suspension status' }, 422);

    const supabase = adminClient();
    let update: Record<string, unknown> = {};

    switch (action) {
      case 'set_plan': {
        const valid = ['free', 'pro', 'ai', 'team'];
        if (!valid.includes(value as string))
          return json({ error: `Invalid plan. Must be one of: ${valid.join(', ')}` }, 400);
        update = { tier: value };
        break;
      }
      case 'suspend':   update = { suspended: true };  break;
      case 'unsuspend': update = { suspended: false }; break;
      case 'set_admin':
        if (typeof value !== 'boolean') return json({ error: 'value must be true or false' }, 400);
        update = { is_admin: value };
        break;
      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }

    const { error } = await supabase.from('profiles').update(update).eq('id', userId);
    if (error) return json({ error: error.message }, 500);

    return json({ ok: true, userId, action, applied: update });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    return json({ error: e.message ?? 'Internal error' }, e.status ?? 500);
  }
}
