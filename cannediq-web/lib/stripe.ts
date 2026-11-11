/**
 * lib/stripe.ts — Stripe singleton for server-side API routes.
 */
import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-06-24.dahlia',
});

export const PRICE_IDS: Record<string, string> = {
  pro:  process.env.STRIPE_PRICE_PRO_MONTHLY  ?? '',
  ai:   process.env.STRIPE_PRICE_AI_MONTHLY   ?? '',
  team: process.env.STRIPE_PRICE_TEAM_MONTHLY ?? '',
};

export const APP_URL    = process.env.NEXT_PUBLIC_APP_URL ?? 'https://cannediq.com';
export const EXT_ID     = process.env.CHROME_EXTENSION_ID ?? '';
