/**
 * POST /api/team/invite
 * Replaces: Supabase Edge Function send-team-invite
 *
 * Creates a token-based invite and emails it via Resend.
 * Returns { invite_id, link }.
 */
import { NextRequest } from 'next/server';
import { requireAuth, adminClient, json, cors } from '@/lib/supabase';

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
        error: 'Team is at seat capacity. Purchase additional seats to invite more members.',
      }, 403);
      throw new Error(rpcErr.message);
    }

    const invite = Array.isArray(inviteRows) ? inviteRows[0] : inviteRows;
    if (!invite?.invite_id) throw new Error('Failed to create invite');

    const { data: team } = await supabase.from('teams').select('name').eq('id', team_id).single();

    // Accept invite page lives on the Next.js app now
    const link = `${APP_URL}/team/accept-invite?token=${invite.token}`;

    if (RESEND_API_KEY) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from:    RESEND_FROM,
          to:      [email],
          subject: `You're invited to join "${team?.name ?? 'a team'}" on CannedIQ`,
          html:    buildEmailHTML(team?.name ?? 'Your team', user.email ?? 'Your team owner', link),
          text:    `Join "${team?.name}": ${link}`,
        }),
      }).catch((e) => console.error('[team/invite] Resend error:', e));
    } else {
      console.log(`[team/invite] No RESEND_API_KEY. Invite link: ${link}`);
    }

    return json({ invite_id: invite.invite_id, link });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    return json({ error: e.message ?? 'Internal error' }, e.status ?? 500);
  }
}

function buildEmailHTML(teamName: string, inviterEmail: string, link: string) {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
  body{font-family:-apple-system,sans-serif;background:#f3f4f6;margin:0;padding:40px 20px}
  .card{background:#fff;border-radius:12px;max-width:480px;margin:0 auto;padding:40px;box-shadow:0 4px 24px rgba(0,0,0,.08)}
  .logo{font-size:18px;font-weight:800;color:#4f46e5;margin-bottom:32px}
  h1{font-size:22px;font-weight:700;color:#111827;margin-bottom:12px}
  p{font-size:15px;color:#6b7280;line-height:1.6;margin-bottom:16px}
  .btn{display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:15px;font-weight:600}
  </style></head><body><div class="card">
  <div class="logo">⚡ CannedIQ</div>
  <h1>You're invited to join ${esc(teamName)}</h1>
  <p>${esc(inviterEmail)} has invited you to their team's shared response library on CannedIQ.</p>
  <a href="${link}" class="btn">Accept invite →</a>
  </div></body></html>`;
}
