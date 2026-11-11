/**
 * /store — Template / Extension Pack Store
 * Fetches packs from GET /api/store and displays them.
 * Free claims → POST /api/store
 * Paid → POST /api/store/checkout → redirects to Stripe
 * After purchase → POST /api/store/deliver delivers commands to the extension
 */
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Template Store — CannedIQ' };

export default function StorePage() {
  return (
    <main>
      <h1>Template Store</h1>
      <p>Fetch and display packs from <code>GET /api/store</code>.</p>
    </main>
  );
}
