// Pilothouse push relay (Cloudflare Worker). Forwards notifications from a user's computer to Apple (APNs) for
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

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method !== 'POST' || url.pathname !== '/push') return new Response('Pilothouse push relay. Source: https://github.com/aemresrbyk/pilothouse/tree/main/relay', { status: 404 });

    if (env.LIMITER) {
      const { success } = await env.LIMITER.limit({ key: req.headers.get('cf-connecting-ip') || 'unknown' });
      if (!success) return json(429, { error: 'slow down' });
    }

    const body = await req.json().catch(() => null);
    const token = String(body?.token || '');
    const enc = String(body?.enc || '');
    const kind = String(body?.kind || '');
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
