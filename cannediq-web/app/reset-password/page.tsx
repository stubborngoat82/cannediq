'use client';

import { useState, useEffect } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';

// Note: metadata export is ignored in 'use client' — set it in a parent layout if needed
// export const metadata: Metadata = { title: 'Reset Password — cannedIQ' };

type State = 'form' | 'success' | 'invalid';

export default function ResetPasswordPage() {
  const [state, setState] = useState<State>('form');
  const [newPw, setNewPw]       = useState('');
  const [confPw, setConfPw]     = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [token, setToken]       = useState('');

  useEffect(() => {
    const hash   = window.location.hash.slice(1);
    const params = new URLSearchParams(hash);
    const tok    = params.get('access_token') ?? '';
    const type   = params.get('type') ?? '';
    if (!tok || type !== 'recovery') {
      setState('invalid');
    } else {
      setToken(tok);
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!newPw || newPw.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPw !== confPw) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        method: 'PUT',
        headers: {
          'Content-Type':  'application/json',
          'apikey':        SUPABASE_ANON,
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ password: newPw }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error_description || data.msg || 'Password update failed.');

      // Clear token from URL so it can't be replayed
      window.history.replaceState(null, '', window.location.pathname);
      setState('success');
    } catch (err: unknown) {
      setError((err as Error).message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-[#111827] border border-[#1E293B] rounded-2xl p-9">

        {/* Logo */}
        <div className="mb-6 text-base font-bold text-[#F8FAFC]">
          ⚡ canned<span className="text-blue-400">IQ</span>
        </div>

        {/* ── Invalid / expired ── */}
        {state === 'invalid' && (
          <div className="text-center">
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="text-[1.05rem] font-bold text-[#F8FAFC] mb-3">Link expired or invalid</h2>
            <p className="text-sm text-[#64748B] leading-relaxed">
              This password reset link has expired or already been used.
              Please request a new one from the cannedIQ extension.
            </p>
          </div>
        )}

        {/* ── Form ── */}
        {state === 'form' && (
          <form onSubmit={handleSubmit}>
            <h1 className="text-[1.05rem] font-bold text-[#F8FAFC] mb-1">Set a new password</h1>
            <p className="text-sm text-[#64748B] mb-6">Choose a strong password for your cannedIQ account.</p>

            {error && (
              <div className="mb-4 px-3 py-2.5 bg-red-500/10 border border-red-500/25 rounded-lg text-sm text-red-400">
                {error}
              </div>
            )}

            <label className="block text-xs font-medium text-[#9CA3AF] mb-1.5">New password</label>
            <input
              type="password"
              value={newPw}
              onChange={e => setNewPw(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              required
              className="w-full px-3 py-2.5 bg-[#1E293B] border border-[#334155] rounded-lg text-[#F8FAFC] text-sm outline-none focus:border-blue-500 mb-4"
            />

            <label className="block text-xs font-medium text-[#9CA3AF] mb-1.5">Confirm password</label>
            <input
              type="password"
              value={confPw}
              onChange={e => setConfPw(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit(e as unknown as React.FormEvent)}
              placeholder="Repeat your new password"
              autoComplete="new-password"
              required
              className="w-full px-3 py-2.5 bg-[#1E293B] border border-[#334155] rounded-lg text-[#F8FAFC] text-sm outline-none focus:border-blue-500 mb-5"
            />

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-lg transition-colors"
            >
              {loading ? 'Updating…' : 'Set New Password'}
            </button>
          </form>
        )}

        {/* ── Success ── */}
        {state === 'success' && (
          <div className="text-center">
            <div className="text-4xl mb-4">✅</div>
            <h2 className="text-[1.05rem] font-bold text-[#F8FAFC] mb-3">Password updated!</h2>
            <p className="text-sm text-[#64748B] leading-relaxed mb-5">
              Your password has been changed. You can now sign in to cannedIQ with your new password.
            </p>
            <Link href="/" className="text-sm text-blue-400 hover:underline">
              Back to cannedIQ
            </Link>
          </div>
        )}

      </div>
    </div>
  );
}
