import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FolderPlus,
  RefreshCw,
  Terminal,
  Sparkles,
  Command
} from 'lucide-react';
import { ProjectItem, ProjectFlags, AppSettings } from './types';
import { CockpitHeader } from './components/CockpitHeader';
import { ProjectReel } from './components/ProjectReel';
import { CommandCockpit } from './components/CommandCockpit';
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
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

  const [searchQuery, setSearchQuery] = useState('');
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
      if (projs.length > 0 && !selectedId) {
        setSelectedId(projs[0].id);
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
        showToast(`DISCOVERED & SYNCED ${res.addedCount} CLAUDE REPOSITORIES`);
      } else {
        showToast('ALL CLAUDE REPOSITORIES ARE UP TO DATE', 'info');
      }
    } catch (err: any) {
      showToast(`SYNC FAILED: ${err.message}`, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUpdateFlags = async (projectId: string, flags: ProjectFlags) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, flags } : p))
    );
    await window.electronAPI.updateProject(projectId, { flags });
  };

  const handleUpdateCustomFlags = async (projectId: string, customFlags: string) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, customFlags } : p))
    );
    await window.electronAPI.updateProject(projectId, { customFlags });
  };

  const handleToggleFavorite = async (projectId: string, isFavorite: boolean) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, isFavorite } : p))
    );
    await window.electronAPI.updateProject(projectId, { isFavorite });
  };

  const handleAddProject = async (folderPath: string) => {
    try {
      const newProj = await window.electronAPI.addProject(folderPath);
      await loadData();
      setSelectedId(newProj.id);
      showToast(`REGISTERED REPOSITORY: ${newProj.name}`);
    } catch (err: any) {
      showToast(`FAILED: ${err.message}`, 'error');
    }
  };

  const handleRemoveProject = async (projectId: string) => {
    try {
      await window.electronAPI.removeProject(projectId);
      setProjects((prev) => {
        const remaining = prev.filter((p) => p.id !== projectId);
        if (selectedId === projectId) {
          setSelectedId(remaining.length > 0 ? remaining[0].id : null);
        }
        return remaining;
      });
      showToast('REMOVED FROM INDEX', 'info');
    } catch (err: any) {
      showToast(`ERROR: ${err.message}`, 'error');
    }
  };

  const handleLaunch = useCallback(async (projectId: string) => {
    try {
      const res = await window.electronAPI.launchProject(projectId);
      if (res.success) {
        showToast('TERMINAL SESSION DEPLOYED');
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

  // Filter projects
  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.path.toLowerCase().includes(q) ||
        (p.gitInfo?.branch && p.gitInfo.branch.toLowerCase().includes(q))
      );
    });
  }, [projects, searchQuery]);

  // Selected project object
  const selectedProject = useMemo(() => {
    return projects.find((p) => p.id === selectedId) || (filteredProjects.length > 0 ? filteredProjects[0] : null);
  }, [projects, selectedId, filteredProjects]);

  // KEYBOARD NAVIGATION SYSTEM
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return; // do not hijack when typing
      }

      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        playClickSound();
        const currIndex = filteredProjects.findIndex((p) => p.id === selectedId);
        const nextIndex = currIndex < filteredProjects.length - 1 ? currIndex + 1 : 0;
        if (filteredProjects[nextIndex]) {
          setSelectedId(filteredProjects[nextIndex].id);
        }
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        playClickSound();
        const currIndex = filteredProjects.findIndex((p) => p.id === selectedId);
        const prevIndex = currIndex > 0 ? currIndex - 1 : filteredProjects.length - 1;
        if (filteredProjects[prevIndex]) {
          setSelectedId(filteredProjects[prevIndex].id);
        }
      } else if (e.key === 'Enter') {
        if (selectedProject) {
          e.preventDefault();
          handleLaunch(selectedProject.id);
        }
      } else if (e.key === ' ') {
        if (selectedProject) {
          e.preventDefault();
          const nextVal = !selectedProject.flags.dangerouslySkipPermissions;
          playToggleSound(nextVal);
          handleUpdateFlags(selectedProject.id, {
            ...selectedProject.flags,
            dangerouslySkipPermissions: nextVal
          });
        }
      } else if (e.key.toLowerCase() === 'c' && !e.metaKey && !e.ctrlKey) {
        if (selectedProject) {
          e.preventDefault();
          const nextVal = !selectedProject.flags.continueLast;
          playToggleSound(nextVal);
          handleUpdateFlags(selectedProject.id, {
            ...selectedProject.flags,
            continueLast: nextVal
          });
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'o') {
        if (selectedProject) {
          e.preventDefault();
          playClickSound();
          handleOpenFolder(selectedProject.path);
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'e') {
        if (selectedProject) {
          e.preventDefault();
          playClickSound();
          handleOpenEditor(selectedProject.path, 'VSCode');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredProjects, selectedId, selectedProject, handleLaunch]);

  return (
    <div className="flex flex-col h-screen w-screen bg-[#08090d] text-zinc-100 overflow-hidden font-mono select-none">
      {/* 1. Cockpit Header Bar */}
      <CockpitHeader
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onAddProject={() => setIsAddProjectOpen(true)}
        onSyncClaude={handleSyncClaude}
        onOpenSettings={() => setIsSettingsOpen(true)}
        isSyncing={isSyncing}
        totalProjects={projects.length}
        filteredCount={filteredProjects.length}
        soundEnabled={soundOn}
        onToggleSound={() => setSoundOn(toggleSound())}
        defaultTerminal={settings.defaultTerminal}
      />

      {/* 2. Main Studio Split Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Project Reel Index */}
        <ProjectReel
          projects={filteredProjects}
          selectedId={selectedProject?.id || null}
          onSelectProject={(p) => setSelectedId(p.id)}
          onToggleFavorite={handleToggleFavorite}
        />

        {/* Right: The Hardware Command Cockpit */}
        <CommandCockpit
          project={selectedProject}
          onUpdateFlags={handleUpdateFlags}
          onUpdateCustomFlags={handleUpdateCustomFlags}
          onLaunch={handleLaunch}
          onOpenFolder={handleOpenFolder}
          onOpenEditor={handleOpenEditor}
          onRemove={handleRemoveProject}
          defaultTerminal={settings.defaultTerminal}
        />
      </div>

      {/* 3. Bottom Industrial Statusline */}
      <footer className="h-6 bg-[#06070a] border-t border-[#161a25] px-4 flex items-center justify-between text-[10px] text-zinc-500 font-mono">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-zinc-400">
            <span className="text-zinc-600">[↑↓]</span> NAVIGATE
          </span>
          <span className="flex items-center gap-1 text-amber-500/90">
            <span className="text-zinc-600">[SPACE]</span> TOGGLE SKIP PERM
          </span>
          <span className="flex items-center gap-1 text-emerald-400/90">
            <span className="text-zinc-600">[C]</span> CONTINUE
          </span>
          <span className="flex items-center gap-1 text-zinc-400">
            <span className="text-zinc-600">[↵]</span> LAUNCH
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span>TARGET: {settings.defaultTerminal}</span>
          <span className="text-zinc-700">|</span>
          <span>AUDIO FX: {soundOn ? 'ON' : 'MUTED'}</span>
        </div>
      </footer>

      {/* Floating Tactical Toast */}
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
