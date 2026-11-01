import { app, BrowserWindow, ipcMain, dialog, shell, clipboard, globalShortcut, systemPreferences } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { exec } from 'child_process';
import * as pty from 'node-pty';
import { autoUpdater } from 'electron-updater';
import { StorageManager } from './store';
import { getAvailableTerminals, launchInTerminal, buildClaudeCommand } from './terminal';
import { listProjectFiles, readFileContent, getProjectSessions, getCodexSessions, readTranscript, searchHistory, isSessionFile, saveFileContent, getGitStatusDetails, getSystemHealth, detectRunCommands, listMemoryFiles } from './scanner';
import { startControlServer, CONTROL_FILE, stripAnsi } from './control';
import { Activity, newActivity, noteOutput, nextStatus } from './activity';
import { whisperBinary, hasModel, downloadModel, transcribe, MODEL_BYTES } from './voice';
import { ProjectItem, AppSettings, ClaudeSession, agentById, agentBinary } from '../src/types';

// The built directory structure
process.env.DIST = path.join(__dirname, '../dist');
process.env.VITE_PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(process.env.DIST, '../public');

let win: BrowserWindow | null = null;
let storage: StorageManager;
const ptySessions = new Map<string, pty.IPty>();
// cwd + recent output per PTY, so the control API can tell which project a terminal belongs to and read it back.
const ptyMeta = new Map<string, { cwd: string; buf: string; act: Activity; sender: Electron.WebContents }>();
const OUTPUT_KEEP = 60_000;
const pendingOpens = new Map<string, (tabId: string) => void>();

function focusWindow() {
  if (!win) createWindow();
  if (win?.isMinimized()) win.restore();
  win?.show();
  win?.focus();
}

function openTabViaRenderer(projectId: string, command?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!win || win.webContents.isDestroyed()) return reject(new Error('window not ready'));
    const reqId = Math.random().toString(36).slice(2);
    const timer = setTimeout(() => { pendingOpens.delete(reqId); reject(new Error('renderer did not answer')); }, 10_000);
    pendingOpens.set(reqId, (tabId) => { clearTimeout(timer); pendingOpens.delete(reqId); resolve(tabId); });
    win.webContents.send('control:open-tab', { reqId, projectId, command });
  });
}

// Vite dev server URL
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];

function createWindow() {
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
  storage = new StorageManager();
  registerIpcHandlers();
  createWindow();
  applyVoiceHotkey(storage.getSettings());
  // Tab status dots + "Claude finished / needs approval" notifications.
  setInterval(() => {
    const now = Date.now();
    for (const [id, m] of ptyMeta) {
      if (!ptySessions.has(id)) continue;
      const status = nextStatus(m.act, now, stripAnsi(m.buf.slice(-2000)).slice(-600));
      if (status === m.act.status) continue;
      m.act.status = status;
      if (!m.sender.isDestroyed()) m.sender.send('pty:status', { id, status });
    }
  }, 1000);
  if (app.isPackaged) {
    // Downloads from GitHub Releases, notifies, installs on quit. macOS only applies signed updates.
    const check = () => autoUpdater.checkForUpdatesAndNotify().catch((err) => console.error('Update check failed:', err.message));
    check();
    setInterval(check, 6 * 60 * 60 * 1000);
  }
  // Opt-in: other local tools can drive the app through it (Settings → Local control API).
  if (storage.getSettings().controlApiEnabled) startControlServer({
    listProjects: () => storage.listStoredProjects(),
    listTerminals: () => [...ptyMeta.entries()].map(([id, m]) => ({ id, cwd: m.cwd, alive: ptySessions.has(id) })),
    openTab: openTabViaRenderer,
    write: (id, data) => { const p = ptySessions.get(id); if (!p) return false; p.write(data); return true; },
    output: (id) => ptyMeta.get(id)?.buf || '',
    commands: (p) => [...(p.customRunCommands || []), ...detectRunCommands(p.path)]
  }, focusWindow);
});

