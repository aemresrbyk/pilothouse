// Pilothouse relay (Cloudflare Worker): web remote rooms (below) and push. Push forwards notifications from a user's computer to Apple (APNs) for
// the App Store build of the iPhone app, whose push key cannot ship inside open-source desktop code.
//
// It cannot read what it forwards: the computer encrypts the text with a key that only the paired iPhone holds
// (AES-256-GCM), and the iPhone decrypts it (Notification Service Extension). It stores nothing and logs nothing.
//
// Secrets (wrangler secret put): APNS_KEY (contents of the .p8 file), APNS_KEY_ID, APNS_TEAM_ID.
// Var (wrangler.toml): APNS_TOPIC = the iOS app's bundle id.

const KINDS = { approval: 'APPROVAL', risky: 'APPROVAL_RISKY', done: undefined };
const TEXT = { approval: 'An agent needs you', risky: 'An agent needs you', done: 'An agent finished' };

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

let cached = { jwt: '', at: 0 };
// APNs takes a token for up to an hour and wants a new one at most every 20 minutes.
export async function apnsJwt(env, now = Date.now()) {
  if (cached.jwt && now - cached.at < 40 * 60_000) return cached.jwt;
  const pem = env.APNS_KEY.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const enc = new TextEncoder();
  const unsigned = `${b64url(enc.encode(JSON.stringify({ alg: 'ES256', kid: env.APNS_KEY_ID })))}.${b64url(enc.encode(JSON.stringify({ iss: env.APNS_TEAM_ID, iat: Math.floor(now / 1000) })))}`;
  // WebCrypto ECDSA signatures are already raw r||s, the form JWT wants.
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(unsigned));
  cached = { jwt: `${unsigned}.${b64url(sig)}`, at: now };
  return cached.jwt;
}

// ---- Web remote rooms ----
// usepilothouse.com/app talks to a user's computer through a room: the computer joins as host (proving it owns the
// room: roomId = first 32 hex of sha256(hostSecret)), browsers join as clients. The room only passes messages
// between them. They are end-to-end encrypted (AES-256-GCM, keys made on the computer and handed over by QR), so
// the relay cannot read or forge them. Nothing is stored; the room exists only while sockets are open.
const ROOM_RE = /^[0-9a-f]{32}$/;
const MAX_MSG = 512 * 1024;
export const roomOf = async (secret) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret)))].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
const APP_ORIGINS = ['https://usepilothouse.com', 'https://www.usepilothouse.com'];

async function joinRoom(req, env, url) {
  const room = url.pathname.split('/')[2] || '';
  if (!ROOM_RE.test(room) || req.headers.get('upgrade') !== 'websocket') return new Response('bad room', { status: 400 });
  const secret = url.searchParams.get('host');
  if (secret !== null) {
    if (await roomOf(secret) !== room) return new Response('not the host', { status: 403 });
  } else {
    const origin = req.headers.get('origin') || '';
    if (!APP_ORIGINS.includes(origin) && !(env.DEV_ORIGIN && origin === env.DEV_ORIGIN)) return new Response('origin', { status: 403 });
  }
  if (env.LIMITER) {
    const { success } = await env.LIMITER.limit({ key: req.headers.get('cf-connecting-ip') || 'unknown' });
    if (!success) return new Response('slow down', { status: 429 });
  }
  const stub = env.ROOMS.get(env.ROOMS.idFromName(room));
  const fwd = new Request(`https://room/${secret !== null ? 'host' : 'client'}`, req);
  // Roughly where a device is (city, country), shown on the computer while it pairs. Nothing is kept.
  const loc = [req.cf?.city, req.cf?.country].filter(Boolean).join(', ');
  if (secret === null && loc) fwd.headers.set('x-ph-loc', loc.slice(0, 80));
  return stub.fetch(fwd);
}

