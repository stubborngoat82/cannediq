/**
 * POST /api/stripe/webhook
 * Replaces: Supabase Edge Function stripe-webhook
 *
 * Receives Stripe events and keeps profiles + teams in sync.
 * Must be registered in Stripe Dashboard with raw body (Next.js handles this).
 */
import { NextRequest } from 'next/server';
import { adminClient, json } from '@/lib/supabase';
import { stripe } from '@/lib/stripe';
import type Stripe from 'stripe';

export async function POST(req: NextRequest) {
  const sig  = req.headers.get('stripe-signature') ?? '';
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Signature verification failed';
    console.error('[stripe/webhook] Sig error:', msg);
    return new Response(`Webhook Error: ${msg}`, { status: 400 });
  }

  const supabase = adminClient();

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;

        // ── Template purchase (one-time) ──────────────────────────────────────
        if (session.metadata?.type === 'template_purchase') {
          const packId = session.metadata.pack_id;
          const userId = session.metadata.supabase_user_id;
          const teamId = session.metadata.team_id ?? null;

          const record: Record<string, string | null> = {
            user_id:                  userId,
            pack_id:                  packId,
            purchased_at:             new Date().toISOString(),
            stripe_payment_intent_id: session.payment_intent as string | null,
          };
          if (teamId) record.team_id = teamId;

          await supabase
            .from('user_template_purchases')
            .upsert(record, { onConflict: 'user_id,pack_id', ignoreDuplicates: true });
          break;
        }

        // ── Subscription checkout ──────────────────────────────────────────────
        if (session.mode === 'subscription' && session.subscription) {
          const userId = session.client_reference_id ?? session.metadata?.supabase_user_id;
          if (!userId) break;

          const sub = await stripe.subscriptions.retrieve(session.subscription as string, {
            expand: ['items.data.price'],
          });

          const price    = sub.items.data[0]?.price as Stripe.Price;
          const nickname = (price?.nickname ?? price?.metadata?.plan ?? '').toLowerCase();
          const plan     = ['pro', 'ai', 'team'].find((p) => nickname.includes(p)) ?? 'pro';
          const quantity = sub.items.data[0]?.quantity ?? 1;

          await supabase.from('profiles').update({
            tier:                  plan,
            stripe_customer_id:    session.customer as string,
            stripe_subscription_id: sub.id,
            subscription_status:   sub.status,
            // current_period_end moved to SubscriptionItem in Stripe v22 (dahlia)
            current_period_end:    new Date((sub.items.data[0]?.current_period_end ?? 0) * 1000).toISOString(),
            cancel_at_period_end:  sub.cancel_at_period_end,
          }).eq('id', userId);

          if (plan === 'team' && session.metadata?.team_id) {
            await supabase.from('teams').update({ seats_purchased: quantity })
              .eq('id', session.metadata.team_id);
          }

          // Capture billing contact info
          const billingDetails = session.customer_details;
          if (billingDetails) {
            const contactUpdate: Record<string, string | null> = {};
            if (billingDetails.name)  contactUpdate.billing_name  = billingDetails.name;
            if (billingDetails.email) contactUpdate.billing_email = billingDetails.email;
            const addr = billingDetails.address;
            if (addr?.country) contactUpdate.billing_country = addr.country;
            if (addr?.postal_code) contactUpdate.billing_postal_code = addr.postal_code;
            if (Object.keys(contactUpdate).length) {
              await supabase.from('profiles').update(contactUpdate).eq('id', userId);
            }
          }
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub     = event.data.object as Stripe.Subscription;
        const price   = sub.items.data[0]?.price as Stripe.Price;
        const nickname = (price?.nickname ?? price?.metadata?.plan ?? '').toLowerCase();
        const plan    = ['pro', 'ai', 'team'].find((p) => nickname.includes(p)) ?? 'pro';
        const qty     = sub.items.data[0]?.quantity ?? 1;

        await supabase.from('profiles').update({
          tier:                 plan,
          subscription_status:  sub.status,
          current_period_end:   new Date((sub.items.data[0]?.current_period_end ?? 0) * 1000).toISOString(),
          cancel_at_period_end: sub.cancel_at_period_end,
        }).eq('stripe_subscription_id', sub.id);

        // Update team seats if applicable
        if (plan === 'team') {
          const { data: owner } = await supabase
            .from('profiles').select('id').eq('stripe_subscription_id', sub.id).single();
          if (owner) {
            await supabase.from('teams').update({ seats_purchased: qty }).eq('owner_id', owner.id);
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await supabase.from('profiles').update({
          tier: 'free', subscription_status: 'canceled',
          stripe_subscription_id: null, cancel_at_period_end: false,
        }).eq('stripe_subscription_id', sub.id);
        break;
      }

      case 'invoice.payment_succeeded': {
        const inv = event.data.object as Stripe.Invoice;
        // In Stripe v22 (dahlia), subscription moved to inv.parent.subscription_details.subscription
        const subId = inv.parent?.subscription_details?.subscription as string | undefined;
        if (subId) {
          await supabase.from('profiles').update({ subscription_status: 'active' })
            .eq('stripe_subscription_id', subId);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const inv = event.data.object as Stripe.Invoice;
        const subId = inv.parent?.subscription_details?.subscription as string | undefined;
        if (subId) {
          await supabase.from('profiles').update({ subscription_status: 'past_due' })
            .eq('stripe_subscription_id', subId);
        }
        break;
      }
    }
  } catch (err) {
    console.error('[stripe/webhook] Handler error:', err);
    return new Response('Handler error', { status: 500 });
  }

  return json({ received: true });
}
