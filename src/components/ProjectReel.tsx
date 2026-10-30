import React from 'react';
import {
  GitBranch,
  Star,
  FileText,
  DollarSign,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { ProjectItem } from '../types';
import { playClickSound } from '../utils/audio';

interface ProjectReelProps {
  projects: ProjectItem[];
  selectedId: string | null;
  onSelectProject: (p: ProjectItem) => void;
  onToggleFavorite: (id: string, isFav: boolean) => void;
}

export const ProjectReel: React.FC<ProjectReelProps> = ({
  projects,
  selectedId,
  onSelectProject,
  onToggleFavorite
}) => {
  return (
    <aside className="w-80 h-full flex flex-col bg-[#0b0c11] border-r border-[#1a1f2b] select-none">
      {/* Sidebar Header */}
      <div className="px-3.5 py-2 border-b border-[#181d29] flex items-center justify-between text-[11px] font-mono text-zinc-500 bg-[#0c0e14]">
        <span className="font-semibold tracking-wider text-zinc-400">
          // REPOSITORIES [{projects.length.toString().padStart(2, '0')}]
        </span>
        <span className="text-[10px] text-zinc-600">KEY [↑/↓]</span>
      </div>

      {/* Projects List */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#151923]">
        {projects.length === 0 ? (
          <div className="p-6 text-center text-xs font-mono text-zinc-600">
            NO MATCHING REPOS
          </div>
        ) : (
          projects.map((item, index) => {
            const isSelected = item.id === selectedId;
            const indexStr = (index + 1).toString().padStart(2, '0');
            const hasCost = item.metrics?.lastCost !== undefined && item.metrics.lastCost > 0;

            return (
              <div
                key={item.id}
                onClick={() => {
                  playClickSound();
                  onSelectProject(item);
                }}
                className={`group relative px-3 py-2.5 cursor-pointer transition-all flex items-center gap-2.5 ${
                  isSelected
                    ? 'bg-[#151924] border-l-2 border-amber-500 text-zinc-100'
                    : 'hover:bg-[#10131a] text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {/* Index Number */}
                <span
                  className={`font-mono text-[10px] font-semibold tracking-tight transition-colors ${
                    isSelected ? 'text-amber-500' : 'text-zinc-600 group-hover:text-zinc-400'
                  }`}
                >
                  {indexStr}
                </span>

                {/* Main Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={`text-xs font-mono font-medium truncate ${
                        isSelected ? 'text-white' : 'text-zinc-300'
                      }`}
                    >
                      {item.name}
                    </span>

                    {/* Cost or Favorite */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {hasCost && (
                        <span className="text-[9px] font-mono font-medium text-amber-400/90 bg-amber-500/10 px-1 rounded border border-amber-500/20">
                          ${item.metrics?.lastCost?.toFixed(2)}
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          playClickSound();
                          onToggleFavorite(item.id, !item.isFavorite);
                        }}
                        className={`p-0.5 rounded transition-colors ${
                          item.isFavorite
                            ? 'text-amber-400'
                            : 'text-zinc-700 hover:text-zinc-400 opacity-0 group-hover:opacity-100'
                        }`}
                      >
                        <Star
                          className={`w-3 h-3 ${
                            item.isFavorite ? 'fill-amber-400' : ''
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Metadata Row: Branch, CLAUDE.md */}
                  <div className="flex items-center gap-1.5 mt-1 font-mono text-[10px] text-zinc-500 truncate">
                    {item.gitInfo?.isGit && (
                      <span className="flex items-center gap-0.5 text-zinc-400">
                        <GitBranch className="w-2.5 h-2.5 text-sky-400 flex-shrink-0" />
                        <span className="truncate max-w-[85px]">
                          {item.gitInfo.branch || 'git'}
                        </span>
                      </span>
                    )}

                    {item.hasClaudeMd && (
                      <span className="flex items-center gap-0.5 text-[#e07a5f] bg-[#e07a5f]/10 px-1 rounded text-[9px]">
                        <FileText className="w-2.5 h-2.5" />
                        <span>MD</span>
                      </span>
                    )}

                    {/* Dangerous flag active badge */}
                    {item.flags?.dangerouslySkipPermissions && (
                      <span className="text-[8px] tracking-wider text-amber-500/80 bg-amber-500/10 px-1 rounded uppercase">
                        SKIP
                      </span>
                    )}
                  </div>
                </div>

                {/* Right Arrow */}
                {isSelected && (
                  <ChevronRight className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 animate-pulse" />
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer hint */}
      <div className="px-3 py-1.5 border-t border-[#181d29] text-[10px] font-mono text-zinc-600 bg-[#0c0e14] flex items-center justify-between">
        <span>NAV: ↑ / ↓</span>
        <span>LAUNCH: ↵</span>
      </div>
    </aside>
  );
};
