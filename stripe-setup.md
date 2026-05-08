# cannedIQ — Stripe Setup Guide

## AHPushIt LLC Stripe Account Setup

Follow these steps in order. Use **Test Mode** first, then repeat in Live Mode before going public.

---

## 1. Stripe Dashboard — Products

Log in to your AHPushIt LLC Stripe account at https://dashboard.stripe.com

### 1.1 Create: CannedIQ Pro

1. **Products → Add product**
2. Name: `CannedIQ Pro`
3. Description: `Unlimited Commands & Stacks, context-aware triggers, advanced variables, favorites, usage history, import/export.`
4. **Add pricing**
   - Model: Recurring
   - Amount: `$10.00`
   - Billing period: Monthly
   - Lookup key: `cannediq_pro_monthly`
5. Save → copy the **Price ID** (e.g., `price_1ABC...`)

### 1.2 Create: CannedIQ Pro+ AI

1. **Products → Add product**
2. Name: `CannedIQ Pro+ AI`
3. Description: `Everything in Pro plus 500 AI Commands per month with tone controls and prompt templates.`
4. **Add pricing**
   - Model: Recurring
   - Amount: `$20.00`
   - Billing period: Monthly
   - Lookup key: `cannediq_ai_monthly`
5. Save → copy the **Price ID**

### 1.3 Create: CannedIQ Team

1. **Products → Add product**
2. Name: `CannedIQ Team`
3. Description: `Everything in Pro plus Shared Stacks, team templates, admin controls, and team analytics. Per-seat pricing.`
4. **Add pricing**
   - Model: Recurring
   - Amount: `$12.00`
   - Billing period: Monthly
   - Usage type: Licensed (per seat)
   - Lookup key: `cannediq_team_monthly`
5. Save → copy the **Price ID**

### 1.4 Create: CannedIQ AI Credits Pack

1. **Products → Add product**
2. Name: `CannedIQ AI Credits Pack`
3. Description: `One-time top-up of 100 AI credits.`
4. **Add pricing**
   - Model: One-time
   - Amount: `$5.00`
   - Lookup key: `cannediq_ai_credits_5`
5. Save → copy the **Price ID**

---

## 2. Statement Descriptor

1. **Settings → Account details**
2. Set **Statement descriptor**: `AHPUSHIT LLC`
3. If available: set **Shortened descriptor**: `CANNEDIQ`
   (Customers will see: `CANNEDIQ*AHPUSHIT` or `AHPUSHIT LLC CANNEDIQ`)
4. Save

---

## 3. Customer Portal Configuration

1. **Settings → Billing → Customer portal**
2. Enable the portal
3. Configure:
   - ✅ Cancel subscriptions
   - ✅ Switch plans (link to your Pro, Pro+AI, and Team prices)
   - ✅ Update payment method
   - ✅ View invoices and billing history
   - ✅ Update billing address
4. Business name: `cannedIQ`
5. Return URL: `https://cannediq.com/account/billing`
   (or your Chrome extension options URL: `chrome-extension://YOUR_EXTENSION_ID/options.html?tab=billing`)
6. Save and copy the **Portal Configuration ID** if needed

---

## 4. Webhook Configuration

1. **Developers → Webhooks → Add endpoint**
2. Endpoint URL: `https://YOUR_SUPABASE_PROJECT.supabase.co/functions/v1/stripe-webhook`
3. Select events to listen to:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. Add endpoint → copy the **Webhook signing secret** (`whsec_...`)

---

## 5. Environment Variables

Set these in your Supabase project: **Settings → Edge Functions → Secrets**

```bash
# Stripe
STRIPE_SECRET_KEY=sk_test_...         # Test mode key (use sk_live_... for production)
STRIPE_WEBHOOK_SECRET=whsec_...       # From step 4

# Price IDs (from steps 1.1–1.4)
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_AI_MONTHLY=price_...
STRIPE_PRICE_TEAM_MONTHLY=price_...
STRIPE_PRICE_AI_CREDITS=price_...

# App
APP_URL=https://cannediq.com          # Your web app URL
CHROME_EXTENSION_ID=abcdef...         # Your Chrome extension ID (32 chars)

# Supabase (already set automatically)
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

Set via CLI:
```bash
supabase secrets set STRIPE_SECRET_KEY=sk_test_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
supabase secrets set STRIPE_PRICE_PRO_MONTHLY=price_...
supabase secrets set STRIPE_PRICE_AI_MONTHLY=price_...
supabase secrets set STRIPE_PRICE_TEAM_MONTHLY=price_...
supabase secrets set STRIPE_PRICE_AI_CREDITS=price_...
supabase secrets set APP_URL=https://cannediq.com
supabase secrets set CHROME_EXTENSION_ID=your_extension_id
```

---

## 6. Deploy Edge Functions

```bash
# From your project root
supabase functions deploy billing-checkout
supabase functions deploy billing-portal
supabase functions deploy stripe-webhook
supabase functions deploy ai-generate     # Already deployed — re-deploy if updated
```

---

## 7. Run Database Migration

In the Supabase SQL editor (or `supabase db push`), run:

```sql
-- 1. AI usage tracking (if not already run)
-- File: supabase/ai-usage.sql

