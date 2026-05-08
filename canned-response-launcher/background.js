/**
 * CRL — background.js (Service Worker)
 *
 * Responsibilities:
 *  1. Seed / migrate local data on first install
 *  2. Proactively refresh Supabase JWT
 *  3. Register context menus from saved commands
 *  4. Forward keyboard shortcut to active tab
 *  5. Proxy AI generation (keeps API key out of content scripts)
 *  6. Handle misc messages (OPEN_TAB, GET_SESSION, SIGN_OUT, REBUILD_MENUS)
 */

importScripts('config.js', 'auth.js', 'core/storage.js', 'core/gates.js');

// ── 1. Install / update ───────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  // CRLStorage.read() auto-migrates v1 → v2 on first access
  await CRLStorage.read();
  await rebuildContextMenus();
});

// ── 2. Proactive token refresh ────────────────────────────────────────────────

chrome.alarms.create('tokenRefresh', { periodInMinutes: 45 });
chrome.alarms.create('rebuildMenus', { periodInMinutes: 60 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'tokenRefresh') {
    try {
      const session = await Auth.getValidSession();
      if (session) console.log('[CRL] Token refreshed');
    } catch (err) { console.warn('[CRL] Token refresh failed:', err.message); }
  }
  if (alarm.name === 'rebuildMenus') {
    await rebuildContextMenus();
  }
});

// ── 3. Context menus ──────────────────────────────────────────────────────────

async function rebuildContextMenus() {
  try {
    await chrome.contextMenus.removeAll();
    const data     = await CRLStorage.read();
    const commands = (data.commands || []).slice(0, 20); // Chrome has a cap
    if (commands.length === 0) return;

    chrome.contextMenus.create({
      id: 'crl-root',
      title: 'CRL — Launch Command',
      contexts: ['editable', 'selection'],
    });

    commands.forEach((cmd) => {
      chrome.contextMenus.create({
        id:       `crl-cmd-${cmd.id}`,
        parentId: 'crl-root',
        title:    cmd.favorite ? `★ ${cmd.name}` : cmd.name,
        contexts: ['editable', 'selection'],
      });
    });
  } catch (err) { console.warn('[CRL] Context menu rebuild failed:', err.message); }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!info.menuItemId.startsWith('crl-cmd-')) return;
  const commandId = info.menuItemId.replace('crl-cmd-', '');
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'CONTEXT_MENU_COMMAND', commandId });
  } catch (err) { console.warn('[CRL] Context menu message failed:', err.message); }
});

// ── 4. Keyboard shortcut → forward to active tab ──────────────────────────────

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'open-palette') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'OPEN_PALETTE' });
  } catch (err) { console.warn('[CRL] Could not open palette:', err.message); }
});

// ── 5. Message bus ────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

  if (msg.type === 'GET_SESSION') {
    Auth.getValidSession()
      .then((session) => sendResponse({ session }))
      .catch((err)   => sendResponse({ error: err.message }));
    return true;
  }

  if (msg.type === 'SIGN_OUT') {
    Auth.signOut()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (msg.type === 'OPEN_TAB') {
    if (msg.url) chrome.tabs.create({ url: msg.url });
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'REBUILD_MENUS') {
    rebuildContextMenus()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (msg.type === 'AI_GENERATE') {
    handleAIGenerate(msg)
      .then((text) => sendResponse({ text }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (msg.type === 'BILLING_CHECKOUT') {
    handleBillingCheckout(msg)
      .then((url) => sendResponse({ url }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (msg.type === 'BILLING_PORTAL') {
    handleBillingPortal()
      .then((url) => sendResponse({ url }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (msg.type === 'REFRESH_PLAN') {
    refreshUserPlan()
      .then((plan) => sendResponse({ plan }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }
});

// ── 6. AI proxy ───────────────────────────────────────────────────────────────
//
// AI is a managed service — the API key lives server-side in the Edge Function.
// The background script gets the user's JWT and forwards the request to
// the ai-generate edge function, which handles tier checks, quota enforcement,
// and the OpenAI call. No local API key required.

async function handleAIGenerate({ prompt, context }) {
  // Must be signed in — AI is for paid users only
  let session;
  try {
    session = await Auth.getValidSession();
  } catch {}
  if (!session) {
    throw new Error('Sign in to use AI commands. AI is available on Pro and Team plans.');
  }

  const endpoint = `${SUPABASE_URL}/functions/v1/ai-generate`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ prompt, context }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    // Surface clear messages for tier/quota errors from the edge function
    throw new Error(data?.error || `AI service error (${res.status})`);
  }

  return data.text || '';
}

// ── 7. Billing proxy ──────────────────────────────────────────────────────────
//
// All Stripe API calls happen server-side via Supabase Edge Functions.
// The background script holds the JWT and forwards requests — never exposes
// the Stripe secret key to content scripts or the options page.

async function handleBillingCheckout({ plan, quantity = 1 }) {
  let session;
  try { session = await Auth.getValidSession(); } catch {}
  if (!session) throw new Error('Sign in to manage billing.');

  const endpoint = `${SUPABASE_URL}/functions/v1/billing-checkout`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ plan, quantity }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Checkout error (${res.status})`);
  return data.url;
}

async function handleBillingPortal() {
  let session;
  try { session = await Auth.getValidSession(); } catch {}
  if (!session) throw new Error('Sign in to manage billing.');

  const endpoint = `${SUPABASE_URL}/functions/v1/billing-portal`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({}),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Portal error (${res.status})`);
  return data.url;
}

// ── 8. Plan sync ──────────────────────────────────────────────────────────────
// Fetches current plan from Supabase and caches it in chrome.storage.local
// so gates.js can check plan gating without a network call every time.

async function refreshUserPlan() {
  let session;
  try { session = await Auth.getValidSession(); } catch {}

  if (!session) {
    chrome.storage.local.set({ crl_user_plan: { plan: 'free', signedIn: false } });
    return 'free';
  }

  const endpoint = `${SUPABASE_URL}/rest/v1/user_plan?select=*&limit=1`;
  const res = await fetch(endpoint, {
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'apikey':        SUPABASE_ANON,
    },
  });

  if (!res.ok) return null;

  const rows = await res.json().catch(() => []);
  const row  = rows[0];
  if (!row) return null;

  const planData = {
    plan:                row.plan,
    signedIn:            true,
    subscriptionStatus:  row.subscription_status,
    currentPeriodEnd:    row.current_period_end,
    cancelAtPeriodEnd:   row.cancel_at_period_end,
    aiCreditsRemaining:  row.ai_credits_remaining,
    maxCommands:         row.max_commands,
    maxStacks:           row.max_stacks,
  };

  chrome.storage.local.set({ crl_user_plan: planData });
  return planData;
}

// Refresh plan on startup and when auth state changes
chrome.runtime.onInstalled.addListener(() => refreshUserPlan());
chrome.alarms.create('planRefresh', { periodInMinutes: 30 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'planRefresh') refreshUserPlan();
});
