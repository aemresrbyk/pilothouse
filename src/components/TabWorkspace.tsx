import React, { useState, useEffect, useMemo } from 'react';
import {
  Terminal,
  Play,
  FileText,
  Layers,
  FolderOpen,
  Code2,
  ExternalLink,
  GitBranch,
  Copy,
  Check,
  Sparkles,
  History,
  RotateCcw,
  Search,
  FileCode,
  FileJson,
  Folder,
  File as FileIcon,
  ChevronRight,
  Monitor
} from 'lucide-react';
import { ProjectItem, TabSession, FileItem, ClaudeSession, TerminalOption } from '../types';
import { playClickSound, playLaunchSound } from '../utils/audio';

interface TabWorkspaceProps {
  project: ProjectItem;
  tabSession: TabSession;
  fullCommand: string;
  onLaunch: (projectId: string, fullCommand: string) => void;
  onOpenFolder: (path: string) => void;
  onOpenEditor: (path: string, editor?: string) => void;
  onResumeSession?: (sessionId: string) => void;
  onSetCustomInput?: (val: string) => void;
  defaultTerminal: string;
  onChangeTerminal?: (terminalId: string) => void;
}

const QUICK_PROMPT_PRESETS = [
  { label: '/doctor', value: '/doctor', desc: 'Installation diagnostics' },
  { label: '/init', value: '/init', desc: 'Initialize CLAUDE.md' },
  { label: '--worktree', value: '--worktree', desc: 'Isolated git worktree' },
  { label: 'Explain architecture', value: '-p "Provide a concise architectural overview of this repository"', desc: 'High-level project tour' },
  { label: 'Find & fix bugs', value: '-p "Analyze the codebase for potential bugs, unhandled errors, and fix them"', desc: 'Bug hunting' },
  { label: 'Run test suite', value: '-p "Run the test suite, analyze failures, and fix broken tests"', desc: 'Automated test repair' },
  { label: 'Review git diff', value: '-p "Review uncommitted changes in git and summarize what changed"', desc: 'Diff breakdown' }
];

