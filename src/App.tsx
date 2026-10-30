import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FolderPlus,
  RefreshCw,
  Terminal,
  Sparkles,
  Command,
  LayoutGrid
} from 'lucide-react';
import { ProjectItem, ProjectFlags, AppSettings, TabSession } from './types';
import { ChromeTabBar } from './components/ChromeTabBar';
import { Omnibar } from './components/Omnibar';
import { TabWorkspace } from './components/TabWorkspace';
import { SettingsModal } from './components/SettingsModal';
import { AddProjectModal } from './components/AddProjectModal';
import {
  isSoundEnabled,
  toggleSound,
  playClickSound,
  playLaunchSound,
  playToggleSound
} from './utils/audio';

export const App: React.FC = () => {
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [tabs, setTabs] = useState<TabSession[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>('');
  
  const [settings, setSettings] = useState<AppSettings>({
    defaultTerminal: 'Terminal',
    defaultEditor: 'VSCode',
    defaultFlags: {
      dangerouslySkipPermissions: true,
      continueLast: false,
      chrome: false,
      verbose: false,
      bare: false
    },
    claudePath: 'claude',
    autoDetectOnStartup: true,
    soundEnabled: true
  });

  const [isSyncing, setIsSyncing] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [toast, setToast] = useState<{ message: string; type?: 'info' | 'success' | 'error' } | null>(null);

  // Modals
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAddProjectOpen, setIsAddProjectOpen] = useState(false);

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

      // Initialize tabs if empty
      if (tabs.length === 0 && projs.length > 0) {
        // Open up to 3 initial tabs (e.g. first project or favorites)
        const initialProjs = projs.slice(0, Math.min(3, projs.length));
        const initialTabs: TabSession[] = initialProjs.map((p) => ({
          id: `tab-${p.id}`,
          projectId: p.id,
          customInput: '',
          isLaunched: false
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

  // Tab Operations (Like Google Chrome)
  const handleSelectTab = (tabId: string) => {
    setActiveTabId(tabId);
  };

  const handleCloseTab = (tabId: string) => {
    setTabs((prev) => {
      const remaining = prev.filter((t) => t.id !== tabId);
      if (activeTabId === tabId && remaining.length > 0) {
        setActiveTabId(remaining[remaining.length - 1].id);
      }
      return remaining;
    });
  };

  const handleNewTab = (projectId: string) => {
    // Check if a tab for this project already exists
    const existing = tabs.find((t) => t.projectId === projectId);
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }

    const newTab: TabSession = {
      id: `tab-${Date.now()}-${projectId}`,
      projectId,
      customInput: '',
      isLaunched: false
    };

    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
  };

  const handleCustomInputChange = (newVal: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === activeTabId ? { ...t, customInput: newVal } : t))
    );
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

  const handleLaunch = useCallback(async (projectId: string, fullCommand: string) => {
    try {
      const res = await window.electronAPI.launchProject(projectId, fullCommand);
      if (res.success) {
        showToast('COMMAND DISPATCHED TO TERMINAL');
        // Mark tab as launched
        setTabs((prev) =>
          prev.map((t) =>
            t.projectId === projectId
              ? { ...t, isLaunched: true, lastCommand: fullCommand, launchedAt: Date.now() }
              : t
          )
        );
        // Update project lastLaunched
        setProjects((prev) =>
          prev.map((p) =>
            p.id === projectId ? { ...p, lastLaunched: Date.now() } : p
          )
        );
      } else {
        showToast(`LAUNCH ERROR: ${res.error}`, 'error');
      }
    } catch (err: any) {
      showToast(`FAILED TO LAUNCH: ${err.message}`, 'error');
    }
  }, []);

  const handleOpenFolder = async (path: string) => {
    await window.electronAPI.openFolder(path);
  };

  const handleOpenEditor = async (path: string, editor?: string) => {
    await window.electronAPI.openInEditor(path, editor || settings.defaultEditor);
  };

  const handleSaveSettings = async (newSettings: Partial<AppSettings>) => {
    const updated = await window.electronAPI.updateSettings(newSettings);
    setSettings(updated);
    showToast('PREFERENCES STORED');
  };

  // Active tab & project
  const activeTab = useMemo(() => {
    return tabs.find((t) => t.id === activeTabId) || (tabs.length > 0 ? tabs[0] : null);
  }, [tabs, activeTabId]);

  const activeProject = useMemo(() => {
    if (!activeTab) return null;
    return projects.find((p) => p.id === activeTab.projectId) || null;
  }, [activeTab, projects]);

  // Compute full command for active tab
  const activeFullCommand = useMemo(() => {
    if (!activeProject) return '';
    const flags = activeProject.flags || {
      dangerouslySkipPermissions: true,
      continueLast: false,
      chrome: false,
      verbose: false,
      bare: false
    };

    const parts = ['claude'];
    if (flags.dangerouslySkipPermissions) parts.push('--dangerously-skip-permissions');
    if (flags.continueLast) parts.push('--continue');
    if (flags.chrome) parts.push('--chrome');
    if (flags.verbose) parts.push('--verbose');
    if (flags.bare) parts.push('--bare');
    if (activeTab?.customInput && activeTab.customInput.trim()) {
      parts.push(activeTab.customInput.trim());
    }
    return parts.join(' ');
  }, [activeProject, activeTab?.customInput]);

  // Chrome-style Keyboard Shortcuts:
  // Cmd+T: New tab
  // Cmd+W: Close tab
  // Cmd+1..9: Switch tabs
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + T -> New tab
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 't') {
        e.preventDefault();
        playClickSound();
        if (projects.length > 0) {
          // Open next project not yet opened or first project
          const nextProj = projects.find((p) => !tabs.some((t) => t.projectId === p.id)) || projects[0];
          handleNewTab(nextProj.id);
        } else {
          setIsAddProjectOpen(true);
        }
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
    <div className="flex flex-col h-screen w-screen bg-[#090b10] text-zinc-100 overflow-hidden font-mono select-none">
      {/* 1. Google Chrome Style Tab Bar */}
      <ChromeTabBar
        tabs={tabs}
        activeTabId={activeTabId}
        projects={projects}
        onSelectTab={handleSelectTab}
        onCloseTab={handleCloseTab}
        onNewTab={handleNewTab}
        onOpenAddModal={() => setIsAddProjectOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onSyncClaude={handleSyncClaude}
        isSyncing={isSyncing}
        soundEnabled={soundOn}
        onToggleSound={() => setSoundOn(toggleSound())}
      />

      {/* 2. Interactive Omnibar (Under Tab Bar like Chrome URL bar) */}
      {activeProject && activeTab && (
        <Omnibar
          project={activeProject}
          customInput={activeTab.customInput}
          onCustomInputChange={handleCustomInputChange}
          onUpdateFlags={handleUpdateFlags}
          onLaunch={handleLaunch}
          onOpenFolder={handleOpenFolder}
          onOpenEditor={handleOpenEditor}
          defaultTerminal={settings.defaultTerminal}
        />
      )}

      {/* 3. Tab Workspace Area */}
      {activeProject && activeTab ? (
        <TabWorkspace
          project={activeProject}
          tabSession={activeTab}
          fullCommand={activeFullCommand}
          onLaunch={handleLaunch}
          onOpenFolder={handleOpenFolder}
          onOpenEditor={handleOpenEditor}
          defaultTerminal={settings.defaultTerminal}
        />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#0a0c10] select-none text-center">
          <Terminal className="w-10 h-10 text-amber-500 mb-3" />
          <h2 className="text-sm font-bold text-zinc-300">NO TABS OPEN</h2>
          <p className="text-xs text-zinc-600 mt-1 max-w-xs">
            Open a project tab using the [+] button or press ⌘T to get started.
          </p>
        </div>
      )}

      {/* 4. Minimalist Status Bar */}
      <footer className="h-6 bg-[#07080c] border-t border-[#191f2c] px-4 flex items-center justify-between text-[10px] text-zinc-500 font-mono">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-zinc-400">
            <span className="text-zinc-600">⌘T</span> NEW TAB
          </span>
          <span className="flex items-center gap-1 text-zinc-400">
            <span className="text-zinc-600">⌘W</span> CLOSE TAB
          </span>
          <span className="flex items-center gap-1 text-zinc-400">
            <span className="text-zinc-600">⌘1-9</span> SWITCH TAB
          </span>
          <span className="flex items-center gap-1 text-amber-400/90">
            <span className="text-zinc-600">↵</span> RUN COMMAND
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span>{tabs.length} TABS ACTIVE</span>
          <span className="text-zinc-700">|</span>
          <span>TERMINAL: {settings.defaultTerminal}</span>
        </div>
      </footer>

      {/* Floating Toast */}
      {toast && (
        <div className="fixed bottom-9 right-6 z-50 animate-bounce-subtle">
          <div
            className={`px-3.5 py-2 rounded border text-xs font-mono font-medium shadow-2xl flex items-center gap-2 ${
              toast.type === 'error'
                ? 'bg-red-950/95 text-red-200 border-red-800'
                : toast.type === 'info'
                ? 'bg-zinc-900/95 text-zinc-300 border-zinc-700'
                : 'bg-[#151924]/95 text-amber-300 border-amber-500/40'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Modals */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSaveSettings={handleSaveSettings}
      />

      <AddProjectModal
        isOpen={isAddProjectOpen}
        onClose={() => setIsAddProjectOpen(false)}
        onAddProject={handleAddProject}
      />
    </div>
  );
};
export default App;
