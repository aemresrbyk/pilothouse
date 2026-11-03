import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { SetupProject } from './setup';
import { ProjectItem, AppSettings, TerminalOption, FileItem, ClaudeSession, RunCommand, MemoryFile, PtyStatus, TranscriptMessage, HistoryHit } from '../src/types';

export const electronAPI = {
  getProjects: (): Promise<ProjectItem[]> => ipcRenderer.invoke('projects:get'),
  updateProject: (id: string, updates: Partial<ProjectItem>): Promise<ProjectItem | null> =>
    ipcRenderer.invoke('projects:update', id, updates),
  addProject: (path: string): Promise<ProjectItem> =>
    ipcRenderer.invoke('projects:add', path),
  removeProject: (id: string): Promise<boolean> =>
    ipcRenderer.invoke('projects:remove', id),
  pickDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:pick-directory'),
  syncFromClaude: (): Promise<{ addedCount: number; totalCount: number }> =>
    ipcRenderer.invoke('projects:sync'),
  getSettings: (): Promise<AppSettings> =>
    ipcRenderer.invoke('settings:get'),
  updateSettings: (settings: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke('settings:update', settings),
  getTerminals: (): Promise<TerminalOption[]> =>
    ipcRenderer.invoke('system:get-terminals'),
  launchProject: (projectId: string, customCommand?: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('project:launch', projectId, customCommand),
  openFolder: (dirPath: string): Promise<void> =>
    ipcRenderer.invoke('project:open-folder', dirPath),
  openInEditor: (dirPath: string, editor?: string): Promise<boolean> =>
    ipcRenderer.invoke('project:open-editor', dirPath, editor),
  listFiles: (dirPath: string): Promise<FileItem[]> =>
    ipcRenderer.invoke('project:list-files', dirPath),
  readFile: (filePath: string): Promise<{ content: string; truncated: boolean; error?: string }> =>
    ipcRenderer.invoke('project:read-file', filePath),
  saveFile: (filePath: string, content: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('project:save-file', filePath, content),
  getGitStatus: (dirPath: string): Promise<{ isGit: boolean; branch: string; modifiedCount: number; statusText: string }> =>
    ipcRenderer.invoke('project:git-status', dirPath),
  getSystemHealth: (): Promise<{ claudeInstalled: boolean; claudePath: string; claudeVersion: string; nodeVersion: string }> =>
    ipcRenderer.invoke('system:health'),
  getSessions: (projectPath: string, agentId?: string): Promise<ClaudeSession[]> =>
    ipcRenderer.invoke('project:get-sessions', projectPath, agentId),
  validatePath: (targetPath: string): Promise<{ exists: boolean; isDirectory: boolean }> =>
    ipcRenderer.invoke('system:validate-path', targetPath),
  getTranscript: (file: string): Promise<TranscriptMessage[]> => ipcRenderer.invoke('history:transcript', file),
  searchHistory: (projectPath: string, agentId: string, query: string): Promise<HistoryHit[]> =>
    ipcRenderer.invoke('history:search', projectPath, agentId, query),
  wakeAssets: (): Promise<{ mel: Uint8Array; embedding: Uint8Array; wake: Uint8Array; wasm: Uint8Array } | { error: string }> =>
    ipcRenderer.invoke('wake:assets'),
  onSettingsChanged: (handler: (s: AppSettings) => void): (() => void) => {
    const l = (_e: any, s: AppSettings) => handler(s);
    ipcRenderer.on('settings:changed', l);
    return () => { ipcRenderer.removeListener('settings:changed', l); };
  },
  voiceStatus: (): Promise<{ binary: boolean; model: boolean; modelBytes: number }> => ipcRenderer.invoke('voice:status'),
  voiceDownloadModel: (): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('voice:download-model'),
  voiceMicAccess: (): Promise<boolean> => ipcRenderer.invoke('voice:mic-access'),
  speak: (text: string, lang: string): Promise<boolean> => ipcRenderer.invoke('tts:speak', text, lang),
  stopSpeaking: (): void => ipcRenderer.send('tts:stop'),
  ptyTail: (id: string, chars?: number): Promise<string> => ipcRenderer.invoke('pty:tail', id, chars),
  agentLastReply: (projectPath: string, agentId: string, since: number): Promise<string | null> =>
    ipcRenderer.invoke('agent:last-reply', projectPath, agentId, since),
  voiceTranscribe: (pcm: ArrayBuffer, language: string, prompt?: string): Promise<{ text?: string; language?: string; words?: { text: string; p: number }[]; error?: string }> =>
    ipcRenderer.invoke('voice:transcribe', pcm, language, prompt),
  onVoiceEvent: (handler: (event: 'toggle' | 'progress' | 'error', data?: any) => void): (() => void) => {
    const toggle = () => handler('toggle');
    const progress = (_e: any, d: any) => handler('progress', d);
    const error = (_e: any, d: any) => handler('error', d);
    ipcRenderer.on('voice:toggle', toggle);
    ipcRenderer.on('voice:download-progress', progress);
    ipcRenderer.on('voice:error', error);
    return () => {
      ipcRenderer.removeListener('voice:toggle', toggle);
      ipcRenderer.removeListener('voice:download-progress', progress);
      ipcRenderer.removeListener('voice:error', error);
    };
  },
  getRunCommands: (dirPath: string): Promise<RunCommand[]> =>
    ipcRenderer.invoke('project:run-commands', dirPath),
  getMemoryFiles: (projectPath: string): Promise<MemoryFile[]> =>
    ipcRenderer.invoke('project:memory-files', projectPath),
  // Control API (Jarvis etc.) asks the UI to open a tab; the handler returns the tab id.
  onControlOpenTab: (handler: (req: { projectId: string; command?: string }) => string): (() => void) => {
    const listener = (_e: any, req: { reqId: string; projectId: string; command?: string }) => {
      ipcRenderer.send('control:open-tab-reply', req.reqId, handler(req));
    };
    ipcRenderer.on('control:open-tab', listener);
    return () => { ipcRenderer.removeListener('control:open-tab', listener); };
  },
  copyToClipboard: (text: string): Promise<void> =>
    ipcRenderer.invoke('clipboard:write', text),
  // File.path was removed in Electron 32; this is the supported replacement for drag & drop.
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),

  // Embedded Terminal PTY APIs
  ptyCreate: (opts: { id: string; cwd: string; initialCommand?: string; cols?: number; rows?: number }): Promise<{ success: boolean; pid?: number; error?: string }> =>
    ipcRenderer.invoke('pty:create', opts),
  ptyWrite: (id: string, data: string): void => {
    ipcRenderer.send('pty:write', { id, data });
  },
  ptyResize: (id: string, cols: number, rows: number): void => {
    ipcRenderer.send('pty:resize', { id, cols, rows });
  },
  ptyKill: (id: string): Promise<void> =>
    ipcRenderer.invoke('pty:kill', { id }),
  onPtyStatus: (callback: (info: { id: string; status: PtyStatus }) => void): (() => void) => {
    const listener = (_e: any, info: { id: string; status: PtyStatus }) => callback(info);
    ipcRenderer.on('pty:status', listener);
    return () => { ipcRenderer.removeListener('pty:status', listener); };
  },
  onPtyFailed: (callback: (info: { id: string; code: number }) => void): (() => void) => {
    const listener = (_e: any, info: { id: string; code: number }) => callback(info);
    ipcRenderer.on('pty:failed', listener);
    return () => { ipcRenderer.removeListener('pty:failed', listener); };
  },
  ptyResources: (): Promise<{ id: string; cpu: number; memMB: number }[]> => ipcRenderer.invoke('pty:resources'),
  onPtyLimit: (callback: (info: { id: string }) => void): (() => void) => {
    const listener = (_e: any, info: { id: string }) => callback(info);
    ipcRenderer.on('pty:limit', listener);
    return () => { ipcRenderer.removeListener('pty:limit', listener); };
  },
  writeHandoff: (projectPath: string, fromAgent: string, sessionFile?: string): Promise<{ path?: string; error?: string }> =>
    ipcRenderer.invoke('handoff:write', projectPath, fromAgent, sessionFile),
  pickFile: (title: string): Promise<string | null> => ipcRenderer.invoke('dialog:pick-file', title),
  setupScan: (): Promise<{ agents: { id: string; path: string | null }[]; projects: SetupProject[] }> => ipcRenderer.invoke('setup:scan'),
  addWorktree: (repoPath: string): Promise<{ path?: string; error?: string }> => ipcRenderer.invoke('git:worktree-add', repoPath),
  setBadge: (count: number): void => ipcRenderer.send('app:badge', count),
  focusApp: (): void => ipcRenderer.send('app:focus'),
  onPtyData: (id: string, callback: (data: string) => void): (() => void) => {
    const channel = `pty:data:${id}`;
    const listener = (_e: any, data: string) => callback(data);
    ipcRenderer.on(channel, listener);
    return () => {
      ipcRenderer.removeListener(channel, listener);
    };
  },
  onPtyExit: (id: string, callback: (info: { exitCode: number; signal?: number }) => void): (() => void) => {
    const channel = `pty:exit:${id}`;
    const listener = (_e: any, info: any) => callback(info);
    ipcRenderer.on(channel, listener);
    return () => {
      ipcRenderer.removeListener(channel, listener);
    };
  }
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

