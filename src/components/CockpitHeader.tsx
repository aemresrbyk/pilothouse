import React, { useRef, useEffect } from 'react';
import {
  Terminal,
  RefreshCw,
  Plus,
  Settings,
  Volume2,
  VolumeX,
  Search,
  Sparkles,
  Command
} from 'lucide-react';
import { ClaudeIcon } from './ClaudeIcon';
import { playClickSound } from '../utils/audio';

interface CockpitHeaderProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onAddProject: () => void;
  onSyncClaude: () => void;
  onOpenSettings: () => void;
  isSyncing: boolean;
  totalProjects: number;
  filteredCount: number;
  soundEnabled: boolean;
  onToggleSound: () => void;
  defaultTerminal: string;
}

export const CockpitHeader: React.FC<CockpitHeaderProps> = ({
  searchQuery,
  onSearchChange,
  onAddProject,
  onSyncClaude,
  onOpenSettings,
  isSyncing,
  totalProjects,
  filteredCount,
  soundEnabled,
  onToggleSound,
  defaultTerminal
}) => {
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <header className="titlebar-drag bg-[#08090d] border-b border-[#1b202c] px-4 py-2 flex items-center justify-between text-xs select-none">
      {/* Left: macOS traffic lights spacing + Cockpit Brand */}
      <div className="flex items-center gap-3 pl-18 titlebar-no-drag">
        <ClaudeIcon size={26} />
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono-code font-bold tracking-wider text-zinc-100 text-xs flex items-center gap-1.5">
              <span>CLAUDE DECK</span>
              <span className="text-[10px] text-amber-500 font-semibold font-mono">v1.0</span>
            </span>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-mono text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              ONLINE
            </span>
          </div>
          <p className="text-[10px] font-mono text-zinc-500">
            {totalProjects} REPOSITORIES INDEXED
          </p>
        </div>
      </div>

      {/* Center: Command Filter Input */}
      <div className="flex-1 max-w-sm mx-4 titlebar-no-drag">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="FILTER REPOS... [/]"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-[#10131a] hover:bg-[#141822] focus:bg-[#161a26] border border-[#232938] focus:border-amber-500/80 text-zinc-200 text-xs font-mono placeholder-zinc-600 rounded-md pl-8 pr-12 py-1.5 transition-colors outline-none"
          />
          <span className="absolute right-2 px-1 rounded bg-[#1c2230] text-[9px] font-mono text-zinc-500 pointer-events-none">
            {searchQuery ? `${filteredCount}` : '⌘K'}
          </span>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2 titlebar-no-drag font-mono text-[11px]">
        {/* Terminal Engine Pill */}
        <div className="hidden sm:flex items-center gap-1 px-2 py-1 rounded bg-[#10131b] border border-[#202737] text-zinc-400">
          <Terminal className="w-3 h-3 text-amber-500" />
          <span className="truncate max-w-[90px]">{defaultTerminal}</span>
        </div>

        {/* Audio FX Toggle */}
        <button
          onClick={() => {
            onToggleSound();
          }}
          title={soundEnabled ? 'Mute click sounds' : 'Enable click sounds'}
          className={`p-1.5 rounded border transition-colors ${
            soundEnabled
              ? 'bg-[#151a24] border-[#293246] text-amber-400 hover:text-amber-300'
              : 'bg-[#10131b] border-[#202737] text-zinc-600 hover:text-zinc-400'
          }`}
        >
          {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
        </button>

        {/* Sync ~/.claude.json */}
        <button
          onClick={() => {
            playClickSound();
            onSyncClaude();
          }}
          disabled={isSyncing}
          title="Sync all projects from ~/.claude.json"
          className="flex items-center gap-1 px-2 py-1 rounded bg-[#10131b] hover:bg-[#171c27] border border-[#202737] hover:border-[#2f394f] text-zinc-300 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 text-amber-400 ${isSyncing ? 'animate-spin' : ''}`} />
          <span>SYNC</span>
        </button>

        {/* Add Folder */}
        <button
          onClick={() => {
            playClickSound();
            onAddProject();
          }}
          className="flex items-center gap-1 px-2.5 py-1 rounded bg-gradient-to-r from-[#cc6b49] to-[#d97706] hover:from-[#d67350] hover:to-[#e38312] text-white font-medium shadow-sm transition-all active:scale-95"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>ADD</span>
        </button>

        {/* Settings */}
        <button
          onClick={() => {
            playClickSound();
            onOpenSettings();
          }}
          title="Deck Configuration"
          className="p-1.5 rounded bg-[#10131b] hover:bg-[#171c27] border border-[#202737] text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
