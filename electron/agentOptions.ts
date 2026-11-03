// Models and effort levels each agent offers on this computer, read from the agent itself (its help text, its
// account cache, its model list), so every user sees what their own account can use.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';

export interface ModelOption {
  id: string;
  label: string;
  efforts?: string[]; // this model's own levels (Codex); else the agent-wide list
  defaultEffort?: string;
}
export interface AgentOptions {
  models: ModelOption[];
  efforts: string[];
}

const run = (bin: string, args: string[]) => new Promise<string>((resolve) =>
  execFile(bin, args, { timeout: 20_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true, shell: process.platform === 'win32' && bin.endsWith('.cmd') },
    // Help often goes to stderr (Go's flag package) and may exit non-zero, so both streams count either way.
    (_err, out, errOut) => resolve(`${out}\n${errOut}`)));

// "--effort <level> ... (low, medium, high, xhigh, max)" in `claude --help`.
export function parseClaudeEfforts(help: string): string[] {
  const m = help.match(/--effort[^\n]*\n?[^(]*\(([a-z, ]+)\)/);
  return m ? m[1].split(',').map((s) => s.trim()).filter(Boolean) : [];
}

// ~/.codex/models_cache.json: the models this ChatGPT/API account may pick, each with its reasoning levels.
export function parseCodexModels(json: string): ModelOption[] {
  try {
    const raw = JSON.parse(json);
    const list: any[] = Array.isArray(raw) ? raw : raw.models || raw.data || [];
    return list.filter((m) => m?.slug && m.visibility !== 'hide').map((m) => ({
      id: m.slug,
      label: m.display_name || m.slug,
      efforts: (m.supported_reasoning_levels || []).map((l: any) => l.effort).filter(Boolean),
      defaultEffort: m.default_reasoning_level
    }));
  } catch {
    return [];
  }
}

// `agy models`: "id<TAB>label" per line after a "Fetching…" line.
export const parseAgyModels = (out: string): ModelOption[] =>
  out.split(/\r?\n/).map((l) => l.split('\t')).filter((p) => p.length >= 2 && /^[\w.:@/-]+$/.test(p[0].trim()))
    .map(([id, label]) => ({ id: id.trim(), label: label.trim() || id.trim() }));

// "--effort  Reasoning effort … (low|medium|high|xhigh|max)" in `agy --help`.
export function parseAgyEfforts(help: string): string[] {
  const m = help.match(/--effort[^\n]*\(([a-z|]+)\)/);
  return m ? m[1].split('|').filter(Boolean) : [];
}

// `opencode models`: one provider/model per line.
export const parseOpencodeModels = (out: string): ModelOption[] =>
  out.split(/\r?\n/).map((l) => l.trim()).filter((l) => /^[\w.-]+\/[\w.:@-]+$/.test(l)).map((id) => ({ id, label: id }));

// shortcut: Claude and Gemini have no "list my models" command, so their documented aliases are used; the account
// decides which real model an alias means. Upgrade if either CLI adds a model list.
const CLAUDE_MODELS = ['fable', 'opus', 'sonnet', 'haiku'];
const GEMINI_MODELS = ['auto', 'pro', 'flash', 'flash-lite'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const cache = new Map<string, AgentOptions>();

export async function agentOptions(agentId: string, binary: string, codexHome = path.join(os.homedir(), '.codex')): Promise<AgentOptions> {
  const key = `${agentId}:${binary}`;
  if (cache.has(key)) return cache.get(key)!;
  let opts: AgentOptions = { models: [], efforts: [] };
  if (agentId === 'claude') {
    opts = { models: CLAUDE_MODELS.map((m) => ({ id: m, label: cap(m) })), efforts: parseClaudeEfforts(await run(binary, ['--help'])) };
  } else if (agentId === 'codex') {
    let json = '';
    try { json = fs.readFileSync(path.join(codexHome, 'models_cache.json'), 'utf-8'); } catch {}
    opts = { models: parseCodexModels(json), efforts: [] };
  } else if (agentId === 'gemini') {
    opts = { models: GEMINI_MODELS.map((m) => ({ id: m, label: cap(m) })), efforts: [] };
  } else if (agentId === 'antigravity') {
    const [models, help] = await Promise.all([run(binary, ['models']), run(binary, ['--help'])]);
    opts = { models: parseAgyModels(models), efforts: parseAgyEfforts(help) };
  } else if (agentId === 'opencode') {
    opts = { models: parseOpencodeModels(await run(binary, ['models'])), efforts: [] };
  }
  // Only remember real answers, so installing or logging in later shows up without a restart.
  if (opts.models.length) cache.set(key, opts);
  return opts;
}
