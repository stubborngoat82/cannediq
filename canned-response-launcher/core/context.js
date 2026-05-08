/**
 * CRL — core/context.js
 * Gathers page context for dynamic variables, conditions, and AI prompts.
 * Runs inside content scripts only.
 */

const CRLContext = (() => {

  async function gather(activeField) {
    const ctx = {
      currentUrl:    '',
      hostname:      '',
      pageTitle:     '',
      selectedText:  '',
      activeInputText: '',
      clipboardText: '',
      siteName:      '',
    };

    try { ctx.currentUrl = window.location.href; }    catch {}
    try { ctx.hostname   = window.location.hostname; } catch {}
    try { ctx.pageTitle  = document.title; }           catch {}
    try { ctx.selectedText = window.getSelection()?.toString() ?? ''; } catch {}

    try {
      if (activeField) {
        if (activeField.tagName === 'TEXTAREA' || activeField.tagName === 'INPUT') {
          ctx.activeInputText = activeField.value || '';
        } else if (activeField.isContentEditable) {
          ctx.activeInputText = activeField.innerText || '';
        }
      }
    } catch {}

    try { ctx.siteName = detectSiteName(ctx.hostname); } catch {}

    // Clipboard only when user has explicitly enabled it in settings
    try {
      const settings = await CRLStorage.getSettings();
      if (settings.clipboardEnabled) {
        ctx.clipboardText = await navigator.clipboard.readText().catch(() => '');
      }
    } catch {}

    return ctx;
  }

  const SITE_MAP = {
    'mail.google.com': 'Gmail',   'gmail.com': 'Gmail',
    'linkedin.com':    'LinkedIn',
    'twitter.com':     'Twitter / X', 'x.com': 'Twitter / X',
    'slack.com':       'Slack',
    'notion.so':       'Notion',
    'github.com':      'GitHub',
    'intercom.com':    'Intercom',
    'zendesk.com':     'Zendesk',
    'hubspot.com':     'HubSpot',
    'salesforce.com':  'Salesforce',
    'outlook.live.com': 'Outlook', 'outlook.office.com': 'Outlook',
    'discord.com':     'Discord',
    'teams.microsoft.com': 'Teams',
    'helpscout.net':   'Help Scout',
    'freshdesk.com':   'Freshdesk',
  };

  function detectSiteName(hostname) {
    if (!hostname) return '';
    for (const [key, name] of Object.entries(SITE_MAP)) {
      if (hostname.includes(key)) return name;
    }
    return hostname.replace(/^www\./, '').split('.')[0];
  }

  return { gather, detectSiteName };
})();
