import { app, BrowserWindow, ipcMain, dialog, shell, clipboard, globalShortcut, systemPreferences, Tray, Menu, nativeImage } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { execFile } from 'child_process';
import * as pty from 'node-pty';
import { autoUpdater } from 'electron-updater';
import { StorageManager } from './store';
import { getAvailableTerminals, launchInTerminal, buildClaudeCommand } from './terminal';
import { listProjectFiles, readFileContent, getProjectSessions, getCodexSessions, readTranscript, searchHistory, isSessionFile, saveFileContent, getGitStatusDetails, getSystemHealth, detectRunCommands, listMemoryFiles } from './scanner';
import { startControlServer, CONTROL_FILE, stripAnsi } from './control';
import { Activity, newActivity, noteOutput, nextStatus, hitLimit } from './activity';
import { startRemoteServer, pairingLink, resetPairCode, revokeDevice, listDevices, pushTargets, forgetPushTokens, sessionView, autoChoice, isRefusal, audit } from './remote';
import { apnsConfig, sendPush } from './push';
import { agentOfCommand, withClaudeStatus, ensureClaudeStatusHook } from './usage';
import http from 'http';
import { writeHandoff } from './handoff';
import { detectAgents, scanProjects } from './setup';
import { agentOptions } from './agentOptions';
import { geminiKeyStatus, setGeminiApiKey } from './geminiKey';
import { processUsage } from './resources';
import { whisperBinary, hasModel, downloadModel, transcribe, speak, stopSpeaking, MODEL_BYTES } from './voice';
import { ProjectItem, AppSettings, ClaudeSession, PtyStatus, agentById, agentBinary, buildAgentCommand } from '../src/types';

// The built directory structure
process.env.DIST = path.join(__dirname, '../dist');
process.env.VITE_PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(process.env.DIST, '../public');

let win: BrowserWindow | null = null;
let storage: StorageManager;
const ptySessions = new Map<string, pty.IPty>();
// cwd + recent output per PTY, so the control API can tell which project a terminal belongs to and read it back.
const ptyMeta = new Map<string, { cwd: string; buf: string; act: Activity; sender: Electron.WebContents; limited?: boolean; agent?: string }>();
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
    icon: path.join(process.env.VITE_PUBLIC || '', 'icon.png'), // Windows/Linux window + taskbar icon
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    autoHideMenuBar: true,
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    },
    show: false
  });

  // Started at login with the wake word on: stay in the menu bar until "Hey Pilothouse" or a click.
  const startHidden = app.getLoginItemSettings().wasOpenedAtLogin && storage?.getSettings().wakeWordEnabled;
  // The window has the full preload API (terminals, files). It must never show anything but Pilothouse itself:
  // no pop-ups, and no navigating away (a dropped file or link would otherwise replace the app with that page).
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => { if (url !== win?.webContents.getURL()) e.preventDefault(); });
  win.webContents.on('will-attach-webview', (e) => e.preventDefault());

  win.once('ready-to-show', () => {
    if (!startHidden) win?.show();
  });
  // While listening for the wake word, closing the window only hides it so the listener keeps running.
  win.on('close', (e) => {
    if (!quitting && storage?.getSettings().wakeWordEnabled) {
      e.preventDefault();
      win?.hide();
    }
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(process.env.DIST || '', 'index.html'));
  }
}

let quitting = false;
app.on('before-quit', () => { quitting = true; });

// Bundled assets: <Resources>/<sub> when packaged, <repo>/resources/<sub> in dev.
const resourceDir = (sub: string) => (app.isPackaged ? path.join(process.resourcesPath, sub) : path.join(app.getAppPath(), 'resources', sub));

