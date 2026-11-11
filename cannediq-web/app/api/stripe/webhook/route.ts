/**
 * POST /api/stripe/webhook
 * Replaces: Supabase Edge Function stripe-webhook
 *
 * Stripe Dashboard endpoint (set this, then leave the old Edge Function
 * endpoint in place until the published extension has rolled out):
 *   https://<your-app-host>/api/stripe/webhook
 *
 * Events: checkout.session.completed, customer.subscription.created,
 * customer.subscription.updated, customer.subscription.deleted,
 * invoice.payment_succeeded, invoice.payment_failed.
 *
 * Signature is verified against the raw body. No user JWT — Stripe calls this.
 */
import { NextRequest } from 'next/server';
import type Stripe from 'stripe';
import { adminClient, json } from '@/lib/supabase';
import { stripe } from '@/lib/stripe';
import {
  applySubscriptionState,
  customerIdOf,
  syncTeamSeats,
  updateProfile,
  userIdFromCustomer,
} from '@/lib/billing';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const signature = req.headers.get('stripe-signature');
  const body = await req.text();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 });
  }
  if (!secret) {
    console.error('[stripe/webhook] STRIPE_WEBHOOK_SECRET is not set');
    return new Response('Webhook secret not configured', { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Signature verification failed';
    console.error('[stripe/webhook] Signature error:', msg);
    return new Response(`Webhook Error: ${msg}`, { status: 400 });
  }

  const supabase = adminClient();

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log('[stripe/webhook] checkout.session.completed', {
          mode: session.mode,
          client_reference_id: session.client_reference_id,
          subscription: session.subscription,
          customer: session.customer,
          metadata: session.metadata,
        });

        if (session.metadata?.type === 'template_purchase') {
          await recordTemplatePurchase(supabase, session);
          break;
        }

        if (session.mode !== 'subscription' || !session.subscription) break;

        const subscriptionId = typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription.id;
        const sub = await stripe.subscriptions.retrieve(subscriptionId);

        const userId = session.client_reference_id
          ?? sub.metadata?.supabase_user_id
          ?? session.metadata?.supabase_user_id
          ?? null;
        if (!userId) {
          console.error('[stripe/webhook] Could not determine user ID');
          break;
        }

        await applySubscriptionState(supabase, sub, userId, { downgradeInactive: false });
        await captureCheckoutContact(supabase, session.id, userId);
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const userId = await resolveSubscriptionUser(supabase, sub);
        if (!userId) break;
        const { plan } = await applySubscriptionState(supabase, sub, userId);
        console.log(`[stripe/webhook] User ${userId} subscription → ${sub.status} (tier: ${plan})`);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const userId = await resolveSubscriptionUser(supabase, sub);
        if (!userId) break;

        await updateProfile(supabase, userId, {
          tier: 'free',
          stripe_subscription_id: null,
          subscription_status: 'canceled',
          cancel_at_period_end: false,
          current_period_end: null,
        });
        console.log(`[stripe/webhook] User ${userId} downgraded to free (subscription deleted)`);

        if (sub.metadata?.plan === 'team' || sub.metadata?.team_id) {
          await syncTeamSeats(supabase, userId, 1, sub.metadata?.team_id);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const inv = event.data.object as Stripe.Invoice;
        const { metadata, subscriptionId } = invoiceSubscription(inv);
        const userId = metadata.supabase_user_id
          ?? await userIdFromCustomer(supabase, customerIdOf(inv.customer));
        if (!userId) break;

        await updateProfile(supabase, userId, {
          subscription_status: 'past_due',
          ...(subscriptionId ? { stripe_subscription_id: subscriptionId } : {}),
        });
        console.log(`[stripe/webhook] invoice.payment_failed → user ${userId} marked past_due`);
        break;
      }

      case 'invoice.payment_succeeded': {
        const inv = event.data.object as Stripe.Invoice;
        const { metadata, subscriptionId } = invoiceSubscription(inv);

        if (subscriptionId) {
          try {
            const sub = await stripe.subscriptions.retrieve(subscriptionId);
            const userId = await resolveSubscriptionUser(supabase, sub)
              ?? metadata.supabase_user_id
              ?? null;
            if (userId) {
              const { plan } = await applySubscriptionState(supabase, sub, userId);
              const quantity = sub.items.data[0]?.quantity ?? lineQuantity(inv);
              console.log(`[stripe/webhook] invoice.paid → user ${userId}, plan=${plan}, qty=${quantity}`);
              break;
            }
          } catch (err) {
            console.error('[stripe/webhook] invoice subscription retrieve failed:', err);
          }
        }

        const userId = metadata.supabase_user_id;
        const plan = metadata.plan;
        if (!userId || !plan) {
          console.log('[stripe/webhook] invoice.payment_succeeded: missing metadata, skipping');
          break;
        }
        const quantity = lineQuantity(inv);
        await updateProfile(supabase, userId, {
          tier: plan,
          ...(subscriptionId ? { stripe_subscription_id: subscriptionId } : {}),
          subscription_status: 'active',
        });
        if (plan === 'team') await syncTeamSeats(supabase, userId, quantity, metadata.team_id);
        break;
      }

      default:
        console.log(`[stripe/webhook] Unhandled event type: ${event.type}`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Handler error';
    console.error('[stripe/webhook] Handler error:', msg);
    // 200 so Stripe does not retry a deterministic bug. sync-billing repairs
    // state the next time the user opens the extension.
    return json({ received: true, warning: msg });
  }

  return json({ received: true });
}

async function recordTemplatePurchase(
  supabase: ReturnType<typeof adminClient>,
  session: Stripe.Checkout.Session,
) {
  const packId = session.metadata?.pack_id;
  const userId = session.metadata?.supabase_user_id;
  if (!packId || !userId) {
    console.error('[stripe/webhook] Template purchase missing pack_id or user_id in metadata');
    return;
  }

  const record: Record<string, string | null> = {
    user_id: userId,
    pack_id: packId,
    purchased_at: new Date().toISOString(),
    stripe_payment_intent_id: typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id ?? null,
  };
  if (session.metadata?.team_id) record.team_id = session.metadata.team_id;

  const { error } = await supabase
    .from('user_template_purchases')
    .upsert(record, { onConflict: 'user_id,pack_id', ignoreDuplicates: true });

  if (error) console.error('[stripe/webhook] Failed to record template purchase:', error.message);
  else console.log(`[stripe/webhook] Template purchase recorded: pack=${packId} user=${userId}`);
}

async function captureCheckoutContact(
  supabase: ReturnType<typeof adminClient>,
  sessionId: string,
  userId: string,
) {
  try {
    const full = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['customer_details'],
    });
    const cd = full.customer_details;
    const companyField = full.custom_fields?.find((f) => f.key === 'company');
    const companyName = companyField?.text?.value ?? null;

    const patch: Record<string, string> = {};
    if (cd?.name) patch.full_name = cd.name;
    if (cd?.phone) patch.phone = cd.phone;
    if (companyName) patch.company_name = companyName;
    if (cd?.address?.country) patch.billing_country = cd.address.country;
    if (cd?.address?.postal_code) patch.billing_postal_code = cd.address.postal_code;
    if (Object.keys(patch).length) await updateProfile(supabase, userId, patch);
    console.log(
      `[stripe/webhook] User ${userId} contact name=${cd?.name ?? ''} phone=${cd?.phone ?? ''} company=${companyName ?? ''}`,
    );
  } catch (err) {
    console.error('[stripe/webhook] Contact capture failed:', err);
  }
}

