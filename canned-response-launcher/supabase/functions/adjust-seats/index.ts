/**
 * adjust-seats — Supabase Edge Function
 *
 * POST /functions/v1/adjust-seats
 * Headers: Authorization: Bearer <supabase_jwt>
 * Body:    { teamId: string, quantity: number }
 *
 * Allows a team owner to increase or decrease the number of paid seats on
 * their Stripe subscription.  Validates that the new quantity is at least
 * equal to the current number of active (non-removed) team members so seats
 * can never be reduced below headcount.
 *
 * Returns: { seats_purchased, seatsUsed, ok: true }
 *
 * Env vars required:
 *   STRIPE_SECRET_KEY
 *   SUPABASE_URL             (auto-injected by Supabase)
 *   SUPABASE_SERVICE_ROLE_KEY (auto-injected)
 *   SUPABASE_ANON_KEY        (auto-injected)
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
  if (req.method !== 'POST')    return json({ error: 'Method not allowed' }, 405);

  // ── Authenticate ─────────────────────────────────────────────────────────────
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ error: 'Missing Authorization header' }, 401);

  const supabase   = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth:   { persistSession: false },
  });

  const { data: { user }, error: authErr } = await authClient.auth.getUser();
  if (authErr || !user) return json({ error: 'Invalid or expired session' }, 401);

  // ── Parse body ───────────────────────────────────────────────────────────────
  let body: { teamId?: string; quantity?: number };
  try   { body = await req.json(); }
  catch { return json({ error: 'Invalid JSON body' }, 400); }

  const { teamId, quantity } = body;
  if (!teamId)                              return json({ error: 'teamId is required' }, 400);
  if (typeof quantity !== 'number' || quantity < 1)
    return json({ error: 'quantity must be a positive integer' }, 400);
  if (!Number.isInteger(quantity))          return json({ error: 'quantity must be an integer' }, 400);
  if (quantity > 500)                       return json({ error: 'Maximum 500 seats per team' }, 400);

  // ── Verify the caller owns this team (check teams.owner_id directly) ────────
  const { data: team, error: teamErr } = await supabase
    .from('teams')
    .select('id, owner_id')
    .eq('id', teamId)
    .single();

  if (teamErr || !team)
    return json({ error: 'Team not found' }, 404);
  if (team.owner_id !== user.id)
    return json({ error: 'Only the team owner can adjust seat count' }, 403);

  // ── Count active members (can't reduce below this) ───────────────────────────
  const { count: memberCount, error: countErr } = await supabase
    .from('team_members')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', teamId);

  if (countErr) {
    console.error('[adjust-seats] member count error:', countErr.message);
    return json({ error: `Failed to count team members: ${countErr.message}` }, 500);
  }
  const seatsUsed = memberCount ?? 0;

  if (quantity < seatsUsed) {
    return json({
      error: `Cannot reduce seats below current headcount. You have ${seatsUsed} active member${seatsUsed !== 1 ? 's' : ''} — minimum quantity is ${seatsUsed}.`,
    }, 422);
  }

  // ── Fetch owner profile for Stripe subscription ID ───────────────────────────
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('stripe_subscription_id, stripe_customer_id')
    .eq('id', user.id)
    .single();

  if (profileErr || !profile)
    return json({ error: 'Could not load billing profile' }, 500);
  if (!profile.stripe_subscription_id)
    return json({ error: 'No active subscription found. Please visit the Billing tab to upgrade.' }, 422);

  // ── Update Stripe subscription quantity ───────────────────────────────────────
  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe.subscriptions.retrieve(profile.stripe_subscription_id, {
      expand: ['items.data.price'],
    });
  } catch (e: any) {
    return json({ error: `Stripe error: ${e.message}` }, 502);
  }

  if (subscription.status === 'canceled') {
    return json({ error: 'Subscription is cancelled. Resubscribe from the Billing tab.' }, 422);
  }

  // Find the subscription item to update (first item = the team plan price)
  const subItem = subscription.items.data[0];
  if (!subItem) return json({ error: 'Subscription item not found' }, 502);

  try {
    await stripe.subscriptionItems.update(subItem.id, {
      quantity,
      proration_behavior: 'always_invoice', // charge/credit immediately
    });
  } catch (e: any) {
    return json({ error: `Failed to update subscription: ${e.message}` }, 502);
  }

  // ── Persist updated seat count to the teams table ─────────────────────────────
  const { error: teamUpdateErr } = await supabase
    .from('teams')
    .update({ seats_purchased: quantity })
    .eq('id', teamId);

  if (teamUpdateErr) {
    // Stripe was already updated — log the DB inconsistency but don't fail the user
    console.error('[adjust-seats] DB update failed after Stripe update:', teamUpdateErr.message);
  }

  // ── Return new state ──────────────────────────────────────────────────────────
  return json({
    ok:              true,
    seats_purchased: quantity,
    seatsUsed,
  });
});
