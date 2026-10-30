import { ProjectItem, AppSettings, TerminalOption, FileItem } from './types';

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
      launchProject: (projectId: string) => Promise<{ success: boolean; error?: string }>;
      openFolder: (dirPath: string) => Promise<void>;
      openInEditor: (dirPath: string, editor?: string) => Promise<boolean>;
      listFiles: (dirPath: string) => Promise<FileItem[]>;
      readFile: (filePath: string) => Promise<{ content: string; truncated: boolean }>;
      copyToClipboard: (text: string) => Promise<void>;
    };
  }
}

