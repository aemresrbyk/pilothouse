// Plan usage per agent, read only from what each CLI leaves on this computer. Never calls a provider and never
// touches an agent's login tokens.
//   Codex:       writes rate_limits (used %, reset time) into its session files.
//   Claude Code: hands rate_limits to its status line command only, so Pilothouse adds a silent status line
//                (--settings) to the Claude tabs it starts, which saves that data to ~/.pilothouse.
//   Others:      no local data; Pilothouse only knows when a tab printed a "limit reached" message.
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { AGENTS } from '../src/types';

export interface UsageWindow { label: string; usedPercent: number; resetsAt?: number }
export interface AgentUsage { agent: string; windows: UsageWindow[]; plan?: string; updatedAt?: number; note?: string }

const pilotDir = () => process.env.PILOTHOUSE_DIR || path.join(os.homedir(), '.pilothouse');

// The agent a tab runs, from the first word of its command line (a full path or a quoted one works too).
export function agentOfCommand(cmd: string): string | undefined {
  const first = /^\s*("([^"]+)"|(\S+))/.exec(cmd);
  const bin = path.basename(first?.[2] || first?.[3] || '').replace(/\.(cmd|exe)$/i, '');
  return AGENTS.find(a => a.command === bin)?.id;
}

// Adds Pilothouse's status line settings to a Claude Code command (POSIX shells; $HOME is expanded there).
export function withClaudeStatus(cmd: string): string {
  if (/--settings\b/.test(cmd)) return cmd;
  return cmd.replace(/^\s*("[^"]+"|\S+)/, '$1 --settings "$HOME/.pilothouse/claude-settings.json"');
}

const windowLabel = (minutes: number) => minutes <= 300 ? '5 hours' : minutes <= 10_080 ? 'week' : 'month';

// Epoch seconds, epoch ms or an ISO date → ms.
const toMs = (v: unknown): number | undefined => {
  if (typeof v === 'number') return v < 1e12 ? v * 1000 : v;
  if (typeof v === 'string') { const t = Date.parse(v); return isNaN(t) ? undefined : t; }
};

// A window whose reset time has passed starts again from zero.
const windowOf = (label: string, used: unknown, resets: unknown, now: number): UsageWindow | null => {
  if (typeof used !== 'number') return null;
  const resetsAt = toMs(resets);
  return { label, usedPercent: resetsAt && resetsAt < now ? 0 : Math.round(used), resetsAt };
};

// Writes the silent status line script and the settings file that points Claude Code at it. If the user already
// has a status line of their own, the settings file stays empty so theirs keeps working (no Claude usage then).
export function ensureClaudeStatusHook(claudeHome = path.join(os.homedir(), '.claude')) {
  const dir = pilotDir();
  fs.mkdirSync(dir, { recursive: true });
  const script = path.join(dir, 'claude-statusline.sh');
  fs.writeFileSync(script, '#!/bin/sh\n# Pilothouse: saves Claude Code\'s status line data (plan usage) for the phone. Prints nothing.\nd="$HOME/.pilothouse"\ncat > "$d/claude-status.json.tmp" && mv "$d/claude-status.json.tmp" "$d/claude-status.json"\n', { mode: 0o755 });
  let own = false;
  try { own = !!JSON.parse(fs.readFileSync(path.join(claudeHome, 'settings.json'), 'utf-8')).statusLine; } catch {}
  const settings = own ? {} : { statusLine: { type: 'command', command: 'sh "$HOME/.pilothouse/claude-statusline.sh"' } };
  fs.writeFileSync(path.join(dir, 'claude-settings.json'), JSON.stringify(settings));
}

export function claudeUsage(now = Date.now()): AgentUsage | null {
  const file = path.join(pilotDir(), 'claude-status.json');
  try {
    const rl = JSON.parse(fs.readFileSync(file, 'utf-8')).rate_limits;
    if (!rl) return null;
    const windows = [windowOf('5 hours', rl.five_hour?.used_percentage, rl.five_hour?.resets_at, now), windowOf('week', rl.seven_day?.used_percentage, rl.seven_day?.resets_at, now)]
      .filter((w): w is UsageWindow => !!w);
    return { agent: 'Claude Code', windows, updatedAt: fs.statSync(file).mtimeMs };
  } catch { return null; }
}

// Newest Codex session file: sessions/YYYY/MM/DD/rollout-*.jsonl.
function newestCodexFile(root: string): string | undefined {
  let dir = root;
  for (let depth = 0; depth < 3; depth++) {
    const names = fs.readdirSync(dir).filter(n => /^\d+$/.test(n)).sort();
    if (!names.length) return;
    dir = path.join(dir, names[names.length - 1]);
  }
  const files = fs.readdirSync(dir).filter(n => n.endsWith('.jsonl')).map(n => path.join(dir, n));
  return files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
}

function findKey(o: any, key: string): any {
  if (!o || typeof o !== 'object') return;
  if (key in o) return o[key];
  for (const v of Object.values(o)) { const hit = findKey(v, key); if (hit !== undefined) return hit; }
}

export function codexUsage(codexHome = path.join(os.homedir(), '.codex'), now = Date.now()): AgentUsage | null {
  try {
    const file = newestCodexFile(path.join(codexHome, 'sessions'));
    if (!file) return null;
    const size = fs.statSync(file).size;
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(Math.min(size, 512_000));
    fs.readSync(fd, buf, 0, buf.length, size - buf.length);
    fs.closeSync(fd);
    const lines = buf.toString('utf-8').split('\n').reverse();
    for (const line of lines) {
      if (!line.includes('"rate_limits"')) continue;
      let rl: any;
      try { rl = findKey(JSON.parse(line), 'rate_limits'); } catch { continue; }
      if (!rl) continue;
      const windows = [rl.primary, rl.secondary].filter(Boolean)
        .map((w: any) => windowOf(windowLabel(Number(w.window_minutes) || 300), w.used_percent, w.resets_at, now))
        .filter((w): w is UsageWindow => !!w);
      return { agent: 'Codex', windows, plan: rl.plan_type || undefined, updatedAt: fs.statSync(file).mtimeMs };
    }
  } catch {}
  return null;
}

export interface TodoItem { file: string; line: number; text: string; kind: 'todo' | 'task' }

const gitGrep = (cwd: string, args: string[]) => new Promise<string>(resolve =>
  execFile('git', ['grep', '-n', '-I', ...args], { cwd, timeout: 8000, maxBuffer: 4_000_000 }, (_err, out) => resolve(out || '')));

// TODO / FIXME / HACK / XXX comments and unchecked "- [ ]" boxes in Markdown, from the project's tracked files.
export async function projectTodos(cwd: string, limit = 200): Promise<TodoItem[]> {
  const parse = (out: string, kind: TodoItem['kind']) => out.split('\n').filter(Boolean).map(l => {
    const m = /^(.+?):(\d+):(.*)$/.exec(l);
    return m ? { file: m[1], line: Number(m[2]), text: m[3].trim().slice(0, 200), kind } : null;
  }).filter((x): x is TodoItem => !!x);
  const [code, tasks] = await Promise.all([
    // POSIX ERE has no \b on every git build, so spell the word boundary out.
    gitGrep(cwd, ['-E', '(^|[^A-Za-z0-9_])(TODO|FIXME|HACK|XXX)([^A-Za-z0-9_]|$)']),
    gitGrep(cwd, ['-E', '^\\s*[-*] \\[ \\] ', '--', '*.md'])
  ]);
  return [...parse(tasks, 'task'), ...parse(code, 'todo')].slice(0, limit);
}
