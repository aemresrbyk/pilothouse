// Phone remote: a JSON API (plus a small web page) so a phone can see every agent tab across projects and agents,
// answer approval prompts, send messages, read diffs and open projects. Listens only on this computer's Tailscale
// address: traffic is WireGuard-encrypted and reachable only from your own tailnet devices. Never on the LAN, where
// plain HTTP could be sniffed. Each phone pairs once (QR code) and gets its own revocable token. Every remote
// action is appended to ~/.pilothouse/remote-audit.jsonl.
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { stripAnsi, pasteText } from './control';
import { parseChoices, Choice } from '../src/utils/inbox';
import type { ProjectItem, PtyStatus } from '../src/types';
import { REMOTE_PAGE } from './remotePage';
import { REMOTE_ICON_PNG } from './remoteIcon';
import { claudeUsage, codexUsage, projectTodos, AgentUsage } from './usage';
import { AGENTS } from '../src/types';
import { recentSessions, readTranscript, getProjectSessions, getCodexSessions } from './scanner';

// agent: AGENTS id from the tab's command; limited: the tab printed a usage-limit message.
export interface RemoteSession { id: string; cwd: string; status: PtyStatus; buf: string; agent?: string; limited?: boolean }
export interface RemoteDeps {
  listProjects: () => ProjectItem[];
  sessions: () => RemoteSession[];
  write: (id: string, data: string) => boolean;
  // Opens the project's default agent in a new tab, as clicking it in the app would.
  openTab: (projectId: string) => Promise<string>;
  // Opens a tab that resumes an agent conversation (claude --resume <id>, codex resume <id>).
  resume: (projectId: string, agentId: string, sessionId: string) => Promise<string>;
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

// Commands that can destroy work or leak it. A match makes the phone ask twice and blocks auto-approval.
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

// The few lines above the options: what the agent wants to do. Used for notification text.
export function promptSummary(text: string): string {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const firstOption = lines.findIndex(l => /^[\s│┃|❯›>●○*•]*1[.)]\s/.test(l));
  const above = (firstOption > 0 ? lines.slice(0, firstOption) : lines).slice(-4);
  return above.join(' · ').replace(/\s+/g, ' ').slice(0, 180);
}

