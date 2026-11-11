'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

// Palette mockup items
const PALETTE_ITEMS = [
  { icon: '✉', color: 'rgba(59,130,246,.15)', name: 'Follow Up',    desc: 'Quick follow-up after a meeting or demo',     trigger: '/fu',       badge: 'Var',    badgeClass: 'bg-emerald-500/15 text-emerald-400' },
  { icon: '🙏', color: 'rgba(16,185,129,.12)', name: 'Thank You',    desc: 'Warm thank-you after a conversation',         trigger: ';;thanks',  badge: 'Static', badgeClass: 'bg-[#64748B]/20 text-[#94A3B8]' },
  { icon: '⚡', color: 'rgba(245,158,11,.12)', name: 'AI Reply',     desc: 'Generate reply from selected text',           trigger: '/ai-reply', badge: 'AI',     badgeClass: 'bg-yellow-500/15 text-yellow-300' },
  { icon: '👋', color: 'rgba(139,92,246,.12)', name: 'Introduction', desc: 'Professional intro with your role and links', trigger: '/intro',    badge: 'Static', badgeClass: 'bg-[#64748B]/20 text-[#94A3B8]' },
];

const FEATURES = [
  { icon: '⚡', color: 'rgba(59,130,246,.15)',  title: 'Commands',      body: 'Save reusable responses, prompts, and workflows as named commands. Launch them anywhere with a trigger.' },
  { icon: '⌨', color: 'rgba(99,102,241,.15)',   title: 'Triggers',      body: 'Fire commands your way.', chips: ['/slash',';;expand','Ctrl+Space','Right-click'] },
  { icon: '🗂', color: 'rgba(139,92,246,.15)',  title: 'Stacks',        body: 'Organize commands by workflow, client, team, or any context. Switch stacks in the palette with one click.', pills: ['💼 Sales','🎧 Support','👤 Personal'] },
  { icon: '✦', color: 'rgba(16,185,129,.15)',   title: 'Variables',     body: 'Personalize replies on the fly. cannedIQ prompts you to fill in placeholders before inserting.', code: 'Hi {{name}}, following up on {{topic}}…' },
  { icon: '🔍', color: 'rgba(245,158,11,.15)',  title: 'Context Engine', body: 'Commands can pull live context automatically — no manual copy/paste needed.', vars: ['{{selectedText}}','{{pageTitle}}','{{clipboard}}','{{currentUrl}}'] },
  { icon: '🤖', color: 'rgba(139,92,246,.2)',   title: 'AI Commands',   body: 'Generate smarter replies from saved prompts and page context. Available on Pro and Team — no API key needed.', ai: true },
];

const CMD_EXAMPLES = [
  { trigger: '/fu',       badge: 'Variable', badgeClass: 'bg-emerald-500/15 text-emerald-400', title: 'Follow Up',        desc: 'Follow up with a lead after a demo or call. Prompts for their name and the talking point.', stack: '💼 Sales' },
  { trigger: ';;thanks',  badge: 'Static',   badgeClass: 'bg-[#64748B]/20 text-[#94A3B8]',    title: 'Thank You',        desc: 'A warm, genuine thank-you for someone\'s time. Types instantly with text expansion.',         stack: '👤 Personal' },
  { trigger: '/decline',  badge: 'Static',   badgeClass: 'bg-[#64748B]/20 text-[#94A3B8]',    title: 'Polite Decline',   desc: 'Gracefully decline a request, partnership pitch, or cold outreach without burning a bridge.',  stack: '💼 Sales' },
  { trigger: '/support',  badge: 'Variable', badgeClass: 'bg-emerald-500/15 text-emerald-400', title: 'Customer Support', desc: 'Empathetic support reply with issue acknowledgment and next steps. Variables for issue type.', stack: '🎧 Support' },
  { trigger: '/intro',    badge: 'Static',   badgeClass: 'bg-[#64748B]/20 text-[#94A3B8]',    title: 'Introduction',     desc: 'A crisp professional intro with your role, company, and links. Ready to paste in seconds.',   stack: '👤 Personal' },
  { trigger: '/ai-reply', badge: 'AI',       badgeClass: 'bg-yellow-500/15 text-yellow-300',   title: 'AI Reply',         desc: 'Select any message, fire /ai-reply, and get a polished response generated instantly.',      stack: '⚡ AI', ai: true },
];

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center justify-center bg-[#1E293B] border border-white/10 border-b-2 rounded-[5px] px-[7px] font-mono text-[11px] text-[#94A3B8] leading-[1.6] whitespace-nowrap" style={{ borderBottomColor: 'rgba(255,255,255,.08)' }}>
      {children}
    </span>
  );
}

