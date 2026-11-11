# cannedIQ — Edge Functions → cannediq-web

Supabase stays the Postgres database and the login provider. Every Supabase Edge Function now has an equivalent route on the Next.js app in `cannediq-web/`. The Chrome extension calls that app for billing, teams, AI, the template store, and admin. It still talks to Supabase directly for auth and for reads that are safe under RLS (`profiles`, `user_plan`, `team_commands`, RPCs).

The Edge Function source under `canned-response-launcher-develop/supabase/functions/` is intentionally still in the repo. People on the currently published extension keep calling those functions until the new version is approved and rolled out.

The extension folder treated as current is **`canned-response-launcher-develop`** (manifest `2.0.0`, the Chrome extension `key`, `ENV = 'development'`). `canned-response-launcher/` is the production submission copy (`ENV = 'production'`, manifest `1.0.1`). The same API wiring was applied to both; only `config.js` `ENV` and the manifest version/key differ.

## Function → route

| Edge Function | New route | Auth |
| --- | --- | --- |
| `stripe-webhook` | `POST /api/stripe/webhook` | Stripe signature, no JWT |
| `billing-checkout` | `POST /api/billing/checkout` | user JWT |
| `create-checkout-session` | `POST /api/billing/create-checkout-session` | user JWT (legacy pro/team contract) |
| `billing-portal` | `POST /api/billing/portal` | user JWT |
| `billing-success` | `GET /billing/success` | public page |
| `billing-complete` | `GET /billing/complete` | public page |
| `sync-billing` | `POST /api/billing/sync` | user JWT |
| `adjust-seats` | `POST /api/team/seats` | user JWT, team owner |
| `ai-generate` | `POST /api/ai/generate` | user JWT + `check_and_increment_ai_usage` |
| `template-store` | `GET` and `POST /api/store` | GET optional, POST required |
| `template-checkout` | `POST /api/store/checkout` | user JWT |
| `template-delivery` | `POST /api/store/deliver` | user JWT |
| `send-team-invite` | `POST /api/team/invite` | user JWT |
| `accept-team-invite` | `GET /team/accept-invite` and `POST /api/team/accept-invite` | page is public; POST needs a JWT |
| (invite preview, used by the page) | `GET /api/team/invite-preview` | public, token in query |
| `provision-team-member` | `POST /api/team/provision` | user JWT, owner or admin |
| `reset-member-password` | `POST /api/team/reset-password` | user JWT, owner, target must be a member |
| `admin-users` | `GET` and `PATCH /api/admin/users` | admin JWT |
| `admin-teams` | `GET /api/admin/teams` | admin JWT |
| `admin-stats` | `GET /api/admin/stats` | admin JWT |
| `admin-maintenance` | `GET` (public) and `POST /api/admin/maintenance` | POST is admin |

JWT checks use the anon key plus the caller's `Authorization: Bearer` token (`auth.getUser()`). Database writes use `SUPABASE_SERVICE_ROLE_KEY` inside the server only.

No new SQL migration was required. Seat counts, plan (`profiles.tier`), template purchases, and invites use the existing tables and RPCs.

## Environment variables

Copy `cannediq-web/.env.example` to `cannediq-web/.env.local` (or set the same names in Vercel). Required:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`
- `CHROME_EXTENSION_ID`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_PRO_MONTHLY`
- `STRIPE_PRICE_AI_MONTHLY`
- `STRIPE_PRICE_TEAM_MONTHLY`
- `OPENAI_API_KEY` and/or `GEMINI_API_KEY` (OpenAI is tried first)
- `RESEND_API_KEY` and `RESEND_FROM_EMAIL` (optional; without them, invite links and temp passwords are logged server-side and not emailed)

`CORS_EXTRA_ORIGINS` is optional. The service role key, Stripe secret, webhook secret, and AI keys must never be added to the extension.

The extension's API base is `config.js`: `API_URL = APP_URL + '/api'`. `ENV = 'development'` uses `http://localhost:3000`. `ENV = 'production'` uses `https://cannediq.com`. Supabase URL and anon key in that file are the public login values, same as before.

