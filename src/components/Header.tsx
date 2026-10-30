import React from 'react';
import { Search, Plus, RefreshCw, Settings, LayoutGrid, List, Sparkles } from 'lucide-react';
import { ClaudeIcon } from './ClaudeIcon';

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  viewMode: 'grid' | 'list';
  onViewModeChange: (m: 'grid' | 'list') => void;
  onAddProject: () => void;
  onSyncClaude: () => void;
  onOpenSettings: () => void;
  isSyncing: boolean;
  totalProjects: number;
  filteredCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeChange,
  onAddProject,
  onSyncClaude,
  onOpenSettings,
  isSyncing,
  totalProjects,
  filteredCount
}) => {
  return (
    <header className="titlebar-drag sticky top-0 z-30 bg-[#0c0d12]/90 backdrop-blur-md border-b border-[#222736] px-4 pt-3 pb-3">
      {/* Top row with macOS spacing */}
      <div className="flex items-center justify-between gap-4">
        {/* Left: Window traffic lights offset + Title */}
        <div className="flex items-center gap-3 pl-16 titlebar-no-drag">
          <ClaudeIcon size={32} />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold text-zinc-100 tracking-tight">
                Claude Code Launcher
              </h1>
              <span className="text-[10px] font-medium bg-[#cc6b49]/15 text-[#e08261] border border-[#cc6b49]/30 px-1.5 py-0.5 rounded-full">
                Open Source
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">
              {totalProjects} {totalProjects === 1 ? 'project' : 'projects'} configured
            </p>
          </div>
        </div>

        {/* Center: Search input */}
        <div className="flex-1 max-w-md titlebar-no-drag">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search projects by name or path..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full bg-[#161922] border border-[#2b3244] hover:border-[#3d465e] focus:border-[#cc6b49] focus:ring-1 focus:ring-[#cc6b49] text-xs text-zinc-200 placeholder-zinc-500 rounded-lg pl-9 pr-3 py-1.5 transition-all outline-none"
            />
            {searchQuery && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500">
                {filteredCount} found
              </span>
            )}
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 titlebar-no-drag">
          {/* View toggle */}
          <div className="flex items-center bg-[#161922] border border-[#2b3244] rounded-lg p-0.5">
            <button
              onClick={() => onViewModeChange('grid')}
              title="Grid View"
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'grid'
                  ? 'bg-[#252b3b] text-zinc-100 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onViewModeChange('list')}
              title="List View"
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'list'
                  ? 'bg-[#252b3b] text-zinc-100 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Sync Claude projects */}
          <button
            onClick={onSyncClaude}
            disabled={isSyncing}
            title="Scan ~/.claude.json for existing projects"
            className="flex items-center gap-1.5 text-xs text-zinc-300 bg-[#161922] hover:bg-[#202534] border border-[#2b3244] hover:border-[#3d465e] px-2.5 py-1.5 rounded-lg transition-colors font-medium disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-amber-500 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>Sync Claude</span>
          </button>

          {/* Add project button */}
          <button
            onClick={onAddProject}
            className="flex items-center gap-1.5 text-xs text-white bg-gradient-to-r from-[#cc6b49] to-[#d97706] hover:from-[#d67350] hover:to-[#e38312] px-3 py-1.5 rounded-lg shadow-sm font-medium transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Add Project</span>
          </button>

          {/* Settings */}
          <button
            onClick={onOpenSettings}
            title="Preferences"
            className="p-1.5 text-zinc-400 hover:text-zinc-200 bg-[#161922] hover:bg-[#202534] border border-[#2b3244] rounded-lg transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
