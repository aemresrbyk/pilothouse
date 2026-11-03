import React, { useState, useRef, useEffect } from 'react';
import {
  Terminal,
  Plus,
  X,
  Settings,
  RefreshCw,
  Volume2,
  VolumeX,
  Palette,
  Search,
  FolderPlus,
  Mic,
  Inbox,
  LayoutGrid
} from 'lucide-react';
import { ProjectItem, TabSession, AppTheme, TabState } from '../types';
import { THEMES, ThemeConfig } from '../theme';
import { playClickSound } from '../utils/audio';
import { AppLogo } from './AppLogo';
import { isMac, keyLabel } from '../utils/platform';

interface ChromeTabBarProps {
  tabs: TabSession[];
  activeTabId: string;
  tabStatus: Record<string, TabState>;
  projects: ProjectItem[];
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onNewTab: (projectId?: string) => void;
  onBrowseFolder: () => void;
  onOpenAddModal: () => void;
  onOpenSettings: () => void;
  onOpenPalette: () => void;
  voiceActive: boolean;
  voiceHotkey: string;
  onToggleVoice: () => void;
  onSyncClaude: () => void;
  isSyncing: boolean;
  soundEnabled: boolean;
  onToggleSound: () => void;
  currentTheme: AppTheme;
  onSelectTheme: (theme: AppTheme) => void;
  themeConfig: ThemeConfig;
  inboxCount: number;
  onOpenInbox: () => void;
  gridMode: boolean;
  onToggleGrid: () => void;
}

