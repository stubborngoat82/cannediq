/**
 * POST /api/billing/portal
 * Replaces: Supabase Edge Function billing-portal
 *
 * Creates a Stripe Customer Portal session and returns { url }.
 */
import { NextRequest } from 'next/server';
import { requireAuth, adminClient, json, cors } from '@/lib/supabase';
import { stripe, APP_URL, EXT_ID } from '@/lib/stripe';

export async function OPTIONS() { return cors(); }

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const supabase = adminClient();

    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    const customerId = profile?.stripe_customer_id as string | undefined;
    if (!customerId) {
      return json({ error: 'No billing account found. Please subscribe to a plan first.' }, 404);
    }

    const returnUrl = EXT_ID
      ? `chrome-extension://${EXT_ID}/options.html?tab=billing`
      : `${APP_URL}/account`;

    const session = await stripe.billingPortal.sessions.create({
      customer:   customerId,
      return_url: returnUrl,
    });

    return json({ url: session.url });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    return json({ error: e.message ?? 'Internal error' }, e.status ?? 500);
  }
}
