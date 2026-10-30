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
}

export interface AppSettings {
  defaultTerminal: string;
  defaultEditor: string;
  defaultFlags: ProjectFlags;
  claudePath: string;
  autoDetectOnStartup: boolean;
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

export interface LaunchPayload {
  projectId: string;
  command: string;
  terminal: string;
}
