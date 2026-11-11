/**
 * POST /api/billing/checkout
 * Replaces: Supabase Edge Function billing-checkout
 *
 * Creates a Stripe Checkout session for pro / ai / team plans.
 * Returns { url } — the extension opens this in a new tab.
 */
import { NextRequest } from 'next/server';
import { requireAuth, adminClient, json, cors } from '@/lib/supabase';
import { stripe, PRICE_IDS, APP_URL, EXT_ID } from '@/lib/stripe';

export async function OPTIONS() { return cors(); }

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const body = await req.json().catch(() => ({}));

    const plan     = (body.plan ?? '') as string;
    const quantity = plan === 'team' ? Math.max(1, body.quantity ?? 1) : 1;

    if (!PRICE_IDS[plan]) return json({ error: `Unknown plan: ${plan}` }, 400);

    const supabase = adminClient();

    // Get or create Stripe customer
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id, email')
      .eq('id', user.id)
      .single();

    let customerId = profile?.stripe_customer_id as string | undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? profile?.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await supabase.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id);
    }

    // For team plan: grab the user's primary team for webhook scoping
    let teamId: string | null = null;
    if (plan === 'team') {
      const { data: team } = await supabase
        .from('teams')
        .select('id')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .single();
      teamId = team?.id ?? null;
    }

    const successBase = EXT_ID
      ? `chrome-extension://${EXT_ID}/billing-success.html`
      : `${APP_URL}/billing/success`;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: PRICE_IDS[plan], quantity }],
      success_url: `${successBase}?session_id={CHECKOUT_SESSION_ID}&plan=${plan}`,
      cancel_url:  `${APP_URL}/pricing`,
      client_reference_id: user.id,
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
