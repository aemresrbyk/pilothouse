import { contextBridge, ipcRenderer } from 'electron';
import { ProjectItem, AppSettings, TerminalOption, FileItem } from '../src/types';

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
  readFile: (filePath: string): Promise<{ content: string; truncated: boolean }> =>
    ipcRenderer.invoke('project:read-file', filePath),
  saveFile: (filePath: string, content: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('project:save-file', filePath, content),
  getGitStatus: (dirPath: string): Promise<{ isGit: boolean; branch: string; modifiedCount: number; statusText: string }> =>
    ipcRenderer.invoke('project:git-status', dirPath),
  getSystemHealth: (): Promise<{ claudeInstalled: boolean; claudePath: string; claudeVersion: string; nodeVersion: string }> =>
    ipcRenderer.invoke('system:health'),
  getSessions: (projectPath: string): Promise<ClaudeSession[]> =>
    ipcRenderer.invoke('project:get-sessions', projectPath),
  validatePath: (targetPath: string): Promise<{ exists: boolean; isDirectory: boolean }> =>
    ipcRenderer.invoke('system:validate-path', targetPath),
  copyToClipboard: (text: string): Promise<void> =>
    ipcRenderer.invoke('clipboard:write', text),

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

