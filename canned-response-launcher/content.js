/**
 * CRL — content.js
 * Command System content script.
 *
 * Responsibilities:
 *  1. Track active editable field
 *  2. Detect slash triggers (/cmd + Space/Enter) and text expansions (;;xx + Space/Enter)
 *  3. Open Raycast-style command palette on Ctrl+Space
 *  4. Handle messages from background (hotkeys, context menu)
 *  5. Execute commands via CRLExecutor
 *
 * Depends on: config.js, auth.js, api-client.js,
 *             core/storage.js, core/context.js, core/conditions.js,
 *             core/variables.js, core/history.js, core/executor.js
 */

(() => {

  // ─── Extension context guard ──────────────────────────────────────────────────
  // When the extension reloads or the MV3 service worker restarts, existing
  // content scripts become "orphaned" — chrome.* APIs throw
  // "Extension context invalidated". We detect this early and shut down cleanly
  // rather than spamming the console with unhandled promise rejections.

  let _contextDead = false;

  function isContextAlive() {
    if (_contextDead) return false;
    try {
      // chrome.runtime.id becomes undefined when the context is invalidated.
      if (!chrome?.runtime?.id) { _contextDead = true; return false; }
      return true;
    } catch {
      _contextDead = true;
      return false;
    }
  }

  // Poll every 10 s; the moment the context dies, show a one-time toast.
  const _ctxPoller = setInterval(() => {
    if (!isContextAlive()) {
      clearInterval(_ctxPoller);
      _showReloadToast();
    }
  }, 10_000);

  function _showReloadToast() {
    try {
      const t = document.createElement('div');
      t.setAttribute('style', [
        'position:fixed;bottom:20px;right:20px;z-index:2147483647',
        'background:#1a1a1f;color:#e2e8f0;border:1px solid #3a3a4a',
        'border-radius:10px;padding:12px 18px;font:14px/1.5 system-ui,sans-serif',
        'box-shadow:0 4px 20px #0008;max-width:320px',
      ].join(';'));
      t.textContent = '⚡ CannedIQ was updated — refresh this tab to re-activate it.';
      document.body?.appendChild(t);
      setTimeout(() => t.remove(), 8000);
    } catch {}
  }

  // ─── Built-in commands ───────────────────────────────────────────────────────

  const AI_REPLY_CMD = {
    id:          '__ai_reply__',
    name:        'AI Reply',
    description: 'Generate a reply based on selected text',
    commandType: 'ai_reply',
    triggers:    [{ type: 'slash', value: '/ai-reply' }],
    favorite:    false,
    usageCount:  0,
  };

  // ─── State ───────────────────────────────────────────────────────────────────

  let activeField  = null;  // last focused editable element
  let savedCursor  = null;  // { start, end } snapshotted when palette opens
  let palette      = null;  // the palette root element
  let paletteItems = [];    // flattened command list for keyboard nav
  let focusedIdx   = -1;
  let searchQuery  = '';
  let activeStack  = 'all';

  // Cached data refreshed whenever palette opens
  let cachedCommands = [];
  let cachedStacks   = [];

  // ─── Selection snapshot ────────────────────────────────────────────────────
  // Clicking into a text field clears window.getSelection(). We track the last
  // non-empty selection so {{selectedText}} works even after the user has typed
  // their slash trigger in the reply field.

  let lastPageSelection = '';

  document.addEventListener('selectionchange', () => {
    const sel = window.getSelection()?.toString() ?? '';
    if (sel.trim()) lastPageSelection = sel;
  });

  // Expose it so CRLContext.gather() can pick it up as a fallback.
  window.__crlLastPageSelection = () => lastPageSelection;

  // ─── Field tracking ──────────────────────────────────────────────────────────

  function isEditable(el) {
    if (!el) return false;
    const tag = el.tagName;
    if (tag === 'TEXTAREA') return true;
    if (tag === 'INPUT') {
      const blocked = ['checkbox', 'radio', 'file', 'submit', 'button', 'image', 'range', 'color'];
      return !blocked.includes((el.type || '').toLowerCase());
    }
    return el.isContentEditable === true;
  }

  document.addEventListener('focusin', (e) => {
    if (palette && palette.contains(e.target)) return;
    if (document.getElementById('crl-var-modal')?.contains(e.target)) return;
    if (isEditable(e.target)) activeField = e.target;
  }, true);

  // ─── Keyboard handling ────────────────────────────────────────────────────────

  document.addEventListener('keydown', handleKeyDown, true);

  async function handleKeyDown(e) {
    if (!isContextAlive()) return;

    // Ctrl+Space (Win/Linux) or Cmd+Shift+Space (Mac) → toggle palette
    // Also accept Ctrl+Shift+Space as a universal fallback.
    const isOpenPalette =
      (e.ctrlKey && !e.metaKey && !e.shiftKey && e.code === 'Space') ||   // Ctrl+Space
      (e.ctrlKey && !e.metaKey &&  e.shiftKey && e.code === 'Space') ||   // Ctrl+Shift+Space
      (e.metaKey && !e.ctrlKey &&  e.shiftKey && e.code === 'Space');      // Cmd+Shift+Space (Mac)
    if (isOpenPalette) {
      e.preventDefault();
      e.stopPropagation();
      if (palette) closePalette();
      else openPalette();
      return;
    }

    // Palette navigation
    if (palette) {
      switch (e.key) {
        case 'ArrowDown': e.preventDefault(); e.stopPropagation(); moveFocus(1);  return;
        case 'ArrowUp':   e.preventDefault(); e.stopPropagation(); moveFocus(-1); return;
        case 'Enter':     e.preventDefault(); e.stopPropagation(); confirmSelection(); return;
        case 'Escape':    e.preventDefault(); e.stopPropagation(); closePalette(); return;
      }
      return; // don't let keystrokes pass through when palette is open
    }

    // Variable modal handles its own keyboard — bail out
    if (document.getElementById('crl-var-modal')) return;

    // Trigger detection: fire on Space or Enter
    if ((e.key === ' ' || e.key === 'Enter') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (!activeField) return;
      const matched = await detectTrigger(activeField);
      if (matched) {
        e.preventDefault();
        e.stopPropagation();
        await launchFromTrigger(matched);
      }
    }
  }

  // ─── Trigger detection ────────────────────────────────────────────────────────

  async function detectTrigger(field) {
    if (!cachedCommands.length) {
      cachedCommands = await CRLStorage.getCommands();
    }

    let textBefore = '';
    let cursorPos  = 0;

    if (field.tagName === 'TEXTAREA' || field.tagName === 'INPUT') {
      cursorPos  = field.selectionStart ?? (field.value || '').length;
      textBefore = (field.value || '').slice(0, cursorPos);
    } else if (field.isContentEditable) {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return null;
      textBefore = (field.innerText || '').slice(0, sel.getRangeAt(0).startOffset);
      cursorPos  = textBefore.length;
    }

    // Built-in: /ai-reply
    if (textBefore.endsWith('/ai-reply')) {
      const start = cursorPos - '/ai-reply'.length;
      return { cmd: AI_REPLY_CMD, start, end: cursorPos, triggerType: 'slash', builtin: true };
    }

    for (const cmd of cachedCommands) {
      for (const trigger of (cmd.triggers || [])) {
        if (!trigger.value) continue;

        if (trigger.type === 'slash') {
          const val = trigger.value.startsWith('/') ? trigger.value : '/' + trigger.value;
          if (textBefore.endsWith(val)) {
            return { cmd, start: cursorPos - val.length, end: cursorPos, triggerType: 'slash' };
          }
        }

        if (trigger.type === 'text') {
          if (textBefore.endsWith(trigger.value)) {
            const start = cursorPos - trigger.value.length;
            return { cmd, start, end: cursorPos, triggerType: 'text' };
          }
        }
      }
    }

    return null;
  }

  async function launchFromTrigger({ cmd, start, end, triggerType }) {
    // ── Built-in: AI Reply ───────────────────────────────────────────────────────
    if (cmd.commandType === 'ai_reply') {
      // Remove the trigger text
      if (activeField && (activeField.tagName === 'TEXTAREA' || activeField.tagName === 'INPUT')) {
        if (typeof activeField.setRangeText === 'function') {
          activeField.setRangeText('', start, end, 'start');
        }
        savedCursor = { start, end: start };
      }
      await CRLAIReply.launch(activeField, savedCursor);
      savedCursor = null;
      return;
    }

    // ── Gate: AI commands ────────────────────────────────────────────────────────
    if (cmd.commandType === 'ai') {
      const user = await CRLGates.getUser();
      if (!CRLGates.canUseAICommands(user)) {
        CRLUpgrade.show('ai');
        return;
      }
    }

    // ── Gate: context-aware commands ─────────────────────────────────────────────
    if (cmd.commandType === 'contextAware') {
      const user = await CRLGates.getUser();
      if (!CRLGates.canUseContextCommands(user)) {
        CRLUpgrade.show('context');
        return;
      }
    }

    // Remove trigger text before executing
    if (activeField && (activeField.tagName === 'TEXTAREA' || activeField.tagName === 'INPUT')) {
      if (typeof activeField.setRangeText === 'function') {
        activeField.setRangeText('', start, end, 'start');
      }
      savedCursor = { start, end: start };
    }

    await CRLExecutor.execute(cmd, {
      activeField,
      savedCursor,
      triggerType,
      triggerStart: start,
      triggerEnd:   start,
    });

    savedCursor = null;
    lastPageSelection = ''; // Clear after use so it doesn't bleed into future commands

    // ── Heavy-use nudge (after successful launch) ─────────────────────────────────
    const user = await CRLGates.getUser();
    if (await CRLGates.shouldShowHeavyUseNudge(user)) {
      setTimeout(() => CRLUpgrade.show('heavy_use'), 800);
    }
  }

  // ─── Command palette: open ────────────────────────────────────────────────────

  async function openPalette() {
    if (palette) closePalette();

    // Snapshot cursor before we steal focus
    if (activeField && (activeField.tagName === 'TEXTAREA' || activeField.tagName === 'INPUT')) {
      savedCursor = { start: activeField.selectionStart, end: activeField.selectionEnd };
    } else {
      savedCursor = null;
    }

    // Load local commands + stacks
    [cachedCommands, cachedStacks] = await Promise.all([
      CRLStorage.getCommands(),
      CRLStorage.getStacks(),
    ]);

    // Merge cloud responses for signed-in users
    try {
      const session = await Auth.getValidSession();
      if (session) {
        const [cloudCats, cloudTeamCats] = await Promise.all([
          Api.getCategories().catch(() => []),
          Api.getTeamCategories().catch(() => []),
        ]);

        const cloudCmds = [...cloudCats, ...cloudTeamCats].flatMap((cat) =>
          (cat.responses || []).map((r) => ({
            id: r.id, name: r.title, description: '',
            stackId: cat.teamId ? 'team_' + cat.teamId : 'general',
            commandType: 'static', template: r.text,
            triggers: [], variables: [], conditions: [], actions: [{ type: 'insert_text' }],
            aiEnabled: false, aiPrompt: '', favorite: false,
            usageCount: r.useCount || 0,
            _source: cat.teamName ? `Team: ${cat.teamName}` : null,
          }))
        );

        const localIds = new Set(cachedCommands.map((c) => c.id));
        cloudCmds.forEach((cc) => { if (!localIds.has(cc.id)) cachedCommands.push(cc); });

        // Add team stacks
        const seenTeams = new Map();
        cloudTeamCats.forEach((c) => {
          if (c.teamId && !seenTeams.has(c.teamId)) {
            seenTeams.set(c.teamId, c.teamName || 'Team');
          }
        });
        seenTeams.forEach((name, id) => {
          const stackId = 'team_' + id;
          if (!cachedStacks.find((s) => s.id === stackId)) {
            cachedStacks.push({ id: stackId, name, color: '#0EA5E9', icon: 'users' });
          }
        });
      }
    } catch { /* local-only mode */ }

    buildPalette();
    document.body.appendChild(palette);
    palette.querySelector('.crl-palette-search').focus();
  }

  // ─── Command palette: build DOM ───────────────────────────────────────────────

  function buildPalette() {
    palette = document.createElement('div');
    palette.id = 'crl-palette';
    palette.className = 'crl-palette';

    // Backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'crl-palette-backdrop';
    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop) closePalette();
    });

    // Box
    const box = document.createElement('div');
    box.className = 'crl-palette-box';

    // ── Search bar
    const searchWrap = document.createElement('div');
    searchWrap.className = 'crl-palette-searchbar';

    const searchIcon = document.createElement('span');
    searchIcon.className = 'crl-palette-search-icon';
    searchIcon.innerHTML = `<svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="9" r="6"/><path d="M15 15l-3.5-3.5"/></svg>`;

    const searchInput = document.createElement('input');
    searchInput.className = 'crl-palette-search';
    searchInput.type = 'text';
    searchInput.placeholder = 'Search commands…';
    searchInput.autocomplete = 'off';
    searchInput.spellcheck = false;
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase();
      renderItems();
    });

    const escHint = document.createElement('kbd');
    escHint.className = 'crl-palette-esc';
    escHint.textContent = 'Esc';

    searchWrap.appendChild(searchIcon);
    searchWrap.appendChild(searchInput);
    searchWrap.appendChild(escHint);

    // ── Stack filter chips
    const filters = document.createElement('div');
    filters.className = 'crl-palette-filters';
    buildFilterChips(filters);

    // ── Command list
    const list = document.createElement('div');
    list.className = 'crl-palette-list';

    // ── Footer
    const footer = document.createElement('div');
    footer.className = 'crl-palette-footer';
    footer.innerHTML = '<span>↑↓ Navigate</span><span>↵ Launch</span><span>Esc Close</span>';

    box.appendChild(searchWrap);
    box.appendChild(filters);
    box.appendChild(list);
    box.appendChild(footer);
    palette.appendChild(backdrop);
    palette.appendChild(box);

    renderItems();
  }

  function buildFilterChips(container) {
    container.innerHTML = '';
    const usedIds = new Set(cachedCommands.map((c) => c.stackId));

    makeChip(container, 'All', 'all', activeStack === 'all');

    cachedStacks
      .filter((s) => usedIds.has(s.id))
      .forEach((s) => makeChip(container, s.name, s.id, activeStack === s.id, s.color));
  }

  function makeChip(container, label, id, active, color) {
    const chip = document.createElement('button');
    chip.className = 'crl-palette-chip' + (active ? ' active' : '');
    chip.textContent = label;
    chip.type = 'button';
    if (color && active) chip.style.setProperty('--chip-color', color);
    chip.addEventListener('mousedown', (e) => {
      e.preventDefault();
      activeStack = id;
      container.querySelectorAll('.crl-palette-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      renderItems();
    });
    container.appendChild(chip);
  }

  // ─── Command palette: render items ───────────────────────────────────────────

  const TYPE_LABEL = { static: 'static', variable: 'var', contextAware: 'ctx', ai: 'ai', ai_reply: 'ai', workflow: 'flow' };

  function renderItems() {
    const list = palette.querySelector('.crl-palette-list');
    list.innerHTML = '';
    paletteItems = [];
    focusedIdx   = -1;

    // Always include AI Reply as the first built-in entry (if it matches the search)
    const q = searchQuery;
    const builtins = (!q || 'ai reply'.includes(q) || '/ai-reply'.includes(q))
      ? [AI_REPLY_CMD]
      : [];

    let cmds = [
      ...builtins,
      ...cachedCommands.filter((cmd) => {
        if (activeStack !== 'all' && cmd.stackId !== activeStack) return false;
        if (!q) return true;
        return (
          cmd.name.toLowerCase().includes(q) ||
          (cmd.description || '').toLowerCase().includes(q) ||
          (cmd.triggers || []).some((t) => (t.value || '').toLowerCase().includes(q)) ||
          (cmd.template   || '').toLowerCase().includes(q)
        );
      }),
    ];

    // Sort: favorites → usage count
    cmds.sort((a, b) => {
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      return (b.usageCount || 0) - (a.usageCount || 0);
    });

    if (cmds.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'crl-palette-empty';
      empty.textContent = searchQuery
        ? `No commands match "${searchQuery}"`
        : 'No commands in this stack.';
      list.appendChild(empty);
      return;
    }

    cmds.forEach((cmd) => {
      const stack   = cachedStacks.find((s) => s.id === cmd.stackId);
      const trigger = (cmd.triggers || []).find((t) => t.type === 'slash' || t.type === 'text');
      const idx     = paletteItems.length;

      const item = document.createElement('div');
      item.className = 'crl-palette-item';
      item.setAttribute('role', 'option');
      item.dataset.idx = idx;

      // Left
      const left = document.createElement('div');
      left.className = 'crl-palette-item-left';

      if (cmd.favorite) {
        const star = document.createElement('span');
        star.className = 'crl-palette-star';
        star.textContent = '★';
        left.appendChild(star);
      }

      const nameEl = document.createElement('span');
      nameEl.className = 'crl-palette-name';
      nameEl.textContent = cmd.name;

      const descEl = document.createElement('span');
      descEl.className = 'crl-palette-desc';
      descEl.textContent = cmd._source || cmd.description || '';

      left.appendChild(nameEl);
      if (descEl.textContent) left.appendChild(descEl);

      // Right
      const right = document.createElement('div');
      right.className = 'crl-palette-item-right';

      if (trigger) {
        const t = document.createElement('code');
        t.className = 'crl-palette-trigger';
        t.textContent = trigger.value;
        right.appendChild(t);
      }

      if (stack) {
        const s = document.createElement('span');
        s.className = 'crl-palette-stack-badge';
        s.textContent = stack.name;
        if (stack.color) s.style.color = stack.color;
        right.appendChild(s);
      }

      const typeEl = document.createElement('span');
      typeEl.className = `crl-palette-type-badge crl-type-${cmd.commandType || 'static'}`;
      typeEl.textContent = TYPE_LABEL[cmd.commandType] || cmd.commandType || 'static';
      right.appendChild(typeEl);

      item.appendChild(left);
      item.appendChild(right);

      item.addEventListener('mouseenter', () => setFocus(idx));
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        setFocus(idx);
        confirmSelection();
      });

      list.appendChild(item);
      paletteItems.push({ cmd, el: item });
    });

    if (paletteItems.length > 0) setFocus(0);
  }

  // ─── Command palette: navigation ──────────────────────────────────────────────

  function setFocus(idx) {
    if (idx < 0 || idx >= paletteItems.length) return;
    if (focusedIdx >= 0 && paletteItems[focusedIdx]) {
      paletteItems[focusedIdx].el.classList.remove('focused');
    }
    focusedIdx = idx;
    paletteItems[idx].el.classList.add('focused');
    paletteItems[idx].el.scrollIntoView({ block: 'nearest' });
  }

  function moveFocus(delta) {
    if (!paletteItems.length) return;
    setFocus(Math.max(0, Math.min(paletteItems.length - 1, focusedIdx + delta)));
  }

  async function confirmSelection() {
    if (focusedIdx < 0 || !paletteItems[focusedIdx]) return;
    const { cmd } = paletteItems[focusedIdx];
    closePalette();

    // ── Built-in: AI Reply ───────────────────────────────────────────────────────
    if (cmd.commandType === 'ai_reply') {
      await CRLAIReply.launch(activeField, savedCursor);
      savedCursor = null;
      return;
    }

    // ── Gate checks before execution ─────────────────────────────────────────────
    const user = await CRLGates.getUser();

    if (cmd.commandType === 'ai' && !CRLGates.canUseAICommands(user)) {
      CRLUpgrade.show('ai');
      return;
    }
    if (cmd.commandType === 'contextAware' && !CRLGates.canUseContextCommands(user)) {
      CRLUpgrade.show('context');
      return;
    }

    await CRLExecutor.execute(cmd, { activeField, savedCursor, triggerType: 'palette' });
    savedCursor = null;

    // Heavy-use nudge
    if (await CRLGates.shouldShowHeavyUseNudge(user)) {
      setTimeout(() => CRLUpgrade.show('heavy_use'), 800);
    }
  }

  // ─── Command palette: close ───────────────────────────────────────────────────

  function closePalette() {
    if (palette) { palette.remove(); palette = null; }
    paletteItems = [];
    focusedIdx   = -1;
    searchQuery  = '';
    activeStack  = 'all';
  }

  // ─── Messages from background ─────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

    if (msg.type === 'OPEN_PALETTE') {
      if (palette) closePalette(); else openPalette();
      sendResponse({ ok: true });
      return true;
    }

    if (msg.type === 'OPEN_AI_REPLY') {
      CRLAIReply.launch(activeField, savedCursor);
      sendResponse({ ok: true });
      return true;
    }

    if (msg.type === 'CONTEXT_MENU_COMMAND') {
      CRLStorage.getCommands().then((cmds) => {
        const cmd = cmds.find((c) => c.id === msg.commandId);
        if (cmd) {
          CRLExecutor.execute(cmd, {
            activeField, savedCursor, triggerType: 'contextMenu',
          });
        }
      });
      sendResponse({ ok: true });
      return true;
    }
  });

})();
