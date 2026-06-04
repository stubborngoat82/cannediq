/**
 * template-delivery — Supabase Edge Function
 *
 * POST /functions/v1/template-delivery
 * Headers: Authorization: Bearer <supabase_jwt>
 * Body:    { packId: string }
 *
 * Returns the full command list for a purchased template pack so the
 * extension can apply (or re-apply) the commands to local storage.
 * Verifies that the user has purchased the pack before returning commands.
 *
 * Deploy: supabase functions deploy template-delivery
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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
  if (!token) return json({ error: 'Not authenticated' }, 401);

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth:   { persistSession: false },
  });
  const { data: { user }, error: authErr } = await authClient.auth.getUser();
  if (authErr || !user) return json({ error: 'Invalid or expired session' }, 401);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // ── Parse body ────────────────────────────────────────────────────────────────
  let body: { packId?: string };
  try   { body = await req.json(); }
  catch { return json({ error: 'Invalid JSON body' }, 400); }

  const { packId } = body;
  if (!packId) return json({ error: 'packId is required' }, 400);

  // ── Verify pack exists ────────────────────────────────────────────────────────
  const { data: pack, error: packErr } = await supabase
    .from('template_packs')
    .select('id, name, price_cents, is_active')
    .eq('id', packId)
    .single();

  if (packErr || !pack) return json({ error: 'Template pack not found' }, 404);
  if (!pack.is_active)  return json({ error: 'This pack is no longer available' }, 410);

  // ── Verify access (free pack, own purchase, or team purchase) ────────────────
  if (pack.price_cents > 0) {
    // Check own purchase
    const { data: ownPurchase } = await supabase
      .from('user_template_purchases')
      .select('id')
      .eq('user_id', user.id)
      .eq('pack_id', packId)
      .single();

    let hasAccess = !!ownPurchase;

    // Check team purchase — any team the user belongs to
    if (!hasAccess) {
      const { data: memberships } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('user_id', user.id);
      const teamIds = (memberships ?? []).map((m: any) => m.team_id);

      if (teamIds.length > 0) {
        const { data: teamPurchase } = await supabase
          .from('user_template_purchases')
          .select('id')
          .eq('pack_id', packId)
          .in('team_id', teamIds)
          .limit(1)
          .single();
        hasAccess = !!teamPurchase;
      }
    }

    if (!hasAccess) return json({ error: 'You have not purchased this template pack.' }, 403);
  }

  // ── Fetch commands ────────────────────────────────────────────────────────────
  const { data: commands, error: cmdErr } = await supabase
    .from('template_commands')
    .select('command_data, sort_order')
    .eq('pack_id', packId)
    .order('sort_order', { ascending: true });

  if (cmdErr) return json({ error: cmdErr.message }, 500);

  // ── Mark as applied ───────────────────────────────────────────────────────────
  await supabase
    .from('user_template_purchases')
    .upsert(
      { user_id: user.id, pack_id: packId, applied_at: new Date().toISOString() },
      { onConflict: 'user_id,pack_id', ignoreDuplicates: false }
    );

  return json({
    ok:       true,
    packId,
    packName: pack.name,
    commands: (commands ?? []).map((c: any) => c.command_data),
  });
});
