/**
 * CRL — core/executor.js
 * Runs a command through the full pipeline:
 *   context → conditions → variables → AI → actions → history
 *
 * Depends on: CRLStorage, CRLContext, CRLConditions, CRLVariables, CRLHistory
 */

const CRLExecutor = (() => {

  /**
   * Execute a command.
   * @param {object} command      - the command object
   * @param {object} opts
   * @param {Element} opts.activeField   - focused editable element
   * @param {object}  opts.savedCursor   - { start, end } saved before overlay opened
   * @param {string}  [opts.triggerType] - how it was triggered
   * @param {number}  [opts.triggerStart] - char index where trigger text started (for removal)
   * @param {number}  [opts.triggerEnd]   - char index where trigger text ended
   * @returns {Promise<boolean>} true if execution succeeded
   */
  async function execute(command, { activeField, savedCursor, triggerType = 'palette', triggerStart, triggerEnd } = {}) {

    // 1. Gather context
    const context = await CRLContext.gather(activeField);

    // 2. Evaluate conditions
    const condResult = CRLConditions.evaluate(command.conditions, context);
    if (!condResult.pass) {
      showToast(`Command unavailable: ${condResult.reason}`);
      return false;
    }

    // 3. Resolve template
    let text = command.template || '';

    if (command.commandType === 'ai') {
      text = await executeAI(command, context);
      if (text === null) return false;
    } else {
      // Resolve variables (static commands may still use dynamic {{today}} etc.)
      text = await CRLVariables.resolve(text, command.variables, context);
      if (text === null) return false; // user cancelled variable modal
    }

    // 4. Run actions
    const actions = command.actions?.length ? command.actions : [{ type: 'insert_text' }];
    let success = false;

    for (const action of actions) {
      try {
        await runAction(action, text, { activeField, savedCursor, triggerStart, triggerEnd, context });
        success = true;
      } catch (err) {
        DEBUG && console.warn('[CRL] Action error:', err);
        showToast('Action failed: ' + err.message);
      }
    }

    // 5. Record history
    CRLHistory.record({
      commandId: command.id,
      site: context.hostname,
      triggerType,
      success,
    }).catch(() => {});

    return success;
  }

  // ── Action runners ──────────────────────────────────────────────────────────

  async function runAction(action, text, { activeField, savedCursor, triggerStart, triggerEnd, context }) {
    switch (action.type) {

      case 'insert_text':
        insertText(text, activeField, savedCursor, triggerStart, triggerEnd);
        break;

      case 'replace_selection': {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
          const range = sel.getRangeAt(0);
          range.deleteContents();
          const node = document.createTextNode(text);
          range.insertNode(node);
          const newRange = document.createRange();
          newRange.setStartAfter(node);
          newRange.collapse(true);
          sel.removeAllRanges();
          sel.addRange(newRange);
          activeField?.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          insertText(text, activeField, savedCursor, triggerStart, triggerEnd);
        }
        break;
      }

      case 'copy_to_clipboard':
        await navigator.clipboard.writeText(text).catch(() => {});
        showToast('Copied to clipboard ✓');
        break;

      case 'open_url': {
        const url = text || action.url || '';
        if (url) chrome.runtime.sendMessage({ type: 'OPEN_TAB', url });
        break;
      }

      case 'submit_form': {
        if (action.confirm !== false) {
          if (!confirm('cannedIQ: Submit this form?')) break;
        }
        insertText(text, activeField, savedCursor, triggerStart, triggerEnd);
        const form = activeField?.closest('form');
        if (form) {
          form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }
        break;
      }

      case 'click_button': {
        if (action.confirm !== false) {
          if (!confirm('cannedIQ: Click this button?')) break;
        }
        const selector = action.selector || 'button[type=submit]';
        document.querySelector(selector)?.click();
        break;
      }

      case 'chain_command': {
        if (!action.commandId) break;
        const commands = await CRLStorage.getCommands();
        const chainCmd = commands.find((c) => c.id === action.commandId);
        if (chainCmd) {
          await execute(chainCmd, { activeField, savedCursor, triggerType: 'chain' });
        }
        break;
      }

      default:
        DEBUG && console.warn('[CRL] Unknown action type:', action.type);
    }
  }

  // ── AI execution ────────────────────────────────────────────────────────────
  //
  // AI is a managed service — no local key needed. The background script
  // forwards the request to the ai-generate edge function using the user's JWT.

  async function executeAI(command, context) {
    // Resolve variables in the AI prompt first (may show input modal)
    const rawPrompt = command.aiPrompt || command.template || '';
    if (!rawPrompt.trim()) {
      showToast('AI command has no prompt. Edit it in Options.');
      return null;
    }

    const prompt = await CRLVariables.resolve(rawPrompt, command.variables, context);
    if (prompt === null) return null; // user cancelled variable modal

    // Guard: if the resolved prompt is essentially the same as the raw template,
    // all variables came back empty — warn instead of wasting an API call.
    const hasContent = prompt.trim().length > rawPrompt.replace(/\{\{\w+\}\}/g, '').trim().length + 5;
    if (!hasContent || prompt.trim().length < 10) {
      showToast('⚠ No content to send — select text first, or use {{inputText}} in your prompt.');
      return null;
    }

    showToast('⚡ Generating…');

    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'AI_GENERATE', prompt, context },
        (response) => {
          if (chrome.runtime.lastError) {
            showToast('⚠ AI unavailable — try reloading the page.');
            resolve(null);
          } else if (response?.error) {
            showToast('⚠ ' + response.error);
            resolve(null);
          } else {
            resolve(response?.text || '');
          }
        }
      );
    });
  }

  // ── Text insertion ──────────────────────────────────────────────────────────

  function insertText(text, activeField, savedCursor, triggerStart, triggerEnd) {
    if (!activeField) return;
    activeField.focus();

    const tag = activeField.tagName;
    if (tag === 'TEXTAREA' || tag === 'INPUT') {
      insertIntoInput(activeField, text, savedCursor, triggerStart, triggerEnd);
    } else if (activeField.isContentEditable) {
      insertIntoContentEditable(activeField, text);
    }
  }

  function insertIntoInput(el, text, savedCursor, triggerStart, triggerEnd) {
    // If we have trigger bounds, replace from triggerStart to current cursor
    // Otherwise use the saved cursor position from when palette opened
    let start, end;

    if (triggerStart !== undefined && triggerEnd !== undefined) {
      start = triggerStart;
      end   = triggerEnd;
    } else {
      start = savedCursor?.start ?? el.selectionStart ?? el.value.length;
      end   = savedCursor?.end   ?? el.selectionEnd   ?? el.value.length;
    }

    if (typeof el.setRangeText === 'function') {
      el.setRangeText(text, start, end, 'end');
    } else {
      el.value = el.value.slice(0, start) + text + el.value.slice(end);
      el.selectionStart = el.selectionEnd = start + text.length;
    }

    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function insertIntoContentEditable(el, text) {
    const sel = window.getSelection();
    if (!sel) return;

    if (!sel.rangeCount || sel.isCollapsed) {
      // Place cursor at end of element
      el.focus();
      const r = document.createRange();
      r.selectNodeContents(el);
      r.collapse(false);
      sel.removeAllRanges();
      sel.addRange(r);
    }

    const range = sel.getRangeAt(0);
    range.deleteContents();

    const lines = text.split('\n');
    const frag  = document.createDocumentFragment();
    lines.forEach((line, i) => {
      if (i > 0) frag.appendChild(document.createElement('br'));
      frag.appendChild(document.createTextNode(line));
    });

    const lastNode = frag.lastChild;
    range.insertNode(frag);

    const newRange = document.createRange();
    newRange.setStartAfter(lastNode);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);

    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // ── Toast ───────────────────────────────────────────────────────────────────

  function showToast(msg) {
    document.getElementById('crl-toast')?.remove();
    const t = document.createElement('div');
    t.id = 'crl-toast';
    t.className = 'crl-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  return { execute };
})();
