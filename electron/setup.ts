// First-run setup: where each agent CLI lives, and which folders Claude Code / Codex have worked in.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { AGENTS, ProjectItem } from '../src/types';
import { scanClaudeProjects, getProjectSessions, getCodexProjectDirs } from './scanner';

export interface SetupProject {
  path: string;
  name: string;
  known: boolean; // already in Pilothouse's project list
  agent?: string; // its agent, when known
  claude: number; // saved sessions per agent
  codex: number;
  last: number; // last use (ms), 0 if unknown
}

const isWin = process.platform === 'win32';

// Usual install folders, for when the login shell can't be asked (or the CLI is outside its PATH).
const commonDirs = () => {
  const home = os.homedir();
  return isWin
    ? [path.join(home, '.local', 'bin'), path.join(home, 'AppData', 'Roaming', 'npm')]
    : [path.join(home, '.local', 'bin'), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', path.join(home, '.bun', 'bin'),
       path.join(home, '.npm-global', 'bin'), path.join(home, '.opencode', 'bin')];
};

function viaShell(cmd: string): Promise<string | null> {
  // The login + interactive shell sees the same PATH as the terminal tabs (nvm, Homebrew …). cmd is a fixed agent name.
  const [bin, args] = isWin ? ['where', [cmd]] : [process.env.SHELL || '/bin/zsh', ['-l', '-i', '-c', `command -v ${cmd}`]];
  return new Promise((resolve) => execFile(bin, args, { timeout: 8000, windowsHide: true }, (err, out) => {
    const hit = err ? undefined : String(out).split(/\r?\n/).map((l) => l.trim()).reverse().find((l) => path.isAbsolute(l));
    resolve(hit && fs.existsSync(hit) ? hit : null);
  }));
}

export async function findAgentBinary(cmd: string): Promise<string | null> {
  const found = await viaShell(cmd);
  if (found) return found;
  const names = isWin ? [`${cmd}.exe`, `${cmd}.cmd`] : [cmd];
  for (const dir of commonDirs()) for (const n of names) if (fs.existsSync(path.join(dir, n))) return path.join(dir, n);
  return null;
}

export async function detectAgents(): Promise<{ id: string; path: string | null }[]> {
  return Promise.all(AGENTS.map(async (a) => ({ id: a.id, path: await findAgentBinary(a.command) })));
}

// Pure merge of the three sources, so it can be tested without a real home folder.
export function mergeProjects(
  known: Pick<ProjectItem, 'path' | 'agent' | 'lastLaunched'>[],
  claude: { path: string; lastStartTime?: number }[],
  codex: Map<string, { count: number; last: number }>,
  claudeCount: (p: string) => number,
  isDir: (p: string) => boolean,
  home = os.homedir(),
  tmpDirs = [os.tmpdir(), '/tmp', '/private/tmp', '/private/var/folders', '/var/folders'],
  canon: (p: string) => string = (p) => path.resolve(p) // real path, so a symlinked folder is listed once
): SetupProject[] {
  const byPath = new Map<string, SetupProject>();
  const add = (p: string, patch: Partial<SetupProject>) => {
    const key = canon(p);
    if (key === home || key === path.parse(key).root) return; // a whole home folder is not a project
    if (tmpDirs.some((t) => key.startsWith(t + path.sep))) return; // throwaway folders agents ran in
    // The first path seen is shown (known projects come first, so their stored path stays as it is).
    const cur = byPath.get(key) || { path: path.resolve(p), name: path.basename(key), known: false, claude: 0, codex: 0, last: 0 };
    byPath.set(key, { ...cur, ...patch, last: Math.max(cur.last, patch.last || 0) });
  };
  for (const p of known) add(p.path, { known: true, agent: p.agent || 'claude', last: p.lastLaunched || 0 });
  for (const c of claude) add(c.path, { last: c.lastStartTime || 0 });
  for (const [p, c] of codex) add(p, { codex: c.count, last: c.last });
  return [...byPath.values()]
    .filter((p) => p.known || isDir(p.path))
    .map((p) => ({ ...p, claude: claudeCount(p.path) }))
    .sort((a, b) => Number(b.known) - Number(a.known) || b.last - a.last)
    .slice(0, 150);
}

export function scanProjects(known: ProjectItem[]): SetupProject[] {
  const isDir = (p: string) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
  const real = (p: string) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
  return mergeProjects(known, scanClaudeProjects(), getCodexProjectDirs(), (p) => getProjectSessions(p).length, isDir, undefined, undefined, real);
}
