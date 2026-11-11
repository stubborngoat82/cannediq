/**
 * /team/accept-invite?token=<uuid>
 *
 * Replaces the accept-team-invite Edge Function HTML page.
 * Looks up the invite token server-side, then renders a sign-in/sign-up form
 * that calls the Supabase RPC accept_team_invite on completion.
 *
 * This is a Client Component because it reads URL params and calls Supabase auth.
 */
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

export default function AcceptInvitePage() {
  const [token, setToken]   = useState('');
  const [mode, setMode]     = useState<'signin' | 'signup'>('signin');
  const [email, setEmail]   = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [teamName, setTeamName] = useState('your team');

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token') ?? '';
    setToken(t);
    if (t) {
      // Fetch team name from the API (server-side lookup)
      fetch(`/api/team/invite-preview?token=${encodeURIComponent(t)}`)
        .then((r) => r.json())
        .then((d) => { if (d.team_name) setTeamName(d.team_name); })
        .catch(() => {});
    }
  }, []);

  async function acceptInvite(accessToken: string) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/accept_team_invite`, {
      method: 'POST',
      headers: {
        'apikey':        SUPABASE_ANON,
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ p_token: token }),
    });
    return res.json();
  }

  async function handleSubmit() {
    setError('');
    setLoading(true);
    try {
      const result = mode === 'signup'
        ? await sb.auth.signUp({ email, password, options: { emailRedirectTo: window.location.href } })
        : await sb.auth.signInWithPassword({ email, password });

      if (result.error) throw result.error;
      const session = result.data?.session;
      if (!session) {
        setError('Check your inbox for a confirmation email, then come back to accept the invite.');
        return;
      }
      const data = await acceptInvite(session.access_token);
      if (!data.success) throw new Error(data.error);
      setSuccess(true);
    } catch (e: unknown) {
      setError((e as Error).message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
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
        Sign in or create a free account to accept your invite.
      </p>

      <div style={styles.tabRow}>
        {(['signin', 'signup'] as const).map((m) => (
          <button key={m} style={{ ...styles.tab, ...(mode === m ? styles.tabActive : {}) }}
            onClick={() => setMode(m)}>
            {m === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        ))}
      </div>

      {error && <div style={styles.error}>{error}</div>}

      <label style={styles.label}>
        Email
        <input style={styles.input} type="email" value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()} />
      </label>
      <label style={{ ...styles.label, marginTop: 12 }}>
        Password
        <input style={styles.input} type="password" value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()} />
      </label>

      <button style={{ ...styles.btn, marginTop: 16 }} disabled={loading} onClick={handleSubmit}>
        {loading ? 'Please wait…' : mode === 'signup' ? 'Create account & Accept' : 'Sign in & Accept'}
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    fontFamily: 'sans-serif', maxWidth: 400, margin: '80px auto', padding: 40,
    background: '#fff', borderRadius: 16, boxShadow: '0 8px 40px rgba(0,0,0,.1)',
  },
  tabRow: { display: 'flex', background: '#f3f4f6', borderRadius: 8, padding: 3, marginBottom: 20 },
  tab: { flex: 1, border: 'none', background: 'transparent', padding: '7px 0', cursor: 'pointer', borderRadius: 6, fontWeight: 500 },
  tabActive: { background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.1)', fontWeight: 600 },
  error: { background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 7, padding: '10px 14px', fontSize: 13, color: '#dc2626', marginBottom: 12 },
  label: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 500 },
  input: { border: '1px solid #d1d5db', borderRadius: 7, padding: '9px 12px', fontSize: 14, fontFamily: 'inherit' },
  btn: { background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer', width: '100%' },
};
