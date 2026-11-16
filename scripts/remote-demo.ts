// Local try-out of the phone/web remote without Tailscale: one real shell tab on 127.0.0.1.
// Run (node-pty is built for Electron, so it runs on Electron's Node):
//   bun build scripts/remote-demo.ts --target node --external node-pty --outfile scripts/.demo.mjs && ELECTRON_RUN_AS_NODE=1 npx electron scripts/.demo.mjs
// then open the printed link in a browser.
import os from 'os';
import fs from 'fs';
import path from 'path';
import * as pty from 'node-pty';
import { startRemoteServer, pairingLink } from '../electron/remote';
import { Screen } from '../electron/screen';

process.env.PILOTHOUSE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ph-demo-'));
const shell = process.env.SHELL || '/bin/zsh';
const p = pty.spawn(shell, ['-l'], { name: 'xterm-256color', cols: 100, rows: 30, cwd: process.cwd(), env: process.env as Record<string, string> });
let buf = '';
const screen = new Screen(100, 30);
p.onData((d) => { buf = (buf + d).slice(-60_000); screen.write(d); });

const r = await startRemoteServer({
  listProjects: () => [{ id: 'demo', name: path.basename(process.cwd()), path: process.cwd() } as any],
  sessions: () => [{ id: 'demo-tab', cwd: process.cwd(), status: 'idle', buf }],
  write: (_id, d) => { p.write(d); return true; },
  screen: (id) => (id === 'demo-tab' ? screen.snapshot() : null),
  openTab: async () => 'demo-tab',
  resume: async () => 'demo-tab'
}, '127.0.0.1', Number(process.env.PORT) || 4747);
if ('error' in r) throw new Error(r.error);
console.log(pairingLink(r.url));
