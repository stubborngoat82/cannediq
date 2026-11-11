'use client';

import { useEffect, useState } from 'react';

const CHROME_STORE = 'https://chromewebstore.google.com/detail/njfecjkiffcmgmhdomjbcfcahgajnhii';

const NAV_SECTIONS = [
  { group: 'Getting Started', links: [
    { id: 'overview',   label: 'Overview' },
    { id: 'quickstart', label: 'Quick Start' },
    { id: 'shortcuts',  label: 'Keyboard Shortcuts' },
  ]},
  { group: 'Commands', links: [
    { id: 'commands',    label: 'Creating Commands' },
    { id: 'static',     label: 'Static Templates' },
    { id: 'ai-commands', label: 'AI Commands' },
    { id: 'stacks',     label: 'Stacks' },
  ]},
  { group: 'Variables', links: [
    { id: 'variables',    label: 'How Variables Work' },
    { id: 'dynamic-vars', label: 'Dynamic Variables' },
    { id: 'custom-vars',  label: 'Custom Variables' },
  ]},
  { group: 'Triggers', links: [
    { id: 'triggers',      label: 'How Triggers Work' },
    { id: 'slash-trigger', label: 'Slash Text Triggers' },
    { id: 'conditions',    label: 'Conditions' },
  ]},
  { group: 'Actions', links: [
    { id: 'actions',         label: 'Action Types' },
    { id: 'action-examples', label: 'Action Examples' },
  ]},
  { group: 'Examples', links: [
    { id: 'ex-support',    label: 'Support Teams' },
    { id: 'ex-sales',      label: 'Sales Outreach' },
    { id: 'ex-recruiting', label: 'Recruiting' },
    { id: 'ex-dev',        label: 'Developers' },
  ]},
];

function IC({ children }: { children: React.ReactNode }) {
  return <span className="inline-code">{children}</span>;
}
function CB({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={`code-block${className ? ' ' + className : ''}`}>{children}</div>;
}
function Callout({ type, children }: { type: 'blue' | 'green' | 'amber' | 'violet'; children: React.ReactNode }) {
  return <div className={`callout callout-${type}`}>{children}</div>;
}
function ExCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="example-card">
      <div className="example-card-title">{title}</div>
      {children}
    </div>
  );
}

