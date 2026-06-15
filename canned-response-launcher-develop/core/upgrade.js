/**
 * CRL — core/upgrade.js
 * Upgrade modal system — shown when a user hits a plan gate.
 *
 * Usage:
 *   CRLUpgrade.show('command_limit');
 *   CRLUpgrade.show('stack_limit');
 *   CRLUpgrade.show('ai');
 *   CRLUpgrade.show('context');
 *   CRLUpgrade.show('heavy_use');
 *
 * Depends on: CRLGates (for plan info)
 * Styles: upgrade.css (injected alongside overlay.css)
 */

const CRLUpgrade = (() => {

  // ── Context definitions ───────────────────────────────────────────────────────

  const CONTEXTS = {
    command_limit: {
      icon:    '⚡',
      title:   "You've reached 25 Commands",
      body:    "Upgrade to Pro for unlimited Commands, Stacks, and advanced workflows.",
      primary: { label: 'Upgrade to Pro', plan: 'pro' },
    },
    stack_limit: {
      icon:    '📚',
      title:   "Stack limit reached",
      body:    "Stacks are limited on Free. Upgrade to Pro for unlimited workflow organization.",
      primary: { label: 'Upgrade to Pro', plan: 'pro' },
    },
    ai: {
      icon:    '🤖',
      title:   "AI Commands — Pro+ AI",
      body:    "Generate smarter responses from context. AI Commands are available on the Pro+ AI plan.",
      primary: { label: 'Unlock AI', plan: 'ai' },
      secondary: { label: 'See all plans', plan: null },
    },
    context: {
      icon:    '🌐',
      title:   "Context-aware Commands",
      body:    "Trigger commands based on the site you're on. Context-aware Commands are a Pro feature.",
      primary: { label: 'Upgrade to Pro', plan: 'pro' },
    },
    heavy_use: {
      icon:    '🚀',
      title:   "You're on a roll!",
      body:    "CannedIQ has already helped you launch 10 responses. Unlock unlimited speed with Pro.",
      primary: { label: 'Upgrade to Pro', plan: 'pro' },
    },
    team: {
      icon:    '👥',
      title:   "Team Stacks",
      body:    "Share commands and stacks with your whole team. Available on the Team plan.",
      primary: { label: 'Start Team Plan', plan: 'team' },
    },
  };

  // ── Checkout trigger ──────────────────────────────────────────────────────────

  function startCheckout(plan) {
    if (!plan) {
      // Open pricing page
      chrome.runtime.sendMessage({ type: 'OPEN_TAB', url: 'https://cannediq.com/pricing' });
      return;
    }
    chrome.runtime.sendMessage({ type: 'BILLING_CHECKOUT', plan }, (res) => {
      if (res?.url) {
        chrome.runtime.sendMessage({ type: 'OPEN_TAB', url: res.url });
      } else {
        // Fallback — open pricing page
        chrome.runtime.sendMessage({ type: 'OPEN_TAB', url: 'https://cannediq.com/pricing' });
      }
    });
  }

  // ── Modal builder ─────────────────────────────────────────────────────────────

  function show(contextKey) {
    const ctx = CONTEXTS[contextKey];
    if (!ctx) return;

    // Remove any existing modal
    document.getElementById('crl-upgrade-modal')?.remove();

    const modal = document.createElement('div');
    modal.id        = 'crl-upgrade-modal';
    modal.className = 'crl-upgrade-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    const box = document.createElement('div');
    box.className = 'crl-upgrade-box';

    // Dismiss button (×)
    const close = document.createElement('button');
    close.className = 'crl-upgrade-close';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Dismiss');
    close.addEventListener('click', hide);

    // Icon + header
    const header = document.createElement('div');
    header.className = 'crl-upgrade-header';

    const icon = document.createElement('div');
    icon.className = 'crl-upgrade-icon';
    icon.textContent = ctx.icon;

    const planBadge = document.createElement('div');
    planBadge.className = 'crl-upgrade-plan-badge';
    planBadge.textContent = ctx.primary?.plan === 'ai' ? 'Pro+ AI' :
                            ctx.primary?.plan === 'team' ? 'Team' : 'Pro';

    header.appendChild(icon);
    header.appendChild(planBadge);

    const title = document.createElement('h3');
    title.className = 'crl-upgrade-title';
    title.textContent = ctx.title;

    const body = document.createElement('p');
    body.className = 'crl-upgrade-body';
    body.textContent = ctx.body;

    // Feature highlights (mini plan preview)
    const highlights = featureHighlights(ctx.primary?.plan ?? 'pro');
    const featureList = document.createElement('ul');
    featureList.className = 'crl-upgrade-features';
    highlights.forEach((f) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="crl-upgrade-check">✓</span> ${f}`;
      featureList.appendChild(li);
    });

    // Buttons
    const btnRow = document.createElement('div');
    btnRow.className = 'crl-upgrade-btns';

    if (ctx.primary) {
      const primaryBtn = document.createElement('button');
      primaryBtn.className = 'crl-upgrade-btn crl-upgrade-btn--primary';
      primaryBtn.textContent = ctx.primary.label;
      primaryBtn.addEventListener('click', () => {
        hide();
        startCheckout(ctx.primary.plan);
      });
      btnRow.appendChild(primaryBtn);
    }

    if (ctx.secondary) {
      const secBtn = document.createElement('button');
      secBtn.className = 'crl-upgrade-btn crl-upgrade-btn--secondary';
      secBtn.textContent = ctx.secondary.label;
      secBtn.addEventListener('click', () => {
        hide();
        startCheckout(ctx.secondary.plan);
      });
      btnRow.appendChild(secBtn);
    }

    const dismissBtn = document.createElement('button');
    dismissBtn.className = 'crl-upgrade-btn crl-upgrade-btn--ghost';
    dismissBtn.textContent = 'Maybe Later';
    dismissBtn.addEventListener('click', hide);
    btnRow.appendChild(dismissBtn);

    // Assemble
    box.appendChild(close);
    box.appendChild(header);
    box.appendChild(title);
    box.appendChild(body);
    box.appendChild(featureList);
    box.appendChild(btnRow);
    modal.appendChild(box);
    document.body.appendChild(modal);

    // Animate in
    requestAnimationFrame(() => modal.classList.add('crl-upgrade-modal--visible'));

    // Close on backdrop click
    modal.addEventListener('mousedown', (e) => {
      if (e.target === modal) hide();
    });

    // Escape key
    const onKey = (e) => {
      if (e.key === 'Escape') { hide(); document.removeEventListener('keydown', onKey); }
    };
    document.addEventListener('keydown', onKey);
  }

  function hide() {
    const modal = document.getElementById('crl-upgrade-modal');
    if (!modal) return;
    modal.classList.remove('crl-upgrade-modal--visible');
    setTimeout(() => modal.remove(), 250);
  }

  // ── Feature highlights per plan ───────────────────────────────────────────────

  function featureHighlights(plan) {
    const FEATURES = {
      pro: [
        'Unlimited Commands & Stacks',
        'Context-aware triggers',
        'Advanced variables',
        'Import / Export',
        'Usage history',
      ],
      ai: [
        'Everything in Pro',
        'AI Commands (500 credits/month)',
        'Tone controls & prompt templates',
        'Context-aware AI generation',
      ],
      team: [
        'Shared Stacks & templates',
        'Admin controls',
        'Team analytics',
        'Centralized command management',
      ],
    };
    return FEATURES[plan] ?? FEATURES.pro;
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  return { show, hide };
})();