let tray: Tray | null = null;
function applyWakeWord(settings: AppSettings) {
  if (settings.wakeWordEnabled && !tray) {
    // macOS: monochrome template that follows the menu bar colour. Elsewhere the colour app icon, since a black
    // template disappears on dark taskbars.
    const icon = process.platform === 'darwin'
      ? nativeImage.createFromPath(path.join(resourceDir('tray'), 'trayTemplate.png'))
      : nativeImage.createFromPath(path.join(process.env.VITE_PUBLIC || '', 'icon.png')).resize({ width: 32, height: 32 });
    if (process.platform === 'darwin') icon.setTemplateImage(true);
    tray = new Tray(icon);
    tray.setToolTip('Pilothouse: say "Hey Pilothouse"');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Listening for "Hey Pilothouse"', enabled: false },
      { label: 'Show Pilothouse', click: () => focusWindow() },
      {
        label: 'Stop Listening',
        click: () => {
          const s = storage.updateSettings({ wakeWordEnabled: false });
          applyWakeWord(s);
          win?.webContents.send('settings:changed', s);
        }
      },
      { type: 'separator' },
      { label: 'Quit Pilothouse', click: () => app.quit() }
    ]));
    tray.on('click', () => focusWindow());
  } else if (!settings.wakeWordEnabled && tray) {
    tray.destroy();
    tray = null;
  }
  // Electron has no login-item API on Linux.
  if (app.isPackaged && process.platform !== 'linux') app.setLoginItemSettings({ openAtLogin: !!settings.openAtLogin });
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
  // Unpackaged runs (npm start, dev) are the stock Electron binary: show Pilothouse's icon in the Dock anyway.
  if (!app.isPackaged && process.platform === 'darwin') app.dock?.setIcon(path.join(app.getAppPath(), 'build', 'icon.png'));
  // Windows/Linux: the default menu's accelerators (Ctrl+R reload, Ctrl+Shift+I devtools, Ctrl+W …) would steal
  // terminal and app keys. Text editing keys still work there without a menu; macOS needs its menu for them.
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
  storage = new StorageManager();
  try { ensureClaudeStatusHook(); } catch (err: any) { console.error('Claude status hook:', err.message); }
  registerIpcHandlers();
  createWindow();
  applyVoiceHotkey(storage.getSettings());
  applyWakeWord(storage.getSettings());
  // Tab status dots + "Claude finished / needs approval" notifications.
  setInterval(() => {
    const now = Date.now();
    for (const [id, m] of ptyMeta) {
      if (!ptySessions.has(id)) continue;
      const tail = stripAnsi(m.buf.slice(-2000)).slice(-600);
      const status = nextStatus(m.act, now, tail);
      if (status === m.act.status) continue;
      const prev = m.act.status;
      m.act.status = status;
      onAgentStatus(id, m, prev, status);
      if (m.sender.isDestroyed()) continue;
      m.sender.send('pty:status', { id, status });
      // Once per stop: the agent ran out of its plan's usage, so the UI can offer another agent.
      if (status === 'running') m.limited = false;
      else if (!m.limited && hitLimit(tail)) {
        m.limited = true;
        m.sender.send('pty:limit', { id });
      }
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
  if (storage.getSettings().remoteEnabled) applyRemote(true);
});

// Phone remote (Settings → Phone remote). Started and stopped live; the link carries the token.
let remote: { server: http.Server; url: string } | null = null;
let remoteError = '';
async function applyRemote(enabled: boolean) {
  remote?.server.close();
  remote = null;
  remoteError = '';
  if (!enabled) return;
  const r = await startRemoteServer({
    listProjects: () => storage.listStoredProjects(),
    sessions: () => [...ptyMeta.entries()].filter(([id]) => ptySessions.has(id)).map(([id, m]) => ({ id, cwd: m.cwd, status: m.act.status, buf: m.buf, agent: m.agent, limited: m.limited })),
    write: (id, data) => { const p = ptySessions.get(id); const m = ptyMeta.get(id); if (!p) return false; if (m) m.act.lastInput = Date.now(); p.write(data); return true; },
    openTab: (projectId) => openTabViaRenderer(projectId),
    resume: (projectId, agentId, sessionId) => {
      const agent = agentById(agentId);
      return openTabViaRenderer(projectId, buildAgentCommand(agent, agentBinary(agent, storage.getSettings()), [], undefined, sessionId));
    }
  });
  if ('error' in r) remoteError = r.error; else remote = r;
}
const remoteInfo = () => ({
  enabled: !!storage.getSettings().remoteEnabled,
  url: remote ? pairingLink(remote.url) : undefined,
  error: remoteError || undefined,
  devices: listDevices(),
  push: apnsConfig() ? 'direct' as const : 'relay' as const
});

// Auto-approval rules (every tab, phone or not) and phone notifications when an agent needs you or finishes.
const DEBUG = !!process.env.PILOTHOUSE_DEBUG;
function onAgentStatus(id: string, m: { cwd: string; buf: string; act: Activity }, prev: PtyStatus, status: PtyStatus) {
  if (DEBUG) console.log(`[status] ${path.basename(m.cwd)} ${prev} → ${status} remote=${!!remote} targets=${remote ? pushTargets().length : 0}`);
  if (status !== 'waiting' && !(status === 'idle' && prev === 'running')) return;
  const v = sessionView({ id, cwd: m.cwd, status, buf: m.buf }, storage.listStoredProjects());
  if (status === 'waiting') {
    const c = autoChoice(v, storage.getSettings().autoApproveRules || []);
    if (c) {
      m.act.lastInput = Date.now();
      ptySessions.get(id)?.write(c.key);
      audit('rule', 'auto-approve', v.project, `${c.label} | ${v.summary}`);
      return;
    }
  }
  // A tab that never got a message only replayed its startup (a resumed session): nothing finished for you.
  if (status === 'idle' && !m.act.lastInput) return;
  const targets = remote ? pushTargets() : [];
  if (!targets.length) return;
  const deny = v.choices.find(c => isRefusal(c.label)) || v.choices[v.choices.length - 1];
  const msg = status === 'waiting'
    ? {
        title: v.project,
        body: v.summary || 'Needs your approval',
        category: v.choices.length >= 2 ? (v.risk === 'danger' ? 'APPROVAL_RISKY' : 'APPROVAL') : undefined,
        data: { sid: id, sig: v.sig, approve: v.choices[0]?.key, deny: deny?.key }
      }
    : { title: v.project, body: 'Finished. Your turn.', data: { sid: id } };
  if (DEBUG) console.log(`[push] ${msg.title}: ${msg.body}`);
  sendPush(targets, msg).then(forgetPushTokens).catch((err) => console.error('Push failed:', err.message));
}

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

  // Setup wizard: an agent CLI the scan couldn't find.
  ipcMain.handle('dialog:pick-file', async (_e, title: string) => {
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, { title: String(title).slice(0, 100), properties: ['openFile', 'showHiddenFiles'] });
    return result.canceled ? null : result.filePaths[0] || null;
  });

  ipcMain.handle('gemini:key-status', async () => geminiKeyStatus());
  ipcMain.handle('gemini:set-key', async (_e, key: string) => setGeminiApiKey(String(key ?? '')));

  ipcMain.handle('agent:options', async (_e, agentId: string) =>
    agentOptions(agentId, agentBinary(agentById(agentId), storage.getSettings())));

  ipcMain.handle('setup:scan', async () => ({
    agents: await detectAgents(),
    projects: scanProjects(storage.listStoredProjects())
  }));

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

  ipcMain.handle('remote:info', async () => remoteInfo());
  ipcMain.handle('remote:set', async (_e, enabled: boolean) => {
    storage.updateSettings({ remoteEnabled: !!enabled });
    await applyRemote(!!enabled);
    return remoteInfo();
  });
  // New pairing code: the old QR stops working; paired phones stay until revoked one by one.
  ipcMain.handle('remote:reset', async () => { resetPairCode(); return remoteInfo(); });
  ipcMain.handle('remote:revoke', async (_e, deviceId: string) => { revokeDevice(deviceId); return remoteInfo(); });

  ipcMain.handle('settings:get', async () => {
    return storage.getSettings();
  });

  ipcMain.handle('settings:update', async (_e, newSettings: Partial<AppSettings>) => {
    const s = storage.updateSettings(newSettings);
    if ('wakeWordEnabled' in newSettings || 'openAtLogin' in newSettings) applyWakeWord(s);
    if ('voiceEnabled' in newSettings || 'voiceHotkey' in newSettings) {
      const err = applyVoiceHotkey(s);
      if (err) win?.webContents.send('voice:error', err);
    }
    return s;
  });

  const whisper = () => whisperBinary(app.isPackaged ? process.resourcesPath : undefined, app.getAppPath());
  // Wake word models + ORT's wasm binary, handed to the renderer as bytes (no file:// fetches in production).
  ipcMain.handle('wake:assets', async () => {
    const dir = resourceDir('wakeword');
    const wasm = app.isPackaged
      ? path.join(dir, 'ort-wasm-simd-threaded.wasm')
      : path.join(app.getAppPath(), 'node_modules', 'onnxruntime-web', 'dist', 'ort-wasm-simd-threaded.wasm');
    try {
      return {
        mel: fs.readFileSync(path.join(dir, 'melspectrogram.onnx')),
        embedding: fs.readFileSync(path.join(dir, 'embedding_model.onnx')),
        wake: fs.readFileSync(path.join(dir, 'hey_pilothouse.onnx')),
        wasm: fs.readFileSync(wasm)
      };
    } catch (err: any) {
      return { error: err.message };
    }
  });

  ipcMain.handle('tts:speak', async (_e, text: string, lang: string) => speak(String(text).slice(0, 2000), lang));
  ipcMain.on('tts:stop', () => stopSpeaking());

  // What the agent's screen ends with (approval prompts), as plain text.
  ipcMain.handle('pty:tail', async (_e, id: string, chars = 2000) => stripAnsi(ptyMeta.get(id)?.buf || '').slice(-chars));

  // The agent's last written answer since a moment, from its session log (clean text, unlike the screen).
  ipcMain.handle('agent:last-reply', async (_e, projectPath: string, agentId: string, since: number) => {
    const sessions = listSessions(projectPath, agentId).filter((s) => s.file && s.modifiedAt >= since - 5000);
    for (const s of sessions) {
      const msgs = readTranscript(s.file!);
      for (let i = msgs.length - 1; i >= 0; i--) {
        const m = msgs[i];
        if (m.role === 'assistant' && (!m.time || Date.parse(m.time) >= since - 2000)) return m.text;
      }
    }
    return null;
  });

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
      return await transcribe(bin, Buffer.from(pcm), language, prompt);
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
      : buildClaudeCommand(project.flags, project.customFlags, agentBinary(agentById(project.agent), settings));

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

    // execFile: no shell, so a folder name is never parsed as a command.
    const fallback = (err: Error | null) => { if (err) shell.openPath(dirPath); };
    if (process.platform === 'darwin') {
      execFile('open', ['-a', targetEditor === 'Cursor' ? 'Cursor' : 'Visual Studio Code', dirPath], fallback);
      return true;
    }

    // Windows / Linux. code/cursor are .cmd files on Windows, which need a shell; Windows paths cannot contain ".
    const cmd = targetEditor === 'Cursor' ? 'cursor' : 'code';
    if (process.platform === 'win32') execFile(cmd, [`"${dirPath}"`], { shell: true }, fallback);
    else execFile(cmd, [dirPath], fallback);
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
  // 'all' = every agent's sessions in one list, newest first, so you see what Claude and Codex both did.
  const listSessions = (projectPath: string, agentId?: string) =>
    (agentId === 'all'
      ? [...getProjectSessions(projectPath, true), ...getCodexSessions(projectPath)].sort((a, b) => b.modifiedAt - a.modifiedAt)
      : agentId === 'codex' ? getCodexSessions(projectPath) : getProjectSessions(projectPath, true)
    ).filter((s) => s.title);
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

  ipcMain.handle('handoff:write', async (_e, projectPath: string, fromAgent: string, sessionFile?: string) => {
    if (!storage.listStoredProjects().some((p) => p.path === projectPath)) return { error: 'Unknown project' };
    if (sessionFile && !isSessionFile(sessionFile)) return { error: 'Not a session file' };
    return writeHandoff(projectPath, fromAgent, sessionFile);
  });

  ipcMain.handle('pty:resources', async () => {
    const live = [...ptySessions.entries()];
    const usage = await processUsage(live.map(([, p]) => p.pid));
    return live.map(([id, p]) => ({ id, ...(usage.get(p.pid) || { cpu: 0, memMB: 0 }) }));
  });

  // A sibling folder <repo>-wt-<stamp> on its own branch, so a second agent can't overwrite the first one's files.
  ipcMain.handle('git:worktree-add', async (_e, repoPath: string): Promise<{ path?: string; error?: string }> => {
    if (!storage.listStoredProjects().some((p) => p.path === repoPath)) return { error: 'Unknown project' };
    const stamp = new Date().toISOString().replace(/\D/g, '').slice(2, 14);
    const dir = `${repoPath.replace(/[\\/]+$/, '')}-wt-${stamp}`;
    return new Promise((resolve) => execFile('git', ['-C', repoPath, 'worktree', 'add', '-b', `pilothouse/${stamp}`, dir],
      { timeout: 30_000 }, (err, _out, stderr) => resolve(err ? { error: String(stderr || err.message).trim() } : { path: dir })));
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
      // Where agent CLIs usually live on macOS/Linux; Windows keeps its own PATH (other separator, other folders).
      if (!isWin) cleanEnv.PATH = [`${home}/.local/bin`, '/opt/homebrew/bin', '/usr/local/bin', cleanEnv.PATH || ''].join(path.delimiter);
      // Apple Terminal's per-window session restore must not run inside our PTY.
      for (const k of ['TERM_PROGRAM', 'TERM_PROGRAM_VERSION', 'TERM_SESSION_ID']) delete cleanEnv[k];
      cleanEnv.TERM = 'xterm-256color';
      cleanEnv.COLORTERM = 'truecolor';

      const targetCwd = fs.existsSync(cwd) ? cwd : home;

      const safeCols = Math.max(80, Number(cols) || 80);
      const safeRows = Math.max(24, Number(rows) || 24);

      // On POSIX the command is handed to the shell directly (typing it in after a fixed delay lost
      // characters while slow rc files were still loading); an interactive shell takes over when it exits.
      const agent = initialCommand ? agentOfCommand(initialCommand) : undefined;
      // Claude tabs get a silent status line that saves plan usage for the phone (see usage.ts).
      const cmd = agent === 'claude' && !isWin ? withClaudeStatus(initialCommand!.trim()) : initialCommand?.trim();
      // Exit code 127 = command not found; usually means Claude Code isn't installed (fish has no $?, so it gets no hint).
      // Any other non-zero exit is reported with an invisible OSC 7777 marker, so the Inbox can list the tab as failed.
      // shortcut: POSIX shells only (not fish, not Windows cmd/PowerShell, which get the command typed in); add a
      // PowerShell `if (-not $?)` variant if Windows users need failure tracking.
      const hint = path.basename(shell) === 'fish' ? '' :
        `; __ph=$?; [ $__ph -eq 127 ] && printf '\\n\\033[33mCommand not found. Install the agent CLI, e.g.\\n  Claude Code: npm install -g @anthropic-ai/claude-code\\n  Codex:       npm install -g @openai/codex\\n  Gemini CLI:  npm install -g @google/gemini-cli\\nor set its path in Pilothouse Settings.\\033[0m\\n\\n'; [ $__ph -ne 0 ] && printf '\\033]7777;exit;%s\\007' $__ph`;
      const args = isWin ? [] : cmd ? ['-l', '-i', '-c', `${cmd}${hint}; exec "${shell}" -l`] : ['-l'];
      const ptyProcess = pty.spawn(shell, args, {
        name: 'xterm-256color',
        cols: safeCols,
        rows: safeRows,
        cwd: targetCwd,
        env: cleanEnv
      });

      ptySessions.set(id, ptyProcess);
      const meta = { cwd: targetCwd, buf: '', act: newActivity(Date.now()), sender: event.sender, agent };
      ptyMeta.set(id, meta);

      // A replaced/killed session must not touch the map entry or UI of its successor (same id).
      const isCurrent = () => ptySessions.get(id) === ptyProcess;

      ptyProcess.onData((data: string) => {
        if (!isCurrent()) return;
        meta.buf = (meta.buf + data).slice(-OUTPUT_KEEP);
        noteOutput(meta.act, Date.now());
        // shortcut: assumes printf's marker arrives in one chunk (it is one small write); buffer across chunks if it ever misses.
        const exit = /\x1b\]7777;exit;(\d+)\x07/.exec(data);
        try {
          if (!event.sender.isDestroyed()) {
            event.sender.send(`pty:data:${id}`, data);
            // 130 = Ctrl+C, the user stopped it on purpose.
            if (exit && exit[1] !== '130') event.sender.send('pty:failed', { id, code: Number(exit[1]) });
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
