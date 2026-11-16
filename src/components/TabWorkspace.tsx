import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Terminal as TerminalIcon,
  Play,
  Square,
  FileText,
  Layers,
  FolderOpen,
  Code2,
  Copy,
  Check,
  GitBranch,
  Search,
  Trash2,
  Sparkles,
  Save,
  FileEdit,
  Send,
  X,
  Stethoscope,
  Minimize2,
  Coins,
  History,
  Brain,
  Rocket,
  Plus,
  SlidersHorizontal,
  GitFork,
  ArrowRightLeft,
  MoreHorizontal
} from 'lucide-react';
import { ProjectItem, TabSession, ProjectFlags, RunCommand, MemoryFile, isDangerFlag, DEFAULT_QUICK_COMMANDS, AGENTS, AgentProfile, buildAgentCommand, promptArgs, PendingLaunch, ModelChoice } from '../types';
import type { AgentOptions } from '../../electron/agentOptions';
import { ThemeConfig } from '../theme';
import { EmbeddedTerminal } from './EmbeddedTerminal';
import { FilesView } from './FilesView';
import { HistoryView } from './HistoryView';
import { InstructionsView } from './InstructionsView';
import { isAppShortcut, isMac } from '../utils/platform';
import { playClickSound, playToggleSound, playLaunchSound } from '../utils/audio';

interface TabWorkspaceProps {
  project: ProjectItem;
  tabSession: TabSession;
  onUpdateFlags: (projectId: string, flags: ProjectFlags) => void;
  onOpenFolder: (path: string) => void;
  onOpenEditor: (path: string, editor?: string) => void;
  themeConfig: ThemeConfig;
  isActive: boolean;
  agent: AgentProfile;
  agentBinary: string;
  flagPresets: string[];
  quickCommands?: string[];
  onSwitchAgent: (projectId: string, agentId: string) => void;
  onRunCommand: (command: string) => void;
  // prompt: start the new worktree's agent on this task.
  onOpenWorktree: (prompt?: string) => void;
  onHandoff: (agentId: string) => void;
  onHandoffSession: (agentId: string, sessionFile: string, fromAgent: string) => void;
  onResumeAs: (agentId: string, sessionId: string) => void;
  pendingLaunch?: PendingLaunch; // set by a hand-off or a resume in another agent: restart once with it
  onLaunchUsed: () => void;
  modelChoice?: ModelChoice; // model + effort this project runs the agent with
  onSetModel: (choice: ModelChoice) => void;
  onSaveCustomCommands: (commands: RunCommand[]) => void;
}

