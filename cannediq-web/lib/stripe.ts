/**
 * lib/stripe.ts — Stripe client for server-side API routes.
 * Constructed on first use so `next build` does not require a live secret.
 */
import Stripe from 'stripe';

export const PRICE_IDS: Record<string, string> = {
  pro:  process.env.STRIPE_PRICE_PRO_MONTHLY  ?? '',
  ai:   process.env.STRIPE_PRICE_AI_MONTHLY   ?? '',
  team: process.env.STRIPE_PRICE_TEAM_MONTHLY ?? '',
};

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://cannediq.com';
export const EXT_ID  = process.env.CHROME_EXTENSION_ID ?? '';

let client: Stripe | null = null;

function getStripe(): Stripe {
  if (client) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  client = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
  return client;
}

/** Lazy proxy so route modules can import `stripe` without a key at build time. */
export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    const real = getStripe();
    const value = Reflect.get(real, prop, real) as unknown;
    return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(real) : value;
  },
});
