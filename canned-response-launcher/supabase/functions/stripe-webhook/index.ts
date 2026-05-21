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
 *      - invoice.payment_succeeded
 *      - invoice.payment_failed
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

      // Checkout completed → subscription is now active.
      // Also capture contact/billing info the customer just filled in.
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log('[stripe-webhook] checkout.session.completed', {
          mode:                session.mode,
          client_reference_id: session.client_reference_id,
          subscription:        session.subscription,
          customer:            session.customer,
        });

        if (session.mode !== 'subscription') break;

        let userId = session.client_reference_id ?? null;

        const subscriptionId = session.subscription as string;
        const sub = await stripe.subscriptions.retrieve(subscriptionId);

        if (!userId) userId = sub.metadata?.supabase_user_id ?? null;
        if (!userId) {
          console.error('[stripe-webhook] Could not determine user ID');
          break;
        }

        const plan = sub.metadata?.plan ?? 'pro';

        // ── Pull contact & billing info from the completed session ────────────
        // Retrieve full session with customer_details expanded
        const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
          expand: ['customer_details'],
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cd = (fullSession as any).customer_details as {
          name?: string;
          email?: string;
          phone?: string;
          address?: {
            line1?: string; line2?: string;
            city?: string; state?: string;
            postal_code?: string; country?: string;
          };
        } | null;

        // Custom field: company name
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const customFields: any[] = (fullSession as any).custom_fields ?? [];
        const companyField = customFields.find((f: any) => f.key === 'company');
        const companyName  = companyField?.text?.value ?? null;

        // Build profile patch — only include fields that were actually filled in
        const profilePatch: Record<string, unknown> = {
          tier:                   plan,
          stripe_subscription_id: sub.id,
          subscription_status:    sub.status,
        };
        if (cd?.name)              profilePatch.full_name     = cd.name;
        if (cd?.phone)             profilePatch.phone         = cd.phone;
        if (companyName)           profilePatch.company_name  = companyName;
        if (cd?.address?.country)  profilePatch.billing_country = cd.address.country;
        if (cd?.address?.postal_code) profilePatch.billing_postal_code = cd.address.postal_code;

        await updateProfile(supabase, userId, profilePatch);
        console.log(`[stripe-webhook] User ${userId} → ${plan}, name=${cd?.name}, phone=${cd?.phone}, company=${companyName}`);

        if (plan === 'team') {
          const quantity = sub.items.data[0]?.quantity ?? 1;
          const teamId   = sub.metadata?.team_id;
          await syncTeamSeats(supabase, userId, quantity, teamId);
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
          const teamId   = sub.metadata?.team_id;
          await syncTeamSeats(supabase, userId, quantity, teamId);
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

        if (sub.metadata?.plan === 'team') {
          const teamId = sub.metadata?.team_id;
          await syncTeamSeats(supabase, userId, 1, teamId);
        }
        break;
      }

      // Invoice payment failed — mark subscription as past_due so the UI
      // shows the "Fix payment" banner. Does NOT downgrade the plan yet —
      // Stripe retries before sending customer.subscription.deleted.
      case 'invoice.payment_failed': {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const inv = event.data.object as any;
        const subMeta: Record<string, string> =
          inv.parent?.subscription_details?.metadata ??
          inv.subscription_details?.metadata ??
          {};
        const userId = subMeta.supabase_user_id;
        if (!userId) break;

        const subscriptionId: string =
          inv.parent?.subscription_details?.subscription ??
          inv.subscription ??
          '';

        await updateProfile(supabase, userId, {
          subscription_status: 'past_due',
          ...(subscriptionId ? { stripe_subscription_id: subscriptionId } : {}),
        });
        console.log(`[stripe-webhook] invoice.payment_failed → user ${userId} marked past_due`);
        break;
      }

      // Invoice paid — most reliable place to sync plan + seats.
      // Fires on initial subscription creation, renewals, and seat changes.
      // The newer Stripe API shape puts metadata under parent.subscription_details;
      // older shape puts it directly on subscription_details — we check both.
      case 'invoice.payment_succeeded': {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const inv = event.data.object as any;

        // Extract subscription metadata (handle both old + new Stripe API shapes)
        const subMeta: Record<string, string> =
          inv.parent?.subscription_details?.metadata ??
          inv.subscription_details?.metadata ??
          {};

        const userId = subMeta.supabase_user_id;
        const plan   = subMeta.plan;

        if (!userId || !plan) {
          console.log('[stripe-webhook] invoice.payment_succeeded: missing metadata, skipping');
          break;
        }

        // Quantity lives on the first line item
        const quantity: number = inv.lines?.data?.[0]?.quantity ?? 1;

        // Retrieve the subscription ID for our profile record
        const subscriptionId: string =
          inv.parent?.subscription_details?.subscription ??
          inv.subscription ??
          '';

        await updateProfile(supabase, userId, {
          tier:                   plan,
          ...(subscriptionId ? { stripe_subscription_id: subscriptionId } : {}),
          subscription_status:    'active',
        });
        console.log(`[stripe-webhook] invoice.paid → user ${userId}, plan=${plan}, qty=${quantity}`);

        if (plan === 'team') {
          const teamId = subMeta.team_id;
          await syncTeamSeats(supabase, userId, quantity, teamId);
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
 * Write the Stripe seat quantity into teams.seats_purchased.
 * When teamId is supplied (from subscription metadata) the update is scoped
 * to that specific team — prevents a single subscription from updating all
 * teams a user owns. Falls back to owner_id scope for legacy subscriptions
 * that pre-date the team_id metadata field.
 */
async function syncTeamSeats(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  quantity: number,
  teamId?: string
): Promise<void> {
  const seats = Math.max(1, quantity);

  let query = supabase.from('teams').update({ seats_purchased: seats });

  if (teamId) {
    query = query.eq('id', teamId).eq('owner_id', userId);
  } else {
    query = query.eq('owner_id', userId);
  }

  const { error } = await query;
  if (error) {
    console.error(`[stripe-webhook] Failed to sync team seats for ${userId}:`, error.message);
  } else {
    console.log(`[stripe-webhook] Team seats → ${seats} for owner ${userId}${teamId ? ` (team ${teamId})` : ''}`);
  }
}
