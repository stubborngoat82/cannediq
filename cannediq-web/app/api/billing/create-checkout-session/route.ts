/**
 * POST /api/billing/create-checkout-session
 * Replaces: Supabase Edge Function create-checkout-session (older checkout).
 *
 * Body: { plan: "pro" | "team", seats?: number }
 * The extension's current checkout button calls /api/billing/checkout instead.
 * This route stays so any leftover caller keeps the same contract.
 */
import { NextRequest } from 'next/server';
import { requireAuth, adminClient, json, cors } from '@/lib/supabase';
import { stripe, APP_URL } from '@/lib/stripe';
import { priceToPlan } from '@/lib/billing';

export async function OPTIONS() { return cors(); }

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const body = await req.json().catch(() => ({})) as { plan?: string; seats?: number; quantity?: number };
    const plan = body.plan ?? '';
    if (plan !== 'pro' && plan !== 'team') {
      return json({ error: 'Invalid plan. Must be "pro" or "team".' }, 400);
    }

    const seats = Math.max(1, Number(body.seats ?? body.quantity ?? 1) || 1);
    const priceMap = priceToPlan();
    const priceId = Object.entries(priceMap).find(([, p]) => p === plan)?.[0] ?? '';
    if (!priceId) {
      return json({ error: `STRIPE_PRICE_${plan === 'team' ? 'TEAM' : 'PRO'}_MONTHLY env var is not set.` }, 500);
    }

    const supabase = adminClient();
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    let customerId = (profile?.stripe_customer_id as string | undefined) ?? '';
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await supabase.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id);
    }

    const billingBase = `${APP_URL}/billing/complete`;
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: plan === 'team' ? seats : 1 }],
      subscription_data: {
        metadata: {
          supabase_user_id: user.id,
          plan,
          seats: String(seats),
        },
      },
      success_url: `${billingBase}?status=success`,
      cancel_url: `${billingBase}?status=cancel`,
      metadata: { supabase_user_id: user.id, plan },
    });

    return json({ url: session.url });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    console.error('[billing/create-checkout-session]', e.message);
    return json({ error: e.message ?? 'Internal error' }, e.status ?? 500);
  }
}
