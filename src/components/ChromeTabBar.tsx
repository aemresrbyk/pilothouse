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
  FolderPlus
} from 'lucide-react';
import { ProjectItem, TabSession, AppTheme } from '../types';
import { THEMES, ThemeConfig } from '../theme';
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
  onOpenPalette: () => void;
  onSyncClaude: () => void;
  isSyncing: boolean;
  soundEnabled: boolean;
  onToggleSound: () => void;
  currentTheme: AppTheme;
  onSelectTheme: (theme: AppTheme) => void;
  themeConfig: ThemeConfig;
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
  onOpenPalette,
  onSyncClaude,
  isSyncing,
  soundEnabled,
  onToggleSound,
  currentTheme,
  onSelectTheme,
  themeConfig
}) => {
  const [isNewTabOpen, setIsNewTabOpen] = useState(false);
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);

  const newTabRef = useRef<HTMLDivElement>(null);
  const themeMenuRef = useRef<HTMLDivElement>(null);

  // Close menus on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (newTabRef.current && !newTabRef.current.contains(e.target as Node)) {
        setIsNewTabOpen(false);
      }
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
      {/* Left: Window Traffic Lights Spacer + Tab Reel */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0 titlebar-no-drag h-full pt-1.5">
        {/* Dedicated 80px space for macOS window control buttons (never overlaps!) */}
        <div className="w-20 flex-shrink-0 h-full pointer-events-none" />

        {/* Tab Items */}
        <div className="flex items-end gap-1 overflow-x-auto no-scrollbar flex-1 min-w-0 h-full">
          {tabs.map((tab) => {
            const project = projects.find((p) => p.id === tab.projectId);
            const isActive = tab.id === activeTabId;
            const tabName = project?.name || 'Terminal';

            return (
              <div
                key={tab.id}
                onClick={() => {
                  playClickSound();
                  onSelectTab(tab.id);
                }}
                title={project?.path}
                className="group relative flex items-center gap-2 px-3 py-1.5 rounded-t-lg transition-all cursor-pointer max-w-[200px] min-w-[120px] text-xs font-mono border-t border-x"
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

                {/* Status Indicator / Icon */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isActive ? 'opacity-100' : 'opacity-40'
                    }`}
                    style={{ backgroundColor: isActive ? themeConfig.accent : themeConfig.textMuted }}
                  />
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
                    className="p-0.5 rounded opacity-50 group-hover:opacity-100 hover:bg-black/20 transition-all flex-shrink-0"
                    style={{ color: themeConfig.textMuted }}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}

          {/* New Tab (+) Button */}
          <div className="relative mb-1" ref={newTabRef}>
            <button
              onClick={() => {
                playClickSound();
                setIsNewTabOpen(!isNewTabOpen);
              }}
              title="Open project in new tab (⌘T)"
              className="p-1 rounded-md hover:bg-black/20 transition-colors ml-1"
              style={{ color: themeConfig.textMuted }}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>

            {/* New Tab Dropdown Menu */}
            {isNewTabOpen && (
              <div
                className="absolute top-full left-0 mt-1 w-64 rounded-xl shadow-2xl py-1.5 z-50 animate-fade-in font-mono text-xs border"
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
                  OPEN IN NEW TAB
                </div>

                <div className="max-h-56 overflow-y-auto py-1">
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        playClickSound();
                        onNewTab(p.id);
                        setIsNewTabOpen(false);
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-black/20 flex items-center justify-between transition-colors"
                      style={{ color: themeConfig.textSecondary }}
                    >
                      <span className="truncate">{p.name}</span>
                      {p.gitInfo?.branch && (
                        <span
                          className="text-[9px] px-1 rounded ml-1"
                          style={{
                            color: themeConfig.textMuted,
                            backgroundColor: themeConfig.bgHeader
                          }}
                        >
                          {p.gitInfo.branch}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                <div
                  className="pt-1 mt-1 border-t px-2"
                  style={{ borderColor: themeConfig.border }}
                >
                  <button
                    onClick={() => {
                      playClickSound();
                      setIsNewTabOpen(false);
                      onOpenAddModal();
                    }}
                    className="w-full text-left px-2 py-1.5 rounded-lg flex items-center gap-1.5 font-bold transition-colors"
                    style={{ color: themeConfig.accent }}
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                    <span>Add Project Folder...</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right: Actions & Theme Picker */}
      <div className="flex items-center gap-1.5 titlebar-no-drag pl-2 flex-shrink-0">
        {/* Quick Search */}
        <button
          onClick={() => {
            playClickSound();
            onOpenPalette();
          }}
          title="Quick Find Project (⌘P)"
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
          title="Sync from ~/.claude.json"
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
                      {isCurrent && <span className="text-[10px]">✓</span>}
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
