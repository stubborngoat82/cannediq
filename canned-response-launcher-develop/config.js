/**
 * cannedIQ — Environment Config
 *
 * This file is the ONE place that differs between branches:
 *   • develop branch → ENV = 'development'  (cannedIQ_dev Supabase)
 *   • main branch    → ENV = 'production'   (cannedIQ     Supabase)
 *
 * ⚠️  MERGE RULE: when merging develop → main, keep ENV set to 'production'.
 *     Everything else in this file is identical across branches, so only the
 *     single ENV line below should ever differ.
 */

// ── Environment switch ─────────────────────────────────────────────────────────
const ENV = 'development';   // 'development' | 'production'

const ENVIRONMENTS = {
  production: {
    SUPABASE_URL:      'https://kihuepwhrftjgmglnxnc.supabase.co',
    SUPABASE_ANON:     'sb_publishable_j7PL9l3pZCmnPEsLUI10eQ_xYQQyJbW',
    // Stripe Customer Portal — shareable link from Stripe Dashboard → Billing → Customer portal
    STRIPE_PORTAL_URL: 'https://billing.stripe.com/p/login/9B6bJ11gD8CO7IE3XMgUM00',
  },
  development: {
    SUPABASE_URL:      'https://kjwuykwnjchmpcdwbybn.supabase.co',
    SUPABASE_ANON:     'sb_publishable_zzQ34lMEuG_z04O3KWo3gA_TQANzlxE',
    // TODO: replace with a Stripe TEST-mode customer portal link for dev billing flows.
    STRIPE_PORTAL_URL: 'https://billing.stripe.com/p/login/9B6bJ11gD8CO7IE3XMgUM00',
  },
};

// ── Resolved values ─────────────────────────────────────────────────────────────
const SUPABASE_URL      = ENVIRONMENTS[ENV].SUPABASE_URL;
const SUPABASE_ANON     = ENVIRONMENTS[ENV].SUPABASE_ANON;
const STRIPE_PORTAL_URL = ENVIRONMENTS[ENV].STRIPE_PORTAL_URL;

// Derived endpoints — don't edit these
const AUTH_URL = `${SUPABASE_URL}/auth/v1`;
const REST_URL = `${SUPABASE_URL}/rest/v1`;

// Verbose logging: on in development, off in production. Never ship production as true.
const DEBUG = ENV === 'development';
