/**
 * POST /api/team/reset-password
 * Replaces: Supabase Edge Function reset-member-password
 *
 * Body: { team_id, user_id }
 * Only the team owner can reset a member of that team. Sets a temporary
 * password, flags must_change_password, and emails the member.
 */
import { NextRequest } from 'next/server';
import { requireAuth, adminClient, json, cors } from '@/lib/supabase';
import { generateTempPassword } from '@/lib/passwords';
import { resetPasswordEmail } from '@/lib/member-emails';

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? '';
const RESEND_FROM = process.env.RESEND_FROM_EMAIL ?? 'noreply@cannediq.com';

export async function OPTIONS() { return cors(); }

export async function POST(req: NextRequest) {
  try {
    const { user: caller } = await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const { team_id, user_id } = body as { team_id?: string; user_id?: string };
    if (!team_id || !user_id) return json({ error: 'team_id and user_id are required' }, 400);

    const supabase = adminClient();

    const { data: team } = await supabase
      .from('teams')
      .select('id, name')
      .eq('id', team_id)
      .eq('owner_id', caller.id)
      .maybeSingle();
    if (!team) return json({ error: 'Team not found or you are not the owner' }, 403);

    const { data: membership } = await supabase
      .from('team_members')
      .select('user_id')
      .eq('team_id', team_id)
      .eq('user_id', user_id)
      .maybeSingle();
    if (!membership) return json({ error: 'User is not a member of this team' }, 404);

    const { data: memberAuth, error: userErr } = await supabase.auth.admin.getUserById(user_id);
    if (userErr || !memberAuth.user?.email) {
      return json({ error: 'Could not retrieve member account' }, 500);
    }
    const memberEmail = memberAuth.user.email;

    const tempPassword = generateTempPassword();
    const { error: updateErr } = await supabase.auth.admin.updateUserById(user_id, {
      password: tempPassword,
    });
    if (updateErr) throw new Error(`Failed to reset password: ${updateErr.message}`);

    await supabase.from('profiles').update({ must_change_password: true }).eq('id', user_id);
    await supabase.from('team_members').update({ temp_password: true })
      .eq('team_id', team_id)
      .eq('user_id', user_id);

    const teamName = (team as { name: string }).name;
    if (RESEND_API_KEY) {
      const mail = resetPasswordEmail(teamName, memberEmail, tempPassword, caller.email ?? 'Your manager');
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: RESEND_FROM,
          to: [memberEmail],
          subject: `Your CannedIQ password has been reset — ${teamName}`,
          html: mail.html,
          text: mail.text,
        }),
      });
      if (!emailRes.ok) console.error('[team/reset-password] Resend error:', await emailRes.text());
    } else {
      console.log(`[team/reset-password] New temp password for ${memberEmail}: ${tempPassword}`);
    }

    return json({ ok: true });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    console.error('[team/reset-password]', e.message);
    return json({ error: e.message ?? 'Internal error' }, e.status ?? 500);
  }
}
