/**
 * Shared Stripe ↔ profile sync used by checkout, sync-billing, and the webhook.
 * Plan source of truth is the subscription price id (env), then subscription metadata.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { PRICE_IDS } from '@/lib/stripe';

const KNOWN_PLANS = ['free', 'pro', 'ai', 'team'] as const;

export function priceToPlan(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [plan, id] of Object.entries(PRICE_IDS)) {
    if (id) map[id] = plan;
  }
  const legacy: Record<string, string | undefined> = {
    pro: process.env.STRIPE_PRO_PRICE_ID,
    ai: process.env.STRIPE_AI_PRICE_ID,
    team: process.env.STRIPE_TEAM_PRICE_ID,
  };
  for (const [plan, id] of Object.entries(legacy)) {
    if (id && !map[id]) map[id] = plan;
  }
  return map;
}

export function customerIdOf(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined,
): string | null {
  if (!customer) return null;
  return typeof customer === 'string' ? customer : customer.id;
}

/** What the customer is actually paying for. Price id wins over stale metadata. */
export function planFromSubscription(sub: Stripe.Subscription): string {
  const price = sub.items.data[0]?.price;
  const priceId = typeof price === 'string' ? price : price?.id ?? '';
  const mapped = priceToPlan()[priceId];
  if (mapped) return mapped;

  const meta = sub.metadata?.plan;
  if (meta && (KNOWN_PLANS as readonly string[]).includes(meta)) return meta;

  if (price && typeof price !== 'string') {
    const nickname = `${price.nickname ?? ''} ${price.metadata?.plan ?? ''}`.toLowerCase();
    const hit = ['team', 'ai', 'pro'].find((p) => nickname.includes(p));
    if (hit) return hit;
  }
  return 'pro';
}

/** Stripe dahlia moved current_period_end onto the subscription item. */
export function periodEndIso(sub: Stripe.Subscription): string | null {
  const itemEnd = sub.items.data[0]?.current_period_end;
  if (itemEnd) return new Date(itemEnd * 1000).toISOString();
  const legacy = (sub as Stripe.Subscription & { current_period_end?: number }).current_period_end;
  if (legacy) return new Date(legacy * 1000).toISOString();
  return null;
}

export async function updateProfile(
  supabase: SupabaseClient,
  userId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
  if (error) throw new Error(`Failed to update profile ${userId}: ${error.message}`);
}

/**
 * Write Stripe quantity into teams.seats_purchased.
 * teamId scopes the update to one team. Without it, every team this user owns
 * is updated (legacy subscriptions that pre-date team_id metadata).
 */
export async function syncTeamSeats(
  supabase: SupabaseClient,
  userId: string,
  quantity: number,
  teamId?: string | null,
): Promise<void> {
  const seats = Math.max(1, quantity);
  let query = supabase.from('teams').update({ seats_purchased: seats });
  query = teamId
    ? query.eq('id', teamId).eq('owner_id', userId)
    : query.eq('owner_id', userId);

  const { error } = await query;
  if (error) {
    console.error(`[billing] Failed to sync team seats for ${userId}:`, error.message);
  } else {
    console.log(
      `[billing] Team seats → ${seats} for owner ${userId}${teamId ? ` (team ${teamId})` : ''}`,
    );
  }
}

export async function userIdFromCustomer(
  supabase: SupabaseClient,
  customerId: string | null,
): Promise<string | null> {
  if (!customerId) return null;
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/** Apply a subscription onto profiles + team seats. Used by the webhook and sync-billing. */
export async function applySubscriptionState(
  supabase: SupabaseClient,
  sub: Stripe.Subscription,
  userId: string,
  opts?: { downgradeInactive?: boolean },
): Promise<{ plan: string; seatsPurchased?: number }> {
  const isActive = sub.status === 'active' || sub.status === 'trialing';
  const paidPlan = planFromSubscription(sub);
  // Checkout completion should record the purchased plan even if Stripe's
  // status string is briefly something other than active/trialing.
  const plan = opts?.downgradeInactive === false || isActive ? paidPlan : 'free';
  const periodEnd = periodEndIso(sub);

  const customerId = customerIdOf(sub.customer);
  await updateProfile(supabase, userId, {
    tier: plan,
    stripe_subscription_id: sub.id,
    ...(customerId ? { stripe_customer_id: customerId } : {}),
    subscription_status: sub.status,
    ...(periodEnd ? { current_period_end: periodEnd } : {}),
    cancel_at_period_end: sub.cancel_at_period_end,
  });

  let seatsPurchased: number | undefined;
  if (paidPlan === 'team' && (isActive || opts?.downgradeInactive === false)) {
    seatsPurchased = Math.max(1, sub.items.data[0]?.quantity ?? 1);
    await syncTeamSeats(supabase, userId, seatsPurchased, sub.metadata?.team_id);
  }
  return { plan, seatsPurchased };
}
