/**
 * /billing/complete — hosted page after Stripe Checkout or the Customer Portal.
 * Replaces the billing-complete Edge Function.
 *
 *   ?status=success
 *   ?status=cancel
 *   ?status=portal
 *   ?status=template_success&pack_id=&session_id=
 */
import type { Metadata } from 'next';
import { EXT_ID } from '@/lib/stripe';

export const metadata: Metadata = { title: 'Billing — CannedIQ' };

function safeExtId(): string {
  const id = (EXT_ID || '').trim();
  return /^[a-p]{32}$/.test(id) ? id : '';
}

function safePackId(value: string | undefined): string {
  return value && /^[0-9a-f-]{36}$/i.test(value) ? value : '';
}

function safeSessionId(value: string | undefined): string {
  return value && /^cs_[A-Za-z0-9_]+$/.test(value) ? value : '';
}

export default async function BillingCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; pack_id?: string; session_id?: string }>;
}) {
  const params = await searchParams;
  const status = typeof params.status === 'string' ? params.status : 'cancel';
  const extId = safeExtId();
  const packId = safePackId(typeof params.pack_id === 'string' ? params.pack_id : undefined);
  const sessionId = safeSessionId(typeof params.session_id === 'string' ? params.session_id : undefined);

  const templateHref = extId && packId
    ? `chrome-extension://${extId}/options.html?tab=templates&template_purchased=${encodeURIComponent(packId)}&session_id=${encodeURIComponent(sessionId)}`
    : '';
  const billingHref = extId
    ? `chrome-extension://${extId}/options.html?tab=billing`
    : '';

  let title = 'Payment cancelled';
  let body = 'No charge was made. You are still on your current plan. You can upgrade any time from the Billing tab in the extension.';
  let href = billingHref;
  let cta = 'Return to CannedIQ';
  let refresh = false;

  if (status === 'success') {
    title = "You're all set!";
    body = 'Your plan has been upgraded. The change takes effect immediately. Reopen the extension options page to see your new plan. From the Teams tab you can create a team and invite colleagues.';
    refresh = true;
  } else if (status === 'portal') {
    title = 'Subscription updated';
    body = 'Your changes have been saved. Cancellations take effect at the end of the current billing period. Reopen the extension to see your current plan.';
    refresh = true;
  } else if (status === 'template_success') {
    title = 'Pack purchased!';
    body = 'Your template pack has been unlocked. Open the extension and the commands will be applied automatically. If you do not see them, open Templates and click Re-apply.';
    href = templateHref;
    cta = 'Open extension →';
    refresh = true;
  }

  const script = refresh ? `
    (function () {
      var extId = ${JSON.stringify(extId)};
      if (extId && window.chrome && chrome.runtime && chrome.runtime.sendMessage) {
        try { chrome.runtime.sendMessage(extId, { type: 'REFRESH_PLAN' }, function () {}); } catch (e) {}
      }
    })();
  ` : '';

  return (
    <main style={{
      fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
      textAlign: 'center',
      padding: '72px 24px',
      maxWidth: 440,
      margin: '0 auto',
    }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: '#4f46e5', marginBottom: 28 }}>⚡ CannedIQ</div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>{title}</h1>
      <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.6 }}>{body}</p>
      {href ? (
        <a href={href} style={{
          display: 'inline-block',
          marginTop: 20,
          background: '#4f46e5',
          color: '#fff',
          borderRadius: 8,
          padding: '11px 24px',
          fontSize: 14,
          fontWeight: 600,
          textDecoration: 'none',
        }}>{cta}</a>
      ) : (
        <p style={{ marginTop: 16, color: '#6b7280' }}>Close this tab and open the CannedIQ extension.</p>
      )}
      {script ? <script dangerouslySetInnerHTML={{ __html: script }} /> : null}
    </main>
  );
}
