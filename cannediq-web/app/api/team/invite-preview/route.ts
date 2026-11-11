/**
 * GET /api/team/invite-preview?token=<uuid>
 * Used by the accept-invite page to get the team name before auth.
 */
import { NextRequest } from 'next/server';
import { adminClient, json } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get('token') ?? '';
  if (!token) return json({ error: 'token is required' }, 400);

  const supabase = adminClient();
  const { data, error } = await supabase.rpc('get_invite_preview', { p_token: token });
  if (error) return json({ error: error.message }, 500);
  if (!data?.found) return json({ error: 'Invite not found' }, 404);

  return json({ team_name: data.team_name, status: data.status, expired: data.expired });
}
