import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  FolderPlus,
  Terminal,
  UploadCloud,
  Mic,
  Loader2,
  Volume2
} from 'lucide-react';
import { useVoice } from './hooks/useVoice';
import { ProjectItem, ProjectFlags, AppSettings, TabSession, AppTheme, PtyStatus, TabState, InboxEvent, PendingLaunch, handoffPrompt, agentById, agentBinary, agentFlagPresets } from './types';
import { InboxPanel } from './components/InboxPanel';
import { SetupWizard, SetupResult } from './components/SetupWizard';
import { isMac, isAppShortcut, keyLabel, tabKeyLabel } from './utils/platform';
import { THEMES, ThemeConfig, DEFAULT_THEME, themeOrDefault } from './theme';
import { ChromeTabBar } from './components/ChromeTabBar';
import { TabWorkspace } from './components/TabWorkspace';
import { SettingsModal } from './components/SettingsModal';
import { AddProjectModal } from './components/AddProjectModal';
import { CommandPaletteModal } from './components/CommandPaletteModal';
import {
  isSoundEnabled,
  toggleSound,
  playClickSound
} from './utils/audio';

export const App: React.FC = () => {
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [tabs, setTabs] = useState<TabSession[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>('');
  const [theme, setTheme] = useState<AppTheme>(DEFAULT_THEME);

  const [settings, setSettings] = useState<AppSettings>({
    theme: DEFAULT_THEME,
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
    return THEMES[theme] || THEMES[DEFAULT_THEME];
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
      if (!setts.setupDone) setIsSetupOpen(true);

      setTheme(themeOrDefault(setts.theme));

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
        showToast('PROJECTS ARE UP TO DATE', 'info');
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

  // Drag a tab onto another to move it there (also changes ⌘1-9 and grid order; terminals keep running).
  const handleMoveTab = (fromId: string, toId: string) => setTabs((prev) => {
    const from = prev.findIndex((t) => t.id === fromId), to = prev.findIndex((t) => t.id === toId);
    if (from < 0 || to < 0 || from === to) return prev;
    const next = [...prev];
    next.splice(to, 0, next.splice(from, 1)[0]);
    return next;
  });

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
  const [tabStatus, setTabStatus] = useState<Record<string, TabState>>({});
  // Inbox: activity log (newest first) + the time you left, when it opened itself on your return.
  const [events, setEvents] = useState<InboxEvent[]>([]);
  const logEvent = (e: InboxEvent) => setEvents((prev) => [e, ...prev].slice(0, 100));
  const [isInboxOpen, setIsInboxOpen] = useState(false);
  const [awaySince, setAwaySince] = useState<number | null>(null);
  const [gridMode, setGridMode] = useState(false);
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const statusCtx = useRef({ tabs, projects, activeTabId, notify: true });
  statusCtx.current = { tabs, projects, activeTabId, notify: settings.notificationsEnabled !== false };

  // Conversation mode waits on a tab's status changes.
  const statusListeners = useRef(new Map<string, Set<(s: PtyStatus) => void>>());

  useEffect(() => window.electronAPI.onPtyStatus(({ id, status }) => {
    statusListeners.current.get(id)?.forEach((fn) => fn(status));
    const ctx = statusCtx.current;
    const tab = ctx.tabs.find((t) => t.id === id);
    if (!tab) return;
    const looking = id === ctx.activeTabId && document.hasFocus();
    // Run-command tabs (dev servers …) get a dot but never nag.
    const attention = status !== 'running' && !looking && !tab.initialCommand;
    // A new run clears an earlier failure.
    setTabStatus((prev) => ({ ...prev, [id]: {
      status,
      unseen: attention,
      failed: status === 'running' ? undefined : prev[id]?.failed,
      limit: status === 'running' ? undefined : prev[id]?.limit
    } }));
    if (attention) logEvent({ tabId: id, kind: status === 'waiting' ? 'waiting' : 'finished', at: Date.now() });
    if (attention && ctx.notify) {
      const name = ctx.projects.find((p) => p.id === tab.projectId)?.name || 'Project';
      const n = new Notification(name, { body: status === 'waiting' ? 'Needs your approval' : 'Finished, your turn' });
      n.onclick = () => {
        window.electronAPI.focusApp();
        setActiveTabId(id);
      };
    }
  }), []);

  // A command exited with an error: its own Inbox section, apart from "needs your answer".
  useEffect(() => window.electronAPI.onPtyFailed(({ id, code }) => {
    const ctx = statusCtx.current;
    const tab = ctx.tabs.find((t) => t.id === id);
    if (!tab || (id === ctx.activeTabId && document.hasFocus())) return;
    setTabStatus((prev) => ({ ...prev, [id]: { status: prev[id]?.status || 'idle', unseen: true, failed: code } }));
    logEvent({ tabId: id, kind: 'failed', at: Date.now(), code });
    if (ctx.notify) {
      const n = new Notification(ctx.projects.find((p) => p.id === tab.projectId)?.name || 'Project', { body: `Failed (exit code ${code})` });
      n.onclick = () => { window.electronAPI.focusApp(); setActiveTabId(id); };
    }
  }), []);

  // The agent ran out of its plan's usage: offer to continue with another agent (Inbox + notification).
  useEffect(() => window.electronAPI.onPtyLimit(({ id }) => {
    const ctx = statusCtx.current;
    const tab = ctx.tabs.find((t) => t.id === id);
    if (!tab) return;
    setTabStatus((prev) => ({ ...prev, [id]: { status: prev[id]?.status || 'idle', unseen: true, failed: prev[id]?.failed, limit: true } }));
    logEvent({ tabId: id, kind: 'limit', at: Date.now() });
    setAwaySince(null);
    setIsInboxOpen(true);
    if (ctx.notify) {
      const n = new Notification(ctx.projects.find((p) => p.id === tab.projectId)?.name || 'Project', { body: 'Usage limit reached. Continue with another agent from the Inbox.' });
      n.onclick = () => { window.electronAPI.focusApp(); setIsInboxOpen(true); };
    }
  }), []);

  // Looking at a tab clears its "unseen" and "failed" marks.
  useEffect(() => {
    const clear = () => {
      if (!document.hasFocus()) return;
      setTabStatus((prev) => (prev[activeTabId]?.unseen || prev[activeTabId]?.failed !== undefined
        ? { ...prev, [activeTabId]: { ...prev[activeTabId], unseen: false, failed: undefined } } : prev));
    };
    clear();
    window.addEventListener('focus', clear);
    return () => window.removeEventListener('focus', clear);
  }, [activeTabId]);

  // Back after a while with something new: open the Inbox on what happened meanwhile.
  const eventsRef = useRef(events);
  eventsRef.current = events;
  useEffect(() => {
    let leftAt = 0;
    const onBlur = () => { leftAt = Date.now(); };
    const onFocus = () => {
      const since = leftAt;
      leftAt = 0;
      if (since && Date.now() - since >= 5 * 60_000 && eventsRef.current.some((e) => e.at >= since)) {
        setAwaySince(since);
        setIsInboxOpen(true);
      }
    };
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    return () => { window.removeEventListener('blur', onBlur); window.removeEventListener('focus', onFocus); };
  }, []);

  // Tabs that need you: unseen result, pending approval or a failure. Dock badge + Inbox count.
  const needsYou = tabs.filter((t) => tabStatus[t.id]?.unseen || tabStatus[t.id]?.limit || tabStatus[t.id]?.status === 'waiting').length;
  useEffect(() => {
    window.electronAPI.setBadge(needsYou);
  }, [needsYou]);

  const { voice, setVoice, toggleVoice, brainstorm, downloadVoiceModel, conversing } = useVoice({ activeTabId, projects, settings, tabs, statusListeners });

  // The menu bar's "Stop Listening" changes settings from main.
  useEffect(() => window.electronAPI.onSettingsChanged((s) => setSettings(s)), []);

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

  const handleAddProject = async (folderPath: string): Promise<string> => {
    try {
      const newProj = await window.electronAPI.addProject(folderPath);
      await loadData();
      const tabId = handleNewTab(newProj.id);
      showToast(`REGISTERED: ${newProj.name}`);
      return tabId;
    } catch (err: any) {
      showToast(`FAILED: ${err.message}`, 'error');
      return '';
    }
  };

  // Hand-off: write .pilothouse/handoff.md from the current agent's work, switch the project to the next agent and
  // restart the tab with a first prompt telling it to read that file.
  // sessionFile/fromAgentId: continue from a past conversation picked in History instead of the latest one.
  const [pendingLaunches, setPendingLaunches] = useState<Record<string, PendingLaunch>>({});
  const handleHandoff = async (tabId: string, toAgentId: string, sessionFile?: string, fromAgentId?: string) => {
    const tab = tabs.find((t) => t.id === tabId);
    const proj = projects.find((p) => p.id === tab?.projectId);
    if (!tab || !proj) return;
    const from = agentById(fromAgentId || proj.agent);
    const r = await window.electronAPI.writeHandoff(proj.path, from.id, sessionFile);
    if (!r.path) return showToast(`HAND-OFF FAILED: ${r.error || 'unknown error'}`, 'error');
    handleSwitchAgent(proj.id, toAgentId);
    setPendingLaunches((p) => ({ ...p, [tabId]: { prompt: handoffPrompt(from.name) } }));
    setTabStatus((prev) => ({ ...prev, [tabId]: { status: 'idle', unseen: false } }));
    setActiveTabId(tabId);
    setIsInboxOpen(false);
    showToast(`HANDED OFF: ${from.name} → ${agentById(toAgentId).name}`, 'success');
  };
  // Reopen a past session in the agent that wrote it, switching the project's agent if needed.
  const handleResumeAs = (tabId: string, agentId: string, sessionId: string) => {
    const proj = projects.find((p) => p.id === tabs.find((t) => t.id === tabId)?.projectId);
    if (!proj) return;
    handleSwitchAgent(proj.id, agentId);
    setPendingLaunches((p) => ({ ...p, [tabId]: { resumeId: sessionId } }));
  };

  // A new tab in its own git worktree + branch, registered as a project so it gets history, CLAUDE.md etc.
  // prompt: a task from Drafts & queue; it starts the new worktree's agent, so parallel tasks never share files.
  const handleOpenWorktree = async (projectPath: string, prompt?: string) => {
    const r = await window.electronAPI.addWorktree(projectPath);
    if (!r.path) return showToast(`WORKTREE FAILED: ${r.error || 'unknown error'}`, 'error');
    const tabId = await handleAddProject(r.path);
    if (tabId && prompt?.trim()) setPendingLaunches((p) => ({ ...p, [tabId]: { prompt: prompt.trim() } }));
  };

  const handleOpenFolder = async (path: string) => {
    await window.electronAPI.openFolder(path);
  };

  const handleOpenEditor = async (path: string, editor?: string) => {
    await window.electronAPI.openInEditor(path, editor || settings.defaultEditor);
  };

  // Setup wizard: store the agent paths, add/remove projects, set each project's agent.
  const handleFinishSetup = async ({ agentPaths, projects: rows }: SetupResult) => {
    setIsSetupOpen(false);
    const norm = (p: string) => p.replace(/[\\/]+$/, '');
    const current = await window.electronAPI.getProjects();
    let failed = 0;
    for (const r of rows) {
      const existing = current.find((p) => norm(p.path) === norm(r.path));
      try {
        if (existing && !r.include) await window.electronAPI.removeProject(existing.id); // only leaves the list; files untouched
        if (!r.include) continue;
        const proj = existing || await window.electronAPI.addProject(r.path);
        const from = proj.agent || 'claude';
        if (from !== r.agent) {
          // Same bookkeeping as switching agent in the toolbar: each agent keeps its own flags.
          const agentFlags = { ...(proj.agentFlags || {}), [from]: proj.flags };
          await window.electronAPI.updateProject(proj.id, { agent: r.agent, flags: agentFlags[r.agent] || [], agentFlags });
        }
      } catch {
        failed++;
      }
    }
    // Claude's path goes to its existing Settings field, so editing it there keeps working.
    const { claude, ...others } = agentPaths;
    setSettings(await window.electronAPI.updateSettings({ agentPaths: others, ...(claude ? { claudePath: claude } : {}), setupDone: true }));
    const projs = await window.electronAPI.getProjects();
    setProjects(projs);
    setTabs((prev) => prev.filter((t) => projs.some((p) => p.id === t.projectId)));
    showToast(failed ? `SETUP SAVED, ${failed} PROJECT(S) FAILED` : (rows.some((r) => r.include) ? `READY: ${rows.filter((r) => r.include).length} PROJECTS` : "READY. ADD A PROJECT TO START"), failed ? 'error' : 'success');
  };
  const handleSkipSetup = async () => {
    setIsSetupOpen(false);
    setSettings(await window.electronAPI.updateSettings({ setupDone: true }));
  };

  const handleSaveSettings = async (newSettings: Partial<AppSettings>) => {
    const updated = await window.electronAPI.updateSettings(newSettings);
    setSettings(updated);
    if (newSettings.theme) {
      setTheme(themeOrDefault(newSettings.theme));
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
      // ⌘P / ⌘K (Ctrl+Shift+P / K off macOS) -> Command Palette
      if (isAppShortcut(e, 'p') || isAppShortcut(e, 'k')) {
        e.preventDefault();
        playClickSound();
        setIsPaletteOpen(true);
        return;
      }

      // ⌘I -> Inbox
      if (isAppShortcut(e, 'i')) {
        e.preventDefault();
        setAwaySince(null);
        setIsInboxOpen((open) => !open);
        return;
      }

      // ⌘T -> Open New Tab / Project Selector
      if (isAppShortcut(e, 't')) {
        e.preventDefault();
        playClickSound();
        setIsPaletteOpen(true);
      }

      // ⌘W -> Close active tab
      if (isAppShortcut(e, 'w')) {
        if (tabs.length > 1 && activeTabId) {
          e.preventDefault();
          playClickSound();
          handleCloseTab(activeTabId);
        }
      }

      // Cmd/Ctrl + 1..9 -> Switch tab
      if ((isMac ? e.metaKey : e.ctrlKey) && /^[1-9]$/.test(e.key)) {
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
        onMoveTab={handleMoveTab}
        onNewTab={handleNewTab}
        onBrowseFolder={handleBrowseFolder}
        onOpenAddModal={() => setIsAddProjectOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenPalette={() => setIsPaletteOpen(true)}
        voiceActive={voice.phase === 'listening'}
        voiceHotkey={settings.voiceHotkey || 'CommandOrControl+Shift+Space'}
        onToggleVoice={toggleVoice}
        onBrainstorm={brainstorm}
        onSyncClaude={handleSyncClaude}
        isSyncing={isSyncing}
        soundEnabled={soundOn}
        onToggleSound={() => setSoundOn(toggleSound())}
        currentTheme={theme}
        onSelectTheme={handleSelectTheme}
        themeConfig={themeConfig}
        inboxCount={needsYou}
        onOpenInbox={() => { setAwaySince(null); setIsInboxOpen(true); }}
        gridMode={gridMode}
        onToggleGrid={() => setGridMode((g) => !g)}
      />

      {/* 2. Embedded Terminal Workspace Area (All tabs preserved in DOM; grid mode shows them side by side) */}
      <div
        className="flex-1 flex flex-col overflow-hidden relative"
        style={gridMode && tabs.length > 1 ? {
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.ceil(Math.sqrt(tabs.length))}, minmax(0, 1fr))`,
          gridAutoRows: 'minmax(0, 1fr)',
          gap: 2,
          backgroundColor: themeConfig.border
        } : undefined}
      >
        {tabs.length > 0 ? (
          tabs.map((tab) => {
            const proj = projects.find((p) => p.id === tab.projectId);
            if (!proj) return null;
            const isTabActive = tab.id === activeTabId;
            const inGrid = gridMode && tabs.length > 1;

            return (
              <div
                key={tab.id}
                onMouseDownCapture={inGrid ? () => setActiveTabId(tab.id) : undefined}
                className="flex-1 w-full h-full flex flex-col overflow-hidden"
                style={{
                  display: isTabActive || inGrid ? 'flex' : 'none',
                  backgroundColor: themeConfig.bgMain,
                  outline: inGrid && isTabActive ? `1px solid ${themeConfig.accent}` : undefined
                }}
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
                  agentBinary={agentBinary(agentById(proj.agent), settings)}
                  flagPresets={agentFlagPresets(settings, proj.agent)}
                  quickCommands={settings.quickCommands}
                  onSwitchAgent={handleSwitchAgent}
                  onRunCommand={(cmd) => handleNewTab(proj.id, cmd)}
                  onOpenWorktree={(prompt) => handleOpenWorktree(proj.path, prompt)}
                  onHandoff={(agentId) => handleHandoff(tab.id, agentId)}
                  onHandoffSession={(agentId, sessionFile, fromAgent) => handleHandoff(tab.id, agentId, sessionFile, fromAgent)}
                  onResumeAs={(agentId, sessionId) => handleResumeAs(tab.id, agentId, sessionId)}
                  pendingLaunch={pendingLaunches[tab.id]}
                  modelChoice={proj.agentModels?.[proj.agent || 'claude']}
                  onSetModel={(choice) => {
                    const agentModels = { ...(proj.agentModels || {}), [proj.agent || 'claude']: choice };
                    setProjects((prev) => prev.map((p) => (p.id === proj.id ? { ...p, agentModels } : p)));
                    window.electronAPI.updateProject(proj.id, { agentModels });
                  }}
                  onLaunchUsed={() => setPendingLaunches(({ [tab.id]: _, ...rest }) => rest)}
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
            {projects.length === 0 ? (
              // First run with nothing added yet: one clear next step, and what happens after it.
              <>
                <h2 className="text-sm font-bold" style={{ color: themeConfig.textPrimary }}>Add your first project</h2>
                <p className="text-xs mt-1 max-w-sm" style={{ color: themeConfig.textMuted }}>
                  Pick the folder of something you are building. Pilothouse opens your agent there, in a tab.
                </p>
                <button
                  onClick={handleBrowseFolder}
                  className="mt-4 px-4 py-2 rounded-lg text-xs font-bold shadow-md transition-all active:scale-95 flex items-center gap-1.5"
                  style={{ backgroundColor: themeConfig.accent, color: themeConfig.accentText }}
                >
                  <FolderPlus className="w-3.5 h-3.5" /> Add a project folder
                </button>
                <ol className="mt-6 text-[11px] text-left flex flex-col gap-1.5 max-w-sm" style={{ color: themeConfig.textMuted }}>
                  <li><b style={{ color: themeConfig.textSecondary }}>1.</b> Add a folder (or drop one on this window).</li>
                  <li><b style={{ color: themeConfig.textSecondary }}>2.</b> Talk to your agent in its tab. When it needs you, the tab and the Inbox light up.</li>
                  <li><b style={{ color: themeConfig.textSecondary }}>3.</b> Away from the desk? Settings → Remote control, scan the QR with your phone.</li>
                </ol>
              </>
            ) : (
              <>
                <h2 className="text-sm font-bold" style={{ color: themeConfig.textPrimary }}>No tab open</h2>
                <p className="text-xs mt-1 max-w-xs" style={{ color: themeConfig.textMuted }}>
                  Press {keyLabel('T')} or click + to open a project with your agent.
                </p>
                <button
                  onClick={() => handleNewTab(projects[0].id)}
                  className="mt-4 px-4 py-2 rounded-lg text-xs font-bold shadow-md transition-all active:scale-95"
                  style={{ backgroundColor: themeConfig.accent, color: themeConfig.accentText }}
                >
                  Open {projects[0].name}
                </button>
              </>
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
            <span style={{ color: themeConfig.accent }}>{keyLabel('P')}</span> Find
          </span>
          <span><span style={{ color: themeConfig.accent }}>{keyLabel('T')}</span> Tab</span>
          <span><span style={{ color: themeConfig.accent }}>{keyLabel('W')}</span> Close</span>
          <span><span style={{ color: themeConfig.accent }}>{tabKeyLabel}</span> Switch</span>
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
              <span>Listening… I'll stop when you pause. <span style={{ color: themeConfig.textMuted }}>Esc {conversing ? 'ends' : 'cancels'}</span></span>
            </>
          )}
          {voice.phase === 'transcribing' && (
            <>
              <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" style={{ color: themeConfig.accent }} />
              <span className="truncate">{voice.note ? `“${voice.note}”` : 'Transcribing on this computer…'}</span>
            </>
          )}
          {voice.phase === 'speaking' && (
            <>
              <Volume2 className="w-4 h-4 flex-shrink-0 animate-pulse" style={{ color: themeConfig.accent }} />
              <span className="line-clamp-2">{voice.note}</span>
              <span className="flex-shrink-0 text-[10px]" style={{ color: themeConfig.textMuted }}>talk to interrupt · Esc ends</span>
            </>
          )}
          {voice.phase === 'working' && (
            <>
              <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" style={{ color: themeConfig.accent }} />
              <span>Working on it… <span style={{ color: themeConfig.textMuted }}>say “stop” to interrupt · Esc ends</span></span>
            </>
          )}
          {voice.phase === 'needs-model' && (
            <>
              <Mic className="w-4 h-4 flex-shrink-0" style={{ color: themeConfig.accent }} />
              <span>Voice prompts need a one-time 574 MB speech model. It runs fully offline.</span>
              <button className="px-2 py-1 rounded font-bold flex-shrink-0" style={{ backgroundColor: themeConfig.accent, color: themeConfig.accentText }} onClick={downloadVoiceModel}>
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

      <InboxPanel
        isOpen={isInboxOpen}
        onClose={() => setIsInboxOpen(false)}
        tabs={tabs}
        projects={projects}
        tabStatus={tabStatus}
        events={events}
        awaySince={awaySince}
        onGoToTab={setActiveTabId}
        onStopTab={handleCloseTab}
        onHandoff={handleHandoff}
        themeConfig={themeConfig}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSaveSettings={handleSaveSettings}
        onRunSetup={() => setIsSetupOpen(true)}
      />

      <SetupWizard
        isOpen={isSetupOpen}
        onFinish={handleFinishSetup}
        onSkip={handleSkipSetup}
        themeConfig={themeConfig}
      />
    </div>
  );
};

export default App;
