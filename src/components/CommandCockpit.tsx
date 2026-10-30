import React, { useState, useEffect } from 'react';
import {
  Terminal,
  FolderOpen,
  Code2,
  FileText,
  Copy,
  Check,
  GitBranch,
  Trash2,
  Play,
  Sparkles,
  DollarSign,
  Cpu,
  Layers,
  ShieldAlert,
  RotateCcw,
  Globe,
  Sliders,
  ExternalLink
} from 'lucide-react';
import { ProjectItem, ProjectFlags, FileItem } from '../types';
import { playClickSound, playToggleSound, playLaunchSound } from '../utils/audio';

interface CommandCockpitProps {
  project: ProjectItem | null;
  onUpdateFlags: (id: string, flags: ProjectFlags) => void;
  onUpdateCustomFlags: (id: string, customFlags: string) => void;
  onLaunch: (id: string) => void;
  onOpenFolder: (path: string) => void;
  onOpenEditor: (path: string, editor?: string) => void;
  onRemove: (id: string) => void;
  defaultTerminal: string;
}

export const CommandCockpit: React.FC<CommandCockpitProps> = ({
  project,
  onUpdateFlags,
  onUpdateCustomFlags,
  onLaunch,
  onOpenFolder,
  onOpenEditor,
  onRemove,
  defaultTerminal
}) => {
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);
  const [activeTab, setActiveTab] = useState<'claude-md' | 'files'>('claude-md');
  const [claudeMdContent, setClaudeMdContent] = useState<string>('');
  const [isLoadingMd, setIsLoadingMd] = useState(false);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);

  const flags = project?.flags || {
    dangerouslySkipPermissions: true,
    continueLast: false,
    chrome: false,
    verbose: false,
    bare: false
  };

  // Compile full command string
  const commandParts = ['claude'];
  if (flags.dangerouslySkipPermissions) commandParts.push('--dangerously-skip-permissions');
  if (flags.continueLast) commandParts.push('--continue');
  if (flags.chrome) commandParts.push('--chrome');
  if (flags.verbose) commandParts.push('--verbose');
  if (flags.bare) commandParts.push('--bare');
  if (project?.customFlags && project.customFlags.trim()) {
    commandParts.push(project.customFlags.trim());
  }
  const fullCommand = commandParts.join(' ');

  // Load CLAUDE.md and Files when project changes
  useEffect(() => {
    if (!project) return;

    if (project.hasClaudeMd) {
      setIsLoadingMd(true);
      window.electronAPI.readFile(`${project.path}/CLAUDE.md`)
        .then((res) => setClaudeMdContent(res.content))
        .catch(() => setClaudeMdContent('// No CLAUDE.md found in project root.'))
        .finally(() => setIsLoadingMd(false));
    } else {
      setClaudeMdContent('// No CLAUDE.md found. Claude Code can create one with /init.');
    }

    setIsLoadingFiles(true);
    window.electronAPI.listFiles(project.path)
      .then(setFiles)
      .catch(() => setFiles([]))
      .finally(() => setIsLoadingFiles(false));
  }, [project?.id]);

  const toggleFlag = (key: keyof ProjectFlags) => {
    if (!project) return;
    const nextVal = !flags[key];
    playToggleSound(nextVal);
    onUpdateFlags(project.id, {
      ...flags,
      [key]: nextVal
    });
  };

  const copyPath = () => {
    if (!project) return;
    playClickSound();
    navigator.clipboard.writeText(project.path);
    setCopiedPath(true);
    setTimeout(() => setCopiedPath(false), 1500);
  };

  const copyCommand = () => {
    playClickSound();
    navigator.clipboard.writeText(fullCommand);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 1500);
  };

  const handleLaunchClick = async () => {
    if (!project) return;
    playLaunchSound();
    setIsLaunching(true);
    try {
      await onLaunch(project.id);
    } finally {
      setTimeout(() => setIsLaunching(false), 1200);
    }
  };

  if (!project) {
    return (
      <div className="flex-1 h-full flex flex-col items-center justify-center p-8 bg-[#0a0c10] carbon-grid select-none">
        <div className="w-14 h-14 rounded-xl bg-[#141824] border border-[#232b3d] flex items-center justify-center text-amber-500 mb-4 shadow-lg">
          <Terminal className="w-7 h-7" />
        </div>
        <h2 className="text-sm font-mono font-semibold text-zinc-300 tracking-wide uppercase">
          NO REPOSITORY SELECTED
        </h2>
        <p className="text-xs font-mono text-zinc-500 mt-1 max-w-xs text-center">
          Choose a repository from the index on the left or press [↑ / ↓] to navigate.
        </p>
      </div>
    );
  }

  const formatTokens = (tokens?: number) => {
    if (!tokens) return '0';
    if (tokens > 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
    if (tokens > 1000) return `${(tokens / 1000).toFixed(1)}k`;
    return `${tokens}`;
  };

  return (
    <div className="flex-1 h-full flex flex-col bg-[#090b0f] overflow-y-auto select-none font-mono">
      {/* 1. DECK TOP HEADER & TELEMETRY */}
      <div className="p-4 border-b border-[#181d29] bg-[#0c0e14]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-base font-bold text-white tracking-tight">
                {project.name}
              </h1>
              {project.gitInfo?.isGit && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#131a28] border border-[#212c42] text-[10px] text-sky-400 font-semibold">
                  <GitBranch className="w-3 h-3" />
                  <span>{project.gitInfo.branch || 'git'}</span>
                </span>
              )}
              {project.hasClaudeMd ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#e07a5f]/15 border border-[#e07a5f]/30 text-[10px] text-[#e07a5f] font-semibold">
                  <FileText className="w-3 h-3" />
                  <span>CLAUDE.md</span>
                </span>
              ) : (
                <span className="text-[10px] text-zinc-600 border border-[#1b202c] px-1.5 py-0.5 rounded">
                  NO CLAUDE.MD
                </span>
              )}
            </div>

            {/* Path row with click to copy */}
            <div
              onClick={copyPath}
              className="group/p inline-flex items-center gap-1.5 mt-1.5 text-[11px] text-zinc-400 hover:text-zinc-200 cursor-pointer transition-colors"
              title="Click to copy full path"
            >
              <span className="text-zinc-600">//</span>
              <span className="underline decoration-zinc-700 underline-offset-2">
                {project.path}
              </span>
              {copiedPath ? (
                <Check className="w-3 h-3 text-emerald-400 ml-1" />
              ) : (
                <Copy className="w-3 h-3 text-zinc-600 group-hover/p:text-zinc-400 ml-1" />
              )}
            </div>
          </div>

          {/* Quick Actions in Header */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                playClickSound();
                onOpenFolder(project.path);
              }}
              title="Open folder in Finder (⌘O)"
              className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded bg-[#121620] hover:bg-[#1a2030] border border-[#202737] hover:border-[#323d57] text-zinc-300 transition-colors"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>Finder</span>
            </button>
            <button
              onClick={() => {
                playClickSound();
                onOpenEditor(project.path, 'VSCode');
              }}
              title="Open in VS Code (⌘E)"
              className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded bg-[#121620] hover:bg-[#1a2030] border border-[#202737] hover:border-[#323d57] text-zinc-300 transition-colors"
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>Code</span>
            </button>
            <button
              onClick={() => {
                playClickSound();
                onOpenEditor(project.path, 'Cursor');
              }}
              title="Open in Cursor IDE (⌘C)"
              className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded bg-[#121620] hover:bg-[#1a2030] border border-[#202737] hover:border-[#323d57] text-zinc-300 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Cursor</span>
            </button>
            <button
              onClick={() => {
                playClickSound();
                onRemove(project.id);
              }}
              title="Remove from launcher"
              className="p-1 rounded bg-[#121620] hover:bg-red-950/40 border border-[#202737] hover:border-red-800/50 text-zinc-500 hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Telemetry Strip (Real Claude Code stats from ~/.claude.json!) */}
        <div className="grid grid-cols-4 gap-2 mt-3 pt-2.5 border-t border-[#161a25] text-[10px]">
          <div className="p-2 rounded bg-[#0f121a] border border-[#1c2230]">
            <span className="text-zinc-500 block text-[9px] uppercase tracking-wider">
              LAST COST
            </span>
            <span className="text-amber-400 font-bold text-xs mt-0.5 block">
              {project.metrics?.lastCost !== undefined ? `$${project.metrics.lastCost.toFixed(2)}` : '$0.00'}
            </span>
          </div>

          <div className="p-2 rounded bg-[#0f121a] border border-[#1c2230]">
            <span className="text-zinc-500 block text-[9px] uppercase tracking-wider">
              MODEL
            </span>
            <span className="text-zinc-200 font-medium text-xs mt-0.5 block truncate">
              {project.metrics?.models?.[0]?.replace('claude-', '') || 'default'}
            </span>
          </div>

          <div className="p-2 rounded bg-[#0f121a] border border-[#1c2230]">
            <span className="text-zinc-500 block text-[9px] uppercase tracking-wider">
              TOKENS
            </span>
            <span className="text-zinc-200 font-medium text-xs mt-0.5 block">
              {formatTokens(project.metrics?.inputTokens)} in / {formatTokens(project.metrics?.outputTokens)} out
            </span>
          </div>

          <div className="p-2 rounded bg-[#0f121a] border border-[#1c2230]">
            <span className="text-zinc-500 block text-[9px] uppercase tracking-wider">
              LAST SESSION
            </span>
            <span className="text-zinc-300 font-medium text-xs mt-0.5 block truncate">
              {project.lastLaunched ? new Date(project.lastLaunched).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Never'}
            </span>
          </div>
        </div>
      </div>

      {/* 2. THE HARDWARE FLAG CONSOLE (TACTILE SWITCH MATRIX) */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-zinc-400 tracking-wider">
            // EXECUTION FLAGS CONSOLE
          </span>
          <span className="text-[10px] text-zinc-500">CLICK TO FLIP TOGGLE</span>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {/* PRIMARY SWITCH: --dangerously-skip-permissions */}
          <div
            onClick={() => toggleFlag('dangerouslySkipPermissions')}
            className={`cursor-pointer p-3 rounded-lg border transition-all flex items-center justify-between group ${
              flags.dangerouslySkipPermissions
                ? 'bg-[#181512] border-amber-600/60 shadow-lg shadow-amber-950/20'
                : 'bg-[#0f1118] border-[#1d2331] hover:border-[#2f384d]'
            }`}
          >
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full transition-all ${
                    flags.dangerouslySkipPermissions
                      ? 'bg-amber-400 led-amber animate-pulse'
                      : 'bg-zinc-700'
                  }`}
                />
                <span
                  className={`text-xs font-bold tracking-tight ${
                    flags.dangerouslySkipPermissions ? 'text-amber-400' : 'text-zinc-400'
                  }`}
                >
                  --dangerously-skip-permissions
                </span>
              </div>
              <p className="text-[10px] text-zinc-500 mt-1 pl-4">
                Bypass permission confirmation dialogs
              </p>
            </div>

            {/* Hardware rocker switch visual */}
            <div
              className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase border ${
                flags.dangerouslySkipPermissions
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-zinc-900 text-zinc-600 border-zinc-800'
              }`}
            >
              {flags.dangerouslySkipPermissions ? 'ARMED' : 'SAFE'}
            </div>
          </div>

          {/* SECONDARY SWITCH: --continue (-c) */}
          <div
            onClick={() => toggleFlag('continueLast')}
            className={`cursor-pointer p-3 rounded-lg border transition-all flex items-center justify-between group ${
              flags.continueLast
                ? 'bg-[#0f1814] border-emerald-600/60 shadow-lg shadow-emerald-950/20'
                : 'bg-[#0f1118] border-[#1d2331] hover:border-[#2f384d]'
            }`}
          >
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full transition-all ${
                    flags.continueLast
                      ? 'bg-emerald-400 led-emerald'
                      : 'bg-zinc-700'
                  }`}
                />
                <span
                  className={`text-xs font-bold tracking-tight ${
                    flags.continueLast ? 'text-emerald-400' : 'text-zinc-400'
                  }`}
                >
                  --continue <span className="text-[10px] text-zinc-500">(-c)</span>
                </span>
              </div>
              <p className="text-[10px] text-zinc-500 mt-1 pl-4">
                Resume the latest conversation in this repo
              </p>
            </div>

            <div
              className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase border ${
                flags.continueLast
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-zinc-900 text-zinc-600 border-zinc-800'
              }`}
            >
              {flags.continueLast ? 'ACTIVE' : 'NEW'}
            </div>
          </div>

          {/* CHROME SWITCH */}
          <div
            onClick={() => toggleFlag('chrome')}
            className={`cursor-pointer p-2.5 rounded-lg border transition-all flex items-center justify-between group ${
              flags.chrome
                ? 'bg-[#0f171b] border-cyan-600/60'
                : 'bg-[#0f1118] border-[#1d2331] hover:border-[#2f384d]'
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  flags.chrome ? 'bg-cyan-400 led-cyan' : 'bg-zinc-700'
                }`}
              />
              <span
                className={`text-xs font-medium ${
                  flags.chrome ? 'text-cyan-300' : 'text-zinc-400'
                }`}
              >
                --chrome
              </span>
              <span className="text-[10px] text-zinc-500">(browser integration)</span>
            </div>
            <div
              className={`px-1.5 py-0.2 rounded text-[8px] font-bold uppercase border ${
                flags.chrome
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                  : 'bg-zinc-900 text-zinc-600 border-zinc-800'
              }`}
            >
              {flags.chrome ? 'ON' : 'OFF'}
            </div>
          </div>

          {/* VERBOSE SWITCH */}
          <div
            onClick={() => toggleFlag('verbose')}
            className={`cursor-pointer p-2.5 rounded-lg border transition-all flex items-center justify-between group ${
              flags.verbose
                ? 'bg-[#150f1c] border-purple-600/60'
                : 'bg-[#0f1118] border-[#1d2331] hover:border-[#2f384d]'
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  flags.verbose ? 'bg-purple-400 led-purple' : 'bg-zinc-700'
                }`}
              />
              <span
                className={`text-xs font-medium ${
                  flags.verbose ? 'text-purple-300' : 'text-zinc-400'
                }`}
              >
                --verbose
              </span>
              <span className="text-[10px] text-zinc-500">(debug logs)</span>
            </div>
            <div
              className={`px-1.5 py-0.2 rounded text-[8px] font-bold uppercase border ${
                flags.verbose
                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                  : 'bg-zinc-900 text-zinc-600 border-zinc-800'
              }`}
            >
              {flags.verbose ? 'ON' : 'OFF'}
            </div>
          </div>
        </div>

        {/* Custom Arguments input */}
        <div className="mt-2.5 flex items-center gap-2 bg-[#0c0e14] border border-[#1c2230] rounded-md px-3 py-1.5">
          <span className="text-zinc-500 text-xs font-bold">PROMPT / ARGS &gt;</span>
          <input
            type="text"
            placeholder='e.g. "fix the tests" or --worktree new-feature'
            value={project.customFlags || ''}
            onChange={(e) => onUpdateCustomFlags(project.id, e.target.value)}
            className="flex-1 bg-transparent text-xs text-zinc-200 placeholder-zinc-700 outline-none"
          />
        </div>
      </div>

      {/* 3. TERMINAL CRT DISPLAY & SATISFYING LAUNCH BUTTON */}
      <div className="px-4 pb-4">
        <div className="terminal-screen border border-[#222a3d] rounded-xl p-3 shadow-xl mb-3 overflow-hidden relative">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#1b2233] text-[10px] text-zinc-500">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>TERMINAL EXECUTION MONITOR</span>
            </span>
            <button
              onClick={copyCommand}
              className="flex items-center gap-1 text-zinc-400 hover:text-zinc-200"
              title="Copy to clipboard"
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

          <div className="text-xs text-zinc-200 leading-relaxed font-mono select-text overflow-x-auto whitespace-pre">
            <span className="text-amber-500 select-none mr-2">$</span>
            <span className="text-zinc-400">cd </span>
            <span className="text-emerald-400">"{project.path}"</span>
            <span className="text-zinc-400"> && </span>
            <span className="text-white font-bold">{fullCommand}</span>
          </div>
        </div>

        {/* Big tactile launch button */}
        <button
          onClick={handleLaunchClick}
          disabled={isLaunching}
          className="w-full py-3.5 px-4 rounded-xl font-bold text-sm tracking-wider uppercase text-white bg-gradient-to-r from-[#cc6b49] via-[#d97706] to-[#ea580c] hover:opacity-95 active:scale-[0.99] transition-all shadow-xl shadow-[#cc6b49]/25 flex items-center justify-center gap-3 border border-amber-500/30 disabled:opacity-50"
        >
          <Play className={`w-4 h-4 fill-white ${isLaunching ? 'animate-spin' : ''}`} />
          <span>{isLaunching ? 'DEPLOYING TERMINAL...' : 'LAUNCH CLAUDE CODE'}</span>
          <span className="text-[10px] bg-black/30 border border-white/20 px-2 py-0.5 rounded ml-2 font-mono">
            ↵ RETURN
          </span>
        </button>
      </div>

      {/* 4. REPO CONTEXT TABS (CLAUDE.MD & REPO FILES) */}
      <div className="flex-1 px-4 pb-6 flex flex-col min-h-[220px]">
        {/* Tabs switcher */}
        <div className="flex items-center gap-2 border-b border-[#1b2233] pb-1 text-xs">
          <button
            onClick={() => setActiveTab('claude-md')}
            className={`px-3 py-1 rounded transition-colors flex items-center gap-1.5 ${
              activeTab === 'claude-md'
                ? 'bg-[#181d2a] text-[#e07a5f] font-semibold border border-[#263045]'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>CLAUDE.md Rules</span>
          </button>
          <button
            onClick={() => setActiveTab('files')}
            className={`px-3 py-1 rounded transition-colors flex items-center gap-1.5 ${
              activeTab === 'files'
                ? 'bg-[#181d2a] text-zinc-100 font-semibold border border-[#263045]'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Project Files ({files.length})</span>
          </button>
        </div>

        {/* Tab Content Box */}
        <div className="flex-1 mt-2 bg-[#0c0e14] border border-[#1b2233] rounded-lg p-3 overflow-y-auto max-h-60 text-xs">
          {activeTab === 'claude-md' ? (
            isLoadingMd ? (
              <div className="text-zinc-600 text-center py-6">Loading CLAUDE.md...</div>
            ) : (
              <pre className="text-zinc-300 whitespace-pre-wrap leading-relaxed select-text font-normal">
                {claudeMdContent}
              </pre>
            )
          ) : isLoadingFiles ? (
            <div className="text-zinc-600 text-center py-6">Loading files...</div>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              {files.map((f) => (
                <div
                  key={f.path}
                  className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#10131c] border border-[#1a202d] text-zinc-400 text-[11px] truncate"
                >
                  <span className="text-zinc-600">//</span>
                  <span className="truncate">{f.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

