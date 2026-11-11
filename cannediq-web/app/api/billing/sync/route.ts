/**
 * POST /api/billing/sync
 * Replaces: Supabase Edge Function sync-billing
 *
 * Pulls the caller's Stripe subscription and writes tier, period, and team
 * seats. The extension calls this after Checkout or the Customer Portal,
 * so a missed webhook still converges.
 */
import { NextRequest } from 'next/server';
import { requireAuth, adminClient, json, cors } from '@/lib/supabase';
import { stripe } from '@/lib/stripe';
import { applySubscriptionState, updateProfile } from '@/lib/billing';
import type Stripe from 'stripe';

export async function OPTIONS() { return cors(); }

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const supabase = adminClient();

    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_subscription_id, stripe_customer_id, tier')
      .eq('id', user.id)
      .single();

    const subId = profile?.stripe_subscription_id as string | undefined;
    if (!subId) return json({ plan: 'free' });

    let sub: Stripe.Subscription;
    try {
      sub = await stripe.subscriptions.retrieve(subId, { expand: ['items.data.price'] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('No such subscription') || msg.includes('resource_missing')) {
        await updateProfile(supabase, user.id, {
          tier: 'free',
          stripe_subscription_id: null,
          subscription_status: 'canceled',
          cancel_at_period_end: false,
        });
        return json({ plan: 'free', synced: true });
      }
      console.error('[billing/sync] Stripe error:', msg);
      return json({ plan: profile?.tier ?? 'free', stripe_error: msg });
    }

    const { plan, seatsPurchased } = await applySubscriptionState(supabase, sub, user.id);
    console.log(`[billing/sync] User ${user.id} → plan=${plan}, status=${sub.status}`);

    return json({
      plan,
      synced: true,
      subscription_status: sub.status,
      ...(seatsPurchased !== undefined ? { seats_purchased: seatsPurchased } : {}),
    });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    return json({ error: e.message ?? 'Internal error' }, e.status ?? 500);
  }
}