export class Room {
  constructor(state) { this.state = state; }
  async fetch(req) {
    const role = new URL(req.url).pathname.slice(1);
    const [client, server] = Object.values(new WebSocketPair());
    const tag = role === 'host' ? 'host' : `c${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    if (tag === 'host') for (const old of this.state.getWebSockets('host')) old.close(4000, 'replaced');
    this.state.acceptWebSocket(server, [tag]); // hibernation: an idle room costs nothing
    if (tag !== 'host') server.serializeAttachment({ loc: req.headers.get('x-ph-loc') || '' });
    return new Response(null, { status: 101, webSocket: client });
  }
  webSocketMessage(ws, msg) {
    if (typeof msg !== 'string' || msg.length > MAX_MSG) return;
    const [tag] = this.state.getTags(ws);
    if (tag === 'host') {
      let m; try { m = JSON.parse(msg); } catch { return; }
      if (typeof m.to !== 'string' || typeof m.data !== 'string') return;
      for (const c of this.state.getWebSockets(m.to)) c.send(m.data);
      return;
    }
    const [host] = this.state.getWebSockets('host');
    if (!host) return ws.send(JSON.stringify({ offline: true }));
    host.send(JSON.stringify({ from: tag, data: msg, loc: ws.deserializeAttachment()?.loc || undefined }));
  }
  webSocketClose(ws, code) { try { ws.close(code === 1005 ? 1000 : code); } catch {} }
  webSocketError(ws) { try { ws.close(1011); } catch {} }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/room/')) return joinRoom(req, env, url);
    if (req.method !== 'POST' || url.pathname !== '/push') return new Response('Pilothouse push relay. Source: https://github.com/aemresrbyk/pilothouse/tree/main/relay', { status: 404 });

    if (env.LIMITER) {
      const { success } = await env.LIMITER.limit({ key: req.headers.get('cf-connecting-ip') || 'unknown' });
      if (!success) return json(429, { error: 'slow down' });
    }

    const body = await req.json().catch(() => null);
    const token = String(body?.token || '');
    const enc = String(body?.enc || '');
    const kind = String(body?.kind || '');
    // Live Activity update: the system draws it, so it carries two small numbers in the clear and nothing else.
    if (kind === 'activity') {
      const n = (x) => (Number.isInteger(x) && x >= 0 && x < 1000 ? x : null);
      const needsYou = n(body?.state?.needsYou), working = n(body?.state?.working);
      if (!/^[0-9a-f]{64,400}$/i.test(token) || needsYou === null || working === null) return json(400, { error: 'bad request' });
      const now = Math.floor(Date.now() / 1000);
      const aps = { timestamp: now, event: body.end === true ? 'end' : 'update', 'content-state': { needsYou, working }, ...(body.end === true ? { 'dismissal-date': now + 60 } : {}) };
      const res = await fetch(`https://${body.sandbox === true ? 'api.sandbox.push.apple.com' : 'api.push.apple.com'}/3/device/${token}`, {
        method: 'POST',
        headers: { authorization: `bearer ${await apnsJwt(env)}`, 'apns-topic': `${env.APNS_TOPIC}.push-type.liveactivity`, 'apns-push-type': 'liveactivity', 'apns-priority': '10' },
        body: JSON.stringify({ aps })
      });
      if (res.status === 200) return json(200, { ok: true });
      const reason = (await res.json().catch(() => ({}))).reason || '';
      return json(res.status === 410 || reason === 'BadDeviceToken' ? 410 : 502, { error: reason || `APNs ${res.status}` });
    }
    if (!/^[0-9a-f]{64,200}$/i.test(token) || !(kind in KINDS) || !/^[A-Za-z0-9+/=]{24,3000}$/.test(enc)) return json(400, { error: 'bad request' });

    const payload = {
      aps: {
        alert: { title: 'Pilothouse', body: TEXT[kind] }, // shown only if the phone cannot decrypt
        sound: 'default',
        'mutable-content': 1,
        'content-available': 1,
        ...(KINDS[kind] ? { category: KINDS[kind] } : {})
      },
      enc
    };
    const host = body.sandbox === true ? 'api.sandbox.push.apple.com' : 'api.push.apple.com';
    const res = await fetch(`https://${host}/3/device/${token}`, {
      method: 'POST',
      headers: {
        authorization: `bearer ${await apnsJwt(env)}`,
        'apns-topic': env.APNS_TOPIC,
        'apns-push-type': 'alert',
        'apns-priority': '10'
      },
      body: JSON.stringify(payload)
    });
    if (res.status === 200) return json(200, { ok: true });
    const reason = (await res.json().catch(() => ({}))).reason || '';
    // 410 / BadDeviceToken: the app was removed or the token changed; the computer forgets it.
    const gone = res.status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered';
    return json(gone ? 410 : 502, { error: reason || `APNs ${res.status}` });
  }
};
