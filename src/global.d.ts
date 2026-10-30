import { ProjectItem, AppSettings, TerminalOption, FileItem, ClaudeSession } from './types';

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
      readFile: (filePath: string) => Promise<{ content: string; truncated: boolean }>;
      getSessions: (projectPath: string) => Promise<ClaudeSession[]>;
      validatePath: (targetPath: string) => Promise<{ exists: boolean; isDirectory: boolean }>;
      copyToClipboard: (text: string) => Promise<void>;
      // Embedded PTY
      ptyCreate: (opts: { id: string; cwd: string; initialCommand?: string; cols?: number; rows?: number }) => Promise<{ success: boolean; pid?: number; error?: string }>;
      ptyWrite: (id: string, data: string) => Promise<void>;
      ptyResize: (id: string, cols: number, rows: number) => Promise<void>;
      ptyKill: (id: string) => Promise<void>;
      onPtyData: (id: string, callback: (data: string) => void) => () => void;
      onPtyExit: (id: string, callback: (info: { exitCode: number; signal?: number }) => void) => () => void;
    };
  }
}

