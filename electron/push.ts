// Sends push notifications to paired iPhones straight from this computer through Apple's APNs (token auth,
// HTTP/2). Needs an APNs key in ~/.pilothouse/apns.json: { keyPath, keyId, teamId, bundleId }.
// shortcut: the key belongs to whoever builds the iOS app, so this only works for your own build; a hosted
// relay that holds the key is the upgrade when the app ships to other people.
import http2 from 'http2';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

export interface ApnsConfig { keyPath: string; keyId: string; teamId: string; bundleId: string }
export interface PushTarget { token: string; sandbox?: boolean }
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

// Resolves to the device tokens APNs says are dead, so the caller can forget them.
export async function sendPush(targets: PushTarget[], m: PushMessage): Promise<string[]> {
  const c = apnsConfig();
  if (!c || !targets.length) return [];
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
