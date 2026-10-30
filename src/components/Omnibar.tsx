import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Terminal,
  Play,
  Copy,
  Check,
  FolderOpen,
  Code2,
  Sparkles,
  Command,
  History,
  RotateCcw,
  Tag
} from 'lucide-react';
import { ProjectItem, ProjectFlags, ClaudeSession } from '../types';
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

interface SuggestionItem {
  token: string;
  desc: string;
  category: 'FLAG' | 'COMMAND' | 'SESSION';
}

const ALL_SUGGESTIONS: SuggestionItem[] = [
  { token: '--dangerously-skip-permissions', desc: 'Bypass all permission checks (sandbox/fast)', category: 'FLAG' },
  { token: '--continue', desc: 'Resume the most recent conversation (-c)', category: 'FLAG' },
  { token: '--chrome', desc: 'Enable Claude in Chrome integration', category: 'FLAG' },
  { token: '--bare', desc: 'Minimal mode: skip hooks, plugins, auto-memory', category: 'FLAG' },
  { token: '--verbose', desc: 'Override verbose setting to show debug logs', category: 'FLAG' },
  { token: '--worktree', desc: 'Create a new git worktree for this session', category: 'FLAG' },
  { token: '--model claude-3-7-sonnet', desc: 'Use Claude 3.7 Sonnet model', category: 'FLAG' },
  { token: '--model claude-3-5-haiku', desc: 'Use lightweight Claude 3.5 Haiku', category: 'FLAG' },
  { token: '--allowed-tools "Bash,Edit,Read"', desc: 'Whitelist specific tools only', category: 'FLAG' },
  { token: '/doctor', desc: 'Check health of Claude Code installation', category: 'COMMAND' },
  { token: '/init', desc: 'Generate CLAUDE.md context guide for project', category: 'COMMAND' },
  { token: 'ultrareview', desc: 'Run multi-agent cloud code review of branch', category: 'COMMAND' },
  { token: 'agents', desc: 'Manage background agent sessions', category: 'COMMAND' },
  { token: 'mcp list', desc: 'Inspect configured MCP servers', category: 'COMMAND' }
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
  const [isFocused, setIsFocused] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  // Dynamic suggestions: combine built-in flags with past project sessions!
  const suggestions = useMemo(() => {
    const list: SuggestionItem[] = [...ALL_SUGGESTIONS];

    // Add recent sessions from project telemetry if available
    if (project.metrics?.sessions && project.metrics.sessions.length > 0) {
      project.metrics.sessions.slice(0, 4).forEach((s) => {
        list.push({
          token: `--resume ${s.id}`,
          desc: `Resume session from ${s.dateStr} (${s.formattedSize})`,
          category: 'SESSION'
        });
      });
    }

    const query = customInput.toLowerCase().trim();
    if (!query) {
      return list.slice(0, 6);
    }

    return list
      .filter(
        (s) =>
          s.token.toLowerCase().includes(query) ||
          s.desc.toLowerCase().includes(query)
      )
      .slice(0, 7);
  }, [customInput, project.metrics?.sessions]);

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

  const applySuggestion = (item: SuggestionItem) => {
    playClickSound();
    onCustomInputChange(item.token);
    setIsFocused(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Navigate autocomplete dropdown if open
    if (isFocused && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        if (suggestions[selectedIndex]) {
          applySuggestion(suggestions[selectedIndex]);
        }
        return;
      }
    }

    // Command History Recall (Up/Down arrow when suggestions not navigating)
    const history = project.commandHistory || [];
    if (history.length > 0 && !isFocused) {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const nextIdx = Math.min(history.length - 1, historyIndex + 1);
        setHistoryIndex(nextIdx);
        onCustomInputChange(history[nextIdx]);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIdx = Math.max(-1, historyIndex - 1);
        setHistoryIndex(nextIdx);
        onCustomInputChange(nextIdx >= 0 ? history[nextIdx] : '');
        return;
      }
    }

    // Enter -> Run
    if (e.key === 'Enter') {
      e.preventDefault();
      setIsFocused(false);
      playLaunchSound();
      onLaunch(project.id, fullCommand);
    }
  };

  return (
    <div className="bg-[#141722] border-b border-[#22293b] px-4 py-2.5 font-mono select-none relative">
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

        {/* Omnibar Input Field */}
        <div className="flex-1 relative flex items-center">
          <Terminal className="w-3.5 h-3.5 text-zinc-500 absolute left-3 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Type extra flags, prompt or commands (e.g. --worktree feat, -p 'fix tests', /doctor)..."
            value={customInput}
            onFocus={() => {
              setIsFocused(true);
              setSelectedIndex(0);
            }}
            onBlur={() => {
              setTimeout(() => setIsFocused(false), 200);
            }}
            onChange={(e) => onCustomInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full bg-[#0c0e16] hover:bg-[#0f121c] focus:bg-[#0c0e16] border border-[#232a3d] focus:border-amber-500/80 text-zinc-100 text-xs pl-8 pr-16 py-1.5 rounded-lg outline-none transition-colors"
          />
          <span className="absolute right-2.5 text-[10px] text-zinc-500 font-mono pointer-events-none">
            ↵ ENTER
          </span>

          {/* Autocomplete Suggestions Menu */}
          {isFocused && suggestions.length > 0 && (
            <div
              ref={dropdownRef}
              className="absolute top-full left-0 right-0 mt-1.5 bg-[#0e111a] border border-[#263147] rounded-xl shadow-2xl py-1 z-50 animate-fade-in font-mono text-xs overflow-hidden"
            >
              <div className="px-3 py-1 text-[10px] text-zinc-500 font-bold uppercase tracking-wider border-b border-[#1c2333] flex items-center justify-between">
                <span>SUGGESTED FLAGS &amp; COMMANDS</span>
                <span>TAB TO COMPLETE</span>
              </div>
              <div className="max-h-60 overflow-y-auto divide-y divide-[#161c2b]">
                {suggestions.map((item, idx) => (
                  <div
                    key={item.token}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      applySuggestion(item);
                    }}
                    className={`px-3 py-2 cursor-pointer transition-colors flex items-center justify-between ${
                      idx === selectedIndex
                        ? 'bg-[#1b2233] text-white'
                        : 'hover:bg-[#151a27] text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[9px] px-1 rounded font-bold uppercase ${
                          item.category === 'FLAG'
                            ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                            : item.category === 'SESSION'
                            ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                            : 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                        }`}
                      >
                        {item.category}
                      </span>
                      <span className="font-semibold text-zinc-100">{item.token}</span>
                    </div>
                    <span className="text-[11px] text-zinc-500 truncate max-w-xs">{item.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
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

          {/* Autocomplete chips */}
          <button
            type="button"
            onClick={() => toggleFlag('chrome')}
            className={`px-1.5 py-0.5 rounded border text-[10px] transition-colors ${
              flags.chrome
                ? 'bg-cyan-500/15 border-cyan-500/60 text-cyan-300'
                : 'border-[#202636] bg-[#0c0e15] text-zinc-500 hover:text-zinc-300'
            }`}
          >
            --chrome
          </button>

          <button
            type="button"
            onClick={() => toggleFlag('verbose')}
            className={`px-1.5 py-0.5 rounded border text-[10px] transition-colors ${
              flags.verbose
                ? 'bg-purple-500/15 border-purple-500/60 text-purple-300'
                : 'border-[#202636] bg-[#0c0e15] text-zinc-500 hover:text-zinc-300'
            }`}
          >
            --verbose
          </button>

          <button
            type="button"
            onClick={() => toggleFlag('bare')}
            className={`px-1.5 py-0.5 rounded border text-[10px] transition-colors ${
              flags.bare
                ? 'bg-zinc-500/20 border-zinc-500/60 text-zinc-200'
                : 'border-[#202636] bg-[#0c0e15] text-zinc-500 hover:text-zinc-300'
            }`}
          >
            --bare
          </button>
        </div>

        {/* Quick App Launchers (Finder, VS Code) */}
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
          <span className="text-amber-500 font-bold select-none mr-1">$</span>
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