export default function DocsPage() {
  const [activeId, setActiveId] = useState('overview');

  useEffect(() => {
    const allIds = NAV_SECTIONS.flatMap((s) => s.links.map((l) => l.id));
    const els = allIds.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];

    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActiveId(e.target.id);
        });
      },
      { rootMargin: '-20% 0px -70% 0px' },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-6 flex gap-8 pt-10 pb-24">

      {/* Sidebar */}
      <aside className="hidden lg:block w-56 shrink-0">
        <div className="sticky top-20 max-h-[calc(100vh-5.5rem)] overflow-y-auto pr-2">
          {NAV_SECTIONS.map((section) => (
            <div key={section.group}>
              <div className="sidebar-group">{section.group}</div>
              {section.links.map((link) => (
                <a
                  key={link.id}
                  href={`#${link.id}`}
                  className={`sidebar-link${activeId === link.id ? ' active' : ''}`}
                >
                  {link.label}
                </a>
              ))}
            </div>
          ))}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 max-w-3xl">

        {/* Hero */}
        <div className="mb-10">
          <p className="text-sm font-semibold text-blue-400 uppercase tracking-widest mb-3">Documentation</p>
          <h1 className="text-4xl font-extrabold tracking-tight mb-4">
            cannedIQ <span className="grad-text-blue">User Guide</span>
          </h1>
          <p className="text-[#94A3B8] text-base leading-relaxed max-w-xl">
            Everything you need to create powerful commands, automate repetitive typing, and let AI draft responses for you — on any webpage.
          </p>
        </div>

        {/* ── OVERVIEW ── */}
        <h2 id="overview" className="doc-h2">Overview</h2>
        <p className="doc-p">cannedIQ is a Chrome Extension that stores your text snippets, templates, and AI prompts and inserts them into any text field on any webpage — emails, support tickets, LinkedIn messages, GitHub comments, Slack, and more.</p>
        <p className="doc-p">There are three core building blocks:</p>
        <ul className="doc-ul">
          <li><strong className="text-slate-200">Commands</strong> — a saved response, template, or AI prompt you can launch at any time.</li>
          <li><strong className="text-slate-200">Stacks</strong> — folders that group related commands together.</li>
          <li><strong className="text-slate-200">Variables</strong> — placeholders like <IC>{'{{today}}'}</IC> or <IC>{'{{firstName}}'}</IC> that make templates dynamic.</li>
        </ul>

        {/* ── QUICKSTART ── */}
        <h2 id="quickstart" className="doc-h2">Quick Start</h2>
        <p className="doc-p">Getting your first command running takes about 60 seconds:</p>
        <ol className="doc-ul list-decimal">
          <li>Click the cannedIQ icon in your Chrome toolbar to open <strong className="text-slate-200">Options</strong>.</li>
          <li>Click <strong className="text-slate-200">+ New Command</strong> in the Commands tab.</li>
          <li>Give it a name, write your template text, and save.</li>
          <li>Navigate to any webpage with a text field, click into it, and press <kbd>Ctrl</kbd>+<kbd>Space</kbd> (or <kbd>⌘</kbd>+<kbd>Space</kbd> on Mac).</li>
          <li>Find your command, press <kbd>Enter</kbd> — done.</li>
        </ol>
        <Callout type="blue">
          💡 <strong>Tip:</strong> You can also trigger commands by typing a slash keyword directly in any text field (e.g. <IC>/thanks</IC>) and pressing <kbd>Tab</kbd> or <kbd>Space</kbd>.
        </Callout>

        {/* ── SHORTCUTS ── */}
        <h2 id="shortcuts" className="doc-h2">Keyboard Shortcuts</h2>
        <table className="doc-table">
          <thead><tr><th>Shortcut</th><th>Action</th></tr></thead>
          <tbody>
            {[
              ['Ctrl+Space', 'Open the command palette on any page'],
              ['↑ / ↓', 'Navigate commands in the palette'],
              ['Enter', 'Launch the selected command'],
              ['Escape', 'Close the palette or cancel a variable prompt'],
              ['/keyword + Tab', 'Inline slash trigger — expand command directly in a text field'],
              ['/keyword + Space', 'Alternative inline slash expand'],
            ].map(([key, action]) => (
              <tr key={key}><td><kbd>{key}</kbd></td><td>{action}</td></tr>
            ))}
          </tbody>
        </table>

        {/* ── COMMANDS ── */}
        <h2 id="commands" className="doc-h2">Creating Commands</h2>
        <p className="doc-p">Open Options → Commands tab → click <strong className="text-slate-200">+ New Command</strong>. Every command has these core fields:</p>
        <table className="doc-table">
          <thead><tr><th>Field</th><th>Description</th></tr></thead>
          <tbody>
            {[
              ['Name',         'Shown in the palette. Make it scannable — e.g. "Thank you — Order Delay".'],
              ['Stack',        'The folder/category this command belongs to.'],
              ['Slash Trigger','A short keyword (no spaces) you can type inline to expand this command, e.g. thanks.'],
              ['Template',     'The text to insert. Supports {{variables}}.'],
              ['Command Type', 'Static (plain text/template) or AI (prompt sent to GPT).'],
              ['Conditions',   'Rules that limit when this command appears (site, URL, etc.). Pro'],
              ['Actions',      'What happens after text is resolved — insert, copy, open URL, etc.'],
              ['Favorite',     'Pins the command to the top of the palette with a ★.'],
            ].map(([field, desc]) => (
              <tr key={field}><td><strong className="text-slate-300">{field}</strong></td><td>{desc}</td></tr>
            ))}
          </tbody>
        </table>

        {/* ── STATIC ── */}
        <h2 id="static" className="doc-h2">Static Templates</h2>
        <p className="doc-p">A static command inserts plain text, optionally with variable placeholders. It&apos;s instant — no network call, no delay.</p>
        <ExCard title='Command: "Greeting — Support"'>
          <CB>{`Hi {{firstName}},

Thanks for reaching out to support! My name is {{agentName}} and I'll be helping you today.

Could you provide your order number so I can look into this for you?`}</CB>
          <p className="doc-p" style={{ marginBottom: 0 }}>When launched, cannedIQ prompts you to fill in <IC>firstName</IC> and <IC>agentName</IC>, then inserts the completed text at your cursor.</p>
        </ExCard>
        <h3 className="doc-h3">Multi-line &amp; Formatted Text</h3>
        <p className="doc-p">Line breaks in your template are preserved exactly. Write the template the way you want it to appear in the output — what you see is what gets inserted.</p>

        {/* ── AI COMMANDS ── */}
        <h2 id="ai-commands" className="doc-h2">AI Commands <span className="badge badge-ai ml-2">Pro + AI</span></h2>
        <p className="doc-p">AI commands send a prompt to GPT and insert the generated response. You write the instructions — cannedIQ handles the API call. No API key required.</p>
        <Callout type="violet">
          ⚡ <strong>How it works:</strong> The prompt is resolved (variables filled in), sent to cannedIQ&apos;s secure AI service, and the generated text is inserted into your active field. Your session JWT is used — the API key never touches your browser.
        </Callout>
        <h3 className="doc-h3">Writing an AI Prompt</h3>
        <p className="doc-p">Think of the AI prompt as instructions to a writing assistant. Be specific about tone, length, and purpose. Use <IC>{'{{inputText}}'}</IC> to pass whatever you&apos;ve already written or selected into the prompt.</p>
        <ExCard title='AI Prompt: "Improve — Tone Polisher"'>
          <CB>{`Rewrite the following message in a friendly but professional tone. Keep it concise, under 3 sentences. Do not change the core meaning.

Message to rewrite:
{{inputText}}`}</CB>
          <p className="doc-p" style={{ marginBottom: 0 }}>With text already in the field, launch this command — it sends what you wrote to GPT and replaces it with the polished version.</p>
        </ExCard>
        <ExCard title='AI Prompt: "Generate — Cold Outreach"'>
          <CB>{`Write a short, personalized LinkedIn connection request for someone in {{role}} at {{company}}.
My goal: {{goal}}.
Tone: warm, direct, no fluff. Max 3 sentences.`}</CB>
        </ExCard>
        <h3 className="doc-h3">AI Prompt Best Practices</h3>
        <ul className="doc-ul">
          <li>State the <strong className="text-slate-200">output format</strong> — &quot;reply in bullet points&quot;, &quot;write one paragraph&quot;, &quot;give me a subject line only&quot;.</li>
          <li>State the <strong className="text-slate-200">tone</strong> — &quot;professional&quot;, &quot;casual&quot;, &quot;empathetic but firm&quot;.</li>
          <li>Use <IC>{'{{inputText}}'}</IC> to reference existing draft text or selected content.</li>
          <li>Add constraints — &quot;under 50 words&quot;, &quot;no exclamation marks&quot;.</li>
          <li>Provide <strong className="text-slate-200">context</strong> about your role: &quot;You are a customer support agent for a SaaS company&quot;.</li>
        </ul>

        {/* ── STACKS ── */}
        <h2 id="stacks" className="doc-h2">Stacks</h2>
        <p className="doc-p">Stacks are folders for organizing commands. You might have stacks for &quot;Support&quot;, &quot;Sales&quot;, &quot;HR Templates&quot;, or &quot;Personal&quot;. In the command palette, stacks appear as section headers so you can navigate large libraries quickly.</p>
        <p className="doc-p">Free accounts can have up to 3 stacks. Pro and Team plans are unlimited.</p>
        <p className="doc-p">Each stack has a <strong className="text-slate-200">name</strong>, <strong className="text-slate-200">color</strong>, and <strong className="text-slate-200">icon</strong>. Team stacks synced from a team admin show a 🏢 icon and cannot be edited by members.</p>

        {/* ── VARIABLES ── */}
        <h2 id="variables" className="doc-h2">How Variables Work</h2>
        <p className="doc-p">Variables are placeholders written as <IC>{'{{variableName}}'}</IC> inside your template or AI prompt. When a command is launched, cannedIQ resolves each placeholder to its real value before inserting the text.</p>
        <ul className="doc-ul">
          <li><strong className="text-slate-200">Dynamic variables</strong> — resolved automatically from the current page context. No user input needed.</li>
          <li><strong className="text-slate-200">Custom variables</strong> — you define them; a fill-in modal appears when the command is launched.</li>
        </ul>

        {/* ── DYNAMIC VARS ── */}
        <h2 id="dynamic-vars" className="doc-h2">Dynamic Variables</h2>
        <p className="doc-p">These are resolved automatically — you just drop the placeholder in your template and it fills itself in.</p>
        <table className="doc-table">
          <thead><tr><th>Variable</th><th>Resolves to</th><th>Example output</th></tr></thead>
          <tbody>
            {[
              ['{{today}}',        'Current date (locale format)',                      '5/21/2026'],
              ['{{now}}',          'Current date & time',                               '5/21/2026, 2:34:00 PM'],
              ['{{time}}',         'Current time only',                                 '2:34:00 PM'],
              ['{{pageTitle}}',    'Title of the current tab',                         'Dashboard — Acme Corp'],
              ['{{currentUrl}}',   'Full URL of the current page',                     'https://github.com/acme/repo/issues/42'],
              ['{{hostname}}',     'Domain name only',                                  'github.com'],
              ['{{siteName}}',     'Friendly site name (if recognized)',                'GitHub, Gmail, LinkedIn…'],
              ['{{selectedText}}', 'Text you have highlighted on the page',            'whatever you selected'],
              ['{{activeInput}}',  'Current content of the focused text field',        'what\'s already typed'],
              ['{{inputText}}',    'Active field content, or selected text if empty.', 'draft or selection'],
              ['{{clipboard}}',    'Your clipboard contents (requires setting)',        'last copied text'],
            ].map(([v, desc, ex]) => (
              <tr key={v}><td><IC>{v}</IC></td><td>{desc}</td><td><em className="text-slate-400">{ex}</em></td></tr>
            ))}
          </tbody>
        </table>
        <Callout type="green">
          ✅ <strong>Best practice for AI commands:</strong> Use <IC>{'{{inputText}}'}</IC> instead of <IC>{'{{selectedText}}'}</IC> or <IC>{'{{activeInput}}'}</IC> separately — it intelligently falls back between the two.
        </Callout>
        <ExCard title="Template using dynamic variables">
          <CB>{`Following up on our conversation from {{today}}.

I noticed you were viewing {{pageTitle}} — happy to answer any questions!

Here's the link for reference: {{currentUrl}}`}</CB>
        </ExCard>

        {/* ── CUSTOM VARS ── */}
        <h2 id="custom-vars" className="doc-h2">Custom Variables</h2>
        <p className="doc-p">Any <IC>{'{{placeholder}}'}</IC> that isn&apos;t a built-in dynamic variable becomes a custom variable. When the command launches, a modal appears asking you to fill in each one.</p>
        <table className="doc-table">
          <thead><tr><th>Field</th><th>Description</th></tr></thead>
          <tbody>
            {[
              ['Key',      'Must match the placeholder exactly (case-sensitive). E.g. firstName for {{firstName}}.'],
              ['Label',    'Human-readable prompt shown in the fill-in modal. E.g. "Customer\'s first name".'],
              ['Type',     'text, textarea, date, or dropdown.'],
              ['Options',  'For dropdown type — comma-separated list of choices.'],
              ['Required', 'If checked, the command won\'t fire until this field is filled in.'],
            ].map(([f, d]) => (
              <tr key={f}><td><strong className="text-slate-300">{f}</strong></td><td>{d}</td></tr>
            ))}
          </tbody>
        </table>
        <ExCard title="Dropdown variable">
          <CB>{`Key:     priority
Label:   Issue priority
Type:    dropdown
Options: Low, Medium, High, Critical`}</CB>
        </ExCard>
        <ExCard title="Date variable">
          <CB>{`Key:   followUpDate
Label: Follow-up date
Type:  date`}</CB>
        </ExCard>

        {/* ── TRIGGERS ── */}
        <h2 id="triggers" className="doc-h2">How Triggers Work</h2>
        <ul className="doc-ul">
          <li><strong className="text-slate-200">Palette</strong> — open with <kbd>Ctrl</kbd>+<kbd>Space</kbd>, search, and hit <kbd>Enter</kbd>. Works everywhere.</li>
          <li><strong className="text-slate-200">Slash trigger</strong> — type a shortcode directly in a text field; cannedIQ detects it and offers to expand. Great for muscle memory.</li>
        </ul>

        {/* ── SLASH ── */}
        <h2 id="slash-trigger" className="doc-h2">Slash Text Triggers</h2>
        <p className="doc-p">A slash trigger lets you type a short code inside any text field to expand a command without opening the palette.</p>
        <ol className="doc-ul list-decimal">
          <li>Click into any text field on a webpage.</li>
          <li>Type <IC>/yourkeyword</IC>.</li>
          <li>Press <kbd>Tab</kbd> or <kbd>Space</kbd> — the keyword disappears and the command fires.</li>
        </ol>
        <Callout type="amber">
          ⚠ <strong>Note:</strong> Slash triggers are case-insensitive and must not contain spaces. Keep them short and memorable — e.g. <IC>ty</IC>, <IC>cob</IC>, <IC>outreach</IC>.
        </Callout>

        {/* ── CONDITIONS ── */}
        <h2 id="conditions" className="doc-h2">Conditions <span className="badge badge-pro ml-2">Pro</span></h2>
        <p className="doc-p">Conditions are rules that control when a command is visible in the palette on a given page. All conditions must pass (AND logic).</p>
        <table className="doc-table">
          <thead><tr><th>Type</th><th>What it checks</th></tr></thead>
          <tbody>
            {[
              ['Site / Hostname',      'The domain of the current page (e.g. zendesk.com).'],
              ['URL',                  'The full URL of the current page.'],
              ['Site Name',            'Recognized friendly name — Gmail, LinkedIn, GitHub, Slack, etc.'],
              ['Selected Text Exists', 'Whether the user has text highlighted on the page.'],
              ['Input Focused',        'Whether the cursor is inside a text field.'],
            ].map(([t, d]) => (
              <tr key={t}><td><strong className="text-slate-300">{t}</strong></td><td>{d}</td></tr>
            ))}
          </tbody>
        </table>
        <ExCard title="Only show on Zendesk">
          <CB>{`Type:      hostname
Operator:  contains
Value:     zendesk.com`}</CB>
        </ExCard>
        <ExCard title="Only show when text is selected">
          <CB>{`Type:      selectedTextExists
Operator:  exists`}</CB>
        </ExCard>

        {/* ── ACTIONS ── */}
        <h2 id="actions" className="doc-h2">Action Types</h2>
        <p className="doc-p">After a command&apos;s template is resolved, an action defines what happens with the resulting text.</p>
        <table className="doc-table">
          <thead><tr><th>Action</th><th>What it does</th></tr></thead>
          <tbody>
            {[
              ['Insert Text',       'Types the resolved text into the focused input at cursor position. This is the default.'],
              ['Replace Selection', 'Replaces highlighted text with the resolved text. Falls back to Insert Text if nothing is selected.'],
              ['Copy to Clipboard', 'Puts the resolved text on your clipboard and shows a toast. Nothing is inserted.'],
              ['Open URL',          'Opens a URL in a new tab. Variables are resolved, so you can build dynamic URLs.'],
              ['Submit Form',       'Inserts text then submits the nearest <form>. Shows a confirmation prompt first.'],
              ['Click Button',      'Clicks a button on the page using a CSS selector.'],
              ['Chain Command',     'Runs another command after this one completes.'],
            ].map(([a, d]) => (
              <tr key={a}><td><strong className="text-slate-300">{a}</strong></td><td>{d}</td></tr>
            ))}
          </tbody>
        </table>

        {/* ── ACTION EXAMPLES ── */}
        <h2 id="action-examples" className="doc-h2">Action Examples</h2>
        <ExCard title='Command: "Copy — Meeting Link"'>
          <CB>{`Template:  https://meet.google.com/abc-defg-hij
Action:    copy_to_clipboard`}</CB>
          <p className="doc-p" style={{ marginBottom: 0 }}>Slash trigger <IC>/meet</IC> → copies your link to clipboard instantly.</p>
        </ExCard>
        <ExCard title='Command: "Search — Jira Ticket"'>
          <CB>{`Template:  https://yourcompany.atlassian.net/browse/{{ticketId}}
Action:    open_url`}</CB>
        </ExCard>
        <ExCard title='Command: "AI — Shorten This" (AI type)'>
          <CB>{`AI Prompt:  Make this more concise. Keep the same meaning. Max 2 sentences:
{{inputText}}

Action:      replace_selection`}</CB>
        </ExCard>

        {/* ── EXAMPLES ── */}
        <h2 id="ex-support" className="doc-h2">Examples — Support Teams</h2>
        <ExCard title='Command: "Refund Approved"  · Slash: /refund-ok'>
          <CB>{`Hi {{firstName}},

Great news — your refund of {{amount}} has been approved and will appear back on your {{paymentMethod}} within 5–10 business days.

Your refund reference number is {{refundId}}.

Let me know if there's anything else I can help with!

— {{agentName}}`}</CB>
        </ExCard>
        <ExCard title='AI Command: "Summarize — Ticket Thread"  · Slash: /summarize'>
          <CB>{`You are a support agent assistant. Summarize the following customer support thread in 3 bullet points:
- The customer's core issue
- What was tried or offered
- Current status / next step

Thread:
{{inputText}}`}</CB>
        </ExCard>

        <h2 id="ex-sales" className="doc-h2">Examples — Sales Outreach</h2>
        <ExCard title='Command: "LinkedIn Connect Request"  · AI · Condition: siteName equals LinkedIn'>
          <CB>{`Write a short LinkedIn connection request to {{name}}, who works as {{role}} at {{company}}.
Context about why I'm reaching out: {{reason}}.
Tone: friendly, direct, not salesy. Max 2 sentences. No emojis.`}</CB>
        </ExCard>
        <ExCard title='Command: "Follow-Up — No Response"  · Slash: /followup'>
          <CB>{`Hi {{firstName}},

I wanted to follow up on my message from {{lastContactDate}}. I know things get busy — just wanted to make sure this didn't get lost.

Would a quick {{duration}}-minute call work this week?`}</CB>
        </ExCard>

        <h2 id="ex-recruiting" className="doc-h2">Examples — Recruiting</h2>
        <ExCard title='Command: "Interview Invite"  · Slash: /invite'>
          <CB>{`Hi {{candidateName}},

Thank you for applying to the {{role}} position at {{company}}! We've reviewed your background and would love to schedule an interview.

You can book a time that works for you here: {{schedulingLink}}`}</CB>
        </ExCard>

        <h2 id="ex-dev" className="doc-h2">Examples — Developers</h2>
        <ExCard title='Command: "PR Description Template"  · Condition: hostname contains github.com'>
          <CB>{`## What does this PR do?
{{summary}}

## Why?
{{motivation}}

## How to test
1. {{testStep1}}
2. {{testStep2}}

## Checklist
- [ ] Tests added/updated
- [ ] Docs updated
- [ ] No breaking changes (or noted above)`}</CB>
        </ExCard>
        <ExCard title='AI Command: "Explain — Selected Code"  · Action: copy_to_clipboard'>
          <CB>{`Explain the following code in plain English. Assume the reader is a mid-level developer.
Format: 1 sentence summary, then a bulleted breakdown of key logic.

Code:
{{selectedText}}`}</CB>
        </ExCard>

        {/* CTA */}
        <div className="mt-16 bg-gradient-to-br from-blue-600/20 to-violet-600/20 border border-blue-500/20 rounded-2xl p-8 text-center">
          <div className="text-3xl mb-3">⚡</div>
          <h3 className="text-xl font-bold text-white mb-2">Ready to build your library?</h3>
          <p className="text-[#94A3B8] text-sm mb-5">Start with a few commands in your most-used workflow and grow from there.</p>
          <a
            href={CHROME_STORE}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-gradient-to-r from-blue-500 to-violet-600 text-white px-6 py-2.5 rounded-lg font-semibold hover:opacity-90 transition-opacity text-sm"
          >
            Add cannedIQ to Chrome →
          </a>
        </div>

      </main>
    </div>
  );
}
