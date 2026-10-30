import React, { useState } from 'react';
import {
  Terminal,
  FolderOpen,
  Code2,
  FileText,
  Star,
  Copy,
  Check,
  GitBranch,
  Trash2
} from 'lucide-react';
import { ProjectItem, ProjectFlags } from '../types';

interface ProjectRowProps {
  project: ProjectItem;
  onUpdateFlags: (projectId: string, flags: ProjectFlags) => void;
  onToggleFavorite: (projectId: string, isFav: boolean) => void;
  onLaunch: (projectId: string) => void;
  onOpenFolder: (path: string) => void;
  onOpenEditor: (path: string) => void;
  onViewFiles: (project: ProjectItem) => void;
  onViewClaudeMd: (project: ProjectItem) => void;
  onRemove: (projectId: string) => void;
}

export const ProjectRow: React.FC<ProjectRowProps> = ({
  project,
  onUpdateFlags,
  onToggleFavorite,
  onLaunch,
  onOpenFolder,
  onOpenEditor,
  onViewFiles,
  onViewClaudeMd,
  onRemove
}) => {
  const [copied, setCopied] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);

  const flags = project.flags || {
    dangerouslySkipPermissions: true,
    continueLast: false,
    chrome: false,
    verbose: false,
    bare: false
  };

  const commandParts = ['claude'];
  if (flags.dangerouslySkipPermissions) commandParts.push('--dangerously-skip-permissions');
  if (flags.continueLast) commandParts.push('--continue');
  if (flags.chrome) commandParts.push('--chrome');
  if (flags.verbose) commandParts.push('--verbose');
  if (project.customFlags && project.customFlags.trim()) {
    commandParts.push(project.customFlags.trim());
  }
  const fullCommand = commandParts.join(' ');

  const handleFlagToggle = (key: keyof ProjectFlags) => {
    onUpdateFlags(project.id, {
      ...flags,
      [key]: !flags[key]
    });
  };

  const copyCommand = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(fullCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleLaunchClick = async () => {
    setIsLaunching(true);
    try {
      await onLaunch(project.id);
    } finally {
      setTimeout(() => setIsLaunching(false), 1000);
    }
  };

  return (
    <div className="group bg-[#13161f] hover:bg-[#171b26] border border-[#232938] hover:border-[#38435d] rounded-lg p-3 transition-colors flex items-center justify-between gap-4">
      {/* Left: Star, Name, Git, Path */}
      <div className="flex items-center gap-3 min-w-[240px] max-w-[320px]">
        <button
          onClick={() => onToggleFavorite(project.id, !project.isFavorite)}
          className="text-zinc-500 hover:text-amber-400 transition-colors flex-shrink-0"
        >
          <Star
            className={`w-4 h-4 ${
              project.isFavorite ? 'text-amber-400 fill-amber-400' : ''
            }`}
          />
        </button>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-zinc-100 truncate group-hover:text-amber-400/90 transition-colors">
              {project.name}
            </span>
            {project.gitInfo?.isGit && (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-medium bg-[#1e2433] text-zinc-300 border border-[#2b3348] px-1.5 py-0.2 rounded">
                <GitBranch className="w-2.5 h-2.5 text-sky-400" />
                <span>{project.gitInfo.branch}</span>
              </span>
            )}
            {project.hasClaudeMd && (
              <button
                onClick={() => onViewClaudeMd(project)}
                className="text-[9px] font-medium bg-[#cc6b49]/15 text-[#f29472] border border-[#cc6b49]/30 px-1 rounded hover:bg-[#cc6b49]/30 transition-colors"
                title="View CLAUDE.md"
              >
                MD
              </button>
            )}
          </div>
          <p
            className="text-[10px] font-mono text-zinc-500 truncate"
            title={project.path}
          >
            {project.path}
          </p>
        </div>
      </div>

      {/* Center: Command Flag Toggles */}
      <div className="flex items-center gap-4 flex-shrink-0">
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={flags.dangerouslySkipPermissions}
            onChange={() => handleFlagToggle('dangerouslySkipPermissions')}
            className="w-3.5 h-3.5 rounded bg-[#1a1e2b] border-[#374056] text-[#cc6b49] accent-[#cc6b49] cursor-pointer"
          />
          <span
            className={`text-xs font-mono transition-colors ${
              flags.dangerouslySkipPermissions
                ? 'text-amber-400 font-semibold'
                : 'text-zinc-500'
            }`}
          >
            --dangerously-skip-permissions
          </span>
        </label>

        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={flags.continueLast}
            onChange={() => handleFlagToggle('continueLast')}
            className="w-3.5 h-3.5 rounded bg-[#1a1e2b] border-[#374056] text-[#cc6b49] accent-[#cc6b49] cursor-pointer"
          />
          <span
            className={`text-xs font-mono transition-colors ${
              flags.continueLast
                ? 'text-emerald-400 font-semibold'
                : 'text-zinc-500'
            }`}
          >
            -c
          </span>
        </label>

        {/* Command Pill */}
        <div
          onClick={copyCommand}
          className="cursor-pointer bg-[#0a0c10] border border-[#212736] hover:border-[#38435d] rounded px-2 py-1 flex items-center gap-1 text-[11px] font-mono text-zinc-300 max-w-[220px] truncate"
          title="Click to copy command"
        >
          <span className="text-emerald-400">$</span>
          <span className="truncate">{fullCommand}</span>
          {copied ? (
            <Check className="w-3 h-3 text-emerald-400 ml-1 flex-shrink-0" />
          ) : (
            <Copy className="w-3 h-3 text-zinc-500 ml-1 flex-shrink-0" />
          )}
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={() => onOpenFolder(project.path)}
          title="Open in Finder"
          className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-[#202636] rounded-md transition-colors"
        >
          <FolderOpen className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onOpenEditor(project.path)}
          title="Open in VS Code"
          className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-[#202636] rounded-md transition-colors"
        >
          <Code2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onViewFiles(project)}
          title="Browse Files"
          className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-[#202636] rounded-md transition-colors"
        >
          <FileText className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onRemove(project.id)}
          title="Remove from list"
          className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>

        {/* Launch button */}
        <button
          onClick={handleLaunchClick}
          disabled={isLaunching}
          className="ml-2 flex items-center gap-1.5 bg-gradient-to-r from-[#cc6b49] to-[#d97706] hover:from-[#d67350] hover:to-[#e38312] text-white text-xs font-medium px-3 py-1.5 rounded-lg shadow-sm transition-all disabled:opacity-50"
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>Launch</span>
        </button>
      </div>
    </div>
  );
};

