/**
 * /team/accept-invite?token=<uuid>
 *
 * Replaces the accept-team-invite Edge Function HTML page.
 * Looks up the invite, then signs the visitor in (email or Google) and calls
 * accept_team_invite with their Supabase JWT.
 */
'use client';

import { use, useEffect, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

function getSb() {
  if (!SUPABASE_URL || !SUPABASE_ANON) {
    throw new Error('Supabase URL and anon key are not configured.');
  }
  return createClient(SUPABASE_URL, SUPABASE_ANON);
}

export default function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = use(searchParams);
  const initialToken = typeof params.token === 'string' ? params.token : '';
  const [token, setToken] = useState(initialToken);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [teamName, setTeamName] = useState('your team');
  const [blocked, setBlocked] = useState(initialToken ? '' : 'No invite token provided.');
  const accepting = useRef(false);

  useEffect(() => {
    const t = initialToken || (new URLSearchParams(window.location.search).get('token') ?? '');
    setToken(t);
    if (!t) {
      setBlocked('No invite token provided.');
      return;
    }
    fetch(`/api/team/invite-preview?token=${encodeURIComponent(t)}`)
      .then(async (r) => {
        const d = await r.json() as { team_name?: string; status?: string; expired?: boolean; error?: string };
        if (!r.ok) {
          setBlocked(d.error || 'Invite not found. This link may have already been used or was never valid.');
          return;
        }
        if (d.team_name) setTeamName(d.team_name);
        if (d.status === 'accepted') setBlocked('This invite has already been used.');
        else if (d.status === 'revoked' || d.expired) setBlocked('This invite expired or was revoked. Ask your team owner to send a new one.');
      })
      .catch(() => setBlocked('Invite lookup failed. Try the link again or ask for a new invite.'));
  }, [initialToken]);

  async function acceptInvite(accessToken: string) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/accept_team_invite`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_token: token }),
    });
    return res.json() as Promise<{ success?: boolean; error?: string }>;
  }

  useEffect(() => {
    if (!token) return;
    const { data: sub } = getSb().auth.onAuthStateChange(async (event, session) => {
      if (!session) return;
      if (event !== 'SIGNED_IN' && event !== 'INITIAL_SESSION') return;
      if (event === 'INITIAL_SESSION' && !window.location.hash.includes('access_token')) return;
      if (accepting.current) return;
      accepting.current = true;
      try {
        const data = await acceptInvite(session.access_token);
        if (!data.success) throw new Error(data.error || 'Could not accept invite.');
        setSuccess(true);
        setError('');
      } catch (e: unknown) {
        accepting.current = false;
        setError((e as Error).message || 'Could not accept invite.');
      }
    });
    return () => sub.subscription.unsubscribe();
    // acceptInvite closes over token; re-bind when the token arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleSubmit() {
    setError('');
    if (!email || !password) { setError('Please enter your email and password.'); return; }
    setLoading(true);
    try {
      const auth = getSb().auth;
      const result = mode === 'signup'
        ? await auth.signUp({ email, password, options: { emailRedirectTo: window.location.href } })
        : await auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      const session = result.data?.session;
      if (!session) {
        setError('Almost there! Check your inbox for a confirmation email. Click the link in it and you will be joined automatically.');
        return;
      }
      accepting.current = true;
      const data = await acceptInvite(session.access_token);
      if (!data.success) throw new Error(data.error || 'Could not accept invite.');
      setSuccess(true);
    } catch (e: unknown) {
      accepting.current = false;
      setError((e as Error).message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError('');
    const { error: oauthErr } = await getSb().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href },
    });
    if (oauthErr) setError(oauthErr.message);
  }

  if (blocked) {
    return (
      <div style={styles.card}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <h1 style={{ marginBottom: 8 }}>Invite</h1>
        <p style={{ color: '#6b7280' }}>{blocked}</p>
      </div>
    );
  }

  if (success) {
    return (
      <div style={styles.card}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
        <h1>You&apos;re in!</h1>
        <p>You&apos;ve joined <strong>{teamName}</strong>.</p>
        <p style={{ marginTop: 12, fontSize: 14, color: '#6b7280' }}>
          Open the CannedIQ extension, press Ctrl+Space in any text field, and the
          team library will appear alongside your own responses.
        </p>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      <div style={{ fontWeight: 800, color: '#4f46e5', marginBottom: 28 }}>⚡ CannedIQ</div>
      <h1 style={{ marginBottom: 8 }}>Join <span style={{ color: '#4f46e5' }}>{teamName}</span></h1>
      <p style={{ color: '#6b7280', marginBottom: 24 }}>
        You&apos;ve been invited to a shared response library. Sign in or create a free account to accept.
      </p>

      <div style={styles.tabRow}>
        {(['signin', 'signup'] as const).map((m) => (
          <button key={m} type="button" style={{ ...styles.tab, ...(mode === m ? styles.tabActive : {}) }}
            onClick={() => setMode(m)}>
            {m === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        ))}
      </div>

      {error && <div style={styles.error}>{error}</div>}

      <label style={styles.label}>
        Email
        <input style={styles.input} type="email" value={email} autoComplete="email"
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()} />
      </label>
      <label style={{ ...styles.label, marginTop: 12 }}>
        Password
        <input style={styles.input} type="password" value={password}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()} />
      </label>

      <button type="button" style={{ ...styles.btn, marginTop: 16 }} disabled={loading} onClick={handleSubmit}>
        {loading ? 'Please wait…' : mode === 'signup' ? 'Create account & Accept' : 'Sign in & Accept'}
      </button>

      <div style={styles.divider}><span>or</span></div>
      <button type="button" style={styles.google} onClick={handleGoogle}>Continue with Google</button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    fontFamily: 'sans-serif', maxWidth: 420, margin: '48px auto', padding: 40,
    background: '#fff', borderRadius: 16, boxShadow: '0 8px 40px rgba(0,0,0,.1)',
  },
  tabRow: { display: 'flex', background: '#f3f4f6', borderRadius: 8, padding: 3, marginBottom: 20 },
  tab: { flex: 1, border: 'none', background: 'transparent', padding: '7px 0', cursor: 'pointer', borderRadius: 6, fontWeight: 500 },
  tabActive: { background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.1)', fontWeight: 600 },
  error: { background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 7, padding: '10px 14px', fontSize: 13, color: '#dc2626', marginBottom: 12 },
  label: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 500 },
  input: { border: '1px solid #d1d5db', borderRadius: 7, padding: '9px 12px', fontSize: 14, fontFamily: 'inherit' },
  btn: { background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer', width: '100%' },
  divider: { display: 'flex', alignItems: 'center', gap: 10, color: '#9ca3af', fontSize: 12, margin: '16px 0' },
  google: { background: '#fff', border: '1.5px solid #d1d5db', color: '#374151', borderRadius: 8, padding: '11px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer', width: '100%' },
};
