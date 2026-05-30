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

// ── Content-script injection helper ──────────────────────────────────────────
//
// Sends a message to a tab's content script. If the content script isn't
// running (page was open before install, or extension was reloaded), injects
// all scripts + CSS on demand and retries once. Silently ignores restricted
// pages (chrome://, PDFs, etc.) where injection is not allowed.

const CONTENT_SCRIPTS = [
  'config.js', 'auth.js', 'api-client.js',
  'core/storage.js', 'core/context.js', 'core/conditions.js',
  'core/variables.js', 'core/history.js', 'core/gates.js',
  'core/upgrade.js', 'core/executor.js', 'core/ai-reply.js',
  'content.js',
];
const CONTENT_CSS = ['overlay.css', 'upgrade.css'];

async function sendToTab(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (err) {
    if (!err.message?.includes('Could not establish connection')) throw err;

    // Content script not present — try injecting it now
    try {
      await chrome.scripting.insertCSS({ target: { tabId }, files: CONTENT_CSS });
      await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_SCRIPTS });
      // Give scripts a moment to initialise
      await new Promise((r) => setTimeout(r, 150));
      return await chrome.tabs.sendMessage(tabId, message);
    } catch {
      // Restricted page (chrome://, PDF, etc.) — nothing we can do
    }
  }
}

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
      if (session) DEBUG && console.log('[CRL] Token refreshed');
    } catch (err) { DEBUG && console.warn('[CRL] Token refresh failed:', err.message); }
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
      title: 'cannedIQ — Launch Command',
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
  } catch (err) { DEBUG && console.warn('[CRL] Context menu rebuild failed:', err.message); }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!info.menuItemId.startsWith('crl-cmd-')) return;
  const commandId = info.menuItemId.replace('crl-cmd-', '');
  await sendToTab(tab.id, { type: 'CONTEXT_MENU_COMMAND', commandId });
});

// ── 4. Keyboard shortcut → forward to active tab ──────────────────────────────

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  if (command === 'open-palette')  await sendToTab(tab.id, { type: 'OPEN_PALETTE' });
  if (command === 'open-ai-reply') await sendToTab(tab.id, { type: 'OPEN_AI_REPLY' });
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

  if (msg.type === 'SYNC_TEAM_COMMANDS') {
    syncTeamCommands()
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
    // syncFromStripe=true: pull seat count + tier from Stripe before reading DB
    // This fires when the user returns from Stripe Checkout / Portal
    refreshUserPlan({ syncFromStripe: true })
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
//
// syncFromStripe=true: first calls the sync-billing Edge Function which pulls
// the authoritative seat count + tier directly from Stripe, then reads the DB.
// Used after returning from Stripe Checkout or the Customer Portal.
// syncFromStripe=false (default): reads DB only, used for periodic background refresh.

async function refreshUserPlan({ syncFromStripe = false } = {}) {
  let session;
  try { session = await Auth.getValidSession(); } catch {}

  if (!session) {
    chrome.storage.local.set({ crl_user_plan: { plan: 'free', signedIn: false } });
    return 'free';
  }

  // Pull authoritative data from Stripe before reading DB (post-checkout path)
  if (syncFromStripe) {
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/sync-billing`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
    } catch (e) {
      DEBUG && console.warn('[background] sync-billing call failed:', e);
    }
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
    plan:                row.plan ?? 'free',
    signedIn:            true,
    subscriptionStatus:  row.subscription_status,
    currentPeriodEnd:    row.current_period_end,
    cancelAtPeriodEnd:   row.cancel_at_period_end,
    aiCreditsRemaining:  row.ai_credits_remaining ?? 0,
    // NULL from the view means unlimited — map to Infinity for gates.js
    maxCommands:         row.max_commands  ?? Infinity,
    maxStacks:           row.max_stacks    ?? Infinity,
  };

  chrome.storage.local.set({ crl_user_plan: planData });
  // Invalidate the in-memory cache in gates.js (runs in content scripts —
  // they each have their own copy, cleared on next getUser() call via storage)
  return planData;
}

// Refresh plan on startup, every 30 min, and right after billing events
chrome.runtime.onInstalled.addListener(() => { refreshUserPlan(); syncTeamCommands(); fetchMaintenanceConfig(); });
chrome.alarms.create('planRefresh',        { periodInMinutes: 30 });
chrome.alarms.create('teamCommandsSync',   { periodInMinutes: 30 });
chrome.alarms.create('maintenanceRefresh', { periodInMinutes: 30 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'planRefresh')        refreshUserPlan();
  if (alarm.name === 'teamCommandsSync')   syncTeamCommands();
  if (alarm.name === 'maintenanceRefresh') fetchMaintenanceConfig();
});

// Also fetch on service worker startup (covers browser restart, extension reload)
fetchMaintenanceConfig();

// ── 9. Maintenance config polling ────────────────────────────────────────────
// Fetches banner_message + maintenance_mode from admin-maintenance (public endpoint).
// Stores in chrome.storage.local and broadcasts to all content scripts.

async function fetchMaintenanceConfig() {
  try {
    const res  = await fetch(`${SUPABASE_URL}/functions/v1/admin-maintenance`);
    if (!res.ok) return;
    const data = await res.json();
    const config = {
      bannerMessage:   data.banner_message   ?? null,
      maintenanceMode: data.maintenance_mode ?? false,
    };
    await chrome.storage.local.set({ maintenanceConfig: config });

    // Broadcast to all content script tabs
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'MAINTENANCE_UPDATE', config });
      } catch { /* tab may not have content script */ }
    }
  } catch (e) {
    DEBUG && console.warn('[CRL] Maintenance config fetch failed:', e.message);
  }
}

// ── 10. Team command sync ─────────────────────────────────────────────────────
// Pulls shared commands from Supabase and merges them into local storage.
// Team commands are marked with _isTeam:true so they can be identified and
// refreshed without overwriting personal commands.

async function syncTeamCommands() {
  let session;
  try { session = await Auth.getValidSession(); } catch {}
  if (!session) return;

  try {
    // Fetch all team commands the user has access to
    const endpoint = `${SUPABASE_URL}/rest/v1/team_commands` +
      `?select=id,team_id,stack_id,stack_name,stack_color,stack_icon,command_data,teams(name)` +
      `&order=created_at.asc`;

    const res = await fetch(endpoint, {
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey':        SUPABASE_ANON,
        'Accept':        'application/json',
      },
    });
    if (!res.ok) return;

    const rows = await res.json().catch(() => []);
    if (!rows.length) return;

    // Build the merged command objects
    const teamCmds = rows.map((row) => ({
      ...(row.command_data ?? {}),
      id:         row.id,
      stackId:    row.stack_id    ?? 'general',
      _teamId:    row.team_id,
      _teamName:  row.teams?.name ?? 'Team',
      _stackName: row.stack_name  ?? 'Shared',
      _stackColor: row.stack_color ?? '#7c3aed',
      _stackIcon:  row.stack_icon  ?? '🏢',
      _isTeam:    true,
    }));

    // Merge into local storage: replace existing team commands, keep personal ones
    const data = await CRLStorage.read();
    const personal = (data.commands ?? []).filter((c) => !c._isTeam);
    data.commands = [...personal, ...teamCmds];
    await CRLStorage.write(data);
    await rebuildContextMenus();

    DEBUG && console.log(`[CRL] Team sync: ${teamCmds.length} shared command(s) loaded`);
  } catch (err) {
    DEBUG && console.warn('[CRL] Team command sync failed:', err.message);
  }
}
