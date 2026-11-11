'use client';

import { useState, useEffect, useRef } from 'react';

type Period = 'monthly' | 'annual';

const PRICES = {
  monthly: { pro: '$10', ai: '$20', team: '$12', proBill: 'Billed monthly',           aiBill: 'Billed monthly',           teamBill: 'Billed monthly',                cmpPro: '$10/mo',  cmpAi: '$20/mo',  cmpTeam: '$12/user/mo' },
  annual:  { pro: '$8',  ai: '$16', team: '$10', proBill: 'Billed annually ($96/yr)', aiBill: 'Billed annually ($192/yr)', teamBill: 'Billed annually ($120/user/yr)', cmpPro: '$8/mo',   cmpAi: '$16/mo',  cmpTeam: '$10/user/mo' },
};

function getSupabaseToken(): string | null {
  try {
    const key = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
    if (!key) return null;
    const session = JSON.parse(localStorage.getItem(key) || '{}');
    const token = session?.access_token as string | undefined;
    if (!token) return null;
    const exp = (session?.expires_at ?? 0) as number;
    if (exp && Date.now() / 1000 > exp) return null;
    return token;
  } catch { return null; }
}

function AuthModal({ plan, seats, onClose }: { plan: string; seats: number; onClose: () => void }) {
  const [email, setEmail]       = useState('');
  const [msg, setMsg]           = useState('');
  const [msgOk, setMsgOk]       = useState(false);
  const [sending, setSending]   = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  async function sendLink() {
    if (!email || !email.includes('@')) { setMsgOk(false); setMsg('Please enter a valid email address.'); return; }
    setSending(true); setMsg('');
    try {
      const SUPA_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const SUPA_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      sessionStorage.setItem('ciq_checkout_intent', JSON.stringify({ plan, seats }));
      const res = await fetch(`${SUPA_URL}/auth/v1/otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPA_ANON },
        body: JSON.stringify({ email, options: { emailRedirectTo: window.location.href } }),
      });
      if (res.ok || res.status === 200) { setMsgOk(true); setMsg('✓ Magic link sent! Check your inbox.'); }
      else { const e = await res.json().catch(() => ({})); throw new Error(e.error_description || e.msg || 'Failed to send link.'); }
    } catch (err: unknown) { setMsgOk(false); setMsg((err as Error).message || 'Something went wrong.'); }
    finally { setSending(false); }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm bg-[#111827] border border-[#1E293B] rounded-2xl p-8">
        <h3 className="text-lg font-bold text-[#F1F5F9] mb-1.5">Sign in to continue</h3>
        <p className="text-sm text-[#94A3B8] mb-5">We&apos;ll email you a magic link — no password needed.</p>
        <input ref={inputRef} type="email" value={email} onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendLink()} placeholder="you@example.com"
          className="w-full px-3.5 py-3 bg-[#1E293B] border border-[#334155] rounded-xl text-[#F1F5F9] text-sm outline-none focus:border-blue-500 mb-3" />
        {msg && <p className={`text-[13px] mb-3 ${msgOk ? 'text-emerald-400' : 'text-red-400'}`}>{msg}</p>}
        <div className="flex gap-2.5">
          <button onClick={onClose} className="flex-1 py-2.5 border border-[#334155] rounded-xl text-[#94A3B8] text-sm font-semibold hover:text-white transition-colors">Cancel</button>
          <button onClick={sendLink} disabled={sending} className="flex-[2] py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-colors">
            {sending ? 'Sending…' : 'Send Magic Link'}
          </button>
        </div>
      </div>
    </div>
  );
}

const Ck = ({ v }: { v: boolean | string }) =>
  v === true  ? <span className="text-blue-400 font-bold">✓</span>
  : v === false ? <span className="text-[#475569]">–</span>
  : <span className="text-[#CBD5E1] font-semibold">{v as string}</span>;

export default function PricingPage() {
  const [period, setPeriod]     = useState<Period>('monthly');
  const [teamSeats, setTeamSeats] = useState(3);
  const [authModal, setAuthModal] = useState<{ plan: string; seats: number } | null>(null);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const pr = PRICES[period];

  // Resume checkout after magic-link auth redirects back
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.includes('access_token=')) return;
    const params = new URLSearchParams(hash.slice(1));
    const token  = params.get('access_token');
    const refresh = params.get('refresh_token');
    if (!token) return;
    try {
      const payload  = JSON.parse(atob(token.split('.')[1]));
      const storeKey = `sb-${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0]}-auth-token`;
      localStorage.setItem(storeKey, JSON.stringify({ access_token: token, refresh_token: refresh, expires_at: payload.exp, user: { id: payload.sub, email: payload.email } }));
    } catch {}
    history.replaceState(null, '', window.location.pathname + window.location.search);
    const intent = sessionStorage.getItem('ciq_checkout_intent');
    if (intent) {
      sessionStorage.removeItem('ciq_checkout_intent');
      const { plan, seats } = JSON.parse(intent) as { plan: string; seats: number };
      callCheckout(token, plan, seats);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function callCheckout(token: string, plan: string, seats: number) {
    setLoadingPlan(plan);
    try {
      const res  = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ plan, quantity: seats }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (data.url) window.location.href = data.url;
      else alert(data.error || 'Could not start checkout. Please try again.');
    } catch { alert('Network error — please try again.'); }
    finally { setLoadingPlan(null); }
  }

  function triggerCheckout(plan: string) {
    if (plan === 'free') { window.open('https://chromewebstore.google.com/detail/njfecjkiffcmgmhdomjbcfcahgajnhii', '_blank'); return; }
    if (plan === 'credits') return;
    const seats = plan === 'team' ? Math.max(1, teamSeats) : 1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cr = (window as any).chrome;
    if (cr?.runtime?.id) {
      cr.runtime.sendMessage({ type: 'BILLING_CHECKOUT', plan, quantity: seats }, (res: { url?: string }) => {
        if (res?.url) window.location.href = res.url;
        else setAuthModal({ plan, seats });
      });
      return;
    }
    const token = getSupabaseToken();
    if (!token) { sessionStorage.setItem('ciq_checkout_intent', JSON.stringify({ plan, seats })); setAuthModal({ plan, seats }); return; }
    callCheckout(token, plan, seats);
  }

  return (
    <>
      {authModal && <AuthModal plan={authModal.plan} seats={authModal.seats} onClose={() => setAuthModal(null)} />}

      <div className="max-w-6xl mx-auto px-6">

        {/* Hero */}
        <section className="text-center pt-20 pb-14">
          <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-4 tracking-tight leading-tight">
            Stop typing.<br /><span className="grad-text-blue">Start executing.</span>
          </h1>
          <p className="text-lg text-[#94A3B8] max-w-xl mx-auto mb-8 leading-relaxed">
            Launch your best responses instantly with Commands, Triggers, Stacks, and AI-powered workflows.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button onClick={() => triggerCheckout('free')} className="px-8 py-3.5 rounded-xl border-2 border-[#1E293B] text-[#94A3B8] hover:border-blue-600 hover:text-white font-semibold transition-all text-sm">
              Start Free — No credit card
            </button>
            <button onClick={() => triggerCheckout('pro')} className="px-8 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-all text-sm">
              Upgrade to Pro →
            </button>
          </div>
        </section>

        {/* Billing toggle */}
        <div className="flex flex-col items-center gap-2 mb-14">
          <div className="flex bg-[#111827] border border-[#1E293B] rounded-xl p-1 gap-1">
            {(['monthly', 'annual'] as Period[]).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${period === p ? 'bg-blue-600 text-white' : 'text-[#64748B] hover:text-white'}`}>
                {p === 'monthly' ? 'Monthly' : <span>Annual <span className="text-xs font-bold bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full ml-1">Save 20%</span></span>}
              </button>
            ))}
          </div>
          {period === 'annual' && <p className="text-xs text-[#64748B]">Billed annually · equivalent monthly price shown</p>}
        </div>

        {/* Plan cards */}
        <section className="mb-20">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 items-start">

            {/* Free */}
            <div className="bg-[#111827] border border-[#1E293B] rounded-2xl p-6 flex flex-col gap-6">
              <div>
                <div className="text-xs font-bold text-[#64748B] uppercase tracking-widest mb-3">Free</div>
                <div className="text-4xl font-extrabold text-white mb-1">$0</div>
                <p className="text-xs text-[#64748B]">Forever free</p>
              </div>
              <ul className="flex flex-col gap-2.5 text-sm text-[#94A3B8] flex-1">
                {['25 Commands','3 Stacks','Basic triggers & text expansion','Basic variables','Local storage'].map(f => (
                  <li key={f} className="flex items-start gap-2"><span className="text-emerald-400 mt-0.5 shrink-0">✓</span>{f}</li>
                ))}
                {['Context-aware commands','AI Commands','Shared Stacks'].map(f => (
                  <li key={f} className="flex items-start gap-2 opacity-40"><span className="shrink-0">–</span>{f}</li>
                ))}
              </ul>
              <button onClick={() => triggerCheckout('free')} className="w-full py-2.5 border border-[#1E293B] hover:border-blue-500 text-[#94A3B8] hover:text-white rounded-xl text-sm font-semibold transition-all">
                Start Free
              </button>
            </div>

            {/* Pro */}
            <div className="bg-[#111827] border-2 border-blue-500/50 rounded-2xl p-6 flex flex-col gap-6 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded-full">Most Popular</div>
              <div>
                <div className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-3">Pro</div>
                <div className="flex items-end gap-1 mb-1">
                  <span className="text-4xl font-extrabold text-white">{pr.pro}</span>
                  <span className="text-[#64748B] text-sm mb-1">/mo</span>
                </div>
                <p className="text-xs text-[#64748B]">{pr.proBill}</p>
              </div>
              <ul className="flex flex-col gap-2.5 text-sm text-[#94A3B8] flex-1">
                {['Unlimited Commands','Unlimited Stacks','Advanced variables','Full command palette','Context-aware commands','Favorites + Usage history','Import / Export','AI Commands','100 AI credits / month'].map(f => (
                  <li key={f} className="flex items-start gap-2"><span className="text-emerald-400 mt-0.5 shrink-0">✓</span>{f}</li>
                ))}
              </ul>
              <button onClick={() => triggerCheckout('pro')} disabled={loadingPlan === 'pro'} className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-all">
                {loadingPlan === 'pro' ? 'Loading…' : 'Upgrade to Pro'}
              </button>
            </div>

            {/* Pro+AI */}
            <div className="bg-[#111827] border-2 border-violet-500/40 rounded-2xl p-6 flex flex-col gap-6 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-violet-600 text-white text-xs font-bold rounded-full whitespace-nowrap">Best for power users</div>
              <div>
                <div className="text-xs font-bold text-violet-400 uppercase tracking-widest mb-3">Pro+ AI</div>
                <div className="flex items-end gap-1 mb-1">
                  <span className="text-4xl font-extrabold text-white">{pr.ai}</span>
                  <span className="text-[#64748B] text-sm mb-1">/mo</span>
                </div>
                <p className="text-xs text-[#64748B]">{pr.aiBill}</p>
              </div>
              <ul className="flex flex-col gap-2.5 text-sm text-[#94A3B8] flex-1">
                {['Everything in Pro','AI Commands','500 AI credits / month','Tone controls','Prompt templates','Context-aware generation'].map(f => (
                  <li key={f} className="flex items-start gap-2"><span className="text-emerald-400 mt-0.5 shrink-0">✓</span>{f}</li>
                ))}
              </ul>
              <button onClick={() => triggerCheckout('ai')} disabled={loadingPlan === 'ai'} className="w-full py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-all">
                {loadingPlan === 'ai' ? 'Loading…' : 'Unlock AI'}
              </button>
            </div>

            {/* Team */}
            <div className="bg-[#111827] border border-[#1E293B] rounded-2xl p-6 flex flex-col gap-6 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-emerald-600 text-white text-xs font-bold rounded-full">For teams</div>
              <div>
                <div className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-3">Team</div>
                <div className="flex items-end gap-1 mb-1">
                  <span className="text-4xl font-extrabold text-white">{pr.team}</span>
                  <span className="text-[#64748B] text-sm mb-1">/user/mo</span>
                </div>
                <p className="text-xs text-[#64748B]">{pr.teamBill}</p>
              </div>
              <ul className="flex flex-col gap-2.5 text-sm text-[#94A3B8] flex-1">
                {['Everything in Pro','Shared Stacks & templates','Admin controls','Team analytics','Centralized management'].map(f => (
                  <li key={f} className="flex items-start gap-2"><span className="text-emerald-400 mt-0.5 shrink-0">✓</span>{f}</li>
                ))}
              </ul>
              <div className="flex items-center gap-2 text-[#94A3B8]">
                <label className="text-xs whitespace-nowrap">Seats</label>
                <input type="number" min={1} max={500} value={teamSeats} onChange={e => setTeamSeats(Number(e.target.value))}
                  className="w-full px-2 py-1.5 bg-[#0F172A] border border-[#1E293B] rounded-lg text-sm text-[#F8FAFC] outline-none focus:border-emerald-500" />
              </div>
              <button onClick={() => triggerCheckout('team')} disabled={loadingPlan === 'team'} className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-all">
                {loadingPlan === 'team' ? 'Loading…' : 'Start Team Plan'}
              </button>
            </div>

          </div>
          <p className="text-center text-xs text-[#475569] mt-6">🔒 Payments processed securely by Stripe · Cancel any time · Billing by AHPUSHIT LLC</p>
        </section>

        {/* Comparison table */}
        <section className="mb-24">
          <h2 className="text-2xl font-bold text-center text-white mb-10">Compare all features</h2>
          <div className="overflow-x-auto rounded-2xl border border-[#1E293B] bg-[#111827]">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left px-4 py-3 text-[#64748B] font-semibold w-1/3 border-b border-[#1E293B]">Feature</th>
                  <th className="px-4 py-3 text-[#64748B] font-semibold text-center border-b border-[#1E293B]">Free</th>
                  <th className="px-4 py-3 text-blue-400 font-semibold text-center border-b border-[#1E293B]">Pro</th>
                  <th className="px-4 py-3 text-violet-400 font-semibold text-center border-b border-[#1E293B]">Pro+ AI</th>
                  <th className="px-4 py-3 text-emerald-400 font-semibold text-center border-b border-[#1E293B]">Team</th>
                </tr>
              </thead>
              <tbody>
                {([
                  { label: 'Commands & Stacks', rows: [
                    ['Commands',            '25',                      'Unlimited',               'Unlimited',               'Unlimited'],
                    ['Stacks',              '3',                       'Unlimited',               'Unlimited',               'Unlimited'],
                    ['Shared Team Stacks',  false,                     false,                     false,                     true],
                  ]},
                  { label: 'Triggers & Variables', rows: [
                    ['Slash triggers /cmd', true,  true,  true,  true],
                    ['Text expansion ;;cmd',true,  true,  true,  true],
                    ['Advanced variables',  false, true,  true,  true],
                    ['Context-aware',       false, true,  true,  true],
                  ]},
                  { label: 'AI Commands', rows: [
                    ['AI Commands',                 false, true,  true,  'Add-on'],
                    ['AI Credits / month',          false, '100', '500', '100'],
                    ['Tone controls & templates',   false, false, true,  false],
                  ]},
                  { label: 'Productivity', rows: [
                    ['Favorites',       false, true, true, true],
                    ['Usage history',   false, true, true, true],
                    ['Import / Export', false, true, true, true],
                  ]},
                  { label: 'Team & Admin', rows: [
                    ['Shared Stacks',  false, false, false, true],
                    ['Admin controls', false, false, false, true],
                    ['Team analytics', false, false, false, true],
                  ]},
                  { label: 'Pricing', rows: [
                    ['Price', '$0', pr.cmpPro, pr.cmpAi, pr.cmpTeam],
                  ]},
                ] as { label: string; rows: (string | boolean)[][] }[]).map(section => (
                  <tbody key={section.label}>
                    <tr className="bg-[#0F172A]">
                      <td colSpan={5} className="px-4 py-2 text-xs font-bold uppercase tracking-widest text-[#475569]">{section.label}</td>
                    </tr>
                    {section.rows.map((row, i) => (
                      <tr key={i} className="border-t border-[#1E293B]">
                        <td className="px-4 py-3 text-[#CBD5E1]">{row[0] as string}</td>
                        {(row.slice(1) as (string | boolean)[]).map((cell, j) => (
                          <td key={j} className="px-4 py-3 text-center text-[#94A3B8]"><Ck v={cell} /></td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Add-on */}
        <section className="mb-24">
          <div className="max-w-2xl mx-auto rounded-2xl border border-[#1E293B] p-8 text-center bg-[#111827]">
            <div className="text-2xl mb-3">⚡</div>
            <h3 className="text-lg font-bold text-white mb-2">AI Credits Add-on</h3>
            <p className="text-sm text-[#94A3B8] mb-6 max-w-sm mx-auto">Running low on AI credits? Top up any time with a one-time credit pack — no subscription needed.</p>
            <div className="text-3xl font-extrabold text-white mb-1">$5 <span className="text-sm font-normal text-[#64748B]">one-time</span></div>
            <p className="text-xs text-[#64748B] mb-6">Available for Pro+ AI and Team plans · Adds 100 credits</p>
            <button onClick={() => triggerCheckout('credits')} className="px-8 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold rounded-xl transition-colors">
              Buy AI Credits Pack
            </button>
          </div>
        </section>

        {/* FAQ */}
        <section className="max-w-2xl mx-auto mb-24" id="faq">
          <h2 className="text-2xl font-bold text-white text-center mb-10">Frequently asked questions</h2>
          {[
            { q: 'What is a "Stack"?',           a: 'A Stack is a named group of Commands — like a folder for your most-used responses. Free users get 3 Stacks; Pro and above get unlimited.' },
            { q: 'How do AI Commands work?',     a: 'AI Commands send a prompt template to GPT-4o mini (Gemini as fallback) and insert the result into any text field. Use {{inputText}} to reference the active field. No API keys needed.' },
            { q: 'What happens if I cancel?',    a: 'Your commands and stacks stay in local browser storage. You\'ll drop to Free limits (25 commands, 3 stacks) but nothing is deleted. Export first from the Options page.' },
            { q: 'Can I switch plans any time?', a: 'Yes. Upgrades take effect instantly and are prorated. Downgrades take effect at end of your billing period. Manage from the Billing tab in the extension.' },
            { q: 'Other browsers?',              a: 'cannedIQ is currently a Chrome extension (Manifest V3). Firefox and Edge are on the roadmap. Your data is portable via the export feature.' },
            { q: 'What is "AHPUSHIT LLC"?',      a: 'AHPUSHIT LLC is the legal entity behind cannedIQ. You may see AHPUSHIT LLC or CANNEDIQ*AHPUSHIT on your statement. This is normal.' },
            { q: 'Refund policy?',               a: 'Unhappy within 14 days of your first charge? Email us and we\'ll refund it — no questions asked. After that, refunds are case-by-case.' },
          ].map(({ q, a }) => (
            <details key={q} className="faq">
              <summary>{q}</summary>
              <div className="faq-body"><p>{a}</p></div>
            </details>
          ))}
        </section>

        {/* Final CTA */}
        <section className="text-center py-20 border-t border-[#1E293B]">
          <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
            Your responses.<br /><span className="grad-text-blue">On command.</span>
          </h2>
          <p className="text-[#94A3B8] mb-8 max-w-md mx-auto text-base leading-relaxed">
            Join thousands of support reps, sales pros, and power users who have stopped typing the same things twice.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <button onClick={() => triggerCheckout('free')} className="px-8 py-3.5 rounded-xl border-2 border-[#1E293B] text-[#94A3B8] hover:border-blue-600 hover:text-white font-semibold transition-all text-sm">Start Free</button>
            <button onClick={() => triggerCheckout('pro')}  className="px-8 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-all text-sm">Upgrade to Pro →</button>
          </div>
        </section>

      </div>
    </>
  );
}
