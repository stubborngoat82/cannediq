/**
 * Supabase Edge Function: billing-complete
 *
 * Serves a simple hosted page after Stripe Checkout redirects.
 * No external website needed.
 *
 * success_url → /functions/v1/billing-complete?status=success
 * cancel_url  → /functions/v1/billing-complete?status=cancel
 *
 * Deploy:
 *   supabase functions deploy billing-complete --no-verify-jwt
 */

Deno.serve((req: Request) => {
  const url    = new URL(req.url);
  const status = url.searchParams.get('status');

  if (status === 'success') {
    return html(successPage());
  } else if (status === 'portal') {
    return html(portalPage());
  } else {
    return html(cancelPage());
  }
});

function html(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function shell(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Canned Response Launcher</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #f3f4f6;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    color: #111827;
  }
  .card {
    background: #fff;
    border-radius: 16px;
    padding: 48px 40px;
    max-width: 400px;
    width: 100%;
    box-shadow: 0 8px 40px rgba(0,0,0,.1);
    text-align: center;
  }
  .logo { font-size: 15px; font-weight: 800; color: #4f46e5; margin-bottom: 32px; display: flex; align-items: center; justify-content: center; gap: 8px; }
  .logo-icon { width: 26px; height: 26px; background: #4f46e5; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 13px; }
  .icon { font-size: 52px; margin-bottom: 20px; }
  h1 { font-size: 22px; font-weight: 700; margin-bottom: 10px; }
  p { font-size: 14px; color: #6b7280; line-height: 1.6; margin-bottom: 10px; }
  .hint { font-size: 12px; color: #9ca3af; background: #f9fafb; border-radius: 8px; padding: 14px; margin-top: 24px; line-height: 1.6; }
  .btn { display: inline-block; margin-top: 20px; background: #4f46e5; color: #fff; border: none; border-radius: 8px; padding: 11px 24px; font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit; text-decoration: none; }
  .btn-ghost { background: transparent; color: #6b7280; border: 1px solid #d1d5db; margin-top: 10px; }
</style>
</head>
<body>
<div class="card">
  <div class="logo"><div class="logo-icon">&#9889;</div>Canned Response Launcher</div>
  ${content}
</div>
</body>
</html>`;
}

function successPage(): string {
  return shell(`
    <div class="icon">&#9989;</div>
    <h1>You're all set!</h1>
    <p>Your plan has been upgraded. The change takes effect immediately.</p>
    <p>Close this tab and reopen the extension options page to see your new plan.</p>
    <div class="hint">
      <strong>What's next?</strong><br>
      Open the Canned Response Launcher extension, go to the <strong>Teams</strong> tab to create your team,
      then invite your colleagues with a single link.
    </div>
  `);
}

function portalPage(): string {
  return shell(`
    <div class="icon">&#9989;</div>
    <h1>Subscription updated</h1>
    <p>Your changes have been saved.</p>
    <p>Close this tab and reopen the extension options page to see your current plan.</p>
    <div class="hint">
      Changes like cancellations take effect at the end of your current billing period.
    </div>
  `);
}

function cancelPage(): string {
  return shell(`
    <div class="icon">&#128274;</div>
    <h1>Payment cancelled</h1>
    <p>No charge was made. You're still on your current plan.</p>
    <p>You can upgrade any time from the <strong>Billing</strong> tab in the extension options.</p>
    <div class="hint">
      Questions? Reply to any email from us and we'll help you out.
    </div>
  `);
}
