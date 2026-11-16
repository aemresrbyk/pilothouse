// Web remote without Tailscale: this computer joins its room on the Pilothouse relay (relay/worker.js) and answers
// requests from browsers on usepilothouse.com/app. Every message is sealed end to end with AES-256-GCM:
//  - pairing requests with a key derived from the one-time pairing code in the QR,
//  - everything after with the device's own relayKey (handed over, sealed, in the pairing reply).
// The relay sees room ids, device ids and ciphertext only; it can neither read nor forge a request.
// Each request also carries the device token (checked like the HTTP API) and a timestamp + nonce against replays.
import crypto from 'crypto';
import { ApiResult, remoteState, relayRoom, pairExpired } from './remote';

export const RELAY_WS = process.env.PILOTHOUSE_RELAY_WS || 'wss://relay.usepilothouse.com';
const MAX_SKEW = 60_000;

export const pairKey = (code: string) => crypto.createHash('sha256').update(code).digest();

// nonce (12) | ciphertext | tag (16), base64; aad binds the box to the device id it claims to come from.
export function sealBox(key: Buffer, aad: string, data: unknown): string {
  const nonce = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, nonce);
  c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(JSON.stringify(data)), c.final()]);
  return Buffer.concat([nonce, ct, c.getAuthTag()]).toString('base64');
}
export function openBox(key: Buffer, aad: string, box: string): any {
  const raw = Buffer.from(box, 'base64');
  if (raw.length < 29) throw new Error('short');
  const d = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(raw.subarray(raw.length - 16));
  return JSON.parse(Buffer.concat([d.update(raw.subarray(12, raw.length - 16)), d.final()]).toString());
}

type Api = (route: string, url: URL, body: any, auth: string | undefined, from: string | undefined) => Promise<ApiResult>;

// One sealed request from a browser -> the sealed reply (or null: not ours, tampered, stale or replayed; dropped).
export function relayHandler(api: Api, now = () => Date.now()) {
  const seen = new Map<string, number>(); // nonce -> time, for replay protection
  return async (msg: string): Promise<string | null> => {
    let env: { d?: unknown; c?: unknown };
    try { env = JSON.parse(msg); } catch { return null; }
    const d = String(env.d ?? ''), c = String(env.c ?? '');
    if (!c || c.length > 400_000) return null;
    const state = remoteState();
    let key: Buffer | undefined;
    if (d === 'pair') { if (!pairExpired(state)) key = pairKey(state.pair); }
    else { const dev = state.devices.find(x => x.id === d); if (dev?.relayKey) key = Buffer.from(dev.relayKey, 'base64'); }
    if (!key) return null;
    let req: any;
    try { req = openBox(key, d, c); } catch { return null; }
    const t = now();
    if (typeof req.t !== 'number' || Math.abs(t - req.t) > MAX_SKEW || typeof req.n !== 'string' || seen.has(req.n)) return null;
    seen.set(req.n, t);
    for (const [n, at] of seen) if (t - at > 2 * MAX_SKEW) seen.delete(n);
    const url = new URL(String(req.p || '/'), 'https://relay.invalid');
    const method = req.m === 'POST' ? 'POST' : 'GET';
    // Pairing works only through the pairing route; a device id must match the token it presents.
    if (d === 'pair' && url.pathname !== '/api/pair') return null;
    let r: ApiResult;
    if (d !== 'pair' && !remoteState().devices.some(x => x.id === d && req.a && x.hash === crypto.createHash('sha256').update(String(req.a)).digest('hex'))) {
      r = { status: 401, body: { error: 'unauthorized' } };
    } else {
      r = await api(`${method} ${url.pathname}`, url, req.b && typeof req.b === 'object' ? req.b : {}, d === 'pair' ? undefined : `Bearer ${req.a}`, `web ${d}`);
    }
    return JSON.stringify({ d, c: sealBox(key, d, { id: req.id, s: r.status, b: r.body }) });
  };
}

// Keeps this computer in its room, reconnecting with backoff. status() tells Settings whether it is online.
export function startRelayLink(api: Api) {
  const handle = relayHandler(api);
  let ws: WebSocket | null = null, stopped = false, delay = 1000, online = false, timer: NodeJS.Timeout | undefined;
  const connect = () => {
    if (stopped) return;
    const { secret, room } = relayRoom();
    ws = new WebSocket(`${RELAY_WS}/room/${room}?host=${secret}`);
    ws.onopen = () => { online = true; delay = 1000; };
    ws.onmessage = async (e) => {
      let m: { from?: string; data?: string };
      try { m = JSON.parse(String(e.data)); } catch { return; }
      if (!m.from || typeof m.data !== 'string') return;
      const out = await handle(m.data);
      if (out && ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ to: m.from, data: out }));
    };
    ws.onclose = () => {
      online = false;
      if (stopped) return;
      timer = setTimeout(connect, delay);
      delay = Math.min(delay * 2, 60_000);
    };
    ws.onerror = () => { /* onclose follows and reconnects */ };
  };
  connect();
  return {
    status: () => online,
    stop: () => { stopped = true; clearTimeout(timer); ws?.close(); }
  };
}
