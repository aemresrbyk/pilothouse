import React, { useState, useEffect } from 'react';
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
  DollarSign,
  Cpu,
  History,
  RotateCcw
} from 'lucide-react';
import { ProjectItem, TabSession, FileItem, ClaudeSession } from '../types';
import { playClickSound, playLaunchSound } from '../utils/audio';

interface TabWorkspaceProps {
  project: ProjectItem;
  tabSession: TabSession;
  fullCommand: string;
  onLaunch: (projectId: string, fullCommand: string) => void;
  onOpenFolder: (path: string) => void;
  onOpenEditor: (path: string, editor?: string) => void;
  onResumeSession?: (sessionId: string) => void;
  defaultTerminal: string;
}

export const TabWorkspace: React.FC<TabWorkspaceProps> = ({
  project,
  tabSession,
  fullCommand,
  onLaunch,
  onOpenFolder,
  onOpenEditor,
  onResumeSession,
  defaultTerminal
}) => {
  const [activePane, setActivePane] = useState<'console' | 'claude-md' | 'files' | 'sessions'>('console');
  const [claudeMdContent, setClaudeMdContent] = useState<string>('');
  const [isLoadingMd, setIsLoadingMd] = useState(false);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [sessions, setSessions] = useState<ClaudeSession[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [copiedMd, setCopiedMd] = useState(false);

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
      .then(setFiles)
      .catch(() => setFiles([]))
      .finally(() => setIsLoadingFiles(false));

    setIsLoadingSessions(true);
    window.electronAPI.getSessions(project.path)
      .then(setSessions)
      .catch(() => setSessions([]))
      .finally(() => setIsLoadingSessions(false));
  }, [project.id]);

  const copyClaudeMd = () => {
    playClickSound();
    navigator.clipboard.writeText(claudeMdContent);
    setCopiedMd(true);
    setTimeout(() => setCopiedMd(false), 1500);
  };

  const formatTokens = (tokens?: number) => {
    if (!tokens) return '0';
    if (tokens > 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
    if (tokens > 1000) return `${(tokens / 1000).toFixed(1)}k`;
    return `${tokens}`;
  };

  return (
    <div className="flex-1 flex flex-col bg-[#0b0d13] overflow-hidden select-none font-mono">
      {/* 1. Sub-Header: Project Telemetry & Pane Switcher */}
      <div className="px-4 py-2 bg-[#0e1017] border-b border-[#1c2233] flex items-center justify-between text-xs">
        {/* Left: Project Stats Pill */}
        <div className="flex items-center gap-2">
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

          <button
            onClick={() => {
              playClickSound();
              setActivePane('files');
            }}
            className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1.5 ${
              activePane === 'files'
                ? 'bg-[#232b3f] text-zinc-200 font-bold shadow-sm'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Layers className="w-3 h-3" />
            <span>Files ({files.length})</span>
          </button>
        </div>
      </div>

      {/* 2. Main Workspace Body */}
      <div className="flex-1 overflow-auto p-4 flex flex-col">
        {activePane === 'console' && (
          <div className="flex-1 flex flex-col justify-between max-w-4xl w-full mx-auto">
            {/* Terminal Screen Preview */}
            <div className="flex-1 bg-[#07090e] border border-[#1b2131] rounded-xl p-4 shadow-xl flex flex-col justify-between mb-4">
              <div>
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#161b29] text-[11px] text-zinc-500">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-zinc-300 font-bold uppercase tracking-wider">
                      TERMINAL DISPATCH
                    </span>
                  </div>
                  <span className="text-zinc-600">
                    TARGET: {defaultTerminal}
                  </span>
                </div>

                {/* Shell session details */}
                <div className="space-y-2 text-xs font-mono select-text">
                  <div className="text-zinc-500">// Directory ready for dispatch:</div>
                  <div className="text-zinc-300">
                    <span className="text-amber-500 select-none mr-2">$</span>
                    cd "{project.path}"
                  </div>

                  <div className="text-zinc-500 pt-2">// Active Claude Code execution command:</div>
                  <div className="text-emerald-400 bg-[#0c1018] p-3 rounded-lg border border-[#1d273a] whitespace-pre-wrap leading-relaxed select-text font-bold">
                    <span className="text-amber-500 select-none mr-2">&gt;</span>
                    {fullCommand}
                  </div>
                </div>
              </div>

              {/* Status footer inside screen */}
              <div className="pt-3 border-t border-[#161b29] flex items-center justify-between text-[11px] text-zinc-500">
                <span className="flex items-center gap-1.5">
                  <span className="text-emerald-400">●</span>
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
              <span>LAUNCH CLAUDE CODE IN TERMINAL</span>
              <span className="text-[10px] bg-black/30 border border-white/20 px-2 py-0.5 rounded ml-2">
                ↵ RETURN
              </span>
            </button>
          </div>
        )}

        {/* Sessions Pane: One-Click Resume past sessions */}
        {activePane === 'sessions' && (
          <div className="flex-1 flex flex-col max-w-4xl w-full mx-auto bg-[#07090e] border border-[#1b2131] rounded-xl overflow-hidden shadow-xl">
            <div className="px-4 py-2.5 border-b border-[#161b29] bg-[#0d1017] flex items-center justify-between text-xs">
              <span className="text-purple-400 font-bold flex items-center gap-1.5">
                <History className="w-4 h-4" />
                <span>Claude Code Session History ({sessions.length})</span>
              </span>
              <span className="text-[11px] text-zinc-500">
                Stored in ~/.claude/projects
              </span>
            </div>

            <div className="flex-1 overflow-auto p-4 text-xs">
              {isLoadingSessions ? (
                <div className="text-zinc-600 text-center py-10">Scanning sessions...</div>
              ) : sessions.length === 0 ? (
                <div className="text-zinc-600 text-center py-10">No previous sessions found for this project.</div>
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
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#182030] hover:bg-[#222e47] border border-[#263554] text-purple-300 font-bold text-xs transition-colors"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-purple-400" />
                        <span>RESUME</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

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

            <div className="flex-1 overflow-auto p-4 text-xs">
              {isLoadingMd ? (
                <div className="text-zinc-600 text-center py-10">Loading CLAUDE.md...</div>
              ) : (
                <pre className="text-zinc-300 whitespace-pre-wrap leading-relaxed select-text font-normal">
                  {claudeMdContent}
                </pre>
              )}
            </div>
          </div>
        )}

        {activePane === 'files' && (
          <div className="flex-1 flex flex-col max-w-4xl w-full mx-auto bg-[#07090e] border border-[#1b2131] rounded-xl overflow-hidden shadow-xl">
            <div className="px-4 py-2.5 border-b border-[#161b29] bg-[#0d1017] flex items-center justify-between text-xs">
              <span className="text-zinc-200 font-bold flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-amber-500" />
                <span>Repository Files ({files.length})</span>
              </span>
              <button
                onClick={() => onOpenFolder(project.path)}
                className="flex items-center gap-1 px-2 py-1 rounded bg-[#151924] hover:bg-[#1f2536] text-zinc-300 text-[11px] transition-colors"
              >
                <FolderOpen className="w-3 h-3" />
                <span>Open in Finder</span>
              </button>
            </div>

            <div className="flex-1 overflow-auto p-3 text-xs">
              {isLoadingFiles ? (
                <div className="text-zinc-600 text-center py-10">Loading file list...</div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {files.map((f) => (
                    <div
                      key={f.path}
                      className="px-2.5 py-1.5 rounded-lg bg-[#0e111a] border border-[#1a2130] flex items-center justify-between text-zinc-300 text-[11px] truncate"
                    >
                      <span className="truncate">{f.name}</span>
                      {f.size !== undefined && (
                        <span className="text-[9px] text-zinc-600 ml-1 flex-shrink-0">
                          {Math.round(f.size / 1024)}k
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
