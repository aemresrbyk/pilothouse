// Debate: two or more agents talk a question over in turns, read-only, each on the user's own CLI and account.
// The whole conversation lives in .pilothouse/debate.md so it can be read anywhere; the last turn writes the decision.
import fs from 'fs';
import path from 'path';
import { execFile, ChildProcess } from 'child_process';
import { agentById, DEBATE_AGENTS } from '../src/types';
import { excludePilothouse } from './handoff';

const NO_ANSWER = '(no answer';
export const DEBATE_FILE = path.join('.pilothouse', 'debate.md');

// One-shot, read-only argv per agent (no shell: the prompt is a plain argument). Antigravity has no documented
// headless mode yet, so it can't take part.
const HEADLESS: Record<string, (p: string) => string[]> = {
  claude: (p) => ['-p', p, '--permission-mode', 'default', '--disallowedTools', 'Bash,Edit,Write,MultiEdit,NotebookEdit'],
  codex: (p) => ['exec', '--sandbox', 'read-only', '--skip-git-repo-check', p],
  gemini: (p) => ['-p', p, '--approval-mode', 'plan', '--skip-trust'], // the user added this folder to Pilothouse; plan mode is read-only
  opencode: (p) => ['run', '--agent', 'plan', p]
};
export { DEBATE_AGENTS };

export interface Turn { agent: string; text: string }

export function debatePrompt(topic: string, me: string, others: string[], turns: Turn[], final: boolean): string {
  const log = turns.map((t) => `### ${agentById(t.agent).name}\n${t.text}`).join('\n\n') || '(you speak first)';
  const task = final
    ? 'The debate is over. Write the outcome: "## Decision" (what to do and why, short), "## Still open" (disagreements left), "## Tasks" (a numbered list someone can start on). No other text.'
    : `Give your view in under 200 words: agree or push back on the others by name, add what they missed, and look at the project files if that helps. Do not change any files. End with exactly one line: "AGREE" if you accept the current best answer as is, else "DISAGREE".`;
  return `You are ${agentById(me).name} in a debate with ${others.map((o) => agentById(o).name).join(', ')} about this project.\n\nQuestion: ${topic}\n\nSo far:\n${log}\n\n${task}`;
}

// A round ends the debate early when every agent closed with AGREE.
export const allAgree = (round: Turn[]) => round.length > 0 && round.every((t) => /\bAGREE[*_.\s]*$/.test(t.text)); // \b: DISAGREE never matches

export const formatDebate = (topic: string, turns: Turn[], decision?: string) =>
  `# Debate: ${topic}\n\n${turns.map((t, i) => `## ${i + 1}. ${agentById(t.agent).name}\n\n${t.text.trim()}`).join('\n\n')}${decision ? `\n\n---\n\n${decision.trim()}` : ''}\n`;

export async function runDebate(opts: {
  projectPath: string; topic: string; agents: string[]; rounds: number;
  ask: (agent: string, prompt: string) => Promise<string>;
  onUpdate: (markdown: string) => void;
  stopped: () => boolean;
}): Promise<string> {
  const { projectPath, topic, agents, ask, onUpdate, stopped } = opts;
  const rounds = Math.max(1, Math.min(5, opts.rounds)); // each turn spends the user's own quota
  const out = path.join(projectPath, DEBATE_FILE);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await excludePilothouse(projectPath);
  const turns: Turn[] = [];
  const save = (decision?: string) => { const md = formatDebate(topic, turns, decision); fs.writeFileSync(out, md); onUpdate(md); };
  save();
  let live = [...agents]; // an agent that could not answer (not logged in, out of quota) sits out the rest
  for (let r = 0; r < rounds && live.length && !stopped(); r++) {
    const round: Turn[] = [];
    for (const a of live) {
      if (stopped()) break;
      const text = await ask(a, debatePrompt(topic, a, agents.filter((x) => x !== a), turns, false));
      turns.push({ agent: a, text });
      if (text.startsWith(NO_ANSWER)) live = live.filter((x) => x !== a); else round.push({ agent: a, text });
      save();
    }
    if (allAgree(round)) break;
  }
  if (!stopped() && live.length) save(await ask(live[0], debatePrompt(topic, live[0], agents.filter((x) => x !== live[0]), turns, true)));
  return out;
}

// Runs one turn; the caller keeps the child so Stop can kill it.
export function askAgent(bin: string, agent: string, prompt: string, cwd: string, env: NodeJS.ProcessEnv, track: (c: ChildProcess | null) => void): Promise<string> {
  return new Promise((resolve) => {
    const child = execFile(bin, HEADLESS[agent](prompt), { cwd, env, timeout: 10 * 60_000, maxBuffer: 8 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        track(null);
        const text = String(stdout).trim();
        // The first line that names an error says why (the last one is often a stack frame).
        const lines = String(stderr).replace(/\x1b\[[0-9;]*m/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
        const why = lines.find((l) => /error|denied|not (logged|authenticated)|quota|limit/i.test(l)) || lines.pop() || err?.message;
        resolve(text || `${NO_ANSWER}${why ? `: ${why.slice(0, 300)}` : ''})`);
      });
    child.stdin?.end(); // headless CLIs that also read stdin would otherwise wait for it
    track(child);
  });
}

// "DONE: x" / "NOT DONE: y - why" lines from the Inbox check; anything else the agent says is ignored.
export const parseCheck = (out: string) => out.split('\n').map((l) => l.replace(/^[\s*>\-•]+/, '').match(/^(NOT DONE|DONE)\s*[:：]\s*(.+)$/i))
  .filter((m): m is RegExpMatchArray => !!m).map((m) => ({ text: m[2].trim(), done: m[1].toUpperCase() === 'DONE' }));
