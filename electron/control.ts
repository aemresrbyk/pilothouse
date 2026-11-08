// Local control API so other local tools (the Jarvis voice assistant) can drive Pilothouse:
// list projects, open a project's Claude tab, type into it, read its output, run repo commands.
// Bound to 127.0.0.1 and gated by a random token stored 0600 in ~/.pilothouse/control.json.
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { ProjectItem } from '../src/types';

export interface ControlDeps {
  listProjects: () => ProjectItem[];
  listTerminals: () => Array<{ id: string; cwd: string; alive: boolean }>;
  // Asks the renderer to open/focus a tab; resolves to its tab (= pty) id.
  openTab: (projectId: string, command?: string) => Promise<string>;
  write: (ptyId: string, data: string) => boolean;
  output: (ptyId: string) => string;
  commands: (project: ProjectItem) => unknown;
}

export const CONTROL_FILE = path.join(os.homedir(), '.pilothouse', 'control.json');

const norm = (s: string) => s.toLocaleLowerCase('tr').normalize('NFD').replace(/[^a-z0-9]/g, '');

export function findProject(projects: ProjectItem[], query: string): ProjectItem | undefined {
  const q = query.trim();
  const expanded = q.replace(/^~(?=$|\/)/, os.homedir());
  const exact = projects.find(p => p.id === q || p.path === expanded || p.name === q);
  if (exact) return exact;
  const n = norm(q);
  if (!n) return undefined;
  return projects.find(p => norm(p.name) === n)
    || projects.find(p => norm(p.name).includes(n) || n.includes(norm(p.name)));
}

export function stripAnsi(s: string): string {
  return s
    // TUIs (Claude Code) move the cursor right instead of printing spaces; keep the words apart.
    .replace(/\x1b\[(\d*)C/g, (_m, n) => ' '.repeat(Math.min(Number(n) || 1, 200)))
    // ...or jump to an absolute column (CHA, ESC[nG); the column is unknown here, so one space keeps words apart.
    .replace(/\x1b\[\d*G/g, ' ')
    .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[@-_]/g, '')
    .replace(/\r(?!\n)/g, '\n')
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '')
    .replace(/\n{3,}/g, '\n\n');
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export function startControlServer(deps: ControlDeps, onFocus: () => void): http.Server {
  const token = crypto.randomBytes(24).toString('hex');

  const server = http.createServer(async (req, res) => {
    const send = (code: number, body: unknown) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    // Browsers send Origin; refusing it keeps web pages from poking the API even if they guess the port.
    if (req.headers.origin || req.headers.authorization !== `Bearer ${token}`) return send(401, { error: 'unauthorized' });

    const url = new URL(req.url || '/', 'http://127.0.0.1');
    let body: any = {};
    if (req.method === 'POST') {
      let raw = '';
      for await (const chunk of req) { raw += chunk; if (raw.length > 100_000) return send(413, { error: 'too large' }); }
      try { body = raw ? JSON.parse(raw) : {}; } catch { return send(400, { error: 'bad json' }); }
    }
    const projects = deps.listProjects();
    const needProject = (): ProjectItem | null => {
      const q = String(body.project ?? url.searchParams.get('project') ?? '');
      const p = findProject(projects, q);
      if (!p) { send(404, { error: `project not found: ${q}`, projects: projects.map(x => x.name) }); return null; }
      return p;
    };
    const terminalFor = (p: ProjectItem) => {
      const alive = deps.listTerminals().filter(t => t.alive && t.cwd === p.path);
      return alive[alive.length - 1];
    };

    try {
      const route = `${req.method} ${url.pathname}`;
      if (route === 'GET /status') return send(200, { ok: true, app: 'pilothouse' });
      if (route === 'GET /projects') return send(200, projects.map(p => ({ id: p.id, name: p.name, path: p.path, open: !!terminalFor(p) })));
      if (route === 'GET /terminals') return send(200, deps.listTerminals());

      if (route === 'POST /open') {
        const p = needProject(); if (!p) return;
        onFocus();
        return send(200, { tabId: await deps.openTab(p.id), project: p.name });
      }
      if (route === 'POST /run') {
        const p = needProject(); if (!p) return;
        const command = String(body.command || '').trim();
        if (!command) return send(400, { error: 'command required' });
        onFocus();
        return send(200, { tabId: await deps.openTab(p.id, command), project: p.name });
      }
      if (route === 'GET /commands') {
        const p = needProject(); if (!p) return;
        return send(200, deps.commands(p));
      }
      if (route === 'POST /send') {
        const p = needProject(); if (!p) return;
        const text = String(body.text || '').replace(/\r?\n/g, ' ').trim();
        if (!text) return send(400, { error: 'text required' });
        let t = terminalFor(p);
        if (!t) {
          await deps.openTab(p.id);
          // shortcut: fixed wait for Claude's TUI to boot; replace with a ready-marker check if prompts get lost.
          for (let i = 0; i < 40 && !(t = terminalFor(p)); i++) await sleep(250);
          await sleep(5000);
        }
        if (!t) return send(504, { error: 'terminal did not start' });
        onFocus();
        deps.write(t.id, text);
        // Enter separately, or Claude's TUI treats it as part of a paste.
        await sleep(150);
        deps.write(t.id, '\r');
        return send(200, { ok: true, tabId: t.id, project: p.name });
      }
      if (route === 'GET /output') {
        const p = needProject(); if (!p) return;
        const t = terminalFor(p);
        if (!t) return send(404, { error: 'no open terminal for this project' });
        const chars = Math.min(Number(url.searchParams.get('chars')) || 3000, 20000);
        return send(200, { project: p.name, text: stripAnsi(deps.output(t.id)).slice(-chars) });
      }
      return send(404, { error: 'unknown route' });
    } catch (err: any) {
      return send(500, { error: err.message });
    }
  });

  server.listen(0, '127.0.0.1', () => {
    const addr = server.address();
    if (addr && typeof addr === 'object') {
      fs.mkdirSync(path.dirname(CONTROL_FILE), { recursive: true });
      fs.writeFileSync(CONTROL_FILE, JSON.stringify({ port: addr.port, token, pid: process.pid }), { mode: 0o600 });
      fs.chmodSync(CONTROL_FILE, 0o600);
    }
  });
  return server;
}
