/**
 * POST /api/team/invite
 * Replaces: Supabase Edge Function send-team-invite
 *
 * Creates a token-based invite and emails it via Resend.
 * Returns { invite_id, link }.
 */
import { NextRequest } from 'next/server';
import { requireAuth, adminClient, json, cors } from '@/lib/supabase';
import { inviteEmail } from '@/lib/member-emails';

const RESEND_API_KEY  = process.env.RESEND_API_KEY  ?? '';
const RESEND_FROM     = process.env.RESEND_FROM_EMAIL ?? 'noreply@cannediq.com';
const APP_URL         = process.env.NEXT_PUBLIC_APP_URL ?? 'https://cannediq.com';

export async function OPTIONS() { return cors(); }

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const body     = await req.json().catch(() => ({}));
    const { team_id, email } = body as { team_id?: string; email?: string };
    if (!team_id || !email) return json({ error: 'team_id and email are required' }, 400);

    const supabase = adminClient();

    const { data: inviteRows, error: rpcErr } = await supabase
      .rpc('create_team_invite', { p_team_id: team_id, p_email: email });

    if (rpcErr) {
      if (rpcErr.code === 'P0401') return json({ error: 'Team not found or insufficient permissions' }, 403);
      if (rpcErr.code === 'P0402') return json({
        error: 'Your team has reached its seat limit. Purchase additional seats from the Billing tab to invite more members.',
      }, 403);
      throw new Error(rpcErr.message);
    }

    const invite = Array.isArray(inviteRows) ? inviteRows[0] : inviteRows;
    if (!invite?.invite_id) throw new Error('Failed to create invite');

    const { data: team } = await supabase.from('teams').select('name').eq('id', team_id).single();

    // Accept invite page lives on the Next.js app now
    const link = `${APP_URL}/team/accept-invite?token=${invite.token}`;

    const teamName = team?.name ?? 'a team';
    const inviter = user.email ?? 'Your team owner';
    if (RESEND_API_KEY) {
      const mail = inviteEmail(teamName, inviter, link);
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: RESEND_FROM,
          to: [email],
          subject: `You're invited to join "${teamName}" on CannedIQ`,
          html: mail.html,
          text: mail.text,
        }),
      });
      if (!emailRes.ok) {
        console.error('[team/invite] Resend error:', await emailRes.text());
      }
    } else {
      console.log(`[team/invite] No RESEND_API_KEY. Invite link: ${link}`);
    }

    return json({ invite_id: invite.invite_id, link });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    return json({ error: e.message ?? 'Internal error' }, e.status ?? 500);
  }
}