export const TabWorkspace: React.FC<TabWorkspaceProps> = ({
  project,
  tabSession,
  onUpdateFlags,
  onOpenFolder,
  onOpenEditor,
  themeConfig,
  isActive,
  agent,
  agentBinary,
  flagPresets,
  quickCommands,
  onSwitchAgent,
  onRunCommand,
  onOpenWorktree,
  onHandoff,
  onHandoffSession,
  onResumeAs,
  pendingLaunch,
  onLaunchUsed,
  modelChoice,
  onSetModel,
  onSaveCustomCommands
}) => {
  const [viewMode, setViewMode] = useState<'terminal' | 'claude-md' | 'files' | 'history' | 'run' | 'memory'>('terminal');
  // Files tab mounts on first visit and then stays (hidden), keeping its folder and preview.
  const [filesSeen, setFilesSeen] = useState(false);
  useEffect(() => { if (viewMode === 'files') setFilesSeen(true); }, [viewMode]);
  // Run view: commands the repo declares (package.json, Makefile, README …) plus the user's own.
  const [runCommands, setRunCommands] = useState<RunCommand[] | null>(null);
  const [newCmd, setNewCmd] = useState('');
  // Memory view: CLAUDE.md files + Claude Code's auto-memory folder for this project.
  const [memoryFiles, setMemoryFiles] = useState<MemoryFile[] | null>(null);
  const [memoryPath, setMemoryPath] = useState<string>('');
  const [memoryText, setMemoryText] = useState('');
  const [memorySaved, setMemorySaved] = useState<string>('');
  // Command the next terminal (re)mount runs; null = the normal fullCommand.
  const [launchCommand, setLaunchCommand] = useState<string | null>(null);
  const [customInput, setCustomInput] = useState<string>(tabSession.customInput || '');
  const [termSessionKey, setTermSessionKey] = useState<number>(1);
  const [copiedPath, setCopiedPath] = useState(false);
  const [isFlagsOpen, setIsFlagsOpen] = useState(false);
  const histSearchRef = useRef<HTMLInputElement>(null);

  // Git Status state
  const [gitStatus, setGitStatus] = useState<{ isGit: boolean; branch: string; modifiedCount: number; statusText: string } | null>(null);

  // Scratchpad state
  const [isScratchpadOpen, setIsScratchpadOpen] = useState(false);
  const [scratchpadText, setScratchpadText] = useState(() => {
    return localStorage.getItem(`scratchpad-${project.id}`) || '';
  });


  // Files state

  const flags: ProjectFlags = project.flags || [];
  // Presets first, then any active flag that was since removed from the presets (so it can still be switched off).
  const flagPills = [...flagPresets, ...flags.filter((f) => !flagPresets.includes(f))];

  // Save scratchpad
  useEffect(() => {
    localStorage.setItem(`scratchpad-${project.id}`, scratchpadText);
  }, [project.id, scratchpadText]);

  // Load Git Status
  const loadGitStatus = useCallback(() => {
    window.electronAPI.getGitStatus?.(project.path)
      .then((res) => {
        if (res) setGitStatus(res);
      })
      .catch(() => {});
  }, [project.path]);

  useEffect(() => {
    loadGitStatus();
  }, [loadGitStatus, viewMode]);

  // With resumeId it reopens that session instead of --continue / the input bar.
  const buildCommand = (resumeId?: string) => buildAgentCommand(agent, agentBinary, flags, customInput, resumeId, modelChoice);
  const fullCommand = useMemo(() => buildCommand(), [flags, customInput, agentBinary, agent, modelChoice]);

  // Models and effort levels this agent offers with the user's own account (read from the agent on this computer).
  const [agentOpts, setAgentOpts] = useState<AgentOptions | null>(null);
  useEffect(() => {
    let live = true;
    setAgentOpts(null);
    window.electronAPI.agentOptions(agent.id).then((o) => live && setAgentOpts(o)).catch(() => {});
    return () => { live = false; };
  }, [agent.id, agentBinary]);
  const pickedModel = agentOpts?.models.find((m) => m.id === modelChoice?.model);
  const effortList = pickedModel?.efforts?.length ? pickedModel.efforts : agentOpts?.efforts || [];
  const isClaude = agent.id === 'claude';
  const mdFile = agent.instructionsFile;

  // Switching agent restarts the terminal with the new agent's command.
  const handleSwitchAgent = (agentId: string) => {
    playLaunchSound();
    onSwitchAgent(project.id, agentId);
    if (viewMode === 'memory' || viewMode === 'history') setViewMode('terminal');
    setLaunchCommand(null);
    setTermSessionKey((k) => k + 1);
  };

  // A hand-off or resume switched the agent (via props): start the new one once with its prompt or session.
  useEffect(() => {
    if (!pendingLaunch) return;
    setViewMode('terminal');
    const first = pendingLaunch.prompt ? promptArgs(agent, pendingLaunch.prompt) : undefined;
    setLaunchCommand(buildAgentCommand(agent, agentBinary, flags, first, pendingLaunch.resumeId, modelChoice));
    setTermSessionKey((k) => k + 1);
    onLaunchUsed();
  }, [pendingLaunch]);
  const [isHandoffOpen, setIsHandoffOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  // Toolbar scrolls sideways, so its menus are fixed-positioned under their button instead of clipped.
  const [menuAt, setMenuAt] = useState<DOMRect | null>(null);




  // ⌘F (Ctrl+Shift+F off macOS) opens History with the search box focused.
  useEffect(() => {
    if (!isActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (isAppShortcut(e, 'f')) {
        e.preventDefault();
        setViewMode('history');
        setTimeout(() => histSearchRef.current?.select(), 0);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [isActive]);

  const toggleFlag = (flag: string) => {
    const on = !flags.includes(flag);
    playToggleSound(on);
    onUpdateFlags(project.id, on ? [...flags, flag] : flags.filter((f) => f !== flag));
  };

  // Remounting the terminal kills the old PTY and spawns a fresh one running fullCommand.
  const handleRestartClaude = () => {
    playLaunchSound();
    setLaunchCommand(null);
    setViewMode('terminal');
    setTermSessionKey((k) => k + 1);
  };

  const handleResumeSession = (sessionId: string) => {
    playLaunchSound();
    setLaunchCommand(buildCommand(sessionId));
    setViewMode('terminal');
    setTermSessionKey((k) => k + 1);
  };

  // Send text to the running Claude session; Enter goes separately so the TUI doesn't treat it as part of a paste.
  const sendToTerminal = (text: string) => { window.electronAPI.ptyPaste(tabSession.id, text); };

  // Queue: tasks for this tab, sent one at a time each time the agent finishes (main process runs it).
  const [queue, setQueue] = useState<string[]>([]);
  useEffect(() => {
    window.electronAPI.queueGet(tabSession.id).then(setQueue).catch(() => {});
    return window.electronAPI.onQueueChanged(({ id, queue: q }) => { if (id === tabSession.id) setQueue([...q]); });
  }, [tabSession.id]);
  const addToQueue = async () => {
    if (!scratchpadText.trim()) return;
    playClickSound();
    setQueue([...(await window.electronAPI.queueAdd(tabSession.id, scratchpadText))]);
    setScratchpadText('');
  };

  const handleExecuteCommand = (cmd: string) => {
    playLaunchSound();
    setViewMode('terminal');
    sendToTerminal(cmd);
  };

  const handleSendInterrupt = () => {
    playClickSound();
    window.electronAPI.ptyWrite(tabSession.id, '\x03');
  };

  const handleClearTerminal = () => {
    playClickSound();
    window.electronAPI.ptyWrite(tabSession.id, '\x0c'); // Ctrl+L: clears in both shell and Claude
  };

  const handleCopyPath = () => {
    playClickSound();
    navigator.clipboard.writeText(project.path);
    setCopiedPath(true);
    setTimeout(() => setCopiedPath(false), 1500);
  };

  // Load files & CLAUDE.md when viewing those tabs
  useEffect(() => {
    if (viewMode === 'run') {
      setRunCommands(null);
      window.electronAPI.getRunCommands(project.path).then(setRunCommands).catch(() => setRunCommands([]));
    }

    if (viewMode === 'memory') {
      setMemoryFiles(null);
      window.electronAPI.getMemoryFiles(project.path).then((list) => {
        setMemoryFiles(list);
        if (list.length && !list.some((f) => f.path === memoryPath)) openMemoryFile(list[0].path);
      }).catch(() => setMemoryFiles([]));
    }


  }, [viewMode]);

  const openMemoryFile = (filePath: string) => {
    setMemoryPath(filePath);
    setMemorySaved('');
    window.electronAPI.readFile(filePath).then((r) => setMemoryText(r.error ? '' : r.content)).catch(() => setMemoryText(''));
  };

  const saveMemoryFile = async () => {
    const r = await window.electronAPI.saveFile(memoryPath, memoryText);
    setMemorySaved(r.success ? 'Saved' : `Save failed: ${r.error}`);
    setTimeout(() => setMemorySaved(''), 2500);
  };

  const customCommands = project.customRunCommands || [];
  const addCustomCommand = () => {
    const command = newCmd.trim();
    if (!command || customCommands.some((c) => c.command === command)) return;
    onSaveCustomCommands([...customCommands, { label: command.split(/\s+/).slice(0, 3).join(' '), command, source: 'custom' }]);
    setNewCmd('');
  };

  const handleSendScratchpadToTerminal = () => {
    if (!scratchpadText.trim()) return;
    playLaunchSound();
    sendToTerminal(scratchpadText.trim());
  };

  // Quick Action Presets
  const allQuickActions = [
    { label: '/doctor', cmd: '/doctor', icon: <Stethoscope className="w-3 h-3" />, desc: 'Check health & setup' },
    { label: '/compact', cmd: '/compact', icon: <Minimize2 className="w-3 h-3" />, desc: 'Compact conversation' },
    { label: '/init', cmd: '/init', icon: <Sparkles className="w-3 h-3" />, desc: 'Init CLAUDE.md' },
    { label: '/cost', cmd: '/cost', icon: <Coins className="w-3 h-3" />, desc: 'Show tokens & cost' },
    {
      label: 'Review Git Diff',
      cmd: DEFAULT_QUICK_COMMANDS[4],
      icon: <GitBranch className="w-3 h-3" />,
      desc: 'Review diff with Claude'
    },
    {
      label: 'Find Bugs',
      cmd: DEFAULT_QUICK_COMMANDS[5],
      icon: <Search className="w-3 h-3" />,
      desc: 'Scan code for bugs'
    },
    {
      label: 'Write Tests',
      cmd: DEFAULT_QUICK_COMMANDS[6],
      icon: <Code2 className="w-3 h-3" />,
      desc: 'Generate test suite'
    }
  ];
  // The user's list from Settings, or the built-ins; built-in slash commands are Claude's, so other agents skip them.
  const quickActions = (quickCommands ?? DEFAULT_QUICK_COMMANDS)
    .filter((cmd) => isClaude || quickCommands || !cmd.startsWith('/'))
    .map((cmd) => allQuickActions.find((qa) => qa.cmd === cmd)
      ?? { label: cmd.length > 32 ? `${cmd.slice(0, 32)}…` : cmd, cmd, icon: <Sparkles className="w-3 h-3" />, desc: cmd });

  return (
    <div
      className="flex flex-col h-full w-full select-text relative font-mono overflow-hidden"
      style={{
        backgroundColor: themeConfig.bgMain,
        color: themeConfig.textPrimary
      }}
    >
      {/* 1. Slim Modern Control Bar */}
      <div
        className="h-10 px-3 flex items-center justify-between text-xs border-b gap-2 flex-shrink-0 overflow-x-auto overflow-y-hidden no-scrollbar"
        onWheel={(e) => { if (!e.deltaX) e.currentTarget.scrollLeft += e.deltaY; }}
        style={{
          backgroundColor: themeConfig.bgHeader,
          borderColor: themeConfig.border
        }}
      >
        {/* Left: Project Path & Git Branch Indicator */}
        <div className="flex items-center gap-1.5 min-w-0 flex-shrink-0">
          <div
            onClick={handleCopyPath}
            title={`${project.path} (Click to copy)`}
            className="flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer transition-all hover:opacity-100 max-w-[150px] sm:max-w-[200px] text-[11px] font-medium border"
            style={{
              backgroundColor: themeConfig.bgTabActive,
              color: themeConfig.textSecondary,
              borderColor: themeConfig.border
            }}
          >
            <span style={{ color: themeConfig.accent }}>❯</span>
            <span className="truncate">{project.name}</span>
            {copiedPath ? (
              <Check className="w-3 h-3 text-emerald-400 flex-shrink-0" />
            ) : (
              <Copy className="w-3 h-3 opacity-40 hover:opacity-100 flex-shrink-0" />
            )}
          </div>

          {gitStatus?.isGit && (
            <div
              onClick={() => handleExecuteCommand('Review the recent git diff and summarize changes')}
              title={`Git Branch: ${gitStatus.branch} (${gitStatus.statusText}). Click to have the agent review the diff.`}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] cursor-pointer hover:opacity-90 border transition-all"
              style={{
                backgroundColor: gitStatus.modifiedCount > 0 ? themeConfig.accentBg : themeConfig.bgTabActive,
                color: gitStatus.modifiedCount > 0 ? themeConfig.accent : themeConfig.textMuted,
                borderColor: gitStatus.modifiedCount > 0 ? themeConfig.accent : themeConfig.border
              }}
            >
              <GitBranch className="w-3 h-3" />
              <span>{gitStatus.branch}</span>
              {gitStatus.modifiedCount > 0 && (
                <span className="font-bold">• {gitStatus.modifiedCount} modified</span>
              )}
            </div>
          )}
          {gitStatus?.isGit && (
            <button
              onClick={() => { playClickSound(); onOpenWorktree(); }}
              title="New tab in its own git worktree and branch, so two agents don't edit the same files"
              aria-label="New tab in a git worktree"
              className="flex items-center px-1 py-0.5 rounded border hover:opacity-80"
              style={{ color: themeConfig.textMuted, borderColor: themeConfig.border }}
            >
              <GitFork className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Center: Essential Flags & Quick Omnibar */}
        <div className="flex items-center gap-1.5 flex-1 max-w-xl justify-start">
          {/* Agent picker */}
          <select
            value={agent.id}
            onChange={(e) => handleSwitchAgent(e.target.value)}
            title="Which terminal AI agent this project runs"
            aria-label="Agent"
            className="text-[11px] font-medium px-1.5 py-1 rounded border outline-none cursor-pointer flex-shrink-0"
            style={{ backgroundColor: themeConfig.bgMain, borderColor: themeConfig.border, color: themeConfig.textPrimary }}
          >
            {AGENTS.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>

          {/* Model and effort from the user's own account; "Default" leaves the agent's own setting. Applies on Run. */}
          {!!agentOpts?.models.length && (
            <select
              value={modelChoice?.model || ''}
              onChange={(e) => {
                const model = e.target.value || undefined;
                const next = agentOpts.models.find((m) => m.id === model);
                const levels = next?.efforts?.length ? next.efforts : agentOpts.efforts;
                // Keep the effort only if the new model has it.
                onSetModel({ model, effort: modelChoice?.effort && levels.includes(modelChoice.effort) ? modelChoice.effort : undefined });
              }}
              title={`${agent.name} model (press Run to restart with it)`}
              aria-label="Model"
              className="text-[11px] px-1.5 py-1 rounded border outline-none cursor-pointer flex-shrink-0 max-w-[140px]"
              style={{ backgroundColor: themeConfig.bgMain, borderColor: themeConfig.border, color: modelChoice?.model ? themeConfig.textPrimary : themeConfig.textMuted }}
            >
              <option value="">Default model</option>
              {agentOpts.models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          )}
          {!!effortList.length && (
            <select
              value={modelChoice?.effort || ''}
              onChange={(e) => onSetModel({ ...modelChoice, effort: e.target.value || undefined })}
              title={`${agent.name} effort: how hard it thinks (press Run to restart with it)`}
              aria-label="Effort"
              className="text-[11px] px-1.5 py-1 rounded border outline-none cursor-pointer flex-shrink-0"
              style={{ backgroundColor: themeConfig.bgMain, borderColor: themeConfig.border, color: modelChoice?.effort ? themeConfig.textPrimary : themeConfig.textMuted }}
            >
              <option value="">{pickedModel?.defaultEffort ? `Effort: ${pickedModel.defaultEffort}` : 'Default effort'}</option>
              {effortList.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          )}

          {/* Hand off: the next agent starts with what this one did (conversation, changes, memory). */}
          <div className="relative flex-shrink-0">
            <button
              type="button"
              onClick={(e) => { setMenuAt(e.currentTarget.getBoundingClientRect()); setIsHandoffOpen((o) => !o); }}
              title="Continue this work with another agent (it gets the conversation, changes and memory)"
              aria-label="Hand off to another agent"
              aria-expanded={isHandoffOpen}
              className="p-1 rounded border hover:opacity-80"
              style={{ borderColor: themeConfig.border, color: themeConfig.textMuted }}
            >
              <ArrowRightLeft className="w-3 h-3" />
            </button>
            {isHandoffOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsHandoffOpen(false)} />
                <div className="fixed z-50 min-w-[200px] rounded-lg border shadow-2xl p-1"
                  style={{ top: (menuAt?.bottom ?? 0) + 4, left: menuAt?.left, backgroundColor: themeConfig.bgCard, borderColor: themeConfig.border }}>
                  <div className="px-2 py-1 text-[10px]" style={{ color: themeConfig.textMuted }}>Continue with</div>
                  {AGENTS.filter((a) => a.id !== agent.id).map((a) => (
                    <button key={a.id} type="button"
                      onClick={() => { setIsHandoffOpen(false); playLaunchSound(); onHandoff(a.id); }}
                      className="w-full text-left px-2 py-1.5 rounded text-[11px] hover:opacity-80"
                      style={{ color: themeConfig.textPrimary }}>
                      {a.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Flags menu: one button keeps the toolbar from overflowing however many flags there are. List is set in Settings. */}
          {(() => {
            const dangerOn = flags.some(isDangerFlag);
            return (
              <div className="relative flex-shrink-0">
                <button
                  type="button"
                  onClick={(e) => { setMenuAt(e.currentTarget.getBoundingClientRect()); setIsFlagsOpen((o) => !o); }}
                  title={flags.length ? `Active: ${flags.join(' ')}` : 'No flags on'}
                  aria-expanded={isFlagsOpen}
                  className="px-2 py-1 rounded text-[11px] font-medium transition-all flex items-center gap-1.5 border whitespace-nowrap"
                  style={{
                    backgroundColor: dangerOn ? 'rgba(239,68,68,0.12)' : flags.length ? themeConfig.accentBg : 'transparent',
                    borderColor: dangerOn ? '#ef4444' : flags.length ? themeConfig.accent : themeConfig.border,
                    color: dangerOn ? '#ef4444' : flags.length ? themeConfig.accent : themeConfig.textMuted
                  }}
                >
                  <SlidersHorizontal className="w-3 h-3" />
                  <span>Flags{flags.length ? ` · ${flags.length}` : ''}</span>
                </button>
                {isFlagsOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsFlagsOpen(false)} />
                    <div
                      className="fixed z-50 min-w-[240px] rounded-lg border shadow-2xl p-1.5"
                      style={{ top: (menuAt?.bottom ?? 0) + 4, left: menuAt?.left, backgroundColor: themeConfig.bgCard, borderColor: themeConfig.border }}
                    >
                      {flagPills.length === 0 && (
                        <div className="px-2 py-1.5 text-[11px]" style={{ color: themeConfig.textMuted }}>
                          No flags for {agent.name}. Add some in Settings.
                        </div>
                      )}
                      {flagPills.map((flag) => {
                        const danger = isDangerFlag(flag);
                        return (
                          <label
                            key={flag}
                            className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-[11px] hover:bg-black/10"
                            title={danger ? 'The agent runs every tool without asking first. Use only in projects you trust.' : undefined}
                          >
                            <input
                              type="checkbox"
                              checked={flags.includes(flag)}
                              onChange={() => toggleFlag(flag)}
                              className="w-3.5 h-3.5 cursor-pointer"
                              style={{ accentColor: danger ? '#ef4444' : themeConfig.accent }}
                            />
                            <span className="font-mono" style={{ color: danger ? '#ef4444' : themeConfig.textPrimary }}>{flag}</span>
                          </label>
                        );
                      })}
                      <div className="px-2 pt-1 mt-1 border-t text-[10px]" style={{ borderColor: themeConfig.border, color: themeConfig.textMuted }}>
                        Takes effect on the next Run.
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })()}

          {/* Omnibar Input Field for Extra Flags / Prompt */}
          <div className="flex-1 relative min-w-[140px] flex items-center">
            <input
              type="text"
              placeholder="Prompt or flags (e.g. -p 'fix bug'). Press ↵ to run..."
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleRestartClaude();
                }
              }}
              className="w-full text-xs px-2.5 py-1 rounded outline-none border transition-colors"
              style={{
                backgroundColor: themeConfig.bgMain,
                borderColor: themeConfig.border,
                color: themeConfig.textPrimary
              }}
            />
          </div>
        </div>

        {/* Right: View Switcher & Action Buttons. Pinned to the right edge; the rest scrolls under it when the window is narrow. */}
        <div className="flex items-center gap-1.5 flex-shrink-0 sticky right-0 z-10 pl-2" style={{ backgroundColor: themeConfig.bgHeader }}>
          {/* View Mode Switcher */}
          <div
            className="flex items-center p-0.5 rounded border"
            style={{
              backgroundColor: themeConfig.bgMain,
              borderColor: themeConfig.border
            }}
          >
            <button
              onClick={() => {
                playClickSound();
                setViewMode('terminal');
              }}
              className="px-2 py-0.5 rounded text-[10px] font-medium transition-colors flex items-center gap-1"
              style={{
                backgroundColor: viewMode === 'terminal' ? themeConfig.bgTabActive : 'transparent',
                color: viewMode === 'terminal' ? themeConfig.textPrimary : themeConfig.textMuted
              }}
            >
              <TerminalIcon className="w-3 h-3" />
              <span>Terminal</span>
            </button>

            <button
              onClick={() => {
                playClickSound();
                setViewMode('claude-md');
              }}
              className="px-2 py-0.5 rounded text-[10px] font-medium transition-colors flex items-center gap-1"
              style={{
                backgroundColor: viewMode === 'claude-md' ? themeConfig.bgTabActive : 'transparent',
                color: viewMode === 'claude-md' ? themeConfig.textPrimary : themeConfig.textMuted
              }}
            >
              <FileText className="w-3 h-3" />
              <span>{mdFile}</span>
            </button>

            <button
              onClick={() => {
                playClickSound();
                setViewMode('files');
              }}
              className="px-2 py-0.5 rounded text-[10px] font-medium transition-colors flex items-center gap-1"
              style={{
                backgroundColor: viewMode === 'files' ? themeConfig.bgTabActive : 'transparent',
                color: viewMode === 'files' ? themeConfig.textPrimary : themeConfig.textMuted
              }}
            >
              <Layers className="w-3 h-3" />
              <span>Files</span>
            </button>

            {<button
              onClick={() => {
                playClickSound();
                setViewMode('history');
              }}
              title={`Previous ${agent.name} sessions in this project`}
              className="px-2 py-0.5 rounded text-[10px] font-medium transition-colors flex items-center gap-1"
              style={{
                backgroundColor: viewMode === 'history' ? themeConfig.bgTabActive : 'transparent',
                color: viewMode === 'history' ? themeConfig.textPrimary : themeConfig.textMuted
              }}
            >
              <History className="w-3 h-3" />
              <span>History</span>
            </button>}

            <button
              onClick={() => {
                playClickSound();
                setViewMode('run');
              }}
              title="Startup commands this repo declares (package.json, Makefile, README …)"
              className="px-2 py-0.5 rounded text-[10px] font-medium transition-colors flex items-center gap-1"
              style={{
                backgroundColor: viewMode === 'run' ? themeConfig.bgTabActive : 'transparent',
                color: viewMode === 'run' ? themeConfig.textPrimary : themeConfig.textMuted
              }}
            >
              <Rocket className="w-3 h-3" />
              <span>Scripts</span>
            </button>

            {isClaude && <button
              onClick={() => {
                playClickSound();
                setViewMode('memory');
              }}
              title="What Claude remembers about this project (CLAUDE.md + auto memory)"
              className="px-2 py-0.5 rounded text-[10px] font-medium transition-colors flex items-center gap-1"
              style={{
                backgroundColor: viewMode === 'memory' ? themeConfig.bgTabActive : 'transparent',
                color: viewMode === 'memory' ? themeConfig.textPrimary : themeConfig.textMuted
              }}
            >
              <Brain className="w-3 h-3" />
              <span>Memory</span>
            </button>}
          </div>

          {/* Action: Run / restart the agent */}
          <button
            onClick={handleRestartClaude}
            title={`Run: ${fullCommand}`}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-bold shadow-sm transition-all active:scale-95"
            style={{ backgroundColor: themeConfig.accent, color: themeConfig.accentText }}
          >
            <Play className="w-3 h-3 fill-current" />
            <span>Run</span>
          </button>

          {/* Action: Toggle Scratchpad Drawer */}
          <button
            onClick={() => {
              playClickSound();
              setIsScratchpadOpen(!isScratchpadOpen);
            }}
            title={isScratchpadOpen ? 'Close Scratchpad' : 'Open Prompt Drafter & Notes'}
            className="p-1 rounded hover:bg-black/20 transition-colors border flex items-center gap-1"
            style={{
              borderColor: isScratchpadOpen ? themeConfig.accent : themeConfig.border,
              backgroundColor: isScratchpadOpen ? themeConfig.accentBg : 'transparent',
              color: isScratchpadOpen ? themeConfig.accent : themeConfig.textMuted
            }}
          >
            <FileEdit className="w-3 h-3" />
          </button>

          {/* More: rarely used actions and the agent's quick commands, so the toolbar stays one short row. */}
          <div className="relative flex-shrink-0">
            <button
              type="button"
              onClick={(e) => { setMenuAt(e.currentTarget.getBoundingClientRect()); setIsMoreOpen((o) => !o); }}
              title="More actions"
              aria-label="More actions"
              aria-expanded={isMoreOpen}
              className="p-1 rounded hover:bg-black/20 transition-colors border"
              style={{ borderColor: themeConfig.border, color: themeConfig.textMuted }}
            >
              <MoreHorizontal className="w-3 h-3" />
            </button>
            {isMoreOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsMoreOpen(false)} />
                <div className="fixed z-50 min-w-[220px] max-h-[70vh] overflow-y-auto rounded-lg border shadow-2xl p-1 text-[11px]"
                  style={{ top: (menuAt?.bottom ?? 0) + 4, right: window.innerWidth - (menuAt?.right ?? 0), backgroundColor: themeConfig.bgCard, borderColor: themeConfig.border }}>
                  {[
                    { label: 'Stop (Ctrl+C)', icon: <Square className="w-3 h-3" />, run: handleSendInterrupt },
                    { label: 'Clear screen', icon: <Trash2 className="w-3 h-3" />, run: handleClearTerminal },
                    { label: 'Open in editor', icon: <Code2 className="w-3 h-3" />, run: () => onOpenEditor(project.path) },
                    { label: isMac ? 'Show in Finder' : 'Show in folder', icon: <FolderOpen className="w-3 h-3" />, run: () => onOpenFolder(project.path) }
                  ].map((item) => (
                    <button key={item.label} type="button" onClick={() => { setIsMoreOpen(false); item.run(); }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left hover:bg-black/20" style={{ color: themeConfig.textPrimary }}>
                      <span style={{ color: themeConfig.textMuted }}>{item.icon}</span>{item.label}
                    </button>
                  ))}
                  <div className="my-1 border-t" style={{ borderColor: themeConfig.border }} />
                  <div className="px-2 py-1 text-[10px]" style={{ color: themeConfig.textMuted }}>Send to {agent.name}</div>
                  {quickActions.map((qa) => (
                    <button key={qa.label} type="button" title={qa.desc} onClick={() => { setIsMoreOpen(false); handleExecuteCommand(qa.cmd); }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left hover:bg-black/20" style={{ color: themeConfig.textPrimary }}>
                      <span style={{ color: themeConfig.accent }}>{qa.icon}</span>{qa.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 3. Workspace Body */}
      <div className="relative flex-1 w-full h-full min-h-0 min-w-0 overflow-hidden flex">
        {/* Main Terminal Canvas (Always alive in DOM!) */}
        <div
          className="flex-1 w-full h-full relative"
          style={{ display: viewMode === 'terminal' ? 'block' : 'none' }}
        >
          <EmbeddedTerminal
            key={`term-${tabSession.id}-${termSessionKey}`}
            tabId={tabSession.id}
            projectPath={project.path}
            initialCommand={launchCommand ?? tabSession.initialCommand ?? fullCommand}
            theme={themeConfig}
            isActive={isActive && viewMode === 'terminal'}
          />
        </div>

        {/* Collapsible Scratchpad / Prompt Drafter Sidebar */}
        {viewMode === 'terminal' && isScratchpadOpen && (
          <div
            className="w-80 h-full border-l flex flex-col z-20 animate-fade-in flex-shrink-0"
            style={{
              backgroundColor: themeConfig.bgCard,
              borderColor: themeConfig.border
            }}
          >
            <div
              className="h-9 px-3 border-b flex items-center justify-between text-xs font-bold"
              style={{
                backgroundColor: themeConfig.bgHeader,
                borderColor: themeConfig.border
              }}
            >
              <div className="flex items-center gap-1.5" style={{ color: themeConfig.accent }}>
                <FileEdit className="w-3.5 h-3.5" />
                <span>Drafts &amp; queue</span>
              </div>
              <button
                onClick={() => setIsScratchpadOpen(false)}
                className="p-1 rounded hover:bg-black/20"
                style={{ color: themeConfig.textMuted }}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1 p-2 flex flex-col min-h-0">
              <textarea
                value={scratchpadText}
                onChange={(e) => setScratchpadText(e.target.value)}
                placeholder="Draft instructions, multi-line prompts, or paste context snippets here..."
                className="flex-1 w-full p-2.5 rounded-lg text-xs font-mono outline-none resize-none border leading-relaxed"
                style={{
                  backgroundColor: themeConfig.bgMain,
                  borderColor: themeConfig.border,
                  color: themeConfig.textPrimary
                }}
              />
            </div>

            {queue.length > 0 && (
              <div className="px-2 pb-2 flex flex-col gap-1 max-h-48 overflow-auto" aria-label="Queued tasks">
                <span className="text-[10px] uppercase tracking-wider" style={{ color: themeConfig.textMuted }}>
                  Queued · next goes in when the agent finishes
                </span>
                {queue.map((q, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-[11px] rounded border px-2 py-1" style={{ borderColor: themeConfig.border, color: themeConfig.textSecondary }}>
                    <span className="flex-1 whitespace-pre-wrap break-words line-clamp-3">{i + 1}. {q}</span>
                    <button onClick={async () => setQueue([...(await window.electronAPI.queueRemove(tabSession.id, i))])} aria-label={`Remove task ${i + 1}`} style={{ color: themeConfig.textMuted }}>
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div
              className="p-2 border-t flex items-center justify-between gap-2"
              style={{
                backgroundColor: themeConfig.bgHeader,
                borderColor: themeConfig.border
              }}
            >
              <button
                onClick={() => {
                  playClickSound();
                  setScratchpadText('');
                }}
                className="px-2 py-1 rounded text-[10px] text-zinc-500 hover:text-zinc-300"
              >
                Clear
              </button>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    playClickSound();
                    navigator.clipboard.writeText(scratchpadText);
                  }}
                  className="px-2 py-1 rounded text-[10px] border"
                  style={{
                    backgroundColor: themeConfig.bgTabActive,
                    borderColor: themeConfig.border,
                    color: themeConfig.textSecondary
                  }}
                >
                  Copy
                </button>
                <button
                  onClick={() => { if (!scratchpadText.trim()) return; playClickSound(); onOpenWorktree(scratchpadText); setScratchpadText(''); }}
                  disabled={!scratchpadText.trim()}
                  title="Run this task in parallel: a new git worktree (its own branch and folder) and a new tab whose agent starts on it"
                  className="px-2 py-1 rounded text-[10px] border disabled:opacity-40"
                  style={{ backgroundColor: themeConfig.bgTabActive, borderColor: themeConfig.border, color: themeConfig.textSecondary }}
                >
                  Worktree
                </button>
                <button
                  onClick={addToQueue}
                  disabled={!scratchpadText.trim()}
                  title="Line this task up: it goes in when the agent finishes what it is doing (right away if it is idle)"
                  className="px-2 py-1 rounded text-[10px] border disabled:opacity-40"
                  style={{ backgroundColor: themeConfig.bgTabActive, borderColor: themeConfig.border, color: themeConfig.textSecondary }}
                >
                  Queue
                </button>
                <button
                  onClick={handleSendScratchpadToTerminal}
                  disabled={!scratchpadText.trim()}
                  className="px-2.5 py-1 rounded text-xs font-bold flex items-center gap-1 disabled:opacity-40"
                  style={{ backgroundColor: themeConfig.accent, color: themeConfig.accentText }}
                >
                  <Send className="w-3 h-3" />
                  <span>Send ↵</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CLAUDE.md Smart Generator & Live Editor */}
        <InstructionsView key={`md-${agent.id}`} project={project} themeConfig={themeConfig} agent={agent} visible={viewMode === 'claude-md'} onExecute={handleExecuteCommand} onOpenEditor={onOpenEditor} />

        {viewMode === 'run' && (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="max-w-4xl mx-auto">
              <div className="text-[11px] mb-3" style={{ color: themeConfig.textMuted }}>
                Startup commands found in this repo. Click one to run it in a new terminal tab; Claude keeps running here.
              </div>
              <div className="flex gap-1.5 mb-3">
                <input
                  type="text"
                  value={newCmd}
                  onChange={(e) => setNewCmd(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addCustomCommand(); }}
                  placeholder="Add your own command, e.g. npm run dev -- --port 3001"
                  aria-label="Custom command"
                  className="flex-1 text-xs px-2.5 py-1.5 rounded outline-none border font-mono"
                  style={{ backgroundColor: themeConfig.bgMain, borderColor: themeConfig.border, color: themeConfig.textPrimary }}
                />
                <button
                  type="button"
                  onClick={addCustomCommand}
                  className="px-2.5 rounded text-xs font-bold flex items-center gap-1"
                  style={{ backgroundColor: themeConfig.accent, color: themeConfig.accentText }}
                >
                  <Plus className="w-3 h-3" /> Add
                </button>
              </div>
              {runCommands === null ? (
                <div className="text-center py-16 text-xs" style={{ color: themeConfig.textMuted }}>Scanning repo...</div>
              ) : customCommands.length + runCommands.length === 0 ? (
                <div className="text-center py-16 text-xs" style={{ color: themeConfig.textMuted }}>No startup commands found. Add one above.</div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {[...customCommands, ...runCommands.filter((c) => !customCommands.some((x) => x.command === c.command))].map((c) => (
                    <div
                      key={`${c.source}:${c.command}`}
                      className="w-full px-3 py-2 rounded-lg border flex items-center gap-3"
                      style={{ backgroundColor: themeConfig.bgCard, borderColor: themeConfig.border }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-mono truncate" style={{ color: themeConfig.textPrimary }}>{c.command}</div>
                        <div className="text-[10px] mt-0.5" style={{ color: themeConfig.textMuted }}>{c.label} · {c.source}</div>
                      </div>
                      {c.source === 'custom' && (
                        <button
                          type="button"
                          onClick={() => onSaveCustomCommands(customCommands.filter((x) => x.command !== c.command))}
                          title="Remove this command"
                          aria-label={`Remove ${c.command}`}
                          className="p-1 rounded hover:bg-black/20"
                          style={{ color: themeConfig.textMuted }}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => { playLaunchSound(); onRunCommand(c.command); }}
                        className="px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 flex-shrink-0"
                        style={{ backgroundColor: themeConfig.accent, color: themeConfig.accentText }}
                      >
                        <Play className="w-3 h-3 fill-current" /> Run
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {viewMode === 'memory' && (
          <div className="flex-1 flex min-h-0">
            <div className="w-64 border-r overflow-y-auto p-2 flex-shrink-0" style={{ borderColor: themeConfig.border }}>
              {memoryFiles === null ? (
                <div className="text-xs p-2" style={{ color: themeConfig.textMuted }}>Loading...</div>
              ) : memoryFiles.length === 0 ? (
                <div className="text-xs p-2" style={{ color: themeConfig.textMuted }}>
                  Claude has no memory for this project yet. Create a CLAUDE.md, or ask Claude to remember something.
                </div>
              ) : memoryFiles.map((f) => (
                <button
                  key={f.path}
                  type="button"
                  onClick={() => openMemoryFile(f.path)}
                  title={f.path}
                  className="w-full text-left px-2 py-1.5 rounded text-xs truncate"
                  style={{
                    backgroundColor: f.path === memoryPath ? themeConfig.bgTabActive : 'transparent',
                    color: f.path === memoryPath ? themeConfig.textPrimary : themeConfig.textSecondary
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {memoryPath && (
              <div className="flex-1 flex flex-col min-w-0 p-3 gap-2">
                <div className="flex items-center gap-2 text-[10px]" style={{ color: themeConfig.textMuted }}>
                  <span className="truncate flex-1 font-mono">{memoryPath}</span>
                  {memorySaved && <span style={{ color: themeConfig.accent }}>{memorySaved}</span>}
                  <button
                    type="button"
                    onClick={saveMemoryFile}
                    className="px-2 py-0.5 rounded font-bold flex items-center gap-1"
                    style={{ backgroundColor: themeConfig.accent, color: themeConfig.accentText }}
                  >
                    <Save className="w-3 h-3" /> Save
                  </button>
                </div>
                <textarea
                  value={memoryText}
                  onChange={(e) => setMemoryText(e.target.value)}
                  aria-label="Memory file content"
                  className="flex-1 w-full p-2.5 rounded-lg text-xs font-mono outline-none resize-none border leading-relaxed"
                  style={{ backgroundColor: themeConfig.bgMain, borderColor: themeConfig.border, color: themeConfig.textPrimary }}
                />
              </div>
            )}
          </div>
        )}

        {/* Files Browser View */}
        <HistoryView key={`history-${agent.id}`} project={project} themeConfig={themeConfig} agent={agent} visible={viewMode === 'history'} searchRef={histSearchRef} onResume={handleResumeSession} onResumeAs={onResumeAs} onHandoffSession={onHandoffSession} />

        {filesSeen && <FilesView project={project} themeConfig={themeConfig} visible={viewMode === 'files'} onOpenEditor={onOpenEditor} />}
      </div>
    </div>
  );
};

