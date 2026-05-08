/**
 * Canned Response Launcher — Supabase Config
 *
 * 1. Go to app.supabase.com → your project → Settings → API
 * 2. Copy "Project URL" and "anon public" key and paste them below.
 * 3. That's it — never commit the service_role key here.
 */

const SUPABASE_URL  = 'https://kihuepwhrftjgmglnxnc.supabase.co';
const SUPABASE_ANON = 'sb_publishable_j7PL9l3pZCmnPEsLUI10eQ_xYQQyJbW';

// Stripe Customer Portal — shareable link from Stripe Dashboard → Settings → Billing → Customer portal
const STRIPE_PORTAL_URL = 'https://billing.stripe.com/p/login/test_fZufZh3xh1jh09ifVsgbm00';

// Derived endpoints — don't edit these
const AUTH_URL = `${SUPABASE_URL}/auth/v1`;
const REST_URL = `${SUPABASE_URL}/rest/v1`;
