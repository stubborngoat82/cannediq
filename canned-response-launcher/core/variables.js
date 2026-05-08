/**
 * CRL — core/variables.js
 * Resolves {{variable}} placeholders in command templates.
 * Dynamic variables are resolved from context automatically.
 * User-defined variables show a modal for input.
 */

const CRLVariables = (() => {

  // Dynamic keys resolved from context — no user input needed
  const DYNAMIC_RESOLVERS = {
    today:        (ctx) => new Date().toLocaleDateString(),
    now:          (ctx) => new Date().toLocaleString(),
    time:         (ctx) => new Date().toLocaleTimeString(),
    clipboard:    (ctx) => ctx.clipboardText   || '',
    selectedText: (ctx) => ctx.selectedText    || '',
    pageTitle:    (ctx) => ctx.pageTitle       || '',
    currentUrl:   (ctx) => ctx.currentUrl      || '',
    hostname:     (ctx) => ctx.hostname        || '',
    siteName:     (ctx) => ctx.siteName        || '',
    activeInput:  (ctx) => ctx.activeInputText || '',
    // Smart fallback: active field content first, selected text if the field is empty.
    // Use {{inputText}} in AI prompts so the command works whether you're composing
    // in a field or have highlighted a passage on a page.
    inputText:        (ctx) => ctx.activeInputText?.trim() || ctx.selectedText || '',
    // Explicit alias so {{activeInputText}} works directly in templates
    activeInputText:  (ctx) => ctx.activeInputText || '',
  };

  /**
   * Resolve all {{key}} placeholders in a template.
   * @param {string} template
   * @param {Array}  varDefs    - variable definitions from the command
   * @param {object} context    - gathered page context
   * @returns {Promise<string|null>} resolved string, or null if user cancelled
   */
  async function resolve(template, varDefs, context) {
    if (!template) return '';

    // Collect every unique placeholder key
    const placeholders = [
      ...new Set([...template.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1])),
    ];

    if (placeholders.length === 0) return template;

    const resolved     = {};
    const needsInput   = [];

    for (const key of placeholders) {
      if (DYNAMIC_RESOLVERS[key]) {
        resolved[key] = DYNAMIC_RESOLVERS[key](context);
      } else {
        const def = (varDefs || []).find((v) => v.key === key);
        needsInput.push({ key, def: def || { key, label: key, type: 'text', required: false } });
      }
    }

    if (needsInput.length > 0) {
      const userValues = await showVariableModal(needsInput);
      if (userValues === null) return null; // user cancelled
      Object.assign(resolved, userValues);
    }

    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => resolved[key] ?? `{{${key}}}`);
  }

  // ── Variable input modal ─────────────────────────────────────────────────────

  function showVariableModal(vars) {
    return new Promise((resolve) => {
      document.getElementById('crl-var-modal')?.remove();

      const modal = document.createElement('div');
      modal.id = 'crl-var-modal';
      modal.className = 'crl-var-modal';

      const box = document.createElement('div');
      box.className = 'crl-var-box';

      const titleEl = document.createElement('h3');
      titleEl.className = 'crl-var-title';
      titleEl.textContent = 'Fill in variables';
      box.appendChild(titleEl);

      const fieldMeta = [];

      vars.forEach(({ key, def }) => {
        const wrap = document.createElement('div');
        wrap.className = 'crl-var-field';

        const label = document.createElement('label');
        label.className = 'crl-var-label';
        label.textContent = def.label || key;
        if (def.required) {
          const star = document.createElement('span');
          star.textContent = ' *';
          star.style.color = '#ef4444';
          label.appendChild(star);
        }

        let input;

        if (def.type === 'dropdown' && Array.isArray(def.options) && def.options.length) {
          input = document.createElement('select');
          input.className = 'crl-var-input';
          def.options.forEach((opt) => {
            const o = document.createElement('option');
            o.value = o.textContent = opt;
            input.appendChild(o);
          });
        } else if (def.type === 'textarea') {
          input = document.createElement('textarea');
          input.className = 'crl-var-input';
          input.rows = 3;
          input.placeholder = def.label || key;
        } else {
          input = document.createElement('input');
          input.type = def.type === 'date' ? 'date' : 'text';
          input.className = 'crl-var-input';
          input.placeholder = def.label || key;
        }

        input.dataset.key = key;
        wrap.appendChild(label);
        wrap.appendChild(input);
        box.appendChild(wrap);
        fieldMeta.push({ key, el: input, required: !!def.required });
      });

      // Footer buttons
      const footer = document.createElement('div');
      footer.className = 'crl-var-footer';

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'crl-var-btn crl-var-btn--cancel';
      cancelBtn.type = 'button';
      cancelBtn.textContent = 'Cancel';

      const launchBtn = document.createElement('button');
      launchBtn.className = 'crl-var-btn crl-var-btn--launch';
      launchBtn.type = 'button';
      launchBtn.textContent = 'Launch ↵';

      footer.appendChild(cancelBtn);
      footer.appendChild(launchBtn);
      box.appendChild(footer);
      modal.appendChild(box);
      document.body.appendChild(modal);

      // Focus first field
      setTimeout(() => fieldMeta[0]?.el?.focus(), 30);

      function collectAndResolve() {
        const values = {};
        let valid = true;
        for (const f of fieldMeta) {
          const val = f.el.tagName === 'SELECT' ? f.el.value : f.el.value.trim();
          if (f.required && !val) {
            f.el.classList.add('crl-var-input--error');
            if (valid) f.el.focus();
            valid = false;
          } else {
            f.el.classList.remove('crl-var-input--error');
            values[f.key] = val;
          }
        }
        if (!valid) return;
        modal.remove();
        resolve(values);
      }

      function cancel() { modal.remove(); resolve(null); }

      launchBtn.addEventListener('click', collectAndResolve);
      cancelBtn.addEventListener('click', cancel);

      // Keyboard handling
      box.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); cancel(); }
        if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'SELECT') {
          e.preventDefault();
          collectAndResolve();
        }
      });

      // Click backdrop to cancel
      modal.addEventListener('mousedown', (e) => {
        if (e.target === modal) cancel();
      });
    });
  }

  return { resolve };
})();
