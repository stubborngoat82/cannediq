/**
 * template-checkout — Supabase Edge Function
 *
 * POST /functions/v1/template-checkout
 * Headers: Authorization: Bearer <supabase_jwt>
 * Body:    { packId: string }
 *
 * Creates a Stripe Checkout Session for a paid template pack.
 * On success, redirects to billing-success page which triggers
 * the extension to apply the templates.
 *
 * Deploy: supabase functions deploy template-checkout
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'npm:stripe@14';

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STRIPE_KEY        = Deno.env.get('STRIPE_SECRET_KEY')!;
const APP_URL           = Deno.env.get('APP_URL') ?? 'https://cannediq.com';
const EXT_ID            = Deno.env.get('CHROME_EXTENSION_ID') ?? '';

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

  // ── Auth ──────────────────────────────────────────────────────────────────────
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ error: 'Sign in to purchase templates' }, 401);

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth:   { persistSession: false },
  });
  const { data: { user }, error: authErr } = await authClient.auth.getUser();
  if (authErr || !user) return json({ error: 'Invalid or expired session' }, 401);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // ── Parse body ────────────────────────────────────────────────────────────────
  let body: { packId?: string; teamId?: string };
  try   { body = await req.json(); }
  catch { return json({ error: 'Invalid JSON body' }, 400); }

  const { packId, teamId } = body;

  // If teamId provided, verify caller is the team owner
  if (teamId) {
    const { data: team } = await supabase
      .from('teams')
      .select('owner_id')
      .eq('id', teamId)
      .single();
    if (!team || team.owner_id !== user.id) {
      return json({ error: 'Only the team owner can purchase packs for a team' }, 403);
    }
  }
  if (!packId) return json({ error: 'packId is required' }, 400);

  // ── Fetch pack ────────────────────────────────────────────────────────────────
  const { data: pack, error: packErr } = await supabase
    .from('template_packs')
    .select('id, name, description, price_cents, stripe_price_id, is_active')
    .eq('id', packId)
    .single();

  if (packErr || !pack) return json({ error: 'Template pack not found' }, 404);
  if (!pack.is_active)  return json({ error: 'This pack is no longer available' }, 410);
  if (pack.price_cents === 0) return json({ error: 'This is a free pack. Use template-store to claim.' }, 422);

  // Check if already purchased
  const { data: existing } = await supabase
    .from('user_template_purchases')
    .select('id')
    .eq('user_id', user.id)
    .eq('pack_id', packId)
    .single();

  if (existing) return json({ error: 'You already own this template pack.' }, 409);

  // ── Get or create Stripe customer ────────────────────────────────────────────
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id, email')
    .eq('id', user.id)
    .single();

  let customerId = profile?.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email:    user.email ?? profile?.email,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;
    await supabase.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id);
  }

  // ── Create Stripe price on the fly if no stripe_price_id set ────────────────
  let priceId = pack.stripe_price_id;
  if (!priceId) {
    const price = await stripe.prices.create({
      unit_amount: pack.price_cents,
      currency:    'usd',
      product_data: { name: pack.name },
    });
    priceId = price.id;
    await supabase.from('template_packs').update({ stripe_price_id: priceId }).eq('id', packId);
  }

  // ── Create Checkout Session ───────────────────────────────────────────────────
  const successUrl = EXT_ID
    ? `chrome-extension://${EXT_ID}/options.html?tab=templates&template_purchased=${packId}`
    : `${APP_URL}/billing/success?template_purchased=${packId}`;

  const session = await stripe.checkout.sessions.create({
    mode:               'payment',
    customer:           customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url:        successUrl,
    cancel_url:         EXT_ID
      ? `chrome-extension://${EXT_ID}/options.html?tab=templates`
      : `${APP_URL}`,
    metadata: {
      type:             'template_purchase',
      pack_id:          packId,
      supabase_user_id: user.id,
      ...(teamId ? { team_id: teamId } : {}),
    },
  });

  return json({ url: session.url });
});
