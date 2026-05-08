/**
 * billing-portal — Supabase Edge Function
 *
 * POST /functions/v1/billing-portal
 * Headers: Authorization: Bearer <supabase_jwt>
 * Body:    {} (empty — user is identified from JWT)
 *
 * Returns: { url: string }  — Stripe Customer Portal URL
 *
 * Env secrets:
 *   STRIPE_SECRET_KEY
 *   APP_URL
 *   CHROME_EXTENSION_ID
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'npm:stripe@14';

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STRIPE_KEY       = Deno.env.get('STRIPE_SECRET_KEY')!;
const APP_URL          = Deno.env.get('APP_URL') ?? 'https://cannediq.com';
const EXT_ID           = Deno.env.get('CHROME_EXTENSION_ID') ?? '';

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

  const supabase   = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: { user }, error: authErr } = await authClient.auth.getUser();
  if (authErr || !user) return json({ error: 'Invalid or expired session' }, 401);

  // ── Get Stripe customer ID ────────────────────────────────────────────────────
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single();

  const customerId = profile?.stripe_customer_id;
  if (!customerId) {
    return json({
      error: 'No billing account found. Please subscribe to a plan first.',
    }, 404);
  }

  // ── Return URL ────────────────────────────────────────────────────────────────
  const returnUrl = EXT_ID
    ? `chrome-extension://${EXT_ID}/options.html?tab=billing`
    : `${APP_URL}/account/billing`;

  // ── Create portal session ─────────────────────────────────────────────────────
  const session = await stripe.billingPortal.sessions.create({
    customer:   customerId,
    return_url: returnUrl,
  });

  return json({ url: session.url });
});
