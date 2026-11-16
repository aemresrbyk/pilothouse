// Pilothouse server: the remote half of Pilothouse without the desktop window, for a Linux box, a VPS or a Mac
// mini. Agents run in terminals here; you watch and answer them from usepilothouse.com/app or the iPhone app,
// through the same end-to-end encrypted relay (or Tailscale). Same API and modules as the desktop app.
//
//   pilothouse-server ~/code/api ~/code/web          projects to offer (folders); default: the current folder
//   PILOTHOUSE_AGENT=codex pilothouse-server …       agent tabs open with (claude, codex, gemini, opencode, agy)
//
// Press Enter for a new pairing link + QR code (each works once, for 10 minutes). Ctrl+C stops everything.
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import readline from 'readline';
import { createRequire } from 'module';
import * as pty from 'node-pty';
import QRCode from 'qrcode';
import { remoteApi, startRemoteServer, webPairingLink, pairingLink, pushTargets, forgetPushTokens, activityTargets, forgetActivityTokens, webPushTargets, forgetWebPush, vapidKeys, sessionView, audit, RemoteDeps } from '../electron/remote';
import { startRelayLink } from '../electron/relayLink';
import { Screen } from '../electron/screen';
import { newActivity, noteOutput, nextStatus, Activity } from '../electron/activity';
import { stripAnsi } from '../electron/control';
import { agentOfCommand, withClaudeStatus, ensureClaudeStatusHook } from '../electron/usage';
import { sendPush, sendWebPush, sendActivity } from '../electron/push';
import { agentById, buildAgentCommand, ProjectItem, PtyStatus } from '../src/types';

const OUTPUT_KEEP = 60_000;

// npm can unpack node-pty's spawn helper without the execute bit, and then every spawn fails ("posix_spawnp").
try {
  const dir = path.join(path.dirname(createRequire(import.meta.url).resolve('node-pty/package.json')), 'prebuilds');
  for (const x of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    const f = path.join(dir, x, 'spawn-helper');
    if (fs.existsSync(f)) fs.chmodSync(f, 0o755);
  }
} catch {}
const COLS = 120, ROWS = 36;

// Projects: folders on the command line (or the current one). Ids are stable per path.
const projects: ProjectItem[] = (process.argv.slice(2).length ? process.argv.slice(2) : [process.cwd()])
  .map((p) => path.resolve(p.replace(/^~(?=$|\/)/, os.homedir())))
  .filter((p, i, all) => {
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return all.indexOf(p) === i;
    console.error(`Skipping ${p}: not a folder`);
    return false;
  })
  .map((p) => ({ id: crypto.createHash('sha256').update(p).digest('hex').slice(0, 12), name: path.basename(p), path: p, agent: process.env.PILOTHOUSE_AGENT } as ProjectItem));
if (!projects.length) { console.error('No project folders to offer.'); process.exit(1); }

interface Tab { p: pty.IPty; cwd: string; buf: string; act: Activity; agent?: string; screen: Screen; limited?: boolean }
const tabs = new Map<string, Tab>();
const shell = process.env.SHELL || '/bin/bash';

function open(projectId: string, command?: string): Promise<string> {
  const project = projects.find((p) => p.id === projectId);
  if (!project) return Promise.reject(new Error('project not found'));
  const agent = agentById(project.agent);
  const cmd = command || buildAgentCommand(agent, agent.command, [], undefined);
  const id = `srv-${crypto.randomBytes(4).toString('hex')}`;
  const agentId = agentOfCommand(cmd);
  const run = agentId === 'claude' ? withClaudeStatus(cmd) : cmd;
  const p = pty.spawn(shell, ['-l', '-i', '-c', `${run}; exec "${shell}" -l`], { name: 'xterm-256color', cols: COLS, rows: ROWS, cwd: project.path, env: { ...process.env, PATH: [`${os.homedir()}/.local/bin`, '/opt/homebrew/bin', '/usr/local/bin', process.env.PATH || ''].join(path.delimiter), TERM: 'xterm-256color', COLORTERM: 'truecolor' } as Record<string, string> });
  const tab: Tab = { p, cwd: project.path, buf: '', act: newActivity(Date.now()), agent: agentId, screen: new Screen(COLS, ROWS) };
  tabs.set(id, tab);
  p.onData((d) => { tab.buf = (tab.buf + d).slice(-OUTPUT_KEEP); tab.screen.write(d); noteOutput(tab.act, Date.now()); });
  p.onExit(() => { tabs.delete(id); tab.screen.dispose(); console.log(`${project.name}: tab closed`); });
  console.log(`${project.name}: opened ${agent.name}`);
  return Promise.resolve(id);
}