async function resolveSubscriptionUser(
  supabase: ReturnType<typeof adminClient>,
  sub: Stripe.Subscription,
): Promise<string | null> {
  if (sub.metadata?.supabase_user_id) return sub.metadata.supabase_user_id;
  return userIdFromCustomer(supabase, customerIdOf(sub.customer));
}

function invoiceSubscription(inv: Stripe.Invoice): {
  metadata: Record<string, string>;
  subscriptionId: string;
} {
  const parent = inv.parent?.subscription_details;
  const legacy = inv as Stripe.Invoice & {
    subscription?: string | { id?: string } | null;
    subscription_details?: { metadata?: Stripe.Metadata | null; subscription?: string | null };
  };

  const metadata = {
    ...(legacy.subscription_details?.metadata ?? {}),
    ...(parent?.metadata ?? {}),
  } as Record<string, string>;

  let subscriptionId = '';
  const parentSub = parent?.subscription;
  if (typeof parentSub === 'string') subscriptionId = parentSub;
  else if (parentSub && typeof parentSub === 'object') subscriptionId = parentSub.id;
  else if (typeof legacy.subscription === 'string') subscriptionId = legacy.subscription;
  else if (legacy.subscription && typeof legacy.subscription === 'object' && legacy.subscription.id) {
    subscriptionId = legacy.subscription.id;
  } else if (typeof legacy.subscription_details?.subscription === 'string') {
    subscriptionId = legacy.subscription_details.subscription;
  }

  return { metadata, subscriptionId };
}

function lineQuantity(inv: Stripe.Invoice): number {
  const line = inv.lines?.data?.[0] as { quantity?: number | null } | undefined;
  return line?.quantity ?? 1;
}