## Stripe Dashboard

Add a webhook endpoint (test mode and live mode separately):

```
https://cannediq.com/api/stripe/webhook
```

Local:

```
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Events:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

Put that endpoint's `whsec_...` in `STRIPE_WEBHOOK_SECRET`.

Leave the existing Supabase endpoint (`https://<project-ref>.supabase.co/functions/v1/stripe-webhook`) enabled until the extension rollout below is finished. Both can be active. They upsert the same rows. After cutover, disable the Supabase endpoint so a stale signing secret cannot keep writing.

Checkout success and cancel URLs, and the Customer Portal return URL, are HTTPS pages on this app (`/billing/success`, `/billing/complete`, `/pricing`). Stripe does not accept `chrome-extension://` as a Checkout URL. Those pages link back into the extension and send `REFRESH_PLAN`.

Customer Portal return URL in the Stripe settings can stay as `https://cannediq.com/billing/complete?status=portal`.

## Deploy (Vercel)

1. Import `cannediq-web` as its own Vercel project (root directory `cannediq-web`). The repo-root `vercel.json` is the older static site, not this app.
2. Set every variable from `.env.example`. `NEXT_PUBLIC_*` must be present at build time.
3. Deploy. Confirm `npm run build` is what Vercel runs (it is the default for Next.js).
4. Point `cannediq.com` (and `www`) at this project. `NEXT_PUBLIC_APP_URL` must match the origin users and the extension use.
5. Register the Stripe webhook against that origin and redeploy if you set the secret after the first deploy.

CORS allows `https://cannediq.com`, `https://www.cannediq.com`, `http://localhost:3000`, `http://127.0.0.1:3000`, and `chrome-extension://<CHROME_EXTENSION_ID>`. The extension manifest also grants host permission for those hosts, so the service worker can call the API even if the id in the server env is briefly wrong.

## Cut over the published extension

1. Deploy `cannediq-web` and confirm a test checkout, portal session, invite email, and `POST /api/ai/generate` against the dev Supabase project (`canned-response-launcher-develop` has `ENV = 'development'`).
2. Keep every Edge Function deployed. Do not undeploy them.
3. In `canned-response-launcher/config.js` (the production copy) leave `ENV = 'production'` so `APP_URL` is `https://cannediq.com`. Bump `manifest.json` `version` before upload.
4. Zip that folder and submit it to the Chrome Web Store. The develop folder is the working copy; the production folder is what should be packaged once `cannediq.com` serves `cannediq-web`.
5. While review is in progress, both backends are live:
   - Old extension builds call the Edge Functions (already published).
   - The new build calls `https://cannediq.com/api/...`.
6. After the new version is published and most installs have updated, disable the Supabase webhook endpoint, then undeploy the Edge Functions. The SQL migrations and the Supabase project stay.

Do not point the production extension at the new API until `cannediq.com` is serving `cannediq-web`. Until then, develop against `http://localhost:3000` with `ENV = 'development'`.

## What can be retired afterward

- All `supabase/functions/*` Edge Functions (source can stay in git as history).
- The Supabase webhook endpoint and its `STRIPE_WEBHOOK_SECRET` in the Supabase function secrets.
- Supabase secrets that only the functions used: `STRIPE_SECRET_KEY`, price ids, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `RESEND_API_KEY`, `APP_URL`, `CHROME_EXTENSION_ID`.
- The old static pages that still call Edge Functions directly: `pricing.html`, `website/pricing.html`, and `website/admin.html`. The replacements are `cannediq-web` `/pricing` and `/admin`.

## Not verified here

- No live Stripe, Supabase, Resend, or OpenAI credentials were available in this environment, so checkout, webhooks, and AI calls were not executed against those services.
- `npm run build` is the check that was run (typecheck included).
- Chrome Web Store review and the real extension id in `CHROME_EXTENSION_ID` have to be confirmed by the owner. The id is derived from the `key` in `canned-response-launcher-develop/manifest.json`.
- `website/` and the root HTML files were not switched over; they are the previous static site.
