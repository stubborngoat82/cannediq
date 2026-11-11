/**
 * POST /api/team/accept-invite
 * Programmatic half of the accept-team-invite Edge Function.
 *
 * The invite email links to the page at /team/accept-invite, which signs the
 * person in and calls the accept_team_invite RPC. This route is the same RPC
 * for a caller that already has a Supabase JWT (the extension maps the old
 * function name here).
 *
 * Body: { token: string }
 */
import { NextRequest } from 'next/server';
import { requireAuth, userClient, json, cors } from '@/lib/supabase';

export async function OPTIONS() { return cors(); }

export async function POST(req: NextRequest) {
  try {
    const { token: jwt } = await requireAuth(req);
    const body = await req.json().catch(() => ({})) as { token?: string };
    const inviteToken = (body.token ?? '').trim();
    if (!inviteToken) return json({ error: 'token is required' }, 400);

    const client = userClient(jwt);
    const { data, error } = await client.rpc('accept_team_invite', { p_token: inviteToken });
    if (error) return json({ error: error.message, success: false }, 400);

    const result = (data ?? {}) as { success?: boolean; error?: string };
    if (result.success === false) {
      return json({ success: false, error: result.error ?? 'Could not accept invite' }, 400);
    }
    return json(data ?? { success: true });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    return json({ error: e.message ?? 'Internal error' }, e.status ?? 500);
  }
}
