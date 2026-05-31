/**
 * Canned Response Launcher — Auth Module
 *
 * Wraps Supabase Auth REST API.
 * Stores session (access_token + refresh_token) in chrome.storage.local.
 * Loaded by: background.js, options.js
 *
 * Dependencies: config.js must be loaded first (provides AUTH_URL, SUPABASE_ANON).
 */

const Auth = (() => {
  const SESSION_KEY = 'crl_session';

  // ── Low-level storage ──────────────────────────────────────

  function readSession() {
    return new Promise((resolve) => {
      chrome.storage.local.get([SESSION_KEY], (r) => resolve(r[SESSION_KEY] ?? null));
    });
  }

  function writeSession(session) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [SESSION_KEY]: session }, resolve);
    });
  }

  function clearSession() {
    return new Promise((resolve) => {
      chrome.storage.local.remove([SESSION_KEY], resolve);
    });
  }

  // ── Supabase Auth REST helpers ─────────────────────────────

  async function authFetch(path, body) {
    const res = await fetch(`${AUTH_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || data.msg || 'Auth error');
    return data;
  }

  // ── Public API ─────────────────────────────────────────────

  /**
   * Sign in with email + password.
   * Returns the session object and persists it.
   */
  async function signInWithEmail(email, password) {
    const data = await authFetch('/token?grant_type=password', { email, password });
    const session = normalizeSession(data);
    await writeSession(session);
    return session;
  }

  /**
   * Sign up with email + password.
   * Supabase sends a confirmation email by default.
   */
  async function signUpWithEmail(email, password) {
    const data = await authFetch('/signup', { email, password });
    // Session may be null until email is confirmed, depending on your project settings
    if (data.access_token) {
      const session = normalizeSession(data);
      await writeSession(session);
      return { session, needsConfirmation: false };
    }
    return { session: null, needsConfirmation: true };
  }

  /**
   * Sign in with Google via chrome.identity.
   * Requires "identity" permission in manifest and an OAuth client configured
   * in your Google Cloud project with the extension's client ID.
   */
  async function signInWithGoogle() {
    // No path argument — returns https://{ext-id}.chromiumapp.org/
    // which matches the https://*.chromiumapp.org/ entry in Supabase's allowed redirect URLs
    const redirectUrl = chrome.identity.getRedirectURL();

    // Build the Supabase Google OAuth URL.
    // prompt=select_account forces Google to show the account picker every time
    // so the user actively chooses their account after signing out.
    const oauthUrl =
      `${AUTH_URL}/authorize?provider=google` +
      `&redirect_to=${encodeURIComponent(redirectUrl)}` +
      `&prompt=select_account`;

    return new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow({ url: oauthUrl, interactive: true }, async (responseUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        try {
          // Supabase redirects back with tokens in hash or query string
          const parsed   = new URL(responseUrl);
          const fromHash = Object.fromEntries(new URLSearchParams(parsed.hash.slice(1)));
          const fromQS   = Object.fromEntries(parsed.searchParams);
          const params   = { ...fromQS, ...fromHash }; // hash takes priority

          if (!params.access_token) throw new Error('No access token in OAuth response');

          // Build a minimal session first so we can call the user endpoint
          const partialSession = {
            access_token:  params.access_token,
            refresh_token: params.refresh_token ?? null,
            expires_at:    Date.now() + parseInt(params.expires_in ?? '3600', 10) * 1000,
            user: { id: null, email: null, tier: 'free' },
          };

          // Decode the JWT to get the user ID right away (no extra round-trip needed)
          const claims = decodeJWT(params.access_token);
          partialSession.user.id    = claims?.sub   ?? null;
          partialSession.user.email = claims?.email ?? null;

          // Also fetch from /user endpoint for email (some JWT configs omit it)
          try {
            const userRes = await fetch(`${AUTH_URL}/user`, {
              headers: {
                'apikey':        SUPABASE_ANON,
                'Authorization': `Bearer ${params.access_token}`,
              },
            });
            if (userRes.ok) {
              const userData = await userRes.json();
              partialSession.user.id    = userData.id    ?? partialSession.user.id;
              partialSession.user.email = userData.email ?? partialSession.user.email;
              partialSession.user.tier  = userData.user_metadata?.tier ?? 'free';
            }
          } catch { /* JWT claims are good enough */ }

          await writeSession(partialSession);
          resolve(partialSession);
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  /**
   * Refresh the access token using the stored refresh token.
   * Called automatically by getValidSession().
   */
  async function refreshSession(session) {
    if (!session?.refresh_token) throw new Error('No refresh token available');
    const data = await authFetch('/token?grant_type=refresh_token', {
      refresh_token: session.refresh_token,
    });
    const fresh = normalizeSession(data);
    await writeSession(fresh);
    return fresh;
  }

  /**
   * Returns a session with a valid (non-expired) access token.
   * Refreshes automatically if within 60s of expiry.
   * Returns null if not logged in.
   */
  async function getValidSession() {
    let session = await readSession();
    if (!session) return null;

    const REFRESH_BUFFER_MS = 60 * 1000; // refresh 60s before expiry
    if (Date.now() >= session.expires_at - REFRESH_BUFFER_MS) {
      try {
        session = await refreshSession(session);
      } catch {
        // Refresh failed — session is dead
        await clearSession();
        return null;
      }
    }
    return session;
  }

  /**
   * Sign out: revoke the token server-side and clear local storage.
   */
  async function signOut() {
    const session = await readSession();
    if (session?.access_token) {
      try {
        await fetch(`${AUTH_URL}/logout`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON,
            'Authorization': `Bearer ${session.access_token}`,
          },
        });
      } catch { /* best-effort */ }
    }
    await clearSession();
  }

  /**
   * Returns the stored user object, or null if not logged in.
   * Does NOT validate the token — use getValidSession() for that.
   */
  async function getUser() {
    const session = await readSession();
    return session?.user ?? null;
  }

  /**
   * Update the authenticated user's password.
   * Requires a valid session (user must already be signed in).
   * Used for the forced temp-password change flow on first login.
   */
  async function updatePassword(newPassword) {
    const session = await getValidSession();
    if (!session) throw new Error('Not authenticated');

    const res = await fetch(`${AUTH_URL}/user`, {
      method: 'PUT',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        SUPABASE_ANON,
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ password: newPassword }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || data.msg || 'Password update failed');
    return data;
  }

  /**
   * Send a password-reset email via Supabase Auth.
   * Supabase emails a magic link that redirects to RESET_PASSWORD_URL.
   * No session required — works from the logged-out state.
   */
  async function sendPasswordReset(email) {
    const RESET_URL = 'https://www.cannediq.com/reset-password';
    const res = await fetch(
      `${AUTH_URL}/recover?redirect_to=${encodeURIComponent(RESET_URL)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey':       SUPABASE_ANON,
        },
        body: JSON.stringify({
          email,
          gotrue_meta_security: {},
        }),
      }
    );
    // Supabase returns 200 even if the email isn't found (security best practice)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error_description || data.msg || 'Failed to send reset email');
    }
  }

  // ── Helpers ────────────────────────────────────────────────

  /**
   * Decode a JWT without verifying the signature.
   * Used to extract the `sub` (user ID) and `email` claims from the access token
   * when the API response doesn't include them explicitly.
   */
  function decodeJWT(token) {
    try {
      const payload = token.split('.')[1];
      // Base64url → base64 → JSON
      const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  function normalizeSession(raw) {
    const claims = decodeJWT(raw.access_token);
    return {
      access_token:  raw.access_token,
      refresh_token: raw.refresh_token,
      expires_at:    Date.now() + (raw.expires_in ?? 3600) * 1000,
      user: {
        // Prefer explicit user object, fall back to JWT claims
        id:    raw.user?.id    ?? claims?.sub   ?? null,
        email: raw.user?.email ?? claims?.email ?? null,
        tier:  raw.user?.user_metadata?.tier ?? 'free',
      },
    };
  }

  return {
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    refreshSession,
    getValidSession,
    signOut,
    getUser,
    updatePassword,
    sendPasswordReset,
  };
})();
