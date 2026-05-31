/**
 * Stub /v1/auth/start landing page. Dev-only — used when STUB_IDP=true.
 *
 * Shows a tiny form: enter email → click → page displays the fake code
 * (`dev-<email>`) and also tries to launch the atlas:// deep link so the
 * desktop side auto-finishes the flow. If the deep link is blocked the
 * user can copy the code into Atlas' paste-code screen.
 */

export function stubAuthStartHtml(args: { state: string; redirect: string }): string {
  const safeRedirect = args.redirect.replace(/[<>"]/g, '');
  const safeState = args.state.replace(/[<>"]/g, '');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Atlas (dev) — Sign in</title>
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  body { font: 14px/1.5 -apple-system, system-ui, sans-serif; max-width: 480px; margin: 80px auto; padding: 0 24px; color: #111; }
  h1 { font-weight: 500; font-size: 22px; }
  input[type=email] { width: 100%; padding: 8px 10px; border: 1px solid #ccc; border-radius: 6px; font: inherit; }
  button { width: 100%; padding: 10px; border: none; border-radius: 6px; background: #111; color: #fff; cursor: pointer; font-weight: 500; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #fef3c7; color: #92400e; font-size: 11px; margin-bottom: 12px; }
  code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; }
  .code-out { margin-top: 20px; padding: 14px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; }
  .muted { color: #666; font-size: 12px; }
</style>
</head>
<body>
  <div class="badge">DEV — STUB IdP</div>
  <h1>Atlas sign-in (stub)</h1>
  <p>This is the local-dev stand-in for the WorkOS-hosted sign-in page. In production this URL redirects to <code>auth.atlas.netgroup.ai</code>. Enter any email and submit.</p>
  <form id="f">
    <input id="email" type="email" required placeholder="you@example.com" autofocus />
    <div style="height: 8px"></div>
    <button type="submit">Continue</button>
  </form>
  <div id="result" style="display:none" class="code-out"></div>
  <script>
    const state = ${JSON.stringify(safeState)};
    const redirect = ${JSON.stringify(safeRedirect)};
    const f = document.getElementById('f');
    f.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const email = document.getElementById('email').value.trim();
      if (!email.includes('@')) return;
      const code = 'dev-' + email;
      const deepLink = redirect + '?code=' + encodeURIComponent(code) + '&state=' + encodeURIComponent(state);
      const result = document.getElementById('result');
      result.style.display = 'block';
      result.innerHTML = '<div><strong>Code:</strong> <code>' + code + '</code></div>' +
        '<div style="margin-top:12px">If Atlas didn\\'t auto-finish, paste the code into the Atlas sign-in screen.</div>' +
        '<div class="muted" style="margin-top:6px">Deep link: <code>' + deepLink + '</code></div>';
      // Try to bounce to atlas:// — the OS will deliver this to the
      // running Atlas instance and auto-finish the flow.
      try { window.location.href = deepLink; } catch (_e) { /* ignore */ }
    });
  </script>
</body>
</html>`;
}
