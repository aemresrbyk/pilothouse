import { ProjectItem, AppSettings, TerminalOption, FileItem, ClaudeSession, RunCommand, MemoryFile, PtyStatus, TranscriptMessage, HistoryHit } from './types';

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
      getTranscript: (file: string) => Promise<TranscriptMessage[]>;
      searchHistory: (projectPath: string, agentId: string, query: string) => Promise<HistoryHit[]>;
      wakeAssets: () => Promise<{ mel: Uint8Array; embedding: Uint8Array; wake: Uint8Array; wasm: Uint8Array } | { error: string }>;
      onSettingsChanged: (handler: (s: AppSettings) => void) => () => void;
      voiceStatus: () => Promise<{ binary: boolean; model: boolean; modelBytes: number }>;
      voiceDownloadModel: () => Promise<{ success: boolean; error?: string }>;
      voiceMicAccess: () => Promise<boolean>;
      speak: (text: string, lang: string) => Promise<boolean>;
      stopSpeaking: () => void;
      ptyTail: (id: string, chars?: number) => Promise<string>;
      agentLastReply: (projectPath: string, agentId: string, since: number) => Promise<string | null>;
      voiceTranscribe: (pcm: ArrayBuffer, language: string, prompt?: string) => Promise<{ text?: string; language?: string; words?: { text: string; p: number }[]; error?: string }>;
      onVoiceEvent: (handler: (event: 'toggle' | 'progress' | 'error', data?: any) => void) => () => void;
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
      onPtyFailed: (callback: (info: { id: string; code: number }) => void) => () => void;
      ptyResources: () => Promise<{ id: string; cpu: number; memMB: number }[]>;
      addWorktree: (repoPath: string) => Promise<{ path?: string; error?: string }>;
      setBadge: (count: number) => void;
      focusApp: () => void;
      onPtyData: (id: string, callback: (data: string) => void) => () => void;
      onPtyExit: (id: string, callback: (info: { exitCode: number; signal?: number }) => void) => () => void;
    };
  }
}

