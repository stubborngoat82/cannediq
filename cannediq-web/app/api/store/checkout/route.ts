/**
 * POST /api/store/checkout
 * Replaces: Supabase Edge Function template-checkout
 *
 * Creates a Stripe Checkout session for a paid template pack.
 */
import { NextRequest } from 'next/server';
import { requireAuth, adminClient, json, cors } from '@/lib/supabase';
import { stripe, APP_URL } from '@/lib/stripe';

export async function OPTIONS() { return cors(); }

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const body     = await req.json().catch(() => ({}));
    const { packId, teamId } = body as { packId?: string; teamId?: string };
    if (!packId) return json({ error: 'packId is required' }, 400);

    const supabase = adminClient();

    // Validate team ownership if purchasing for a team
    if (teamId) {
      const { data: team } = await supabase
        .from('teams').select('owner_id').eq('id', teamId).single();
      if (!team || team.owner_id !== user.id)
        return json({ error: 'Only the team owner can purchase packs for a team' }, 403);
    }

    const { data: pack } = await supabase
      .from('template_packs')
      .select('id, name, price_cents, stripe_price_id, is_active')
      .eq('id', packId).single();

    if (!pack)                  return json({ error: 'Template pack not found' }, 404);
    if (!pack.is_active)        return json({ error: 'This pack is no longer available' }, 410);
    if (pack.price_cents === 0) return json({ error: 'This is a free pack. Use template-store to claim.' }, 422);

    // Check already purchased
    const { data: existing } = await supabase
      .from('user_template_purchases').select('id')
      .eq('user_id', user.id).eq('pack_id', packId).single();
    if (existing) return json({ error: 'You already own this template pack.' }, 409);

    // Get or create Stripe customer
    const { data: profile } = await supabase
      .from('profiles').select('stripe_customer_id, email').eq('id', user.id).single();
    let customerId = profile?.stripe_customer_id as string | undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? profile?.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await supabase.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id);
    }

    // Create price on the fly if not set
    let priceId = pack.stripe_price_id as string | undefined;
    if (!priceId) {
      const price = await stripe.prices.create({
        unit_amount: pack.price_cents,
        currency: 'usd',
        product_data: { name: pack.name },
      });
      priceId = price.id;
      await supabase.from('template_packs').update({ stripe_price_id: priceId }).eq('id', packId);
    }

    // HTTPS only — Stripe rejects chrome-extension:// success URLs.
    // billing/complete links back into the extension with pack + session ids
    // so delivery can verify the payment before the webhook lands.
    const successUrl = `${APP_URL}/billing/complete?status=template_success&pack_id=${encodeURIComponent(packId)}&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl  = `${APP_URL}/billing/complete?status=cancel`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url:  cancelUrl,
      metadata: {
        type:             'template_purchase',
        pack_id:          packId,
        supabase_user_id: user.id,
        ...(teamId ? { team_id: teamId } : {}),
      },
    });

    return json({ url: session.url });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    return json({ error: e.message ?? 'Internal error' }, e.status ?? 500);
  }
}
