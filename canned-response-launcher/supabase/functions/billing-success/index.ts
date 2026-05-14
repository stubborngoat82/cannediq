/**
 * Supabase Edge Function: billing-success
 *
 * Stripe redirects here after a successful Checkout session.
 * Serves a self-contained HTML page that:
 *   - Shows the plan that was purchased
 *   - Offers a "Return to CannedIQ" button (if ext ID is known)
 *   - Tells the extension to refresh its cached plan via postMessage
 *   - Auto-redirects back to the extension after 8 seconds
 *
 * No JWT verification required — Stripe sends the user here, they
 * are not authenticated at this point.
 *
 * Deploy:
 *   supabase functions deploy billing-success --no-verify-jwt
 *
 * Query params (appended by billing-checkout):
 *   ?plan=pro|ai|team   — plan that was purchased
 *   &ext=EXTENSION_ID   — Chrome extension ID for the "Return" link
 *   &session_id=...     — Stripe session ID (ignored here, Stripe adds it)
 */

const EXT_ID = Deno.env.get('CHROME_EXTENSION_ID') ?? '';

Deno.serve((req: Request) => {
  const url    = new URL(req.url);
  const plan   = url.searchParams.get('plan') ?? '';
  const extId  = url.searchParams.get('ext')  ?? EXT_ID;

  const PLAN_LABELS: Record<string, string> = {
    pro:  'Pro',
    ai:   'Pro + AI',
    team: 'Team',
  };
  const planLabel = PLAN_LABELS[plan] ?? '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Payment Successful — CannedIQ</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f0f11; color: #e2e8f0; min-height: 100vh;
      display: flex; align-items: center; justify-content: center; padding: 24px;
    }
    .card {
      background: #1a1a1f; border: 1px solid #2a2a35;
      border-radius: 20px; padding: 56px 48px; max-width: 480px; width: 100%; text-align: center;
    }
    .logo { font-size: 18px; font-weight: 700; color: #a78bfa; margin-bottom: 40px; }
    .icon {
      width: 72px; height: 72px; background: #16a34a22; border: 2px solid #16a34a44;
      border-radius: 50%; display: flex; align-items: center; justify-content: center;
      margin: 0 auto 28px; font-size: 32px;
    }
    h1 { font-size: 26px; font-weight: 700; color: #f8fafc; margin-bottom: 12px; }
    .subtitle { font-size: 15px; color: #94a3b8; line-height: 1.6; margin-bottom: 32px; }
    .plan-badge {
      display: inline-block; font-size: 13px; font-weight: 600;
      padding: 4px 14px; border-radius: 99px; margin-bottom: 32px;
      text-transform: uppercase; letter-spacing: .05em;
    }
    .plan-badge.pro  { background: #7c3aed22; border: 1px solid #7c3aed44; color: #a78bfa; }
    .plan-badge.ai   { background: #0ea5e922; border: 1px solid #0ea5e944; color: #38bdf8; }
    .plan-badge.team { background: #16a34a22; border: 1px solid #16a34a44; color: #4ade80; }
    .actions { display: flex; flex-direction: column; align-items: center; gap: 0; }
    .btn {
      display: inline-flex; align-items: center; gap: 8px;
      background: #7c3aed; color: #fff; border: none; border-radius: 10px;
      padding: 13px 28px; font-size: 15px; font-weight: 600;
      cursor: pointer; text-decoration: none; transition: background .15s;
    }
    .btn:hover { background: #6d28d9; }
    .btn-secondary {
      background: transparent; color: #94a3b8; border: 1px solid #2a2a35; margin-top: 12px;
    }
    .btn-secondary:hover { background: #1e1e26; color: #e2e8f0; }
    .hint { margin-top: 28px; font-size: 13px; color: #475569; }
    .progress-bar {
      margin-top: 20px; height: 3px; background: #2a2a35; border-radius: 99px; overflow: hidden;
    }
    .progress-fill {
      height: 100%; background: #7c3aed; border-radius: 99px;
      animation: shrink 8s linear forwards;
    }
    @keyframes shrink { from { width: 100%; } to { width: 0%; } }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">⚡ CannedIQ</div>
    <div class="icon">✓</div>
    <h1>You're all set!</h1>
    <p class="subtitle">
      Your subscription is active. Switch back to the extension to start using your new features.
    </p>

    ${planLabel ? `<div class="plan-badge ${plan}">${planLabel} — Active</div>` : ''}

    <div class="actions">
      ${extId
        ? `<a id="btn-ext" class="btn" href="chrome-extension://${extId}/options.html?tab=billing">
             ↩ Return to CannedIQ
           </a>`
        : `<button class="btn" onclick="window.close(); clearTimeout(window._t)">Close this tab</button>`
      }
    </div>

    <p class="hint">Your plan is active immediately. If the extension still shows "Free",
      open the Billing tab — it refreshes automatically when you return.</p>

    <div class="progress-bar"><div class="progress-fill" id="pf"></div></div>
  </div>

  <script>
    const extId = ${JSON.stringify(extId)};

    // Ask the extension to refresh its cached plan
    if (extId) {
      try { chrome.runtime.sendMessage(extId, { type: 'REFRESH_PLAN' }); } catch {}
    }

    // Auto-redirect after 8 s
    window._t = setTimeout(() => {
      if (extId) {
        window.location.href = 'chrome-extension://' + extId + '/options.html?tab=billing';
      } else {
        window.close();
      }
    }, 8000);

    // Cancel auto-redirect on any click
    document.addEventListener('click', () => clearTimeout(window._t));
  </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
});
