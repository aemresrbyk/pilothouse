import React, { useState, useEffect, useRef } from 'react';
import { Search, FolderPlus, GitBranch, Terminal, Plus, X, CopyPlus } from 'lucide-react';
import { ProjectItem } from '../types';
import { ThemeConfig } from '../theme';
import { playClickSound } from '../utils/audio';
import { AppLogo } from './AppLogo';

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: ProjectItem[];
  currentProjectId?: string;
  themeConfig: ThemeConfig;
  onSelectProject: (projectId: string, inNewTab: boolean) => void;
  onOpenAddModal: () => void;
  onBrowseFolder: () => void;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  projects,
  currentProjectId,
  themeConfig,
  onSelectProject,
  onOpenAddModal,
  onBrowseFolder
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const filtered = projects.filter((p) => {
    const q = query.toLowerCase().trim();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.path.toLowerCase().includes(q) ||
      (p.gitInfo?.branch && p.gitInfo.branch.toLowerCase().includes(q))
    );
  });

  const totalItems = filtered.length;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < totalItems - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : totalItems - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        playClickSound();
        onSelectProject(filtered[selectedIndex].id, true);
        onClose();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  const currentProject = projects.find((p) => p.id === currentProjectId);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/70 backdrop-blur-md select-none font-mono animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col border transition-all"
        style={{
          backgroundColor: themeConfig.bgCard,
          borderColor: themeConfig.border,
          boxShadow: `0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 30px ${themeConfig.accent}15`
        }}
      >
        {/* Modal Header & Search */}
        <div
          className="flex items-center gap-3 px-4 py-3.5 border-b"
          style={{
            backgroundColor: themeConfig.bgHeader,
            borderColor: themeConfig.border
          }}
        >
          <AppLogo className="w-5 h-5 flex-shrink-0" />
          <Search className="w-4 h-4 flex-shrink-0" style={{ color: themeConfig.accent }} />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search projects or open new tab (type name, git branch, path)..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            className="w-full bg-transparent text-xs outline-none transition-colors"
            style={{
              color: themeConfig.textPrimary
            }}
          />
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-black/20 text-xs transition-colors"
            style={{ color: themeConfig.textMuted }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Actions Strip */}
        <div
          className="px-3 py-2 border-b flex items-center gap-2 overflow-x-auto text-[11px]"
          style={{
            backgroundColor: themeConfig.bgMain,
            borderColor: themeConfig.border
          }}
        >
          <button
            onClick={() => {
              playClickSound();
              onClose();
              onBrowseFolder();
            }}
            className="px-2.5 py-1 rounded-lg flex items-center gap-1.5 font-bold transition-all border flex-shrink-0"
            style={{
              backgroundColor: themeConfig.accentBg,
              borderColor: themeConfig.accent,
              color: themeConfig.accent
            }}
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>+ Browse Folder (Finder)</span>
          </button>

          {currentProject && (
            <button
              onClick={() => {
                playClickSound();
                onSelectProject(currentProject.id, true);
                onClose();
              }}
              className="px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-all border flex-shrink-0 hover:opacity-90"
              style={{
                backgroundColor: themeConfig.bgTabActive,
                borderColor: themeConfig.border,
                color: themeConfig.textPrimary
              }}
            >
              <CopyPlus className="w-3.5 h-3.5" style={{ color: themeConfig.accent }} />
              <span>Duplicate Terminal: {currentProject.name}</span>
            </button>
          )}
        </div>

        {/* Project Results List */}
        <div className="max-h-80 overflow-y-auto divide-y p-1.5" style={{ borderColor: themeConfig.border }}>
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-xs" style={{ color: themeConfig.textMuted }}>
              No repositories match "{query}". Click "Browse Folder" above to add one.
            </div>
          ) : (
            filtered.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={() => {
                    playClickSound();
                    onSelectProject(item.id, true);
                    onClose();
                  }}
                  className="px-3 py-2.5 rounded-xl cursor-pointer transition-all flex items-center justify-between border"
                  style={{
                    backgroundColor: isSelected ? themeConfig.bgTabActive : 'transparent',
                    borderColor: isSelected ? themeConfig.accent : 'transparent',
                    color: isSelected ? themeConfig.textPrimary : themeConfig.textSecondary
                  }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{
                        backgroundColor: isSelected ? themeConfig.accentBg : themeConfig.bgHeader,
                        color: isSelected ? themeConfig.accent : themeConfig.textMuted
                      }}
                    >
                      <Terminal className="w-3.5 h-3.5" />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs truncate" style={{ color: themeConfig.textPrimary }}>
                          {item.name}
                        </span>

                        {item.gitInfo?.branch && (
                          <span
                            className="text-[9px] px-1.5 py-0.2 rounded flex items-center gap-0.5 border"
                            style={{
                              backgroundColor: themeConfig.accentBg,
                              borderColor: themeConfig.accent,
                              color: themeConfig.accent
                            }}
                          >
                            <GitBranch className="w-2.5 h-2.5" />
                            <span>{item.gitInfo.branch}</span>
                          </span>
                        )}

                        {item.metrics?.lastCost !== undefined && (
                          <span
                            className="text-[9px] px-1.5 py-0.2 rounded font-mono"
                            style={{
                              backgroundColor: `${themeConfig.accent}20`,
                              color: themeConfig.accent
                            }}
                          >
                            ${item.metrics.lastCost.toFixed(2)}
                          </span>
                        )}
                      </div>

                      <div className="text-[10px] truncate mt-0.5" style={{ color: themeConfig.textMuted }} title={item.path}>
                        {item.path}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0 text-[10px]">
                    <span
                      className="px-2 py-0.5 rounded text-[10px] font-bold"
                      style={{
                        backgroundColor: isSelected ? themeConfig.accent : themeConfig.bgHeader,
                        color: isSelected ? '#ffffff' : themeConfig.textMuted
                      }}
                    >
                      ↵ Open in New Tab
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div
          className="px-4 py-2.5 border-t flex items-center justify-between text-[11px]"
          style={{
            backgroundColor: themeConfig.bgHeader,
            borderColor: themeConfig.border,
            color: themeConfig.textMuted
          }}
        >
          <div className="flex items-center gap-3">
            <span>{filtered.length} indexed repositories</span>
            <span>•</span>
            <span>Press <kbd className="px-1 py-0.5 rounded bg-black/20 text-zinc-300">↵</kbd> to open</span>
          </div>

          <button
            onClick={() => {
              onClose();
              onOpenAddModal();
            }}
            className="flex items-center gap-1 font-bold hover:underline"
            style={{ color: themeConfig.accent }}
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>Manual Path Entry...</span>
          </button>
        </div>
      </div>
    </div>
  );
};
