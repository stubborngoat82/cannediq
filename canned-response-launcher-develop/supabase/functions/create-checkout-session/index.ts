/**
 * Supabase Edge Function: create-checkout-session
 *
 * Creates a Stripe Checkout session for Pro or Team plan upgrades.
 *
 * Environment variables required (set in Supabase Dashboard → Edge Functions → Secrets):
 *   STRIPE_SECRET_KEY          — your Stripe secret key (sk_live_... or sk_test_...)
 *   STRIPE_PRO_PRICE_ID        — Stripe Price ID for the Pro plan  (price_...)
 *   STRIPE_TEAM_PRICE_ID       — Stripe Price ID for the Team plan (price_...)
 *   SUPABASE_URL               — auto-injected by Supabase
 *   SUPABASE_SERVICE_ROLE_KEY  — auto-injected by Supabase
 *
 * Deploy:
 *   supabase functions deploy create-checkout-session --no-verify-jwt
 *
 * Request body:
 *   { plan: 'pro' | 'team', seats?: number }
 *
 * Response:
 *   { url: string }  — Stripe Checkout URL to redirect the user to
 */

import Stripe from 'npm:stripe@14';
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    // ── Auth: verify caller has a valid Supabase JWT ──────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonError('Missing or invalid Authorization header', 401);
    }
    const token = authHeader.slice(7);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabase = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return jsonError('Unauthorized', 401);
    }

    // ── Parse request body ────────────────────────────────────────
    const { plan, seats = 1 } = await req.json() as { plan: 'pro' | 'team'; seats?: number };
    if (!['pro', 'team'].includes(plan)) {
      return jsonError('Invalid plan. Must be "pro" or "team".', 400);
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2024-04-10',
    });

    // ── Get or create Stripe customer for this user ───────────────
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    let customerId: string = profile?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;

      await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id);
    }

    // ── Determine price ID ────────────────────────────────────────
    const priceId =
      plan === 'team'
        ? Deno.env.get('STRIPE_TEAM_PRICE_ID')!
        : Deno.env.get('STRIPE_PRO_PRICE_ID')!;

    if (!priceId) {
      return jsonError(`STRIPE_${plan.toUpperCase()}_PRICE_ID env var is not set.`, 500);
    }

    // ── Create Checkout session ───────────────────────────────────
    // success_url / cancel_url point to the extension's options page.
    // Chrome extension pages use the chrome-extension:// scheme which
    // Stripe won't redirect to, so we use a hosted success page instead.
    // The webhook will update the user's tier regardless of the redirect.
    // Stripe redirects to the billing-complete Edge Function which serves
    // a simple hosted success/cancel page. No external website needed.
    const billingBase = `${supabaseUrl}/functions/v1/billing-complete`;

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      // client_reference_id is the most reliable way to get the user ID back
      // in checkout.session.completed — it's on the session object directly.
      client_reference_id: user.id,
      line_items: [
        {
          price: priceId,
          quantity: plan === 'team' ? Math.max(1, seats) : 1,
        },
      ],
      subscription_data: {
        metadata: {
          supabase_user_id: user.id,
          plan,
          seats: String(seats),
        },
      },
      success_url: `${billingBase}?status=success`,
      cancel_url:  `${billingBase}?status=cancel`,
    });

    return jsonOk({ url: session.url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[create-checkout-session]', message);
    return jsonError(message, 500);
  }
});

function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}
