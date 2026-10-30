import React, { useState, useEffect, useRef } from 'react';
import {
  Terminal,
  Play,
  Copy,
  Check,
  FolderOpen,
  Code2,
  ExternalLink,
  Sliders,
  Sparkles,
  Command,
  FileText
} from 'lucide-react';
import { ProjectItem, ProjectFlags } from '../types';
import { playClickSound, playToggleSound, playLaunchSound } from '../utils/audio';

interface OmnibarProps {
  project: ProjectItem;
  customInput: string;
  onCustomInputChange: (val: string) => void;
  onUpdateFlags: (projectId: string, flags: ProjectFlags) => void;
  onLaunch: (projectId: string, fullCommand: string) => void;
  onOpenFolder: (path: string) => void;
  onOpenEditor: (path: string, editor?: string) => void;
  defaultTerminal: string;
}

const COMMON_FLAGS = [
  { flag: '--chrome', desc: 'browser extension' },
  { flag: '--bare', desc: 'minimal mode' },
  { flag: '--verbose', desc: 'debug logs' },
  { flag: '--worktree', desc: 'git worktree' },
  { flag: '/doctor', desc: 'health check' }
];

export const Omnibar: React.FC<OmnibarProps> = ({
  project,
  customInput,
  onCustomInputChange,
  onUpdateFlags,
  onLaunch,
  onOpenFolder,
  onOpenEditor,
  defaultTerminal
}) => {
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const flags = project.flags || {
    dangerouslySkipPermissions: true,
    continueLast: false,
    chrome: false,
    verbose: false,
    bare: false
  };

  // Build the complete command line string dynamically
  const commandParts = ['claude'];
  if (flags.dangerouslySkipPermissions) commandParts.push('--dangerously-skip-permissions');
  if (flags.continueLast) commandParts.push('--continue');
  if (flags.chrome) commandParts.push('--chrome');
  if (flags.verbose) commandParts.push('--verbose');
  if (flags.bare) commandParts.push('--bare');
  if (customInput && customInput.trim()) {
    commandParts.push(customInput.trim());
  }
  const fullCommand = commandParts.join(' ');

  const toggleFlag = (key: keyof ProjectFlags) => {
    const nextVal = !flags[key];
    playToggleSound(nextVal);
    onUpdateFlags(project.id, {
      ...flags,
      [key]: nextVal
    });
  };

  const handleCopyCmd = () => {
    playClickSound();
    navigator.clipboard.writeText(fullCommand);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 1500);
  };

  const handleCopyPath = () => {
    playClickSound();
    navigator.clipboard.writeText(project.path);
    setCopiedPath(true);
    setTimeout(() => setCopiedPath(false), 1500);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      playLaunchSound();
      onLaunch(project.id, fullCommand);
    }
  };

  const appendQuickFlag = (flag: string) => {
    playClickSound();
    if (!customInput.includes(flag)) {
      const next = customInput ? `${customInput.trim()} ${flag}` : flag;
      onCustomInputChange(next);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="bg-[#141722] border-b border-[#22293b] px-4 py-2.5 font-mono select-none">
      {/* 1. The Chrome-like Omnibar Row */}
      <div className="flex items-center gap-2">
        {/* Working Directory Breadcrumb Badge */}
        <div
          onClick={handleCopyPath}
          title="Click to copy path"
          className="group/p flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#0e111a] border border-[#232a3d] text-[11px] text-zinc-300 hover:text-white hover:border-[#38435f] cursor-pointer transition-colors max-w-xs truncate flex-shrink-0"
        >
          <span className="text-amber-500 font-bold">❯</span>
          <span className="truncate">{project.path}</span>
          {copiedPath ? (
            <Check className="w-3 h-3 text-emerald-400 flex-shrink-0" />
          ) : (
            <Copy className="w-3 h-3 text-zinc-600 group-hover/p:text-zinc-400 flex-shrink-0" />
          )}
        </div>

        {/* Omnibar Input Field for extra flags / commands / prompts */}
        <div className="flex-1 relative flex items-center">
          <Terminal className="w-3.5 h-3.5 text-zinc-500 absolute left-3 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Type extra flags, prompt or commands (e.g. --worktree feat, -p 'fix tests', /doctor)..."
            value={customInput}
            onChange={(e) => onCustomInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full bg-[#0c0e16] hover:bg-[#0f121c] focus:bg-[#0c0e16] border border-[#232a3d] focus:border-amber-500/80 text-zinc-100 text-xs pl-8 pr-16 py-1.5 rounded-lg outline-none transition-colors"
          />
          <span className="absolute right-2.5 text-[10px] text-zinc-500 font-mono pointer-events-none">
            ↵ ENTER
          </span>
        </div>

        {/* Primary Run in Terminal Button */}
        <button
          onClick={() => {
            playLaunchSound();
            onLaunch(project.id, fullCommand);
          }}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-[#cc6b49] to-[#d97706] hover:from-[#d67350] hover:to-[#e38312] text-white text-xs font-bold shadow-md shadow-amber-950/30 transition-all active:scale-95 flex-shrink-0"
        >
          <Play className="w-3.5 h-3.5 fill-white" />
          <span>RUN</span>
        </button>
      </div>

      {/* 2. Interactive Flag Pills + Quick Command Suggestions */}
      <div className="flex flex-wrap items-center justify-between gap-2 mt-2 pt-2 border-t border-[#1c2233] text-[11px]">
        {/* Core Quick Toggle Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* --dangerously-skip-permissions pill */}
          <button
            type="button"
            onClick={() => toggleFlag('dangerouslySkipPermissions')}
            className={`px-2 py-0.5 rounded-md border text-[10px] font-bold transition-all flex items-center gap-1.5 ${
              flags.dangerouslySkipPermissions
                ? 'bg-amber-500/15 border-amber-500/60 text-amber-300 shadow-sm'
                : 'bg-[#0f121a] border-[#22293a] text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                flags.dangerouslySkipPermissions ? 'bg-amber-400' : 'bg-zinc-700'
              }`}
            />
            <span>--dangerously-skip-permissions</span>
          </button>

          {/* --continue pill */}
          <button
            type="button"
            onClick={() => toggleFlag('continueLast')}
            className={`px-2 py-0.5 rounded-md border text-[10px] font-bold transition-all flex items-center gap-1.5 ${
              flags.continueLast
                ? 'bg-emerald-500/15 border-emerald-500/60 text-emerald-300 shadow-sm'
                : 'bg-[#0f121a] border-[#22293a] text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                flags.continueLast ? 'bg-emerald-400' : 'bg-zinc-700'
              }`}
            />
            <span>--continue (-c)</span>
          </button>

          {/* Quick extra flags autocomplete pills */}
          {COMMON_FLAGS.map((item) => (
            <button
              key={item.flag}
              type="button"
              onClick={() => appendQuickFlag(item.flag)}
              className="px-1.5 py-0.5 rounded border border-[#202636] bg-[#0c0e15] hover:bg-[#161a25] hover:border-[#303a4f] text-[10px] text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              +{item.flag}
            </button>
          ))}
        </div>

        {/* Quick App Launchers (Finder, VS Code, Cursor) */}
        <div className="flex items-center gap-1 text-[11px] text-zinc-400">
          <button
            onClick={() => {
              playClickSound();
              onOpenFolder(project.path);
            }}
            title="Open folder in Finder (⌘O)"
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#0e111a] hover:bg-[#181d2a] border border-[#202738] hover:border-[#323d57] text-zinc-300 transition-colors"
          >
            <FolderOpen className="w-3 h-3" />
            <span>Finder</span>
          </button>
          <button
            onClick={() => {
              playClickSound();
              onOpenEditor(project.path, 'VSCode');
            }}
            title="Open in VS Code (⌘E)"
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#0e111a] hover:bg-[#181d2a] border border-[#202738] hover:border-[#323d57] text-zinc-300 transition-colors"
          >
            <Code2 className="w-3 h-3" />
            <span>VS Code</span>
          </button>
        </div>
      </div>

      {/* 3. Live Full Command Display (Exact Command That Runs in Terminal!) */}
      <div className="mt-2 bg-[#090b10] border border-[#1e2536] rounded-md px-3 py-1.5 flex items-center justify-between text-[11px] font-mono">
        <div className="flex items-center gap-2 overflow-x-auto select-text pr-2">
          <span className="text-amber-500 font-bold select-none">$</span>
          <span className="text-zinc-500">cd </span>
          <span className="text-emerald-400">"{project.path}"</span>
          <span className="text-zinc-500"> && </span>
          <span className="text-white font-semibold">{fullCommand}</span>
        </div>
        <button
          onClick={handleCopyCmd}
          className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-200 flex-shrink-0 ml-2"
          title="Copy command"
        >
          {copiedCmd ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400">COPIED</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>COPY</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
