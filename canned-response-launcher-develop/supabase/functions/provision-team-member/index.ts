/**
 * Supabase Edge Function: provision-team-member
 *
 * Team owner calls this to create a Supabase auth account for a new
 * team member. The member is immediately enrolled in the team — no
 * invite-link flow required.
 *
 * Flow:
 *   1. Verify caller is the team owner
 *   2. Check seat availability
 *   3. Create auth user (admin API) with a generated temp password
 *   4. Add to team_members with temp_password=true
 *   5. Set must_change_password=true on their profile
 *   6. Email credentials via Resend
 *   7. Return { user_id, email, temp_password }
 *
 * If the email already has a Supabase account, that existing account
 * is added to the team instead (idempotent — no duplicate created).
 *
 * Environment variables:
 *   RESEND_API_KEY          — from resend.com
 *   RESEND_FROM_EMAIL       — verified sender address
 *   SUPABASE_URL            — auto-injected
 *   SUPABASE_SERVICE_ROLE_KEY — auto-injected
 *
 * Deploy:
 *   supabase functions deploy provision-team-member --no-verify-jwt
 *
 * Request body:
 *   { team_id: string, email: string, full_name?: string }
 *
 * Response:
 *   { user_id: string, email: string, is_new: boolean }
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
    const { team_id, email, full_name } =
      await req.json() as { team_id: string; email: string; full_name?: string };
    if (!team_id || !email) return jsonError('team_id and email are required', 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonError('Invalid email address', 400);
    }

    // ── Verify caller is team owner or admin ──────────────────────
    const [{ data: ownerData }, { data: adminData }] = await Promise.all([
      supabase
        .from('teams')
        .select('id, name, seats_purchased')
        .eq('id', team_id)
        .eq('owner_id', caller.id)
        .maybeSingle(),
      supabase
        .from('team_members')
        .select('team_id')
        .eq('team_id', team_id)
        .eq('user_id', caller.id)
        .in('role', ['admin', 'owner'])
        .maybeSingle(),
    ]);

    if (!ownerData && !adminData) {
      return jsonError('Team not found or insufficient permissions', 403);
    }

    // Fetch full team record when caller is an admin (not the owner)
    const team = ownerData ?? (
      await supabase.from('teams').select('id, name, seats_purchased').eq('id', team_id).single()
    ).data;

    if (!team) return jsonError('Team not found', 404);

    // ── Seat check ────────────────────────────────────────────────
    const { count: memberCount } = await supabase
      .from('team_members')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', team_id);

    const seatsUsed      = 1 + (memberCount ?? 0);
    const seatsPurchased = team.seats_purchased ?? 1;
    if (seatsUsed >= seatsPurchased) {
      return jsonError(
        `Team is at capacity (${seatsPurchased} seat${seatsPurchased !== 1 ? 's' : ''}). ` +
        `Purchase additional seats from the Billing tab before adding more members.`,
        403
      );
    }

    // ── Check if email already has an account ─────────────────────
    const { data: existing } = await supabase.auth.admin.listUsers();
    const existingUser = existing?.users?.find((u) => u.email === email);

    let memberId: string;
    let tempPassword: string | null = null;
    let isNew = false;

    if (existingUser) {
      // Re-use existing account — enroll them in this team and upgrade their tier
      memberId = existingUser.id;
      await supabase
        .from('profiles')
        .update({ tier: 'team' })
        .eq('id', memberId);
    } else {
      // Create a new account with a generated temporary password
      tempPassword = generateTempPassword();
      isNew        = true;

      const { data: created, error: createErr } =
        await supabase.auth.admin.createUser({
          email,
          password:      tempPassword,
          email_confirm: true,   // mark email as confirmed — no verification email
          user_metadata: { full_name: full_name ?? '' },
        });

      if (createErr || !created.user) {
        throw new Error(createErr?.message ?? 'Failed to create user account');
      }

      memberId = created.user.id;

      // Set tier + must_change_password on the new profile row.
      // Supabase auto-inserts a profiles row via DB trigger; we update it.
      // Retry once — trigger may not have fired yet.
      for (let attempt = 0; attempt < 2; attempt++) {
        const { error: profileErr } = await supabase
          .from('profiles')
          .update({
            tier:                 'team',
            must_change_password: true,
            provisioned_team_id:  team_id,
            full_name:            full_name ?? null,
          })
          .eq('id', memberId);
        if (!profileErr) break;
        await new Promise((r) => setTimeout(r, 400));
      }
    }

    // ── Add to team_members (idempotent) ──────────────────────────
    const { error: memberErr } = await supabase
      .from('team_members')
      .upsert(
        {
          team_id,
          user_id:        memberId,
          role:           'member',
          provisioned_by: caller.id,
          provisioned_at: new Date().toISOString(),
          temp_password:  isNew,
        },
        { onConflict: 'team_id,user_id', ignoreDuplicates: false }
      );

    if (memberErr) {
      throw new Error(`Failed to add member to team: ${memberErr.message}`);
    }

    // ── Send credentials email ────────────────────────────────────
    const resendKey = Deno.env.get('RESEND_API_KEY');
    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') ?? 'noreply@cannediq.com';

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
          subject: isNew
            ? `Your CannedIQ account is ready — ${team.name}`
            : `You've been added to the "${team.name}" team on CannedIQ`,
          html: isNew
            ? buildNewAccountEmail(team.name, email, tempPassword!, caller.email ?? 'Your manager')
            : buildExistingAccountEmail(team.name, caller.email ?? 'Your manager'),
          text: isNew
            ? buildNewAccountText(team.name, email, tempPassword!, caller.email ?? 'Your manager')
            : buildExistingAccountText(team.name, caller.email ?? 'Your manager'),
        }),
      });

      if (!emailRes.ok) {
        const errBody = await emailRes.text();
        console.error('[provision-team-member] Resend error:', errBody);
        // Don't fail — member is enrolled. Owner will see the error in logs.
      }
    } else {
      console.log(
        `[provision-team-member] No RESEND_API_KEY. Credentials for ${email}:`,
        tempPassword ?? '(existing account)'
      );
    }

    return jsonOk({ user_id: memberId, email, is_new: isNew });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[provision-team-member]', message);
    return jsonError(message, 500);
  }
});

// ── Helpers ───────────────────────────────────────────────────────

function generateTempPassword(): string {
  // 12 chars: 3 uppercase + 3 lowercase + 3 digits + 3 symbols
  // Meets most password-strength requirements
  const upper   = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower   = 'abcdefghjkmnpqrstuvwxyz';
  const digits  = '23456789';
  const symbols = '!@#$%&*';
  const all     = upper + lower + digits + symbols;

  const pick = (charset: string) =>
    charset[Math.floor(Math.random() * charset.length)];

  const parts = [
    pick(upper), pick(upper), pick(upper),
    pick(lower), pick(lower), pick(lower),
    pick(digits), pick(digits), pick(digits),
    pick(symbols),
    pick(all), pick(all),
  ];

  // Shuffle
  for (let i = parts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [parts[i], parts[j]] = [parts[j], parts[i]];
  }
  return parts.join('');
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildNewAccountEmail(teamName: string, email: string, password: string, inviterEmail: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f3f4f6; margin:0; padding:40px 20px; }
  .card { background:#fff; border-radius:12px; max-width:480px; margin:0 auto; padding:40px; box-shadow:0 4px 24px rgba(0,0,0,.08); }
  .logo { font-size:18px; font-weight:800; color:#4f46e5; margin-bottom:32px; }
  h1 { font-size:22px; font-weight:700; color:#111827; margin-bottom:12px; }
  p  { font-size:15px; color:#6b7280; line-height:1.6; margin-bottom:16px; }
  .creds { background:#f9fafb; border:1px solid #e5e7eb; border-radius:8px; padding:16px 20px; margin:16px 0; }
  .creds-row { display:flex; justify-content:space-between; font-size:14px; margin-bottom:6px; }
  .creds-label { color:#9ca3af; font-weight:500; }
  .creds-value { color:#111827; font-weight:700; font-family:monospace; }
  .notice { background:#fef3c7; border:1px solid #fde68a; border-radius:8px; padding:12px 16px; font-size:13px; color:#92400e; margin:16px 0; }
  .footer { margin-top:32px; padding-top:24px; border-top:1px solid #e5e7eb; font-size:12px; color:#9ca3af; }
</style>
</head>
<body>
<div class="card">
  <div class="logo">⚡ CannedIQ</div>
  <h1>Welcome to ${escHtml(teamName)}</h1>
  <p>${escHtml(inviterEmail)} has created a CannedIQ account for you and added you to their team's shared response library.</p>
  <p>Here are your login credentials:</p>
  <div class="creds">
    <div class="creds-row"><span class="creds-label">Email</span><span class="creds-value">${escHtml(email)}</span></div>
    <div class="creds-row"><span class="creds-label">Password</span><span class="creds-value">${escHtml(password)}</span></div>
  </div>
  <div class="notice">⚠️ This is a temporary password. You'll be prompted to create a new one when you first sign in.</div>
  <p>To get started, install the CannedIQ Chrome extension, then sign in with the credentials above.</p>
  <div class="footer">
    If you weren't expecting this, contact ${escHtml(inviterEmail)} or ignore this email.
  </div>
</div>
</body>
</html>`;
}

function buildNewAccountText(teamName: string, email: string, password: string, inviterEmail: string): string {
  return [
    `Welcome to "${teamName}" on CannedIQ`,
    '',
    `${inviterEmail} has created a CannedIQ account for you.`,
    '',
    `Email:    ${email}`,
    `Password: ${password}`,
    '',
    'This is a temporary password — you will be asked to set a new one when you first sign in.',
    '',
    'Install the CannedIQ Chrome extension and sign in to get started.',
  ].join('\n');
}

function buildExistingAccountEmail(teamName: string, inviterEmail: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:#f3f4f6; margin:0; padding:40px 20px; }
  .card { background:#fff; border-radius:12px; max-width:480px; margin:0 auto; padding:40px; box-shadow:0 4px 24px rgba(0,0,0,.08); }
  .logo { font-size:18px; font-weight:800; color:#4f46e5; margin-bottom:32px; }
  h1 { font-size:22px; font-weight:700; color:#111827; margin-bottom:12px; }
  p  { font-size:15px; color:#6b7280; line-height:1.6; margin-bottom:16px; }
</style>
</head>
<body>
<div class="card">
  <div class="logo">⚡ CannedIQ</div>
  <h1>You've been added to ${escHtml(teamName)}</h1>
  <p>${escHtml(inviterEmail)} has added your existing CannedIQ account to the <strong>${escHtml(teamName)}</strong> team.</p>
  <p>Open the CannedIQ extension and sign in — you'll see the team's shared command library automatically.</p>
</div>
</body>
</html>`;
}

function buildExistingAccountText(teamName: string, inviterEmail: string): string {
  return [
    `You've been added to "${teamName}" on CannedIQ`,
    '',
    `${inviterEmail} has added your account to the "${teamName}" team.`,
    'Open the CannedIQ extension and sign in to see the shared library.',
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
