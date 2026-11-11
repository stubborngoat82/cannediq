/**
 * GET  /api/store          — list template packs (auth optional)
 * POST /api/store          — claim a free pack
 * Replaces: Supabase Edge Function template-store
 */
import { NextRequest } from 'next/server';
import { adminClient, userClient, json, cors } from '@/lib/supabase';

function getToken(req: NextRequest) {
  return (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim() || null;
}

export async function OPTIONS() { return cors(); }

export async function GET(req: NextRequest) {
  const token    = getToken(req);
  const supabase = adminClient();

  const { data: packs, error } = await supabase
    .from('template_packs')
    .select('id, name, description, category, icon, price_cents, command_count, is_featured, preview_text')
    .eq('is_active', true)
    .order('is_featured', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) return json({ error: error.message }, 500);

  if (!token) return json({ packs: packs ?? [] });

  // Augment with purchase status for authenticated users
  const client = userClient(token);
  const { data: { user } } = await client.auth.getUser();

  if (!user) return json({ packs: packs ?? [] });

  const { data: purchases } = await supabase
    .from('user_template_purchases')
    .select('pack_id')
    .eq('user_id', user.id);

  const purchasedIds = new Set((purchases ?? []).map((p: { pack_id: string }) => p.pack_id));

  // Also check team purchases
  const { data: memberships } = await supabase
    .from('team_members').select('team_id').eq('user_id', user.id);
  const teamIds = (memberships ?? []).map((m: { team_id: string }) => m.team_id);
  if (teamIds.length > 0) {
    const { data: teamPurchases } = await supabase
      .from('user_template_purchases').select('pack_id').in('team_id', teamIds);
    (teamPurchases ?? []).forEach((p: { pack_id: string }) => purchasedIds.add(p.pack_id));
  }

  return json({
    packs: (packs ?? []).map((p: Record<string, unknown>) => ({
      ...p,
      purchased: purchasedIds.has(p.id as string),
    })),
  });
}

export async function POST(req: NextRequest) {
  try {
    const token = getToken(req);
    if (!token) return json({ error: 'Not authenticated' }, 401);

    const client = userClient(token);
    const { data: { user }, error: authErr } = await client.auth.getUser();
    if (authErr || !user) return json({ error: 'Invalid or expired session' }, 401);

    const body   = await req.json().catch(() => ({}));
    const packId = body.packId as string;
    if (!packId) return json({ error: 'packId is required' }, 400);

    const supabase = adminClient();
    const { data: pack } = await supabase
      .from('template_packs')
      .select('id, name, price_cents, is_active')
      .eq('id', packId)
      .single();

    if (!pack?.is_active)    return json({ error: 'Template pack not found' }, 404);
    if (pack.price_cents > 0) return json({ error: 'This is a paid pack. Use /api/store/checkout.' }, 422);

    // Record claim
    await supabase.from('user_template_purchases').upsert({
      user_id:      user.id,
      pack_id:      packId,
      purchased_at: new Date().toISOString(),
    }, { onConflict: 'user_id,pack_id', ignoreDuplicates: true });

    // Fetch commands
    const { data: commands } = await supabase
      .from('template_commands')
      .select('command_data, sort_order')
      .eq('pack_id', packId)
      .order('sort_order', { ascending: true });

    return json({
      ok:       true,
      packId,
      packName: pack.name,
      commands: (commands ?? []).map((c: { command_data: unknown }) => c.command_data),
    });
  } catch (err: unknown) {
    const e = err as { message?: string };
    return json({ error: e.message ?? 'Internal error' }, 500);
  }
}
