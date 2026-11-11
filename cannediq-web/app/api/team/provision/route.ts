/**
 * POST /api/team/provision
 * Replaces: Supabase Edge Function provision-team-member
 *
 * Body: { team_id, email, full_name? }
 * Creates an auth user (or reuses one) and enrolls them. Emails credentials.
 */
import { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireAuth, adminClient, json, cors } from '@/lib/supabase';
import { generateTempPassword } from '@/lib/passwords';
import { existingAccountEmail, newAccountEmail } from '@/lib/member-emails';

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? '';
const RESEND_FROM = process.env.RESEND_FROM_EMAIL ?? 'noreply@cannediq.com';

export async function OPTIONS() { return cors(); }

async function findUserByEmail(supabase: SupabaseClient, email: string): Promise<string | null> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const found = data.users.find((u) => u.email === email);
    if (found) return found.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const { user: caller } = await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const { team_id, email, full_name } = body as { team_id?: string; email?: string; full_name?: string };

    if (!team_id || !email) return json({ error: 'team_id and email are required' }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Invalid email address' }, 400);

    const supabase = adminClient();

    const [{ data: ownerData }, { data: adminData }] = await Promise.all([
      supabase.from('teams').select('id, name, seats_purchased')
        .eq('id', team_id).eq('owner_id', caller.id).maybeSingle(),
      supabase.from('team_members').select('team_id')
        .eq('team_id', team_id).eq('user_id', caller.id).in('role', ['admin', 'owner']).maybeSingle(),
    ]);

    if (!ownerData && !adminData) return json({ error: 'Team not found or insufficient permissions' }, 403);

    const team = ownerData ?? (await supabase.from('teams').select('id, name, seats_purchased').eq('id', team_id).single()).data;
    if (!team) return json({ error: 'Team not found' }, 404);

    const { count: memberCount } = await supabase
      .from('team_members').select('*', { count: 'exact', head: true }).eq('team_id', team_id);
    const seatsUsed = 1 + (memberCount ?? 0);
    const seatsPurchased = (team as { seats_purchased?: number }).seats_purchased ?? 1;
    if (seatsUsed >= seatsPurchased) {
      return json({
        error: `Team is at capacity (${seatsPurchased} seat${seatsPurchased !== 1 ? 's' : ''}). Purchase additional seats from the Billing tab before adding more members.`,
      }, 403);
    }

    const existingId = await findUserByEmail(supabase, email);
    let memberId: string;
    let tempPassword: string | null = null;
    let isNew = false;

    if (existingId) {
      memberId = existingId;
      await supabase.from('profiles').update({ tier: 'team' }).eq('id', memberId);
    } else {
      tempPassword = generateTempPassword();
      isNew = true;
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: full_name ?? '' },
      });
      if (createErr || !created.user) throw new Error(createErr?.message ?? 'Failed to create user account');
      memberId = created.user.id;

      for (let attempt = 0; attempt < 2; attempt++) {
        const { error } = await supabase.from('profiles').update({
          tier: 'team',
          must_change_password: true,
          provisioned_team_id: team_id,
          full_name: full_name ?? null,
        }).eq('id', memberId);
        if (!error) break;
        await new Promise((r) => setTimeout(r, 400));
      }
    }

    const { error: memberErr } = await supabase.from('team_members').upsert({
      team_id,
      user_id: memberId,
      role: 'member',
      provisioned_by: caller.id,
      provisioned_at: new Date().toISOString(),
      temp_password: isNew,
    }, { onConflict: 'team_id,user_id', ignoreDuplicates: false });
    if (memberErr) throw new Error(`Failed to add member to team: ${memberErr.message}`);

    const teamName = (team as { name: string }).name;
    const inviter = caller.email ?? 'Your manager';
    if (RESEND_API_KEY) {
      const mail = isNew && tempPassword
        ? newAccountEmail(teamName, email, tempPassword, inviter)
        : existingAccountEmail(teamName, inviter);
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: RESEND_FROM,
          to: [email],
          subject: isNew
            ? `Your CannedIQ account is ready — ${teamName}`
            : `You've been added to the "${teamName}" team on CannedIQ`,
          html: mail.html,
          text: mail.text,
        }),
      });
      if (!emailRes.ok) console.error('[team/provision] Resend error:', await emailRes.text());
    } else {
      console.log(
        `[team/provision] No RESEND_API_KEY. Credentials for ${email}:`,
        tempPassword ?? '(existing account)',
      );
    }

    return json({ user_id: memberId, email, is_new: isNew });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    console.error('[team/provision]', e.message);
    return json({ error: e.message ?? 'Internal error' }, e.status ?? 500);
  }
}
