import React, { useState, useRef, useEffect } from 'react';
import {
  Terminal,
  Plus,
  X,
  Settings,
  RefreshCw,
  Volume2,
  VolumeX,
  FolderPlus,
  Check
} from 'lucide-react';
import { ProjectItem, TabSession } from '../types';
import { ClaudeIcon } from './ClaudeIcon';
import { playClickSound } from '../utils/audio';

interface ChromeTabBarProps {
  tabs: TabSession[];
  activeTabId: string;
  projects: ProjectItem[];
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onNewTab: (projectId: string) => void;
  onOpenAddModal: () => void;
  onOpenSettings: () => void;
  onSyncClaude: () => void;
  isSyncing: boolean;
  soundEnabled: boolean;
  onToggleSound: () => void;
}

export const ChromeTabBar: React.FC<ChromeTabBarProps> = ({
  tabs,
  activeTabId,
  projects,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onOpenAddModal,
  onOpenSettings,
  onSyncClaude,
  isSyncing,
  soundEnabled,
  onToggleSound
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="titlebar-drag bg-[#090a0f] border-b border-[#1f2535] pt-1.5 px-2 flex items-center justify-between text-xs select-none">
      {/* Left: macOS traffic lights offset + Chrome tabs */}
      <div className="flex items-center gap-1 pl-18 flex-1 min-w-0 titlebar-no-drag">
        {tabs.map((tab, idx) => {
          const project = projects.find((p) => p.id === tab.projectId);
          const isActive = tab.id === activeTabId;
          const tabName = project?.name || 'Session';

          return (
            <div
              key={tab.id}
              onClick={() => {
                playClickSound();
                onSelectTab(tab.id);
              }}
              title={project?.path}
              className={`group relative flex items-center gap-2 px-3.5 py-1.5 rounded-t-lg transition-all cursor-pointer max-w-[200px] min-w-[120px] text-xs font-mono border-t border-x ${
                isActive
                  ? 'bg-[#141722] border-[#252c3f] text-zinc-100 shadow-sm'
                  : 'bg-[#090b10] border-transparent text-zinc-500 hover:bg-[#0f121a] hover:text-zinc-300'
              }`}
            >
              {/* Active Tab Accent Top Line */}
              {isActive && (
                <div className="absolute top-0 left-2 right-2 h-[2px] bg-amber-500 rounded-full" />
              )}

              {/* Status Indicator / Icon */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {tab.isLaunched ? (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-sm shadow-emerald-500/50" />
                ) : (
                  <Terminal className={`w-3.5 h-3.5 ${isActive ? 'text-amber-500' : 'text-zinc-600'}`} />
                )}
              </div>

              {/* Tab Title */}
              <span className="truncate flex-1 font-medium text-[11px]">
                {tabName}
              </span>

              {/* Close Tab Button */}
              {tabs.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    playClickSound();
                    onCloseTab(tab.id);
                  }}
                  title="Close tab (⌘W)"
                  className="p-0.5 rounded hover:bg-[#252b3d] text-zinc-500 hover:text-zinc-200 opacity-60 group-hover:opacity-100 transition-opacity flex-shrink-0"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}

        {/* New Tab (+) Button with Quick Project Picker */}
        <div className="relative titlebar-no-drag" ref={dropdownRef}>
          <button
            onClick={() => {
              playClickSound();
              setIsDropdownOpen(!isDropdownOpen);
            }}
            title="Open project in new tab (⌘T)"
            className="p-1 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-[#161a26] transition-colors ml-1"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>

          {/* New Tab Dropdown Menu */}
          {isDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 w-64 bg-[#10131d] border border-[#232b3e] rounded-xl shadow-2xl py-1.5 z-50 animate-fade-in font-mono text-xs">
              <div className="px-3 py-1 text-[10px] uppercase font-bold text-zinc-500 tracking-wider border-b border-[#1b2233]">
                OPEN IN NEW TAB
              </div>

              <div className="max-h-56 overflow-y-auto py-1">
                {projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      playClickSound();
                      onNewTab(p.id);
                      setIsDropdownOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[#181d2c] text-zinc-300 hover:text-white flex items-center justify-between transition-colors"
                  >
                    <span className="truncate">{p.name}</span>
                    {p.gitInfo?.branch && (
                      <span className="text-[9px] text-zinc-500 bg-[#161b27] px-1 rounded ml-1">
                        {p.gitInfo.branch}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div className="border-t border-[#1b2233] pt-1 px-1">
                <button
                  onClick={() => {
                    setIsDropdownOpen(false);
                    onOpenAddModal();
                  }}
                  className="w-full text-left px-2 py-1.5 rounded-lg text-amber-400 hover:bg-amber-500/10 flex items-center gap-2 transition-colors font-medium"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  <span>Browse Folder on Disk...</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-1.5 pb-1 titlebar-no-drag">
        {/* Sound toggle */}
        <button
          onClick={onToggleSound}
          title={soundEnabled ? 'Click sounds enabled' : 'Click sounds muted'}
          className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-[#161a26] transition-colors"
        >
          {soundEnabled ? (
            <Volume2 className="w-3.5 h-3.5 text-amber-500" />
          ) : (
            <VolumeX className="w-3.5 h-3.5 text-zinc-600" />
          )}
        </button>

        {/* Sync ~/.claude.json */}
        <button
          onClick={() => {
            playClickSound();
            onSyncClaude();
          }}
          disabled={isSyncing}
          title="Sync Claude projects"
          className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-[#161a26] transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-amber-400' : ''}`} />
        </button>

        {/* Settings */}
        <button
          onClick={() => {
            playClickSound();
            onOpenSettings();
          }}
          title="Preferences"
          className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-[#161a26] transition-colors"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

