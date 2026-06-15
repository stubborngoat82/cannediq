/**
 * CRL — core/conditions.js
 * Evaluates command conditions against page context.
 */

const CRLConditions = (() => {

  /**
   * Evaluate an array of conditions.
   * Returns { pass: boolean, reason: string|null }
   * All conditions must pass (AND logic).
   */
  function evaluate(conditions, context) {
    if (!conditions || conditions.length === 0) return { pass: true, reason: null };

    for (const cond of conditions) {
      const result = evaluateOne(cond, context);
      if (!result.pass) return result;
    }
    return { pass: true, reason: null };
  }

  function evaluateOne(cond, ctx) {
    const { type, operator, value } = cond;

    switch (type) {
      case 'site':
      case 'hostname':
        return check(ctx.hostname, operator, value, type);

      case 'url':
        return check(ctx.currentUrl, operator, value, type);

      case 'siteName':
        return check(ctx.siteName, operator, value, type);

      case 'selectedTextExists': {
        const exists = !!(ctx.selectedText && ctx.selectedText.trim());
        const pass = operator === 'notExists' ? !exists : exists;
        return { pass, reason: pass ? null : (exists ? 'Text is selected' : 'No text selected') };
      }

      case 'inputFocused': {
        const focused = ctx.activeInputText !== undefined;
        return { pass: focused, reason: focused ? null : 'No input focused' };
      }

      default:
        return { pass: true, reason: null };
    }
  }

  function check(subject, operator, value, type) {
    const s = (subject || '').toLowerCase();
    const v = (value   || '').toLowerCase();
    let pass = false;

    switch (operator) {
      case 'equals':     pass = s === v; break;
      case 'contains':   pass = s.includes(v); break;
      case 'startsWith': pass = s.startsWith(v); break;
      case 'endsWith':   pass = s.endsWith(v); break;
      case 'exists':     pass = !!s; break;
      case 'notExists':  pass = !s; break;
      default:           pass = true;
    }

    return {
      pass,
      reason: pass ? null : `Condition failed: ${type} ${operator} "${value}"`,
    };
  }

  return { evaluate };
})();
