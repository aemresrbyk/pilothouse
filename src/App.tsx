import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  FolderPlus,
  Terminal,
  UploadCloud
} from 'lucide-react';
import { ProjectItem, ProjectFlags, AppSettings, TabSession, AppTheme, DEFAULT_FLAG_PRESETS } from './types';
import { THEMES, ThemeConfig } from './theme';
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
        projects={projects}
        onSelectTab={handleSelectTab}
        onCloseTab={handleCloseTab}
        onNewTab={handleNewTab}
        onBrowseFolder={handleBrowseFolder}
        onOpenAddModal={() => setIsAddProjectOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenPalette={() => setIsPaletteOpen(true)}
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
                  claudePath={settings.claudePath || 'claude'}
                  flagPresets={settings.flagPresets ?? DEFAULT_FLAG_PRESETS}
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
