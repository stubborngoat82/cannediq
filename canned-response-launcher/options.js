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
  let allCommands    = [];       // personal commands only (no _isTeam)
  let allStacks      = [];
  let teamGroups     = {};       // { [teamId]: { name, color, icon, cmds[] } }
  let selectedStack  = 'all';   // 'all' | personal stack id | 'team:<teamId>'
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
    wireOnboardingModal();
    wireUpgradeSurveyModal();
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

    // Immediately pull team commands so members don't wait up to 30 min for the background alarm
    chrome.runtime.sendMessage({ type: 'SYNC_TEAM_COMMANDS' }, () => {});
    document.getElementById('auth-panel').hidden = true;
    document.getElementById('tab-nav').hidden    = false;

    // If this is a provisioned member on their first login, force a password change first
    if (currentProfile?.must_change_password) {
      showChangePasswordModal();
      return; // Proceed into app after they set a real password
    }

    // EULA gate — must accept before accessing the extension
    // (skipped if already accepted; shows blocking modal otherwise)
    if (typeof EulaModal !== 'undefined') {
      await EulaModal.checkAndShow();
    }

    // New user who hasn't completed onboarding — show the demographics form
    if (currentProfile && !currentProfile.onboarded_at) {
      showOnboardingModal();
      // Don't return — let the app load in the background so they can skip
    }

    // Honour ?tab=billing (or any valid tab) in the URL — used by portal return URL
    const urlTab    = new URLSearchParams(window.location.search).get('tab');
    const validTabs = ['commands', 'teams', 'billing', 'templates', 'settings'];
    const startTab  = validTabs.includes(urlTab) ? urlTab : 'commands';
    activateTab(startTab);
    if (startTab === 'commands') await loadCommandsTab();
  }

  function showChangePasswordModal() {
    const modal = document.getElementById('modal-change-password');
    if (!modal) return;
    modal.hidden = false;
    document.getElementById('change-pw-new')?.focus();
  }

  async function handleChangePassword() {
    const newPw    = document.getElementById('change-pw-new')?.value  ?? '';
    const confirmPw = document.getElementById('change-pw-confirm')?.value ?? '';
    const errEl    = document.getElementById('change-pw-error');
    if (!newPw || newPw.length < 8) {
      if (errEl) errEl.textContent = 'Password must be at least 8 characters.';
      return;
    }
    if (newPw !== confirmPw) {
      if (errEl) errEl.textContent = 'Passwords do not match.';
      return;
    }
    const btn = document.getElementById('change-pw-submit');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
      await Auth.updatePassword(newPw);
      await Api.clearTempPasswordFlag();
      if (currentProfile) currentProfile.must_change_password = false;
      document.getElementById('modal-change-password').hidden = true;
      // Now proceed into the app normally
      const urlTab    = new URLSearchParams(window.location.search).get('tab');
      const validTabs = ['commands', 'teams', 'billing', 'templates', 'settings'];
      const startTab  = validTabs.includes(urlTab) ? urlTab : 'commands';
      activateTab(startTab);
      if (startTab === 'commands') await loadCommandsTab();
    } catch (err) {
      if (errEl) errEl.textContent = err.message;
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Set Password'; }
    }
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

  // ── Forgot password ──────────────────────────────────────────────────────────

  (function wireForgotPassword() {
    const btnForgot    = document.getElementById('btn-forgot-pw');
    const btnBack      = document.getElementById('btn-back-to-signin');
    const panel        = document.getElementById('forgot-pw-panel');
    const authForm     = document.getElementById('auth-form');
    const authTabs     = document.querySelector('.auth-tabs');
    const submitBtn    = document.getElementById('forgot-pw-submit');
    const emailInput   = document.getElementById('forgot-pw-email');
    const errorEl      = document.getElementById('forgot-pw-error');
    const successEl    = document.getElementById('forgot-pw-success');

    if (!btnForgot) return;

    function showForgotPanel() {
      authForm.hidden    = true;
      if (authTabs) authTabs.hidden = true;
      panel.hidden       = false;
      successEl.hidden   = true;
      errorEl.hidden     = true;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send reset link';
      // Pre-fill email if already typed
      const typed = document.getElementById('auth-email')?.value.trim();
      if (typed) emailInput.value = typed;
      emailInput.focus();
    }

    function showSignInPanel() {
      panel.hidden    = true;
      authForm.hidden = false;
      if (authTabs) authTabs.hidden = false;
    }

    btnForgot.addEventListener('click', showForgotPanel);
    btnBack.addEventListener('click', showSignInPanel);

    submitBtn.addEventListener('click', async () => {
      const email = emailInput.value.trim();
      errorEl.hidden = true;
      successEl.hidden = true;

      if (!email) {
        errorEl.textContent = 'Please enter your email address.';
        errorEl.hidden = false;
        emailInput.focus();
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending…';

      try {
        await Auth.sendPasswordReset(email);
        successEl.hidden = false;
        submitBtn.textContent = 'Sent!';
      } catch (e) {
        errorEl.textContent = e.message || 'Failed to send reset email. Please try again.';
        errorEl.hidden = false;
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send reset link';
      }
    });

    emailInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitBtn.click();
    });
  })();

  // ─── Tab navigation ─────────────────────────────────────────────────────────

  // ── Onboarding modal ───────────────────────────────────────────────────────────

  function showOnboardingModal() {
    const modal = document.getElementById('modal-onboarding');
    if (!modal) return;
    modal.hidden = false;
    document.getElementById('ob-full-name')?.focus();
    // Pre-fill name if we have it
    if (currentProfile?.full_name) {
      const el = document.getElementById('ob-full-name');
      if (el) el.value = currentProfile.full_name;
    }
  }

  async function handleOnboardingSubmit(skip = false) {
    const modal = document.getElementById('modal-onboarding');
    const activeTypeBtn = document.querySelector('.ob-type-btn--active');
    const userType = activeTypeBtn?.dataset.type ?? 'personal';

    // Close the modal immediately so the user isn't blocked
    if (modal) modal.hidden = true;

    // Stamp onboarded_at in memory right away so re-entering options
    // doesn't re-show the modal during this session
    if (currentProfile) currentProfile.onboarded_at = new Date().toISOString();

    // Write onboarded_at to the DB via a direct PATCH — this is the flag
    // that prevents the modal from appearing on future sessions.
    // Done separately from saveDemographics so it never gets swallowed.
    try {
      await Api.markOnboarded();
    } catch (err) {
      DEBUG && console.warn('[onboarding] markOnboarded failed:', err);
    }

    // Save richer demographic data — best-effort, non-blocking
    if (!skip) {
      try {
        await Api.saveDemographics({
          fullName:       document.getElementById('ob-full-name')?.value.trim()  || null,
          userType,
          jobTitle:       document.getElementById('ob-job-title')?.value.trim()  || null,
          companyName:    document.getElementById('ob-company')?.value.trim()    || null,
          companySize:    document.getElementById('ob-company-size')?.value      || null,
          useCase:        document.getElementById('ob-use-case')?.value          || null,
          referralSource: document.getElementById('ob-referral')?.value          || null,
        });
      } catch { /* Non-blocking */ }
    }
  }

  // ── Upgrade survey ─────────────────────────────────────────────────────────────
  // _pendingCheckout stores the plan + quantity while the user fills in the survey

  let _pendingCheckout = null;

  function showUpgradeSurvey(plan, quantity) {
    _pendingCheckout = { plan, quantity };
    const modal = document.getElementById('modal-upgrade-survey');
    if (modal) modal.hidden = false;
  }

  async function submitUpgradeSurvey(skip = false) {
    const modal = document.getElementById('modal-upgrade-survey');
    if (modal) modal.hidden = true;

    if (!skip) {
      const select = document.getElementById('upgrade-reason-select')?.value || '';
      const text   = document.getElementById('upgrade-reason-text')?.value.trim() || '';
      const reason = [select, text].filter(Boolean).join(' — ');
      Api.saveUpgradeReason(reason).catch(() => {}); // fire-and-forget
    }

    // Now proceed to checkout
    if (_pendingCheckout) {
      const { plan, quantity } = _pendingCheckout;
      _pendingCheckout = null;
      await doCheckout(plan, quantity);
    }
  }

  function wireTabEvents() {
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => activateTab(btn.dataset.tab));
    });
  }

  function activateTab(name) {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    showTabPanel(name);
    if (name === 'teams')     loadTeamsTab();
    if (name === 'billing')   loadBillingTab();
    if (name === 'templates') loadTemplatesTab();
    if (name === 'settings')  loadSettingsTab();
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
    const [rawCmds, stacks] = await Promise.all([
      CRLStorage.getCommands(),
      CRLStorage.getStacks(),
    ]);

    // Separate personal commands from team-synced commands
    allCommands = rawCmds.filter((c) => !c._isTeam);
    allStacks   = stacks;

    // Group team commands by team for the read-only sidebar section
    teamGroups = {};
    rawCmds.filter((c) => c._isTeam).forEach((c) => {
      const key = c._teamId ?? 'unknown';
      if (!teamGroups[key]) {
        teamGroups[key] = {
          name:  c._stackName  ?? 'Team Library',
          color: c._stackColor ?? '#7c3aed',
          icon:  c._stackIcon  ?? '🏢',
          cmds:  [],
        };
      }
      teamGroups[key].cmds.push(c);
    });

    // Reset selection to personal view if previously on a team that no longer exists
    if (selectedStack.startsWith('team:') && !teamGroups[selectedStack.slice(5)]) {
      selectedStack = 'all';
    }

    renderStackSidebar();
    renderCommandList();
  }

  // ── Stack sidebar ────────────────────────────────────────────────────────────

  function renderStackSidebar() {
    const list = document.getElementById('stack-list');
    list.innerHTML = '';

    const isTeamView = selectedStack.startsWith('team:');

    const makeItem = (id, name, color, count, opts = {}) => {
      const li = document.createElement('li');
      li.className = 'stack-item' + (selectedStack === id ? ' active' : '') + (opts.readOnly ? ' stack-item--team' : '');
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

    // ── Personal section ──────────────────────────────────────────────────────
    const allCount = allCommands.length;
    list.appendChild(makeItem('all', 'All My Commands', '#9ca3af', allCount));

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

    // ── Team libraries section (read-only) ────────────────────────────────────
    if (Object.keys(teamGroups).length > 0) {
      const divider = document.createElement('li');
      divider.className = 'stack-divider';
      divider.textContent = 'Team Libraries';
      list.appendChild(divider);

      Object.entries(teamGroups).forEach(([teamId, group]) => {
        const id = `team:${teamId}`;
        const li = makeItem(id, group.name, group.color, group.cmds.length, { readOnly: true });
        // Add a small lock icon to indicate read-only
        const lock = document.createElement('span');
        lock.className = 'stack-readonly-badge';
        lock.title = 'Shared by team admin — read only';
        lock.textContent = '🔒';
        li.appendChild(lock);
        list.appendChild(li);
      });
    }

    // ── Panel title ───────────────────────────────────────────────────────────
    let panelTitle = 'All Commands';
    if (isTeamView) {
      const teamId = selectedStack.slice(5);
      panelTitle = teamGroups[teamId]?.name ?? 'Team Library';
    } else {
      const stack = allStacks.find((s) => s.id === selectedStack);
      panelTitle = stack ? stack.name : 'All My Commands';
    }
    document.getElementById('cmd-panel-title').textContent = panelTitle;

    // Show/hide "New Command" and "New Stack" buttons based on view mode
    const newCmdBtn   = document.getElementById('btn-new-cmd');
    const newStackBtn = document.getElementById('btn-new-stack');
    if (newCmdBtn)   newCmdBtn.style.display   = isTeamView ? 'none' : '';
    if (newStackBtn) newStackBtn.style.display = isTeamView ? 'none' : '';

    // Show read-only notice on panel if in team view
    let noticeEl = document.getElementById('team-readonly-notice');
    if (isTeamView) {
      if (!noticeEl) {
        noticeEl = document.createElement('div');
        noticeEl.id = 'team-readonly-notice';
        noticeEl.className = 'team-readonly-notice';
        noticeEl.textContent = '🔒 These commands are managed by your team admin. Contact your admin to make changes.';
        const panel = document.getElementById('cmd-list')?.parentElement;
        if (panel) panel.insertBefore(noticeEl, panel.firstChild);
      }
      noticeEl.style.display = '';
    } else if (noticeEl) {
      noticeEl.style.display = 'none';
    }
  }

  // ── Command list ─────────────────────────────────────────────────────────────

  const TYPE_LABEL = { static: 'Static', variable: 'Variable', contextAware: 'Context', ai: 'AI', workflow: 'Workflow' };
  const TYPE_CLASS = { static: '',       variable: 'var',       contextAware: 'ctx',     ai: 'ai',  workflow: 'flow' };

  function renderCommandList() {
    const container = document.getElementById('cmd-list');
    container.innerHTML = '';

    const isTeamView = selectedStack.startsWith('team:');
    const teamId     = isTeamView ? selectedStack.slice(5) : null;

    // Source: personal commands or team commands
    const sourceList = isTeamView
      ? (teamGroups[teamId]?.cmds ?? [])
      : allCommands;

    let cmds = sourceList.filter((cmd) => {
      // Stack filter only applies in personal view
      if (!isTeamView && selectedStack !== 'all' && cmd.stackId !== selectedStack) return false;
      if (!filterQuery) return true;
      return (
        cmd.name.toLowerCase().includes(filterQuery) ||
        (cmd.description || '').toLowerCase().includes(filterQuery) ||
        (cmd.template    || '').toLowerCase().includes(filterQuery) ||
        (cmd.triggers || []).some((t) => (t.value || '').toLowerCase().includes(filterQuery))
      );
    });

    // Favorites first (personal only), then usage
    if (!isTeamView) {
      cmds.sort((a, b) => {
        if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
        return (b.usageCount || 0) - (a.usageCount || 0);
      });
    }

    document.getElementById('cmd-panel-count').textContent = cmds.length;

    if (cmds.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'cmd-empty';
      empty.innerHTML = filterQuery
        ? `No commands match "<strong>${escHtml(filterQuery)}</strong>"`
        : isTeamView
          ? 'No team commands have been published yet.'
          : selectedStack === 'all'
            ? 'No commands yet. Click <strong>+ New Command</strong> to create your first.'
            : 'No commands in this stack yet.';
      container.appendChild(empty);
      return;
    }

    cmds.forEach((cmd) => {
      const stack = isTeamView
        ? { name: teamGroups[teamId]?.name ?? 'Team', color: teamGroups[teamId]?.color }
        : allStacks.find((s) => s.id === cmd.stackId);
      const triggers  = (cmd.triggers || []).map((t) => t.value).join('  ');
      const typeClass = TYPE_CLASS[cmd.commandType] || '';
      const typeLabel = TYPE_LABEL[cmd.commandType] || cmd.commandType;

      const card = document.createElement('div');
      card.className = 'cmd-card' + (isTeamView ? ' cmd-card--readonly' : '');
      card.innerHTML = `
        <div class="cmd-card-left">
          ${(!isTeamView && cmd.favorite) ? '<span class="cmd-star">★</span>' : ''}
          <div class="cmd-card-body">
            <div class="cmd-card-name">${escHtml(cmd.name)}</div>
            <div class="cmd-card-preview">${escHtml((cmd.description || cmd.template || '').slice(0, 80))}</div>
          </div>
        </div>
        <div class="cmd-card-right">
          ${triggers ? `<code class="cmd-trigger-hint">${escHtml(triggers)}</code>` : ''}
          ${stack ? `<span class="cmd-stack-badge" style="color:${stack.color || '#6b7280'}">${escHtml(stack.name)}</span>` : ''}
          <span class="cmd-type-badge cmd-type-${typeClass}">${typeLabel}</span>
          ${isTeamView
            ? `<span class="cmd-readonly-badge" title="Managed by team admin">🔒</span>`
            : `<div class="cmd-card-actions">
                <button class="btn btn-ghost btn-xs btn-edit-cmd" title="Edit">Edit</button>
                <button class="btn btn-danger btn-xs btn-del-cmd" title="Delete">✕</button>
               </div>`
          }
        </div>`;

      if (!isTeamView) {
        card.querySelector('.btn-edit-cmd').addEventListener('click', () => openCommandModal(cmd));
        card.querySelector('.btn-del-cmd').addEventListener('click',  () => deleteCommand(cmd));
      }
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

    // Change-password modal (shown to provisioned members on first login)
    document.getElementById('change-pw-submit')?.addEventListener('click', handleChangePassword);
    document.getElementById('change-pw-new')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('change-pw-confirm')?.focus();
    });
    document.getElementById('change-pw-confirm')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleChangePassword();
    });
  }

  function wireOnboardingModal() {
    document.getElementById('ob-submit')?.addEventListener('click', () => handleOnboardingSubmit(false));
    document.getElementById('ob-skip')?.addEventListener('click',   () => handleOnboardingSubmit(true));
    document.querySelector('#modal-onboarding .modal-backdrop')
      ?.addEventListener('click', () => handleOnboardingSubmit(true));

    // Personal / Professional toggle
    document.querySelectorAll('.ob-type-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.ob-type-btn').forEach((b) => b.classList.remove('ob-type-btn--active'));
        btn.classList.add('ob-type-btn--active');
        const isPro = btn.dataset.type === 'professional';
        // Show/hide professional-only fields
        const proFields = document.getElementById('ob-pro-fields');
        if (proFields) proFields.classList.toggle('ob-pro-fields--hidden', !isPro);
        // Swap use-case optgroups
        const personalGroup = document.getElementById('ob-use-personal-group');
        const workGroup     = document.getElementById('ob-use-work-group');
        if (personalGroup) personalGroup.hidden = isPro;
        if (workGroup)     workGroup.hidden     = !isPro;
        // Reset the use-case select when switching
        const useCase = document.getElementById('ob-use-case');
        if (useCase) useCase.value = '';
      });
    });
  }

  function wireUpgradeSurveyModal() {
    document.getElementById('upgrade-survey-submit')?.addEventListener('click', () => submitUpgradeSurvey(false));
    document.getElementById('upgrade-survey-skip')?.addEventListener('click',   () => submitUpgradeSurvey(true));
    document.querySelector('#modal-upgrade-survey .modal-backdrop')
      ?.addEventListener('click', () => submitUpgradeSurvey(true));
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
            <button class="btn btn-ghost btn-sm btn-manage" data-id="${team.id}">
              ${isExpanded ? 'Collapse' : (team.isOwner || team.role === 'admin') ? 'Manage' : 'View'}
            </button>
            ${team.isOwner ? `
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
    const canManage = team.isOwner || team.role === 'admin';
    return `
      <div class="team-members-section" id="team-detail-${team.id}">

        ${canManage ? `
        <!-- Seat usage bar (admin/owner only) -->
        <div id="seat-usage-${team.id}" class="team-seat-usage">
          <span style="color:#9ca3af;font-style:italic;font-size:12px">Loading seat info…</span>
        </div>

        <!-- Member roster with activity info -->
        <div class="team-members-title">Team Members</div>
        <div class="member-table-header">
          <span>Email</span>
          <span>Last Active</span>
          <span>Status</span>
          <span>Role</span>
          <span></span>
        </div>
        <ul class="member-list member-list--table" id="member-list-${team.id}">
          <li class="member-item" style="color:#9ca3af;font-style:italic">Loading…</li>
        </ul>

        <!-- Pending invites -->
        <div class="team-members-title" style="margin-top:20px">Pending Invites</div>
        <ul class="member-list member-list--table" id="invite-list-${team.id}">
          <li class="member-item" style="color:#9ca3af;font-style:italic">Loading…</li>
        </ul>

        <!-- Add member form -->
        <div class="team-members-title" style="margin-top:20px">Add Member</div>
        <p style="font-size:12px;color:#9ca3af;margin-bottom:10px">
          We'll create an account and email them their login credentials. They're added to your team immediately.
        </p>
        <div class="provision-form">
          <input type="text"  class="provision-name-input"  placeholder="Full name (optional)" data-team-id="${team.id}" />
          <input type="email" class="provision-email-input" placeholder="email@company.com"     data-team-id="${team.id}" />
          <button class="btn btn-primary btn-sm btn-provision" data-team-id="${team.id}">Add &amp; Email Credentials</button>
        </div>
        <div id="provision-feedback-${team.id}" style="margin-top:8px"></div>

        <!-- Team Categories -->
        <div class="team-cats-section">
          <div class="team-members-title" style="margin-top:16px">Team Categories</div>
          <ul class="team-cat-list" id="team-cat-list-${team.id}">
            <li style="font-size:13px;color:#9ca3af;font-style:italic">Loading…</li>
          </ul>
          <button class="btn btn-ghost btn-sm btn-add-team-cat" data-team-id="${team.id}" style="margin-top:6px">+ Add Category</button>
        </div>
        ` : `
        <!-- Member view — shared library summary -->
        <div class="team-members-title">Shared Library</div>
        <div id="member-library-${team.id}" style="padding:8px 0;font-size:13px;color:#9ca3af;font-style:italic">Loading…</div>
        `}

      </div>`;
  }

  function renderSeatUsage(teamId, seatsUsed, seatsPurchased, isOwner = false) {
    const el = document.getElementById(`seat-usage-${teamId}`);
    if (!el) return;
    const pct      = Math.min(100, Math.round((seatsUsed / seatsPurchased) * 100));
    const atLimit  = seatsUsed >= seatsPurchased;
    const barColor = atLimit ? '#dc2626' : pct >= 80 ? '#f59e0b' : '#4f46e5';

    el.innerHTML = `
      <div class="seat-usage-label">
        <span>${seatsUsed} of ${seatsPurchased} seat${seatsPurchased !== 1 ? 's' : ''} used</span>
        ${atLimit
          ? '<span class="seat-badge seat-badge--full">At limit</span>'
          : `<span class="seat-badge">${seatsPurchased - seatsUsed} available</span>`}
      </div>
      <div class="seat-bar-track">
        <div class="seat-bar-fill" style="width:${pct}%;background:${barColor}"></div>
      </div>
      ${isOwner ? `
      <div class="seat-adjuster" id="seat-adjuster-${teamId}">
        <div class="seat-adjuster-left">
          <span class="seat-adjuster-label">Paid seats:</span>
          <div class="seat-stepper">
            <button class="seat-step-btn" id="seat-dec-${teamId}" aria-label="Remove seat"
              ${seatsPurchased <= seatsUsed ? 'disabled title="Cannot reduce below active member count"' : ''}>
              −
            </button>
            <span class="seat-step-count" id="seat-count-${teamId}">${seatsPurchased}</span>
            <button class="seat-step-btn" id="seat-inc-${teamId}" aria-label="Add seat">+</button>
          </div>
          <button class="btn btn-primary btn-sm seat-save-btn" id="seat-save-${teamId}" style="display:none">
            Save changes
          </button>
          <button class="btn btn-ghost btn-sm seat-cancel-btn" id="seat-cancel-${teamId}" style="display:none">
            Cancel
          </button>
        </div>
        <div class="seat-adjuster-hint" id="seat-hint-${teamId}"></div>
      </div>
      <div id="seat-feedback-${teamId}" style="margin-top:6px;font-size:12px"></div>
      ` : ''}`;

    if (!isOwner) return;

    // Wire up the stepper
    let pendingQty = seatsPurchased;

    function updateStepperState() {
      const countEl  = document.getElementById(`seat-count-${teamId}`);
      const saveBtn  = document.getElementById(`seat-save-${teamId}`);
      const cancelBtn = document.getElementById(`seat-cancel-${teamId}`);
      const decBtn   = document.getElementById(`seat-dec-${teamId}`);
      const hintEl   = document.getElementById(`seat-hint-${teamId}`);
      if (!countEl) return;

      countEl.textContent = String(pendingQty);
      const changed = pendingQty !== seatsPurchased;
      saveBtn.style.display   = changed ? '' : 'none';
      cancelBtn.style.display = changed ? '' : 'none';

      // Disable minus if new count would go below current headcount
      decBtn.disabled = pendingQty <= seatsUsed;
      decBtn.title    = decBtn.disabled ? `Cannot reduce below ${seatsUsed} active member${seatsUsed !== 1 ? 's' : ''}` : '';

      // Cost hint
      if (changed) {
        const delta = pendingQty - seatsPurchased;
        const sign  = delta > 0 ? '+' : '';
        hintEl.textContent = `${sign}${delta} seat${Math.abs(delta) !== 1 ? 's' : ''} — your next invoice will be adjusted automatically`;
        hintEl.style.color = delta > 0 ? '#60a5fa' : '#f59e0b';
      } else {
        hintEl.textContent = '';
      }
    }

    document.getElementById(`seat-inc-${teamId}`)?.addEventListener('click', () => {
      if (pendingQty < 500) { pendingQty++; updateStepperState(); }
    });

    document.getElementById(`seat-dec-${teamId}`)?.addEventListener('click', () => {
      if (pendingQty > seatsUsed && pendingQty > 1) { pendingQty--; updateStepperState(); }
    });

    document.getElementById(`seat-cancel-${teamId}`)?.addEventListener('click', () => {
      pendingQty = seatsPurchased;
      updateStepperState();
      const fb = document.getElementById(`seat-feedback-${teamId}`);
      if (fb) fb.textContent = '';
    });

    document.getElementById(`seat-save-${teamId}`)?.addEventListener('click', async () => {
      const saveBtn   = document.getElementById(`seat-save-${teamId}`);
      const cancelBtn = document.getElementById(`seat-cancel-${teamId}`);
      const fb        = document.getElementById(`seat-feedback-${teamId}`);

      saveBtn.disabled   = true;
      saveBtn.textContent = 'Saving…';
      if (fb) { fb.textContent = ''; fb.style.color = ''; }

      try {
        const result = await Api.adjustSeats(teamId, pendingQty);
        // Re-render the whole seat block with the confirmed new values
        renderSeatUsage(teamId, result.seatsUsed, result.seats_purchased, true);
        // Show confirmation inside the freshly-rendered block
        const newFb = document.getElementById(`seat-feedback-${teamId}`);
        if (newFb) {
          newFb.textContent = `✓ Updated to ${result.seats_purchased} seat${result.seats_purchased !== 1 ? 's' : ''}`;
          newFb.style.color = '#4ade80';
        }
      } catch (err) {
        saveBtn.disabled   = false;
        saveBtn.textContent = 'Save changes';
        if (cancelBtn) cancelBtn.style.display = '';
        if (fb) {
          fb.textContent = err.message || 'Failed to update seats. Please try again.';
          fb.style.color = '#f87171';
        }
      }
    });
  }

  function wireExpandedTeamButtons(card, team) {
    // Add member form — provision new account or add existing user
    const provisionBtn = card.querySelector('.btn-provision');
    if (provisionBtn) {
      provisionBtn.addEventListener('click', async () => {
        const emailInput = card.querySelector(`.provision-email-input[data-team-id="${team.id}"]`);
        const nameInput  = card.querySelector(`.provision-name-input[data-team-id="${team.id}"]`);
        await doProvisionMember(team.id, emailInput.value.trim(), nameInput.value.trim(), emailInput, nameInput);
      });
    }
    card.querySelector(`.provision-email-input[data-team-id="${team.id}"]`)
      ?.addEventListener('keydown', async (e) => {
        if (e.key !== 'Enter') return;
        const emailInput = card.querySelector(`.provision-email-input[data-team-id="${team.id}"]`);
        const nameInput  = card.querySelector(`.provision-name-input[data-team-id="${team.id}"]`);
        await doProvisionMember(team.id, emailInput.value.trim(), nameInput.value.trim(), emailInput, nameInput);
      });

    // Team Categories button
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

  // Format a date/time as relative ("2 hours ago", "3 days ago")
  function relativeTime(isoString) {
    if (!isoString) return 'Never';
    const diff = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins <   2) return 'Just now';
    if (mins <  60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs  <  24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days <  30) return `${days}d ago`;
    return new Date(isoString).toLocaleDateString();
  }

  async function refreshExpandedTeam(teamId) {
    const currentTeam = teams.find((t) => t.id === teamId);
    const callerIsOwner = currentTeam?.isOwner ?? false;
    const canManage = callerIsOwner || currentTeam?.role === 'admin';

    // Regular members only see a shared-library summary — no admin data needed
    if (!canManage) {
      const memberLibEl = document.getElementById(`member-library-${teamId}`);
      if (memberLibEl) {
        try {
          const localData = await CRLStorage.read();
          const teamCmds = (localData.commands ?? []).filter((c) => c._isTeam && c._teamId === teamId);
          const teamCats = (await Api.getTeamCategories().catch(() => [])).filter((c) => c.teamId === teamId);
          const total = teamCmds.length + teamCats.reduce((n, c) => n + c.responses.length, 0);
          memberLibEl.innerHTML = total > 0
            ? `<span style="color:#059669">${teamCmds.length} shared command${teamCmds.length !== 1 ? 's' : ''}` +
              `${teamCats.length > 0 ? ` · ${teamCats.length} category${teamCats.length !== 1 ? 'ies' : 'y'}` : ''} ` +
              `synced to your extension. Press <kbd>Ctrl+Space</kbd> to launch.</span>`
            : `<span>No shared content yet. Ask your team admin to share commands.</span>`;
        } catch {
          memberLibEl.innerHTML = '<span>Could not load team library.</span>';
        }
      }
      return;
    }

    try {
      const [memberDetails, teamCats, seatInfo, pendingInvites] = await Promise.all([
        Api.getTeamMemberDetails(teamId).catch(() => null),
        Api.getTeamCategories(),
        Api.getTeamSeatUsage(teamId).catch(() => null),
        Api.getPendingInvites(teamId).catch(() => []),
      ]);

      // Seat usage bar — pass isOwner so the adjuster controls render for owners
      if (seatInfo) {
        renderSeatUsage(teamId, seatInfo.seatsUsed, seatInfo.seatsPurchased, callerIsOwner);
      }

      // Member roster — rich view with email, last active, status
      const memberListEl = document.getElementById(`member-list-${teamId}`);
      if (memberListEl) {
        if (!memberDetails || memberDetails.length === 0) {
          memberListEl.innerHTML =
            '<li class="member-item" style="font-style:italic;color:#9ca3af;grid-column:1/-1">No members yet — add one below.</li>';
        } else {
          memberListEl.innerHTML = memberDetails.map((m) => {
            const statusBadge = m.tempPassword
              ? '<span class="member-status member-status--pending" title="Awaiting password change">Temp password</span>'
              : m.lastSignInAt
                ? '<span class="member-status member-status--active">Active</span>'
                : '<span class="member-status member-status--never">Never signed in</span>';

            const roleCell = (callerIsOwner && m.role !== 'owner')
              ? `<select class="member-role-select" data-team-id="${teamId}" data-user-id="${m.userId}">
                   <option value="member" ${m.role === 'member' ? 'selected' : ''}>Member</option>
                   <option value="admin"  ${m.role === 'admin'  ? 'selected' : ''}>Admin</option>
                 </select>`
              : `<span class="member-role-badge">${m.role}</span>`;

            return `
              <li class="member-item member-item--row" data-user-id="${m.userId}">
                <span class="member-email">${escHtml(m.email)}</span>
                <span class="member-last-active">${relativeTime(m.lastSignInAt)}</span>
                ${statusBadge}
                ${roleCell}
                <span class="member-actions">
                  <button class="btn btn-ghost btn-xs btn-reset-pw"
                    data-team-id="${teamId}" data-user-id="${m.userId}"
                    data-email="${escHtml(m.email)}" title="Reset password">Reset pw</button>
                  <button class="btn btn-danger btn-xs btn-remove-member"
                    data-team-id="${teamId}" data-user-id="${m.userId}" title="Remove">Remove</button>
                </span>
              </li>`;
          }).join('');

          memberListEl.querySelectorAll('.btn-reset-pw').forEach((btn) => {
            btn.addEventListener('click', async () => {
              if (!confirm(`Reset password for ${btn.dataset.email}? They'll receive a new temporary password by email.`)) return;
              try {
                btn.disabled = true;
                await Api.resetMemberPassword(btn.dataset.teamId, btn.dataset.userId);
                btn.textContent = 'Sent!';
                setTimeout(() => { btn.disabled = false; btn.textContent = 'Reset pw'; }, 3000);
              } catch (err) { alert(err.message); btn.disabled = false; }
            });
          });

          memberListEl.querySelectorAll('.btn-remove-member').forEach((btn) => {
            btn.addEventListener('click', async () => {
              if (!confirm('Remove this member from the team?')) return;
              try {
                await Api.removeTeamMember(btn.dataset.teamId, btn.dataset.userId);
                await refreshExpandedTeam(teamId);
              } catch (err) { alert(err.message); }
            });
          });

          memberListEl.querySelectorAll('.member-role-select').forEach((sel) => {
            sel.addEventListener('change', async () => {
              const prev = sel.value === 'admin' ? 'member' : 'admin';
              try {
                await Api.updateMemberRole(sel.dataset.teamId, sel.dataset.userId, sel.value);
              } catch (err) {
                alert(`Could not update role: ${err.message}`);
                sel.value = prev;
              }
            });
          });
        }
      }

      // Pending invites
      const inviteListEl = document.getElementById(`invite-list-${teamId}`);
      if (inviteListEl) {
        if (!pendingInvites || pendingInvites.length === 0) {
          inviteListEl.innerHTML =
            '<li class="member-item" style="font-style:italic;color:#9ca3af;grid-column:1/-1">No pending invites.</li>';
        } else {
          inviteListEl.innerHTML = pendingInvites.map((inv) => `
            <li class="member-item member-item--row" data-invite-id="${inv.id}">
              <span class="member-email">${escHtml(inv.email)}</span>
              <span class="member-last-active">Sent ${relativeTime(inv.createdAt)}</span>
              <span class="member-status member-status--pending">Invite pending</span>
              <span></span>
              <span class="member-actions">
                <button class="btn btn-ghost btn-xs btn-resend-invite"
                  data-team-id="${teamId}" data-email="${escHtml(inv.email)}"
                  title="Resend invite">Resend</button>
                <button class="btn btn-danger btn-xs btn-cancel-invite"
                  data-team-id="${teamId}" data-invite-id="${inv.id}"
                  data-email="${escHtml(inv.email)}" title="Cancel invite">Cancel</button>
              </span>
            </li>`).join('');

          inviteListEl.querySelectorAll('.btn-resend-invite').forEach((btn) => {
            btn.addEventListener('click', async () => {
              try {
                btn.disabled = true; btn.textContent = 'Sending…';
                await Api.sendTeamInvite(btn.dataset.teamId, btn.dataset.email);
                btn.textContent = 'Sent!';
                setTimeout(() => { btn.disabled = false; btn.textContent = 'Resend'; }, 3000);
              } catch (err) { alert(err.message); btn.disabled = false; btn.textContent = 'Resend'; }
            });
          });

          inviteListEl.querySelectorAll('.btn-cancel-invite').forEach((btn) => {
            btn.addEventListener('click', async () => {
              if (!confirm(`Cancel invite for ${btn.dataset.email}?`)) return;
              try {
                await Api.cancelTeamInvite(btn.dataset.teamId, btn.dataset.inviteId);
                await refreshExpandedTeam(teamId);
              } catch (err) { alert(err.message); }
            });
          });
        }
      }

      // Team Categories
      const catListEl = document.getElementById(`team-cat-list-${teamId}`);
      if (catListEl) {
        const thisCats = teamCats.filter((c) => c.teamId === teamId);
        catListEl.innerHTML = thisCats.length === 0
          ? '<li style="font-size:13px;color:#9ca3af;font-style:italic">No team categories yet.</li>'
          : thisCats.map((c) =>
              `<li class="team-cat-item"><span class="team-cat-dot"></span>${escHtml(c.name)} ` +
              `<span style="color:#9ca3af;font-size:11px">(${c.responses.length} responses)</span></li>`
            ).join('');
      }
    } catch (err) { DEBUG && console.warn('[CRL] refreshExpandedTeam error', err.message); }
  }

  async function doProvisionMember(teamId, email, fullName, emailInputEl, nameInputEl) {
    if (!email) { emailInputEl?.focus(); return; }
    const feedbackEl = document.getElementById(`provision-feedback-${teamId}`);
    const btn = document.querySelector(`.btn-provision[data-team-id="${teamId}"]`);
    if (btn) { btn.disabled = true; btn.textContent = 'Adding…'; }
    try {
      const { email: addedEmail, is_new: isNew } =
        await Api.provisionTeamMember(teamId, email, fullName);
      if (emailInputEl) emailInputEl.value = '';
      if (nameInputEl)  nameInputEl.value  = '';
      if (feedbackEl) {
        feedbackEl.innerHTML = isNew
          ? `<span style="font-size:12.5px;color:#059669">✓ Account created for ${escHtml(addedEmail)}. Credentials emailed.</span>`
          : `<span style="font-size:12.5px;color:#059669">✓ ${escHtml(addedEmail)} added to the team.</span>`;
        setTimeout(() => { if (feedbackEl) feedbackEl.innerHTML = ''; }, 5000);
      }
      await refreshExpandedTeam(teamId);
    } catch (err) {
      if (feedbackEl) {
        feedbackEl.innerHTML = `<span style="font-size:12.5px;color:#dc2626">${escHtml(err.message)}</span>`;
      }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Add & Email Credentials'; }
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
      const [teamCats, localData] = await Promise.all([
        Api.getTeamCategories().catch(() => []),
        CRLStorage.read(),
      ]);

      // Group team_commands (primary sharing system) by team
      const teamCmds = (localData.commands ?? []).filter((c) => c._isTeam);
      const cmdsByTeam = {};
      teamCmds.forEach((cmd) => {
        const key = cmd._teamId ?? 'unknown';
        if (!cmdsByTeam[key]) cmdsByTeam[key] = { name: cmd._teamName ?? 'Team', count: 0 };
        cmdsByTeam[key].count++;
      });

      const hasCommands = Object.keys(cmdsByTeam).length > 0;
      const hasCats     = teamCats.length > 0;

      if (!hasCommands && !hasCats) {
        listEl.innerHTML = '<p class="empty-hint">No shared team content yet. Your team admin can share commands via Settings → Import → Team.</p>';
        return;
      }

      listEl.innerHTML = '';

      // Show per-team command counts (team_commands system)
      Object.entries(cmdsByTeam).forEach(([, group]) => {
        const div = document.createElement('div');
        div.className = 'team-card';
        div.innerHTML = `
          <div class="team-card-header">
            <div>
              <div class="team-card-name">${escHtml(group.name)}</div>
              <div class="team-card-meta">${group.count} shared command${group.count !== 1 ? 's' : ''} · synced to your extension</div>
            </div>
          </div>`;
        listEl.appendChild(div);
      });

      // Also show legacy team categories
      teamCats.forEach((cat) => {
        const div = document.createElement('div');
        div.className = 'team-card';
        div.innerHTML = `
          <div class="team-card-header">
            <div>
              <div class="team-card-name">${escHtml(cat.name)}</div>
              <div class="team-card-meta">${escHtml(cat.teamName ?? 'Team')} · ${cat.responses.length} response${cat.responses.length !== 1 ? 's' : ''}</div>
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

  // handleCheckout intercepts the click to show the upgrade survey first.
  // After survey submission, doCheckout performs the actual Stripe redirect.
  function handleCheckout(plan, quantity = 1) {
    showUpgradeSurvey(plan, quantity);
  }

  async function doCheckout(plan, quantity = 1) {
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
    // Always close the import modal when switching to settings
    closeTeamImportModal();

    const settings = await CRLStorage.getSettings();
    document.getElementById('setting-clipboard-enabled').checked = settings.clipboardEnabled || false;

    if (!_settingsWired) {
      _settingsWired = true;
      document.getElementById('btn-save-settings').addEventListener('click', saveSettings);
      document.getElementById('btn-export-commands').addEventListener('click', exportCommands);
      document.getElementById('btn-import-commands').addEventListener('click', () => document.getElementById('import-file-input').click());
      document.getElementById('import-file-input').addEventListener('change', importCommands);
      document.getElementById('btn-import-team-commands').addEventListener('click', openTeamImportPicker);
      document.getElementById('import-team-file-input').addEventListener('change', onTeamFileSelected);
      document.getElementById('btn-cancel-team-import').addEventListener('click', closeTeamImportModal);
      document.getElementById('btn-confirm-team-import').addEventListener('click', confirmTeamImport);

      // Close on backdrop click
      document.getElementById('modal-team-import').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeTeamImportModal();
      });
    }

    await loadAIUsage();
    await loadSavedVariables();
  }

  // ── Saved Variables ──────────────────────────────────────────────────────────

  const SUGGESTED_VARS = [
    { name: 'companyName',  label: 'Company / Team Name',  hint: 'e.g. Acme Corp' },
    { name: 'agentName',    label: 'Your Name',             hint: 'e.g. Sarah Johnson' },
    { name: 'senderTitle',  label: 'Your Job Title',        hint: 'e.g. Customer Success Manager' },
    { name: 'senderCompany',label: 'Your Company',          hint: 'e.g. Acme Corp' },
    { name: 'timezone',     label: 'Your Timezone',         hint: 'e.g. ET, PT, GMT' },
    { name: 'productName',  label: 'Product Name',          hint: 'e.g. Acme Pro' },
  ];

  async function loadSavedVariables() {
    const container = document.getElementById('saved-vars-container');
    if (!container) return;
    const saved = await CRLStorage.getUserVariables();
    renderSavedVars(container, saved);
  }

  function renderSavedVars(container, saved) {
    const rows = SUGGESTED_VARS.map((s) => {
      const val = saved[s.name] ?? '';
      return `
        <div class="saved-var-row" data-var="${escHtml(s.name)}">
          <label class="saved-var-label" title="Use as {{${s.name}}} in templates">
            {{${escHtml(s.name)}}}
          </label>
          <input class="saved-var-input" type="text" placeholder="${escHtml(s.hint)}"
            data-var="${escHtml(s.name)}" value="${escHtml(val)}" />
          <span class="saved-var-desc">${escHtml(s.label)}</span>
        </div>`;
    }).join('');

    // Custom variables (any saved vars not in the suggested list)
    const suggestedNames = new Set(SUGGESTED_VARS.map((s) => s.name));
    const customRows = Object.entries(saved)
      .filter(([k]) => !suggestedNames.has(k))
      .map(([k, v]) => `
        <div class="saved-var-row" data-var="${escHtml(k)}">
          <label class="saved-var-label">{{${escHtml(k)}}}</label>
          <input class="saved-var-input" type="text" data-var="${escHtml(k)}" value="${escHtml(v)}" />
          <button class="btn btn-ghost btn-xs saved-var-del" data-var="${escHtml(k)}" title="Delete">✕</button>
        </div>`).join('');

    container.innerHTML = `
      <div class="saved-vars-list">${rows}${customRows}</div>
      <div class="saved-vars-add" style="margin-top:12px;display:flex;gap:8px">
        <input id="new-var-name" type="text" placeholder="Variable name (e.g. signature)" class="setting-input" style="flex:1" />
        <button class="btn btn-ghost btn-sm" id="btn-add-var">+ Add</button>
      </div>
      <div style="margin-top:10px">
        <button class="btn btn-primary btn-sm" id="btn-save-vars">Save Variables</button>
        <span id="saved-vars-feedback" style="font-size:12px;color:#059669;margin-left:10px"></span>
      </div>`;

    // Wire save
    container.querySelector('#btn-save-vars').addEventListener('click', async () => {
      const patch = {};
      container.querySelectorAll('.saved-var-input').forEach((inp) => {
        patch[inp.dataset.var] = inp.value.trim();
      });
      await CRLStorage.saveUserVariables(patch);
      const fb = container.querySelector('#saved-vars-feedback');
      fb.textContent = '✓ Saved';
      setTimeout(() => { fb.textContent = ''; }, 2500);
    });

    // Wire delete custom
    container.querySelectorAll('.saved-var-del').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await CRLStorage.deleteUserVariable(btn.dataset.var);
        const fresh = await CRLStorage.getUserVariables();
        renderSavedVars(container, fresh);
      });
    });

    // Wire add custom
    container.querySelector('#btn-add-var').addEventListener('click', async () => {
      const nameInput = container.querySelector('#new-var-name');
      const name = nameInput.value.trim().replace(/[^a-zA-Z0-9_]/g, '');
      if (!name) { nameInput.focus(); return; }
      const fresh = await CRLStorage.getUserVariables();
      fresh[name] = '';
      await CRLStorage.saveUserVariables(fresh);
      renderSavedVars(container, fresh);
    });
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

  // ── Team import ─────────────────────────────────────────────────────────────

  let _teamImportParsed = null; // holds parsed JSON between file selection and confirmation

  async function openTeamImportPicker() {
    if (!currentUser) { alert('Sign in to import to a team.'); return; }

    // Load the file first, then show team picker
    document.getElementById('import-team-file-input').click();
  }

  async function onTeamFileSelected(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;

    let parsed;
    try {
      parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed.commands)) throw new Error('Invalid format');
    } catch (err) {
      alert('Import failed: ' + err.message);
      return;
    }

    _teamImportParsed = parsed;

    // Populate team dropdown
    const select = document.getElementById('team-import-select');
    select.innerHTML = '<option value="">Loading…</option>';
    try {
      const myTeams = await Api.getTeams();
      if (!myTeams.length) {
        alert('You need to create or belong to a team first (Teams tab).');
        _teamImportParsed = null;
        return;
      }
      select.innerHTML = myTeams.map((t) =>
        `<option value="${escHtml(t.id)}">${escHtml(t.name)}</option>`
      ).join('');
    } catch {
      select.innerHTML = '<option value="">Failed to load teams</option>';
    }

    const modal = document.getElementById('modal-team-import');
    modal.style.display = 'flex';
  }

  function closeTeamImportModal() {
    document.getElementById('modal-team-import').style.display = 'none';
    _teamImportParsed = null;
  }

  async function confirmTeamImport() {
    const teamId = document.getElementById('team-import-select').value;
    if (!teamId) { alert('Please select a team.'); return; }
    if (!_teamImportParsed) { closeTeamImportModal(); return; }

    const btn = document.getElementById('btn-confirm-team-import');
    btn.disabled = true;
    btn.textContent = 'Importing…';

    try {
      const { commands = [], stacks = [] } = _teamImportParsed;
      const count = await Api.upsertTeamCommands(teamId, commands, stacks);
      closeTeamImportModal();
      alert(`✓ ${commands.length} command${commands.length !== 1 ? 's' : ''} shared with the team. Team members will see them on their next sync.`);
    } catch (err) {
      alert('Team import failed: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Import to Team';
    }
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

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMPLATES TAB
  // ═══════════════════════════════════════════════════════════════════════════

  let _tplPacks        = [];
  let _tplActiveCat    = 'all';
  let _tplLoaded       = false;

  async function loadTemplatesTab() {
    if (_tplLoaded) return;
    _tplLoaded = true;

    const urlParams     = new URLSearchParams(window.location.search);
    const justPurchased = urlParams.get('template_purchased');

    const grid = document.getElementById('tpl-grid');
    grid.innerHTML = '<div class="tpl-loading">Loading templates…</div>';

    try {
      _tplPacks = await Api.getTemplatePacks();
    } catch (e) {
      grid.innerHTML = `<div class="tpl-loading" style="color:#dc2626">Failed to load: ${escHtml(e.message)}</div>`;
      return;
    }

    document.querySelectorAll('.tpl-filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        _tplActiveCat = btn.dataset.cat;
        document.querySelectorAll('.tpl-filter-btn').forEach((b) =>
          b.classList.toggle('active', b.dataset.cat === _tplActiveCat));
        renderTplGrid();
      });
    });

    renderTplGrid();

    if (justPurchased) {
      const pack = _tplPacks.find((p) => p.id === justPurchased);
      if (pack) {
        window.history.replaceState(null, '', window.location.pathname + '?tab=templates');
        await applyTemplatePack(justPurchased, pack.name, true);
        renderTplGrid();
      }
    }
  }

  function renderTplGrid() {
    const grid  = document.getElementById('tpl-grid');
    const packs = _tplActiveCat === 'all'
      ? _tplPacks
      : _tplPacks.filter((p) => p.category === _tplActiveCat);

    if (!packs.length) {
      grid.innerHTML = '<div class="tpl-loading">No templates in this category yet.</div>';
      return;
    }

    grid.innerHTML = packs.map(renderTplCard).join('');

    grid.querySelectorAll('[data-tpl-action]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const { tplAction, tplId, tplName } = btn.dataset;
        btn.disabled = true;
        btn.textContent = '…';
        if (tplAction === 'claim')   await handleClaimPack(tplId, tplName, btn);
        if (tplAction === 'buy')     await handleBuyPack(tplId, btn);
        if (tplAction === 'reapply') await handleReapplyPack(tplId, tplName, btn);
      });
    });
  }

  function renderTplCard(pack) {
    const isFree      = pack.price_cents === 0;
    const isPurchased = pack.purchased;
    const priceLabel  = isFree ? 'Free' : `$${(pack.price_cents / 100).toFixed(2)}`;

    let btnHtml;
    if (isPurchased) {
      btnHtml = `
        <button class="tpl-card-btn applied-btn" disabled>✓ Applied</button>
        <button class="tpl-card-btn free-btn" style="margin-left:4px;font-size:11px;padding:5px 10px"
          data-tpl-action="reapply" data-tpl-id="${pack.id}" data-tpl-name="${escHtml(pack.name)}">Re-apply</button>`;
    } else if (isFree) {
      btnHtml = `<button class="tpl-card-btn free-btn" data-tpl-action="claim" data-tpl-id="${pack.id}" data-tpl-name="${escHtml(pack.name)}">Get Free</button>`;
    } else {
      btnHtml = `<button class="tpl-card-btn buy-btn" data-tpl-action="buy" data-tpl-id="${pack.id}">Buy ${priceLabel}</button>`;
    }

    return `
      <div class="tpl-card ${pack.is_featured ? 'tpl-card--featured' : ''}" data-pack-id="${pack.id}">
        <div class="tpl-card-top">
          <div class="tpl-card-icon">${pack.icon}</div>
          <div class="tpl-card-meta">
            <div class="tpl-card-name">${escHtml(pack.name)}</div>
            <div class="tpl-card-count">${pack.command_count} command${pack.command_count !== 1 ? 's' : ''}</div>
          </div>
          ${pack.is_featured ? '<span class="tpl-featured-badge">Featured</span>' : ''}
        </div>
        <div class="tpl-card-desc">${escHtml(pack.description)}</div>
        ${pack.preview_text ? `<div class="tpl-card-preview">"${escHtml(pack.preview_text)}"</div>` : ''}
        <div class="tpl-card-footer">
          <span class="tpl-card-price ${isFree ? 'free' : ''}">${priceLabel}</span>
          <div style="display:flex;gap:4px">${btnHtml}</div>
        </div>
        <div class="tpl-apply-notice" id="tpl-notice-${pack.id}" style="display:none"></div>
      </div>`;
  }

  async function handleClaimPack(packId, packName, btn) {
    try {
      const result = await Api.claimTemplatePack(packId);
      await applyCommandsToStorage(result.commands, packId, packName);
      const pack = _tplPacks.find((p) => p.id === packId);
      if (pack) pack.purchased = true;
      showTplNotice(packId, `✓ ${result.commands.length} commands added to your library!`);
      renderTplGrid();
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Get Free';
      showTplNotice(packId, `Error: ${e.message}`, true);
    }
  }

  async function handleBuyPack(packId, btn) {
    try {
      const url = await Api.checkoutTemplatePack(packId);
      if (url) chrome.tabs.create({ url });
    } catch (e) {
      const pack = _tplPacks.find((p) => p.id === packId);
      btn.disabled = false;
      btn.textContent = pack ? `Buy $${(pack.price_cents / 100).toFixed(2)}` : 'Buy';
      showTplNotice(packId, `Error: ${e.message}`, true);
    }
  }

  async function handleReapplyPack(packId, packName) {
    try {
      const result = await Api.deliverTemplatePack(packId);
      await applyCommandsToStorage(result.commands, packId, packName);
      showTplNotice(packId, `✓ Re-applied ${result.commands.length} commands.`);
    } catch (e) {
      showTplNotice(packId, `Error: ${e.message}`, true);
    } finally {
      renderTplGrid();
    }
  }

  async function applyTemplatePack(packId, packName, fromPurchase = false) {
    try {
      const result = fromPurchase
        ? await Api.deliverTemplatePack(packId)
        : await Api.claimTemplatePack(packId);
      await applyCommandsToStorage(result.commands, packId, packName);
      const pack = _tplPacks.find((p) => p.id === packId);
      if (pack) pack.purchased = true;
      showTplNotice(packId, `✓ ${result.commands.length} commands added to your library!`);
    } catch (e) {
      showTplNotice(packId, `Could not apply: ${e.message}`, true);
    }
  }

  /**
   * Writes template commands into chrome.storage.local.
   * Creates a dedicated stack for the pack; replaces any previous commands
   * from the same pack without touching personal commands.
   */
  async function applyCommandsToStorage(rawCommands, packId, packName) {
    const data    = await CRLStorage.read();
    const stackId = `tpl_${packId.replace(/-/g, '').slice(0, 16)}`;

    // Create stack if it doesn't exist
    data.stacks = data.stacks ?? [];
    if (!data.stacks.find((s) => s.id === stackId)) {
      data.stacks.push({ id: stackId, name: packName, color: '#6366f1', icon: 'template' });
    }

    // Remove previously installed commands from this pack
    data.commands = (data.commands ?? []).filter((c) => c._templatePackId !== packId);

    // Build new commands
    const now = new Date().toISOString();
    const newCmds = rawCommands.map((tmpl) => ({
      id:              CRLStorage.genId('cmd'),
      name:            tmpl.name        ?? 'Untitled',
      description:     tmpl.description ?? '',
      commandType:     tmpl.commandType ?? 'static',
      template:        tmpl.template    ?? '',
      variables:       tmpl.variables   ?? [],
      triggers:        tmpl.triggers    ?? [],
      conditions:      tmpl.conditions  ?? [],
      actions:         tmpl.actions     ?? [{ type: 'insert_text' }],
      stackId,
      favorite:        false,
      usageCount:      0,
      createdAt:       now,
      _templatePackId: packId,
    }));

    data.commands = [...data.commands, ...newCmds];
    await CRLStorage.write(data);

    // Refresh Commands tab cache without a full reload
    allCommands = data.commands.filter((c) => !c._isTeam);
    allStacks   = data.stacks;
  }

  function showTplNotice(packId, msg, isError = false) {
    const el = document.getElementById(`tpl-notice-${packId}`);
    if (!el) return;
    el.style.display    = 'block';
    el.style.background = isError ? '#fef2f2' : '#ecfdf5';
    el.style.color      = isError ? '#dc2626'  : '#059669';
    el.textContent      = msg;
    if (!isError) setTimeout(() => { el.style.display = 'none'; }, 4000);
  }

})();
