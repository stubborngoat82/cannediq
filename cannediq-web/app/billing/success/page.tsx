/**
 * /billing/success — Post-checkout success landing page
 *
 * Stripe redirects here after a successful checkout.
 * Sends REFRESH_PLAN to the extension via a postMessage so the extension
 * auto-refreshes its plan cache without requiring the user to re-open options.
 */
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Payment Successful — CannedIQ' };

export default function BillingSuccessPage() {
  return (
    <>
      <main style={{ fontFamily: 'sans-serif', textAlign: 'center', padding: '80px 24px' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>You&apos;re all set!</h1>
        <p style={{ color: '#6b7280', marginBottom: 32 }}>
          Your payment was successful. Your new plan is now active.
        </p>
        <p style={{ color: '#6b7280', fontSize: 14 }}>
          Return to the extension options page to see your updated plan.
        </p>
      </main>

      {/* Notify the extension to refresh plan + apply any new template packs */}
      <script dangerouslySetInnerHTML={{ __html: `
        (function() {
          // Tell the extension (opened this tab) to refresh the plan
          if (window.opener) {
            try { window.opener.postMessage({ type: 'BILLING_SUCCESS' }, '*'); } catch {}
          }
          // Also send to the extension via chrome.runtime if available
          const urlParams = new URLSearchParams(location.search);
          const packId    = urlParams.get('pack_id');
          const sessionId = urlParams.get('session_id');
          if (typeof chrome !== 'undefined' && chrome.runtime) {
            chrome.runtime.sendMessage({ type: 'REFRESH_PLAN' }).catch(() => {});
            if (packId) {
              chrome.runtime.sendMessage({ type: 'APPLY_TEMPLATE_PACK', packId, sessionId }).catch(() => {});
            }
          }
        })();
      ` }} />
    </>
  );
}