export const ChromeTabBar: React.FC<ChromeTabBarProps> = ({
  tabs,
  activeTabId,
  tabStatus,
  projects,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onBrowseFolder,
  onOpenAddModal,
  onOpenSettings,
  onOpenPalette,
  voiceActive,
  voiceHotkey,
  onToggleVoice,
  onSyncClaude,
  isSyncing,
  soundEnabled,
  onToggleSound,
  currentTheme,
  onSelectTheme,
  themeConfig,
  inboxCount,
  onOpenInbox,
  gridMode,
  onToggleGrid
}) => {
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const themeMenuRef = useRef<HTMLDivElement>(null);

  // Close menus on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (themeMenuRef.current && !themeMenuRef.current.contains(e.target as Node)) {
        setIsThemeMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div
      className="titlebar-drag h-10 px-2 flex items-center justify-between text-xs select-none border-b transition-colors"
      style={{
        backgroundColor: themeConfig.bgHeader,
        borderColor: themeConfig.border
      }}
    >
      {/* Left: Window Traffic Lights Spacer + App Brand + Tab Reel */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0 titlebar-no-drag h-full pt-1">
        {/* Dedicated 80px space for macOS window buttons (other systems draw a normal title bar above) */}
        {isMac && <div className="w-20 flex-shrink-0 h-full pointer-events-none" />}

        {/* Brand App Logo */}
        <div
          onClick={onOpenPalette}
          title={`Pilothouse (${keyLabel('P')})`}
          className="flex items-center gap-1.5 mr-2 px-1.5 py-1 rounded-md cursor-pointer hover:bg-black/10 transition-colors flex-shrink-0"
        >
          <AppLogo className="w-4 h-4" />
          <span className="font-bold text-[11px] tracking-wide hidden lg:inline" style={{ color: themeConfig.textPrimary }}>
            PILOTHOUSE
          </span>
        </div>

        {/* Tab Items Reel */}
        <div className="flex items-end gap-1 overflow-x-auto no-scrollbar flex-1 min-w-0 h-full">
          {tabs.map((tab) => {
            const project = projects.find((p) => p.id === tab.projectId);
            const isActive = tab.id === activeTabId;

            // Handle duplicate project tabs cleanly (e.g. "shorts" and "shorts #2")
            const projectTabs = tabs.filter((t) => t.projectId === tab.projectId);
            const tabIndex = projectTabs.findIndex((t) => t.id === tab.id);
            const baseName = project?.name || 'Terminal';
            const tabName = tab.initialCommand ? `${baseName} · ${tab.initialCommand}` : projectTabs.length > 1 ? `${baseName} #${tabIndex + 1}` : baseName;

            return (
              <div
                key={tab.id}
                onClick={() => {
                  playClickSound();
                  onSelectTab(tab.id);
                }}
                title={project?.path}
                className="group relative flex items-center gap-2 px-3 py-1.5 rounded-t-lg transition-all cursor-pointer max-w-[200px] min-w-[110px] text-xs font-mono border-t border-x flex-shrink-0"
                style={{
                  backgroundColor: isActive ? themeConfig.bgTabActive : 'transparent',
                  borderColor: isActive ? themeConfig.border : 'transparent',
                  color: isActive ? themeConfig.textPrimary : themeConfig.textMuted
                }}
              >
                {/* Active Tab Accent Top Line */}
                {isActive && (
                  <div
                    className="absolute top-0 left-2 right-2 h-[2px] rounded-full"
                    style={{ backgroundColor: themeConfig.accent }}
                  />
                )}

                {/* Status dot: pulsing = working, amber = needs approval, green = finished while you were away */}
                {(() => {
                  const st = tabStatus[tab.id];
                  const waiting = st?.status === 'waiting';
                  const running = st?.status === 'running';
                  const failed = st?.failed !== undefined && !waiting;
                  const done = !!st?.unseen && !waiting;
                  const color = waiting ? '#f59e0b' : failed ? '#ef4444' : done ? '#22c55e' : running || isActive ? themeConfig.accent : themeConfig.textMuted;
                  const label = waiting ? 'Needs your approval' : failed ? `Failed (exit code ${st?.failed})` : done ? 'Finished' : running ? 'Working…' : 'Idle';
                  return (
                    <div className="flex items-center gap-1 flex-shrink-0" title={label} aria-label={label}>
                      <span
                        className={`w-2 h-2 rounded-full transition-opacity ${running ? 'animate-pulse' : ''} ${
                          isActive || waiting || done || running ? 'opacity-100' : 'opacity-40'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    </div>
                  );
                })()}

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
                    title={`Close tab (${keyLabel('W')})`}
                    className="p-0.5 rounded opacity-40 group-hover:opacity-100 hover:bg-black/20 transition-all flex-shrink-0"
                    style={{ color: themeConfig.textMuted }}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}

          {/* New Tab Actions (+) & Folder Pick */}
          <div className="flex items-center gap-0.5 mb-1 flex-shrink-0">
            {/* Open / Create New Tab Button */}
            <button
              type="button"
              onClick={() => {
                playClickSound();
                onOpenPalette();
              }}
              title={`Open or Create Terminal Tab (${keyLabel('T')})`}
              className="p-1 rounded-md hover:bg-black/20 transition-all border flex items-center gap-1 text-[11px]"
              style={{
                borderColor: themeConfig.border,
                backgroundColor: themeConfig.bgMain,
                color: themeConfig.textPrimary
              }}
            >
              <Plus className="w-3.5 h-3.5" style={{ color: themeConfig.accent }} />
            </button>

            {/* Quick Browse Finder Button */}
            <button
              type="button"
              onClick={() => {
                playClickSound();
                onBrowseFolder();
              }}
              title="Browse Folder from Finder (+)"
              className="p-1 rounded-md hover:bg-black/20 transition-all border flex items-center"
              style={{
                borderColor: themeConfig.border,
                backgroundColor: themeConfig.bgMain,
                color: themeConfig.textMuted
              }}
            >
              <FolderPlus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Right: Actions & Theme Picker */}
      <div className="flex items-center gap-1 titlebar-no-drag pl-2 flex-shrink-0">
        {/* Inbox: everything the agents ask you */}
        <button
          onClick={() => {
            playClickSound();
            onOpenInbox();
          }}
          title={`Inbox (${keyLabel('I')})`}
          aria-label={`Inbox, ${inboxCount} need you`}
          className="relative p-1.5 rounded-md hover:bg-black/20 transition-colors"
          style={{ color: inboxCount ? '#f59e0b' : themeConfig.textMuted }}
        >
          <Inbox className="w-3.5 h-3.5" />
          {inboxCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-0.5 rounded-full text-[9px] leading-[14px] text-center font-bold text-black" style={{ backgroundColor: '#f59e0b' }}>
              {inboxCount}
            </span>
          )}
        </button>

        {/* Grid: all tabs side by side */}
        <button
          onClick={() => {
            playClickSound();
            onToggleGrid();
          }}
          title={gridMode ? 'Show one tab' : 'Show all tabs in a grid'}
          aria-pressed={gridMode}
          className="p-1.5 rounded-md hover:bg-black/20 transition-colors"
          style={{ color: gridMode ? themeConfig.accent : themeConfig.textMuted }}
        >
          <LayoutGrid className="w-3.5 h-3.5" />
        </button>

        {/* Voice prompt */}
        <button
          onClick={onToggleVoice}
          title={`Speak a prompt to the active tab (${isMac ? voiceHotkey.replace('CommandOrControl', '⌘').replace('Shift', '⇧').replace(/\+/g, '') : voiceHotkey.replace('CommandOrControl', 'Ctrl')})`}
          aria-label="Voice prompt"
          aria-pressed={voiceActive}
          className={`p-1.5 rounded-md hover:bg-black/20 transition-colors ${voiceActive ? 'animate-pulse' : ''}`}
          style={{ color: voiceActive ? '#ef4444' : themeConfig.textMuted }}
        >
          <Mic className="w-3.5 h-3.5" />
        </button>

        {/* Quick Find */}
        <button
          onClick={() => {
            playClickSound();
            onOpenPalette();
          }}
          title={`Command Palette (${keyLabel('P')} / ${keyLabel('K')})`}
          className="p-1.5 rounded-md hover:bg-black/20 transition-colors"
          style={{ color: themeConfig.textMuted }}
        >
          <Search className="w-3.5 h-3.5" />
        </button>

        {/* Sync Claude */}
        <button
          onClick={() => {
            playClickSound();
            onSyncClaude();
          }}
          title="Sync Claude Repositories (~/.claude.json)"
          disabled={isSyncing}
          className="p-1.5 rounded-md hover:bg-black/20 transition-colors"
          style={{ color: themeConfig.textMuted }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
        </button>

        {/* Theme Selector Dropdown */}
        <div className="relative" ref={themeMenuRef}>
          <button
            onClick={() => {
              playClickSound();
              setIsThemeMenuOpen(!isThemeMenuOpen);
            }}
            title="Theme Selection"
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-mono hover:bg-black/20 transition-colors border"
            style={{
              color: themeConfig.textPrimary,
              borderColor: themeConfig.border,
              backgroundColor: themeConfig.bgTabActive
            }}
          >
            <span>{themeConfig.icon}</span>
            <span className="hidden sm:inline text-[10px] font-medium">{themeConfig.name}</span>
          </button>

          {isThemeMenuOpen && (
            <div
              className="absolute right-0 top-full mt-1.5 w-48 rounded-xl shadow-2xl py-1.5 z-50 animate-fade-in font-mono text-xs border"
              style={{
                backgroundColor: themeConfig.bgCard,
                borderColor: themeConfig.border
              }}
            >
              <div
                className="px-3 py-1 text-[10px] uppercase font-bold tracking-wider border-b"
                style={{
                  color: themeConfig.textMuted,
                  borderColor: themeConfig.border
                }}
              >
                SELECT THEME
              </div>
              <div className="p-1 space-y-0.5">
                {(Object.keys(THEMES) as AppTheme[]).map((tId) => {
                  const t = THEMES[tId];
                  const isCurrent = tId === currentTheme;
                  return (
                    <button
                      key={tId}
                      type="button"
                      onClick={() => {
                        playClickSound();
                        onSelectTheme(tId);
                        setIsThemeMenuOpen(false);
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between text-xs transition-colors"
                      style={{
                        backgroundColor: isCurrent ? themeConfig.accentBg : 'transparent',
                        color: isCurrent ? themeConfig.accent : themeConfig.textSecondary
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span>{t.icon}</span>
                        <span>{t.name}</span>
                      </div>
                      {isCurrent && <span className="text-[10px] font-bold">✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Sound Toggle */}
        <button
          onClick={() => {
            playClickSound();
            onToggleSound();
          }}
          title={soundEnabled ? 'Disable UI Sounds' : 'Enable UI Sounds'}
          className="p-1.5 rounded-md hover:bg-black/20 transition-colors"
          style={{ color: soundEnabled ? themeConfig.accent : themeConfig.textMuted }}
        >
          {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
        </button>

        {/* Settings */}
        <button
          onClick={() => {
            playClickSound();
            onOpenSettings();
          }}
          title="System Settings"
          className="p-1.5 rounded-md hover:bg-black/20 transition-colors"
          style={{ color: themeConfig.textMuted }}
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
