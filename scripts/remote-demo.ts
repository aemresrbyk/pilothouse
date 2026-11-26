// Local try-out of the phone/web remote without Tailscale: one real shell tab on 127.0.0.1.
// Run (node-pty is built for Electron, so it runs on Electron's Node):
//   bun build scripts/remote-demo.ts --target node --external node-pty --outfile scripts/.demo.mjs && ELECTRON_RUN_AS_NODE=1 npx electron scripts/.demo.mjs
// then open the printed link in a browser.
import os from 'os';
import fs from 'fs';
import path from 'path';
import * as pty from 'node-pty';
import { startRemoteServer, pairingLink, remoteApi, webPairingLink } from '../electron/remote';
import { startRelayLink } from '../electron/relayLink';
import { Screen } from '../electron/screen';

process.env.PILOTHOUSE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ph-demo-'));
const shell = process.env.SHELL || '/bin/zsh';
const p = pty.spawn(shell, ['-l'], { name: 'xterm-256color', cols: 100, rows: 30, cwd: process.cwd(), env: process.env as Record<string, string> });
let buf = '';
const screen = new Screen(100, 30);
p.onData((d) => { buf = (buf + d).slice(-60_000); screen.write(d); });

const deps = {
  listProjects: () => [{ id: 'demo', name: path.basename(process.cwd()), path: process.cwd() } as any],
  sessions: () => [{ id: 'demo-tab', cwd: process.cwd(), status: 'idle', buf }],
  write: (_id, d) => { p.write(d); return true; },
  screen: (id) => (id === 'demo-tab' ? screen.snapshot() : null),
  openTab: async () => 'demo-tab',
  resume: async () => 'demo-tab',
  // A pretend debate (no agent CLIs): two turns and a decision written to .pilothouse/debate.md, one every 2 s.
  debate: {
    agents: async () => ['claude', 'codex', 'gemini'],
    running: () => !!debating,
    stop: () => { clearInterval(debating); debating = undefined; },
    start: async (dir: string, topic: string, agents: string[]) => {
      if (!topic.trim() || agents.length < 2) return { error: 'Pick at least two agents and write the question' };
      const parts = [`# Debate: ${topic}`, '## 1. Claude Code\n\nUse a queue.\n\n```ts\nconst q = new Queue();\nq.add(job);\n```\n\nAGREE', '## 2. Codex\n\nAgreed.\n\nAGREE', '---\n\n## Decision\n\nUse a queue.'];
      let i = 0;
      const write = () => { fs.mkdirSync(path.join(dir, '.pilothouse'), { recursive: true }); fs.writeFileSync(path.join(dir, '.pilothouse/debate.md'), parts.slice(0, ++i).join('\n\n')); if (i >= parts.length) deps.debate.stop(); };
      write(); debating = setInterval(write, 2000);
      return { ok: true as const };
    }
  }
};
let debating: NodeJS.Timeout | undefined;
const r = await startRemoteServer(deps, '127.0.0.1', Number(process.env.PORT) || 4747);
if ('error' in r) throw new Error(r.error);
console.log('Tailscale-style page:', pairingLink(r.url));
// The same tab through the web relay: open this on usepilothouse.com/app from any browser.
startRelayLink(remoteApi(deps));
console.log('Web app:', webPairingLink());
