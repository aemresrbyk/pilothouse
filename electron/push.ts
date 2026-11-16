// Push notifications to paired iPhones, two ways:
//  - Relay (default, App Store app): the text is encrypted here with the phone's own key (AES-256-GCM) and sent
//    through Pilothouse's relay (relay/worker.js), which holds the app's APNs key but cannot read the text.
//  - Direct (your own build): with an APNs key in ~/.pilothouse/apns.json ({ keyPath, keyId, teamId, bundleId })
//    this computer talks to Apple itself (token auth, HTTP/2).
import http2 from 'http2';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import webpush from 'web-push';

export interface ApnsConfig { keyPath: string; keyId: string; teamId: string; bundleId: string }
export interface PushTarget { token: string; sandbox?: boolean; key?: string } // key: base64 AES-256 key the phone holds
export interface PushMessage {
  title: string;
  body: string;
  category?: string; // notification actions on the phone (APPROVAL, APPROVAL_RISKY)
  data?: Record<string, unknown>;
}

const configFile = () => path.join(process.env.PILOTHOUSE_DIR || path.join(os.homedir(), '.pilothouse'), 'apns.json');

export function apnsConfig(): ApnsConfig | null {
  try {
    const c = JSON.parse(fs.readFileSync(configFile(), 'utf-8'));
    return c.keyPath && c.keyId && c.teamId && c.bundleId && fs.existsSync(c.keyPath) ? c : null;
  } catch { return null; }
}

let jwt = { value: '', at: 0 };
// APNs wants a fresh token at most once every 20 minutes and rejects ones older than an hour.
export function apnsJwt(c: ApnsConfig, now = Date.now()): string {
  if (jwt.value && now - jwt.at < 40 * 60_000) return jwt.value;
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64({ alg: 'ES256', kid: c.keyId })}.${b64({ iss: c.teamId, iat: Math.floor(now / 1000) })}`;
  const sig = crypto.sign('sha256', Buffer.from(unsigned), { key: fs.readFileSync(c.keyPath, 'utf-8'), dsaEncoding: 'ieee-p1363' });
  jwt = { value: `${unsigned}.${sig.toString('base64url')}`, at: now };
  return jwt.value;
}

export function apnsPayload(m: PushMessage) {
  return {
    aps: {
      alert: { title: m.title, body: m.body },
      sound: 'default',
      'thread-id': m.title,
      ...(m.category ? { category: m.category } : {}),
      'content-available': 1 // lets the app refresh its widget
    },
    ...m.data
  };
}

export const RELAY_URL = process.env.PILOTHOUSE_RELAY || 'https://pilothouse-push.aemresrbyk.workers.dev/push';

// nonce (12) | ciphertext | tag (16), base64: the layout CryptoKit's AES.GCM.SealedBox(combined:) reads.
export function seal(keyB64: string, data: unknown): string {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(keyB64, 'base64'), nonce);
  const ct = Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final()]);
  return Buffer.concat([nonce, ct, cipher.getAuthTag()]).toString('base64');
}

const relayKind = (m: PushMessage) => m.category === 'APPROVAL_RISKY' ? 'risky' : m.category === 'APPROVAL' ? 'approval' : 'done';

async function sendViaRelay(targets: PushTarget[], m: PushMessage): Promise<string[]> {
  const dead: string[] = [];
  await Promise.all(targets.filter(t => t.key).map(async t => {
    try {
      const res = await fetch(RELAY_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: t.token, sandbox: !!t.sandbox, kind: relayKind(m), enc: seal(t.key!, { title: m.title, body: m.body, ...m.data }) }),
        signal: AbortSignal.timeout(10_000)
      });
      if (res.status === 410) dead.push(t.token);
      else if (!res.ok) console.error('Push relay', res.status, await res.text().catch(() => ''));
    } catch (err: any) { console.error('Push relay:', err.message); }
  }));
  return dead;
}

// Resolves to the device tokens APNs says are dead, so the caller can forget them.
export async function sendPush(targets: PushTarget[], m: PushMessage): Promise<string[]> {
  if (!targets.length) return [];
  const c = apnsConfig();
  if (!c) return sendViaRelay(targets, m);
  const dead: string[] = [];
  const body = JSON.stringify(apnsPayload(m));
  for (const sandbox of [true, false]) {
    const group = targets.filter(t => !!t.sandbox === sandbox);
    if (!group.length) continue;
    const session = http2.connect(sandbox ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com');
    session.on('error', (err) => console.error('APNs:', err.message));
    await Promise.all(group.map(t => new Promise<void>(resolve => {
      const req = session.request({
        ':method': 'POST',
        ':path': `/3/device/${t.token}`,
        authorization: `bearer ${apnsJwt(c)}`,
        'apns-topic': c.bundleId,
        'apns-push-type': 'alert',
        'apns-priority': '10'
      });
      let status = 0, reply = '';
      req.on('response', h => { status = Number(h[':status']); });
      req.on('data', d => { reply += d; });
      req.on('end', () => {
        if (status === 410 || /BadDeviceToken|Unregistered/.test(reply)) dead.push(t.token);
        else if (status !== 200) console.error('APNs', status, reply);
        resolve();
      });
      req.on('error', () => resolve());
      req.setTimeout(10_000, () => { req.close(); resolve(); });
      req.end(body);
    })));
    session.close();
  }
  return dead;
}

// ---- Web Push (the browser web remote, usepilothouse.com/app) ----
// The VAPID keys are made on this computer and the payload is encrypted to the browser's own key (RFC 8291), so the
// browser's push service (Google, Mozilla, Apple, Microsoft) carries it without reading it. No server of ours.
export interface WebPushSub { endpoint: string; keys: { p256dh: string; auth: string } }
// Only real browser push services: a subscription is an address this computer will POST to.
const PUSH_HOSTS = /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)$/;
export function validWebPush(sub: any): sub is WebPushSub {
  try {
    const u = new URL(String(sub?.endpoint));
    return u.protocol === 'https:' && PUSH_HOSTS.test(u.hostname) && sub.endpoint.length < 1000
      && /^[A-Za-z0-9_-]{40,200}$/.test(String(sub.keys?.p256dh)) && /^[A-Za-z0-9_-]{10,100}$/.test(String(sub.keys?.auth));
  } catch { return false; }
}
export const newVapidKeys = () => webpush.generateVAPIDKeys();

// Resolves to the endpoints the push service says are gone (unsubscribed), so the caller can forget them.
export async function sendWebPush(vapid: { publicKey: string; privateKey: string }, subs: WebPushSub[], m: PushMessage): Promise<string[]> {
  const dead: string[] = [];
  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification(sub, JSON.stringify({ title: m.title, body: m.body, tag: String(m.data?.sid || m.title) }), {
        vapidDetails: { subject: 'https://usepilothouse.com', publicKey: vapid.publicKey, privateKey: vapid.privateKey },
        TTL: 3600, urgency: 'high', timeout: 10_000
      });
    } catch (err: any) {
      if (err.statusCode === 404 || err.statusCode === 410) dead.push(sub.endpoint);
      else console.error('Web push:', err.statusCode || err.message);
    }
  }));
  return dead;
}
