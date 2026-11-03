// CLI flags that are switched on, e.g. ['--continue', '--model opus'].
export type ProjectFlags = string[];

export const SKIP_PERMS_FLAG = '--dangerously-skip-permissions';
// Flags that let an agent act without asking (Claude's skip-permissions, Codex/Gemini --yolo, bypass-approvals …).
export const isDangerFlag = (flag: string) => /dangerous|yolo|bypass/i.test(flag);
// Toggle pills shown in the toolbar until the user edits the list in Settings.
export const DEFAULT_FLAG_PRESETS = ['--continue', SKIP_PERMS_FLAG, '--verbose', '--chrome'];

// Terminal AI agents Pilothouse can drive. Only the command, flags and instructions file differ;
// conversation history is read for the agents that have hasHistory.
export interface AgentProfile {
  id: string;
  name: string;
  command: string;
  instructionsFile: string;
  flagPresets: string[];
  resumeArgs?: string; // {id} is replaced with the session id
  hasHistory?: boolean;
}

export const AGENTS: AgentProfile[] = [
  { id: 'claude', name: 'Claude Code', command: 'claude', instructionsFile: 'CLAUDE.md', flagPresets: DEFAULT_FLAG_PRESETS, resumeArgs: '--resume {id}', hasHistory: true },
  { id: 'codex', name: 'Codex', command: 'codex', instructionsFile: 'AGENTS.md', flagPresets: ['--full-auto', '--search'], resumeArgs: 'resume {id}', hasHistory: true },
  { id: 'gemini', name: 'Gemini CLI', command: 'gemini', instructionsFile: 'GEMINI.md', flagPresets: ['--yolo'] },
  { id: 'opencode', name: 'opencode', command: 'opencode', instructionsFile: 'AGENTS.md', flagPresets: [] }
];

export const agentById = (id?: string): AgentProfile => AGENTS.find((a) => a.id === id) || AGENTS[0];

export function agentFlagPresets(settings: Pick<AppSettings, 'agentFlagPresets'>, agentId?: string): string[] {
  const agent = agentById(agentId);
  return settings.agentFlagPresets?.[agent.id] ?? agent.flagPresets;
}

// Claude's binary path is configurable in Settings; the others are looked up on the login shell's PATH.
export const agentBinary = (agent: AgentProfile, claudePath?: string): string =>
  agent.id === 'claude' ? claudePath || 'claude' : agent.command;

// Shell command line for an agent. resumeId reopens a past session (and drops --continue, which conflicts).
export function buildAgentCommand(agent: AgentProfile, binary: string, flags: string[], extra?: string, resumeId?: string): string {
  const parts = [/\s/.test(binary) ? `"${binary}"` : binary];
  if (resumeId && agent.resumeArgs) parts.push(agent.resumeArgs.replace('{id}', resumeId));
  parts.push(...flags.filter((f) => !(resumeId && (f === '--continue' || f === '-c'))));
  if (!resumeId && extra?.trim()) parts.push(extra.trim());
  return parts.join(' ');
}

const LEGACY_FLAG_KEYS: Record<string, string> = {
  dangerouslySkipPermissions: SKIP_PERMS_FLAG,
  continueLast: '--continue',
  chrome: '--chrome',
  verbose: '--verbose',
  bare: '--bare'
};

// Configs before v1.2 stored flags as { dangerouslySkipPermissions: true, ... }.
export function toFlagList(flags: unknown): ProjectFlags {
  if (Array.isArray(flags)) return flags.filter((f): f is string => typeof f === 'string');
  if (!flags || typeof flags !== 'object') return [];
  return Object.entries(flags as Record<string, unknown>)
    .filter(([k, on]) => on === true && LEGACY_FLAG_KEYS[k])
    .map(([k]) => LEGACY_FLAG_KEYS[k]);
}

export interface GitInfo {
  isGit: boolean;
  branch?: string;
  hasUncommitted?: boolean;
  uncommittedCount?: number;
  commitHash?: string;
}

export interface ClaudeSession {
  id: string;
  modifiedAt: number;
  sizeBytes: number;
  formattedSize: string;
  dateStr: string;
  title?: string;
  file?: string; // the session's .jsonl on disk
}

export interface TranscriptMessage {
  role: 'user' | 'assistant';
  text: string;
  time?: string; // ISO timestamp
}

export interface HistoryHit {
  sessionId: string;
  file: string;
  title?: string;
  index: number; // message index in the transcript
  role: 'user' | 'assistant';
  time?: string;
  snippet: string;
}

export interface ClaudeMetrics {
  lastCost?: number;
  models?: string[];
  inputTokens?: number;
  outputTokens?: number;
  lastDurationMs?: number;
  lastSessionId?: string;
  sessions?: ClaudeSession[];
}

export interface ProjectItem {
  id: string;
  name: string;
  path: string;
  flags: ProjectFlags;
  customFlags: string;
  lastLaunched?: number;
  createdAt: number;
  isFavorite: boolean;
  gitInfo?: GitInfo;
  hasClaudeMd: boolean;
  hasPackageJson: boolean;
  tags?: string[];
  terminalOverride?: string;
  metrics?: ClaudeMetrics;
  commandHistory?: string[];
  customRunCommands?: RunCommand[];
  agent?: string; // AgentProfile id, default 'claude'
  agentFlags?: Record<string, ProjectFlags>; // flags remembered for the agents this project switched away from
}

export interface RunCommand {
  label: string;
  command: string;
  source: string;
}

export interface MemoryFile {
  label: string;
  path: string;
}

export type PtyStatus = 'running' | 'waiting' | 'idle';

// unseen = it finished or asked for approval while you looked elsewhere; failed = exit code of a command that failed.
export interface TabState {
  status: PtyStatus;
  unseen: boolean;
  failed?: number;
}

// One line of the Inbox activity log.
export interface InboxEvent {
  tabId: string;
  kind: 'waiting' | 'finished' | 'failed';
  at: number;
  code?: number;
}

export type AppTheme = 'claude' | 'dark' | 'cyber' | 'nord' | 'light';

export interface AppSettings {
  theme?: AppTheme;
  defaultTerminal: string;
  defaultEditor: string;
  defaultFlags: ProjectFlags;
  agentFlagPresets?: Record<string, string[]>; // per agent id; missing = the agent's built-in presets
  defaultAgent?: string;
  claudePath: string;
  autoDetectOnStartup: boolean;
  controlApiEnabled?: boolean;
  notificationsEnabled?: boolean;
  voiceEnabled?: boolean;
  voiceHotkey?: string; // Electron accelerator, default CommandOrControl+Shift+Space
  voiceLanguage?: string; // 'auto' | 'en' | 'tr' …
  voiceAutoSend?: boolean; // press Enter after typing the transcript
  voiceConversation?: boolean; // talk back: read answers aloud, ask to repeat, approve by voice (default on)
  wakeWordEnabled?: boolean; // keep the mic open for "Hey Pilothouse"
  openAtLogin?: boolean;
  soundEnabled?: boolean;
  savedTabs?: TabSession[];
  activeTabId?: string;
}

export interface TerminalOption {
  id: string;
  name: string;
  installed: boolean;
  command: string;
}

export interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  extension?: string;
}

export interface TabSession {
  id: string;
  projectId: string;
  customInput: string;
  isLaunched: boolean;
  launchedAt?: number;
  lastCommand?: string;
  commandHistory?: string[];
  // Set for tabs opened to run a repo command (dev server etc.) instead of Claude.
  initialCommand?: string;
}

export interface LaunchPayload {
  projectId: string;
  command: string;
  terminal: string;
}

