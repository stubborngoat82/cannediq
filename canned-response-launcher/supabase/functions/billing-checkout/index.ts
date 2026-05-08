/**
 * billing-checkout — Supabase Edge Function
 *
 * POST /functions/v1/billing-checkout
 * Headers: Authorization: Bearer <supabase_jwt>
 * Body:    { plan: "pro" | "ai" | "team", quantity?: number }
 *
 * Returns: { url: string }  — Stripe Checkout Session URL
 *
 * Env secrets:
 *   STRIPE_SECRET_KEY
 *   STRIPE_PRICE_PRO_MONTHLY
 *   STRIPE_PRICE_AI_MONTHLY
 *   STRIPE_PRICE_TEAM_MONTHLY
 *   APP_URL                    (e.g. https://cannediq.com)
 *   CHROME_EXTENSION_ID        (e.g. abcdefghijklmnopqrstuvwxyz123456)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'npm:stripe@14';

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STRIPE_KEY       = Deno.env.get('STRIPE_SECRET_KEY')!;
const APP_URL          = Deno.env.get('APP_URL') ?? 'https://cannediq.com';
const EXT_ID           = Deno.env.get('CHROME_EXTENSION_ID') ?? '';

// Price ID map — set these env vars after creating products in Stripe Dashboard
const PRICE_IDS: Record<string, string> = {
  pro:  Deno.env.get('STRIPE_PRICE_PRO_MONTHLY')  ?? 'price_PLACEHOLDER_pro',
  ai:   Deno.env.get('STRIPE_PRICE_AI_MONTHLY')   ?? 'price_PLACEHOLDER_ai',
  team: Deno.env.get('STRIPE_PRICE_TEAM_MONTHLY') ?? 'price_PLACEHOLDER_team',
};

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
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // ── Auth ─────────────────────────────────────────────────────────────────────
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ error: 'Missing Authorization header' }, 401);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: { user }, error: authErr } = await authClient.auth.getUser();
  if (authErr || !user) return json({ error: 'Invalid or expired session' }, 401);

  // ── Parse body ────────────────────────────────────────────────────────────────
  let body: { plan?: string; quantity?: number };
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const plan     = body.plan ?? '';
  const quantity = (plan === 'team') ? Math.max(1, body.quantity ?? 1) : 1;

  if (!PRICE_IDS[plan]) return json({ error: `Unknown plan: ${plan}` }, 400);
  const priceId = PRICE_IDS[plan];

  // ── Get or create Stripe customer ─────────────────────────────────────────────
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id, plan')
    .eq('id', user.id)
    .single();

  let customerId: string = profile?.stripe_customer_id ?? '';

  if (!customerId) {
    const customer = await stripe.customers.create({
      email:    user.email,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;

    // Persist the new customer ID
    await supabase
      .from('profiles')
      .update({ stripe_customer_id: customerId })
      .eq('id', user.id);
  }

  // ── Determine success/cancel URLs ─────────────────────────────────────────────
  // Stripe requires HTTPS URLs — chrome-extension:// is not allowed.
  // Redirect to the web app; the webhook updates the plan in the background.
  // Include the extension ID so the success page can link directly back into it.
  const extParam   = EXT_ID ? `&ext=${EXT_ID}` : '';
  const successUrl = `${APP_URL}/billing/success?plan=${plan}${extParam}`;
  const cancelUrl  = `${APP_URL}/pricing`;

  // ── Create Checkout Session ───────────────────────────────────────────────────
  const session = await stripe.checkout.sessions.create({
    mode:     'subscription',
    customer: customerId,

    line_items: [{
      price:    priceId,
      quantity: plan === 'team' ? quantity : 1,
    }],

    subscription_data: {
      metadata: {
        supabase_user_id: user.id,
        plan,
      },
    },

    allow_promotion_codes: true,
    billing_address_collection: 'auto',
    customer_update: { address: 'auto' },

    success_url: successUrl + (successUrl.includes('?') ? '&session_id={CHECKOUT_SESSION_ID}' : '?session_id={CHECKOUT_SESSION_ID}'),
    cancel_url:  cancelUrl,

    metadata: {
      supabase_user_id: user.id,
      plan,
    },
  });

  return json({ url: session.url });
});