-- 2. Billing fields
-- File: supabase/billing.sql
```

---

## 8. Update Pricing Page Payment Links (Optional)

For a web-only checkout (outside the Chrome extension), create Stripe Payment Links:

1. **Products → [CannedIQ Pro] → Create payment link**
2. Copy the URL (e.g., `https://buy.stripe.com/test_abc123`)
3. Update `pricing.html` — replace `PLACEHOLDER_pro`, `PLACEHOLDER_ai`, `PLACEHOLDER_team` with real URLs

---

## 9. Test Mode Checklist

Run through all of these before going live. Use Stripe test cards:
- **Success**: `4242 4242 4242 4242` (any future date, any CVC)
- **Decline**: `4000 0000 0000 0002`
- **Requires auth**: `4000 0025 0000 3155`

### Free Plan
- [ ] Free user can see pricing page
- [ ] Free user can create up to 25 commands (26th shows upgrade modal)
- [ ] Free user can create up to 3 stacks (4th shows upgrade modal)
- [ ] Free user sees "AI Commands" gate when clicking AI command type
- [ ] Free user sees "Context-aware" gate when selecting context command
- [ ] After 10 command launches, heavy-use nudge appears

### Checkout Flow
- [ ] Click "Upgrade to Pro" → Stripe Checkout opens for Pro plan
- [ ] Click "Unlock AI" → Stripe Checkout opens for Pro+AI plan
- [ ] Click "Start Team Plan" with seats=3 → Stripe Checkout opens for Team, quantity=3
- [ ] Successful payment → webhook fires → user plan updates to "pro" / "ai" / "team"
- [ ] Failed payment → user stays on free
- [ ] Cancel checkout → user returns to options page / pricing

### Portal
- [ ] Paid user can click "Manage billing" → Stripe Customer Portal opens
- [ ] Can update payment method in portal
- [ ] Can view invoices in portal
- [ ] Cancelling in portal → webhook fires → plan reverts to free at period end

### Webhook Handling
- [ ] `checkout.session.completed` → profile.plan updated
- [ ] `customer.subscription.updated` → renewal date refreshed
- [ ] `customer.subscription.deleted` → plan reverted to free
- [ ] `invoice.payment_failed` → subscription_status = past_due
- [ ] `invoice.payment_succeeded` → subscription renewed, AI credits reset for ai plan

### AI Gating
- [ ] Free / Pro user → AI command blocked with upgrade modal
- [ ] Pro+AI user → AI commands work
- [ ] Pro+AI user at 500 credits → quota error shown
- [ ] Team user → AI commands work (100/month quota)

### Billing UI (Options Page)
- [ ] Free user sees plan cards with upgrade CTAs
- [ ] Paid user sees current plan badge, renewal date
- [ ] Pro+AI user sees AI credits remaining bar
- [ ] Past-due user sees payment failed warning banner
- [ ] "Manage billing" opens Stripe portal

### Responsiveness
- [ ] Pricing page is readable on 375px mobile width
- [ ] Plan cards stack to 1 column on mobile
- [ ] Comparison table scrolls horizontally on mobile

---

## 10. Go-Live Checklist

- [ ] Switch `STRIPE_SECRET_KEY` to `sk_live_...`
- [ ] Create a new live-mode webhook endpoint (separate from test)
- [ ] Update `STRIPE_WEBHOOK_SECRET` to live webhook secret
- [ ] Create products and prices in live mode (separate Price IDs from test)
- [ ] Update all `STRIPE_PRICE_*` secrets to live Price IDs
- [ ] Verify statement descriptor shows correctly on a real charge
- [ ] Test one real purchase end-to-end before announcing

---

## Files Changed Summary

| File | Change |
|------|--------|
| `supabase/billing.sql` | New migration: Stripe fields + plan gating schema + upsert_billing RPC |
| `supabase/ai-usage.sql` | Updated AI quota function to understand `ai` plan (500 credits) |
| `supabase/functions/billing-checkout/index.ts` | New: Stripe Checkout Session creation |
| `supabase/functions/billing-portal/index.ts` | New: Stripe Customer Portal session |
| `supabase/functions/stripe-webhook/index.ts` | New: Full webhook handler |
| `supabase/functions/ai-generate/index.ts` | Updated plan gate (pro/ai/team), Gemini fallback |
| `canned-response-launcher/core/gates.js` | New: PLAN_LIMITS, can* functions, heavy-use counter |
| `canned-response-launcher/core/upgrade.js` | New: Upgrade modal for 5 paywall contexts |
| `canned-response-launcher/upgrade.css` | New: Upgrade modal styles |
| `canned-response-launcher/manifest.json` | Added gates.js, upgrade.js, upgrade.css; bumped to v2.1.0 |
| `canned-response-launcher/background.js` | Added BILLING_CHECKOUT, BILLING_PORTAL, REFRESH_PLAN handlers + plan sync |
| `canned-response-launcher/content.js` | Added AI/context gate checks + heavy-use nudge on launch |
| `canned-response-launcher/options.js` | Full billing tab rewrite: plan cards, portal, AI credits meter |
| `canned-response-launcher/options.css` | Appended billing UI styles |
| `pricing.html` | Full rebuild: 4 plan cards, comparison table, billing toggle, FAQ, CTA |
| `stripe-setup.md` | This file |
