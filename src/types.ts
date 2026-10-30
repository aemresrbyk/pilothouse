export interface ProjectFlags {
  dangerouslySkipPermissions: boolean;
  continueLast: boolean;
  chrome: boolean;
  verbose: boolean;
  bare: boolean;
}

export interface GitInfo {
  isGit: boolean;
  branch?: string;
  hasUncommitted?: boolean;
}

export interface ClaudeMetrics {
  lastCost?: number;
  models?: string[];
  inputTokens?: number;
  outputTokens?: number;
  lastDurationMs?: number;
  lastSessionId?: string;
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
}

export interface AppSettings {
  defaultTerminal: string;
  defaultEditor: string;
  defaultFlags: ProjectFlags;
  claudePath: string;
  autoDetectOnStartup: boolean;
  soundEnabled?: boolean;
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
}

export interface LaunchPayload {
  projectId: string;
  command: string;
  terminal: string;
}