const deps: RemoteDeps = {
  listProjects: () => projects,
  sessions: () => [...tabs.entries()].map(([id, t]) => ({ id, cwd: t.cwd, status: t.act.status, buf: t.buf, agent: t.agent, limited: t.limited })),
  write: (id, data) => { const t = tabs.get(id); if (!t) return false; t.act.lastInput = Date.now(); t.p.write(data); return true; },
  screen: (id) => tabs.get(id)?.screen.snapshot() ?? null,
  openTab: (projectId) => open(projectId).catch((err) => { console.error(`Could not open a tab: ${err.message}`); throw err; }),
  resume: (projectId, agentId, sessionId) => {
    const agent = agentById(agentId);
    return open(projectId, buildAgentCommand(agent, agent.command, [], undefined, sessionId));
  }
};

// Status every second, as the desktop does; a tab that needs you (or finished) pushes to paired phones/browsers.
let lastActivity = '';
setInterval(() => {
  const now = Date.now();
  const counts = [...tabs.values()].map((t) => t.act.status);
  const state = { needsYou: counts.filter((s) => s === 'waiting').length, working: counts.filter((s) => s === 'running').length };
  if (JSON.stringify(state) !== lastActivity) {
    lastActivity = JSON.stringify(state);
    const targets = activityTargets();
    if (targets.length) sendActivity(targets, state, state.needsYou + state.working === 0).then(forgetActivityTokens).catch(() => {});
  }
  for (const [id, t] of tabs) {
    const tail = stripAnsi(t.buf.slice(-2000)).slice(-600);
    const status: PtyStatus = nextStatus(t.act, now, tail);
    if (status === t.act.status) continue;
    const prev = t.act.status;
    t.act.status = status;
    if (status !== 'waiting' && !(status === 'idle' && prev === 'running' && t.act.lastInput)) continue;
    const v = sessionView({ id, cwd: t.cwd, status, buf: t.buf }, projects);
    const msg = status === 'waiting'
      ? { title: v.project, body: v.summary || 'Needs your approval', category: v.choices.length >= 2 ? (v.risk === 'danger' ? 'APPROVAL_RISKY' : 'APPROVAL') : undefined, data: { sid: id, sig: v.sig } }
      : { title: v.project, body: 'Finished. Your turn.', data: { sid: id } };
    const apns = pushTargets(), web = webPushTargets();
    if (apns.length) sendPush(apns, msg).then(forgetPushTokens).catch(() => {});
    if (web.length) sendWebPush(vapidKeys(), web, msg).then(forgetWebPush).catch(() => {});
  }
}, 1000);

async function showPairing() {
  const link = webPairingLink();
  console.log('\nPair a browser or the iPhone app (works once, for 10 minutes):\n');
  console.log(await QRCode.toString(link, { type: 'terminal', small: true }));
  console.log(link + '\n\nPress Enter for a new code. Ctrl+C stops the server and its agents.\n');
}

(async () => {
  try { ensureClaudeStatusHook(); } catch {}
  const relay = startRelayLink(remoteApi(deps));
  const ts = await startRemoteServer(deps);
  console.log(`Pilothouse server · ${projects.length} project(s): ${projects.map((p) => p.name).join(', ')}`);
  console.log('url' in ts ? `Tailscale: ${pairingLink(ts.url).replace(/#p=.*/, '')} (also reachable over your tailnet)` : 'Tailscale: off (not needed, the relay works without it)');
  setTimeout(() => console.log(relay.status() ? 'Relay: connected (relay.usepilothouse.com)' : 'Relay: connecting…'), 3000);
  await showPairing();
  audit('server', 'start', '', projects.map((p) => p.name).join(', '));
  readline.createInterface({ input: process.stdin }).on('line', () => { showPairing(); });
  const stop = () => { for (const t of tabs.values()) t.p.kill(); relay.stop(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
})();
