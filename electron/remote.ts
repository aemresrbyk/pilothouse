// Phone remote: a small web page + JSON API so a phone can see every agent tab across projects and agents,
// answer approval prompts and send messages. Listens only on this computer's Tailscale address: traffic is
// WireGuard-encrypted and reachable only from your own tailnet devices. Never on the LAN, where plain HTTP
// could be sniffed. Every remote action is appended to ~/.pilothouse/remote-audit.jsonl.
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { stripAnsi } from './control';
import { parseChoices } from '../src/utils/inbox';
import type { ProjectItem, PtyStatus } from '../src/types';
import { REMOTE_PAGE } from './remotePage';

export interface RemoteSession { id: string; cwd: string; status: PtyStatus; buf: string }
export interface RemoteDeps {
  listProjects: () => ProjectItem[];
  sessions: () => RemoteSession[];
  write: (id: string, data: string) => boolean;
  // Opens the project's default agent in a new tab, as clicking it in the app would.
  openTab: (projectId: string) => Promise<string>;
}

export const REMOTE_PORT = 4747;
// Resolved per call so tests can use a temp dir.
const dir = () => process.env.PILOTHOUSE_DIR || path.join(os.homedir(), '.pilothouse');
export const remoteFile = () => path.join(dir(), 'remote.json');
export const auditFile = () => path.join(dir(), 'remote-audit.jsonl');

// Tailscale hands out addresses from the CGNAT range 100.64.0.0/10.
export const isTailscaleIp = (ip: string) => {
  const [a, b] = ip.split('.').map(Number);
  return a === 100 && b >= 64 && b <= 127;
};

export function tailscaleIp(): string | undefined {
  for (const list of Object.values(os.networkInterfaces())) {
    const hit = list?.find(i => i.family === 'IPv4' && !i.internal && isTailscaleIp(i.address));
    if (hit) return hit.address;
  }
}

// Commands that can destroy work or leak it. A match makes the phone ask twice before approving.
const DANGER_RE = [
  /\brm\s+(-\w*[rf]\w*\s+)+/, /\bgit\s+push\b.*(--force|\s-f\b)/, /\bgit\s+reset\s+--hard/, /\bgit\s+clean\s+-\w*f/,
  /\bdrop\s+(table|database|schema)\b/i, /\btruncate\s+table\b/i, /\b(curl|wget)\b[^|\n]*\|\s*(ba|z)?sh\b/,
  /\bsudo\b/, /\bchmod\s+(-R\s+)?777\b/, /\bmkfs\b/, /\bdd\s+if=/, /\bkubectl\s+delete\b/, /\bterraform\s+(destroy|apply)\b/,
  /\b(npm|pnpm|yarn)\s+publish\b/, /\bdeploy\b/i, /\.env\b/, /\bssh\s/
];
export const riskOf = (text: string): 'danger' | 'normal' => DANGER_RE.some(r => r.test(text)) ? 'danger' : 'normal';

// Saying no is always safe, so it never needs the second tap.
export const isRefusal = (label: string) => /^no\b/i.test(label.trim());

// Identifies the prompt the phone was shown, so a late tap cannot approve a newer, different prompt.
export const promptSig = (text: string) => crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);

export function sessionView(s: RemoteSession, projects: ProjectItem[]) {
  const text = stripAnsi(s.buf.slice(-12000)).slice(-4000);
  const waiting = s.status === 'waiting';
  const prompt = waiting ? text.slice(-1500) : '';
  return {
    id: s.id,
    project: projects.find(p => p.path === s.cwd)?.name || path.basename(s.cwd),
    status: s.status,
    tail: text.slice(-2500),
    choices: waiting ? parseChoices(text) : [],
    risk: waiting ? riskOf(prompt) : 'normal',
    sig: waiting ? promptSig(prompt) : ''
  };
}

export function remoteToken(reset = false): string {
  if (!reset) {
    try { const t = JSON.parse(fs.readFileSync(remoteFile(), 'utf-8')).token; if (typeof t === 'string' && t.length >= 32) return t; } catch {}
  }
  const token = crypto.randomBytes(24).toString('hex');
  fs.mkdirSync(dir(), { recursive: true });
  fs.writeFileSync(remoteFile(), JSON.stringify({ token }), { mode: 0o600 });
  fs.chmodSync(remoteFile(), 0o600);
  return token;
}

