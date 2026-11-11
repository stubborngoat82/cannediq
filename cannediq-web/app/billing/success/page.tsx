/**
 * /billing/success — Stripe return page for subscription checkout.
 * Replaces the billing-success Edge Function (HTML).
 *
 * Query: ?plan=pro|ai|team&ext=<extension id>&session_id=cs_...
 * Tells the extension to refresh its plan, then opens the options Billing tab.
 */
import type { Metadata } from 'next';
import { EXT_ID } from '@/lib/stripe';

export const metadata: Metadata = { title: 'Payment Successful — CannedIQ' };

const PLAN_LABELS: Record<string, string> = {
  pro: 'Pro',
  ai: 'Pro + AI',
  team: 'Team',
};

function safeExtId(value: string | undefined): string {
  const id = (value || EXT_ID || '').trim();
  return /^[a-p]{32}$/.test(id) ? id : '';
}

function safePlan(value: string | undefined): string {
  const plan = (value ?? '').toLowerCase();
  return plan in PLAN_LABELS ? plan : '';
}

export default async function BillingSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; ext?: string }>;
}) {
  const params = await searchParams;
  const plan = safePlan(typeof params.plan === 'string' ? params.plan : undefined);
  const extId = safeExtId(typeof params.ext === 'string' ? params.ext : undefined);
  const planLabel = PLAN_LABELS[plan] ?? '';
  const returnHref = extId
    ? `chrome-extension://${extId}/options.html?tab=billing`
    : '';

  const script = `
    (function () {
      var extId = ${JSON.stringify(extId)};
      if (extId && window.chrome && chrome.runtime && chrome.runtime.sendMessage) {
        try { chrome.runtime.sendMessage(extId, { type: 'REFRESH_PLAN' }, function () {}); } catch (e) {}
      }
      window._ciqT = setTimeout(function () {
        if (extId) location.href = 'chrome-extension://' + extId + '/options.html?tab=billing';
      }, 8000);
      document.addEventListener('click', function () { clearTimeout(window._ciqT); });
    })();
  `;

  return (
    <main style={{
      fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
      textAlign: 'center',
      padding: '72px 24px',
      maxWidth: 480,
      margin: '0 auto',
    }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: '#7c3aed', marginBottom: 28 }}>⚡ CannedIQ</div>
      <div style={{ fontSize: 40, marginBottom: 16 }}>✓</div>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>You&apos;re all set!</h1>
      <p style={{ color: '#6b7280', marginBottom: 20, lineHeight: 1.6 }}>
        Your subscription is active. Switch back to the extension to start using your new features.
      </p>
      {planLabel ? (
        <div style={{
          display: 'inline-block',
          fontSize: 13,
          fontWeight: 600,
          padding: '4px 14px',
          borderRadius: 99,
          marginBottom: 28,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          background: '#ede9fe',
          color: '#6d28d9',
        }}>{planLabel} — Active</div>
      ) : null}
      <div>
        {returnHref ? (
          <a href={returnHref} style={{
            display: 'inline-block',
            background: '#7c3aed',
            color: '#fff',
            borderRadius: 10,
            padding: '13px 28px',
            fontWeight: 600,
            textDecoration: 'none',
          }}>↩ Return to CannedIQ</a>
        ) : (
          <p style={{ color: '#6b7280' }}>Close this tab and reopen the extension options page.</p>
        )}
      </div>
      <p style={{ marginTop: 28, fontSize: 13, color: '#64748b' }}>
        Your plan is active immediately. If the extension still shows Free, open the Billing tab —
        it refreshes when you return. This page will try to open the extension in a few seconds.
      </p>
      <script dangerouslySetInnerHTML={{ __html: script }} />
    </main>
  );
}
