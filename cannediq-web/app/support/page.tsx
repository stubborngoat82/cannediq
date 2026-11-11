import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Support',
  description: 'cannedIQ Help Center — setup guides, keyboard shortcuts, troubleshooting, billing help, and how to contact support.',
};

export default function SupportPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 pt-16 pb-24">

      {/* Hero */}
      <p className="text-sm font-semibold text-blue-400 uppercase tracking-widest mb-3">Help Center</p>
      <h1 className="text-4xl font-extrabold tracking-tight mb-4">
        How can we <span className="grad-text-blue">help?</span>
      </h1>
      <p className="text-[#94A3B8] text-base max-w-2xl mb-10">
        Setup guides, keyboard shortcuts, and answers to common questions. Can&apos;t find what you need?{' '}
        Email <a href="mailto:support@cannediq.com" className="text-blue-400 underline underline-offset-2">support@cannediq.com</a> and we&apos;ll get back to you within one business day.
      </p>

      <main className="prose-dark">

        {/* Quick topic cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1rem', margin: '1.5rem 0' }}
          className="max-sm:grid-cols-1">
          {[
            { href: '#getting-started', icon: '🚀', title: 'Getting Started',    desc: 'Install, sign in, and create your first command.' },
            { href: '#shortcuts',       icon: '⌨️', title: 'Keyboard Shortcuts', desc: 'Open the palette and trigger AI Reply fast.' },
            { href: '#troubleshooting', icon: '🛠️', title: 'Troubleshooting',    desc: 'Palette won\'t open, sign-in, sync, templates.' },
            { href: '#billing',         icon: '💳', title: 'Billing & Plans',    desc: 'Manage your subscription, invoices, and refunds.' },
            { href: '#teams',           icon: '👥', title: 'Teams',              desc: 'Invite members and share a team library.' },
            { href: '#contact',         icon: '✉️', title: 'Contact Us',         desc: 'Reach a human at support@cannediq.com.' },
          ].map((card) => (
            <a
              key={card.href}
              href={card.href}
              className="block bg-[#111827] border border-[#1E293B] rounded-xl p-5 no-underline transition-all hover:border-blue-500 hover:-translate-y-0.5"
            >
              <div className="text-2xl mb-2">{card.icon}</div>
              <h4 className="text-[0.95rem] font-bold text-[#F8FAFC] mb-1">{card.title}</h4>
              <p className="text-[0.8125rem] text-[#64748B] m-0 leading-snug">{card.desc}</p>
            </a>
          ))}
        </div>

        {/* Getting Started */}
        <h2 id="getting-started">Getting Started</h2>
        <ol className="list-decimal pl-5 text-[#94A3B8] space-y-2 text-[0.9375rem] leading-relaxed mb-4">
          <li><strong className="text-slate-300">Install the extension</strong> from the <a href="https://chromewebstore.google.com/detail/njfecjkiffcmgmhdomjbcfcahgajnhii" target="_blank" rel="noopener noreferrer">Chrome Web Store</a>. After installing, pin cannedIQ to your toolbar for quick access.</li>
          <li><strong className="text-slate-300">Sign in</strong> by clicking the cannedIQ icon and choosing email or <strong>Continue with Google</strong>.</li>
          <li><strong className="text-slate-300">Create a command</strong> in the options page — give it a name, a trigger, and the text to insert.</li>
          <li><strong className="text-slate-300">Use it anywhere</strong> — open the palette with the shortcut below, or type your slash trigger directly into any text field.</li>
        </ol>
        <p>For a full walkthrough of commands, variables, conditions, and Actions, see the <a href="/docs">Documentation</a>.</p>

        {/* Shortcuts */}
        <h2 id="shortcuts">Keyboard Shortcuts</h2>
        <table className="w-full border-collapse text-[0.9rem] my-5">
          <thead>
            <tr>
              {['Action', 'Windows / Linux', 'Mac', 'Description'].map((h) => (
                <th key={h} className="text-left text-[#94A3B8] font-semibold text-xs uppercase tracking-wide px-3 py-2 border-b border-[#1E293B]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="px-3 py-2.5 border-b border-[#1E293B] text-[#CBD5E1]"><strong>Open Command Palette</strong></td>
              <td className="px-3 py-2.5 border-b border-[#1E293B]"><kbd>Ctrl</kbd> + <kbd>Space</kbd></td>
              <td className="px-3 py-2.5 border-b border-[#1E293B]"><kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>Space</kbd></td>
              <td className="px-3 py-2.5 border-b border-[#1E293B] text-[#94A3B8]">Search and launch any command</td>
            </tr>
            <tr>
              <td className="px-3 py-2.5 text-[#CBD5E1]"><strong>Open AI Reply</strong></td>
              <td className="px-3 py-2.5"><kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>R</kbd></td>
              <td className="px-3 py-2.5"><kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>R</kbd></td>
              <td className="px-3 py-2.5 text-[#94A3B8]">Generate an AI-assisted reply</td>
            </tr>
          </tbody>
        </table>
        <p>Shortcuts can be customized at any time. Open <code className="bg-[#1E293B] px-1.5 py-0.5 rounded text-sm text-slate-300">chrome://extensions/shortcuts</code> in your address bar, find cannedIQ, and set keys that work for you.</p>

        {/* Troubleshooting */}
        <h2 id="troubleshooting">Troubleshooting</h2>

        <details className="faq">
          <summary>The command palette won&apos;t open with the keyboard shortcut</summary>
          <div className="faq-body">
            <p>Chrome keyboard shortcuts can collide with other extensions or the operating system. To check and reassign:</p>
            <ol>
              <li>Open <code>chrome://extensions/shortcuts</code>.</li>
              <li>Find <strong>cannedIQ — Command Launcher</strong>.</li>
              <li>If the shortcut is blank or conflicting, click the field and press a new key combination.</li>
              <li>Make sure the scope is set to <strong>In Chrome</strong> (or <strong>Global</strong> if you want it to work outside the browser).</li>
            </ol>
            <p>You can also open the palette by clicking the cannedIQ toolbar icon. If a page still doesn&apos;t respond, reload the tab — content scripts don&apos;t attach to tabs that were already open when the extension was installed or updated.</p>
          </div>
        </details>

        <details className="faq">
          <summary>I can&apos;t sign in with Google</summary>
          <div className="faq-body">
            <p>Try these steps in order:</p>
            <ul>
              <li>Make sure pop-ups aren&apos;t blocked — Google sign-in opens a secure window.</li>
              <li>If the window closes immediately, sign out of conflicting Google sessions, then choose your account again from the picker.</li>
              <li>As an alternative, sign in with your email and password instead.</li>
            </ul>
            <p>If it still fails, email us at <a href="mailto:support@cannediq.com">support@cannediq.com</a> with the error message you see.</p>
          </div>
        </details>

        <details className="faq">
          <summary>My commands aren&apos;t syncing across devices</summary>
          <div className="faq-body">
            <p>Commands sync to your account when you&apos;re signed in. If a device looks out of date:</p>
            <ul>
              <li>Confirm you&apos;re signed in to the <em>same account</em> on both devices.</li>
              <li>Open the extension&apos;s options page — it refreshes from the server on load.</li>
              <li>Check your connection; offline edits sync once you&apos;re back online.</li>
            </ul>
          </div>
        </details>

        <details className="faq">
          <summary>I bought a template pack but the commands didn&apos;t appear</summary>
          <div className="faq-body">
            <p>Purchased packs apply automatically the next time you open the extension. If they don&apos;t show up right away:</p>
            <ol>
              <li>Open the extension and go to the <strong>Templates</strong> tab.</li>
              <li>Find your purchased pack and click <strong>Re-apply</strong>.</li>
              <li>Your commands will be added under a stack named after the pack.</li>
            </ol>
            <p>Payment confirmation can take a few moments to process. If a pack you paid for still shows as locked after a few minutes, contact <a href="mailto:support@cannediq.com">support@cannediq.com</a> with your purchase email and we&apos;ll unlock it manually.</p>
          </div>
        </details>

        <details className="faq">
          <summary>My plan upgraded but the extension still shows the old plan</summary>
          <div className="faq-body">
            <p>The extension checks for plan changes automatically while the options page is open, and updates within about 30 seconds. To force a refresh, close and reopen the options page, or sign out and back in.</p>
          </div>
        </details>

        <details className="faq">
          <summary>AI commands say I&apos;ve hit my limit</summary>
          <div className="faq-body">
            <p>AI usage is metered per month based on your plan. Your remaining quota resets at the start of each billing period. To raise your limit, upgrade your plan on the <a href="/pricing">Pricing</a> page or from the Billing tab in the extension.</p>
          </div>
        </details>

        {/* Billing */}
        <h2 id="billing">Billing &amp; Plans</h2>
        <p>Manage everything about your subscription — payment method, invoices, plan changes, and cancellation — from the secure Stripe customer portal. Open the extension, go to the <strong>Billing</strong> tab, and click <strong>Manage subscription</strong>.</p>

        <details className="faq">
          <summary>How do I cancel my subscription?</summary>
          <div className="faq-body">
            <p>Open the <strong>Billing</strong> tab in the extension → <strong>Manage subscription</strong> → <strong>Cancel plan</strong>. Your plan stays active until the end of the current billing period, after which you&apos;ll move to the free tier. Your saved commands are never deleted when you downgrade.</p>
          </div>
        </details>

        <details className="faq">
          <summary>Where can I find my invoices and receipts?</summary>
          <div className="faq-body">
            <p>All invoices and receipts are available in the Stripe customer portal (Billing tab → Manage subscription). Receipts are also emailed to you automatically after each payment.</p>
          </div>
        </details>

        <details className="faq">
          <summary>What&apos;s your refund policy?</summary>
          <div className="faq-body">
            <p>If something isn&apos;t working as expected, reach out to <a href="mailto:support@cannediq.com">support@cannediq.com</a> and we&apos;ll make it right. See our <a href="/terms">Terms of Service</a> for full details.</p>
          </div>
        </details>

        {/* Teams */}
        <h2 id="teams">Teams</h2>
        <p>On the Team plan, the team owner can provision member accounts, share a team command library, and manage seats. Members see shared team commands alongside their own personal commands.</p>

        <details className="faq">
          <summary>How do I add or remove team members?</summary>
          <div className="faq-body">
            <p>Team owners manage members from the <strong>Teams</strong> tab in the extension (visible only on the Team plan). From there you can provision a new member, reset a member&apos;s temporary password, or remove a member. Newly provisioned members are prompted to set their own password on first sign-in.</p>
          </div>
        </details>

        <details className="faq">
          <summary>Can team owners see my personal commands?</summary>
          <div className="faq-body">
            <p>No. Team owners can only see commands shared to the team library — never your personal commands. See the <a href="/privacy">Privacy Policy</a> for details.</p>
          </div>
        </details>

        {/* Contact */}
        <h2 id="contact">Still need help?</h2>
        <p>We&apos;re a small team and we read every message. Email us and we&apos;ll respond within one business day.</p>
        <div className="info-box">
          <p>
            <strong className="text-slate-200">cannedIQ Support</strong><br />
            General help: <a href="mailto:support@cannediq.com">support@cannediq.com</a><br />
            Billing questions: <a href="mailto:support@cannediq.com">support@cannediq.com</a><br />
            Security reports: <a href="mailto:security@cannediq.com">security@cannediq.com</a><br />
            Privacy requests: <a href="mailto:privacy@cannediq.com">privacy@cannediq.com</a>
          </p>
        </div>
        <p>When emailing about a problem, it helps to include your account email, your browser and OS, and a short description of what you expected versus what happened.</p>

      </main>
    </div>
  );
}
