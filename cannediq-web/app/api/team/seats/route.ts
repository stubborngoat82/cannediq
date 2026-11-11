/**
 * POST /api/team/seats
 * Replaces: Supabase Edge Function adjust-seats
 *
 * Adjusts Stripe subscription quantity for a team plan.
 */
import { NextRequest } from 'next/server';
import { requireAuth, adminClient, json, cors } from '@/lib/supabase';
import { stripe } from '@/lib/stripe';
import type Stripe from 'stripe';

export async function OPTIONS() { return cors(); }

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const body     = await req.json().catch(() => ({}));
    const { teamId, quantity } = body as { teamId?: string; quantity?: number };

    if (!teamId)                                   return json({ error: 'teamId is required' }, 400);
    if (typeof quantity !== 'number' || quantity < 1) return json({ error: 'quantity must be a positive integer' }, 400);
    if (!Number.isInteger(quantity))                return json({ error: 'quantity must be an integer' }, 400);
    if (quantity > 500)                             return json({ error: 'Maximum 500 seats per team' }, 400);

    const supabase = adminClient();

    const { data: team } = await supabase.from('teams').select('id, owner_id').eq('id', teamId).single();
    if (!team)               return json({ error: 'Team not found' }, 404);
    if (team.owner_id !== user.id) return json({ error: 'Only the team owner can adjust seats' }, 403);

    const { count: memberCount } = await supabase
      .from('team_members').select('*', { count: 'exact', head: true }).eq('team_id', teamId);
    const seatsUsed = memberCount ?? 0;

    if (quantity < seatsUsed) {
      return json({ error: `Cannot reduce below current headcount (${seatsUsed}). Minimum is ${seatsUsed}.` }, 422);
    }

    const { data: profile } = await supabase
      .from('profiles').select('stripe_subscription_id').eq('id', user.id).single();
    if (!profile?.stripe_subscription_id)
      return json({ error: 'No active subscription found. Visit Billing to upgrade.' }, 422);

    let sub: Stripe.Subscription;
    try {
      sub = await stripe.subscriptions.retrieve(profile.stripe_subscription_id, {
        expand: ['items.data.price'],
      });
    } catch (e: unknown) {
      return json({ error: `Stripe error: ${(e as Error).message}` }, 502);
    }

    if (sub.status === 'canceled') return json({ error: 'Subscription is cancelled. Resubscribe from Billing.' }, 422);

    const subItem = sub.items.data[0];
    if (!subItem) return json({ error: 'Subscription item not found' }, 502);

    await stripe.subscriptionItems.update(subItem.id, {
      quantity,
      proration_behavior: 'always_invoice',
    });

    await supabase.from('teams').update({ seats_purchased: quantity }).eq('id', teamId);

    return json({ ok: true, seats_purchased: quantity, seatsUsed });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    return json({ error: e.message ?? 'Internal error' }, e.status ?? 500);
  }
}
