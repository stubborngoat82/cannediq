/**
 * POST /api/billing/sync
 * Replaces: Supabase Edge Function sync-billing
 *
 * Pulls authoritative subscription state from Stripe and writes it back to
 * the profiles/teams tables. Called by the extension after returning from
 * Stripe Checkout or the Customer Portal.
 */
import { NextRequest } from 'next/server';
import { requireAuth, adminClient, json, cors } from '@/lib/supabase';
import { stripe } from '@/lib/stripe';
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

    if (!profile?.stripe_subscription_id) return json({ plan: 'free' });

    let sub: Stripe.Subscription;
    try {
      sub = await stripe.subscriptions.retrieve(profile.stripe_subscription_id, {
        expand: ['items.data.price'],
      });
    } catch {
      return json({ plan: 'free' });
    }

    if (sub.status === 'canceled' || sub.status === 'unpaid') {
      await supabase.from('profiles').update({
        tier: 'free', subscription_status: sub.status,
      }).eq('id', user.id);
      return json({ plan: 'free' });
    }

    // Determine plan from price nickname / metadata
    const price    = sub.items.data[0]?.price as Stripe.Price;
    const nickname = (price?.nickname ?? price?.metadata?.plan ?? '').toLowerCase();
    const plan     = ['pro', 'ai', 'team'].find((p) => nickname.includes(p)) ?? 'pro';
    const quantity = sub.items.data[0]?.quantity ?? 1;

    const updates: Record<string, unknown> = {
      tier:                  plan,
      subscription_status:   sub.status,
      // current_period_end moved to SubscriptionItem in Stripe v22 (dahlia)
      current_period_end:    new Date((sub.items.data[0]?.current_period_end ?? 0) * 1000).toISOString(),
      cancel_at_period_end:  sub.cancel_at_period_end,
    };

    await supabase.from('profiles').update(updates).eq('id', user.id);

    // Sync team seat count if applicable
    if (plan === 'team') {
      await supabase
        .from('teams')
        .update({ seats_purchased: quantity })
        .eq('owner_id', user.id);
    }

    return json({ plan, seats_purchased: plan === 'team' ? quantity : undefined });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    return json({ error: e.message ?? 'Internal error' }, e.status ?? 500);
  }
}
