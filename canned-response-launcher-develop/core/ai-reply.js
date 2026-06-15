/**
 * CRL — core/ai-reply.js
 * AI Reply command: capture selection → tone picker → generate → insert/copy.
 *
 * Depends on: CRLContext, CRLGates, CRLUpgrade
 * Called by: content.js (slash trigger, palette, keyboard shortcut)
 */

const CRLAIReply = (() => {

  const TONES = [
    { id: 'professional', label: 'Professional' },
    { id: 'friendly',     label: 'Friendly'     },
    { id: 'direct',       label: 'Direct'       },
    { id: 'warm',         label: 'Warm'         },
  ];

  let _activeField = null;
  let _savedCursor = null;
  let _modal       = null;

  // ── Entry point ───────────────────────────────────────────────────────────────

  async function launch(activeField, savedCursor) {
    if (_modal) dismiss();

    // Gate check first
    const user = await CRLGates.getUser();
    if (!CRLGates.canUseAICommands(user)) {
      CRLUpgrade.show('ai');
      return;
    }

    // Capture context BEFORE the modal steals focus/selection
    const context      = await CRLContext.gather(activeField);
    const selectedText = context.selectedText?.trim() || '';
    const pageTitle    = context.pageTitle || document.title || '';

    _activeField = activeField;
    _savedCursor = savedCursor;

    showToneScreen(selectedText, pageTitle);
  }

  // ── Tone selection screen ─────────────────────────────────────────────────────

  function showToneScreen(selectedText, pageTitle) {
    dismiss();
    _modal = buildModal();
    const box = _modal.querySelector('.crl-air-box');

    box.appendChild(makeHeader('AI Reply', dismiss));

    if (selectedText) {
      const preview = document.createElement('div');
      preview.className = 'crl-air-preview';
      preview.textContent = selectedText.length > 140
        ? selectedText.slice(0, 140) + '…'
        : selectedText;
      box.appendChild(preview);
    } else {
      const hint = document.createElement('p');
      hint.className = 'crl-air-hint';
      hint.textContent = 'No text selected — AI will reply based on page context.';
      box.appendChild(hint);
    }

    const sectionLabel = document.createElement('p');
    sectionLabel.className = 'crl-air-section-label';
    sectionLabel.textContent = 'Select a tone';
    box.appendChild(sectionLabel);

    const grid = document.createElement('div');
    grid.className = 'crl-air-tone-grid';

    let focusedIdx = 0;
    const buttons  = [];

    TONES.forEach(({ id, label }, i) => {
      const btn = document.createElement('button');
      btn.className = 'crl-air-tone-btn';
      btn.type = 'button';
      btn.textContent = label;
      btn.dataset.tone = id;

      btn.addEventListener('mouseenter', () => {
        setToneFocus(buttons, i);
        focusedIdx = i;
      });
      btn.addEventListener('click', () => {
        dismiss();
        showResultScreen(selectedText, pageTitle, id, label);
      });

      grid.appendChild(btn);
      buttons.push(btn);
    });

    box.appendChild(grid);

    const hint2 = document.createElement('p');
    hint2.className = 'crl-air-kbd-hint';
    hint2.textContent = '↑↓←→ navigate  ·  ↵ generate  ·  Esc close';
    box.appendChild(hint2);

    _modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape')    { e.stopPropagation(); dismiss(); return; }
      if (e.key === 'Enter')     { e.preventDefault(); pick(buttons, focusedIdx, selectedText, pageTitle); return; }
      if (e.key === 'ArrowRight' || e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        focusedIdx = (focusedIdx + 1) % TONES.length;
        setToneFocus(buttons, focusedIdx);
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        focusedIdx = (focusedIdx - 1 + TONES.length) % TONES.length;
        setToneFocus(buttons, focusedIdx);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        focusedIdx = Math.min(focusedIdx + 2, TONES.length - 1);
        setToneFocus(buttons, focusedIdx);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        focusedIdx = Math.max(focusedIdx - 2, 0);
        setToneFocus(buttons, focusedIdx);
        return;
      }
    }, true);

    document.body.appendChild(_modal);
    setToneFocus(buttons, 0);
    setTimeout(() => buttons[0]?.focus(), 30);
  }

  function setToneFocus(buttons, idx) {
    buttons.forEach((b) => b.classList.remove('crl-air-tone-btn--focused'));
    buttons[idx]?.classList.add('crl-air-tone-btn--focused');
    buttons[idx]?.focus();
  }

  function pick(buttons, idx, selectedText, pageTitle) {
    const { id, label } = TONES[idx];
    dismiss();
    showResultScreen(selectedText, pageTitle, id, label);
  }

  // ── Result screen (loading → result / error) ──────────────────────────────────

  async function showResultScreen(selectedText, pageTitle, toneId, toneLabel) {
    dismiss();
    _modal = buildModal();
    const box = _modal.querySelector('.crl-air-box');

    box.appendChild(makeHeader('AI Reply', dismiss, toneLabel));

    const content = document.createElement('div');
    content.className = 'crl-air-content';
    renderLoading(content);
    box.appendChild(content);

    const footer = document.createElement('div');
    footer.className = 'crl-air-footer';

    const retryBtn  = makeBtn('↩ Retry',  'crl-air-btn--ghost', true);
    const copyBtn   = makeBtn('Copy',     'crl-air-btn--secondary', true);
    const insertBtn = makeBtn('Insert ↵', 'crl-air-btn--primary', true);

    const right = document.createElement('div');
    right.className = 'crl-air-footer-right';
    right.appendChild(copyBtn);
    right.appendChild(insertBtn);

    footer.appendChild(retryBtn);
    footer.appendChild(right);
    box.appendChild(footer);

    document.body.appendChild(_modal);

    _modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); dismiss(); }
    }, true);

    // Generate
    const prompt = buildPrompt(selectedText, pageTitle, toneLabel);
    try {
      const text = await generate(prompt, { pageTitle, selectedText });
      renderResult(content, footer, retryBtn, copyBtn, insertBtn, text, selectedText, pageTitle, toneId, toneLabel);
    } catch (err) {
      renderError(content, retryBtn, err.message, selectedText, pageTitle, toneId, toneLabel);
    }
  }

  function renderLoading(content) {
    content.innerHTML = `
      <div class="crl-air-loading">
        <div class="crl-air-spinner"></div>
        <span class="crl-air-loading-text">Generating…</span>
      </div>`;
  }

  function renderResult(content, footer, retryBtn, copyBtn, insertBtn, text, selectedText, pageTitle, toneId, toneLabel) {
    content.innerHTML = '';

    const textarea = document.createElement('textarea');
    textarea.className  = 'crl-air-result';
    textarea.value      = text;
    textarea.spellcheck = false;
    content.appendChild(textarea);
    setTimeout(() => textarea.focus(), 30);

    retryBtn.disabled  = false;
    copyBtn.disabled   = false;
    insertBtn.disabled = false;

    retryBtn.addEventListener('click', () => {
      dismiss();
      showToneScreen(selectedText, pageTitle);
    });

    copyBtn.addEventListener('click', async () => {
      await navigator.clipboard.writeText(textarea.value).catch(() => {});
      copyBtn.textContent = 'Copied ✓';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1800);
    });

    insertBtn.addEventListener('click', () => {
      insertResult(textarea.value);
      dismiss();
    });

    // Cmd/Ctrl+Enter inserts from anywhere in the modal
    _modal.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        insertResult(textarea.value);
        dismiss();
      }
    }, true);
  }

  function renderError(content, retryBtn, message, selectedText, pageTitle, toneId, toneLabel) {
    content.innerHTML = `<p class="crl-air-error">⚠ ${message}</p>`;
    retryBtn.disabled = false;
    retryBtn.addEventListener('click', () => {
      dismiss();
      showResultScreen(selectedText, pageTitle, toneId, toneLabel);
    });
  }

  // ── AI call ───────────────────────────────────────────────────────────────────

  function buildPrompt(selectedText, pageTitle, tone) {
    return `You are generating a concise, natural response.

Selected text:
${selectedText || '(none)'}

Current page:
${pageTitle || '(unknown)'}

Tone:
${tone}

Requirements:
- Keep under 120 words
- Sound human
- Avoid robotic AI phrasing
- Match the tone requested
- Do not over-explain`;
  }

  function generate(prompt, context) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'AI_GENERATE', prompt, context }, (res) => {
        if (chrome.runtime.lastError) {
          reject(new Error('AI unavailable — try reloading the page.'));
        } else if (res?.error) {
          reject(new Error(res.error));
        } else {
          resolve(res?.text || '');
        }
      });
    });
  }

  // ── Insert into active field ──────────────────────────────────────────────────

  function insertResult(text) {
    if (!_activeField) return;
    _activeField.focus();

    const tag = _activeField.tagName;
    if (tag === 'TEXTAREA' || tag === 'INPUT') {
      const start = _savedCursor?.start ?? _activeField.selectionStart ?? _activeField.value.length;
      const end   = _savedCursor?.end   ?? _activeField.selectionEnd   ?? _activeField.value.length;
      if (typeof _activeField.setRangeText === 'function') {
        _activeField.setRangeText(text, start, end, 'end');
      } else {
        _activeField.value = _activeField.value.slice(0, start) + text + _activeField.value.slice(end);
        _activeField.selectionStart = _activeField.selectionEnd = start + text.length;
      }
      _activeField.dispatchEvent(new Event('input',  { bubbles: true }));
      _activeField.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (_activeField.isContentEditable) {
      _activeField.focus();
      const sel = window.getSelection();
      if (!sel) return;
      if (!sel.rangeCount || sel.isCollapsed) {
        const r = document.createRange();
        r.selectNodeContents(_activeField);
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
      const last = frag.lastChild;
      range.insertNode(frag);
      const newRange = document.createRange();
      newRange.setStartAfter(last);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
      _activeField.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  // ── DOM helpers ───────────────────────────────────────────────────────────────

  function buildModal() {
    const modal = document.createElement('div');
    modal.id = 'crl-ai-reply';
    modal.className = 'crl-air-backdrop';
    modal.addEventListener('mousedown', (e) => {
      if (e.target === modal) dismiss();
    });
    const box = document.createElement('div');
    box.className = 'crl-air-box';
    modal.appendChild(box);
    return modal;
  }

  function makeHeader(title, onClose, badge = null) {
    const header = document.createElement('div');
    header.className = 'crl-air-header';

    const left = document.createElement('div');
    left.className = 'crl-air-header-left';

    const icon = document.createElement('span');
    icon.className = 'crl-air-icon';
    icon.textContent = '⚡';

    const titleEl = document.createElement('span');
    titleEl.className = 'crl-air-title';
    titleEl.textContent = title;

    left.appendChild(icon);
    left.appendChild(titleEl);

    if (badge) {
      const badgeEl = document.createElement('span');
      badgeEl.className = 'crl-air-badge';
      badgeEl.textContent = badge;
      left.appendChild(badgeEl);
    }

    const closeBtn = document.createElement('button');
    closeBtn.className = 'crl-air-close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 1l10 10M11 1L1 11"/></svg>`;
    closeBtn.addEventListener('click', onClose);

    header.appendChild(left);
    header.appendChild(closeBtn);
    return header;
  }

  function makeBtn(label, className, disabled = false) {
    const btn = document.createElement('button');
    btn.className = `crl-air-btn ${className}`;
    btn.type = 'button';
    btn.textContent = label;
    btn.disabled = disabled;
    return btn;
  }

  function dismiss() {
    document.getElementById('crl-ai-reply')?.remove();
    _modal = null;
  }

  return { launch, dismiss };
})();