export default function HomePage() {
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [waitlistState, setWaitlistState] = useState<'idle' | 'loading' | 'done'>('idle');
  const revealRef = useRef<HTMLDivElement>(null);

  // Scroll reveal
  useEffect(() => {
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } }),
      { threshold: 0.1 }
    );
    document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  function handleWaitlist(e: React.FormEvent) {
    e.preventDefault();
    if (!waitlistEmail) return;
    setWaitlistState('loading');
    // Wire to real endpoint (Mailchimp, ConvertKit, etc.) when ready
    setTimeout(() => { setWaitlistState('done'); setWaitlistEmail(''); }, 800);
  }

  return (
    <div className="overflow-x-hidden">

      {/* ── Hero ── */}
      <section className="relative pt-36 pb-24 grid-bg overflow-hidden">
        {/* Background orbs */}
        <div className="absolute top-20 left-1/4 w-96 h-96 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(59,130,246,.08) 0%, transparent 70%)' }} />
        <div className="absolute top-40 right-1/4 w-80 h-80 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(139,92,246,.07) 0%, transparent 70%)' }} />

        <div className="max-w-6xl mx-auto px-6 relative">
          <div className="flex flex-col lg:flex-row items-center gap-16">

            {/* Copy */}
            <div className="flex-1 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 mb-5 bg-white/[0.04] border border-white/[0.08] rounded-full px-3.5 py-1.5 text-sm text-[#94A3B8]">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                Chrome Extension · Manifest V3
              </div>
              <h1 className="font-display font-bold leading-tight mb-6" style={{ fontSize: 'clamp(2.4rem, 5.5vw, 3.6rem)' }}>
                Your responses.<br />
                <span className="grad-text">On command.</span>
              </h1>
              <p className="text-[#94A3B8] text-lg leading-relaxed mb-8 max-w-lg mx-auto lg:mx-0">
                Save, organize, and launch your most-used replies instantly with triggers, shortcuts, and AI-powered commands — without leaving the page.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
                <a
                  href="https://chromewebstore.google.com/detail/njfecjkiffcmgmhdomjbcfcahgajnhii"
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-semibold px-6 py-3.5 rounded-xl text-[15px] transition-all hover:opacity-90 hover:-translate-y-px"
                  style={{ boxShadow: '0 4px 20px rgba(99,102,241,.3)' }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C8.21 0 4.831 1.757 2.632 4.501l3.953 6.848A5.454 5.454 0 0 1 12 6.545h10.691A12 12 0 0 0 12 0zM1.931 5.47A11.943 11.943 0 0 0 0 12c0 6.012 4.42 10.991 10.189 11.864l3.953-6.847a5.45 5.45 0 0 1-6.865-2.29zm13.342 2.166a5.446 5.446 0 0 1 1.45 7.09l.002.001h-.002l-5.344 9.257c.206.01.413.016.621.016 6.627 0 12-5.373 12-12 0-1.54-.29-3.011-.818-4.364zM12 13.636a1.636 1.636 0 1 1 0-3.272 1.636 1.636 0 0 1 0 3.272z" /></svg>
                  Add to Chrome — It&apos;s free
                </a>
                <a href="#how-it-works" className="inline-flex items-center justify-center gap-2 bg-white/5 border border-white/10 text-[#94A3B8] hover:bg-white/8 hover:text-[#E2E8F0] font-medium px-6 py-3.5 rounded-xl text-[15px] transition-all">
                  See how it works
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
                </a>
              </div>
              <p className="mt-6 text-xs text-[#94A3B8]/60 flex items-center gap-2 justify-center lg:justify-start flex-wrap">
                Press <Kbd>Ctrl</Kbd><Kbd>Shift</Kbd><Kbd>Space</Kbd> anywhere to open the palette
              </p>
            </div>

            {/* Palette mockup */}
            <div className="flex-1 flex justify-center lg:justify-end w-full">
              <div className="w-full max-w-[520px] bg-[#111827] border border-white/10 rounded-2xl overflow-hidden glow-dual"
                style={{ boxShadow: '0 32px 80px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.04), 0 0 60px -15px rgba(99,102,241,.4)', transform: 'perspective(1200px) rotateY(-3deg) rotateX(2deg)' }}>
                {/* Search */}
                <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-white/[0.07]">
                  <span className="text-[#4B5563] text-[15px] shrink-0">⌕</span>
                  <div className="flex-1 font-mono text-[14px] text-[#E2E8F0]">
                    <span className="text-[#4B5563]">/</span><span className="text-[#93C5FD]">fu</span><span className="animate-pulse text-blue-400">|</span>
                  </div>
                  <Kbd>Esc</Kbd>
                </div>
                {/* Chips */}
                <div className="flex gap-1.5 px-3.5 py-2 border-b border-white/[0.05] overflow-x-auto">
                  {['All','💼 Sales','🎧 Support','👤 Personal','🤖 AI'].map((c, i) => (
                    <span key={c} className={`px-2.5 py-[3px] rounded-full text-[11.5px] font-medium border whitespace-nowrap ${i === 0 ? 'bg-indigo-500/20 border-indigo-500/40 text-[#A5B4FC]' : 'border-white/10 text-[#64748B]'}`}>{c}</span>
                  ))}
                </div>
                {/* Items */}
                <div className="p-1.5">
                  {PALETTE_ITEMS.map((item, i) => (
                    <div key={item.name} className={`flex items-center justify-between px-2.5 py-2 rounded-lg gap-2.5 ${i === 0 ? 'bg-blue-500/12' : ''}`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-[30px] h-[30px] rounded-[7px] flex items-center justify-center text-[13px] shrink-0" style={{ background: item.color }}>{item.icon}</div>
                        <div className="min-w-0">
                          <div className="text-[13px] font-medium text-[#E2E8F0]">{item.name}</div>
                          <div className="text-[11.5px] text-[#64748B] truncate">{item.desc}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="font-mono text-[11px] text-[#93C5FD] bg-blue-500/12 border border-blue-500/20 rounded px-1.5 py-px">{item.trigger}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-px rounded uppercase tracking-wide ${item.badgeClass}`}>{item.badge}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Footer */}
                <div className="flex items-center justify-between px-3.5 py-2 border-t border-white/[0.05]">
                  <span className="text-[10.5px] text-[#374151]">↑↓ navigate · ↵ launch · Esc close</span>
                  <span className="text-[10.5px] text-[#374151]">4 of 24 commands</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── Use case strip ── */}
      <section className="py-10 border-y border-white/5" style={{ background: 'rgba(255,255,255,.02)' }}>
        <div className="max-w-6xl mx-auto px-6">
          <p className="text-center text-xs text-[#94A3B8]/50 uppercase tracking-widest mb-5 font-medium">Used by teams across</p>
          <div className="flex flex-wrap justify-center gap-3">
            {[['#3B82F6','Sales teams'],['#8B5CF6','Support reps'],['#10B981','Creators'],['#F59E0B','Recruiters'],['#EC4899','Founders'],['#6366F1','Daily browser workflows']].map(([color, label]) => (
              <div key={label} className="inline-flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.08] rounded-full px-3.5 py-1.5 text-sm text-[#94A3B8]">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                {label}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Problem ── */}
      <section className="py-28 relative">
        <div className="max-w-4xl mx-auto px-6 text-center reveal">
          <h2 className="font-display font-bold text-4xl md:text-5xl mb-6 leading-tight">
            Stop rewriting<br /><span className="grad-text">the same response.</span>
          </h2>
          <p className="text-[#94A3B8] text-lg leading-relaxed mb-12 max-w-2xl mx-auto">
            Whether you&apos;re answering leads, replying to customers, sending follow-ups, or managing daily communication — cannedIQ keeps your best responses ready to launch.
          </p>
          <div className="grid sm:grid-cols-2 gap-4 max-w-xl mx-auto text-left">
            {[
              'Digging through notes and docs to find that one response',
              'Copy/paste chaos across five different tabs',
              'Rewriting the same message from scratch every time',
              'Breaking your flow to context-switch for a reply',
            ].map(txt => (
              <div key={txt} className="flex items-start gap-3 bg-[#111827] border border-white/[0.06] rounded-xl p-5">
                <span className="text-red-400 mt-0.5 shrink-0">✕</span>
                <span className="text-[#94A3B8] text-sm">{txt}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-28 relative">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16 reveal">
            <p className="text-blue-400 text-sm font-semibold uppercase tracking-widest mb-3">Features</p>
            <h2 className="font-display font-bold text-4xl md:text-5xl leading-tight">
              Built like a command center<br /><span className="grad-text">for your replies.</span>
            </h2>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f, i) => (
              <div key={f.title} className="reveal bg-[#111827] border border-white/[0.06] rounded-xl p-6 transition-all hover:border-blue-500/25 hover:shadow-[0_0_30px_-5px_rgba(59,130,246,.1)]" style={{ transitionDelay: `${i * 0.05}s`, ...(f.ai ? { borderColor: 'rgba(139,92,246,.2)' } : {}) }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 text-xl" style={{ background: f.color }}>{f.icon}</div>
                <h3 className="font-display font-semibold text-[#F8FAFC] text-lg mb-2">{f.title}</h3>
                <p className="text-[#94A3B8] text-sm leading-relaxed mb-3">{f.body}</p>
                {f.chips && (
                  <div className="flex flex-wrap gap-2">
                    {f.chips.map(c => <Kbd key={c}>{c}</Kbd>)}
                  </div>
                )}
                {f.pills && (
                  <div className="flex gap-2 mt-3 flex-wrap">
                    {f.pills.map(p => <span key={p} className="bg-white/[0.04] border border-white/[0.08] rounded-full px-2.5 py-1 text-xs text-[#94A3B8]">{p}</span>)}
                  </div>
                )}
                {f.code && (
                  <code className="text-xs text-emerald-400/80 font-mono bg-emerald-400/5 border border-emerald-400/10 rounded-md px-3 py-1.5 block">{f.code}</code>
                )}
                {f.vars && (
                  <div className="flex flex-wrap gap-1.5">
                    {f.vars.map(v => <span key={v} className="font-mono text-[11px] text-[#93C5FD] bg-blue-500/12 border border-blue-500/20 rounded px-1.5 py-px">{v}</span>)}
                  </div>
                )}
                {f.ai && <p className="text-xs text-violet-400 mt-3 flex items-center gap-1"><span>⚡</span> Powered by GPT-4o mini</p>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className="py-28 border-y border-white/5" style={{ background: 'rgba(255,255,255,.02)' }}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16 reveal">
            <p className="text-violet-400 text-sm font-semibold uppercase tracking-widest mb-3">How it works</p>
            <h2 className="font-display font-bold text-4xl md:text-5xl leading-tight">
              From thought to response<br /><span className="grad-text">in seconds.</span>
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8 reveal">
            {[
              { n: '1', gradient: 'linear-gradient(135deg,#3B82F6,#6366F1)', glow: 'rgba(99,102,241,.4)', title: 'Create a Command', body: 'Save your response, AI prompt, or multi-step workflow in the cannedIQ options page. Give it a name and a stack.' },
              { n: '2', gradient: 'linear-gradient(135deg,#6366F1,#8B5CF6)', glow: 'rgba(139,92,246,.4)', title: 'Assign a Trigger',  body: 'Choose how to fire it: a slash command, text shortcut, the palette, or right-click.', chips: ['/followup',';;thanks'] },
              { n: '3', gradient: 'linear-gradient(135deg,#8B5CF6,#EC4899)', glow: 'rgba(236,72,153,.3)', title: 'Launch Anywhere',  body: 'Insert, personalize, or AI-generate your response directly into any text field — Gmail, LinkedIn, HubSpot, Notion, anywhere.' },
            ].map(step => (
              <div key={step.n} className="text-center relative">
                <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg mx-auto mb-5 relative z-10" style={{ background: step.gradient, boxShadow: `0 0 24px ${step.glow}` }}>
                  {step.n}
                </div>
                <h3 className="font-display font-semibold text-xl text-[#F8FAFC] mb-3">{step.title}</h3>
                <p className="text-[#94A3B8] text-sm leading-relaxed mb-4">{step.body}</p>
                {step.chips && (
                  <div className="flex justify-center gap-2 flex-wrap">
                    {step.chips.map(c => <Kbd key={c}>{c}</Kbd>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Command examples ── */}
      <section className="py-28">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14 reveal">
            <p className="text-blue-400 text-sm font-semibold uppercase tracking-widest mb-3">Examples</p>
            <h2 className="font-display font-bold text-4xl md:text-5xl leading-tight">
              Commands for every<br /><span className="grad-text">conversation.</span>
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {CMD_EXAMPLES.map((c, i) => (
              <div key={c.trigger} className={`reveal bg-[#111827] border rounded-xl p-5 transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(0,0,0,.3),0_0_20px_-5px_rgba(99,102,241,.2)] ${c.ai ? 'border-violet-500/20' : 'border-white/[0.07]'}`} style={{ transitionDelay: `${i * 0.05}s` }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="font-mono text-[11px] text-[#93C5FD] bg-blue-500/12 border border-blue-500/20 rounded px-1.5 py-px">{c.trigger}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-px rounded uppercase tracking-wide ${c.badgeClass}`}>{c.badge}</span>
                </div>
                <h3 className="font-semibold text-[#F8FAFC] mb-1">{c.title}</h3>
                <p className="text-[#94A3B8] text-sm leading-relaxed">{c.desc}</p>
                <div className={`mt-3 pt-3 border-t border-white/5 text-xs flex items-center gap-1.5 ${c.ai ? 'text-violet-400' : 'text-[#94A3B8]/50'}`}>
                  {c.stack}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── AI section ── */}
      <section id="ai" className="py-28 relative border-t border-violet-500/8" style={{ background: 'rgba(139,92,246,.03)' }}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="reveal">
              <p className="text-violet-400 text-sm font-semibold uppercase tracking-widest mb-3">AI Commands</p>
              <h2 className="font-display font-bold text-4xl md:text-5xl leading-tight mb-6">
                AI when you want it.<br /><span className="grad-text">Control when you need it.</span>
              </h2>
              <p className="text-[#94A3B8] text-lg leading-relaxed mb-8">
                cannedIQ keeps canned responses fast and reliable, while AI Commands help you rewrite, personalize, summarize, or respond based on exactly what&apos;s on your screen.
              </p>
              <ul className="space-y-4">
                {[
                  'AI off by default — opt in per command, not globally',
                  'You write the prompt — cannedIQ just executes it',
                  'Context-aware: selected text, page title, active field, clipboard',
                  'No API key to manage — included on Pro and Team plans',
                ].map(item => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="text-violet-400 mt-0.5 shrink-0">✓</span>
                    <span className="text-[#94A3B8]">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* AI mockup card */}
            <div className="reveal" style={{ transitionDelay: '.1s' }}>
              <div className="glass rounded-2xl p-6 glow-violet">
                <div className="flex items-center gap-2 mb-5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" /><div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" /><div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
                  <span className="ml-2 text-xs text-[#94A3B8]/40 font-mono">AI command · /ai-reply</span>
                </div>
                <div className="mb-4">
                  <p className="text-xs text-[#94A3B8]/50 mb-1.5 uppercase tracking-wider font-medium">AI Prompt</p>
                  <div className="bg-black/30 rounded-lg p-3 font-mono text-sm text-emerald-400/80 border border-white/5">
                    Rewrite in a professional tone:<br /><span className="text-violet-400">{'{{inputText}}'}</span>
                  </div>
                </div>
                <div className="mb-4">
                  <p className="text-xs text-[#94A3B8]/50 mb-1.5 uppercase tracking-wider font-medium">Context captured</p>
                  <div className="flex flex-wrap gap-2">
                    {['Gmail','activeInputText ✓','siteName ✓'].map(t => <span key={t} className="font-mono text-[11px] text-[#93C5FD] bg-blue-500/12 border border-blue-500/20 rounded px-1.5 py-px">{t}</span>)}
                  </div>
                </div>
                <div className="border-t border-white/5 pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-[#94A3B8]/50 uppercase tracking-wider font-medium">Output</p>
                    <span className="text-xs text-violet-400">⚡ Generated · 0.8s</span>
                  </div>
                  <div className="bg-black/30 rounded-lg p-3 text-sm text-[#F8FAFC]/80 border border-white/5 leading-relaxed">
                    &ldquo;Thank you for your feedback. I appreciate you bringing this to my attention and will work to address your concerns promptly…&rdquo;
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
                  <span className="text-xs text-[#94A3B8]/40">Pro plan · 18 of 100 requests used</span>
                  <div className="flex-1 mx-4 h-1 rounded-full bg-white/5">
                    <div className="h-full rounded-full w-[72%]" style={{ background: 'linear-gradient(90deg, #3B82F6, #8B5CF6)' }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Privacy ── */}
      <section id="privacy" className="py-28">
        <div className="max-w-4xl mx-auto px-6 text-center reveal">
          <div className="w-14 h-14 rounded-2xl mx-auto mb-6 flex items-center justify-center text-2xl" style={{ background: 'rgba(16,185,129,.12)', border: '1px solid rgba(16,185,129,.2)' }}>🔒</div>
          <h2 className="font-display font-bold text-4xl md:text-5xl leading-tight mb-6">
            Built for speed.<br /><span className="grad-text-blue">Designed with privacy.</span>
          </h2>
          <p className="text-[#94A3B8] text-lg leading-relaxed mb-10 max-w-2xl mx-auto">
            cannedIQ stores your commands locally unless you choose to sync. You control what context is captured and when — nothing is collected without your explicit action.
          </p>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { icon: '🏠', title: 'Local-first',        body: 'Commands stored on your device. Cloud sync is optional and requires sign-in.' },
              { icon: '🎛', title: 'You control context', body: 'Clipboard access, selected text, and page data are never captured without a command trigger.' },
              { icon: '🚫', title: 'No tracking',         body: 'No analytics, no ad network, no selling your data. Your responses are yours.' },
            ].map(c => (
              <div key={c.title} className="bg-[#111827] border border-white/[0.06] rounded-xl p-6 text-center">
                <div className="text-2xl mb-3">{c.icon}</div>
                <h3 className="font-semibold text-[#F8FAFC] mb-2">{c.title}</h3>
                <p className="text-[#94A3B8] text-sm">{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA + waitlist ── */}
      <section className="py-28 relative overflow-hidden border-t border-indigo-500/10" style={{ background: 'rgba(99,102,241,.04)' }}>
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full" style={{ background: 'radial-gradient(circle, rgba(99,102,241,.12) 0%, transparent 70%)' }} />
        </div>
        <div className="max-w-3xl mx-auto px-6 text-center relative reveal">
          <div className="inline-flex items-center gap-2 mb-6 bg-white/[0.04] border border-white/[0.08] rounded-full px-3.5 py-1.5 text-sm text-[#94A3B8]">
            <span>⚡</span> Free to install
          </div>
          <h2 className="font-display font-bold leading-tight mb-6" style={{ fontSize: 'clamp(2.4rem, 5vw, 3.5rem)' }}>
            Type less.<br /><span className="grad-text">Execute more.</span>
          </h2>
          <p className="text-[#94A3B8] text-lg mb-10 max-w-xl mx-auto">
            Install cannedIQ in 30 seconds. Start launching responses in 60.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <a href="https://chromewebstore.google.com/detail/njfecjkiffcmgmhdomjbcfcahgajnhii" target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-semibold px-7 py-3.5 rounded-xl text-[15px] transition-all hover:opacity-90">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C8.21 0 4.831 1.757 2.632 4.501l3.953 6.848A5.454 5.454 0 0 1 12 6.545h10.691A12 12 0 0 0 12 0zM1.931 5.47A11.943 11.943 0 0 0 0 12c0 6.012 4.42 10.991 10.189 11.864l3.953-6.847a5.45 5.45 0 0 1-6.865-2.29zm13.342 2.166a5.446 5.446 0 0 1 1.45 7.09l.002.001h-.002l-5.344 9.257c.206.01.413.016.621.016 6.627 0 12-5.373 12-12 0-1.54-.29-3.011-.818-4.364zM12 13.636a1.636 1.636 0 1 1 0-3.272 1.636 1.636 0 0 1 0 3.272z" /></svg>
              Add cannedIQ to Chrome
            </a>
            <a href="#waitlist" className="inline-flex items-center justify-center gap-2 bg-white/5 border border-white/10 text-[#94A3B8] hover:text-[#E2E8F0] font-medium px-7 py-3.5 rounded-xl text-[15px] transition-all">
              Join the waitlist
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
            </a>
          </div>

          {/* Waitlist form */}
          <div id="waitlist" className="glass rounded-2xl p-8 max-w-md mx-auto" ref={revealRef}>
            <h3 className="font-display font-semibold text-[#F8FAFC] text-lg mb-2">Join the waitlist</h3>
            <p className="text-[#94A3B8] text-sm mb-5">Get early access and updates when new features ship.</p>
            {waitlistState === 'done' ? (
              <p className="text-sm text-emerald-400 font-medium">✓ You&apos;re on the list — we&apos;ll be in touch!</p>
            ) : (
              <form onSubmit={handleWaitlist} className="flex flex-col gap-3">
                <input
                  type="email"
                  value={waitlistEmail}
                  onChange={e => setWaitlistEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="px-4 py-3 rounded-xl text-[15px] text-[#F8FAFC] placeholder:text-[#475569] outline-none transition-all"
                  style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)' }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,.5)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,.15)'; }}
                  onBlur={e  => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.1)'; e.currentTarget.style.boxShadow = ''; }}
                />
                <button type="submit" disabled={waitlistState === 'loading'}
                  className="inline-flex items-center justify-center bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-semibold py-3 rounded-xl text-[15px] transition-all hover:opacity-90 disabled:opacity-50">
                  {waitlistState === 'loading' ? 'Joining…' : 'Get early access →'}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

    </div>
  );
}
