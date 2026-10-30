import { app, BrowserWindow, ipcMain, dialog, shell, clipboard } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { exec } from 'child_process';
import * as pty from 'node-pty';
import { StorageManager } from './store';
import { getAvailableTerminals, launchInTerminal, buildClaudeCommand } from './terminal';
import { listProjectFiles, readFileContent, getProjectSessions } from './scanner';
import { ProjectItem, AppSettings, ClaudeSession } from '../src/types';

// The built directory structure
process.env.DIST = path.join(__dirname, '../dist');
process.env.VITE_PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(process.env.DIST, '../public');

let win: BrowserWindow | null = null;
let storage: StorageManager;
const ptySessions = new Map<string, pty.IPty>();

// Vite dev server URL
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];

function createWindow() {
  storage = new StorageManager();

  win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 850,
    minHeight: 580,
    backgroundColor: '#0c0d12',
    icon: path.join(__dirname, '../public/icon.png'),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    },
    show: false
  });

  win.once('ready-to-show', () => {
    win?.show();
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(process.env.DIST || '', 'index.html'));
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();
});

function registerIpcHandlers() {
  ipcMain.handle('projects:get', async () => {
    return storage.getProjects();
  });

  ipcMain.handle('projects:update', async (_e, id: string, updates: Partial<ProjectItem>) => {
    return storage.updateProject(id, updates);
  });

  ipcMain.handle('projects:add', async (_e, dirPath: string) => {
    return storage.addProject(dirPath);
  });

  ipcMain.handle('projects:remove', async (_e, id: string) => {
    return storage.removeProject(id);
  });

  ipcMain.handle('dialog:pick-directory', async () => {
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      title: 'Select Claude Project Folder',
      properties: ['openDirectory', 'createDirectory']
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.handle('projects:sync', async () => {
    return storage.syncFromClaude();
  });

  ipcMain.handle('settings:get', async () => {
    return storage.getSettings();
  });

  ipcMain.handle('settings:update', async (_e, newSettings: Partial<AppSettings>) => {
    return storage.updateSettings(newSettings);
  });

  ipcMain.handle('system:get-terminals', async () => {
    return getAvailableTerminals();
  });

  ipcMain.handle('project:launch', async (_e, projectId: string, customCommand?: string) => {
    const projects = storage.getProjects();
    const project = projects.find(p => p.id === projectId);
    if (!project) {
      return { success: false, error: 'Project not found' };
    }

    const settings = storage.getSettings();
    const command = (customCommand && customCommand.trim().length > 0)
      ? customCommand
      : buildClaudeCommand(project.flags, project.customFlags, settings.claudePath || 'claude');

    const terminal = (project.terminalOverride && project.terminalOverride !== 'default')
      ? project.terminalOverride
      : settings.defaultTerminal;

    // Update last launched and history
    storage.updateProject(projectId, { lastLaunched: Date.now() });
    storage.addProjectHistory(projectId, command);

    return launchInTerminal(project.path, command, terminal);
  });

  ipcMain.handle('project:open-folder', async (_e, dirPath: string) => {
    if (fs.existsSync(dirPath)) {
      shell.openPath(dirPath);
    }
  });

  ipcMain.handle('project:open-editor', async (_e, dirPath: string, editor?: string) => {
    const settings = storage.getSettings();
    const targetEditor = editor || settings.defaultEditor || 'VSCode';

    if (process.platform === 'darwin') {
      const appName = targetEditor === 'Cursor' ? 'Cursor' : 'Visual Studio Code';
      exec(`open -a "${appName}" "${dirPath}"`, (err) => {
        if (err) {
          // Fallback to opening folder
          shell.openPath(dirPath);
        }
      });
      return true;
    }

    // Windows / Linux
    const cmd = targetEditor === 'Cursor' ? 'cursor' : 'code';
    exec(`${cmd} "${dirPath}"`, (err) => {
      if (err) {
        shell.openPath(dirPath);
      }
    });
    return true;
  });

  ipcMain.handle('project:list-files', async (_e, dirPath: string) => {
    return listProjectFiles(dirPath);
  });

  ipcMain.handle('project:read-file', async (_e, filePath: string) => {
    return readFileContent(filePath);
  });

  ipcMain.handle('project:get-sessions', async (_e, projectPath: string) => {
    return getProjectSessions(projectPath);
  });

  ipcMain.handle('system:validate-path', async (_e, targetPath: string) => {
    try {
      if (fs.existsSync(targetPath)) {
        const stat = fs.statSync(targetPath);
        return { exists: true, isDirectory: stat.isDirectory() };
      }
      return { exists: false, isDirectory: false };
    } catch {
      return { exists: false, isDirectory: false };
    }
  });

  ipcMain.handle('clipboard:write', async (_e, text: string) => {
    clipboard.writeText(text);
  });

  // Embedded Terminal PTY Handlers
  ipcMain.handle('pty:create', async (event, opts: { id: string; cwd: string; initialCommand?: string; cols?: number; rows?: number }) => {
    const { id, cwd, initialCommand, cols = 80, rows = 24 } = opts;

    if (ptySessions.has(id)) {
      try {
        ptySessions.get(id)?.kill();
      } catch {}
      ptySessions.delete(id);
    }

    try {
      const isWin = process.platform === 'win32';
      const shell = isWin
        ? (process.env.COMSPEC || 'powershell.exe')
        : (process.env.SHELL || '/bin/zsh');

      const cleanEnv: Record<string, string> = {};
      for (const [k, v] of Object.entries(process.env)) {
        if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') {
          cleanEnv[k] = v;
        }
      }

      const home = os.homedir();
      const envPath = `${home}/.local/bin:/opt/homebrew/bin:/usr/local/bin:${cleanEnv.PATH || ''}`;
      cleanEnv.PATH = envPath;
      cleanEnv.TERM = 'xterm-256color';
      cleanEnv.COLORTERM = 'truecolor';

      const targetCwd = fs.existsSync(cwd) ? cwd : home;

      const safeCols = Math.max(80, Number(cols) || 80);
      const safeRows = Math.max(24, Number(rows) || 24);

      const ptyProcess = pty.spawn(shell, isWin ? [] : ['-l'], {
        name: 'xterm-256color',
        cols: safeCols,
        rows: safeRows,
        cwd: targetCwd,
        env: cleanEnv
      });

      ptySessions.set(id, ptyProcess);

      ptyProcess.onData((data: string) => {
        try {
          if (!event.sender.isDestroyed()) {
            event.sender.send(`pty:data:${id}`, data);
          }
        } catch {}
      });

      ptyProcess.onExit(({ exitCode, signal }) => {
        try {
          if (!event.sender.isDestroyed()) {
            event.sender.send(`pty:exit:${id}`, { exitCode, signal });
          }
        } catch {}
        ptySessions.delete(id);
      });

      if (initialCommand && initialCommand.trim().length > 0) {
        setTimeout(() => {
          try {
            if (ptySessions.has(id)) {
              ptyProcess.write(`${initialCommand.trim()}\r`);
            }
          } catch {}
        }, 650);
      }

      return { success: true, pid: ptyProcess.pid };
    } catch (err: any) {
      console.error('PTY spawn error:', err);
      return { success: false, error: err.message };
    }
  });

  const handlePtyWrite = (_e: any, { id, data }: { id: string; data: string }) => {
    const ptyProc = ptySessions.get(id);
    if (ptyProc) {
      try {
        ptyProc.write(data);
      } catch {}
    }
  };
  ipcMain.on('pty:write', handlePtyWrite);
  ipcMain.handle('pty:write', handlePtyWrite);

  const handlePtyResize = (_e: any, { id, cols, rows }: { id: string; cols: number; rows: number }) => {
    const ptyProc = ptySessions.get(id);
    if (ptyProc && cols >= 40 && rows >= 8) {
      try {
        ptyProc.resize(cols, rows);
      } catch {}
    }
  };
  ipcMain.on('pty:resize', handlePtyResize);
  ipcMain.handle('pty:resize', handlePtyResize);

  ipcMain.handle('pty:kill', async (_e, { id }: { id: string }) => {
    const ptyProc = ptySessions.get(id);
    if (ptyProc) {
      try {
        ptyProc.kill();
      } catch {}
      ptySessions.delete(id);
    }
  });
}

app.on('before-quit', () => {
  for (const [, proc] of ptySessions.entries()) {
    try {
      proc.kill();
    } catch {}
  }
  ptySessions.clear();
});
