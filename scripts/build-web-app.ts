// Writes usepilothouse.com/app (the web remote that reaches a computer through the encrypted relay) into the site
// repo, from the same page the desktop app serves over Tailscale, so the two never drift apart.
// Run: bun scripts/build-web-app.ts [path to pilothouse-site]   (default: ../pilothouse-site)
import fs from 'fs';
import path from 'path';
import { REMOTE_PAGE } from '../electron/remotePage';
import { REMOTE_ICON_PNG } from '../electron/remoteIcon';

const site = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'pilothouse-site'));
const out = path.join(site, 'app');
fs.mkdirSync(out, { recursive: true });

// GitHub Pages cannot send headers, so the policy goes in a meta tag: the page talks to the relay and nothing else.
const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src wss://relay.usepilothouse.com; img-src 'self' data:; manifest-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'none'";
const html = REMOTE_PAGE.replace('<meta charset="utf-8">', `<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="${CSP}">\n<meta name="referrer" content="no-referrer">\n<meta name="robots" content="noindex">`);
if (html === REMOTE_PAGE) throw new Error('could not place the CSP meta tag');

fs.writeFileSync(path.join(out, 'index.html'), html);
fs.writeFileSync(path.join(out, 'icon.png'), REMOTE_ICON_PNG);
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({
  name: 'Pilothouse', short_name: 'Pilothouse', start_url: './', scope: './', display: 'standalone',
  background_color: '#0B0D10', theme_color: '#0B0D10', icons: [{ src: 'icon.png', sizes: '512x512', type: 'image/png' }]
}));
// Service worker: shows the pushes your computer sends; a tap opens (or focuses) the web remote.
fs.writeFileSync(path.join(out, 'sw.js'), `self.addEventListener('push', (e) => {
  let m = {};
  try { m = e.data.json(); } catch (x) {}
  e.waitUntil(self.registration.showNotification(m.title || 'Pilothouse', { body: m.body || 'An agent needs you', tag: m.tag, renotify: true, icon: 'icon.png', badge: 'icon.png' }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if (c.url.includes('/app/') && 'focus' in c) return c.focus();
    return clients.openWindow('./');
  }));
});
`);
console.log(`web app written to ${out}`);
