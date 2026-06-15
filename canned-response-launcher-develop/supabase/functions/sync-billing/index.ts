/**
 * sync-billing — Supabase Edge Function
 *
 * POST /functions/v1/sync-billing
 * Headers: Authorization: Bearer <supabase_jwt>
 *
 * Reads the user's current Stripe subscription and writes the authoritative
 * tier + team seat count into the database.  Called by the extension whenever
 * REFRESH_PLAN fires (e.g. after returning from Stripe Checkout or the portal)
 * so billing state is always in sync even if the webhook mis-fires.
 *
 * Returns: { plan, seats_purchased? }
 *
 * Env:
 *   STRIPE_SECRET_KEY
 *   SUPABASE_URL (auto)
 *   SUPABASE_SERVICE_ROLE_KEY (auto)
 *   SUPABASE_ANON_KEY (auto)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'npm:stripe@14';

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STRIPE_KEY        = Deno.env.get('STRIPE_SECRET_KEY')!;

const stripe = new Stripe(STRIPE_KEY, { apiVersion: '2024-04-10' });

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // ── Auth ─────────────────────────────────────────────────────────────────────
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ error: 'Missing Authorization header' }, 401);

  const supabase    = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const authClient  = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth:   { persistSession: false },
  });

  const { data: { user }, error: authErr } = await authClient.auth.getUser();
  if (authErr || !user) return json({ error: 'Invalid or expired session' }, 401);

  // ── Fetch profile ─────────────────────────────────────────────────────────────
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_subscription_id, stripe_customer_id, tier')
    .eq('id', user.id)
    .single();

  const subId = profile?.stripe_subscription_id;

  // No subscription on file → confirm free
  if (!subId) {
    return json({ plan: 'free' });
  }

  // ── Fetch subscription from Stripe ────────────────────────────────────────────
  let sub: Stripe.Subscription;
  try {
    sub = await stripe.subscriptions.retrieve(subId, {
      expand: ['items.data.price'],
    });
  } catch (err: unknown) {
    // Subscription deleted on Stripe side — reset to free
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('No such subscription') || msg.includes('resource_missing')) {
      await supabase.from('profiles').update({
        tier:                   'free',
        stripe_subscription_id: null,
        subscription_status:    'canceled',
      }).eq('id', user.id);
      return json({ plan: 'free', synced: true });
    }
    console.error('[sync-billing] Stripe error:', msg);
    // Return what we have in DB rather than erroring out
    return json({ plan: profile?.tier ?? 'free', stripe_error: msg });
  }

  // ── Determine plan from subscription ─────────────────────────────────────────
  const isActive = sub.status === 'active' || sub.status === 'trialing';

  // Plan is stored in subscription metadata (set by billing-checkout)
  const plan = isActive ? (sub.metadata?.plan ?? 'pro') : 'free';

  // ── Update profile ────────────────────────────────────────────────────────────
  await supabase.from('profiles').update({
    tier:                   plan,
    stripe_subscription_id: sub.id,
    subscription_status:    sub.status,
  }).eq('id', user.id);

  // ── Sync team seats ───────────────────────────────────────────────────────────
  let seatsPurchased: number | undefined;

  if (plan === 'team' && isActive) {
    const quantity = sub.items.data[0]?.quantity ?? 1;
    seatsPurchased = Math.max(1, quantity);

    const { error: seatErr } = await supabase
      .from('teams')
      .update({ seats_purchased: seatsPurchased })
      .eq('owner_id', user.id);

    if (seatErr) {
      console.error('[sync-billing] Failed to update team seats:', seatErr.message);
    } else {
      console.log(`[sync-billing] Team seats → ${seatsPurchased} for owner ${user.id}`);
    }
  }

  console.log(`[sync-billing] User ${user.id} → plan=${plan}, status=${sub.status}`);

  return json({
    plan,
    synced:           true,
    subscription_status: sub.status,
    ...(seatsPurchased !== undefined ? { seats_purchased: seatsPurchased } : {}),
  });
});
