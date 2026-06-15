/**
 * template-store — Supabase Edge Function
 *
 * GET  /functions/v1/template-store
 *   Returns all active template packs with purchase status for the caller.
 *   Auth optional — unauthenticated callers see packs without purchase status.
 *
 * POST /functions/v1/template-store
 *   Body: { packId: string }
 *   Claims a FREE template pack for the authenticated user and returns
 *   the full command list so the extension can apply it immediately.
 *   Returns 422 if the pack is paid (use template-checkout instead).
 *
 * Deploy: supabase functions deploy template-store --no-verify-jwt
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

async function getUser(token: string | null) {
  if (!token) return null;
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth:   { persistSession: false },
  });
  const { data: { user } } = await authClient.auth.getUser();
  return user ?? null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const token   = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim() || null;
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // ── GET — list packs ──────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { data: packs, error } = await supabase
      .from('template_packs')
      .select('id, name, description, category, icon, price_cents, command_count, is_featured, preview_text')
      .eq('is_active', true)
      .order('is_featured', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) return json({ error: error.message }, 500);

    // If authenticated, attach purchase status (own + team purchases)
    let purchasedIds = new Set<string>();
    const user = await getUser(token);
    if (user) {
      // Individual purchases
      const { data: own } = await supabase
        .from('user_template_purchases')
        .select('pack_id')
        .eq('user_id', user.id);
      (own ?? []).forEach((p: any) => purchasedIds.add(p.pack_id));

      // Team purchases — packs bought by any team the user belongs to
      const { data: memberships } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('user_id', user.id);
      const teamIds = (memberships ?? []).map((m: any) => m.team_id);

      if (teamIds.length > 0) {
        const { data: teamPurchases } = await supabase
          .from('user_template_purchases')
          .select('pack_id')
          .in('team_id', teamIds);
        (teamPurchases ?? []).forEach((p: any) => purchasedIds.add(p.pack_id));
      }
    }

    const result = (packs ?? []).map((p: any) => ({
      ...p,
      purchased: purchasedIds.has(p.id),
    }));

    return json({ packs: result });
  }

  // ── POST — claim free pack ────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const user = await getUser(token);
    if (!user) return json({ error: 'Sign in to claim templates' }, 401);

    let body: { packId?: string; teamId?: string };
    try   { body = await req.json(); }
    catch { return json({ error: 'Invalid JSON body' }, 400); }

    const { packId, teamId } = body;
    if (!packId) return json({ error: 'packId is required' }, 400);

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

    // Verify pack exists and is free
    const { data: pack, error: packErr } = await supabase
      .from('template_packs')
      .select('id, name, price_cents, is_active')
      .eq('id', packId)
      .single();

    if (packErr || !pack) return json({ error: 'Template pack not found' }, 404);
    if (!pack.is_active)  return json({ error: 'This pack is no longer available' }, 410);
    if (pack.price_cents > 0) {
      return json({ error: 'This is a paid pack. Use template-checkout to purchase.' }, 422);
    }

    // Upsert purchase record (idempotent)
    const purchaseRecord: any = {
      user_id:      user.id,
      pack_id:      packId,
      purchased_at: new Date().toISOString(),
      applied_at:   new Date().toISOString(),
    };
    if (teamId) purchaseRecord.team_id = teamId;

    const { error: purchaseErr } = await supabase
      .from('user_template_purchases')
      .upsert(purchaseRecord, { onConflict: 'user_id,pack_id', ignoreDuplicates: false });

    if (purchaseErr) return json({ error: purchaseErr.message }, 500);

    // Return the commands so the extension can apply them immediately
    const { data: commands, error: cmdErr } = await supabase
      .from('template_commands')
      .select('command_data, sort_order')
      .eq('pack_id', packId)
      .order('sort_order', { ascending: true });

    if (cmdErr) return json({ error: cmdErr.message }, 500);

    return json({
      ok:       true,
      packId,
      packName: pack.name,
      commands: (commands ?? []).map((c: any) => c.command_data),
    });
  }

  return json({ error: 'Method not allowed' }, 405);
});
