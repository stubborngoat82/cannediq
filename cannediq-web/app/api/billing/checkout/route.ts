/**
 * POST /api/billing/checkout
 * Replaces: Supabase Edge Function billing-checkout
 *
 * Body: { plan: "pro" | "ai" | "team", quantity?: number }
 * Returns: { url } — Stripe Checkout URL. The extension opens it in a new tab.
 *
 * Success/cancel URLs are HTTPS on this app. Stripe rejects chrome-extension://.
 */
import { NextRequest } from 'next/server';
import { requireAuth, adminClient, json, cors } from '@/lib/supabase';
import { stripe, PRICE_IDS, APP_URL, EXT_ID } from '@/lib/stripe';

export async function OPTIONS() { return cors(); }

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const body = await req.json().catch(() => ({}));

    const plan = (body.plan ?? '') as string;
    const quantity = plan === 'team' ? Math.max(1, Number(body.quantity ?? body.seats ?? 1) || 1) : 1;

    if (!PRICE_IDS[plan]) return json({ error: `Unknown plan: ${plan}` }, 400);
    const priceId = PRICE_IDS[plan];
    if (!priceId) return json({ error: `Price ID for plan "${plan}" is not configured` }, 500);

    const supabase = adminClient();

    let teamId: string | null = null;
    if (plan === 'team') {
      const { data: teams } = await supabase
        .from('teams')
        .select('id')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1);
      teamId = teams?.[0]?.id ?? null;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id, email')
      .eq('id', user.id)
      .single();

    let customerId = (profile?.stripe_customer_id as string | undefined) ?? '';
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? (profile?.email as string | undefined),
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await supabase.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id);
    }

    const extParam = EXT_ID ? `&ext=${EXT_ID}` : '';
    const successUrl = `${APP_URL}/billing/success?plan=${encodeURIComponent(plan)}${extParam}&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${APP_URL}/pricing`;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: plan === 'team' ? quantity : 1 }],
      subscription_data: {
        metadata: {
          supabase_user_id: user.id,
          plan,
          ...(teamId ? { team_id: teamId } : {}),
        },
      },
      billing_address_collection: 'required',
      phone_number_collection: { enabled: true },
      customer_update: { address: 'auto', name: 'auto' },
      allow_promotion_codes: true,
      custom_fields: [
        {
          key: 'company',
          label: { type: 'custom', custom: 'Company name (optional)' },
          type: 'text',
          optional: true,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        supabase_user_id: user.id,
        plan,
        ...(teamId ? { team_id: teamId } : {}),
      },
    });

    return json({ url: session.url });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    return json({ error: e.message ?? 'Internal error' }, e.status ?? 500);
  }
}
