import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  FolderPlus,
  RefreshCw,
  FolderOpen,
  Star,
  FileText,
  Terminal,
  Sparkles,
  Layers,
  Info
} from 'lucide-react';
import { ProjectItem, ProjectFlags, AppSettings } from './types';
import { Header } from './components/Header';
import { ProjectCard } from './components/ProjectCard';
import { ProjectRow } from './components/ProjectRow';
import { FileViewerModal } from './components/FileViewerModal';
import { ClaudeMdModal } from './components/ClaudeMdModal';
import { SettingsModal } from './components/SettingsModal';
import { AddProjectModal } from './components/AddProjectModal';

export const App: React.FC = () => {
  const [projects, setProjects] = useState<ProjectItem[]>([]);
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
    autoDetectOnStartup: true
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'favorites' | 'claude-md'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isSyncing, setIsSyncing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type?: 'info' | 'success' | 'error' } | null>(null);

  // Modals state
  const [activeFileModalProject, setActiveFileModalProject] = useState<ProjectItem | null>(null);
  const [activeClaudeMdProject, setActiveClaudeMdProject] = useState<ProjectItem | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAddProjectOpen, setIsAddProjectOpen] = useState(false);

  const showToast = (message: string, type: 'info' | 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Load projects & settings on mount
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [projs, setts] = await Promise.all([
        window.electronAPI.getProjects(),
        window.electronAPI.getSettings()
      ]);
      setProjects(projs);
      setSettings(setts);
    } catch (err) {
      console.error('Error loading data:', err);
    }
  };

  const handleSyncClaude = async () => {
    setIsSyncing(true);
    try {
      const res = await window.electronAPI.syncFromClaude();
      await loadData();
      if (res.addedCount > 0) {
        showToast(`Discovered & imported ${res.addedCount} projects from Claude!`);
      } else {
        showToast('All Claude projects are already up to date', 'info');
      }
    } catch (err: any) {
      showToast(`Sync failed: ${err.message}`, 'error');
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
      showToast(`Added project: ${newProj.name}`);
    } catch (err: any) {
      showToast(`Failed to add project: ${err.message}`, 'error');
    }
  };

  const handleRemoveProject = async (projectId: string) => {
    try {
      await window.electronAPI.removeProject(projectId);
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
      showToast('Project removed from list', 'info');
    } catch (err: any) {
      showToast(`Failed to remove: ${err.message}`, 'error');
    }
  };

  const handleLaunch = async (projectId: string) => {
    try {
      const res = await window.electronAPI.launchProject(projectId);
      if (res.success) {
        showToast('Terminal launched with Claude Code!');
        // Update local lastLaunched
        setProjects((prev) =>
          prev.map((p) =>
            p.id === projectId ? { ...p, lastLaunched: Date.now() } : p
          )
        );
      } else {
        showToast(`Launch error: ${res.error}`, 'error');
      }
    } catch (err: any) {
      showToast(`Failed to launch: ${err.message}`, 'error');
    }
  };

  const handleOpenFolder = async (path: string) => {
    await window.electronAPI.openFolder(path);
  };

  const handleOpenEditor = async (path: string) => {
    await window.electronAPI.openInEditor(path, settings.defaultEditor);
  };

  const handleSaveSettings = async (newSettings: Partial<AppSettings>) => {
    const updated = await window.electronAPI.updateSettings(newSettings);
    setSettings(updated);
    showToast('Preferences updated!');
  };

  // Filter projects
  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      // Search
      const matchesSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.path.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      // Filter tabs
      if (activeFilter === 'favorites') return p.isFavorite;
      if (activeFilter === 'claude-md') return p.hasClaudeMd;
      return true;
    });
  }, [projects, searchQuery, activeFilter]);

  // Project count metrics
  const favCount = useMemo(() => projects.filter((p) => p.isFavorite).length, [projects]);
  const mdCount = useMemo(() => projects.filter((p) => p.hasClaudeMd).length, [projects]);

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0c0d12] text-zinc-100 overflow-hidden font-sans">
      {/* Top Navigation Header */}
      <Header
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onAddProject={() => setIsAddProjectOpen(true)}
        onSyncClaude={handleSyncClaude}
        onOpenSettings={() => setIsSettingsOpen(true)}
        isSyncing={isSyncing}
        totalProjects={projects.length}
        filteredCount={filteredProjects.length}
      />

      {/* Filter / Subheader Bar */}
      <div className="px-6 py-2.5 bg-[#0e1017] border-b border-[#1f2434] flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setActiveFilter('all')}
            className={`px-3 py-1 rounded-md transition-colors ${
              activeFilter === 'all'
                ? 'bg-[#202636] text-zinc-100 font-medium border border-[#30394f]'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            All Projects ({projects.length})
          </button>
          <button
            onClick={() => setActiveFilter('favorites')}
            className={`px-3 py-1 rounded-md transition-colors flex items-center gap-1.5 ${
              activeFilter === 'favorites'
                ? 'bg-[#202636] text-amber-400 font-medium border border-[#30394f]'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Star className="w-3 h-3" />
            <span>Favorites ({favCount})</span>
          </button>
          <button
            onClick={() => setActiveFilter('claude-md')}
            className={`px-3 py-1 rounded-md transition-colors flex items-center gap-1.5 ${
              activeFilter === 'claude-md'
                ? 'bg-[#202636] text-[#f29472] font-medium border border-[#30394f]'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FileText className="w-3 h-3" />
            <span>Has CLAUDE.md ({mdCount})</span>
          </button>
        </div>

        {/* Quick hint / default terminal badge */}
        <div className="flex items-center gap-2 text-[11px] text-zinc-400">
          <span className="flex items-center gap-1">
            <Terminal className="w-3 h-3 text-amber-500" />
            <span>Terminal: {settings.defaultTerminal}</span>
          </span>
          <span className="text-zinc-600">•</span>
          <span>Click project launch to start Claude Code</span>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto px-6 py-5">
        {filteredProjects.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto p-6">
            <div className="w-12 h-12 rounded-2xl bg-[#1c2130] border border-[#2b334a] flex items-center justify-center text-[#cc6b49] mb-4">
              <Layers className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-zinc-200 mb-1">
              {projects.length === 0 ? 'No projects yet' : 'No matching projects'}
            </h3>
            <p className="text-xs text-zinc-500 mb-5 leading-relaxed">
              {projects.length === 0
                ? 'Sync your existing Claude Code projects automatically or browse a project folder to get started.'
                : 'No projects match your current search query or active filter.'}
            </p>
            {projects.length === 0 && (
              <div className="flex items-center gap-2.5">
                <button
                  onClick={handleSyncClaude}
                  disabled={isSyncing}
                  className="flex items-center gap-1.5 bg-[#1f2536] hover:bg-[#283046] border border-[#313c54] text-zinc-200 text-xs px-3 py-2 rounded-lg transition-colors font-medium"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>Scan ~/.claude.json</span>
                </button>
                <button
                  onClick={() => setIsAddProjectOpen(true)}
                  className="flex items-center gap-1.5 bg-gradient-to-r from-[#cc6b49] to-[#d97706] text-white text-xs px-3.5 py-2 rounded-lg font-medium shadow-md transition-all"
                >
                  <FolderPlus className="w-4 h-4" />
                  <span>Add Folder</span>
                </button>
              </div>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-10">
            {filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onUpdateFlags={handleUpdateFlags}
                onUpdateCustomFlags={handleUpdateCustomFlags}
                onToggleFavorite={handleToggleFavorite}
                onLaunch={handleLaunch}
                onOpenFolder={handleOpenFolder}
                onOpenEditor={handleOpenEditor}
                onViewFiles={(p) => setActiveFileModalProject(p)}
                onViewClaudeMd={(p) => setActiveClaudeMdProject(p)}
                onRemove={handleRemoveProject}
                defaultTerminal={settings.defaultTerminal}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-2 pb-10">
            {filteredProjects.map((project) => (
              <ProjectRow
                key={project.id}
                project={project}
                onUpdateFlags={handleUpdateFlags}
                onToggleFavorite={handleToggleFavorite}
                onLaunch={handleLaunch}
                onOpenFolder={handleOpenFolder}
                onOpenEditor={handleOpenEditor}
                onViewFiles={(p) => setActiveFileModalProject(p)}
                onViewClaudeMd={(p) => setActiveClaudeMdProject(p)}
                onRemove={handleRemoveProject}
              />
            ))}
          </div>
        )}
      </main>

      {/* Floating Toast Notification */}
      {toast && (
        <div className="fixed bottom-5 right-6 z-50 animate-bounce-subtle">
          <div
            className={`px-4 py-2.5 rounded-xl shadow-xl text-xs font-medium border flex items-center gap-2 ${
              toast.type === 'error'
                ? 'bg-red-950/90 text-red-200 border-red-800 backdrop-blur-md'
                : toast.type === 'info'
                ? 'bg-zinc-900/90 text-zinc-200 border-zinc-700 backdrop-blur-md'
                : 'bg-[#181d29]/95 text-zinc-100 border-[#38435d] backdrop-blur-md shadow-black/50'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Modals */}
      <FileViewerModal
        project={activeFileModalProject}
        onClose={() => setActiveFileModalProject(null)}
        onOpenFolder={handleOpenFolder}
        onOpenEditor={handleOpenEditor}
      />

      <ClaudeMdModal
        project={activeClaudeMdProject}
        onClose={() => setActiveClaudeMdProject(null)}
        onOpenEditor={handleOpenEditor}
      />

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
