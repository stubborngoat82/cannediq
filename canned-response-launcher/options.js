/**
 * CRL — options.js
 * Command System options page.
 *
 * Tabs: Commands | Teams | Billing | Settings
 * Commands tab: stack sidebar + command list + command editor modal
 * Teams + Billing: unchanged from v1 (Supabase-backed)
 * Settings: AI config, privacy, import/export
 */

(() => {

  // ─── State ─────────────────────────────────────────────────────────────────

  let currentUser    = null;
  let currentProfile = null;

  // Commands tab
  let allCommands    = [];
  let allStacks      = [];
  let selectedStack  = 'all';    // 'all' or stack id
  let filterQuery    = '';
  let editingCmd     = null;     // command being edited (null = new)

  // Editing sub-lists inside modal
  let editTriggers   = [];
  let editVariables  = [];
  let editConditions = [];
  let editActions    = [{ type: 'insert_text' }];

  // Teams tab
  let teams          = [];
  let expandedTeamId = null;
  let _teamCatTargetTeamId = null;

  // ─── Init ───────────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', async () => {
    wireAuthEvents();
    wireTabEvents();
    wireCommandsTab();
    wireStackModal();
    wireCommandModal();
    wireTeamModals();
    wireSettingsTab();
    wireFocusRefresh();
    await checkAuth();
  });

  // Re-load the billing tab whenever this page regains focus (e.g. user returns
  // from a Stripe Checkout tab after completing payment).
  function wireFocusRefresh() {
    let lastActiveBillingRefresh = 0;
    window.addEventListener('focus', () => {
      const now = Date.now();
      // Debounce — don't hammer Supabase if the window flickers focus rapidly
      if (now - lastActiveBillingRefresh < 3000) return;
      const billingPanel = document.getElementById('tab-billing');
      if (billingPanel && billingPanel.style.display !== 'none') {
        lastActiveBillingRefresh = now;
        loadBillingTab();
      }
    });
  }

  // ─── Auth ───────────────────────────────────────────────────────────────────

  async function checkAuth() {
    try {
      const session = await Auth.getValidSession();
      if (session) {
        currentUser = session.user;
        await enterAuthenticatedMode();
      } else {
        enterGuestMode();
      }
    } catch {
      enterGuestMode();
    }
  }

  async function enterAuthenticatedMode() {
    try { currentProfile = await Api.getProfile(); } catch {}
    const effectiveUser = {
      ...currentUser,
      tier: currentProfile?.tier ?? currentUser?.tier ?? 'free',
    };
    renderAccountWidget(effectiveUser);
    document.getElementById('auth-panel').hidden = true;
    document.getElementById('tab-nav').hidden    = false;

    // Honour ?tab=billing (or any valid tab) in the URL — used by portal return URL
    const urlTab    = new URLSearchParams(window.location.search).get('tab');
    const validTabs = ['commands', 'teams', 'billing', 'settings'];
    const startTab  = validTabs.includes(urlTab) ? urlTab : 'commands';
    activateTab(startTab);
    if (startTab === 'commands') await loadCommandsTab();
  }

  function enterGuestMode() {
    currentUser    = null;
    currentProfile = null;
    renderAccountWidget(null);
    document.getElementById('auth-panel').hidden = false;
    document.getElementById('tab-nav').hidden    = true;
    showTabPanel('commands');
    loadCommandsTab();
  }

  function renderAccountWidget(user) {
    const widget = document.getElementById('account-widget');
    if (user) {
      widget.innerHTML = `
        <div class="account-info">
          <span class="account-email">${escHtml(user.email ?? '')}</span>
          <span class="account-tier tier-${user.tier ?? 'free'}">${(user.tier ?? 'free').toUpperCase()}</span>
          <button id="btn-signout" class="btn btn-ghost btn-sm">Sign out</button>
        </div>`;
      document.getElementById('btn-signout').addEventListener('click', handleSignOut);
    } else {
      widget.innerHTML = '';
    }
  }

  // ─── Auth form ──────────────────────────────────────────────────────────────

  function wireAuthEvents() {
    document.querySelectorAll('.auth-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.auth-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        const mode = tab.dataset.tab;
        document.getElementById('auth-submit').textContent  = mode === 'signup' ? 'Create account' : 'Sign in';
        document.getElementById('auth-password').autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
        clearAuthError();
      });
    });

    document.getElementById('auth-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const mode = document.querySelector('.auth-tab.active').dataset.tab;
      const email    = document.getElementById('auth-email').value.trim();
      const password = document.getElementById('auth-password').value;
      if (!email || !password) return;

      setAuthLoading(true);
      clearAuthError();
      try {
        if (mode === 'signup') {
          const { session, needsConfirmation } = await Auth.signUpWithEmail(email, password);
          if (needsConfirmation) {
            document.getElementById('auth-confirm-msg').hidden = false;
          } else if (session) {
            currentUser = session.user;
            await enterAuthenticatedMode();
          }
        } else {
          const session = await Auth.signInWithEmail(email, password);
          currentUser = session.user;
          await enterAuthenticatedMode();
        }
      } catch (err) {
        showAuthError(err.message);
      } finally {
        setAuthLoading(false);
      }
    });

    document.getElementById('btn-google').addEventListener('click', async () => {
      setAuthLoading(true); clearAuthError();
      try {
        const session = await Auth.signInWithGoogle();
        currentUser = session.user;
        await enterAuthenticatedMode();
      } catch (err) {
        const cancelled = /cancel|close|approve/i.test(err.message);
        if (!cancelled) showAuthError(err.message);
      } finally {
        setAuthLoading(false);
      }
    });
  }

  async function handleSignOut() {
    try { await Auth.signOut(); } catch {}
    currentUser    = null;
    currentProfile = null;
    allCommands    = [];
    allStacks      = [];
    teams          = [];
    enterGuestMode();
  }

  function showAuthError(msg) { const el = document.getElementById('auth-error'); el.textContent = msg; el.hidden = false; }
  function clearAuthError()   { const el = document.getElementById('auth-error'); el.hidden = true; el.textContent = ''; }
  function setAuthLoading(on) { document.getElementById('auth-submit').disabled = on; document.getElementById('btn-google').disabled = on; }

  // ─── Tab navigation ─────────────────────────────────────────────────────────

  function wireTabEvents() {
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => activateTab(btn.dataset.tab));
    });
  }

  function activateTab(name) {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    showTabPanel(name);
    if (name === 'teams')    loadTeamsTab();
    if (name === 'billing')  loadBillingTab();
    if (name === 'settings') loadSettingsTab();
  }

  function showTabPanel(name) {
    document.querySelectorAll('.tab-panel').forEach((p) => { p.classList.remove('active'); p.style.display = 'none'; });
    const panel = document.getElementById(`tab-${name}`);
    if (panel) { panel.classList.add('active'); panel.style.display = 'block'; }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COMMANDS TAB
  // ═══════════════════════════════════════════════════════════════════════════

  function wireCommandsTab() {
    document.getElementById('btn-new-command').addEventListener('click', () => openCommandModal(null));
    document.getElementById('cmd-search').addEventListener('input', (e) => {
      filterQuery = e.target.value.toLowerCase();
      renderCommandList();
    });
  }

  async function loadCommandsTab() {
    [allCommands, allStacks] = await Promise.all([
      CRLStorage.getCommands(),
      CRLStorage.getStacks(),
    ]);
    renderStackSidebar();
    renderCommandList();
  }

  // ── Stack sidebar ────────────────────────────────────────────────────────────

  function renderStackSidebar() {
    const list = document.getElementById('stack-list');
    list.innerHTML = '';

    const makeItem = (id, name, color, count) => {
      const li = document.createElement('li');
      li.className = 'stack-item' + (selectedStack === id ? ' active' : '');
      li.dataset.id = id;
      li.innerHTML = `
        <span class="stack-dot" style="background:${color || '#9ca3af'}"></span>
        <span class="stack-name">${escHtml(name)}</span>
        <span class="stack-count">${count}</span>`;
      li.addEventListener('click', () => {
        selectedStack = id;
        renderStackSidebar();
        renderCommandList();
      });
      return li;
    };

    const allCount = allCommands.length;
    list.appendChild(makeItem('all', 'All', '#9ca3af', allCount));

    allStacks.forEach((s) => {
      const count = allCommands.filter((c) => c.stackId === s.id).length;
      const li = makeItem(s.id, s.name, s.color, count);

      // Edit / delete on hover
      const actions = document.createElement('div');
      actions.className = 'stack-item-actions';
      actions.innerHTML = `
        <button class="stack-action-btn" title="Edit stack" data-action="edit">✏</button>
        <button class="stack-action-btn" title="Delete stack" data-action="del">✕</button>`;
      actions.querySelector('[data-action="edit"]').addEventListener('click', (e) => { e.stopPropagation(); openStackModal(s); });
      actions.querySelector('[data-action="del"]').addEventListener('click',  (e) => { e.stopPropagation(); deleteStack(s.id, s.name); });
      li.appendChild(actions);

      list.appendChild(li);
    });

    // Update panel title
    const stack = allStacks.find((s) => s.id === selectedStack);
    document.getElementById('cmd-panel-title').textContent = stack ? stack.name : 'All Commands';
  }

  // ── Command list ─────────────────────────────────────────────────────────────

  const TYPE_LABEL = { static: 'Static', variable: 'Variable', contextAware: 'Context', ai: 'AI', workflow: 'Workflow' };
  const TYPE_CLASS = { static: '',       variable: 'var',       contextAware: 'ctx',     ai: 'ai',  workflow: 'flow' };

  function renderCommandList() {
    const container = document.getElementById('cmd-list');
    container.innerHTML = '';

    let cmds = allCommands.filter((cmd) => {
      if (selectedStack !== 'all' && cmd.stackId !== selectedStack) return false;
      if (!filterQuery) return true;
      return (
        cmd.name.toLowerCase().includes(filterQuery) ||
        (cmd.description || '').toLowerCase().includes(filterQuery) ||
        (cmd.template    || '').toLowerCase().includes(filterQuery) ||
        (cmd.triggers || []).some((t) => (t.value || '').toLowerCase().includes(filterQuery))
      );
    });

    // Favorites first, then usage
    cmds.sort((a, b) => {
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      return (b.usageCount || 0) - (a.usageCount || 0);
    });

    document.getElementById('cmd-panel-count').textContent = cmds.length;

    if (cmds.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'cmd-empty';
      empty.innerHTML = filterQuery
        ? `No commands match "<strong>${escHtml(filterQuery)}</strong>"`
        : selectedStack === 'all'
          ? 'No commands yet. Click <strong>+ New Command</strong> to create your first.'
          : 'No commands in this stack yet.';
      container.appendChild(empty);
      return;
    }

    cmds.forEach((cmd) => {
      const stack = allStacks.find((s) => s.id === cmd.stackId);
      const triggers = (cmd.triggers || []).map((t) => t.value).join('  ');
      const typeClass = TYPE_CLASS[cmd.commandType] || '';
      const typeLabel = TYPE_LABEL[cmd.commandType] || cmd.commandType;

      const card = document.createElement('div');
      card.className = 'cmd-card';
      card.innerHTML = `
        <div class="cmd-card-left">
          ${cmd.favorite ? '<span class="cmd-star">★</span>' : ''}
          <div class="cmd-card-body">
            <div class="cmd-card-name">${escHtml(cmd.name)}</div>
            <div class="cmd-card-preview">${escHtml((cmd.description || cmd.template || '').slice(0, 80))}</div>
          </div>
        </div>
        <div class="cmd-card-right">
          ${triggers ? `<code class="cmd-trigger-hint">${escHtml(triggers)}</code>` : ''}
          ${stack ? `<span class="cmd-stack-badge" style="color:${stack.color || '#6b7280'}">${escHtml(stack.name)}</span>` : ''}
          <span class="cmd-type-badge cmd-type-${typeClass}">${typeLabel}</span>
          <div class="cmd-card-actions">
            <button class="btn btn-ghost btn-xs btn-edit-cmd" title="Edit">Edit</button>
            <button class="btn btn-danger btn-xs btn-del-cmd" title="Delete">✕</button>
          </div>
        </div>`;

      card.querySelector('.btn-edit-cmd').addEventListener('click', () => openCommandModal(cmd));
      card.querySelector('.btn-del-cmd').addEventListener('click',  () => deleteCommand(cmd));
      container.appendChild(card);
    });
  }

  // ── Stack CRUD ───────────────────────────────────────────────────────────────

  function wireStackModal() {
    document.getElementById('btn-new-stack').addEventListener('click',   () => openStackModal(null));
    document.getElementById('modal-stack-cancel').addEventListener('click', () => closeModal('modal-stack'));
    document.querySelector('#modal-stack .modal-backdrop').addEventListener('click', () => closeModal('modal-stack'));
    document.getElementById('modal-stack-save').addEventListener('click', saveStack);
    document.getElementById('stack-name-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveStack();
      if (e.key === 'Escape') closeModal('modal-stack');
    });
  }

  function openStackModal(stack) {
    const modal = document.getElementById('modal-stack');
    document.getElementById('modal-stack-title').textContent = stack ? 'Edit Stack' : 'New Stack';
    document.getElementById('stack-name-input').value  = stack?.name  || '';
    document.getElementById('stack-color-input').value = stack?.color || '#6366f1';
    modal._editId = stack?.id || null;
    modal.hidden  = false;
    document.getElementById('stack-name-input').focus();
  }

  async function saveStack() {
    const name  = document.getElementById('stack-name-input').value.trim();
    const color = document.getElementById('stack-color-input').value;
    if (!name) { document.getElementById('stack-name-input').focus(); return; }

    const modal = document.getElementById('modal-stack');
    const id    = modal._editId || CRLStorage.genId('stack');

    await CRLStorage.saveStack({ id, name, color, icon: 'layers', defaultForSites: [] });
    closeModal('modal-stack');
    await loadCommandsTab();
    // Tell background to rebuild context menus
    chrome.runtime.sendMessage({ type: 'REBUILD_MENUS' });
  }

  async function deleteStack(id, name) {
    if (!confirm(`Delete stack "${name}"? Commands in it will move to General.`)) return;
    await CRLStorage.deleteStack(id);
    if (selectedStack === id) selectedStack = 'all';
    await loadCommandsTab();
    chrome.runtime.sendMessage({ type: 'REBUILD_MENUS' });
  }

  // ── Command CRUD ─────────────────────────────────────────────────────────────

  function wireCommandModal() {
    document.getElementById('modal-command-close').addEventListener('click',  () => closeModal('modal-command'));
    document.getElementById('modal-command-cancel').addEventListener('click', () => closeModal('modal-command'));
    document.querySelector('#modal-command .modal-backdrop').addEventListener('click', () => closeModal('modal-command'));
    document.getElementById('modal-command-save').addEventListener('click', saveCommandModal);

    // Show/hide AI prompt vs template based on type
    document.getElementById('cmd-type').addEventListener('change', (e) => {
      const isAI = e.target.value === 'ai';
      document.getElementById('cmd-template-label').hidden  = isAI;
      document.getElementById('cmd-ai-prompt-label').hidden = !isAI;
    });

    // Show dropdown options input when var type is dropdown
    document.getElementById('var-type').addEventListener('change', (e) => {
      document.getElementById('var-options-row').hidden = e.target.value !== 'dropdown';
    });

    // Trigger add
    document.getElementById('btn-add-trigger').addEventListener('click', addTrigger);
    document.getElementById('trigger-value-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addTrigger();
    });

    // Variable add
    document.getElementById('btn-add-variable').addEventListener('click', addVariable);

    // Condition add
    document.getElementById('btn-add-condition').addEventListener('click', addCondition);

    // Action add
    document.getElementById('btn-add-action').addEventListener('click', addAction);
  }

  function openCommandModal(cmd) {
    editingCmd  = cmd || null;
    editTriggers   = [...(cmd?.triggers   || [])];
    editVariables  = [...(cmd?.variables  || [])];
    editConditions = [...(cmd?.conditions || [])];
    editActions    = [...(cmd?.actions    || [{ type: 'insert_text' }])];

    const modal = document.getElementById('modal-command');
    document.getElementById('modal-command-title').textContent = cmd ? 'Edit Command' : 'New Command';

    document.getElementById('cmd-name').value        = cmd?.name        || '';
    document.getElementById('cmd-description').value = cmd?.description || '';
    document.getElementById('cmd-template').value    = cmd?.template    || '';
    document.getElementById('cmd-ai-prompt').value   = cmd?.aiPrompt   || '';
    document.getElementById('cmd-favorite').checked  = cmd?.favorite   || false;

    // Type select
    const typeEl = document.getElementById('cmd-type');
    typeEl.value = cmd?.commandType || 'static';
    const isAI = typeEl.value === 'ai';
    document.getElementById('cmd-template-label').hidden  = isAI;
    document.getElementById('cmd-ai-prompt-label').hidden = !isAI;

    // Stack select
    const stackEl = document.getElementById('cmd-stack');
    stackEl.innerHTML = allStacks.map((s) =>
      `<option value="${escHtml(s.id)}" ${cmd?.stackId === s.id ? 'selected' : ''}>${escHtml(s.name)}</option>`
    ).join('');
    if (!cmd?.stackId && selectedStack !== 'all') {
      stackEl.value = selectedStack;
    }

    // Render sub-lists
    renderTriggerList();
    renderVariableList();
    renderConditionList();
    renderActionList();

    modal.hidden = false;
    document.getElementById('cmd-name').focus();
  }

  async function saveCommandModal() {
    const name = document.getElementById('cmd-name').value.trim();
    if (!name) { document.getElementById('cmd-name').focus(); return; }

    const typeEl = document.getElementById('cmd-type');
    const isAI   = typeEl.value === 'ai';

    const cmd = {
      id:          editingCmd?.id || CRLStorage.genId('cmd'),
      name,
      description: document.getElementById('cmd-description').value.trim(),
      stackId:     document.getElementById('cmd-stack').value || 'general',
      commandType: typeEl.value,
      template:    isAI ? (editingCmd?.template || '') : document.getElementById('cmd-template').value,
      aiEnabled:   isAI,
      aiPrompt:    isAI ? document.getElementById('cmd-ai-prompt').value : '',
      triggers:    editTriggers,
      variables:   editVariables,
      conditions:  editConditions,
      actions:     editActions.length ? editActions : [{ type: 'insert_text' }],
      favorite:    document.getElementById('cmd-favorite').checked,
      usageCount:  editingCmd?.usageCount || 0,
    };

    await CRLStorage.saveCommand(cmd);
    closeModal('modal-command');
    await loadCommandsTab();
    chrome.runtime.sendMessage({ type: 'REBUILD_MENUS' });
  }

  async function deleteCommand(cmd) {
    if (!confirm(`Delete command "${cmd.name}"? This cannot be undone.`)) return;
    await CRLStorage.deleteCommand(cmd.id);
    await loadCommandsTab();
    chrome.runtime.sendMessage({ type: 'REBUILD_MENUS' });
  }

  // ── Triggers sub-list ────────────────────────────────────────────────────────

  function renderTriggerList() {
    const list = document.getElementById('trigger-list');
    list.innerHTML = '';
    document.getElementById('triggers-badge').textContent = editTriggers.length;

    editTriggers.forEach((t, i) => {
      const chip = makeChip(`${t.type === 'slash' ? '/' : ';;'}  ${t.value}`, () => {
        editTriggers.splice(i, 1);
        renderTriggerList();
      });
      list.appendChild(chip);
    });
  }

  function addTrigger() {
    let val = document.getElementById('trigger-value-input').value.trim();
    const type = document.getElementById('trigger-type-select').value;
    if (!val) return;

    // Normalise
    if (type === 'slash' && !val.startsWith('/')) val = '/' + val;
    if (type === 'text'  && !val.startsWith(';;')) val = val; // keep as-is

    // Prevent duplicates
    if (editTriggers.find((t) => t.value === val)) return;
    editTriggers.push({ type, value: val });
    document.getElementById('trigger-value-input').value = '';
    renderTriggerList();
  }

  // ── Variables sub-list ───────────────────────────────────────────────────────

  function renderVariableList() {
    const list = document.getElementById('variable-list');
    list.innerHTML = '';
    document.getElementById('variables-badge').textContent = editVariables.length;

    editVariables.forEach((v, i) => {
      const label = `{{${v.key}}} ${v.label ? `· ${v.label}` : ''} (${v.type})${v.required ? ' *' : ''}`;
      const chip  = makeChip(label, () => { editVariables.splice(i, 1); renderVariableList(); });
      list.appendChild(chip);
    });
  }

  function addVariable() {
    const key   = document.getElementById('var-key').value.trim().replace(/\s+/g, '_');
    const label = document.getElementById('var-label').value.trim() || key;
    const type  = document.getElementById('var-type').value;
    const req   = document.getElementById('var-required').checked;
    if (!key) { document.getElementById('var-key').focus(); return; }
    if (editVariables.find((v) => v.key === key)) return;

    const v = { key, label, type, required: req };
    if (type === 'dropdown') {
      const opts = document.getElementById('var-options').value;
      v.options = opts.split(',').map((s) => s.trim()).filter(Boolean);
    }

    editVariables.push(v);
    document.getElementById('var-key').value   = '';
    document.getElementById('var-label').value = '';
    document.getElementById('var-options').value = '';
    renderVariableList();
  }

  // ── Conditions sub-list ──────────────────────────────────────────────────────

  function renderConditionList() {
    const list = document.getElementById('condition-list');
    list.innerHTML = '';
    document.getElementById('conditions-badge').textContent = editConditions.length;

    editConditions.forEach((c, i) => {
      const label = `${c.type} ${c.operator} "${c.value || ''}"`;
      const chip  = makeChip(label, () => { editConditions.splice(i, 1); renderConditionList(); });
      list.appendChild(chip);
    });
  }

  function addCondition() {
    const type     = document.getElementById('cond-type').value;
    const operator = document.getElementById('cond-operator').value;
    const value    = document.getElementById('cond-value').value.trim();
    editConditions.push({ type, operator, value });
    document.getElementById('cond-value').value = '';
    renderConditionList();
  }

  // ── Actions sub-list ─────────────────────────────────────────────────────────

  const ACTION_LABELS = {
    insert_text:       'Insert text at cursor',
    replace_selection: 'Replace selection',
    copy_to_clipboard: 'Copy to clipboard',
    open_url:          'Open URL',
    submit_form:       'Submit form',
    click_button:      'Click button',
    chain_command:     'Chain command',
  };

  function renderActionList() {
    const list = document.getElementById('action-list');
    list.innerHTML = '';
    document.getElementById('actions-badge').textContent = editActions.length;

    editActions.forEach((a, i) => {
      const label = ACTION_LABELS[a.type] || a.type;
      const chip  = makeChip(label, () => { editActions.splice(i, 1); if (!editActions.length) editActions.push({ type: 'insert_text' }); renderActionList(); });
      list.appendChild(chip);
    });
  }

  function addAction() {
    const type = document.getElementById('action-type-select').value;
    editActions.push({ type });
    renderActionList();
  }

  // ── Chip helper ──────────────────────────────────────────────────────────────

  function makeChip(label, onRemove) {
    const chip = document.createElement('span');
    chip.className = 'adv-chip';
    chip.innerHTML = `${escHtml(label)} <button type="button" class="adv-chip-remove" title="Remove">×</button>`;
    chip.querySelector('.adv-chip-remove').addEventListener('click', onRemove);
    return chip;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEAMS TAB  (unchanged from v1)
  // ═══════════════════════════════════════════════════════════════════════════

  function wireTeamModals() {
    document.getElementById('btn-create-team').addEventListener('click', () => openModal('modal-create-team'));
    document.getElementById('modal-create-team-cancel').addEventListener('click', () => closeModal('modal-create-team'));
    document.querySelector('#modal-create-team .modal-backdrop').addEventListener('click', () => closeModal('modal-create-team'));
    document.getElementById('modal-create-team-save').addEventListener('click', handleCreateTeam);
    document.getElementById('modal-team-name-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleCreateTeam();
      if (e.key === 'Escape') closeModal('modal-create-team');
    });

    document.getElementById('modal-invite-cancel').addEventListener('click', () => closeModal('modal-invite-member'));
    document.querySelector('#modal-invite-member .modal-backdrop').addEventListener('click', () => closeModal('modal-invite-member'));
    document.getElementById('modal-invite-save').addEventListener('click', () => closeModal('modal-invite-member'));

    document.getElementById('modal-team-cat-cancel').addEventListener('click', () => closeModal('modal-team-category'));
    document.querySelector('#modal-team-category .modal-backdrop').addEventListener('click', () => closeModal('modal-team-category'));
    document.getElementById('modal-team-cat-save').addEventListener('click', handleCreateTeamCategory);
    document.getElementById('modal-team-cat-name-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleCreateTeamCategory();
      if (e.key === 'Escape') closeModal('modal-team-category');
    });
  }

  async function loadTeamsTab() {
    if (!currentUser) {
      document.getElementById('teams-list').innerHTML = '<p class="empty-hint">Sign in to use teams.</p>';
      return;
    }
    const listEl = document.getElementById('teams-list');
    listEl.innerHTML = '<p class="empty-hint">Loading…</p>';
    try {
      teams = await Api.getTeams();
      renderTeamsList();
    } catch (err) {
      listEl.innerHTML = `<p class="empty-hint" style="color:#dc2626">${escHtml(err.message)}</p>`;
    }
    await loadTeamLibrary();
  }

  function renderTeamsList() {
    const listEl = document.getElementById('teams-list');
    listEl.innerHTML = '';
    if (teams.length === 0) {
      listEl.innerHTML = '<p class="empty-hint">No teams yet. Create one to share a command library with your colleagues.</p>';
      return;
    }
    teams.forEach((team) => {
      const isExpanded = team.id === expandedTeamId;
      const card = document.createElement('div');
      card.className = 'team-card';
      card.innerHTML = `
        <div class="team-card-header">
          <div>
            <div class="team-card-name">${escHtml(team.name)}</div>
            <div class="team-card-meta">${team.isOwner ? 'You own this team' : 'You are a member'}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="team-role-badge ${team.role === 'owner' ? '' : 'member'}">${team.role}</span>
            ${team.isOwner ? `
              <button class="btn btn-ghost btn-sm btn-manage" data-id="${team.id}">${isExpanded ? 'Collapse' : 'Manage'}</button>
              <button class="btn btn-danger btn-sm btn-delete-team" data-id="${team.id}">Delete</button>
            ` : `
              <button class="btn btn-ghost btn-sm btn-leave-team" data-id="${team.id}">Leave</button>
            `}
          </div>
        </div>
        ${isExpanded ? renderTeamDetailHTML(team) : ''}`;

      card.querySelector('.btn-manage')?.addEventListener('click', async () => {
        expandedTeamId = isExpanded ? null : team.id;
        renderTeamsList();
        if (!isExpanded) await refreshExpandedTeam(team.id);
      });
      card.querySelector('.btn-delete-team')?.addEventListener('click', () => handleDeleteTeam(team.id, team.name));
      card.querySelector('.btn-leave-team')?.addEventListener('click',  () => handleLeaveTeam(team.id));

      if (isExpanded) wireExpandedTeamButtons(card, team);
      listEl.appendChild(card);
    });
  }

  function renderTeamDetailHTML(team) {
    return `
      <div class="team-members-section" id="team-detail-${team.id}">
        <div class="team-members-title">Members</div>
        <ul class="member-list" id="member-list-${team.id}"><li class="member-item" style="color:#9ca3af;font-style:italic">Loading…</li></ul>
        <div class="team-members-title" style="margin-top:16px">Invite by email</div>
        <p style="font-size:12px;color:#9ca3af;margin-bottom:8px">We'll email them a link. They sign up and are added automatically.</p>
        <div class="invite-row">
          <input type="email" class="invite-input" placeholder="colleague@company.com" data-team-id="${team.id}" />
          <button class="btn btn-primary btn-sm btn-inline-invite" data-team-id="${team.id}">Send invite</button>
        </div>
        <div id="invite-feedback-${team.id}" style="margin-top:8px"></div>
        <div class="team-members-title" style="margin-top:16px">Pending invites</div>
        <ul class="member-list" id="pending-list-${team.id}"><li class="member-item" style="color:#9ca3af;font-style:italic">Loading…</li></ul>
        <div class="team-cats-section">
          <div class="team-members-title" style="margin-top:16px">Team Categories</div>
          <ul class="team-cat-list" id="team-cat-list-${team.id}"><li style="font-size:13px;color:#9ca3af;font-style:italic">Loading…</li></ul>
          <button class="btn btn-ghost btn-sm btn-add-team-cat" data-team-id="${team.id}" style="margin-top:6px">+ Add Category</button>
        </div>
      </div>`;
  }

  function wireExpandedTeamButtons(card, team) {
    const inviteBtn = card.querySelector('.btn-inline-invite');
    if (inviteBtn) {
      inviteBtn.addEventListener('click', async () => {
        const input = card.querySelector(`.invite-input[data-team-id="${team.id}"]`);
        await doSendInvite(team.id, input.value.trim(), input);
      });
    }
    const inviteInput = card.querySelector(`.invite-input[data-team-id="${team.id}"]`);
    if (inviteInput) {
      inviteInput.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') await doSendInvite(team.id, inviteInput.value.trim(), inviteInput);
      });
    }
    const addCatBtn = card.querySelector('.btn-add-team-cat');
    if (addCatBtn) {
      addCatBtn.addEventListener('click', () => {
        _teamCatTargetTeamId = team.id;
        document.getElementById('modal-team-cat-name-input').value = '';
        document.getElementById('modal-team-category').hidden = false;
        document.getElementById('modal-team-cat-name-input').focus();
      });
    }
  }

  async function refreshExpandedTeam(teamId) {
    try {
      const [members, pendingInvites, teamCats] = await Promise.all([
        Api.getTeamMembers(teamId),
        Api.getPendingInvites(teamId),
        Api.getTeamCategories(),
      ]);

      const memberListEl = document.getElementById(`member-list-${teamId}`);
      if (memberListEl) {
        memberListEl.innerHTML = members.length === 0
          ? '<li class="member-item" style="font-style:italic;color:#9ca3af">No members yet.</li>'
          : members.map((m) => `
              <li class="member-item">
                <span class="member-email">${escHtml(m.userId)}</span>
                <span class="member-role">${escHtml(m.role)}</span>
                <button class="btn btn-icon btn-remove-member" data-team-id="${teamId}" data-user-id="${m.userId}" title="Remove">✕</button>
              </li>`).join('');
        memberListEl.querySelectorAll('.btn-remove-member').forEach((btn) => {
          btn.addEventListener('click', async () => {
            if (!confirm('Remove this member?')) return;
            try { await Api.removeTeamMember(btn.dataset.teamId, btn.dataset.userId); await refreshExpandedTeam(teamId); }
            catch (err) { alert(err.message); }
          });
        });
      }

      const pendingListEl = document.getElementById(`pending-list-${teamId}`);
      if (pendingListEl) {
        pendingListEl.innerHTML = pendingInvites.length === 0
          ? '<li class="member-item" style="font-style:italic;color:#9ca3af">No pending invites.</li>'
          : pendingInvites.map((inv) => {
              const days = Math.ceil((new Date(inv.expiresAt) - Date.now()) / 86400000);
              return `
                <li class="member-item">
                  <span class="member-email">${escHtml(inv.email)}</span>
                  <span class="member-role" style="color:#f59e0b">expires ${days}d</span>
                  <button class="btn btn-icon btn-revoke-invite" data-invite-id="${inv.id}" title="Revoke">✕</button>
                </li>`;
            }).join('');
        pendingListEl.querySelectorAll('.btn-revoke-invite').forEach((btn) => {
          btn.addEventListener('click', async () => {
            if (!confirm('Revoke this invite?')) return;
            try { await Api.revokeInvite(btn.dataset.inviteId); await refreshExpandedTeam(teamId); }
            catch (err) { alert(err.message); }
          });
        });
      }

      const catListEl = document.getElementById(`team-cat-list-${teamId}`);
      if (catListEl) {
        const thisCats = teamCats.filter((c) => c.teamId === teamId);
        catListEl.innerHTML = thisCats.length === 0
          ? '<li style="font-size:13px;color:#9ca3af;font-style:italic">No team categories yet.</li>'
          : thisCats.map((c) => `<li class="team-cat-item"><span class="team-cat-dot"></span>${escHtml(c.name)} <span style="color:#9ca3af;font-size:11px">(${c.responses.length} responses)</span></li>`).join('');
      }
    } catch (err) { console.warn('[CRL] refreshExpandedTeam error', err.message); }
  }

  async function doSendInvite(teamId, email, inputEl) {
    if (!email) { inputEl?.focus(); return; }
    const feedbackEl = document.getElementById(`invite-feedback-${teamId}`);
    const btn = document.querySelector(`.btn-inline-invite[data-team-id="${teamId}"]`);
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    try {
      const { link } = await Api.sendTeamInvite(teamId, email);
      if (inputEl) inputEl.value = '';
      if (feedbackEl) {
        feedbackEl.innerHTML = `
          <span style="font-size:12.5px;color:#059669">✓ Invite sent to ${escHtml(email)}.</span>
          <button class="btn-link" style="font-size:12px;margin-left:8px" onclick="navigator.clipboard.writeText('${escHtml(link)}').then(()=>this.textContent='Copied!').catch(()=>{})">Copy link</button>`;
      }
      await refreshExpandedTeam(teamId);
    } catch (err) {
      if (feedbackEl) feedbackEl.innerHTML = `<span style="font-size:12.5px;color:#dc2626">${escHtml(err.message)}</span>`;
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Send invite'; }
    }
  }

  async function handleCreateTeam() {
    const name = document.getElementById('modal-team-name-input').value.trim();
    if (!name) { document.getElementById('modal-team-name-input').focus(); return; }
    try { await Api.createTeam(name); closeModal('modal-create-team'); await loadTeamsTab(); }
    catch (err) { alert(err.message); }
  }

  async function handleDeleteTeam(teamId, teamName) {
    if (!confirm(`Delete team "${teamName}" and all its shared categories?`)) return;
    try { await Api.deleteTeam(teamId); expandedTeamId = null; await loadTeamsTab(); }
    catch (err) { alert(err.message); }
  }

  async function handleLeaveTeam(teamId) {
    if (!confirm('Leave this team?')) return;
    try {
      const session = await Auth.getValidSession();
      await Api.removeTeamMember(teamId, session.user.id);
      await loadTeamsTab();
    } catch (err) { alert(err.message); }
  }

  async function handleCreateTeamCategory() {
    const name = document.getElementById('modal-team-cat-name-input').value.trim();
    if (!name || !_teamCatTargetTeamId) return;
    try {
      await Api.createTeamCategory(_teamCatTargetTeamId, name);
      closeModal('modal-team-category');
      await refreshExpandedTeam(_teamCatTargetTeamId);
      await loadTeamLibrary();
    } catch (err) { alert(err.message); }
  }

  async function loadTeamLibrary() {
    const listEl = document.getElementById('team-library-list');
    if (!listEl) return;
    try {
      const teamCats = await Api.getTeamCategories();
      if (teamCats.length === 0) { listEl.innerHTML = '<p class="empty-hint">No team categories yet.</p>'; return; }
      listEl.innerHTML = '';
      teamCats.forEach((cat) => {
        const div = document.createElement('div');
        div.className = 'team-card';
        div.innerHTML = `
          <div class="team-card-header">
            <div>
              <div class="team-card-name">${escHtml(cat.name)}</div>
              <div class="team-card-meta">${escHtml(cat.teamName ?? 'Team')} · ${cat.responses.length} responses</div>
            </div>
          </div>`;
        listEl.appendChild(div);
      });
    } catch { listEl.innerHTML = '<p class="empty-hint">Could not load team library.</p>'; }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BILLING TAB — CannedIQ plan management
  // ═══════════════════════════════════════════════════════════════════════════

  function showToast(msg, type = 'info') {
    document.getElementById('crl-options-toast')?.remove();
    const t = document.createElement('div');
    t.id = 'crl-options-toast';
    Object.assign(t.style, {
      position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
      background: type === 'error' ? '#ef4444' : '#111827',
      color: '#fff', padding: '10px 18px', borderRadius: '8px',
      fontSize: '13px', fontWeight: '500', zIndex: '9999',
      boxShadow: '0 4px 16px rgba(0,0,0,.25)', pointerEvents: 'none',
    });
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }

  const PLAN_META = {
    free: {
      label: 'Free', price: '$0', period: '',
      color: '#64748b',
      features: [
        { text: '25 Commands', on: true },
        { text: '3 Stacks', on: true },
        { text: 'Basic triggers & variables', on: true },
        { text: 'Context-aware commands', on: false },
        { text: 'Unlimited commands & stacks', on: false },
        { text: 'AI Commands', on: false },
        { text: 'Shared Stacks (Team)', on: false },
      ],
    },
    pro: {
      label: 'Pro', price: '$10', period: '/mo',
      color: '#3b82f6',
      popular: true,
      features: [
        { text: 'Unlimited Commands & Stacks', on: true },
        { text: 'Advanced variables', on: true },
        { text: 'Context-aware commands', on: true },
        { text: 'Favorites & Usage history', on: true },
        { text: 'Import / Export', on: true },
        { text: 'AI Commands', on: false },
        { text: 'Shared Stacks (Team)', on: false },
      ],
    },
    ai: {
      label: 'Pro+ AI', price: '$20', period: '/mo',
      color: '#8b5cf6',
      features: [
        { text: 'Everything in Pro', on: true },
        { text: 'AI Commands (500 credits/month)', on: true },
        { text: 'Tone controls', on: true },
        { text: 'Prompt templates', on: true },
        { text: 'Context-aware generation', on: true },
        { text: 'Shared Stacks (Team)', on: false },
      ],
    },
    team: {
      label: 'Team', price: '$12', period: '/user/mo',
      color: '#10b981',
      features: [
        { text: 'Everything in Pro', on: true },
        { text: 'Shared Stacks & templates', on: true },
        { text: 'Admin controls', on: true },
        { text: 'Team analytics', on: true },
        { text: 'Centralized command management', on: true },
      ],
    },
  };

  async function loadBillingTab() {
    const contentEl = document.getElementById('billing-content');
    if (!contentEl) return;
    contentEl.innerHTML = '<p class="empty-hint" style="padding:24px">Loading billing info…</p>';

    // Refresh plan from background (which fetches from Supabase)
    const planData = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'REFRESH_PLAN' }, (res) => resolve(res?.plan ?? null));
    });

    // Also try direct profile fetch for richer data
    try { currentProfile = await Api.getProfile(); } catch {}

    const plan   = planData?.plan ?? currentProfile?.plan ?? 'free';
    const status = planData?.subscriptionStatus ?? currentProfile?.subscription_status ?? null;
    const periodEnd = planData?.currentPeriodEnd ?? currentProfile?.current_period_end ?? null;
    const cancelAtEnd = planData?.cancelAtPeriodEnd ?? currentProfile?.cancel_at_period_end ?? false;
    const aiCredits = planData?.aiCreditsRemaining ?? currentProfile?.ai_credits_remaining ?? 0;
    const isLoggedIn = !!(currentUser || currentProfile);

    contentEl.innerHTML = '';

    // ── Status banner (paid users) ────────────────────────────────────────────────
    if (plan !== 'free' && status === 'active') {
      const meta = PLAN_META[plan] ?? PLAN_META.pro;
      const banner = document.createElement('div');
      banner.className = 'billing-banner billing-banner--active';
      banner.innerHTML = `
        <span class="billing-banner-dot"></span>
        You're on <strong>${meta.label}</strong>${status === 'trialing' ? ' (trial active)' : ''}
        ${cancelAtEnd ? '<span class="billing-banner-cancel"> · Cancels at end of period</span>' : ''}
        <button class="btn-link billing-banner-manage" id="btn-manage-billing">Manage billing →</button>
      `;
      banner.querySelector('#btn-manage-billing')?.addEventListener('click', handleOpenPortal);
      contentEl.appendChild(banner);
    } else if (plan !== 'free' && status === 'past_due') {
      const pastDueBanner = document.createElement('div');
      pastDueBanner.className = 'billing-banner billing-banner--warning';
      pastDueBanner.innerHTML = `⚠ Payment failed. Please update your payment method.
        <button class="btn-link billing-banner-manage" id="btn-fix-billing">Fix payment →</button>`;
      pastDueBanner.querySelector('#btn-fix-billing')?.addEventListener('click', handleOpenPortal);
      contentEl.appendChild(pastDueBanner);
    }

    // ── Current plan summary ──────────────────────────────────────────────────────
    const meta = PLAN_META[plan] ?? PLAN_META.free;
    const renewalStr = periodEnd
      ? new Date(periodEnd).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
      : null;

    const summary = document.createElement('div');
    summary.className = 'billing-summary';
    summary.innerHTML = `
      <div class="billing-summary-left">
        <div class="billing-plan-badge" style="background:${meta.color}22;color:${meta.color};border-color:${meta.color}44">
          ${meta.label}
        </div>
        <div class="billing-plan-price">${meta.price}<span>${meta.period}</span></div>
        ${renewalStr && !cancelAtEnd ? `<div class="billing-renews">Renews ${renewalStr}</div>` : ''}
        ${renewalStr && cancelAtEnd  ? `<div class="billing-renews billing-renews--cancel">Access until ${renewalStr}</div>` : ''}
        ${plan === 'ai' ? `
          <div class="billing-ai-meter">
            <div class="billing-ai-meter-label">AI Credits <strong>${aiCredits} / 500</strong> remaining</div>
            <div class="billing-ai-bar-track">
              <div class="billing-ai-bar-fill" style="width:${Math.round(aiCredits / 5)}%"></div>
            </div>
          </div>` : ''}
      </div>
      <div class="billing-summary-right">
        ${plan !== 'free' ? '<button class="btn btn-ghost" id="btn-billing-portal">Manage billing</button>' : ''}
        ${plan === 'free' && isLoggedIn ? '<button class="btn btn-primary" id="btn-upgrade-cta">Upgrade to Pro →</button>' : ''}
        ${!isLoggedIn ? '<p class="billing-signin-hint">Sign in to manage your subscription.</p>' : ''}
      </div>
    `;
    contentEl.appendChild(summary);

    summary.querySelector('#btn-billing-portal')?.addEventListener('click', handleOpenPortal);
    summary.querySelector('#btn-upgrade-cta')?.addEventListener('click', () => handleCheckout('pro'));

    // ── Plan cards ────────────────────────────────────────────────────────────────
    const heading = document.createElement('h3');
    heading.className = 'billing-plans-heading';
    heading.textContent = plan === 'free' ? 'Upgrade your plan' : 'All plans';
    contentEl.appendChild(heading);

    const grid = document.createElement('div');
    grid.className = 'billing-plan-grid';

    Object.entries(PLAN_META).forEach(([planKey, m]) => {
      const isCurrent = planKey === plan;
      const card = document.createElement('div');
      card.className = `billing-plan-card${isCurrent ? ' billing-plan-card--current' : ''}${m.popular ? ' billing-plan-card--popular' : ''}`;
      card.style.setProperty('--plan-color', m.color);

      card.innerHTML = `
        ${m.popular && !isCurrent ? '<div class="billing-plan-popular-badge">Most Popular</div>' : ''}
        ${isCurrent ? '<div class="billing-plan-current-badge">Current plan</div>' : ''}
        <div class="billing-plan-name">${m.label}</div>
        <div class="billing-plan-price-row">
          <span class="billing-plan-amount">${m.price}</span>
          <span class="billing-plan-period">${m.period}</span>
        </div>
        <ul class="billing-plan-features">
          ${m.features.map(f => `
            <li class="${f.on ? '' : 'billing-feat-off'}">
              <span class="billing-feat-icon">${f.on ? '✓' : '–'}</span>
              ${f.text}
            </li>`).join('')}
        </ul>
        ${planKey === 'team' && !isCurrent ? `
          <div class="billing-seats-row">
            <label class="billing-seats-label">Seats</label>
            <input id="seats-${planKey}" type="number" min="1" max="500" value="1"
              class="billing-seats-input" />
          </div>` : ''}
        ${isCurrent
          ? '<button class="billing-plan-btn billing-plan-btn--current" disabled>Current plan</button>'
          : planKey === 'free'
          ? '<button class="billing-plan-btn billing-plan-btn--ghost" disabled>Free plan</button>'
          : `<button class="billing-plan-btn billing-plan-btn--upgrade" data-plan="${planKey}" id="btn-plan-${planKey}">
               ${planKey === 'pro' ? 'Upgrade to Pro' : planKey === 'ai' ? 'Unlock AI' : 'Start Team Plan'}
             </button>`
        }
      `;
      grid.appendChild(card);
    });

    contentEl.appendChild(grid);

    // Wire upgrade buttons
    grid.querySelectorAll('.billing-plan-btn--upgrade').forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = btn.dataset.plan;
        const seats = parseInt(document.getElementById(`seats-${p}`)?.value || '1', 10);
        handleCheckout(p, seats);
      });
    });

    const note = document.createElement('p');
    note.className = 'billing-stripe-note';
    note.innerHTML = '🔒 Payments processed securely by Stripe. Cancel any time. Billing by AHPUSHIT LLC.';
    contentEl.appendChild(note);
  }

  // ── Checkout ──────────────────────────────────────────────────────────────────

  async function handleCheckout(plan, quantity = 1) {
    const btn = document.getElementById(`btn-plan-${plan}`) ?? document.getElementById('btn-upgrade-cta');
    const origText = btn?.textContent;
    if (btn) { btn.disabled = true; btn.textContent = 'Redirecting to Stripe…'; }

    try {
      const url = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'BILLING_CHECKOUT', plan, quantity }, (res) => {
          if (res?.error) reject(new Error(res.error));
          else resolve(res?.url);
        });
      });
      if (url) chrome.tabs.create({ url });
      else showToast('Could not start checkout. Please try again.', 'error');
    } catch (err) {
      showToast(`Checkout error: ${err.message}`, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = origText; }
    }
  }

  // ── Portal ────────────────────────────────────────────────────────────────────

  async function handleOpenPortal() {
    const btn = document.getElementById('btn-billing-portal') ?? document.getElementById('btn-manage-billing');
    const origText = btn?.textContent;
    if (btn) { btn.disabled = true; btn.textContent = 'Opening…'; }

    try {
      const url = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'BILLING_PORTAL' }, (res) => {
          if (res?.error) reject(new Error(res.error));
          else resolve(res?.url);
        });
      });
      if (url) chrome.tabs.create({ url });
      else showToast('Could not open billing portal. Please try again.', 'error');
    } catch (err) {
      showToast(`Portal error: ${err.message}`, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = origText; }
    }
  }

  function tierDescription(tier) {
    if (tier === 'pro')  return 'Unlimited commands and stacks with context-aware triggers.';
    if (tier === 'ai')   return 'Pro features plus 500 AI credits per month for smart responses.';
    if (tier === 'team') return 'Everything in Pro plus shared stacks, templates, and admin controls.';
    return 'Up to 25 commands and 3 stacks, stored locally on this device.';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SETTINGS TAB
  // ═══════════════════════════════════════════════════════════════════════════

  let _settingsWired = false;

  function wireSettingsTab() {}

  async function loadSettingsTab() {
    const settings = await CRLStorage.getSettings();
    document.getElementById('setting-clipboard-enabled').checked = settings.clipboardEnabled || false;

    if (!_settingsWired) {
      _settingsWired = true;
      document.getElementById('btn-save-settings').addEventListener('click', saveSettings);
      document.getElementById('btn-export-commands').addEventListener('click', exportCommands);
      document.getElementById('btn-import-commands').addEventListener('click', () => document.getElementById('import-file-input').click());
      document.getElementById('import-file-input').addEventListener('change', importCommands);
    }

    await loadAIUsage();
  }

  async function saveSettings() {
    await CRLStorage.saveSettings({
      clipboardEnabled: document.getElementById('setting-clipboard-enabled').checked,
    });
    const msg = document.getElementById('settings-saved-msg');
    msg.hidden = false;
    setTimeout(() => { msg.hidden = true; }, 2500);
  }

  // ── AI usage meter ──────────────────────────────────────────────────────────

  async function loadAIUsage() {
    const el = document.getElementById('ai-usage-content');
    if (!el) return;

    const tier = currentProfile?.tier ?? 'free';

    if (!currentUser) {
      el.innerHTML = renderAIGuestCard();
      el.querySelector('#btn-ai-signin')?.addEventListener('click', () => {
        document.getElementById('auth-panel').hidden = false;
        document.getElementById('tab-nav').hidden    = true;
      });
      return;
    }

    if (tier === 'free') {
      el.innerHTML = renderAIUpgradeCard();
      el.querySelector('#btn-ai-upgrade')?.addEventListener('click', () => activateTab('billing'));
      return;
    }

    // Paid user — fetch live usage from the ai_usage view
    el.innerHTML = '<div class="settings-row"><span style="color:#9ca3af;font-size:13px">Loading usage…</span></div>';
    try {
      const session = await Auth.getValidSession();
      const res = await fetch(
        `${REST_URL}/ai_usage?user_id=eq.${encodeURIComponent(currentUser.id)}&select=used,quota,resets_at`,
        { headers: { 'Authorization': `Bearer ${session.access_token}`, 'apikey': SUPABASE_ANON } }
      );
      const rows = await res.json();
      const row  = Array.isArray(rows) ? rows[0] : null;

      const used     = row?.used     ?? 0;
      const quota    = row?.quota    ?? (tier === 'team' ? 100 : 25);
      const resetsAt = row?.resets_at ? new Date(row.resets_at) : null;
      const resetStr = resetsAt
        ? resetsAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : 'next month';
      const pct = Math.min(100, Math.round((used / quota) * 100));

      el.innerHTML = renderAIUsageMeter({ used, quota, pct, resetStr, tier });
    } catch {
      el.innerHTML = '<div class="settings-row"><span style="color:#9ca3af;font-size:13px">Could not load usage data.</span></div>';
    }
  }

  function renderAIUsageMeter({ used, quota, pct, resetStr, tier }) {
    const barColor = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#4f46e5';
    return `
      <div class="settings-row" style="flex-direction:column;align-items:flex-start;gap:10px;padding:16px 18px">
        <div style="display:flex;align-items:center;justify-content:space-between;width:100%">
          <span style="font-size:13px;font-weight:600;color:#111827">${used} of ${quota} AI requests used this month</span>
          <span style="font-size:12px;color:#9ca3af">Resets ${resetStr}</span>
        </div>
        <div class="ai-usage-bar-track">
          <div class="ai-usage-bar-fill" style="width:${pct}%;background:${barColor}"></div>
        </div>
        <p style="font-size:12px;color:#6b7280;margin:0">
          ${tier === 'team' ? '100 requests/month · Team plan' : '25 requests/month · Pro plan'}
          &nbsp;·&nbsp; Powered by GPT-4o mini
        </p>
      </div>`;
  }

  function renderAIUpgradeCard() {
    return `
      <div class="settings-row ai-locked-row" style="flex-direction:column;align-items:flex-start;gap:10px;padding:16px 18px">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:22px">🔒</span>
          <div>
            <div style="font-size:13px;font-weight:600;color:#111827">AI commands are a Pro feature</div>
            <div style="font-size:12px;color:#6b7280;margin-top:2px">Upgrade to Pro to get 25 AI requests/month. No API key needed.</div>
          </div>
        </div>
        <button id="btn-ai-upgrade" class="btn btn-primary btn-sm">Upgrade to Pro →</button>
      </div>`;
  }

  function renderAIGuestCard() {
    return `
      <div class="settings-row" style="flex-direction:column;align-items:flex-start;gap:10px;padding:16px 18px">
        <div style="font-size:13px;color:#6b7280">Sign in to see your AI usage. AI commands are available on Pro and Team plans.</div>
        <button id="btn-ai-signin" class="btn btn-ghost btn-sm">Sign in →</button>
      </div>`;
  }

  async function exportCommands() {
    const data = await CRLStorage.read();
    const json = JSON.stringify({ commands: data.commands, stacks: data.stacks }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'crl-commands.json'; a.click();
    URL.revokeObjectURL(url);
  }

  async function importCommands(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed.commands)) throw new Error('Invalid format: expected { commands: [] }');

      const data = await CRLStorage.read();
      const existingIds = new Set(data.commands.map((c) => c.id));
      let imported = 0;

      for (const cmd of parsed.commands) {
        if (!cmd.id || !cmd.name) continue;
        if (!existingIds.has(cmd.id)) {
          data.commands.push({ ...cmd, commandType: cmd.commandType || 'static' });
          imported++;
        }
      }

      await CRLStorage.write(data);
      alert(`Imported ${imported} new commands.`);
      await loadCommandsTab();
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
    e.target.value = '';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SHARED UTILITIES
  // ═══════════════════════════════════════════════════════════════════════════

  function openModal(id) {
    const modal = document.getElementById(id);
    modal.hidden = false;
    const first = modal.querySelector('input');
    if (first) { first.value = ''; first.focus(); }
  }

  function closeModal(id) { document.getElementById(id).hidden = true; }

  function escHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function capitalize(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
  }

})();