// Voice hotkey works system-wide, so you can talk to the agent while another app is in front.
const DEFAULT_VOICE_HOTKEY = 'CommandOrControl+Shift+Space';
let voiceHotkey: string | null = null;
function applyVoiceHotkey(settings: AppSettings): string | null {
  if (voiceHotkey) globalShortcut.unregister(voiceHotkey);
  voiceHotkey = null;
  if (settings.voiceEnabled === false) return null; // on unless turned off
  const key = settings.voiceHotkey || DEFAULT_VOICE_HOTKEY;
  try {
    if (globalShortcut.register(key, () => win?.webContents.send('voice:toggle'))) voiceHotkey = key;
  } catch {}
  return voiceHotkey ? null : `Could not register ${key}; another app may be using it.`;
}

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  try { fs.unlinkSync(CONTROL_FILE); } catch {}
});

function registerIpcHandlers() {
  ipcMain.handle('projects:get', async () => {
    return storage.getProjects();
  });

  ipcMain.handle('projects:update', async (_e, id: string, updates: Partial<ProjectItem>) => {
    return storage.updateProject(id, updates);
  });

  ipcMain.handle('projects:add', async (_e, dirPath: string) => {
    const resolved = path.resolve(dirPath.trim().replace(/^~(?=$|[\\/])/, os.homedir()));
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      throw new Error(`Not a directory: ${resolved}`);
    }
    return storage.addProject(resolved);
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
    const s = storage.updateSettings(newSettings);
    if ('voiceEnabled' in newSettings || 'voiceHotkey' in newSettings) {
      const err = applyVoiceHotkey(s);
      if (err) win?.webContents.send('voice:error', err);
    }
    return s;
  });

  const whisper = () => whisperBinary(app.isPackaged ? process.resourcesPath : undefined, app.getAppPath());
  ipcMain.handle('voice:status', async () => ({ binary: !!whisper(), model: hasModel(), modelBytes: MODEL_BYTES }));
  ipcMain.handle('voice:download-model', async (e) => {
    try {
      await downloadModel((received, total) => { if (!e.sender.isDestroyed()) e.sender.send('voice:download-progress', { received, total }); });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle('voice:mic-access', async () =>
    process.platform !== 'darwin' || systemPreferences.getMediaAccessStatus('microphone') === 'granted' || systemPreferences.askForMediaAccess('microphone'));
  ipcMain.handle('voice:transcribe', async (_e, pcm: ArrayBuffer, language: string, prompt?: string) => {
    const bin = whisper();
    if (!bin) return { error: 'Speech engine (whisper-cli) is missing from this build.' };
    if (!hasModel()) return { error: 'Speech model not downloaded yet.' };
    try {
      return { text: await transcribe(bin, Buffer.from(pcm), language, prompt) };
    } catch (err: any) {
      return { error: err.message };
    }
  });

  ipcMain.handle('system:get-terminals', async () => {
    return getAvailableTerminals();
  });

  ipcMain.handle('project:launch', async (_e, projectId: string, customCommand?: string) => {
    const project = storage.getProject(projectId);
    if (!project) {
      return { success: false, error: 'Project not found' };
    }

    const settings = storage.getSettings();
    const command = (customCommand && customCommand.trim().length > 0)
      ? customCommand
      : buildClaudeCommand(project.flags, project.customFlags, agentBinary(agentById(project.agent), settings.claudePath));

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

  ipcMain.on('control:open-tab-reply', (_e, reqId: string, tabId: string) => {
    pendingOpens.get(reqId)?.(tabId);
  });

  ipcMain.on('app:badge', (_e, count: number) => app.setBadgeCount(Math.max(0, count | 0)));
  ipcMain.on('app:focus', () => focusWindow());

  ipcMain.handle('project:run-commands', async (_e, dirPath: string) => {
    return detectRunCommands(dirPath);
  });

  ipcMain.handle('project:memory-files', async (_e, projectPath: string) => {
    return listMemoryFiles(projectPath);
  });

  ipcMain.handle('project:list-files', async (_e, dirPath: string) => {
    return listProjectFiles(dirPath);
  });

  ipcMain.handle('project:read-file', async (_e, filePath: string) => {
    return readFileContent(filePath);
  });

  ipcMain.handle('project:save-file', async (_e, filePath: string, content: string) => {
    return saveFileContent(filePath, content);
  });

  ipcMain.handle('project:git-status', async (_e, dirPath: string) => {
    return getGitStatusDetails(dirPath);
  });

  ipcMain.handle('system:health', async () => {
    return getSystemHealth();
  });

  // Sessions without a user prompt (opened and closed) have nothing to resume.
  const listSessions = (projectPath: string, agentId?: string) =>
    (agentId === 'codex' ? getCodexSessions(projectPath) : getProjectSessions(projectPath, true)).filter((s) => s.title);
  ipcMain.handle('project:get-sessions', async (_e, projectPath: string, agentId?: string) => listSessions(projectPath, agentId));
  ipcMain.handle('history:transcript', async (_e, file: string) => (isSessionFile(file) ? readTranscript(file) : []));
  ipcMain.handle('history:search', async (_e, projectPath: string, agentId: string, query: string) =>
    searchHistory(listSessions(projectPath, agentId), query));

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
        // Drop Claude Code's own session markers so a launcher started from inside Claude doesn't leak them into new sessions.
        if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE' && k !== 'CLAUDECODE' && !k.startsWith('CLAUDE_CODE_')) {
          cleanEnv[k] = v;
        }
      }

      const home = os.homedir();
      const envPath = `${home}/.local/bin:/opt/homebrew/bin:/usr/local/bin:${cleanEnv.PATH || ''}`;
      cleanEnv.PATH = envPath;
      // Apple Terminal's per-window session restore must not run inside our PTY.
      for (const k of ['TERM_PROGRAM', 'TERM_PROGRAM_VERSION', 'TERM_SESSION_ID']) delete cleanEnv[k];
      cleanEnv.TERM = 'xterm-256color';
      cleanEnv.COLORTERM = 'truecolor';

      const targetCwd = fs.existsSync(cwd) ? cwd : home;

      const safeCols = Math.max(80, Number(cols) || 80);
      const safeRows = Math.max(24, Number(rows) || 24);

      // On POSIX the command is handed to the shell directly (typing it in after a fixed delay lost
      // characters while slow rc files were still loading); an interactive shell takes over when it exits.
      const cmd = initialCommand?.trim();
      // Exit code 127 = command not found; usually means Claude Code isn't installed (fish has no $?, so it gets no hint).
      const hint = path.basename(shell) === 'fish' ? '' :
        `; [ $? -eq 127 ] && printf '\\n\\033[33mCommand not found. Install the agent CLI, e.g.\\n  Claude Code: npm install -g @anthropic-ai/claude-code\\n  Codex:       npm install -g @openai/codex\\n  Gemini CLI:  npm install -g @google/gemini-cli\\nor set its path in Pilothouse Settings.\\033[0m\\n\\n'`;
      const args = isWin ? [] : cmd ? ['-l', '-i', '-c', `${cmd}${hint}; exec "${shell}" -l`] : ['-l'];
      const ptyProcess = pty.spawn(shell, args, {
        name: 'xterm-256color',
        cols: safeCols,
        rows: safeRows,
        cwd: targetCwd,
        env: cleanEnv
      });

      ptySessions.set(id, ptyProcess);
      const meta = { cwd: targetCwd, buf: '', act: newActivity(Date.now()), sender: event.sender };
      ptyMeta.set(id, meta);

      // A replaced/killed session must not touch the map entry or UI of its successor (same id).
      const isCurrent = () => ptySessions.get(id) === ptyProcess;

      ptyProcess.onData((data: string) => {
        if (!isCurrent()) return;
        meta.buf = (meta.buf + data).slice(-OUTPUT_KEEP);
        noteOutput(meta.act, Date.now());
        try {
          if (!event.sender.isDestroyed()) {
            event.sender.send(`pty:data:${id}`, data);
          }
        } catch {}
      });

      ptyProcess.onExit(({ exitCode, signal }) => {
        if (!isCurrent()) return;
        try {
          if (!event.sender.isDestroyed()) {
            event.sender.send(`pty:exit:${id}`, { exitCode, signal });
          }
        } catch {}
        ptySessions.delete(id);
      });

      if (isWin && cmd) {
        setTimeout(() => {
          try {
            if (isCurrent()) {
              ptyProcess.write(`${cmd}\r`);
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
    const meta = ptyMeta.get(id);
    if (meta) meta.act.lastInput = Date.now();
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
    ptyMeta.delete(id);
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
