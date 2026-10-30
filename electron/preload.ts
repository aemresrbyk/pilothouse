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
  getSessions: (projectPath: string): Promise<ClaudeSession[]> =>
    ipcRenderer.invoke('project:get-sessions', projectPath),
  validatePath: (targetPath: string): Promise<{ exists: boolean; isDirectory: boolean }> =>
    ipcRenderer.invoke('system:validate-path', targetPath),
  copyToClipboard: (text: string): Promise<void> =>
    ipcRenderer.invoke('clipboard:write', text)
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

