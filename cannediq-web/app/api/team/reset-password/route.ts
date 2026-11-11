/**
 * POST /api/team/reset-password
 * Replaces: Supabase Edge Function reset-member-password
 */
import { NextRequest } from 'next/server';
import { requireAuth, adminClient, json, cors } from '@/lib/supabase';

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? '';
const RESEND_FROM    = process.env.RESEND_FROM_EMAIL ?? 'noreply@cannediq.com';

export async function OPTIONS() { return cors(); }

export async function POST(req: NextRequest) {
  try {
    const { user: caller } = await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const { team_id, user_id } = body as { team_id?: string; user_id?: string };
    if (!team_id || !user_id) return json({ error: 'team_id and user_id are required' }, 400);

    const supabase = adminClient();

    // Caller must be team owner or admin
    const { data: team } = await supabase
      .from('teams').select('name').eq('id', team_id).eq('owner_id', caller.id).maybeSingle();
    if (!team) return json({ error: 'Team not found or insufficient permissions' }, 403);

    const newPassword = generateTempPassword();

    const { error: updateErr } = await supabase.auth.admin.updateUserById(user_id, {
      password: newPassword,
    });
    if (updateErr) throw new Error(updateErr.message);

    await supabase.from('profiles').update({ must_change_password: true }).eq('id', user_id);

    // Email the new password
    const { data: memberProfile } = await supabase.from('profiles')
      .select('email').eq('id', user_id).single();

    if (RESEND_API_KEY && memberProfile?.email) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from:    RESEND_FROM,
          to:      [memberProfile.email],
          subject: `Your CannedIQ password has been reset`,
          text:    `Your temporary password is: ${newPassword}\n\nYou will be asked to set a new password on your next sign-in.`,
        }),
      }).catch((e) => console.error('[team/reset-password] Resend error:', e));
    }

    return json({ ok: true });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    return json({ error: e.message ?? 'Internal error' }, e.status ?? 500);
  }
}

function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*';
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