export const TabWorkspace: React.FC<TabWorkspaceProps> = ({
  project,
  tabSession,
  fullCommand,
  onLaunch,
  onOpenFolder,
  onOpenEditor,
  onResumeSession,
  onSetCustomInput,
  defaultTerminal,
  onChangeTerminal
}) => {
  const [activePane, setActivePane] = useState<'console' | 'claude-md' | 'files' | 'sessions'>('console');
  const [claudeMdContent, setClaudeMdContent] = useState<string>('');
  const [isLoadingMd, setIsLoadingMd] = useState(false);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [sessions, setSessions] = useState<ClaudeSession[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [copiedMd, setCopiedMd] = useState(false);
  const [copiedFile, setCopiedFile] = useState(false);
  const [availableTerminals, setAvailableTerminals] = useState<TerminalOption[]>([]);

  // File explorer state
  const [fileSearch, setFileSearch] = useState('');
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [selectedContent, setSelectedContent] = useState<string>('');
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);

  // Fetch terminals on mount
  useEffect(() => {
    window.electronAPI.getTerminals().then((terms) => {
      setAvailableTerminals(terms.filter((t) => t.installed));
    }).catch(() => {});
  }, []);

  // Load CLAUDE.md, Files, and Past Sessions
  useEffect(() => {
    if (project.hasClaudeMd) {
      setIsLoadingMd(true);
      window.electronAPI.readFile(`${project.path}/CLAUDE.md`)
        .then((res) => setClaudeMdContent(res.content))
        .catch(() => setClaudeMdContent('// No CLAUDE.md file found.'))
        .finally(() => setIsLoadingMd(false));
    } else {
      setClaudeMdContent('// No CLAUDE.md found. Run /init in Claude Code to generate one.');
    }

    setIsLoadingFiles(true);
    window.electronAPI.listFiles(project.path)
      .then((items) => {
        setFiles(items);
        // Auto-select initial file for preview
        const priorityFile = items.find((f) => !f.isDirectory && f.name.toLowerCase() === 'claude.md')
          || items.find((f) => !f.isDirectory && f.name.toLowerCase() === 'package.json')
          || items.find((f) => !f.isDirectory && f.name.toLowerCase() === 'readme.md')
          || items.find((f) => !f.isDirectory);
        if (priorityFile) {
          loadFile(priorityFile);
        }
      })
      .catch(() => setFiles([]))
      .finally(() => setIsLoadingFiles(false));

    setIsLoadingSessions(true);
    window.electronAPI.getSessions(project.path)
      .then(setSessions)
      .catch(() => setSessions([]))
      .finally(() => setIsLoadingSessions(false));
  }, [project.id]);

  const loadFile = async (item: FileItem) => {
    if (item.isDirectory) return;
    setSelectedFile(item);
    setIsLoadingContent(true);
    try {
      const res = await window.electronAPI.readFile(item.path);
      setSelectedContent(res.content);
      setIsTruncated(res.truncated);
    } catch (err: any) {
      setSelectedContent(`// Error reading file: ${err.message}`);
    } finally {
      setIsLoadingContent(false);
    }
  };

  const copyClaudeMd = () => {
    playClickSound();
    navigator.clipboard.writeText(claudeMdContent);
    setCopiedMd(true);
    setTimeout(() => setCopiedMd(false), 1500);
  };

  const copyFileContent = () => {
    playClickSound();
    navigator.clipboard.writeText(selectedContent);
    setCopiedFile(true);
    setTimeout(() => setCopiedFile(false), 1500);
  };

  const formatTokens = (tokens?: number) => {
    if (!tokens) return '0';
    if (tokens > 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
    if (tokens > 1000) return `${(tokens / 1000).toFixed(1)}k`;
    return `${tokens}`;
  };

  const filteredFiles = useMemo(() => {
    if (!fileSearch.trim()) return files;
    const q = fileSearch.toLowerCase().trim();
    return files.filter((f) => f.name.toLowerCase().includes(q));
  }, [files, fileSearch]);

  const getFileIcon = (file: FileItem) => {
    if (file.isDirectory) return <Folder className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />;
    if (file.name.toLowerCase() === 'claude.md') return <FileText className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />;
    if (file.extension === '.json') return <FileJson className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />;
    if (['.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.sh'].includes(file.extension || '')) {
      return <FileCode className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />;
    }
    return <FileIcon className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />;
  };

  return (
    <div className="flex-1 flex flex-col bg-[#0b0d13] overflow-hidden select-none font-mono">
      {/* 1. Sub-Header: Project Telemetry & Pane Switcher */}
      <div className="px-4 py-2 bg-[#0e1017] border-b border-[#1c2233] flex items-center justify-between text-xs flex-wrap gap-2">
        {/* Left: Project Stats Pill */}
        <div className="flex items-center gap-2 flex-wrap">
          {project.gitInfo?.isGit && (
            <div className="flex items-center gap-1.5 text-[11px] text-sky-400 bg-sky-950/30 border border-sky-800/40 px-2 py-0.5 rounded">
              <GitBranch className="w-3 h-3" />
              <span>{project.gitInfo.branch || 'git'}</span>
              {project.gitInfo.commitHash && (
                <span className="text-zinc-500 font-mono text-[10px]">
                  #{project.gitInfo.commitHash}
                </span>
              )}
              {project.gitInfo.hasUncommitted && (
                <span
                  title={`${project.gitInfo.uncommittedCount || 1} modified files`}
                  className="w-1.5 h-1.5 rounded-full bg-amber-400 ml-0.5"
                />
              )}
            </div>
          )}

          {project.metrics?.lastCost !== undefined && (
            <span className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/25 px-2 py-0.5 rounded font-bold">
              ${project.metrics.lastCost.toFixed(2)}
            </span>
          )}

          {project.metrics?.models?.[0] && (
            <span className="text-[10px] text-zinc-400 bg-[#161a26] border border-[#23293a] px-2 py-0.5 rounded">
              {project.metrics.models[0].replace('claude-', '')}
            </span>
          )}

          {project.metrics?.inputTokens && (
            <span className="text-[10px] text-zinc-500">
              {formatTokens(project.metrics.inputTokens)} in / {formatTokens(project.metrics.outputTokens)} out
            </span>
          )}
        </div>

        {/* Right: View Pane Tabs */}
        <div className="flex items-center gap-1 bg-[#141724] border border-[#23293a] rounded-lg p-0.5 text-[11px]">
          <button
            onClick={() => {
              playClickSound();
              setActivePane('console');
            }}
            className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1.5 ${
              activePane === 'console'
                ? 'bg-[#232b3f] text-white font-bold shadow-sm'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Terminal className="w-3 h-3 text-amber-500" />
            <span>Terminal</span>
          </button>

          <button
            onClick={() => {
              playClickSound();
              setActivePane('files');
            }}
            className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1.5 ${
              activePane === 'files'
                ? 'bg-[#232b3f] text-sky-300 font-bold shadow-sm'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Layers className="w-3 h-3 text-sky-400" />
            <span>Files ({files.length})</span>
          </button>

          <button
            onClick={() => {
              playClickSound();
              setActivePane('sessions');
            }}
            className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1.5 ${
              activePane === 'sessions'
                ? 'bg-[#232b3f] text-purple-300 font-bold shadow-sm'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <History className="w-3 h-3 text-purple-400" />
            <span>Sessions ({sessions.length})</span>
          </button>

          <button
            onClick={() => {
              playClickSound();
              setActivePane('claude-md');
            }}
            className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1.5 ${
              activePane === 'claude-md'
                ? 'bg-[#232b3f] text-[#e07a5f] font-bold shadow-sm'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <FileText className="w-3 h-3" />
            <span>CLAUDE.md</span>
          </button>
        </div>
      </div>

      {/* 2. Main Workspace Body */}
      <div className="flex-1 overflow-auto p-4 flex flex-col">
        {activePane === 'console' && (
          <div className="flex-1 flex flex-col justify-between max-w-4xl w-full mx-auto space-y-3">
            {/* Terminal Screen Preview */}
            <div className="flex-1 bg-[#07090e] border border-[#1b2131] rounded-xl p-4 shadow-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#161b29] text-[11px] text-zinc-500">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-zinc-300 font-bold uppercase tracking-wider">
                      TERMINAL DISPATCH MONITOR
                    </span>
                  </div>

                  {/* Terminal Target Switcher Pills */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-zinc-600 text-[10px]">EMULATOR:</span>
                    <div className="flex items-center gap-1 bg-[#0f131d] border border-[#202738] p-0.5 rounded-md">
                      {availableTerminals.slice(0, 4).map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            playClickSound();
                            onChangeTerminal?.(t.id);
                          }}
                          className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                            defaultTerminal === t.id
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                              : 'text-zinc-500 hover:text-zinc-300'
                          }`}
                        >
                          {t.name.replace('macOS ', '').replace(' (wt)', '')}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Shell session details */}
                <div className="space-y-2 text-xs font-mono select-text">
                  <div className="text-zinc-500">// Directory ready for dispatch:</div>
                  <div className="text-zinc-300 flex items-center justify-between">
                    <div>
                      <span className="text-amber-500 select-none mr-2">$</span>
                      cd "{project.path}"
                    </div>
                    <button
                      onClick={() => onOpenFolder(project.path)}
                      className="text-[10px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1 transition-colors"
                    >
                      <FolderOpen className="w-3 h-3" />
                      <span>Reveal</span>
                    </button>
                  </div>

                  <div className="text-zinc-500 pt-2">// Active Claude Code execution command:</div>
                  <div className="text-emerald-400 bg-[#0c1018] p-3 rounded-lg border border-[#1d273a] whitespace-pre-wrap leading-relaxed select-text font-bold">
                    <span className="text-amber-500 select-none mr-2">&gt;</span>
                    {fullCommand}
                  </div>
                </div>

                {/* Quick Preset Prompt Chips */}
                <div className="mt-4 pt-3 border-t border-[#161b29]">
                  <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-2 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    <span>Quick Command &amp; Prompt Starters:</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_PROMPT_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => {
                          playClickSound();
                          onSetCustomInput?.(preset.value);
                        }}
                        title={preset.desc}
                        className="px-2 py-1 rounded-md bg-[#0f121a] hover:bg-[#181d2a] border border-[#1e2536] hover:border-amber-500/50 text-[11px] text-zinc-400 hover:text-zinc-100 transition-all active:scale-95 flex items-center gap-1"
                      >
                        <span className="text-amber-500/70 font-bold">+</span>
                        <span>{preset.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Status footer inside screen */}
              <div className="pt-3 border-t border-[#161b29] flex items-center justify-between text-[11px] text-zinc-500">
                <span className="flex items-center gap-1.5">
                  <span className={tabSession.isLaunched ? 'text-emerald-400' : 'text-amber-400'}>●</span>
                  <span>
                    {tabSession.isLaunched ? 'Session active in OS terminal' : 'Ready for deployment'}
                  </span>
                </span>
                <span>Press [↵ ENTER] to dispatch</span>
              </div>
            </div>

            {/* Huge primary launch action */}
            <button
              onClick={() => {
                playLaunchSound();
                onLaunch(project.id, fullCommand);
              }}
              className="w-full py-4 px-6 rounded-xl font-bold text-sm tracking-wider uppercase text-white bg-gradient-to-r from-[#cc6b49] via-[#d97706] to-[#ea580c] hover:opacity-95 active:scale-[0.99] transition-all shadow-xl shadow-amber-950/30 flex items-center justify-center gap-3 border border-amber-500/40"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>LAUNCH CLAUDE CODE IN {defaultTerminal.toUpperCase()}</span>
              <span className="text-[10px] bg-black/30 border border-white/20 px-2 py-0.5 rounded ml-2">
                ↵ RETURN
              </span>
            </button>
          </div>
        )}

        {/* Files Pane: Interactive Explorer & In-App Code Viewer */}
        {activePane === 'files' && (
          <div className="flex-1 flex max-w-5xl w-full mx-auto bg-[#07090e] border border-[#1b2131] rounded-xl overflow-hidden shadow-xl">
            {/* Left Column: File Tree / List */}
            <div className="w-72 border-r border-[#161b29] bg-[#0a0d14] flex flex-col flex-shrink-0">
              {/* File Search Header */}
              <div className="p-2.5 border-b border-[#161b29] flex items-center gap-2">
                <Search className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
                <input
                  type="text"
                  placeholder="Filter repository files..."
                  value={fileSearch}
                  onChange={(e) => setFileSearch(e.target.value)}
                  className="w-full bg-transparent text-xs text-zinc-200 placeholder-zinc-600 outline-none"
                />
                {fileSearch && (
                  <button
                    onClick={() => setFileSearch('')}
                    className="text-zinc-500 hover:text-zinc-300 text-[10px]"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Files Count & Actions */}
              <div className="px-3 py-1.5 bg-[#0e111a] border-b border-[#161b29] flex items-center justify-between text-[10px] text-zinc-500">
                <span>{filteredFiles.length} ITEMS</span>
                <button
                  onClick={() => onOpenFolder(project.path)}
                  className="hover:text-zinc-300 transition-colors flex items-center gap-1"
                >
                  <FolderOpen className="w-3 h-3" />
                  <span>Reveal in Finder</span>
                </button>
              </div>

              {/* File List */}
              <div className="flex-1 overflow-y-auto p-1 divide-y divide-[#121622]">
                {isLoadingFiles ? (
                  <div className="text-zinc-600 text-center py-10 text-xs">Loading repository files...</div>
                ) : filteredFiles.length === 0 ? (
                  <div className="text-zinc-600 text-center py-10 text-xs">No matching files found.</div>
                ) : (
                  filteredFiles.map((f) => {
                    const isSelected = selectedFile?.path === f.path;
                    return (
                      <div
                        key={f.path}
                        onClick={() => {
                          playClickSound();
                          loadFile(f);
                        }}
                        className={`px-2.5 py-1.5 rounded-md cursor-pointer transition-colors flex items-center justify-between text-xs ${
                          isSelected
                            ? 'bg-[#182030] text-white font-medium border border-sky-500/30'
                            : 'hover:bg-[#101420] text-zinc-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {getFileIcon(f)}
                          <span className="truncate">{f.name}</span>
                        </div>
                        {f.size !== undefined && (
                          <span className="text-[9px] text-zinc-600 ml-1 flex-shrink-0">
                            {f.size > 1024 ? `${Math.round(f.size / 1024)}k` : `${f.size}b`}
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Column: In-App Code Viewer */}
            <div className="flex-1 flex flex-col bg-[#07090e] overflow-hidden">
              {selectedFile ? (
                <>
                  {/* Viewer Header */}
                  <div className="px-4 py-2 border-b border-[#161b29] bg-[#0d1017] flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      {getFileIcon(selectedFile)}
                      <span className="font-bold text-zinc-100 truncate">{selectedFile.name}</span>
                      {selectedFile.size !== undefined && (
                        <span className="text-[10px] text-zinc-500 bg-[#141824] px-1.5 py-0.5 rounded">
                          {selectedFile.size > 1024 ? `${(selectedFile.size / 1024).toFixed(1)} KB` : `${selectedFile.size} B`}
                        </span>
                      )}
                      {isTruncated && (
                        <span className="text-[9px] text-amber-400 bg-amber-500/15 border border-amber-500/30 px-1 rounded">
                          PREVIEW TRUNCATED
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={copyFileContent}
                        className="flex items-center gap-1 px-2 py-1 rounded bg-[#151924] hover:bg-[#1f2536] text-zinc-300 text-[11px] transition-colors"
                        title="Copy file contents"
                      >
                        {copiedFile ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedFile ? 'Copied' : 'Copy'}</span>
                      </button>

                      <button
                        onClick={() => onOpenEditor(project.path)}
                        className="flex items-center gap-1 px-2 py-1 rounded bg-[#151924] hover:bg-[#1f2536] text-zinc-300 text-[11px] transition-colors"
                        title="Open project in code editor"
                      >
                        <Code2 className="w-3 h-3" />
                        <span>Open in VS Code</span>
                      </button>
                    </div>
                  </div>

                  {/* Viewer Code Container */}
                  <div className="flex-1 overflow-auto p-4 text-xs select-text">
                    {isLoadingContent ? (
                      <div className="text-zinc-600 text-center py-12">Loading file contents...</div>
                    ) : (
                      <pre className="text-zinc-300 font-mono whitespace-pre-wrap leading-relaxed">
                        {selectedContent}
                      </pre>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-zinc-600">
                  <FileIcon className="w-10 h-10 mb-2 opacity-50" />
                  <p className="text-xs">Select any file from the left to inspect its contents</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Sessions Pane: One-Click Resume past sessions */}
        {activePane === 'sessions' && (
          <div className="flex-1 flex flex-col max-w-4xl w-full mx-auto bg-[#07090e] border border-[#1b2131] rounded-xl overflow-hidden shadow-xl">
            <div className="px-4 py-2.5 border-b border-[#161b29] bg-[#0d1017] flex items-center justify-between text-xs">
              <span className="text-purple-400 font-bold flex items-center gap-1.5">
                <History className="w-4 h-4" />
                <span>Claude Code Session Telemetry ({sessions.length})</span>
              </span>
              <span className="text-[11px] text-zinc-500">
                Found in ~/.claude/projects
              </span>
            </div>

            <div className="flex-1 overflow-auto p-4 text-xs">
              {isLoadingSessions ? (
                <div className="text-zinc-600 text-center py-10">Scanning sessions...</div>
              ) : sessions.length === 0 ? (
                <div className="text-zinc-600 text-center py-10">
                  No previous sessions found for this project. Launch Claude Code to record conversations!
                </div>
              ) : (
                <div className="space-y-2">
                  {sessions.map((s) => (
                    <div
                      key={s.id}
                      className="p-3 rounded-lg bg-[#0e111a] border border-[#1a2130] flex items-center justify-between transition-colors hover:border-[#2f3952]"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-zinc-100">{s.id.slice(0, 8)}...{s.id.slice(-6)}</span>
                          <span className="text-[10px] text-zinc-500 bg-[#161b27] px-1.5 py-0.5 rounded">
                            {s.formattedSize}
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-500 mt-1">
                          Last active: {s.dateStr}
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          playClickSound();
                          if (onResumeSession) {
                            onResumeSession(s.id);
                          }
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#182030] hover:bg-[#222e47] border border-[#263554] text-purple-300 font-bold text-xs transition-colors active:scale-95"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-purple-400" />
                        <span>APPLY --resume</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* CLAUDE.md Pane */}
        {activePane === 'claude-md' && (
          <div className="flex-1 flex flex-col max-w-4xl w-full mx-auto bg-[#07090e] border border-[#1b2131] rounded-xl overflow-hidden shadow-xl">
            <div className="px-4 py-2.5 border-b border-[#161b29] bg-[#0d1017] flex items-center justify-between text-xs">
              <span className="text-[#e07a5f] font-bold flex items-center gap-1.5">
                <FileText className="w-4 h-4" />
                <span>CLAUDE.md // Project Instructions</span>
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={copyClaudeMd}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-[#151924] hover:bg-[#1f2536] text-zinc-300 text-[11px] transition-colors"
                >
                  {copiedMd ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedMd ? 'Copied' : 'Copy'}</span>
                </button>
                <button
                  onClick={() => onOpenEditor(project.path)}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-[#151924] hover:bg-[#1f2536] text-zinc-300 text-[11px] transition-colors"
                >
                  <Code2 className="w-3 h-3" />
                  <span>Edit in VS Code</span>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 text-xs select-text">
              {isLoadingMd ? (
                <div className="text-zinc-600 text-center py-10">Loading CLAUDE.md...</div>
              ) : (
                <pre className="text-zinc-300 whitespace-pre-wrap leading-relaxed font-normal">
                  {claudeMdContent}
                </pre>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
