/**
 * CORS for /api/* so the Chrome extension and the web app can call the server.
 *
 * Allowed origins:
 *   - NEXT_PUBLIC_APP_URL (and the production cannediq.com hosts)
 *   - chrome-extension://CHROME_EXTENSION_ID
 *   - local dev (localhost:3000)
 *   - CORS_EXTRA_ORIGINS (comma-separated), if set
 *
 * Requests with no Origin (Stripe webhooks, server-to-server) are unchanged.
 * The extension also lists these hosts in host_permissions, which lets the
 * service worker call the API even when this allow-list is misconfigured.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const CORS_OPTIONS: Record<string, string> = {
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
};

function allowedOrigins(): string[] {
  const origins = new Set<string>([
    'https://cannediq.com',
    'https://www.cannediq.com',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ]);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    try { origins.add(new URL(appUrl).origin); } catch { /* ignore bad URL */ }
  }

  const extId = process.env.CHROME_EXTENSION_ID?.trim();
  if (extId) origins.add(`chrome-extension://${extId}`);

  const extra = process.env.CORS_EXTRA_ORIGINS ?? '';
  for (const part of extra.split(',')) {
    const origin = part.trim();
    if (origin) origins.add(origin);
  }

  return [...origins];
}

export function proxy(request: NextRequest) {
  const origin = request.headers.get('origin') ?? '';
  const allowed = origin !== '' && allowedOrigins().includes(origin);

  if (request.method === 'OPTIONS') {
    const headers: Record<string, string> = { ...CORS_OPTIONS };
    if (allowed) headers['Access-Control-Allow-Origin'] = origin;
    return new NextResponse(null, { status: 204, headers });
  }

  const response = NextResponse.next();
  if (allowed) response.headers.set('Access-Control-Allow-Origin', origin);
  for (const [key, value] of Object.entries(CORS_OPTIONS)) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: '/api/:path*',
};
