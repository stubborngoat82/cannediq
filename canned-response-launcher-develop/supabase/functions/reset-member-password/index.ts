/**
 * Supabase Edge Function: reset-member-password
 *
 * Team owner resets a member's password, generating a new temporary
 * one and emailing it to the member. Sets must_change_password=true
 * so the member is prompted to set a permanent password on next login.
 *
 * Environment variables:
 *   RESEND_API_KEY          — from resend.com
 *   RESEND_FROM_EMAIL       — verified sender address
 *   SUPABASE_URL            — auto-injected
 *   SUPABASE_SERVICE_ROLE_KEY — auto-injected
 *
 * Deploy:
 *   supabase functions deploy reset-member-password --no-verify-jwt
 *
 * Request body:
 *   { team_id: string, user_id: string }
 *
 * Response:
 *   { ok: true }
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

    const { data: { user: caller }, error: authErr } =
      await supabase.auth.getUser(authHeader.slice(7));
    if (authErr || !caller) return jsonError('Unauthorized', 401);

    // ── Parse body ────────────────────────────────────────────────
    const { team_id, user_id } =
      await req.json() as { team_id: string; user_id: string };
    if (!team_id || !user_id) return jsonError('team_id and user_id are required', 400);

    // ── Verify caller owns the team ───────────────────────────────
    const { data: team, error: teamErr } = await supabase
      .from('teams')
      .select('id, name')
      .eq('id', team_id)
      .eq('owner_id', caller.id)
      .single();

    if (teamErr || !team) {
      return jsonError('Team not found or you are not the owner', 403);
    }

    // ── Verify target user is a member of this team ───────────────
    const { data: membership } = await supabase
      .from('team_members')
      .select('user_id')
      .eq('team_id', team_id)
      .eq('user_id', user_id)
      .single();

    if (!membership) {
      return jsonError('User is not a member of this team', 404);
    }

    // ── Get member email ──────────────────────────────────────────
    const { data: memberAuth, error: userErr } =
      await supabase.auth.admin.getUserById(user_id);
    if (userErr || !memberAuth.user?.email) {
      return jsonError('Could not retrieve member account', 500);
    }
    const memberEmail = memberAuth.user.email;

    // ── Generate new temp password ────────────────────────────────
    const tempPassword = generateTempPassword();

    // ── Update password via admin API ─────────────────────────────
    const { error: updateErr } = await supabase.auth.admin.updateUserById(user_id, {
      password: tempPassword,
    });
    if (updateErr) throw new Error(`Failed to reset password: ${updateErr.message}`);

    // ── Set must_change_password = true ───────────────────────────
    await supabase
      .from('profiles')
      .update({ must_change_password: true })
      .eq('id', user_id);

    // Update temp_password flag on team_members row
    await supabase
      .from('team_members')
      .update({ temp_password: true })
      .eq('team_id', team_id)
      .eq('user_id', user_id);

    // ── Email new credentials ─────────────────────────────────────
    const resendKey = Deno.env.get('RESEND_API_KEY');
    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') ?? 'noreply@cannediq.com';

    if (resendKey) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          from:    fromEmail,
          to:      [memberEmail],
          subject: `Your CannedIQ password has been reset — ${team.name}`,
          html:    buildResetEmailHTML(team.name, memberEmail, tempPassword, caller.email ?? 'Your manager'),
          text:    buildResetEmailText(team.name, memberEmail, tempPassword),
        }),
      });
    } else {
      console.log(`[reset-member-password] New temp password for ${memberEmail}: ${tempPassword}`);
    }

    return jsonOk({ ok: true });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[reset-member-password]', message);
    return jsonError(message, 500);
  }
});

// ── Helpers ───────────────────────────────────────────────────────

function generateTempPassword(): string {
  const upper   = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower   = 'abcdefghjkmnpqrstuvwxyz';
  const digits  = '23456789';
  const symbols = '!@#$%&*';
  const all     = upper + lower + digits + symbols;
  const pick    = (c: string) => c[Math.floor(Math.random() * c.length)];
  const parts   = [
    pick(upper), pick(upper), pick(upper),
    pick(lower), pick(lower), pick(lower),
    pick(digits), pick(digits), pick(digits),
    pick(symbols), pick(all), pick(all),
  ];
  for (let i = parts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [parts[i], parts[j]] = [parts[j], parts[i]];
  }
  return parts.join('');
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildResetEmailHTML(teamName: string, email: string, password: string, managerEmail: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8">
<style>
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:#f3f4f6; margin:0; padding:40px 20px; }
  .card { background:#fff; border-radius:12px; max-width:480px; margin:0 auto; padding:40px; box-shadow:0 4px 24px rgba(0,0,0,.08); }
  .logo { font-size:18px; font-weight:800; color:#4f46e5; margin-bottom:32px; }
  h1 { font-size:22px; font-weight:700; color:#111827; margin-bottom:12px; }
  p  { font-size:15px; color:#6b7280; line-height:1.6; margin-bottom:16px; }
  .creds { background:#f9fafb; border:1px solid #e5e7eb; border-radius:8px; padding:16px 20px; margin:16px 0; }
  .creds-row { display:flex; justify-content:space-between; font-size:14px; margin-bottom:6px; }
  .creds-label { color:#9ca3af; font-weight:500; }
  .creds-value { color:#111827; font-weight:700; font-family:monospace; }
  .notice { background:#fef3c7; border:1px solid #fde68a; border-radius:8px; padding:12px 16px; font-size:13px; color:#92400e; margin:16px 0; }
</style>
</head>
<body>
<div class="card">
  <div class="logo">⚡ CannedIQ</div>
  <h1>Your password has been reset</h1>
  <p>${escHtml(managerEmail)} reset your CannedIQ password for the <strong>${escHtml(teamName)}</strong> team.</p>
  <div class="creds">
    <div class="creds-row"><span class="creds-label">Email</span><span class="creds-value">${escHtml(email)}</span></div>
    <div class="creds-row"><span class="creds-label">New password</span><span class="creds-value">${escHtml(password)}</span></div>
  </div>
  <div class="notice">⚠️ This is a temporary password. You'll be prompted to set a permanent one when you sign in.</div>
</div>
</body>
</html>`;
}

function buildResetEmailText(teamName: string, email: string, password: string): string {
  return [
    `Your CannedIQ password has been reset`,
    '',
    `Team: ${teamName}`,
    `Email:    ${email}`,
    `Password: ${password}`,
    '',
    'This is a temporary password — you will be asked to set a permanent one when you sign in.',
  ].join('\n');
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
