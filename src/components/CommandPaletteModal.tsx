import React, { useState, useEffect, useRef } from 'react';
import { Search, FolderPlus, GitBranch, Terminal, Plus, X } from 'lucide-react';
import { ProjectItem } from '../types';
import { playClickSound } from '../utils/audio';

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: ProjectItem[];
  onSelectProject: (projectId: string, inNewTab: boolean) => void;
  onOpenAddModal: () => void;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  projects,
  onSelectProject,
  onOpenAddModal
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < filtered.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : filtered.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        playClickSound();
        onSelectProject(filtered[selectedIndex].id, e.metaKey || e.ctrlKey);
        onClose();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-black/75 backdrop-blur-sm select-none font-mono"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-[#0d1017] border border-[#232b3d] rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-fade-in"
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1c2233] bg-[#10131d]">
          <Search className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search projects by name, path, or git branch..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            className="w-full bg-transparent text-xs text-zinc-100 placeholder-zinc-600 outline-none"
          />
          <span className="text-[10px] text-zinc-500 bg-[#161a25] px-1.5 py-0.5 rounded">
            ESC
          </span>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto divide-y divide-[#151924] p-1">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-xs text-zinc-600">
              No repositories match "{query}"
            </div>
          ) : (
            filtered.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={() => {
                    playClickSound();
                    onSelectProject(item.id, false);
                    onClose();
                  }}
                  className={`px-3 py-2.5 rounded-lg cursor-pointer transition-colors flex items-center justify-between ${
                    isSelected ? 'bg-[#181f2f] text-white' : 'hover:bg-[#121620] text-zinc-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Terminal className={`w-3.5 h-3.5 flex-shrink-0 ${isSelected ? 'text-amber-400' : 'text-zinc-500'}`} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs truncate">{item.name}</span>
                        {item.gitInfo?.branch && (
                          <span className="text-[9px] text-sky-400 bg-sky-950/40 border border-sky-800/40 px-1 rounded flex items-center gap-0.5">
                            <GitBranch className="w-2.5 h-2.5" />
                            <span>{item.gitInfo.branch}</span>
                          </span>
                        )}
                        {item.metrics?.lastCost !== undefined && (
                          <span className="text-[9px] text-amber-400 bg-amber-500/10 px-1 rounded">
                            ${item.metrics.lastCost.toFixed(2)}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-zinc-500 truncate mt-0.5" title={item.path}>
                        {item.path}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0 text-[10px] text-zinc-500">
                    {isSelected && (
                      <span className="text-[9px] text-zinc-400 bg-[#1f273b] px-1.5 py-0.5 rounded">
                        ↵ OPEN &nbsp;|&nbsp; ⌘↵ NEW TAB
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-[#1c2233] bg-[#0c0e14] flex items-center justify-between text-[10px] text-zinc-500">
          <span>{filtered.length} repositories indexed</span>
          <button
            onClick={() => {
              onClose();
              onOpenAddModal();
            }}
            className="flex items-center gap-1 text-amber-400 hover:text-amber-300 transition-colors"
          >
            <FolderPlus className="w-3 h-3" />
            <span>Add Folder on Disk</span>
          </button>
        </div>
      </div>
    </div>
  );
};

