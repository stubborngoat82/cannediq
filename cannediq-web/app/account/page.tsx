/**
 * /account — Billing & account management
 * The extension links here from the options page billing tab.
 * Calls POST /api/billing/portal to get the Stripe Customer Portal URL.
 */
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Account — CannedIQ' };

export default function AccountPage() {
  return (
    <main>
      <h1>Account</h1>
      <p>
        Display current plan, usage stats, and a button to open the Stripe
        Customer Portal (<code>POST /api/billing/portal</code>).
      </p>
    </main>
  );
}
