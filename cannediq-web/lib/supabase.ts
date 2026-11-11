/**
 * lib/supabase.ts
 *
 * Server-side Supabase helpers for API routes.
 * Never import this in client components — it uses the service role key.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';

const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/** Service-role client — bypasses RLS. Use only in server-side API routes. */
export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

/** Anon client scoped to the caller's JWT — respects RLS. */
export function userClient(token: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
}

/**
 * Extract and validate the Bearer token from the request.
 * Returns { user, token } on success, throws on failure.
 */
export async function requireAuth(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new AuthError('Missing Authorization header');

  const client = userClient(token);
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) throw new AuthError('Invalid or expired session');

  return { user, token };
}

/**
 * Like requireAuth, but also checks that the user has is_admin = true.
 */
export async function requireAdmin(req: NextRequest) {
  const { user, token } = await requireAuth(req);
  const supabase = adminClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  if (!profile?.is_admin) throw new ForbiddenError('Admin access required');
  return { user, token };
}

export class AuthError extends Error {
  status = 401;
  constructor(msg: string) { super(msg); this.name = 'AuthError'; }
}

export class ForbiddenError extends Error {
  status = 403;
  constructor(msg: string) { super(msg); this.name = 'ForbiddenError'; }
}

/** Standard JSON response helper. */
export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Handle CORS preflight (Next.js headers() handles the actual CORS headers). */
export function cors() {
  return new Response(null, { status: 204 });
}
