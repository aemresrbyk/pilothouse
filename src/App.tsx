import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  FolderPlus,
  Terminal,
  UploadCloud,
  Mic,
  Loader2
} from 'lucide-react';
import { startRecording, Recording } from './utils/voice';
import { WakeWordDetector, startWakeListener, WakeListener } from './utils/wakeword';
import { ProjectItem, ProjectFlags, AppSettings, TabSession, AppTheme, PtyStatus, agentById, agentBinary, agentFlagPresets } from './types';
import { THEMES, ThemeConfig } from './theme';
import { ChromeTabBar } from './components/ChromeTabBar';
import { TabWorkspace } from './components/TabWorkspace';
import { SettingsModal } from './components/SettingsModal';
import { AddProjectModal } from './components/AddProjectModal';
import { CommandPaletteModal } from './components/CommandPaletteModal';
import {
  isSoundEnabled,
  toggleSound,
  playClickSound,
  playLaunchSound
} from './utils/audio';

export const App: React.FC = () => {
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [tabs, setTabs] = useState<TabSession[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>('');
  const [theme, setTheme] = useState<AppTheme>('claude');

  const [settings, setSettings] = useState<AppSettings>({
    theme: 'claude',
    defaultTerminal: 'Terminal',
    defaultEditor: 'VSCode',
    defaultFlags: [],
    claudePath: 'claude',
    autoDetectOnStartup: true,
    soundEnabled: true
  });

  const [isSyncing, setIsSyncing] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [healthInfo, setHealthInfo] = useState<{ claudeInstalled: boolean; claudeVersion: string } | null>(null);
  const [toast, setToast] = useState<{ message: string; type?: 'info' | 'success' | 'error' } | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Modals
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAddProjectOpen, setIsAddProjectOpen] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);

  const themeConfig: ThemeConfig = useMemo(() => {
    return THEMES[theme] || THEMES.claude;
  }, [theme]);

  const showToast = (message: string, type: 'info' | 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadData = async () => {
    try {
      const [projs, setts] = await Promise.all([
        window.electronAPI.getProjects(),
        window.electronAPI.getSettings()
      ]);
      setProjects(projs);
      setSettings(setts);

      if (setts.theme && THEMES[setts.theme]) {
        setTheme(setts.theme);
      }

      window.electronAPI.getSystemHealth?.().then((h) => {
        if (h) setHealthInfo(h);
      }).catch(() => {});

      // Restore saved tabs or initialize
      if (setts.savedTabs && setts.savedTabs.length > 0) {
        const validTabs = setts.savedTabs.filter((t) => projs.some((p) => p.id === t.projectId));
        if (validTabs.length > 0) {
          setTabs(validTabs);
          setActiveTabId(setts.activeTabId && validTabs.some((t) => t.id === setts.activeTabId) ? setts.activeTabId : validTabs[0].id);
          return;
        }
      }

      // Default: open initial project tabs
      if (projs.length > 0) {
        const initialProjs = projs.slice(0, Math.min(3, projs.length));
        const initialTabs: TabSession[] = initialProjs.map((p) => ({
          id: `tab-${p.id}`,
          projectId: p.id,
          customInput: '',
          isLaunched: true
        }));
        setTabs(initialTabs);
        setActiveTabId(initialTabs[0].id);
      }
    } catch (err) {
      console.error('Error loading data:', err);
    }
  };

  useEffect(() => {
    loadData();
    setSoundOn(isSoundEnabled());
  }, []);

  // Save tabs state on changes (debounced)
  useEffect(() => {
    if (projects.length > 0) {
      const timer = setTimeout(() => {
        window.electronAPI.updateSettings({
          savedTabs: tabs,
          activeTabId,
          theme
        });
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [tabs, activeTabId, theme, projects.length]);

  const handleSelectTheme = (newTheme: AppTheme) => {
    setTheme(newTheme);
    window.electronAPI.updateSettings({ theme: newTheme });
  };

  const handleSyncClaude = async () => {
    setIsSyncing(true);
    try {
      const res = await window.electronAPI.syncFromClaude();
      await loadData();
      if (res.addedCount > 0) {
        showToast(`DISCOVERED & SYNCED ${res.addedCount} REPOSITORIES`);
      } else {
        showToast('ALL CLAUDE REPOSITORIES ARE UP TO DATE', 'info');
      }
    } catch (err: any) {
      showToast(`SYNC FAILED: ${err.message}`, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  // Tab Operations
  const handleSelectTab = (tabId: string) => {
    setActiveTabId(tabId);
  };

  const handleCloseTab = (tabId: string) => {
    const remaining = tabs.filter((t) => t.id !== tabId);
    setTabs(remaining);
    if (activeTabId === tabId) {
      setActiveTabId(remaining.length > 0 ? remaining[remaining.length - 1].id : '');
    }
  };

  const handleRemoveProject = async (projectId: string) => {
    const proj = projects.find((p) => p.id === projectId);
    await window.electronAPI.removeProject(projectId);
    const remaining = tabs.filter((t) => t.projectId !== projectId);
    setTabs(remaining);
    if (!remaining.some((t) => t.id === activeTabId)) {
      setActiveTabId(remaining.length > 0 ? remaining[remaining.length - 1].id : '');
    }
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    showToast(`REMOVED: ${proj?.name || 'project'} (files untouched)`, 'info');
  };

  const handleNewTab = (projectId?: string, initialCommand?: string): string => {
    if (!projectId) {
      setIsPaletteOpen(true);
      return '';
    }

    const newTabId = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newTab: TabSession = {
      id: newTabId,
      projectId,
      customInput: '',
      isLaunched: true,
      ...(initialCommand ? { initialCommand } : {})
    };

    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTabId);
    showToast(initialCommand
      ? `RUNNING: ${initialCommand}`
      : `OPENED TERMINAL: ${projects.find((p) => p.id === projectId)?.name || 'Project'}`);
    return newTabId;
  };

  // Control API (Jarvis): focus the project's Claude tab or open one; with a command, always a new tab.
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const newTabRef = useRef(handleNewTab);
  newTabRef.current = handleNewTab;
  useEffect(() => window.electronAPI.onControlOpenTab?.(({ projectId, command }) => {
    if (!command) {
      const existing = tabsRef.current.find((t) => t.projectId === projectId && !t.initialCommand);
      if (existing) {
        setActiveTabId(existing.id);
        return existing.id;
      }
    }
    return newTabRef.current(projectId, command);
  }), []);

  // Agent status per tab (guessed from PTY output in main). unseen = it finished or asked for approval while you looked elsewhere.
  const [tabStatus, setTabStatus] = useState<Record<string, { status: PtyStatus; unseen: boolean }>>({});
  const statusCtx = useRef({ tabs, projects, activeTabId, notify: true });
  statusCtx.current = { tabs, projects, activeTabId, notify: settings.notificationsEnabled !== false };

  useEffect(() => window.electronAPI.onPtyStatus(({ id, status }) => {
    const ctx = statusCtx.current;
    const tab = ctx.tabs.find((t) => t.id === id);
    if (!tab) return;
    const looking = id === ctx.activeTabId && document.hasFocus();
    // Run-command tabs (dev servers …) get a dot but never nag.
    const attention = status !== 'running' && !looking && !tab.initialCommand;
    setTabStatus((prev) => ({ ...prev, [id]: { status, unseen: attention } }));
    if (attention && ctx.notify) {
      const name = ctx.projects.find((p) => p.id === tab.projectId)?.name || 'Project';
      const n = new Notification(name, { body: status === 'waiting' ? 'Needs your approval' : 'Finished, your turn' });
      n.onclick = () => {
        window.electronAPI.focusApp();
        setActiveTabId(id);
      };
    }
  }), []);

  // Looking at a tab clears its "unseen" mark.
  useEffect(() => {
    const clear = () => {
      if (!document.hasFocus()) return;
      setTabStatus((prev) => (prev[activeTabId]?.unseen ? { ...prev, [activeTabId]: { ...prev[activeTabId], unseen: false } } : prev));
    };
    clear();
    window.addEventListener('focus', clear);
    return () => window.removeEventListener('focus', clear);
  }, [activeTabId]);

  // Dock badge: tabs that need you (unseen result or pending approval).
  useEffect(() => {
    window.electronAPI.setBadge(tabs.filter((t) => tabStatus[t.id]?.unseen || tabStatus[t.id]?.status === 'waiting').length);
  }, [tabStatus, tabs]);

  // Voice prompts: hotkey or mic button -> record until a pause -> local Whisper -> typed into the active tab.
  type VoicePhase = 'idle' | 'listening' | 'transcribing' | 'needs-model' | 'downloading';
  const [voice, setVoice] = useState<{ phase: VoicePhase; level?: number; progress?: number; note?: string }>({ phase: 'idle' });
  const recRef = useRef<Recording | null>(null);
  const voicePhase = useRef<VoicePhase>('idle');
  voicePhase.current = voice.phase;
  const voiceCtx = useRef({ activeTabId, projects, settings, tabs });
  voiceCtx.current = { activeTabId, projects, settings, tabs };

  const flashVoice = (note: string) => {
    setVoice({ phase: 'idle', note });
    setTimeout(() => setVoice((v) => (v.phase === 'idle' && v.note === note ? { phase: 'idle' } : v)), 6000);
  };

  const toggleVoice = async () => {
    if (recRef.current) return recRef.current.stop();
    if (voicePhase.current === 'transcribing' || voicePhase.current === 'downloading') return;
    const st = await window.electronAPI.voiceStatus();
    if (!st.binary) return flashVoice('The speech engine is missing from this build.');
    if (!st.model) return setVoice({ phase: 'needs-model' });
    if (!(await window.electronAPI.voiceMicAccess())) {
      return flashVoice('Microphone access is off. Allow Pilothouse in System Settings → Privacy & Security → Microphone.');
    }
    let rec: Recording;
    try {
      rec = await startRecording((level) => setVoice((v) => (v.phase === 'listening' ? { ...v, level } : v)));
    } catch (err: any) {
      return flashVoice(`Microphone error: ${err.message}`);
    }
    recRef.current = rec;
    setVoice({ phase: 'listening', level: 0 });
    const pcm = await rec.result;
    recRef.current = null;
    if (!pcm) return flashVoice("Didn't hear anything.");
    setVoice({ phase: 'transcribing' });
    const ctx = voiceCtx.current;
    const res = await window.electronAPI.voiceTranscribe(pcm, ctx.settings.voiceLanguage || 'auto', `Projects: ${ctx.projects.map((p) => p.name).join(', ')}.`);
    if (res.error) return flashVoice(res.error);
    if (!res.text) return flashVoice("Didn't catch that, try again.");
    const tab = ctx.tabs.find((t) => t.id === ctx.activeTabId);
    if (!tab) return flashVoice(`Heard "${res.text}", but no tab is open.`);
    window.electronAPI.ptyWrite(tab.id, res.text);
    // Enter separately so the agent's TUI doesn't treat it as part of the paste.
    if (ctx.settings.voiceAutoSend) setTimeout(() => window.electronAPI.ptyWrite(tab.id, '\r'), 150);
    flashVoice(`${ctx.settings.voiceAutoSend ? 'Sent' : 'Typed (press Enter to send)'}: ${res.text}`);
  };
  const toggleVoiceRef = useRef(toggleVoice);
  toggleVoiceRef.current = toggleVoice;

  const downloadVoiceModel = async () => {
    setVoice({ phase: 'downloading', progress: 0 });
    const r = await window.electronAPI.voiceDownloadModel();
    if (!r.success) return flashVoice(`Download failed: ${r.error}`);
    setVoice({ phase: 'idle' });
    toggleVoiceRef.current();
  };

  useEffect(() => window.electronAPI.onVoiceEvent((event, data) => {
    if (event === 'toggle') toggleVoiceRef.current();
    else if (event === 'progress') setVoice((v) => (v.phase === 'downloading' ? { ...v, progress: data.received / data.total } : v));
    else if (event === 'error') flashVoice(String(data));
  }), []);

  // "Hey Pilothouse": keep a wake-word listener running while the setting is on; it starts a voice prompt.
  useEffect(() => {
    if (!settings.wakeWordEnabled) return;
    let cancelled = false;
    let listener: WakeListener | null = null;
    (async () => {
      const assets = await window.electronAPI.wakeAssets();
      if ('error' in assets) return flashVoice(`"Hey Pilothouse" is unavailable: ${assets.error}`);
      if (!(await window.electronAPI.voiceMicAccess())) {
        return flashVoice('Microphone access is off. Allow Pilothouse in System Settings → Privacy & Security → Microphone.');
      }
      const detector = await WakeWordDetector.create(assets);
      if (cancelled) return;
      listener = await startWakeListener(
        detector,
        () => {
          window.electronAPI.focusApp();
          playLaunchSound();
          toggleVoiceRef.current();
        },
        () => voicePhase.current !== 'idle'
      );
      if (cancelled) listener.stop();
    })().catch((err) => flashVoice(`"Hey Pilothouse" failed to start: ${err.message}`));
    return () => {
      cancelled = true;
      listener?.stop();
    };
  }, [settings.wakeWordEnabled]);

  // The menu bar's "Stop Listening" changes settings from main.
  useEffect(() => window.electronAPI.onSettingsChanged((s) => setSettings(s)), []);

  // Esc while listening throws the recording away.
  useEffect(() => {
    if (voice.phase !== 'listening') return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { recRef.current?.cancel(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [voice.phase]);

  const handleBrowseFolder = async () => {
    try {
      const dir = await window.electronAPI.pickDirectory();
      if (dir) {
        await handleAddProject(dir);
      }
    } catch (err: any) {
      showToast(`Browse failed: ${err.message}`, 'error');
    }
  };

  const handleUpdateFlags = async (projectId: string, flags: ProjectFlags) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, flags } : p))
    );
    await window.electronAPI.updateProject(projectId, { flags });
  };

  // Each agent keeps its own flags per project, so switching back restores them.
  const handleSwitchAgent = (projectId: string, agentId: string) => {
    const p = projects.find((x) => x.id === projectId);
    if (!p || (p.agent || 'claude') === agentId) return;
    const agentFlags = { ...(p.agentFlags || {}), [p.agent || 'claude']: p.flags };
    const updates = { agent: agentId, flags: agentFlags[agentId] || [], agentFlags };
    setProjects((prev) => prev.map((x) => (x.id === projectId ? { ...x, ...updates } : x)));
    window.electronAPI.updateProject(projectId, updates);
  };

  const handleAddProject = async (folderPath: string) => {
    try {
      const newProj = await window.electronAPI.addProject(folderPath);
      await loadData();
      handleNewTab(newProj.id);
      showToast(`REGISTERED: ${newProj.name}`);
    } catch (err: any) {
      showToast(`FAILED: ${err.message}`, 'error');
    }
  };

  const handleOpenFolder = async (path: string) => {
    await window.electronAPI.openFolder(path);
  };

  const handleOpenEditor = async (path: string, editor?: string) => {
    await window.electronAPI.openInEditor(path, editor || settings.defaultEditor);
  };

  const handleSaveSettings = async (newSettings: Partial<AppSettings>) => {
    const updated = await window.electronAPI.updateSettings(newSettings);
    setSettings(updated);
    if (newSettings.theme) {
      setTheme(newSettings.theme);
    }
    showToast('PREFERENCES STORED');
  };

  // Drag and Drop folder handling
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDraggingOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      const targetPath = window.electronAPI.getPathForFile(file);
      if (targetPath) {
        const check = await window.electronAPI.validatePath(targetPath);
        if (check.exists && check.isDirectory) {
          playClickSound();
          handleAddProject(targetPath);
        } else {
          showToast('Dropped item is not a directory', 'error');
        }
      }
    }
  };

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + P or Cmd/Ctrl + K -> Command Palette
      if ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === 'p' || e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        playClickSound();
        setIsPaletteOpen(true);
        return;
      }

      // Cmd/Ctrl + T -> Open New Tab / Project Selector
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 't') {
        e.preventDefault();
        playClickSound();
        setIsPaletteOpen(true);
      }

      // Cmd/Ctrl + W -> Close active tab
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'w') {
        if (tabs.length > 1 && activeTabId) {
          e.preventDefault();
          playClickSound();
          handleCloseTab(activeTabId);
        }
      }

      // Cmd/Ctrl + 1..9 -> Switch tab
      if ((e.metaKey || e.ctrlKey) && /^[1-9]$/.test(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        if (tabs[idx]) {
          e.preventDefault();
          playClickSound();
          setActiveTabId(tabs[idx].id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tabs, activeTabId, projects]);

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="flex flex-col h-screen w-screen overflow-hidden font-mono relative"
      style={{
        backgroundColor: themeConfig.bgMain,
        color: themeConfig.textPrimary
      }}
    >
      {/* 1. Google Chrome Style Tab Bar (with dedicated traffic light gap & theme picker) */}
      <ChromeTabBar
        tabs={tabs}
        activeTabId={activeTabId}
        tabStatus={tabStatus}
        projects={projects}
        onSelectTab={handleSelectTab}
        onCloseTab={handleCloseTab}
        onNewTab={handleNewTab}
        onBrowseFolder={handleBrowseFolder}
        onOpenAddModal={() => setIsAddProjectOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenPalette={() => setIsPaletteOpen(true)}
        voiceActive={voice.phase === 'listening'}
        voiceHotkey={settings.voiceHotkey || 'CommandOrControl+Shift+Space'}
        onToggleVoice={() => toggleVoiceRef.current()}
        onSyncClaude={handleSyncClaude}
        isSyncing={isSyncing}
        soundEnabled={soundOn}
        onToggleSound={() => setSoundOn(toggleSound())}
        currentTheme={theme}
        onSelectTheme={handleSelectTheme}
        themeConfig={themeConfig}
      />

      {/* 2. Embedded Terminal Workspace Area (All tabs preserved in DOM) */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {tabs.length > 0 ? (
          tabs.map((tab) => {
            const proj = projects.find((p) => p.id === tab.projectId);
            if (!proj) return null;
            const isTabActive = tab.id === activeTabId;

            return (
              <div
                key={tab.id}
                className="flex-1 w-full h-full flex flex-col overflow-hidden"
                style={{ display: isTabActive ? 'flex' : 'none' }}
              >
                <TabWorkspace
                  project={proj}
                  tabSession={tab}
                  onUpdateFlags={handleUpdateFlags}
                  onOpenFolder={handleOpenFolder}
                  onOpenEditor={handleOpenEditor}
                  themeConfig={themeConfig}
                  isActive={isTabActive}
                  agent={agentById(proj.agent)}
                  agentBinary={agentBinary(agentById(proj.agent), settings.claudePath)}
                  flagPresets={agentFlagPresets(settings, proj.agent)}
                  onSwitchAgent={handleSwitchAgent}
                  onRunCommand={(cmd) => handleNewTab(proj.id, cmd)}
                  onSaveCustomCommands={async (cmds) => {
                    const updated = await window.electronAPI.updateProject(proj.id, { customRunCommands: cmds });
                    if (updated) setProjects((prev) => prev.map((p) => (p.id === proj.id ? { ...p, customRunCommands: cmds } : p)));
                  }}
                />
              </div>
            );
          })
        ) : (
          <div
            className="flex-1 flex flex-col items-center justify-center p-8 select-none text-center"
            style={{ backgroundColor: themeConfig.bgMain }}
          >
            <Terminal className="w-10 h-10 mb-3" style={{ color: themeConfig.accent }} />
            <h2 className="text-sm font-bold" style={{ color: themeConfig.textPrimary }}>
              NO PROJECT TERMINAL OPEN
            </h2>
            <p className="text-xs mt-1 max-w-xs" style={{ color: themeConfig.textMuted }}>
              Press ⌘T or click [+] to open a Claude Code terminal session.
            </p>
            {projects.length > 0 && (
              <button
                onClick={() => handleNewTab(projects[0].id)}
                className="mt-4 px-4 py-2 rounded-lg text-xs font-bold text-white shadow-md transition-all active:scale-95"
                style={{ backgroundColor: themeConfig.accent }}
              >
                Open {projects[0].name}
              </button>
            )}
          </div>
        )}
      </div>

      {/* 3. Minimalist Clean Footer */}
      <footer
        className="h-6 px-3 flex items-center justify-between text-[10px] font-mono border-t select-none"
        style={{
          backgroundColor: themeConfig.bgHeader,
          borderColor: themeConfig.border,
          color: themeConfig.textMuted
        }}
      >
        <div className="flex items-center gap-3">
          <span
            onClick={() => setIsPaletteOpen(true)}
            className="cursor-pointer hover:opacity-100 transition-opacity"
          >
            <span style={{ color: themeConfig.accent }}>⌘P</span> Find
          </span>
          <span><span style={{ color: themeConfig.accent }}>⌘T</span> Tab</span>
          <span><span style={{ color: themeConfig.accent }}>⌘W</span> Close</span>
          <span><span style={{ color: themeConfig.accent }}>⌘1-9</span> Switch</span>
        </div>

        <div className="flex items-center gap-3">
          {healthInfo && (
            <div className="flex items-center gap-1.5" title={healthInfo.claudeVersion}>
              <span
                className="w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ backgroundColor: healthInfo.claudeInstalled ? '#10b981' : '#ef4444' }}
              />
              <span style={{ color: healthInfo.claudeInstalled ? themeConfig.textPrimary : '#ef4444' }}>
                {healthInfo.claudeInstalled ? `Claude ${healthInfo.claudeVersion.replace(' (Claude Code)', '')}` : 'Claude Not Found'}
              </span>
              <span>•</span>
            </div>
          )}
          <span>{tabs.length} SESSIONS ACTIVE</span>
          <span>•</span>
          <span>{themeConfig.name.toUpperCase()}</span>
        </div>
      </footer>

      {/* Drag & Drop Overlay */}
      {isDraggingOver && (
        <div className="absolute inset-0 z-50 bg-black/85 backdrop-blur-md border-2 border-dashed flex flex-col items-center justify-center animate-fade-in" style={{ borderColor: themeConfig.accent }}>
          <div className="p-4 rounded-2xl mb-3 animate-bounce" style={{ backgroundColor: themeConfig.accentBg, color: themeConfig.accent }}>
            <UploadCloud className="w-10 h-10" />
          </div>
          <h3 className="text-sm font-bold tracking-wider" style={{ color: themeConfig.textPrimary }}>
            DROP FOLDER HERE TO OPEN AS PROJECT TERMINAL
          </h3>
          <p className="text-xs mt-1" style={{ color: themeConfig.textMuted }}>
            Will register repository and open in a new tab.
          </p>
        </div>
      )}

      {/* Voice panel */}
      {(voice.phase !== 'idle' || voice.note) && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 max-w-[min(560px,90vw)] px-4 py-2.5 rounded-xl border shadow-2xl flex items-center gap-3 text-xs"
          style={{ backgroundColor: themeConfig.bgCard, borderColor: voice.phase === 'listening' ? '#ef4444' : themeConfig.border, color: themeConfig.textPrimary }}
        >
          {voice.phase === 'listening' && (
            <>
              <Mic className="w-4 h-4 flex-shrink-0 animate-pulse" style={{ color: '#ef4444' }} />
              <div className="w-16 h-1.5 rounded-full overflow-hidden flex-shrink-0" style={{ backgroundColor: themeConfig.border }}>
                <div className="h-full transition-all duration-75" style={{ width: `${Math.round((voice.level || 0) * 100)}%`, backgroundColor: '#ef4444' }} />
              </div>
              <span>Listening… I'll stop when you pause. <span style={{ color: themeConfig.textMuted }}>Esc cancels</span></span>
            </>
          )}
          {voice.phase === 'transcribing' && (
            <>
              <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" style={{ color: themeConfig.accent }} />
              <span>Transcribing on this Mac…</span>
            </>
          )}
          {voice.phase === 'needs-model' && (
            <>
              <Mic className="w-4 h-4 flex-shrink-0" style={{ color: themeConfig.accent }} />
              <span>Voice prompts need a one-time 574 MB speech model. It runs fully offline.</span>
              <button className="px-2 py-1 rounded font-bold text-white flex-shrink-0" style={{ backgroundColor: themeConfig.accent }} onClick={downloadVoiceModel}>
                Download
              </button>
              <button className="px-2 py-1 rounded flex-shrink-0" style={{ color: themeConfig.textMuted }} onClick={() => setVoice({ phase: 'idle' })}>
                Not now
              </button>
            </>
          )}
          {voice.phase === 'downloading' && (
            <>
              <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" style={{ color: themeConfig.accent }} />
              <span>Downloading speech model… {Math.round((voice.progress || 0) * 100)}%</span>
            </>
          )}
          {voice.phase === 'idle' && voice.note && <span className="truncate">{voice.note}</span>}
        </div>
      )}

      {/* Floating Toast Notification */}
      {toast && (
        <div className="fixed bottom-10 right-4 z-50 animate-fade-in font-mono text-xs shadow-2xl">
          <div
            className="px-3.5 py-2 rounded-lg border flex items-center gap-2 shadow-lg"
            style={{
              backgroundColor: themeConfig.bgCard,
              borderColor: toast.type === 'error' ? '#ef4444' : themeConfig.accent,
              color: toast.type === 'error' ? '#ef4444' : themeConfig.textPrimary
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: toast.type === 'error' ? '#ef4444' : themeConfig.accent }} />
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Modals */}
      <AddProjectModal
        isOpen={isAddProjectOpen}
        onClose={() => setIsAddProjectOpen(false)}
        onAddProject={handleAddProject}
      />

      <CommandPaletteModal
        isOpen={isPaletteOpen}
        onClose={() => setIsPaletteOpen(false)}
        projects={projects}
        currentProjectId={tabs.find((t) => t.id === activeTabId)?.projectId}
        themeConfig={themeConfig}
        onSelectProject={(pId) => handleNewTab(pId)}
        onRemoveProject={handleRemoveProject}
        onOpenAddModal={() => setIsAddProjectOpen(true)}
        onBrowseFolder={handleBrowseFolder}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSaveSettings={handleSaveSettings}
      />
    </div>
  );
};

export default App;
