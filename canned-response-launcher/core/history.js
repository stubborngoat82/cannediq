/**
 * CRL — core/history.js
 * Records command execution history and usage counts.
 */

const CRLHistory = (() => {

  function genId() {
    return 'hist_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  /**
   * Record one command execution.
   * @param {object} opts
   * @param {string} opts.commandId
   * @param {string} [opts.site]        - hostname where it was executed
   * @param {string} [opts.triggerType] - 'palette' | 'slash' | 'text' | 'hotkey' | 'contextMenu' | 'chain'
   * @param {boolean} opts.success
   * @param {any}    [opts.error]
   */
  async function record({ commandId, site, triggerType = 'palette', success, error = null }) {
    const entry = {
      id:          genId(),
      commandId,
      executedAt:  new Date().toISOString(),
      site:        site || (typeof window !== 'undefined' ? window.location?.hostname : '') || '',
      triggerType,
      success,
      error:       error ? String(error) : null,
    };

    await CRLStorage.appendHistory(entry);

    if (success) {
      await CRLStorage.incrementUsageCount(commandId);
    }
  }

  return { record };
})();
