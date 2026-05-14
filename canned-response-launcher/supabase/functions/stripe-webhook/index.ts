/**
 * Supabase Edge Function: stripe-webhook
 *
 * Receives Stripe webhook events and keeps the profiles table in sync
 * with subscription state.
 *
 * Environment variables required:
 *   STRIPE_SECRET_KEY          — your Stripe secret key
 *   STRIPE_WEBHOOK_SECRET      — from Stripe Dashboard → Webhooks → signing secret
 *   SUPABASE_URL               — auto-injected
 *   SUPABASE_SERVICE_ROLE_KEY  — auto-injected
 *
 * Deploy:
 *   supabase functions deploy stripe-webhook --no-verify-jwt
 *
 * Stripe Dashboard setup:
 *   1. Go to Developers → Webhooks → Add endpoint
 *   2. URL: https://<your-project-ref>.supabase.co/functions/v1/stripe-webhook
 *   3. Select events:
 *      - checkout.session.completed
 *      - customer.subscription.updated
 *      - customer.subscription.deleted
 */

import Stripe from 'npm:stripe@14';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  const signature = req.headers.get('stripe-signature');
  const body      = await req.text();

  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 });
  }

  // ── Verify webhook signature ──────────────────────────────────────
  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
    apiVersion: '2024-04-10',
  });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      Deno.env.get('STRIPE_WEBHOOK_SECRET')!
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Signature verification failed';
    console.error('[stripe-webhook] Signature error:', msg);
    return new Response(`Webhook Error: ${msg}`, { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // ── Handle events ─────────────────────────────────────────────────
  try {
    switch (event.type) {

      // Payment succeeded → subscription is now active
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log('[stripe-webhook] checkout.session.completed', {
          mode:               session.mode,
          client_reference_id: session.client_reference_id,
          subscription:       session.subscription,
          customer:           session.customer,
        });

        if (session.mode !== 'subscription') break;

        // client_reference_id is set to user.id in create-checkout-session
        // Fall back to subscription metadata for sessions created before this fix
        let userId = session.client_reference_id ?? null;

        const subscriptionId = session.subscription as string;
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        console.log('[stripe-webhook] subscription metadata:', sub.metadata);

        if (!userId) userId = sub.metadata?.supabase_user_id ?? null;

        if (!userId) {
          console.error('[stripe-webhook] Could not determine user ID from session or subscription metadata');
          break;
        }

        const plan = sub.metadata?.plan ?? 'pro';
        await updateProfile(supabase, userId, {
          tier:                   plan,
          stripe_subscription_id: sub.id,
          subscription_status:    sub.status,
        });
        console.log(`[stripe-webhook] User ${userId} upgraded to ${plan} (status: ${sub.status})`);

        // For team plans, sync the purchased seat count to the teams table.
        // Quantity comes from the first subscription line item.
        if (plan === 'team') {
          const quantity = sub.items.data[0]?.quantity ?? 1;
          await syncTeamSeats(supabase, userId, quantity);
        }
        break;
      }

      // Subscription changed (renewal, downgrade, seat change, etc.)
      case 'customer.subscription.updated': {
        const sub    = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.supabase_user_id;
        if (!userId) break;

        // If status is no longer active, downgrade to free
        const isActive = sub.status === 'active' || sub.status === 'trialing';
        const plan = isActive ? (sub.metadata?.plan ?? 'pro') : 'free';

        await updateProfile(supabase, userId, {
          tier:                   plan,
          stripe_subscription_id: sub.id,
          subscription_status:    sub.status,
        });
        console.log(`[stripe-webhook] User ${userId} subscription → ${sub.status} (tier: ${plan})`);

        // Sync seat count whenever a team subscription changes (seat upgrades/downgrades)
        if (plan === 'team' && isActive) {
          const quantity = sub.items.data[0]?.quantity ?? 1;
          await syncTeamSeats(supabase, userId, quantity);
        }
        break;
      }

      // Subscription ended (cancelled or payment failed permanently)
      case 'customer.subscription.deleted': {
        const sub    = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.supabase_user_id;
        if (!userId) break;

        await updateProfile(supabase, userId, {
          tier:                   'free',
          stripe_subscription_id: null,
          subscription_status:    'canceled',
        });
        console.log(`[stripe-webhook] User ${userId} downgraded to free (subscription deleted)`);

        // Reset seats to 1 (owner only) when team subscription is cancelled
        if (sub.metadata?.plan === 'team') {
          await syncTeamSeats(supabase, userId, 1);
        }
        break;
      }

      default:
        console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Handler error';
    console.error('[stripe-webhook] Handler error:', msg);
    // Still return 200 — Stripe will retry on non-2xx
    return new Response(JSON.stringify({ received: true, warning: msg }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

async function updateProfile(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  patch: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', userId);
  if (error) {
    throw new Error(`Failed to update profile ${userId}: ${error.message}`);
  }
}

/**
 * Write the Stripe seat quantity into the teams.seats_purchased column
 * for the team owned by userId. If the user owns multiple teams (rare),
 * updates all of them — a team plan subscription covers the account.
 */
async function syncTeamSeats(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  quantity: number
): Promise<void> {
  const seats = Math.max(1, quantity);   // always at least 1 (the owner)
  const { error } = await supabase
    .from('teams')
    .update({ seats_purchased: seats })
    .eq('owner_id', userId);

  if (error) {
    console.error(`[stripe-webhook] Failed to sync team seats for ${userId}:`, error.message);
  } else {
    console.log(`[stripe-webhook] Team seats → ${seats} for owner ${userId}`);
  }
}
