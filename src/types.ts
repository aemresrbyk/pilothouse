// CLI flags that are switched on, e.g. ['--continue', '--model opus'].
export type ProjectFlags = string[];

export const SKIP_PERMS_FLAG = '--dangerously-skip-permissions';
// Toggle pills shown in the toolbar until the user edits the list in Settings.
export const DEFAULT_FLAG_PRESETS = ['--continue', SKIP_PERMS_FLAG, '--verbose', '--chrome'];

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

export type AppTheme = 'claude' | 'dark' | 'cyber' | 'nord' | 'light';

export interface AppSettings {
  theme?: AppTheme;
  defaultTerminal: string;
  defaultEditor: string;
  defaultFlags: ProjectFlags;
  flagPresets?: string[];
  claudePath: string;
  autoDetectOnStartup: boolean;
  controlApiEnabled?: boolean;
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

