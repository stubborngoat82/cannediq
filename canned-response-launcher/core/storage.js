/**
 * CRL — core/storage.js
 * Versioned local storage for commands, stacks, settings, history.
 * Schema v2. Migrates automatically from v1 (categories/responses).
 *
 * All exported via the global CRLStorage object.
 */

const CRLStorage = (() => {
  const SCHEMA_VERSION = 2;
  const KEY = 'crl_v2';

  // ── Default stacks ──────────────────────────────────────────────────────────

  const DEFAULT_STACKS = [
    { id: 'general',  name: 'General',     color: '#6B7280', icon: 'layers',   defaultForSites: [] },
    { id: 'sales',    name: 'Sales',       color: '#3B82F6', icon: 'bolt',     defaultForSites: ['linkedin.com', 'gmail.com'] },
    { id: 'support',  name: 'Support',     color: '#10B981', icon: 'shield',   defaultForSites: [] },
    { id: 'personal', name: 'Personal',    color: '#8B5CF6', icon: 'user',     defaultForSites: [] },
    { id: 'ai',       name: 'AI Commands', color: '#F59E0B', icon: 'sparkles', defaultForSites: [] },
  ];

  // ── Default commands ────────────────────────────────────────────────────────

  function makeDefaultCommands() {
    const now = new Date().toISOString();
    return [
      {
        id: 'cmd_hello',
        name: 'Hello',
        description: 'Friendly greeting',
        stackId: 'general',
        commandType: 'static',
        template: 'Hello! How can I help you today?',
        triggers: [{ type: 'slash', value: '/hello' }],
        variables: [], conditions: [], actions: [{ type: 'insert_text' }],
        aiEnabled: false, aiPrompt: '', favorite: true, usageCount: 0,
        createdAt: now, updatedAt: now,
      },
      {
        id: 'cmd_followup',
        name: 'Follow Up',
        description: 'Polite follow-up with name and topic',
        stackId: 'sales',
        commandType: 'variable',
        template: 'Hi {{name}}, just following up on {{topic}}. Please let me know if you have any questions!',
        triggers: [{ type: 'slash', value: '/fu' }, { type: 'text', value: ';;fu' }],
        variables: [
          { key: 'name',  label: 'Name',  type: 'text', required: true },
          { key: 'topic', label: 'Topic', type: 'text', required: true },
        ],
        conditions: [], actions: [{ type: 'insert_text' }],
        aiEnabled: false, aiPrompt: '', favorite: false, usageCount: 0,
        createdAt: now, updatedAt: now,
      },
      {
        id: 'cmd_thankyou',
        name: 'Thank You',
        description: 'Quick sign-off',
        stackId: 'general',
        commandType: 'static',
        template: 'Thank you for reaching out! Have a great day.',
        triggers: [{ type: 'slash', value: '/ty' }],
        variables: [], conditions: [], actions: [{ type: 'insert_text' }],
        aiEnabled: false, aiPrompt: '', favorite: false, usageCount: 0,
        createdAt: now, updatedAt: now,
      },
      {
        id: 'cmd_moreinfo',
        name: 'Need More Info',
        description: 'Request additional context',
        stackId: 'support',
        commandType: 'static',
        template: 'Could you provide a bit more detail so I can assist you better? Specifically:\n- What you were trying to do\n- What happened instead\n- Any error messages you saw',
        triggers: [{ type: 'slash', value: '/info' }],
        variables: [], conditions: [], actions: [{ type: 'insert_text' }],
        aiEnabled: false, aiPrompt: '', favorite: false, usageCount: 0,
        createdAt: now, updatedAt: now,
      },
      {
        id: 'cmd_today',
        name: 'Today\'s Date',
        description: 'Inserts today\'s date dynamically',
        stackId: 'general',
        commandType: 'variable',
        template: 'As of {{today}},',
        triggers: [{ type: 'slash', value: '/date' }],
        variables: [], conditions: [], actions: [{ type: 'insert_text' }],
        aiEnabled: false, aiPrompt: '', favorite: false, usageCount: 0,
        createdAt: now, updatedAt: now,
      },
      {
        id: 'cmd_tone',
        name: 'Tone Selector',
        description: 'Start a message with the desired tone',
        stackId: 'sales',
        commandType: 'variable',
        template: '[{{tone}} tone] {{message}}',
        triggers: [{ type: 'slash', value: '/tone' }],
        variables: [
          { key: 'tone', label: 'Tone', type: 'dropdown', required: true,
            options: ['Friendly', 'Professional', 'Direct', 'Warm', 'Casual'] },
          { key: 'message', label: 'Message', type: 'textarea', required: true },
        ],
        conditions: [], actions: [{ type: 'insert_text' }],
        aiEnabled: false, aiPrompt: '', favorite: false, usageCount: 0,
        createdAt: now, updatedAt: now,
      },
    ];
  }

  const DEFAULT_SETTINGS = {
    aiEnabled: false,
    clipboardEnabled: false,
    aiProvider: 'openai',
    aiModel: 'gpt-4o-mini',
    aiApiKey: '',
  };

  // ── Context guard ───────────────────────────────────────────────────────────
  // chrome.storage calls throw "Extension context invalidated" when the content
  // script is orphaned after an extension reload. Detect it early and return
  // safe fallback values instead of crashing.

  function _chromeContextAlive() {
    try { return !!chrome?.runtime?.id; } catch { return false; }
  }

  // ── Read / Write ────────────────────────────────────────────────────────────

  function read() {
    return new Promise((resolve) => {
      if (!_chromeContextAlive()) return resolve(migrate(null)); // orphaned — return defaults

      try {
        chrome.storage.local.get([KEY, 'categories'], (raw) => {
          if (chrome.runtime.lastError) return resolve(migrate(null));
          let data = raw[KEY];

          if (!data || data.schemaVersion !== SCHEMA_VERSION) {
            // Migrate from v1 or initialise fresh
            data = migrate(raw.categories ?? null);
            try { chrome.storage.local.set({ [KEY]: data }); } catch {}
          }

          resolve(data);
        });
      } catch { resolve(migrate(null)); }
    });
  }

  function write(data) {
    return new Promise((resolve) => {
      if (!_chromeContextAlive()) return resolve();
      try {
        chrome.storage.local.set({ [KEY]: data }, () => {
          if (chrome.runtime.lastError) { /* swallow */ }
          resolve();
        });
      } catch { resolve(); }
    });
  }

  // ── Migration v1 → v2 ───────────────────────────────────────────────────────

  function migrate(oldCategories) {
    const now = new Date().toISOString();

    const stacks = DEFAULT_STACKS.map((s) => ({ ...s, createdAt: now, updatedAt: now }));
    const commands = [];

    if (oldCategories && oldCategories.length > 0) {
      oldCategories.forEach((cat) => {
        // Try to match an existing default stack by name
        const matched = DEFAULT_STACKS.find(
          (s) => s.name.toLowerCase() === (cat.name || '').toLowerCase()
        );
        let stackId = matched ? matched.id : 'stack_' + slugify(cat.name || 'untitled');

        if (!matched) {
          stacks.push({
            id: stackId,
            name: cat.name || 'Untitled',
            color: '#6B7280',
            icon: 'layers',
            defaultForSites: [],
            createdAt: now,
            updatedAt: now,
          });
        }

        (cat.responses || []).forEach((r) => {
          commands.push({
            id: r.id || genId('cmd'),
            name: r.title || r.name || 'Command',
            description: '',
            stackId,
            commandType: 'static',
            template: r.text || r.content || r.body || '',
            triggers: [],
            variables: [], conditions: [], actions: [{ type: 'insert_text' }],
            aiEnabled: false, aiPrompt: '',
            favorite: false,
            usageCount: r.use_count || 0,
            createdAt: now, updatedAt: now,
          });
        });
      });
    }

    if (commands.length === 0) {
      commands.push(...makeDefaultCommands());
    }

    return {
      schemaVersion: SCHEMA_VERSION,
      stacks,
      commands,
      history: [],
      settings: { ...DEFAULT_SETTINGS },
    };
  }

  // ── Commands ────────────────────────────────────────────────────────────────

  async function getCommands() {
    const data = await read();
    return data.commands || [];
  }

  async function saveCommand(cmd) {
    const data = await read();
    const now  = new Date().toISOString();
    const idx  = data.commands.findIndex((c) => c.id === cmd.id);
    if (idx >= 0) {
      data.commands[idx] = { ...data.commands[idx], ...cmd, updatedAt: now };
    } else {
      data.commands.push({ ...cmd, createdAt: now, updatedAt: now });
    }
    await write(data);
    return data.commands.find((c) => c.id === cmd.id);
  }

  async function deleteCommand(id) {
    const data = await read();
    data.commands = data.commands.filter((c) => c.id !== id);
    await write(data);
  }

  async function incrementUsageCount(commandId) {
    const data = await read();
    const cmd  = data.commands.find((c) => c.id === commandId);
    if (cmd) { cmd.usageCount = (cmd.usageCount || 0) + 1; await write(data); }
  }

  // ── Stacks ──────────────────────────────────────────────────────────────────

  async function getStacks() {
    const data = await read();
    return data.stacks || [];
  }

  async function saveStack(stack) {
    const data = await read();
    const now  = new Date().toISOString();
    const idx  = data.stacks.findIndex((s) => s.id === stack.id);
    if (idx >= 0) {
      data.stacks[idx] = { ...data.stacks[idx], ...stack, updatedAt: now };
    } else {
      data.stacks.push({ ...stack, createdAt: now, updatedAt: now });
    }
    await write(data);
  }

  async function deleteStack(id) {
    const data = await read();
    data.stacks   = data.stacks.filter((s) => s.id !== id);
    // Orphaned commands go to general
    data.commands = data.commands.map((c) =>
      c.stackId === id ? { ...c, stackId: 'general' } : c
    );
    await write(data);
  }

  // ── Settings ────────────────────────────────────────────────────────────────

  async function getSettings() {
    const data = await read();
    return { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
  }

  async function saveSettings(patch) {
    const data = await read();
    data.settings = { ...(data.settings || {}), ...patch };
    await write(data);
  }

  // ── Saved User Variables ─────────────────────────────────────────────────────
  // Key-value store for variables that auto-fill in templates
  // (e.g. companyName, agentName, senderTitle).

  async function getUserVariables() {
    const data = await read();
    return data.userVariables ?? {};
  }

  async function saveUserVariables(vars) {
    const data = await read();
    data.userVariables = { ...(data.userVariables ?? {}), ...vars };
    await write(data);
  }

  async function deleteUserVariable(name) {
    const data = await read();
    if (data.userVariables) delete data.userVariables[name];
    await write(data);
  }

  // ── History ─────────────────────────────────────────────────────────────────

  async function appendHistory(record) {
    const data = await read();
    data.history = data.history || [];
    data.history.unshift(record);
    if (data.history.length > 500) data.history = data.history.slice(0, 500);
    await write(data);
  }

  async function getHistory(limit = 50) {
    const data = await read();
    return (data.history || []).slice(0, limit);
  }

  // ── Utilities ───────────────────────────────────────────────────────────────

  function genId(prefix = 'id') {
    return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  }

  function slugify(str) {
    return str.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  return {
    read,
    write,
    getCommands,
    saveCommand,
    deleteCommand,
    incrementUsageCount,
    getStacks,
    saveStack,
    deleteStack,
    getSettings,
    saveSettings,
    getUserVariables,
    saveUserVariables,
    deleteUserVariable,
    appendHistory,
    getHistory,
    genId,
  };
})();
