/**
 * POST /api/team/provision
 * Replaces: Supabase Edge Function provision-team-member
 *
 * Creates a CannedIQ account for a team member and enrolls them.
 */
import { NextRequest } from 'next/server';
import { requireAuth, adminClient, json, cors } from '@/lib/supabase';

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? '';
const RESEND_FROM    = process.env.RESEND_FROM_EMAIL ?? 'noreply@cannediq.com';

export async function OPTIONS() { return cors(); }

export async function POST(req: NextRequest) {
  try {
    const { user: caller } = await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const { team_id, email, full_name } = body as { team_id?: string; email?: string; full_name?: string };

    if (!team_id || !email) return json({ error: 'team_id and email are required' }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Invalid email address' }, 400);

    const supabase = adminClient();

    // Verify caller is team owner or admin
    const [{ data: ownerData }, { data: adminData }] = await Promise.all([
      supabase.from('teams').select('id, name, seats_purchased')
        .eq('id', team_id).eq('owner_id', caller.id).maybeSingle(),
      supabase.from('team_members').select('team_id')
        .eq('team_id', team_id).eq('user_id', caller.id).in('role', ['admin', 'owner']).maybeSingle(),
    ]);

    if (!ownerData && !adminData) return json({ error: 'Team not found or insufficient permissions' }, 403);

    const team = ownerData ?? (await supabase.from('teams').select('id, name, seats_purchased').eq('id', team_id).single()).data;
    if (!team) return json({ error: 'Team not found' }, 404);

    // Seat check
    const { count: memberCount } = await supabase
      .from('team_members').select('*', { count: 'exact', head: true }).eq('team_id', team_id);
    const seatsUsed      = 1 + (memberCount ?? 0);
    const seatsPurchased = (team as { seats_purchased?: number }).seats_purchased ?? 1;
    if (seatsUsed >= seatsPurchased) {
      return json({ error: `Team is at capacity (${seatsPurchased} seat${seatsPurchased !== 1 ? 's' : ''}). Purchase more seats first.` }, 403);
    }

    // Check existing account
    const { data: existing } = await supabase.auth.admin.listUsers();
    const existingUser = existing?.users?.find((u) => u.email === email);

    let memberId: string;
    let tempPassword: string | null = null;
    let isNew = false;

    if (existingUser) {
      memberId = existingUser.id;
      await supabase.from('profiles').update({ tier: 'team' }).eq('id', memberId);
    } else {
      tempPassword = generateTempPassword();
      isNew        = true;
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email, password: tempPassword, email_confirm: true,
        user_metadata: { full_name: full_name ?? '' },
      });
      if (createErr || !created.user) throw new Error(createErr?.message ?? 'Failed to create user');
      memberId = created.user.id;

      for (let i = 0; i < 2; i++) {
        const { error } = await supabase.from('profiles').update({
          tier: 'team', must_change_password: true,
          provisioned_team_id: team_id, full_name: full_name ?? null,
        }).eq('id', memberId);
        if (!error) break;
        await new Promise((r) => setTimeout(r, 400));
      }
    }

    // Enroll in team
    await supabase.from('team_members').upsert({
      team_id, user_id: memberId, role: 'member',
      provisioned_by: caller.id, provisioned_at: new Date().toISOString(), temp_password: isNew,
    }, { onConflict: 'team_id,user_id', ignoreDuplicates: false });

    // Send credentials email
    if (RESEND_API_KEY) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: RESEND_FROM,
          to:   [email],
          subject: isNew
            ? `Your CannedIQ account is ready — ${(team as { name: string }).name}`
            : `You've been added to "${(team as { name: string }).name}" on CannedIQ`,
          text: isNew
            ? `Email: ${email}\nPassword: ${tempPassword}\n\nThis is a temporary password — you will be asked to set a new one on first sign-in.`
            : `You've been added to "${(team as { name: string }).name}" on CannedIQ. Sign in to see the shared library.`,
        }),
      }).catch((e) => console.error('[team/provision] Resend error:', e));
    }

    return json({ user_id: memberId, email, is_new: isNew });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    return json({ error: e.message ?? 'Internal error' }, e.status ?? 500);
  }
}

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*';
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
