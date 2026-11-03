// Hand-off between agents: when one agent stops (usage limit, or you just want another one), the next agent reads
// .pilothouse/handoff.md: the last conversation, what changed in git, and the project's memory/instruction files.
// The same file lets any agent (opencode, Gemini …) see what Claude or Codex did.
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getProjectSessions, getCodexSessions, readTranscript, listMemoryFiles } from './scanner';
import { TranscriptMessage, agentById } from '../src/types';

const run = promisify(execFile);
export const HANDOFF_FILE = path.join('.pilothouse', 'handoff.md');

const MSG_CHARS = 1500;
const MEMORY_CHARS = 3000;

export interface HandoffInput {
  fromAgent: string;
  at: Date;
  messages: TranscriptMessage[];
  git: { status: string; diffStat: string; log: string } | null;
  memory: { label: string; text: string }[];
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}\n… (cut)` : s);
// Only trailing whitespace goes: git status's leading column (" M" vs "M ") means unstaged vs staged.
const block = (s: string) => '```\n' + (s.replace(/\s+$/, '').replace(/^\n+/, '') || '(nothing)') + '\n```';

export function formatHandoff(h: HandoffInput): string {
  const from = agentById(h.fromAgent).name;
  const out = [
    `# Hand-off from ${from}`,
    '',
    `Written by Pilothouse on ${h.at.toISOString().replace('T', ' ').slice(0, 16)} UTC. ${from} stopped here; continue its work.`,
    'Check the changes below before you edit, and keep the project rules in "Project memory".',
    ''
  ];
  out.push('## Last conversation', '');
  if (!h.messages.length) out.push(`(no saved conversation from ${from})`, '');
  for (const m of h.messages) out.push(`**${m.role === 'user' ? 'User' : from}:** ${clip(m.text.trim(), MSG_CHARS)}`, '');
  out.push('## Changes in the repository', '');
  if (!h.git) out.push('(not a git repository)', '');
  else out.push('Uncommitted files:', block(h.git.status), '', 'Diff summary:', block(h.git.diffStat), '', 'Recent commits:', block(h.git.log), '');
  out.push('## Project memory', '');
  if (!h.memory.length) out.push('(no memory or instruction files)', '');
  for (const m of h.memory) out.push(`### ${m.label}`, '', clip(m.text.trim(), MEMORY_CHARS), '');
  return out.join('\n');
}

async function gitInfo(cwd: string) {
  // Each call may fail on its own (a repo without commits has no HEAD), so failures become empty text.
  const git = (...args: string[]) =>
    run('git', ['-C', cwd, ...args], { timeout: 10_000, maxBuffer: 4 * 1024 * 1024 }).then((r) => r.stdout, () => '');
  if ((await git('rev-parse', '--is-inside-work-tree')).trim() !== 'true') return null;
  const [status, diffStat, log] = await Promise.all([git('status', '--short'), git('diff', '--stat', 'HEAD'), git('log', '--oneline', '-10')]);
  try {
    // Keep the hand-off file out of commits without touching the repo's .gitignore.
    const exclude = path.resolve(cwd, (await git('rev-parse', '--git-path', 'info/exclude')).trim());
    const cur = fs.existsSync(exclude) ? fs.readFileSync(exclude, 'utf-8') : '';
    if (!cur.split(/\r?\n/).includes('.pilothouse/')) {
      fs.mkdirSync(path.dirname(exclude), { recursive: true });
      fs.appendFileSync(exclude, `${cur && !cur.endsWith('\n') ? '\n' : ''}.pilothouse/\n`);
    }
  } catch {} // exclude list is a nicety; the hand-off still works without it
  return { status: clip(status, 4000), diffStat: clip(diffStat, 4000), log };
}

function memoryFiles(projectPath: string) {
  // Global ~/.claude/CLAUDE.md is the user's private setup, not part of this project.
  const files = listMemoryFiles(projectPath).filter((f) => !f.label.startsWith('Global'));
  for (const name of ['AGENTS.md', 'GEMINI.md']) {
    const p = path.join(projectPath, name);
    if (fs.existsSync(p)) files.push({ label: `Project ${name}`, path: p });
  }
  return files.flatMap((f) => {
    try { return [{ label: f.label, text: fs.readFileSync(f.path, 'utf-8') }]; } catch { return []; }
  });
}

// sessionFile: continue from that past conversation instead of the agent's latest one.
export async function writeHandoff(projectPath: string, fromAgent: string, sessionFile?: string): Promise<{ path?: string; error?: string }> {
  try {
    const sessions = fromAgent === 'codex' ? getCodexSessions(projectPath) : fromAgent === 'claude' ? getProjectSessions(projectPath, true) : [];
    const file = sessionFile || sessions.find((s) => s.file)?.file;
    const messages = file ? readTranscript(file).slice(-16) : [];
    const text = formatHandoff({ fromAgent, at: new Date(), messages, git: await gitInfo(projectPath), memory: memoryFiles(projectPath) });
    const out = path.join(projectPath, HANDOFF_FILE);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, text);
    return { path: out };
  } catch (err: any) {
    return { error: err.message };
  }
}
