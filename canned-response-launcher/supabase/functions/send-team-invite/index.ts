/**
 * Supabase Edge Function: send-team-invite
 *
 * Creates a token-based team invite and emails the link to the invitee.
 * The invitee clicks the link, signs up or signs in, and is automatically
 * added to the team — no back-and-forth required.
 *
 * Environment variables (set in Supabase Dashboard → Edge Functions → Secrets):
 *   RESEND_API_KEY     — from resend.com (free tier sends 3,000 emails/mo)
 *   RESEND_FROM_EMAIL  — verified sender address, e.g. "invite@yourapp.com"
 *   SUPABASE_URL       — auto-injected
 *   SUPABASE_SERVICE_ROLE_KEY — auto-injected
 *
 * Deploy:
 *   supabase functions deploy send-team-invite --no-verify-jwt
 *
 * Request body:
 *   { team_id: string, email: string }
 *
 * Response:
 *   { invite_id: string, link: string }
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    // ── Auth ──────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonError('Missing Authorization header', 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: { user }, error: authError } =
      await supabase.auth.getUser(authHeader.slice(7));
    if (authError || !user) return jsonError('Unauthorized', 401);

    // ── Parse body ────────────────────────────────────────────────
    const { team_id, email } = await req.json() as { team_id: string; email: string };
    if (!team_id || !email) return jsonError('team_id and email are required', 400);

    // ── Verify caller owns the team ───────────────────────────────
    const { data: team, error: teamErr } = await supabase
      .from('teams')
      .select('id, name, seats_purchased')
      .eq('id', team_id)
      .eq('owner_id', user.id)
      .single();

    if (teamErr || !team) {
      return jsonError('Team not found or you are not the owner', 403);
    }

    // ── Seat capacity check ───────────────────────────────────────
    // Count owner (1) + accepted members + pending invites that haven't
    // expired or been revoked. Pending invites hold a reserved seat so
    // the owner can't accidentally over-invite.
    const [{ count: memberCount }, { count: pendingCount }] = await Promise.all([
      supabase
        .from('team_members')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', team_id),
      supabase
        .from('team_invites')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', team_id)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString()),
    ]);

    const seatsPurchased = team.seats_purchased ?? 1;
    // seats_used = 1 (owner) + accepted members + pending (reserved)
    const seatsUsed = 1 + (memberCount ?? 0) + (pendingCount ?? 0);

    if (seatsUsed >= seatsPurchased) {
      return jsonError(
        `Your team has reached its seat limit (${seatsPurchased} seat${seatsPurchased !== 1 ? 's' : ''}). ` +
        `Purchase additional seats from the Billing tab to invite more members.`,
        403
      );
    }

    // ── Create (or refresh) the invite ───────────────────────────
    // Upsert by team_id + email: if a pending invite already exists,
    // reset the token and expiry so the link is fresh.
    const newToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // Mark any existing pending invite for this team+email as revoked first
    await supabase
      .from('team_invites')
      .update({ status: 'revoked' })
      .eq('team_id', team_id)
      .eq('email', email)
      .eq('status', 'pending');

    // Insert fresh invite
    const { data: invite, error: insertErr } = await supabase
      .from('team_invites')
      .insert({
        team_id,
        invited_by: user.id,
        email,
        token:      newToken,
        expires_at: expiresAt,
      })
      .select('id, token')
      .single();

    if (insertErr || !invite) {
      throw new Error(insertErr?.message ?? 'Failed to create invite');
    }

    // ── Build invite link ─────────────────────────────────────────
    // Points to the accept-team-invite Edge Function which serves the HTML page
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const link = `${supabaseUrl}/functions/v1/accept-team-invite?token=${invite.token}`;

    // ── Send email via Resend ─────────────────────────────────────
    const resendKey  = Deno.env.get('RESEND_API_KEY');
    const fromEmail  = Deno.env.get('RESEND_FROM_EMAIL') ?? 'noreply@cannedresponselauncher.com';

    if (resendKey) {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          from:    fromEmail,
          to:      [email],
          subject: `You're invited to join "${team.name}" on Canned Response Launcher`,
          html:    buildEmailHTML(team.name, user.email ?? 'Your team owner', link),
          text:    buildEmailText(team.name, user.email ?? 'Your team owner', link),
        }),
      });

      if (!emailRes.ok) {
        const errBody = await emailRes.text();
        console.error('[send-team-invite] Resend error:', errBody);
        // Don't fail the whole request — return the link so owner can share it manually
      }
    } else {
      // No email provider configured — log the link for development
      console.log(`[send-team-invite] No RESEND_API_KEY set. Invite link: ${link}`);
    }

    return jsonOk({ invite_id: invite.id, link });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[send-team-invite]', message);
    return jsonError(message, 500);
  }
});

// ── Email templates ───────────────────────────────────────────────

function buildEmailHTML(teamName: string, inviterEmail: string, link: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f3f4f6; margin: 0; padding: 40px 20px; }
  .card { background: #fff; border-radius: 12px; max-width: 480px; margin: 0 auto; padding: 40px; box-shadow: 0 4px 24px rgba(0,0,0,.08); }
  .logo { font-size: 18px; font-weight: 800; color: #4f46e5; margin-bottom: 32px; }
  h1 { font-size: 22px; font-weight: 700; color: #111827; margin-bottom: 12px; }
  p { font-size: 15px; color: #6b7280; line-height: 1.6; margin-bottom: 16px; }
  .btn { display: inline-block; background: #4f46e5; color: #fff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-size: 15px; font-weight: 600; margin: 8px 0 24px; }
  .link-fallback { font-size: 12px; color: #9ca3af; word-break: break-all; }
  .footer { margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; }
</style>
</head>
<body>
<div class="card">
  <div class="logo">⚡ Canned Response Launcher</div>
  <h1>You're invited to join ${escapeHtml(teamName)}</h1>
  <p>${escapeHtml(inviterEmail)} has invited you to their team's shared response library on Canned Response Launcher.</p>
  <p>Click the button below to accept. You'll be asked to create a free account (or sign in if you already have one) — then you're in.</p>
  <a href="${link}" class="btn">Accept invite →</a>
  <p class="link-fallback">Or copy this link into your browser:<br>${link}</p>
  <div class="footer">
    This invite expires in 7 days. If you weren't expecting this, you can safely ignore it.
  </div>
</div>
</body>
</html>`.trim();
}

function buildEmailText(teamName: string, inviterEmail: string, link: string): string {
  return [
    `You're invited to join "${teamName}" on Canned Response Launcher`,
    '',
    `${inviterEmail} has invited you to their team's shared response library.`,
    '',
    `Accept your invite here:`,
    link,
    '',
    `This invite expires in 7 days.`,
  ].join('\n');
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}
