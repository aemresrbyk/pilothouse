import { ProjectItem, AppSettings, TerminalOption, FileItem, ClaudeSession, RunCommand, MemoryFile, PtyStatus } from './types';

declare module '*.css';
declare module '*.svg' {
  const content: string;
  export default content;
}

declare global {
  interface Window {
    electronAPI: {
      getProjects: () => Promise<ProjectItem[]>;
      updateProject: (id: string, updates: Partial<ProjectItem>) => Promise<ProjectItem | null>;
      addProject: (path: string) => Promise<ProjectItem>;
      removeProject: (id: string) => Promise<boolean>;
      pickDirectory: () => Promise<string | null>;
      syncFromClaude: () => Promise<{ addedCount: number; totalCount: number }>;
      getSettings: () => Promise<AppSettings>;
      updateSettings: (settings: Partial<AppSettings>) => Promise<AppSettings>;
      getTerminals: () => Promise<TerminalOption[]>;
      launchProject: (projectId: string, customCommand?: string) => Promise<{ success: boolean; error?: string }>;
      openFolder: (dirPath: string) => Promise<void>;
      openInEditor: (dirPath: string, editor?: string) => Promise<boolean>;
      listFiles: (dirPath: string) => Promise<FileItem[]>;
      readFile: (filePath: string) => Promise<{ content: string; truncated: boolean; error?: string }>;
      saveFile: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>;
      getGitStatus: (dirPath: string) => Promise<{ isGit: boolean; branch: string; modifiedCount: number; statusText: string }>;
      getSystemHealth: () => Promise<{ claudeInstalled: boolean; claudePath: string; claudeVersion: string; nodeVersion: string }>;
      getSessions: (projectPath: string, agentId?: string) => Promise<ClaudeSession[]>;
      validatePath: (targetPath: string) => Promise<{ exists: boolean; isDirectory: boolean }>;
      getRunCommands: (dirPath: string) => Promise<RunCommand[]>;
      getMemoryFiles: (projectPath: string) => Promise<MemoryFile[]>;
      onControlOpenTab: (handler: (req: { projectId: string; command?: string }) => string) => () => void;
      copyToClipboard: (text: string) => Promise<void>;
      getPathForFile: (file: File) => string;
      // Embedded PTY
      ptyCreate: (opts: { id: string; cwd: string; initialCommand?: string; cols?: number; rows?: number }) => Promise<{ success: boolean; pid?: number; error?: string }>;
      ptyWrite: (id: string, data: string) => void;
      ptyResize: (id: string, cols: number, rows: number) => void;
      ptyKill: (id: string) => Promise<void>;
      onPtyStatus: (callback: (info: { id: string; status: PtyStatus }) => void) => () => void;
      setBadge: (count: number) => void;
      focusApp: () => void;
      onPtyData: (id: string, callback: (data: string) => void) => () => void;
      onPtyExit: (id: string, callback: (info: { exitCode: number; signal?: number }) => void) => () => void;
    };
  }
}

