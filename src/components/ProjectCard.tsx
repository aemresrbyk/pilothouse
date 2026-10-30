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
  Trash2,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Play
} from 'lucide-react';
import { ProjectItem, ProjectFlags } from '../types';

interface ProjectCardProps {
  project: ProjectItem;
  onUpdateFlags: (projectId: string, flags: ProjectFlags) => void;
  onUpdateCustomFlags: (projectId: string, customFlags: string) => void;
  onToggleFavorite: (projectId: string, isFav: boolean) => void;
  onLaunch: (projectId: string) => void;
  onOpenFolder: (path: string) => void;
  onOpenEditor: (path: string) => void;
  onViewFiles: (project: ProjectItem) => void;
  onViewClaudeMd: (project: ProjectItem) => void;
  onRemove: (projectId: string) => void;
  defaultTerminal: string;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  onUpdateFlags,
  onUpdateCustomFlags,
  onToggleFavorite,
  onLaunch,
  onOpenFolder,
  onOpenEditor,
  onViewFiles,
  onViewClaudeMd,
  onRemove,
  defaultTerminal
}) => {
  const [copied, setCopied] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);

  const flags = project.flags || {
    dangerouslySkipPermissions: true,
    continueLast: false,
    chrome: false,
    verbose: false,
    bare: false
  };

  // Build command string
  const commandParts = ['claude'];
  if (flags.dangerouslySkipPermissions) commandParts.push('--dangerously-skip-permissions');
  if (flags.continueLast) commandParts.push('--continue');
  if (flags.chrome) commandParts.push('--chrome');
  if (flags.verbose) commandParts.push('--verbose');
  if (flags.bare) commandParts.push('--bare');
  if (project.customFlags && project.customFlags.trim()) {
    commandParts.push(project.customFlags.trim());
  }
  const fullCommand = commandParts.join(' ');

  const handleFlagToggle = (key: keyof ProjectFlags) => {
    const updated = {
      ...flags,
      [key]: !flags[key]
    };
    onUpdateFlags(project.id, updated);
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

  const formatLastActive = (timestamp?: number) => {
    if (!timestamp) return 'Never launched';
    const diffMs = Date.now() - timestamp;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  return (
    <div className="group relative bg-[#13161f] hover:bg-[#161a25] border border-[#232938] hover:border-[#38435d] rounded-xl p-4 transition-all duration-200 flex flex-col justify-between shadow-sm hover:shadow-md">
      <div>
        {/* Card Header: Title, Favorite, Badges */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-zinc-100 truncate group-hover:text-amber-400/90 transition-colors">
                {project.name}
              </h2>
              {project.isFavorite && (
                <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 flex-shrink-0" />
              )}
            </div>

            {/* Path */}
            <p
              title={project.path}
              className="text-[11px] font-mono text-zinc-400 truncate mt-0.5"
            >
              {project.path}
            </p>
          </div>

          {/* Quick Favorite Button */}
          <button
            onClick={() => onToggleFavorite(project.id, !project.isFavorite)}
            className="p-1 rounded-md text-zinc-400 hover:text-amber-400 transition-colors"
            title={project.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Star
              className={`w-4 h-4 ${
                project.isFavorite ? 'text-amber-400 fill-amber-400' : ''
              }`}
            />
          </button>
        </div>

        {/* Metadata badges: Git, CLAUDE.md, Last Launched */}
        <div className="flex flex-wrap items-center gap-1.5 mb-3.5">
          {project.gitInfo?.isGit && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-[#1d2331] text-zinc-300 border border-[#2e374d] px-2 py-0.5 rounded-md">
              <GitBranch className="w-3 h-3 text-sky-400" />
              <span>{project.gitInfo.branch || 'git'}</span>
            </span>
          )}

          {project.hasClaudeMd && (
            <button
              onClick={() => onViewClaudeMd(project)}
              className="inline-flex items-center gap-1 text-[10px] font-medium bg-[#cc6b49]/15 hover:bg-[#cc6b49]/25 text-[#f29472] border border-[#cc6b49]/30 px-2 py-0.5 rounded-md transition-colors"
              title="Click to view CLAUDE.md"
            >
              <FileText className="w-3 h-3 text-[#f29472]" />
              <span>CLAUDE.md</span>
            </button>
          )}

          <span className="text-[10px] text-zinc-400 ml-auto">
            {formatLastActive(project.lastLaunched)}
          </span>
        </div>

        {/* Flag Checkboxes (Core Feature) */}
        <div className="bg-[#0e1017] border border-[#212636] rounded-lg p-2.5 mb-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              Launch Flags
            </span>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-[10px] text-zinc-400 hover:text-zinc-300 flex items-center gap-0.5"
            >
              <span>{showAdvanced ? 'Less' : 'More'}</span>
              {showAdvanced ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>
          </div>

          <div className="space-y-1.5">
            {/* --dangerously-skip-permissions checkbox */}
            <label className="flex items-center gap-2 cursor-pointer group/flag select-none">
              <input
                type="checkbox"
                checked={flags.dangerouslySkipPermissions}
                onChange={() => handleFlagToggle('dangerouslySkipPermissions')}
                className="w-3.5 h-3.5 rounded bg-[#1a1e2b] border-[#374056] text-[#cc6b49] focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#cc6b49]"
              />
              <span
                className={`text-xs font-mono transition-colors ${
                  flags.dangerouslySkipPermissions
                    ? 'text-amber-400 font-semibold'
                    : 'text-zinc-400 group-hover/flag:text-zinc-300'
                }`}
              >
                --dangerously-skip-permissions
              </span>
            </label>

            {/* --continue checkbox */}
            <label className="flex items-center gap-2 cursor-pointer group/flag select-none">
              <input
                type="checkbox"
                checked={flags.continueLast}
                onChange={() => handleFlagToggle('continueLast')}
                className="w-3.5 h-3.5 rounded bg-[#1a1e2b] border-[#374056] text-[#cc6b49] focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#cc6b49]"
              />
              <span
                className={`text-xs font-mono transition-colors ${
                  flags.continueLast
                    ? 'text-emerald-400 font-semibold'
                    : 'text-zinc-400 group-hover/flag:text-zinc-300'
                }`}
              >
                --continue <span className="text-[10px] text-zinc-500 font-sans">(-c resume)</span>
              </span>
            </label>

            {/* Advanced flags */}
            {showAdvanced && (
              <>
                <label className="flex items-center gap-2 cursor-pointer group/flag select-none pt-0.5">
                  <input
                    type="checkbox"
                    checked={flags.chrome}
                    onChange={() => handleFlagToggle('chrome')}
                    className="w-3.5 h-3.5 rounded bg-[#1a1e2b] border-[#374056] text-[#cc6b49] focus:ring-0 cursor-pointer accent-[#cc6b49]"
                  />
                  <span
                    className={`text-xs font-mono transition-colors ${
                      flags.chrome
                        ? 'text-sky-400 font-semibold'
                        : 'text-zinc-400 group-hover/flag:text-zinc-300'
                    }`}
                  >
                    --chrome <span className="text-[10px] text-zinc-500 font-sans">(browser integration)</span>
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer group/flag select-none">
                  <input
                    type="checkbox"
                    checked={flags.verbose}
                    onChange={() => handleFlagToggle('verbose')}
                    className="w-3.5 h-3.5 rounded bg-[#1a1e2b] border-[#374056] text-[#cc6b49] focus:ring-0 cursor-pointer accent-[#cc6b49]"
                  />
                  <span
                    className={`text-xs font-mono transition-colors ${
                      flags.verbose
                        ? 'text-purple-400 font-semibold'
                        : 'text-zinc-400 group-hover/flag:text-zinc-300'
                    }`}
                  >
                    --verbose
                  </span>
                </label>

                {/* Custom Flags input */}
                <div className="pt-1.5">
                  <input
                    type="text"
                    placeholder="Custom flags, e.g. --worktree feature-a"
                    value={project.customFlags || ''}
                    onChange={(e) => onUpdateCustomFlags(project.id, e.target.value)}
                    className="w-full bg-[#151822] border border-[#2a3144] focus:border-[#cc6b49] text-xs font-mono text-zinc-200 placeholder-zinc-600 rounded px-2 py-1 outline-none transition-colors"
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Live Command Preview Box */}
        <div className="group/cmd relative bg-[#090b0e] border border-[#1d222e] rounded-lg p-2 mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5 overflow-hidden pr-2">
            <span className="text-emerald-400 font-mono text-xs select-none">$</span>
            <code className="text-[11px] font-mono text-zinc-300 truncate" title={fullCommand}>
              {fullCommand}
            </code>
          </div>
          <button
            onClick={copyCommand}
            className="flex-shrink-0 p-1 text-zinc-500 hover:text-zinc-300 rounded transition-colors"
            title="Copy command to clipboard"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Bottom Actions Row */}
      <div className="pt-2 border-t border-[#1d222e] flex items-center justify-between gap-1.5">
        {/* Auxiliary actions: Finder, VS Code, Files */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => onOpenFolder(project.path)}
            title="Open in Finder"
            className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-[#202636] rounded-lg transition-colors"
          >
            <FolderOpen className="w-4 h-4" />
          </button>
          <button
            onClick={() => onOpenEditor(project.path)}
            title="Open in VS Code / Editor"
            className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-[#202636] rounded-lg transition-colors"
          >
            <Code2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => onViewFiles(project)}
            title="Browse Project Files"
            className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-[#202636] rounded-lg transition-colors"
          >
            <FileText className="w-4 h-4" />
          </button>
          <button
            onClick={() => onRemove(project.id)}
            title="Remove from list"
            className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Primary Launch Button */}
        <button
          onClick={handleLaunchClick}
          disabled={isLaunching}
          className="flex items-center gap-1.5 bg-gradient-to-r from-[#cc6b49] to-[#d97706] hover:from-[#d67350] hover:to-[#e38312] active:scale-95 text-white font-medium text-xs px-3.5 py-1.5 rounded-lg shadow-md shadow-[#cc6b49]/20 transition-all disabled:opacity-50"
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>{isLaunching ? 'Launching...' : 'Launch Claude'}</span>
        </button>
      </div>
    </div>
  );
};
