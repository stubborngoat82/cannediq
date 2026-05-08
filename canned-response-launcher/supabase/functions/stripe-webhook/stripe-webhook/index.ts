/**
 * stripe-webhook — Supabase Edge Function
 *
 * POST /functions/v1/stripe-webhook
 * (No Authorization header — Stripe sends the webhook directly)
 *
 * Handles:
 *   checkout.session.completed
 *   customer.subscription.created
 *   customer.subscription.updated
 *   customer.subscription.deleted
 *   invoice.payment_succeeded
 *   invoice.payment_failed
 *
 * Env secrets:
 *   STRIPE_SECRET_KEY
 *   STRIPE_WEBHOOK_SECRET
 *   STRIPE_PRICE_PRO_MONTHLY
 *   STRIPE_PRICE_AI_MONTHLY
 *   STRIPE_PRICE_TEAM_MONTHLY
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14?target=deno';

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STRIPE_KEY        = Deno.env.get('STRIPE_SECRET_KEY')!;
const WEBHOOK_SECRET    = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

// Price → plan mapping
const PRICE_TO_PLAN: Record<string, string> = {
  [Deno.env.get('STRIPE_PRICE_PRO_MONTHLY')  ?? 'price_PLACEHOLDER_pro']:  'pro',
  [Deno.env.get('STRIPE_PRICE_AI_MONTHLY')   ?? 'price_PLACEHOLDER_ai']:   'ai',
  [Deno.env.get('STRIPE_PRICE_TEAM_MONTHLY') ?? 'price_PLACEHOLDER_team']: 'team',
};

const stripe = new Stripe(STRIPE_KEY, { apiVersion: '2024-04-10', httpClient: Stripe.createFetchHttpClient() });
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function ok()  { return new Response('ok',    { status: 200 }); }
function err(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── Plan resolution ───────────────────────────────────────────────────────────

function planFromPriceId(priceId: string): string {
  return PRICE_TO_PLAN[priceId] ?? 'pro';  // safe default
}

function planFromSubscription(sub: Stripe.Subscription): string {
  const priceId = sub.items.data[0]?.price.id ?? '';
  return planFromPriceId(priceId);
}

// ── Profile updater ───────────────────────────────────────────────────────────

async function updateProfile(userId: string, fields: Record<string, unknown>) {
  const { error } = await supabase
    .from('profiles')
    .update(fields)
    .eq('id', userId);

  if (error) console.error('[stripe-webhook] Profile update error:', error);
}

async function getUserIdFromCustomer(customerId: string): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single();
  return data?.id ?? null;
}

// ── Event handlers ────────────────────────────────────────────────────────────

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = (session.metadata?.supabase_user_id) ??
    (session.client_reference_id) ??
    null;

  if (!userId) {
    console.warn('[stripe-webhook] checkout.session.completed: no user_id in metadata');
    return;
  }

  const plan = session.metadata?.plan ?? 'pro';

  // Retrieve full subscription to get period end
  let periodEnd: Date | null = null;
  let subId = session.subscription as string | null;

  if (subId) {
    const sub = await stripe.subscriptions.retrieve(subId);
    periodEnd = new Date(sub.current_period_end * 1000);
  }

  await updateProfile(userId, {
    plan,
    stripe_customer_id:     session.customer as string,
    stripe_subscription_id: subId,
    subscription_status:    'active',
    current_period_end:     periodEnd?.toISOString() ?? null,
    cancel_at_period_end:   false,
    // Grant initial AI credits for Pro+AI plan
    ...(plan === 'ai' ? { ai_credits_remaining: 500, ai_credits_reset_at: new Date().toISOString() } : {}),
  });

  console.log(`[stripe-webhook] checkout.session.completed: userId=${userId} plan=${plan}`);
}

async function handleSubscriptionChange(sub: Stripe.Subscription) {
  const userId = sub.metadata?.supabase_user_id ??
    await getUserIdFromCustomer(sub.customer as string);

  if (!userId) {
    console.warn('[stripe-webhook] subscription event: cannot resolve user_id for customer', sub.customer);
    return;
  }

  const plan       = planFromSubscription(sub);
  const status     = sub.status;    // active | trialing | past_due | canceled | ...
  const periodEnd  = new Date(sub.current_period_end * 1000);
  const cancelFlag = sub.cancel_at_period_end;

  const effectivePlan = (status === 'active' || status === 'trialing') ? plan : 'free';

  await updateProfile(userId, {
    plan:                   effectivePlan,
    stripe_subscription_id: sub.id,
    stripe_customer_id:     sub.customer as string,
    subscription_status:    status,
    current_period_end:     periodEnd.toISOString(),
    cancel_at_period_end:   cancelFlag,
    // Reset AI credits on renewal for Pro+AI
    ...(status === 'active' && plan === 'ai'
      ? { ai_credits_remaining: 500, ai_credits_reset_at: new Date().toISOString() }
      : {}),
  });

  console.log(`[stripe-webhook] subscription ${sub.id}: userId=${userId} plan=${effectivePlan} status=${status}`);
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const userId = sub.metadata?.supabase_user_id ??
    await getUserIdFromCustomer(sub.customer as string);

  if (!userId) return;

  await updateProfile(userId, {
    plan:                   'free',
    stripe_subscription_id: sub.id,
    subscription_status:    'canceled',
    current_period_end:     null,
    cancel_at_period_end:   false,
    ai_credits_remaining:   0,
  });

  console.log(`[stripe-webhook] subscription.deleted: userId=${userId} → free`);
}

async function handleInvoiceSucceeded(invoice: Stripe.Invoice) {
  // Renewal succeeded — refresh period end from subscription
  if (!invoice.subscription) return;

  const sub = await stripe.subscriptions.retrieve(invoice.subscription as string);
  await handleSubscriptionChange(sub);

  console.log(`[stripe-webhook] invoice.payment_succeeded: sub=${invoice.subscription}`);
}

async function handleInvoiceFailed(invoice: Stripe.Invoice) {
  if (!invoice.subscription) return;

  const customerId = invoice.customer as string;
  const userId     = await getUserIdFromCustomer(customerId);
  if (!userId) return;

  await updateProfile(userId, {
    subscription_status: 'past_due',
  });

  console.warn(`[stripe-webhook] invoice.payment_failed: userId=${userId} marked past_due`);
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method !== 'POST') return err('Method not allowed', 405);

  const sig  = req.headers.get('stripe-signature') ?? '';
  const body = await req.arrayBuffer();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      new Uint8Array(body),
      sig,
      WEBHOOK_SECRET
    );
  } catch (e) {
    console.error('[stripe-webhook] Signature verification failed:', e);
    return err('Invalid webhook signature', 400);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionChange(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.payment_succeeded':
        await handleInvoiceSucceeded(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await handleInvoiceFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        // Unhandled event — acknowledge without error
        console.log('[stripe-webhook] Unhandled event type:', event.type);
    }
  } catch (handlerErr) {
    console.error('[stripe-webhook] Handler error:', handlerErr);
    return err('Internal handler error', 500);
  }

  return ok();
});
