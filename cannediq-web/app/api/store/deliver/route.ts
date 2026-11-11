/**
 * POST /api/store/deliver
 * Replaces: Supabase Edge Function template-delivery
 *
 * Returns commands for an already-purchased pack so the extension can
 * apply or re-apply them. Includes Stripe fallback verification for
 * the post-checkout race condition.
 */
import { NextRequest } from 'next/server';
import { requireAuth, adminClient, json, cors } from '@/lib/supabase';
import { stripe } from '@/lib/stripe';

export async function OPTIONS() { return cors(); }

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const body     = await req.json().catch(() => ({}));
    const { packId, sessionId } = body as { packId?: string; sessionId?: string };
    if (!packId) return json({ error: 'packId is required' }, 400);

    const supabase = adminClient();

    const { data: pack } = await supabase
      .from('template_packs')
      .select('id, name, price_cents, is_active').eq('id', packId).single();

    if (!pack?.is_active) return json({ error: 'Template pack not found' }, 404);

    // Verify access
    let hasAccess = pack.price_cents === 0;

    if (!hasAccess) {
      const { data: ownPurchase } = await supabase
        .from('user_template_purchases').select('id')
        .eq('user_id', user.id).eq('pack_id', packId).single();
      hasAccess = !!ownPurchase;
    }

    if (!hasAccess) {
      // Check team purchase
      const { data: memberships } = await supabase
        .from('team_members').select('team_id').eq('user_id', user.id);
      const teamIds = (memberships ?? []).map((m: { team_id: string }) => m.team_id);
      if (teamIds.length > 0) {
        const { data: teamPurchase } = await supabase
          .from('user_template_purchases').select('id')
          .eq('pack_id', packId).in('team_id', teamIds).limit(1).single();
        hasAccess = !!teamPurchase;
      }
    }

    // Stripe fallback for post-checkout race condition
    if (!hasAccess && sessionId) {
      try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (
          session.payment_status === 'paid' &&
          session.metadata?.type === 'template_purchase' &&
          session.metadata?.pack_id === packId &&
          session.metadata?.supabase_user_id === user.id
        ) {
          hasAccess = true;
          const record: Record<string, string | null> = {
            user_id:                  user.id,
            pack_id:                  packId,
            purchased_at:             new Date().toISOString(),
            stripe_payment_intent_id: session.payment_intent as string | null,
          };
          if (session.metadata?.team_id) record.team_id = session.metadata.team_id;
          await supabase.from('user_template_purchases')
            .upsert(record, { onConflict: 'user_id,pack_id', ignoreDuplicates: true });
        }
      } catch { /* fallback failed — hasAccess stays false */ }
    }

    if (!hasAccess) return json({ error: 'You have not purchased this template pack.' }, 403);

    const { data: commands } = await supabase
      .from('template_commands')
      .select('command_data, sort_order').eq('pack_id', packId)
      .order('sort_order', { ascending: true });

    // Mark as applied
    await supabase.from('user_template_purchases').upsert(
      { user_id: user.id, pack_id: packId, applied_at: new Date().toISOString() },
      { onConflict: 'user_id,pack_id', ignoreDuplicates: false }
    );

    return json({
      ok:       true,
      packId,
      packName: pack.name,
      commands: (commands ?? []).map((c: { command_data: unknown }) => c.command_data),
    });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    return json({ error: e.message ?? 'Internal error' }, e.status ?? 500);
  }
}