// TUI chrome that is not the agent talking: hints, scroll markers, borders, the prompt line.
// Spinner lines (✻ Thinking… (3s · …), ✻ Baked for 3s) and plugin status bars count as chrome too.
// Also leftovers of the spinner animation: single letters with spaces ("o n", "r v") and stray "thinking" fragments.
const CHROME_RE = /bypass permissions|shift\+tab|for shortcuts|esc to interrupt|ctrl\+|for agents|^\W*\d+ more\W*$|^[\s\W]{0,3}$|^[─━│┃╭╮╰╯>›❯↓↑\s\-=_*·.]+$|^[✻✶✳✢✽·*+]\s|…\s*\(|\$\d+\.\d\d|\btokens\b|\bhooks…|^(\S\s+){1,4}\S?$|thinking\)?$|^\(?\d+s\b/i;

// The terminal text without TUI chrome, for reading on a small screen.
export function cleanTail(text: string): string {
  return text.split('\n').map(l => l.trimEnd()).filter(l => !l.trim() || !CHROME_RE.test(l.trim())).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// One line for the list: the agent's last message (Claude marks them with ⏺/●), else the last real line.
export function previewOf(text: string): string {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l && !CHROME_RE.test(l)).slice(-40);
  let at = -1;
  for (let i = lines.length - 1; i >= 0 && at < 0; i--) if (/^[⏺●•]/.test(lines[i])) at = i;
  if (at < 0) return (lines[lines.length - 1] || '').slice(0, 160);
  // A bullet on its own line: the message text follows it.
  const said = lines[at].replace(/^[⏺●•]\s*/, '') || lines[at + 1] || '';
  return said.slice(0, 160);
}

export function sessionView(s: RemoteSession, projects: ProjectItem[]) {
  const text = stripAnsi(s.buf.slice(-12000)).slice(-4000);
  const waiting = s.status === 'waiting';
  const prompt = waiting ? text.slice(-1500) : '';
  const p = projects.find(x => x.path === s.cwd);
  return {
    id: s.id,
    project: p?.name || path.basename(s.cwd),
    projectId: p?.id || '',
    agent: AGENTS.find(a => a.id === s.agent)?.name || 'Terminal',
    status: s.status,
    tail: cleanTail(text).slice(-2500),
    choices: waiting ? parseChoices(text) : [],
    risk: waiting ? riskOf(prompt) : 'normal',
    sig: waiting ? promptSig(prompt) : '',
    summary: waiting ? promptSummary(prompt) : '',
    preview: previewOf(text)
  };
}
export type SessionView = ReturnType<typeof sessionView>;

// Auto-approval rules (Settings): plain phrases; if one appears in a prompt that is not risky, pick its first option.
// shortcut: matches the terminal text near the prompt, so a phrase that also appears in the agent's own output can
// match; the risky-command guard and the audit log bound the damage. Upgrade to agent hooks for exact tool names.
export function autoChoice(v: SessionView, rules: string[]): Choice | null {
  if (v.status !== 'waiting' || v.risk === 'danger' || v.choices.length < 2 || isRefusal(v.choices[0].label)) return null;
  const prompt = v.tail.slice(-800).toLowerCase();
  return rules.some(r => r.trim() && prompt.includes(r.trim().toLowerCase())) ? v.choices[0] : null;
}

// ---- Paired devices ----

// pushKey: AES-256 key shared with the phone, so notification text is end-to-end encrypted through the relay.
interface Device { id: string; name: string; hash: string; created: number; lastSeen?: number; apns?: string; sandbox?: boolean; pushKey?: string }
// pairAt: when the pairing code was made. A code works once and for PAIR_TTL, so an old screenshot of the QR is useless.
interface RemoteState { pair: string; pairAt?: number; devices: Device[] }
export const PAIR_TTL = 10 * 60_000;
export interface DeviceInfo { id: string; name: string; created: number; lastSeen?: number; push: boolean }

const hashOf = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

function saveState(s: RemoteState) {
  fs.mkdirSync(dir(), { recursive: true });
  fs.writeFileSync(remoteFile(), JSON.stringify(s), { mode: 0o600 });
  fs.chmodSync(remoteFile(), 0o600);
}

export function remoteState(): RemoteState {
  try {
    const s = JSON.parse(fs.readFileSync(remoteFile(), 'utf-8'));
    if (typeof s.pair === 'string' && Array.isArray(s.devices)) return s;
  } catch {}
  // First run, or the v1.4.0 single-token file: start over; old links must pair again.
  const s: RemoteState = { pair: newCode(), pairAt: Date.now(), devices: [] };
  saveState(s);
  return s;
}

const newCode = () => crypto.randomBytes(24).toString('hex');
const pairExpired = (s: RemoteState, now = Date.now()) => !s.pairAt || now - s.pairAt > PAIR_TTL;

// Shown as the QR in Settings; an expired code is replaced on the spot.
export function pairingLink(base: string) {
  const s = remoteState();
  if (pairExpired(s)) resetPairCode();
  return `${base}#p=${remoteState().pair}`;
}

// New pairing code: the old QR stops working. Phones already paired stay paired.
export function resetPairCode() { const s = remoteState(); s.pair = newCode(); s.pairAt = Date.now(); saveState(s); }

export function revokeDevice(id: string) { const s = remoteState(); s.devices = s.devices.filter(d => d.id !== id); saveState(s); }

export const listDevices = (): DeviceInfo[] =>
  remoteState().devices.map(d => ({ id: d.id, name: d.name, created: d.created, lastSeen: d.lastSeen, push: !!d.apns }));

export const pushTargets = () => remoteState().devices.filter(d => d.apns).map(d => ({ token: d.apns!, sandbox: d.sandbox, key: d.pushKey }));

export function forgetPushTokens(tokens: string[]) {
  if (!tokens.length) return;
  const s = remoteState();
  for (const d of s.devices) if (d.apns && tokens.includes(d.apns)) delete d.apns;
  saveState(s);
}

function deviceFor(header: string | undefined): Device | undefined {
  const m = /^Bearer ([0-9a-f]{48})$/.exec(header || '');
  if (!m) return;
  const h = hashOf(m[1]);
  return remoteState().devices.find(d => d.hash === h);
}

const secretOk = (given: unknown, secret: string) => {
  const a = Buffer.from(String(given || '')), b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

// A page on some other site that resolves its own name to this IP still sends its own Host; refusing it blocks DNS rebinding.
export const hostOk = (host: string | undefined, ip: string, port: number) =>
  !!host && (host === `${ip}:${port}` || (host.endsWith(`:${port}`) && host.slice(0, -`:${port}`.length).endsWith('.ts.net')));

export function audit(from: string | undefined, action: string, project: string, detail: string) {
  try { fs.appendFileSync(auditFile(), JSON.stringify({ t: new Date().toISOString(), from, action, project, detail: detail.slice(0, 500) }) + '\n', { mode: 0o600 }); } catch {}
}

const git = (cwd: string, args: string[]) => new Promise<string>(resolve =>
  execFile('git', args, { cwd, timeout: 8000, maxBuffer: 4_000_000 }, (err, out) => resolve(err ? '' : out)));

// Uncommitted changes of the session's folder, for reviewing an agent's work before approving the next step.
export async function projectDiff(cwd: string) {
  const [stat, diff, untracked] = await Promise.all([
    git(cwd, ['diff', 'HEAD', '--stat']),
    git(cwd, ['diff', 'HEAD', '--no-color', '--no-ext-diff']),
    git(cwd, ['ls-files', '--others', '--exclude-standard'])
  ]);
  return { stat, diff: diff.length > 200_000 ? diff.slice(0, 200_000) + '\n… (cut, open it on the computer)' : diff, untracked: untracked.split('\n').filter(Boolean).slice(0, 100) };
}

const MANIFEST = JSON.stringify({
  name: 'Pilothouse', short_name: 'Pilothouse', start_url: '/', display: 'standalone',
  background_color: '#0B0D10', theme_color: '#0B0D10', icons: [{ src: '/icon.png', sizes: '512x512', type: 'image/png' }]
});

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Resolves to the base URL; pairingLink(url) adds the current pairing code for the QR.
export function startRemoteServer(deps: RemoteDeps, ip = tailscaleIp(), port = REMOTE_PORT): Promise<{ server: http.Server; url: string } | { error: string }> {
  if (!ip) return Promise.resolve({ error: 'Tailscale is not running on this computer. Install it from tailscale.com, sign in, then turn this on again.' });
  remoteState();

  const server = http.createServer(async (req, res) => {
    const send = (code: number, body: unknown) => {
      res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    if (!hostOk(req.headers.host, ip, (server.address() as any).port)) return send(421, { error: 'wrong host' });
    const url = new URL(req.url || '/', `http://${ip}`);
    const route = `${req.method} ${url.pathname}`;
    const from = req.socket.remoteAddress;

    if (route === 'GET /') {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self'; manifest-src 'self'; frame-ancestors 'none'"
      });
      return res.end(REMOTE_PAGE);
    }
    if (route === 'GET /icon.png') { res.writeHead(200, { 'Content-Type': 'image/png' }); return res.end(REMOTE_ICON_PNG); }
    if (route === 'GET /manifest.json') { res.writeHead(200, { 'Content-Type': 'application/manifest+json' }); return res.end(MANIFEST); }

    let body: any = {};
    if (req.method === 'POST') {
      let raw = '';
      for await (const chunk of req) { raw += chunk; if (raw.length > 20_000) return send(413, { error: 'too large' }); }
      try { body = raw ? JSON.parse(raw) : {}; } catch { return send(400, { error: 'bad json' }); }
    }

    // Pairing: the QR code's one secret buys each phone its own token. Only the hash is stored.
    if (route === 'POST /api/pair') {
      const s = remoteState();
      if (pairExpired(s) || !secretOk(body.secret, s.pair)) { audit(from, 'pair-refused', '', ''); return send(401, { error: 'This code is no longer valid. Scan the new one in Pilothouse Settings.' }); }
      const token = crypto.randomBytes(24).toString('hex');
      const device: Device = { id: crypto.randomBytes(6).toString('hex'), name: String(body.name || 'Phone').slice(0, 60), hash: hashOf(token), created: Date.now() };
      s.devices.push(device);
      // One code, one device: the next phone needs the fresh QR from Settings.
      s.pair = newCode(); s.pairAt = Date.now();
      saveState(s);
      audit(from, 'pair', '', device.name);
      return send(200, { token, device: device.id });
    }

    const device = deviceFor(req.headers.authorization);
    if (!device) return send(401, { error: 'unauthorized' });
    if (!device.lastSeen || Date.now() - device.lastSeen > 60_000) {
      const s = remoteState();
      const d = s.devices.find(x => x.id === device.id);
      if (d) { d.lastSeen = Date.now(); saveState(s); }
    }
    const who = `${from} ${device.name}`;

    const projects = deps.listProjects();
    const views = deps.sessions().map(s => sessionView(s, projects));
    const order = { waiting: 0, running: 1, idle: 2 };

    try {
      if (route === 'GET /api/sessions') return send(200, views.sort((a, b) => order[a.status] - order[b.status]));
      if (route === 'GET /api/projects') {
        const open = new Set(deps.sessions().map(s => s.cwd));
        return send(200, projects.filter(p => !open.has(p.path))
          .sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || (b.lastLaunched || 0) - (a.lastLaunched || 0))
          .map(p => ({ id: p.id, name: p.name })));
      }
      if (route === 'GET /api/usage') {
        const open = deps.sessions();
        const limited = (id: string) => open.some(s => s.agent === id && s.limited);
        const out: AgentUsage[] = [
          claudeUsage() || { agent: 'Claude Code', windows: [], note: 'Shows up after a Claude tab opened from Pilothouse has run once.' },
          codexUsage() || { agent: 'Codex', windows: [], note: 'No Codex sessions on this computer yet.' }
        ];
        if (limited('claude')) out[0].note = 'Limit reached in an open tab.';
        if (limited('codex')) out[1].note = 'Limit reached in an open tab.';
        for (const a of AGENTS.filter(a => a.id !== 'claude' && a.id !== 'codex' && open.some(s => s.agent === a.id))) {
          out.push({ agent: a.name, windows: [], note: limited(a.id) ? 'Limit reached in an open tab.' : 'This CLI does not report its limits; Pilothouse warns when a tab hits one.' });
        }
        return send(200, out);
      }
      // Claude Code / Codex conversations from any terminal, including ones Pilothouse did not start.
      if (route === 'GET /api/conversations') {
        const now = Date.now();
        return send(200, recentSessions(now - 3 * 86_400_000).map(c => {
          const p = projects.find(x => x.path === c.cwd);
          return {
            key: `${c.agent}:${c.id}`,
            agent: AGENTS.find(a => a.id === c.agent)?.name || c.agent,
            project: p?.name || path.basename(c.cwd),
            projectId: p?.id || '',
            title: (c.title || '').slice(0, 140),
            updatedAt: c.modifiedAt,
            live: now - c.modifiedAt < 90_000
          };
        }));
      }
      const conversation = () => {
        const [agent, id] = String(url.searchParams.get('key') ?? body.key ?? '').split(':');
        return recentSessions(Date.now() - 30 * 86_400_000, undefined, 300).find(c => c.agent === agent && c.id === id);
      };
      if (route === 'GET /api/conversation') {
        const c = conversation();
        if (!c) return send(404, { error: 'conversation not found' });
        // shortcut: parses the whole transcript on every poll; cache by mtime if long sessions get slow.
        const messages = readTranscript(c.file!).slice(-80).map(m => ({ ...m, text: m.text.length > 6000 ? m.text.slice(0, 6000) + ' …' : m.text }));
        return send(200, { messages, live: Date.now() - c.modifiedAt < 90_000 });
      }
      if (route === 'POST /api/resume') {
        const c = conversation();
        if (!c) return send(404, { error: 'conversation not found' });
        const p = projects.find(x => x.path === c.cwd);
        if (!p) return send(400, { error: 'Add this folder to Pilothouse first, then you can continue it here.' });
        await deps.resume(p.id, c.agent || 'claude', c.id);
        audit(who, 'resume', p.name, c.id);
        return send(200, { ok: true });
      }
      if (route === 'GET /api/todos') {
        const p = projects.find(x => x.id === url.searchParams.get('project'));
        if (!p) return send(404, { error: 'project not found' });
        return send(200, { project: p.name, items: await projectTodos(p.path) });
      }
      if (route === 'POST /api/open') {
        const p = projects.find(x => x.id === String(body.project));
        if (!p) return send(404, { error: 'project not found' });
        await deps.openTab(p.id);
        audit(who, 'open', p.name, '');
        return send(200, { ok: true });
      }
      // The phone hands over its APNs token so this computer can push "needs you" notifications.
      if (route === 'POST /api/push-token') {
        const token = String(body.token || '');
        if (!/^[0-9a-f]{64,200}$/i.test(token)) return send(400, { error: 'bad token' });
        const s = remoteState();
        const d = s.devices.find(x => x.id === device.id);
        if (!d) return send(404, { error: 'device not found' });
        d.apns = token;
        d.sandbox = body.sandbox === true;
        d.pushKey ||= crypto.randomBytes(32).toString('base64');
        saveState(s);
        return send(200, { ok: true, pushKey: d.pushKey });
      }
      if (route === 'POST /api/unpair') {
        revokeDevice(device.id);
        audit(who, 'unpair', '', '');
        return send(200, { ok: true });
      }

      const v = views.find(x => x.id === String(body.id ?? url.searchParams.get('id')));
      if (!v) return send(404, { error: 'session not found' });

      // The conversation behind a Claude Code / Codex tab, read from the agent's own transcript: far easier to
      // follow on a phone than the terminal. 404 for other agents, so the app shows the terminal instead.
      if (route === 'GET /api/tab-chat') {
        const s = deps.sessions().find(x => x.id === v.id)!;
        const file = s.agent === 'claude' ? getProjectSessions(s.cwd)[0]?.file : s.agent === 'codex' ? getCodexSessions(s.cwd)[0]?.file : undefined;
        if (!file) return send(404, { error: 'no transcript for this tab' });
        const messages = readTranscript(file).slice(-60).map(m => ({ ...m, text: m.text.length > 6000 ? m.text.slice(0, 6000) + ' …' : m.text }));
        return send(200, { messages, live: v.status === 'running' });
      }
      if (route === 'GET /api/diff') {
        const s = deps.sessions().find(x => x.id === v.id)!;
        return send(200, { project: v.project, ...(await projectDiff(s.cwd)) });
      }
      if (route === 'POST /api/send') {
        const text = String(body.text || '').trim();
        if (!text) return send(400, { error: 'text required' });
        const raw = deps.sessions().find(x => x.id === v.id)!;
        deps.write(v.id, pasteText(raw.buf, text, !!raw.agent));
        // Enter separately, or agent TUIs treat it as part of a paste.
        await sleep(150);
        deps.write(v.id, '\r');
        audit(who, 'send', v.project, text);
        return send(200, { ok: true });
      }
      if (route === 'POST /api/choose') {
        if (v.status !== 'waiting' || v.sig !== body.sig) return send(409, { error: 'The prompt changed. Look at it again.' });
        const c = v.choices.find(x => x.key === body.key);
        if (!c) return send(400, { error: 'unknown choice' });
        if (v.risk === 'danger' && !isRefusal(c.label) && body.confirm !== true) return send(428, { error: 'confirm' });
        deps.write(v.id, c.key);
        audit(who, 'choose', v.project, `${c.label} | ${v.tail.slice(-300)}`);
        return send(200, { ok: true });
      }
      if (route === 'POST /api/stop') {
        deps.write(v.id, '\x1b'); // Esc interrupts Claude Code, Codex and Gemini CLI
        audit(who, 'stop', v.project, '');
        return send(200, { ok: true });
      }
      return send(404, { error: 'unknown route' });
    } catch (err: any) {
      return send(500, { error: err.message });
    }
  });

  return new Promise(resolve => {
    server.once('error', (err: any) => resolve({ error: err.code === 'EADDRINUSE' ? `Port ${port} is in use by another app.` : err.message }));
    server.listen(port, ip, () => resolve({ server, url: `http://${ip}:${(server.address() as any).port}/` }));
  });
}
