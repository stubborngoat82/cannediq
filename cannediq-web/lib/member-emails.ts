function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function newAccountEmail(
  teamName: string,
  email: string,
  password: string,
  inviterEmail: string,
): { html: string; text: string } {
  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f3f4f6;margin:0;padding:40px 20px">
<div style="background:#fff;border-radius:12px;max-width:480px;margin:0 auto;padding:40px">
  <div style="font-size:18px;font-weight:800;color:#4f46e5;margin-bottom:32px">⚡ CannedIQ</div>
  <h1 style="font-size:22px;color:#111827">Welcome to ${esc(teamName)}</h1>
  <p style="color:#6b7280;line-height:1.6">${esc(inviterEmail)} created a CannedIQ account for you and added you to their team's shared response library.</p>
  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;margin:16px 0">
    <div>Email: <strong style="font-family:monospace">${esc(email)}</strong></div>
    <div>Password: <strong style="font-family:monospace">${esc(password)}</strong></div>
  </div>
  <p style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;color:#92400e">This is a temporary password. You'll be asked to create a new one the first time you sign in.</p>
  <p style="color:#6b7280">Install the CannedIQ Chrome extension, then sign in with the credentials above.</p>
</div></body></html>`;
  const text = [
    `Welcome to "${teamName}" on CannedIQ`,
    '',
    `${inviterEmail} has created a CannedIQ account for you.`,
    '',
    `Email:    ${email}`,
    `Password: ${password}`,
    '',
    'This is a temporary password — you will be asked to set a new one when you first sign in.',
    '',
    'Install the CannedIQ Chrome extension and sign in to get started.',
  ].join('\n');
  return { html, text };
}

export function existingAccountEmail(
  teamName: string,
  inviterEmail: string,
): { html: string; text: string } {
  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f3f4f6;margin:0;padding:40px 20px">
<div style="background:#fff;border-radius:12px;max-width:480px;margin:0 auto;padding:40px">
  <div style="font-size:18px;font-weight:800;color:#4f46e5;margin-bottom:32px">⚡ CannedIQ</div>
  <h1 style="font-size:22px;color:#111827">You've been added to ${esc(teamName)}</h1>
  <p style="color:#6b7280;line-height:1.6">${esc(inviterEmail)} added your existing CannedIQ account to the <strong>${esc(teamName)}</strong> team.</p>
  <p style="color:#6b7280">Open the CannedIQ extension and sign in — the team's shared command library will be there.</p>
</div></body></html>`;
  const text = [
    `You've been added to "${teamName}" on CannedIQ`,
    '',
    `${inviterEmail} has added your account to the "${teamName}" team.`,
    'Open the CannedIQ extension and sign in to see the shared library.',
  ].join('\n');
  return { html, text };
}

export function resetPasswordEmail(
  teamName: string,
  email: string,
  password: string,
  managerEmail: string,
): { html: string; text: string } {
  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f3f4f6;margin:0;padding:40px 20px">
<div style="background:#fff;border-radius:12px;max-width:480px;margin:0 auto;padding:40px">
  <div style="font-size:18px;font-weight:800;color:#4f46e5;margin-bottom:32px">⚡ CannedIQ</div>
  <h1 style="font-size:22px;color:#111827">Your password has been reset</h1>
  <p style="color:#6b7280;line-height:1.6">${esc(managerEmail)} reset your CannedIQ password for the <strong>${esc(teamName)}</strong> team.</p>
  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;margin:16px 0">
    <div>Email: <strong style="font-family:monospace">${esc(email)}</strong></div>
    <div>New password: <strong style="font-family:monospace">${esc(password)}</strong></div>
  </div>
  <p style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;color:#92400e">This is a temporary password. You'll be prompted to set a permanent one when you sign in.</p>
</div></body></html>`;
  const text = [
    'Your CannedIQ password has been reset',
    '',
    `Team: ${teamName}`,
    `Email:    ${email}`,
    `Password: ${password}`,
    '',
    'This is a temporary password — you will be asked to set a permanent one when you sign in.',
  ].join('\n');
  return { html, text };
}

export function inviteEmail(
  teamName: string,
  inviterEmail: string,
  link: string,
): { html: string; text: string } {
  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f3f4f6;margin:0;padding:40px 20px">
<div style="background:#fff;border-radius:12px;max-width:480px;margin:0 auto;padding:40px">
  <div style="font-size:18px;font-weight:800;color:#4f46e5;margin-bottom:32px">⚡ CannedIQ</div>
  <h1 style="font-size:22px;color:#111827">You're invited to join ${esc(teamName)}</h1>
  <p style="color:#6b7280;line-height:1.6">${esc(inviterEmail)} invited you to their team's shared response library on CannedIQ.</p>
  <p style="color:#6b7280">Click the button to accept. Create a free account, or sign in if you already have one.</p>
  <a href="${esc(link)}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600">Accept invite →</a>
  <p style="font-size:12px;color:#9ca3af;word-break:break-all">Or copy this link:<br>${esc(link)}</p>
  <p style="margin-top:32px;padding-top:24px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af">This invite expires in 7 days. If you weren't expecting it, you can ignore this email.</p>
</div></body></html>`;
  const text = [
    `You're invited to join "${teamName}" on CannedIQ`,
    '',
    `${inviterEmail} has invited you to their team's shared response library.`,
    '',
    'Accept your invite here:',
    link,
    '',
    'This invite expires in 7 days.',
  ].join('\n');
  return { html, text };
}
