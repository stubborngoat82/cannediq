/**
 * Supabase Edge Function: accept-team-invite
 *
 * Serves a self-contained HTML page for accepting team invites.
 * No separate website hosting required.
 *
 * Flow:
 *   1. Owner shares: https://<project>.supabase.co/functions/v1/accept-team-invite?token=<uuid>
 *   2. This function looks up the invite (server-side, using service role)
 *   3. Returns a styled HTML page with the team name already embedded
 *   4. Page's JS handles sign-up / sign-in (email or Google)
 *   5. After auth, page calls /rest/v1/rpc/accept_team_invite with the token + user JWT
 *   6. Success screen shown — user opens the extension and sees the team library
 *
 * Deploy:
 *   supabase functions deploy accept-team-invite --no-verify-jwt
 *
 * Environment variables:
 *   SUPABASE_URL               — auto-injected
 *   DB_ANON_KEY                — set this manually (same as SUPABASE_ANON in config.js)
 *   SUPABASE_SERVICE_ROLE_KEY  — auto-injected
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Accept either DB_ANON_KEY or SUPABASE_ANON_KEY — set whichever you have
const ANON_KEY          =
  Deno.env.get('DB_ANON_KEY') ??
  Deno.env.get('SUPABASE_ANON_KEY') ?? '';

Deno.serve(async (req: Request) => {
  const url   = new URL(req.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return htmlResponse(errorPage('No invite token provided.', ''), 400);
  }

  if (!ANON_KEY) {
    console.error('[accept-team-invite] DB_ANON_KEY / SUPABASE_ANON_KEY secret is not set.');
    return htmlResponse(
      errorPage('Server configuration error.', 'The server is missing a required key. Contact the team owner.'),
      500
    );
  }

  // Look up invite server-side (safe: service role, no RLS)
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: preview, error: rpcErr } = await supabase.rpc('get_invite_preview', { p_token: token });
  if (rpcErr) {
    console.error('[accept-team-invite] get_invite_preview error:', rpcErr.message);
    return htmlResponse(errorPage('Invite lookup failed.', 'Please try the link again or ask for a new invite.'), 500);
  }

  if (!preview?.found) {
    return htmlResponse(errorPage('Invite not found.', 'This link may have already been used or was never valid.'), 404);
  }
  if (preview.status === 'accepted') {
    return htmlResponse(errorPage('Already accepted.', 'This invite has already been used.'), 200);
  }
  if (preview.status === 'revoked' || preview.expired) {
    return htmlResponse(errorPage('Invite expired or revoked.', 'Ask your team owner to send a new invite.'), 200);
  }

  const teamName = preview.team_name ?? 'your team';

  return htmlResponse(acceptPage(teamName, token, SUPABASE_URL, ANON_KEY), 200);
});

// ── HTML page builder ─────────────────────────────────────────────

function acceptPage(teamName: string, token: string, supabaseUrl: string, anonKey: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const jsEsc = (s: string) => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Join ${esc(teamName)} - Canned Response Launcher</title>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #f3f4f6;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    color: #111827;
  }
  .card {
    background: #fff;
    border-radius: 16px;
    padding: 40px;
    max-width: 420px;
    width: 100%;
    box-shadow: 0 8px 40px rgba(0,0,0,.1);
  }
  .logo { font-size: 16px; font-weight: 800; color: #4f46e5; margin-bottom: 28px; display: flex; align-items: center; gap: 8px; }
  .logo-icon { width: 28px; height: 28px; background: #4f46e5; border-radius: 7px; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 14px; }
  h1 { font-size: 20px; font-weight: 700; margin-bottom: 8px; }
  .subtitle { font-size: 14px; color: #6b7280; margin-bottom: 28px; line-height: 1.5; }
  .team-name { color: #4f46e5; font-weight: 600; }
  .tab-row { display: flex; background: #f3f4f6; border-radius: 8px; padding: 3px; margin-bottom: 20px; }
  .tab { flex: 1; text-align: center; padding: 7px; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer; color: #6b7280; border: none; background: transparent; }
  .tab.active { background: #fff; color: #111827; font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
  .form { display: flex; flex-direction: column; gap: 12px; }
  label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; font-weight: 500; color: #374151; }
  input { border: 1px solid #d1d5db; border-radius: 7px; padding: 9px 12px; font-size: 14px; font-family: inherit; outline: none; transition: border-color .15s; }
  input:focus { border-color: #6366f1; box-shadow: 0 0 0 2px rgba(99,102,241,.15); }
  .btn { border: none; border-radius: 8px; padding: 11px 18px; font-size: 14px; font-weight: 600; cursor: pointer; transition: background .12s; width: 100%; font-family: inherit; }
  .btn-primary { background: #4f46e5; color: #fff; }
  .btn-primary:hover { background: #4338ca; }
  .btn-primary:disabled { background: #a5b4fc; cursor: not-allowed; }
  .divider { display: flex; align-items: center; gap: 10px; color: #9ca3af; font-size: 12px; margin: 4px 0; }
  .divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: #e5e7eb; }
  .btn-google { background: #fff; border: 1.5px solid #d1d5db; color: #374151; display: flex; align-items: center; justify-content: center; gap: 10px; }
  .btn-google:hover { background: #f9fafb; border-color: #6366f1; }
  .error { background: #fef2f2; border: 1px solid #fca5a5; border-radius: 7px; padding: 10px 14px; font-size: 13px; color: #dc2626; }
  .success { text-align: center; }
  .success .icon { font-size: 48px; margin-bottom: 16px; }
  .success h1 { margin-bottom: 8px; }
  .success p { font-size: 14px; color: #6b7280; line-height: 1.6; margin-bottom: 8px; }
  .success .hint { font-size: 12px; color: #9ca3af; margin-top: 20px; background: #f9fafb; border-radius: 8px; padding: 12px; }
  [hidden] { display: none !important; }
</style>
</head>
<body>
<div class="card">
  <div class="logo"><div class="logo-icon">&#9889;</div>Canned Response Launcher</div>

  <!-- Auth form -->
  <div id="auth-section">
    <h1>Join <span class="team-name">${esc(teamName)}</span></h1>
    <p class="subtitle">You've been invited to a shared response library. Sign in or create a free account to accept.</p>

    <div class="tab-row">
      <button class="tab active" data-mode="signin" onclick="setMode('signin')">Sign in</button>
      <button class="tab" data-mode="signup" onclick="setMode('signup')">Create account</button>
    </div>

    <div class="form">
      <div id="auth-error" class="error" hidden></div>
      <label>Email <input id="email" type="email" placeholder="you@work.com" autocomplete="email" /></label>
      <label>Password <input id="password" type="password" placeholder="Password" autocomplete="current-password" /></label>
      <button class="btn btn-primary" id="auth-btn" onclick="handleEmailAuth()">Sign in &amp; Accept</button>
    </div>

    <div class="divider"><span>or</span></div>

    <button class="btn btn-google" onclick="handleGoogle()">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
      Continue with Google
    </button>
  </div>

  <!-- Success -->
  <div id="success-section" hidden class="success">
    <div class="icon">&#127881;</div>
    <h1>You're in!</h1>
    <p>You've joined <strong>${esc(teamName)}</strong>.</p>
    <p>Open the Canned Response Launcher extension, press <strong>Ctrl+Space</strong> in any text field, and your team's responses will appear alongside your own.</p>
    <div class="hint">
      Don't have the extension? Search for <strong>Canned Response Launcher</strong> in the Chrome Web Store.
    </div>
  </div>
</div>

<script>
(function() {
  const SUPABASE_URL  = \`${jsEsc(supabaseUrl)}\`;
  const SUPABASE_ANON = \`${jsEsc(anonKey)}\`;
  const TOKEN         = \`${jsEsc(token)}\`;

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

  let mode = 'signin';

  function setMode(m) {
    mode = m;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.mode === m));
    document.getElementById('auth-btn').textContent =
      m === 'signup' ? 'Create account & Accept' : 'Sign in & Accept';
    document.getElementById('password').autocomplete =
      m === 'signup' ? 'new-password' : 'current-password';
    clearError();
  }
  window.setMode = setMode;

  function showError(msg) {
    const el = document.getElementById('auth-error');
    el.textContent = msg;
    el.hidden = false;
  }
  function clearError() {
    const el = document.getElementById('auth-error');
    el.hidden = true;
    el.textContent = '';
  }

  function setLoading(on) {
    document.getElementById('auth-btn').disabled = on;
    document.getElementById('auth-btn').textContent = on
      ? 'Please wait...'
      : (mode === 'signup' ? 'Create account & Accept' : 'Sign in & Accept');
  }

  async function acceptInvite(accessToken) {
    const res = await fetch(SUPABASE_URL + '/rest/v1/rpc/accept_team_invite', {
      method: 'POST',
      headers: {
        'apikey':        SUPABASE_ANON,
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ p_token: TOKEN }),
    });
    return res.json();
  }

  async function handleEmailAuth() {
    clearError();
    const email    = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    if (!email || !password) { showError('Please enter your email and password.'); return; }
    setLoading(true);
    try {
      let result;
      if (mode === 'signup') {
        // Pass the current URL as the redirect target so that the Supabase
        // email-confirmation link brings the user back HERE (with ?token=…)
        // rather than to the generic SITE_URL. The onAuthStateChange handler
        // then picks up the session and calls acceptInvite automatically.
        result = await sb.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.href },
        });
      } else {
        result = await sb.auth.signInWithPassword({ email, password });
      }
      if (result.error) throw result.error;
      const session = result.data?.session;
      if (!session) {
        // Email confirmation required — confirmation link will redirect back here
        showError('Almost there! Check your inbox for a confirmation email. Click the link in it and you\'ll be joined automatically.');
        setLoading(false);
        return;
      }
      const data = await acceptInvite(session.access_token);
      if (!data.success) throw new Error(data.error);
      document.getElementById('auth-section').hidden = true;
      document.getElementById('success-section').hidden = false;
    } catch (err) {
      showError(err.message || 'Something went wrong. Please try again.');
      setLoading(false);
    }
  }
  window.handleEmailAuth = handleEmailAuth;

  async function handleGoogle() {
    clearError();
    // Redirect back to this same page (with token in URL) after OAuth
    const redirectTo = window.location.href;
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    if (error) showError(error.message);
  }
  window.handleGoogle = handleGoogle;

  // On page load: check if we just returned from OAuth (session in URL hash)
  sb.auth.onAuthStateChange(async (event, session) => {
    if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
      // Only auto-accept if we have a token in the URL (i.e. this is the accept page)
      if (!TOKEN) return;
      // Avoid double-firing on initial page load for non-OAuth sessions
      if (event === 'INITIAL_SESSION' && !location.hash.includes('access_token')) return;
      const data = await acceptInvite(session.access_token);
      document.getElementById('auth-section').hidden = true;
      if (data.success) {
        document.getElementById('success-section').hidden = false;
      } else {
        document.getElementById('success-section').hidden = true;
        document.getElementById('auth-section').hidden = false;
        showError(data.error || 'Could not accept invite.');
      }
    }
  });

  // Allow pressing Enter to submit
  document.getElementById('password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleEmailAuth();
  });
  document.getElementById('email').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('password').focus();
  });
})();
</script>
</body>
</html>`;
}

function errorPage(title: string, detail: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Invite — Canned Response Launcher</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f3f4f6; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
  .card { background: #fff; border-radius: 16px; padding: 40px; max-width: 400px; width: 100%; box-shadow: 0 8px 40px rgba(0,0,0,.1); text-align: center; }
  .icon { font-size: 40px; margin-bottom: 16px; }
  h1 { font-size: 20px; font-weight: 700; margin-bottom: 8px; color: #111827; }
  p { font-size: 14px; color: #6b7280; line-height: 1.5; }
</style>
</head>
<body>
<div class="card">
  <div class="icon">⚠️</div>
  <h1>${esc(title)}</h1>
  <p>${esc(detail)}</p>
</div>
</body>
</html>`;
}

function htmlResponse(html: string, status: number): Response {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
