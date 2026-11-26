// Serves the real web app with made-up agents (same sample data as the iPhone demo) for the video.
const html = (await Bun.file(process.env.HOME + '/Desktop/projects/pilothouse-site/app/index.html').text())
  .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '')
  .replace('<head>', `<head><script>localStorage.setItem('pilothouse-device-token','demo')</script>`);
const s = (id, project, pid, status, tail, choices = []) => ({ id, project, projectId: pid, status, tail, choices, risk: 'normal', sig: 'd' });
const data = {
  '/api/sessions': [
    s('t1', 'storefront · Claude Code', 'web', 'waiting', '⏺ Added ApplePayButton to src/Checkout.tsx\n⏺ Ran npm test: 48 passed\n\nTests pass. Shall I run the build?\n\nBash command: npm run build',
      [{ key: '1', label: 'Yes' }, { key: '2', label: "Yes, and don't ask again" }, { key: '3', label: 'No' }]),
    s('t2', 'billing-api · Codex', 'api', 'running', 'Fixing rounding in invoice totals…'),
    s('t3', 'ios-app · Gemini CLI', 'ios', 'idle', 'Done: dark mode for the settings screen.'),
  ],
  '/api/projects': [{ id: 'web', name: 'storefront' }, { id: 'api', name: 'billing-api' }, { id: 'ios', name: 'ios-app' }],
};
Bun.serve({ port: 8765, fetch(req) {
  const p = new URL(req.url).pathname;
  if (p === '/' ) return new Response(html, { headers: { 'content-type': 'text/html' } });
  return Response.json(data[p] ?? { error: 'demo' }, { status: data[p] ? 200 : 404 });
} });
console.log('ok');