const tokenOk = (header: string | undefined, token: string) => {
  const a = Buffer.from(header || ''), b = Buffer.from(`Bearer ${token}`);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

// A page on some other site that resolves its own name to this IP still sends its own Host; refusing it blocks DNS rebinding.
export const hostOk = (host: string | undefined, ip: string, port: number) =>
  !!host && (host === `${ip}:${port}` || (host.endsWith(`:${port}`) && host.slice(0, -`:${port}`.length).endsWith('.ts.net')));

function audit(ip: string | undefined, action: string, project: string, detail: string) {
  try { fs.appendFileSync(auditFile(), JSON.stringify({ t: new Date().toISOString(), from: ip, action, project, detail: detail.slice(0, 500) }) + '\n', { mode: 0o600 }); } catch {}
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export function startRemoteServer(deps: RemoteDeps, ip = tailscaleIp(), port = REMOTE_PORT): Promise<{ server: http.Server; url: string } | { error: string }> {
  if (!ip) return Promise.resolve({ error: 'Tailscale is not running on this computer. Install it from tailscale.com, sign in, then turn this on again.' });
  const token = remoteToken();

  const server = http.createServer(async (req, res) => {
    const send = (code: number, body: unknown) => {
      res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    if (!hostOk(req.headers.host, ip, (server.address() as any).port)) return send(421, { error: 'wrong host' });
    const url = new URL(req.url || '/', `http://${ip}`);

    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'"
      });
      return res.end(REMOTE_PAGE);
    }
    if (!tokenOk(req.headers.authorization, token)) return send(401, { error: 'unauthorized' });

    let body: any = {};
    if (req.method === 'POST') {
      let raw = '';
      for await (const chunk of req) { raw += chunk; if (raw.length > 20_000) return send(413, { error: 'too large' }); }
      try { body = raw ? JSON.parse(raw) : {}; } catch { return send(400, { error: 'bad json' }); }
    }
    const projects = deps.listProjects();
    const views = deps.sessions().map(s => sessionView(s, projects));
    const order = { waiting: 0, running: 1, idle: 2 };
    const from = req.socket.remoteAddress;

    try {
      const route = `${req.method} ${url.pathname}`;
      if (route === 'GET /api/sessions') return send(200, views.sort((a, b) => order[a.status] - order[b.status]));
      if (route === 'GET /api/projects') {
        const open = new Set(deps.sessions().map(s => s.cwd));
        return send(200, projects.filter(p => !open.has(p.path))
          .sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || (b.lastLaunched || 0) - (a.lastLaunched || 0))
          .map(p => ({ id: p.id, name: p.name })));
      }
      if (route === 'POST /api/open') {
        const p = projects.find(x => x.id === String(body.project));
        if (!p) return send(404, { error: 'project not found' });
        await deps.openTab(p.id);
        audit(from, 'open', p.name, '');
        return send(200, { ok: true });
      }

      const v = views.find(x => x.id === String(body.id));
      if (!v) return send(404, { error: 'session not found' });

      if (route === 'POST /api/send') {
        const text = String(body.text || '').replace(/\r?\n/g, ' ').trim();
        if (!text) return send(400, { error: 'text required' });
        deps.write(v.id, text);
        // Enter separately, or agent TUIs treat it as part of a paste.
        await sleep(150);
        deps.write(v.id, '\r');
        audit(from, 'send', v.project, text);
        return send(200, { ok: true });
      }
      if (route === 'POST /api/choose') {
        if (v.status !== 'waiting' || v.sig !== body.sig) return send(409, { error: 'The prompt changed. Look at it again.' });
        const c = v.choices.find(x => x.key === body.key);
        if (!c) return send(400, { error: 'unknown choice' });
        if (v.risk === 'danger' && !isRefusal(c.label) && body.confirm !== true) return send(428, { error: 'confirm' });
        deps.write(v.id, c.key);
        audit(from, 'choose', v.project, `${c.label} | ${v.tail.slice(-300)}`);
        return send(200, { ok: true });
      }
      if (route === 'POST /api/stop') {
        deps.write(v.id, '\x1b'); // Esc interrupts Claude Code, Codex and Gemini CLI
        audit(from, 'stop', v.project, '');
        return send(200, { ok: true });
      }
      return send(404, { error: 'unknown route' });
    } catch (err: any) {
      return send(500, { error: err.message });
    }
  });

  return new Promise(resolve => {
    server.once('error', (err: any) => resolve({ error: err.code === 'EADDRINUSE' ? `Port ${port} is in use by another app.` : err.message }));
    server.listen(port, ip, () => resolve({ server, url: `http://${ip}:${(server.address() as any).port}/#t=${token}` }));
  });
}
