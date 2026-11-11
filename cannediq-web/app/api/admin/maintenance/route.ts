/**
 * GET  /api/admin/maintenance  — public, returns banner + maintenance mode
 * POST /api/admin/maintenance  — admin only, updates the config
 * Replaces: Supabase Edge Function admin-maintenance
 */
import { NextRequest } from 'next/server';
import { requireAdmin, adminClient, json, cors } from '@/lib/supabase';

export async function OPTIONS() { return cors(); }

export async function GET() {
  const supabase = adminClient();
  const { data, error } = await supabase
    .from('maintenance_config')
    .select('banner_message, maintenance_mode, updated_at')
    .eq('id', 1).single();

  if (error) return json({ banner_message: null, maintenance_mode: false });
  return json({
    banner_message:   data.banner_message   ?? null,
    maintenance_mode: data.maintenance_mode ?? false,
    updated_at:       data.updated_at,
  });
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAdmin(req);
    const body = await req.json().catch(() => ({}));

    const supabase = adminClient();
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    };

    if ('banner_message' in body) {
      const msg = body.banner_message;
      if (msg !== null && typeof msg !== 'string')
        return json({ error: 'banner_message must be a string or null' }, 400);
      updates.banner_message = (msg as string | null)?.trim() || null;
    }

    if ('maintenance_mode' in body) {
      if (typeof body.maintenance_mode !== 'boolean')
        return json({ error: 'maintenance_mode must be boolean' }, 400);
      updates.maintenance_mode = body.maintenance_mode;
    }

    const { error } = await supabase.from('maintenance_config').update(updates).eq('id', 1);
    if (error) return json({ error: error.message }, 500);

    const { data: current } = await supabase
      .from('maintenance_config').select('banner_message, maintenance_mode, updated_at').eq('id', 1).single();

    return json({ ok: true, config: current });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    return json({ error: e.message ?? 'Internal error' }, e.status ?? 500);
  }
}
