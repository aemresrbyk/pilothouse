import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Terminal as TerminalIcon,
  Play,
  RotateCcw,
  Square,
  FileText,
  Layers,
  FolderOpen,
  Code2,
  Copy,
  Check,
  GitBranch,
  Search,
  FileCode,
  FileJson,
  Folder,
  File as FileIcon,
  Trash2,
  Sparkles,
  Save,
  Edit3,
  Eye,
  FileEdit,
  Send,
  X,
  Stethoscope,
  Minimize2,
  HelpCircle,
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
import { ProjectItem, TabSession, ProjectFlags, FileItem, ClaudeSession, RunCommand, MemoryFile, TranscriptMessage, HistoryHit, isDangerFlag, AGENTS, AgentProfile, buildAgentCommand, promptArgs } from '../types';
import { ThemeConfig } from '../theme';
import { EmbeddedTerminal } from './EmbeddedTerminal';
import { isAppShortcut, keyLabel, isMac } from '../utils/platform';
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
  onSwitchAgent: (projectId: string, agentId: string) => void;
  onRunCommand: (command: string) => void;
  onOpenWorktree: () => void;
  onHandoff: (agentId: string) => void;
  pendingPrompt?: string; // set by a hand-off: restart once with this first prompt
  onPromptUsed: () => void;
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
  onSwitchAgent,
  onRunCommand,
  onOpenWorktree,
  onHandoff,
  pendingPrompt,
  onPromptUsed,
  onSaveCustomCommands
}) => {
  const [viewMode, setViewMode] = useState<'terminal' | 'claude-md' | 'files' | 'history' | 'run' | 'memory'>('terminal');
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
  const [sessions, setSessions] = useState<ClaudeSession[] | null>(null);
  const [customInput, setCustomInput] = useState<string>(tabSession.customInput || '');
  const [termSessionKey, setTermSessionKey] = useState<number>(1);
  const [copiedPath, setCopiedPath] = useState(false);
  const [isFlagsOpen, setIsFlagsOpen] = useState(false);
  // History: selected session's transcript + search across all sessions of this project.
  const [openSession, setOpenSession] = useState<ClaudeSession | null>(null);
  const [transcript, setTranscript] = useState<TranscriptMessage[] | null>(null);
  const [focusMsg, setFocusMsg] = useState<number | null>(null);
  const [histQuery, setHistQuery] = useState('');
  const [hits, setHits] = useState<HistoryHit[] | null>(null);
  const histSearchRef = useRef<HTMLInputElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  // Git Status state
  const [gitStatus, setGitStatus] = useState<{ isGit: boolean; branch: string; modifiedCount: number; statusText: string } | null>(null);

  // Scratchpad state
  const [isScratchpadOpen, setIsScratchpadOpen] = useState(false);
  const [scratchpadText, setScratchpadText] = useState(() => {
    return localStorage.getItem(`scratchpad-${project.id}`) || '';
  });

  // CLAUDE.md state
  const [claudeMdContent, setClaudeMdContent] = useState<string>('');
  const [isEditingMd, setIsEditingMd] = useState(false);
  const [editedMdContent, setEditedMdContent] = useState<string>('');
  const [isLoadingMd, setIsLoadingMd] = useState(false);
  const [isSavingMd, setIsSavingMd] = useState(false);
  const [copiedMd, setCopiedMd] = useState(false);
  const [mdSavedToast, setMdSavedToast] = useState(false);
  const [mdSaveError, setMdSaveError] = useState<string | null>(null);

  // Files state
  const [files, setFiles] = useState<FileItem[]>([]);
  const [currentDir, setCurrentDir] = useState<string>(project.path);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [fileSearch, setFileSearch] = useState('');
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [selectedContent, setSelectedContent] = useState<string>('');
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [copiedFile, setCopiedFile] = useState(false);

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
  const buildCommand = (resumeId?: string) => buildAgentCommand(agent, agentBinary, flags, customInput, resumeId);
  const fullCommand = useMemo(() => buildCommand(), [flags, customInput, agentBinary, agent]);
  const isClaude = agent.id === 'claude';
  const mdFile = agent.instructionsFile;

  // Switching agent restarts the terminal with the new agent's command.
  const handleSwitchAgent = (agentId: string) => {
    playLaunchSound();
    onSwitchAgent(project.id, agentId);
    setClaudeMdContent('');
    setSessions(null);
    setOpenSession(null);
    setHistQuery('');
    if (viewMode === 'memory' || viewMode === 'history') setViewMode('terminal');
    setLaunchCommand(null);
    setTermSessionKey((k) => k + 1);
  };

  // A hand-off switched the agent (via props): start the new one once with the hand-off prompt.
  useEffect(() => {
    if (!pendingPrompt) return;
    setSessions(null);
    setOpenSession(null);
    setClaudeMdContent('');
    setViewMode('terminal');
    setLaunchCommand(buildAgentCommand(agent, agentBinary, flags, promptArgs(agent, pendingPrompt)));
    setTermSessionKey((k) => k + 1);
    onPromptUsed();
  }, [pendingPrompt]);
  const [isHandoffOpen, setIsHandoffOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  const openTranscript = (sess: ClaudeSession, msgIndex: number | null = null) => {
    setOpenSession(sess);
    setFocusMsg(msgIndex);
    setTranscript(null);
    if (sess.file) window.electronAPI.getTranscript(sess.file).then(setTranscript).catch(() => setTranscript([]));
  };

  // Debounced search; empty query shows the session list again.
  useEffect(() => {
    const q = histQuery.trim();
    if (!q) { setHits(null); return; }
    const t = setTimeout(() => {
      window.electronAPI.searchHistory(project.path, agent.id, q).then(setHits).catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(t);
  }, [histQuery, project.path, agent.id]);

  // Scroll the transcript to the message a search hit points at.
  useEffect(() => {
    if (focusMsg === null || !transcript) return;
    transcriptRef.current?.querySelector(`[data-msg="${focusMsg}"]`)?.scrollIntoView({ block: 'center' });
  }, [focusMsg, transcript]);

  // ⌘F (Ctrl+Shift+F off macOS) opens History with the search box focused.
  useEffect(() => {
    if (!isActive || !agent.hasHistory) return;
    const onKey = (e: KeyboardEvent) => {
      if (isAppShortcut(e, 'f')) {
        e.preventDefault();
        setViewMode('history');
        setTimeout(() => histSearchRef.current?.select(), 0);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [isActive, agent.hasHistory]);

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
  const sendToTerminal = (text: string) => {
    window.electronAPI.ptyWrite(tabSession.id, text);
    setTimeout(() => window.electronAPI.ptyWrite(tabSession.id, '\r'), 80);
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
    if (viewMode === 'claude-md' && !claudeMdContent) {
      loadClaudeMd();
    }

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

    if (viewMode === 'history') {
      setSessions(null);
      window.electronAPI.getSessions(project.path, agent.id).then(setSessions).catch(() => setSessions([]));
    }

    if (viewMode === 'files') {
      setIsLoadingFiles(true);
      window.electronAPI.listFiles(currentDir)
        .then((items) => {
          setFiles(items);
          if (selectedFile) return;
          const firstFile = items.find((f) => !f.isDirectory && f.name.toLowerCase() === 'claude.md')
            || items.find((f) => !f.isDirectory && f.name.toLowerCase() === 'package.json')
            || items.find((f) => !f.isDirectory);
          if (firstFile) {
            loadFilePreview(firstFile);
          }
        })
        .catch(() => setFiles([]))
        .finally(() => setIsLoadingFiles(false));
    }
  }, [viewMode, currentDir]);

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

  const loadClaudeMd = () => {
    setIsLoadingMd(true);
    window.electronAPI.readFile(`${project.path}/${mdFile}`)
      .then((res) => {
        // Missing file → empty state (shows the generator), not an error string.
        const content = res.error ? '' : res.content;
        setClaudeMdContent(content);
        setEditedMdContent(content);
      })
      .catch(() => {
        const notFound = '';
        setClaudeMdContent(notFound);
        setEditedMdContent(notFound);
      })
      .finally(() => setIsLoadingMd(false));
  };

  const handleSaveClaudeMd = async () => {
    setIsSavingMd(true);
    setMdSaveError(null);
    playClickSound();
    try {
      const res = await window.electronAPI.saveFile(`${project.path}/${mdFile}`, editedMdContent);
      if (!res.success) {
        setMdSaveError(res.error || 'Save failed');
      } else {
        setClaudeMdContent(editedMdContent);
        setIsEditingMd(false);
        setMdSavedToast(true);
        setTimeout(() => setMdSavedToast(false), 2000);
      }
    } catch (err) {
      console.error('Failed to save CLAUDE.md:', err);
    } finally {
      setIsSavingMd(false);
    }
  };

  const handleGenerateSmartClaudeMd = () => {
    playClickSound();
    const template = `# ${mdFile} - ${project.name} Guidelines

## Project Overview
This repository contains ${project.name}.
Follow these engineering guidelines for all code edits, refactors, and feature additions.

## Build & Test Commands
- **Install dependencies:** \`bun install\` (or \`npm install\`)
- **Run dev server:** \`bun run dev\` (or \`npm run dev\`)
- **Run build:** \`bun run build\`
- **Run tests:** \`bun test\` (or \`npm test\`)

## Code Style & Architecture
- **Language & Types:** Modern TypeScript with strict typing. Avoid \`any\`.
- **Modularity:** Keep functions small, single-purpose, and pure where possible.
- **Error Handling:** Always gracefully handle edge cases, missing files, and network errors.

## Claude Agent Rules
1. Test and verify all changes before declaring completion.
2. Maintain existing documentation and preserve docstrings.
3. Keep UI minimal, fast, and responsive.
`;
    setEditedMdContent(template);
    setIsEditingMd(true);
  };

  const loadFilePreview = async (file: FileItem) => {
    playClickSound();
    if (file.isDirectory) {
      setFileSearch('');
      setCurrentDir(file.path);
      return;
    }
    setSelectedFile(file);
    setIsLoadingContent(true);
    try {
      const res = await window.electronAPI.readFile(file.path);
      setSelectedContent(res.error ? `Error: ${res.error}` : res.content + (res.truncated ? '\n\n… (truncated, open in editor to see the full file)' : ''));
    } catch (err: any) {
      setSelectedContent(`Failed to read file: ${err.message}`);
    } finally {
      setIsLoadingContent(false);
    }
  };

  const filteredFiles = useMemo(() => {
    if (!fileSearch.trim()) return files;
    return files.filter((f) => f.name.toLowerCase().includes(fileSearch.toLowerCase()));
  }, [files, fileSearch]);

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
      cmd: 'Review the recent git diff and summarize key changes, edge cases or bugs',
      icon: <GitBranch className="w-3 h-3" />,
      desc: 'Review diff with Claude'
    },
    {
      label: 'Find Bugs',
      cmd: 'Carefully inspect recent changes and identify any edge cases or bugs',
      icon: <Search className="w-3 h-3" />,
      desc: 'Scan code for bugs'
    },
    {
      label: 'Write Tests',
      cmd: 'Write unit tests for the recent changes in this project',
      icon: <Code2 className="w-3 h-3" />,
      desc: 'Generate test suite'
    }
  ];
  // Slash commands differ per agent; the prompt actions work with any of them.
  const quickActions = isClaude ? allQuickActions : allQuickActions.filter((qa) => !qa.cmd.startsWith('/'));

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
        className="h-10 px-3 flex items-center justify-between text-xs border-b gap-2 flex-shrink-0"
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
              title={`Git Branch: ${gitStatus.branch} (${gitStatus.statusText}). Click to review with Claude!`}
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
        <div className="flex items-center gap-1.5 flex-1 max-w-xl min-w-0 justify-start">
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

          {/* Hand off: the next agent starts with what this one did (conversation, changes, memory). */}
          <div className="relative flex-shrink-0">
            <button
              type="button"
              onClick={() => setIsHandoffOpen((o) => !o)}
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
                <div className="absolute left-0 top-full mt-1 z-50 min-w-[200px] rounded-lg border shadow-2xl p-1"
                  style={{ backgroundColor: themeConfig.bgCard, borderColor: themeConfig.border }}>
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
                  onClick={() => setIsFlagsOpen((o) => !o)}
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
                      className="absolute left-0 top-full mt-1 z-50 min-w-[240px] rounded-lg border shadow-2xl p-1.5"
                      style={{ backgroundColor: themeConfig.bgCard, borderColor: themeConfig.border }}
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
          <div className="flex-1 relative min-w-0 flex items-center">
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

        {/* Right: View Switcher & Action Buttons */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
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

            {agent.hasHistory && <button
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

          {/* Action: Run / Launch Claude */}
          <button
            onClick={handleRestartClaude}
            title={`Run: ${fullCommand}`}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-bold text-white shadow-sm transition-all active:scale-95"
            style={{ backgroundColor: themeConfig.accent }}
          >
            <Play className="w-3 h-3 fill-white" />
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
              onClick={() => setIsMoreOpen((o) => !o)}
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
                <div className="absolute right-0 top-full mt-1 z-50 min-w-[220px] max-h-[70vh] overflow-y-auto rounded-lg border shadow-2xl p-1 text-[11px]"
                  style={{ backgroundColor: themeConfig.bgCard, borderColor: themeConfig.border }}>
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
                <span>Prompt Drafter &amp; Notes</span>
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
                  onClick={handleSendScratchpadToTerminal}
                  disabled={!scratchpadText.trim()}
                  className="px-2.5 py-1 rounded text-xs font-bold text-white flex items-center gap-1 disabled:opacity-40"
                  style={{ backgroundColor: themeConfig.accent }}
                >
                  <Send className="w-3 h-3" />
                  <span>Send ↵</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CLAUDE.md Smart Generator & Live Editor */}
        {viewMode === 'claude-md' && (
          <div className="flex-1 flex flex-col overflow-hidden p-4 max-w-4xl w-full mx-auto">
            {/* Toolbar */}
            <div
              className="p-3 border rounded-xl flex items-center justify-between text-xs mb-3 flex-shrink-0"
              style={{
                backgroundColor: themeConfig.bgCard,
                borderColor: themeConfig.border
              }}
            >
              <div className="flex items-center gap-2 font-bold" style={{ color: themeConfig.textPrimary }}>
                <FileText className="w-4 h-4" style={{ color: themeConfig.accent }} />
                <span>{mdFile} (Project Context &amp; Instructions)</span>
              </div>

              <div className="flex items-center gap-2">
                {/* Save Confirmation Toast */}
                {mdSavedToast && (
                  <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1 animate-fade-in">
                    <Check className="w-3 h-3" />
                    <span>Saved!</span>
                  </span>
                )}

                {mdSaveError && (
                  <span className="text-[11px] font-bold text-red-400" title={mdSaveError}>Save failed</span>
                )}

                {/* Edit / Preview Toggle */}
                <button
                  onClick={() => {
                    playClickSound();
                    setIsEditingMd(!isEditingMd);
                  }}
                  className="px-2 py-1 rounded flex items-center gap-1 text-[11px] border"
                  style={{
                    backgroundColor: isEditingMd ? themeConfig.accentBg : themeConfig.bgTabActive,
                    borderColor: isEditingMd ? themeConfig.accent : themeConfig.border,
                    color: isEditingMd ? themeConfig.accent : themeConfig.textSecondary
                  }}
                >
                  {isEditingMd ? <Eye className="w-3 h-3" /> : <Edit3 className="w-3 h-3" />}
                  <span>{isEditingMd ? 'Preview' : 'Edit'}</span>
                </button>

                {/* Save Button (when editing) */}
                {isEditingMd && (
                  <button
                    onClick={handleSaveClaudeMd}
                    disabled={isSavingMd}
                    className="px-2.5 py-1 rounded flex items-center gap-1 text-[11px] font-bold text-white shadow-sm"
                    style={{ backgroundColor: themeConfig.accent }}
                  >
                    <Save className="w-3 h-3" />
                    <span>{isSavingMd ? 'Saving...' : 'Save Changes'}</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    playClickSound();
                    navigator.clipboard.writeText(isEditingMd ? editedMdContent : claudeMdContent);
                    setCopiedMd(true);
                    setTimeout(() => setCopiedMd(false), 1500);
                  }}
                  className="px-2 py-1 rounded flex items-center gap-1 text-[11px] border"
                  style={{
                    backgroundColor: themeConfig.bgTabActive,
                    borderColor: themeConfig.border,
                    color: themeConfig.textSecondary
                  }}
                >
                  {copiedMd ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedMd ? 'Copied' : 'Copy'}</span>
                </button>

                <button
                  onClick={() => onOpenEditor(project.path)}
                  className="px-2 py-1 rounded flex items-center gap-1 text-[11px] border"
                  style={{
                    backgroundColor: themeConfig.bgTabActive,
                    borderColor: themeConfig.border,
                    color: themeConfig.textSecondary
                  }}
                >
                  <Code2 className="w-3 h-3" />
                  <span>VS Code</span>
                </button>
              </div>
            </div>

            {/* Content Area */}
            <div
              className="flex-1 overflow-auto rounded-xl border text-xs select-text font-mono leading-relaxed flex flex-col"
              style={{
                backgroundColor: themeConfig.bgCard,
                borderColor: themeConfig.border,
                color: themeConfig.textPrimary
              }}
            >
              {isLoadingMd ? (
                <div className="text-center py-16" style={{ color: themeConfig.textMuted }}>
                  Loading {mdFile}...
                </div>
              ) : isEditingMd ? (
                <textarea
                  value={editedMdContent}
                  onChange={(e) => setEditedMdContent(e.target.value)}
                  placeholder="Enter project instructions for Claude Code..."
                  className="flex-1 w-full h-full p-4 bg-transparent outline-none resize-none font-mono text-xs leading-relaxed"
                  style={{ color: themeConfig.textPrimary }}
                />
              ) : claudeMdContent ? (
                <div className="p-4 overflow-auto">
                  <pre className="whitespace-pre-wrap">{claudeMdContent}</pre>
                </div>
              ) : (
                /* Empty State with Smart Generator */
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                  <Sparkles className="w-10 h-10 mb-3" style={{ color: themeConfig.accent }} />
                  <h3 className="text-sm font-bold" style={{ color: themeConfig.textPrimary }}>
                    No {mdFile} Found in Project Root
                  </h3>
                  <p className="text-xs mt-1 max-w-md leading-relaxed" style={{ color: themeConfig.textMuted }}>
                    A {mdFile} file helps {agent.name} understand your architecture, build commands, test patterns, and style guide automatically.
                  </p>
                  <div className="mt-4 flex items-center gap-2">
                    <button
                      onClick={handleGenerateSmartClaudeMd}
                      className="px-4 py-2 rounded-lg text-xs font-bold text-white shadow-md flex items-center gap-1.5 transition-all active:scale-95"
                      style={{ backgroundColor: themeConfig.accent }}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>✦ Generate Smart {mdFile} Template</span>
                    </button>
                    <button
                      onClick={() => handleExecuteCommand('/init')}
                      className="px-3 py-2 rounded-lg text-xs font-medium border transition-colors"
                      style={{
                        backgroundColor: themeConfig.bgTabActive,
                        borderColor: themeConfig.border,
                        color: themeConfig.textSecondary
                      }}
                    >
                      Run /init in Terminal
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

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
                  className="px-2.5 rounded text-xs font-bold flex items-center gap-1 text-white"
                  style={{ backgroundColor: themeConfig.accent }}
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
                        className="px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 flex-shrink-0 text-white"
                        style={{ backgroundColor: themeConfig.accent }}
                      >
                        <Play className="w-3 h-3 fill-white" /> Run
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
                    className="px-2 py-0.5 rounded font-bold flex items-center gap-1 text-white"
                    style={{ backgroundColor: themeConfig.accent }}
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
        {viewMode === 'history' && (
          <div className="flex-1 flex overflow-hidden">
            {/* Sessions / search results */}
            <div className="w-80 border-r flex flex-col flex-shrink-0" style={{ backgroundColor: themeConfig.bgCard, borderColor: themeConfig.border }}>
              <div className="p-2 border-b flex items-center gap-1.5" style={{ backgroundColor: themeConfig.bgHeader, borderColor: themeConfig.border }}>
                <Search className="w-3 h-3 flex-shrink-0" style={{ color: themeConfig.textMuted }} />
                <input
                  ref={histSearchRef}
                  type="search"
                  placeholder={`Search all conversations (${keyLabel('F')})`}
                  value={histQuery}
                  onChange={(e) => setHistQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Escape') setHistQuery(''); }}
                  aria-label="Search conversations"
                  className="w-full bg-transparent text-[11px] outline-none"
                  style={{ color: themeConfig.textPrimary }}
                />
              </div>
              <div className="flex-1 overflow-y-auto p-1.5 flex flex-col gap-1">
                {hits !== null ? (
                  hits.length === 0 ? (
                    <div className="text-center py-10 text-[11px]" style={{ color: themeConfig.textMuted }}>No matches.</div>
                  ) : (
                    <>
                      <div className="px-1.5 py-1 text-[10px]" style={{ color: themeConfig.textMuted }}>
                        {hits.length}{hits.length >= 200 ? '+' : ''} matches
                      </div>
                      {hits.map((h) => (
                        <button
                          key={`${h.sessionId}-${h.index}`}
                          type="button"
                          onClick={() => openTranscript(sessions?.find((x) => x.id === h.sessionId) || { id: h.sessionId, file: h.file, title: h.title, modifiedAt: 0, sizeBytes: 0, formattedSize: '', dateStr: '' }, h.index)}
                          className="w-full text-left px-2 py-1.5 rounded border transition-colors"
                          style={{
                            backgroundColor: openSession?.id === h.sessionId && focusMsg === h.index ? themeConfig.bgTabActive : 'transparent',
                            borderColor: themeConfig.border
                          }}
                        >
                          <div className="text-[10px] truncate" style={{ color: themeConfig.textMuted }}>
                            {h.role === 'user' ? 'You' : agent.name} · {h.time ? new Date(h.time).toLocaleString() : ''} · {h.title}
                          </div>
                          <div className="text-[11px] mt-0.5 line-clamp-2" style={{ color: themeConfig.textPrimary }}>
                            <Highlight text={h.snippet} query={histQuery} color={themeConfig.accent} />
                          </div>
                        </button>
                      ))}
                    </>
                  )
                ) : sessions === null ? (
                  <div className="text-center py-10 text-[11px]" style={{ color: themeConfig.textMuted }}>Loading sessions...</div>
                ) : sessions.length === 0 ? (
                  <div className="text-center py-10 text-[11px]" style={{ color: themeConfig.textMuted }}>No saved sessions for this project yet.</div>
                ) : (
                  sessions.map((sess) => (
                    <button
                      key={sess.id}
                      type="button"
                      onClick={() => openTranscript(sess)}
                      title={sess.title}
                      className="w-full text-left px-2 py-1.5 rounded border transition-colors"
                      style={{ backgroundColor: openSession?.id === sess.id ? themeConfig.bgTabActive : 'transparent', borderColor: themeConfig.border }}
                    >
                      <div className="text-[11px] truncate" style={{ color: themeConfig.textPrimary }}>{sess.title}</div>
                      <div className="text-[10px] mt-0.5" style={{ color: themeConfig.textMuted }}>
                        {sess.dateStr} · {sess.formattedSize}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Transcript */}
            <div className="flex-1 flex flex-col min-w-0">
              {!openSession ? (
                <div className="flex-1 flex items-center justify-center text-[11px] p-8 text-center" style={{ color: themeConfig.textMuted }}>
                  Pick a conversation to read it, or search across all of them. {agent.name} saves every conversation in this project.
                </div>
              ) : (
                <>
                  <div className="px-4 py-2 border-b flex items-center gap-3" style={{ backgroundColor: themeConfig.bgHeader, borderColor: themeConfig.border }}>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs truncate font-bold" style={{ color: themeConfig.textPrimary }}>{openSession.title}</div>
                      <div className="text-[10px]" style={{ color: themeConfig.textMuted }}>
                        {transcript?.[0]?.time ? new Date(transcript[0].time).toLocaleString() : openSession.dateStr} · {transcript?.length ?? '…'} messages · {openSession.id.slice(0, 8)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleResumeSession(openSession.id)}
                      title={`Reopen this conversation in ${agent.name}`}
                      className="px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 flex-shrink-0 text-white"
                      style={{ backgroundColor: themeConfig.accent }}
                    >
                      <RotateCcw className="w-3 h-3" />
                      Resume
                    </button>
                  </div>
                  <div ref={transcriptRef} className="flex-1 overflow-y-auto p-4 select-text">
                    {transcript === null ? (
                      <div className="text-center py-10 text-[11px]" style={{ color: themeConfig.textMuted }}>Loading…</div>
                    ) : transcript.length === 0 ? (
                      <div className="text-center py-10 text-[11px]" style={{ color: themeConfig.textMuted }}>This conversation has no text messages.</div>
                    ) : (
                      <div className="max-w-3xl mx-auto flex flex-col gap-3">
                        {transcript.map((m, i) => (
                          <div
                            key={i}
                            data-msg={i}
                            className="rounded-lg border px-3 py-2"
                            style={{
                              backgroundColor: m.role === 'user' ? themeConfig.accentBg : themeConfig.bgCard,
                              borderColor: focusMsg === i ? themeConfig.accent : themeConfig.border
                            }}
                          >
                            <div className="text-[10px] mb-1 font-bold" style={{ color: m.role === 'user' ? themeConfig.accent : themeConfig.textMuted }}>
                              {m.role === 'user' ? 'You' : agent.name}
                              <span className="font-normal ml-2">{m.time ? new Date(m.time).toLocaleString() : ''}</span>
                            </div>
                            <div className="text-xs whitespace-pre-wrap break-words leading-relaxed" style={{ color: themeConfig.textPrimary }}>
                              <Highlight text={m.text} query={histQuery} color={themeConfig.accent} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {viewMode === 'files' && (
          <div className="flex-1 flex overflow-hidden">
            {/* File List Sidebar */}
            <div
              className="w-64 border-r flex flex-col flex-shrink-0"
              style={{
                backgroundColor: themeConfig.bgCard,
                borderColor: themeConfig.border
              }}
            >
              <div
                className="p-2 border-b flex items-center gap-1.5"
                style={{
                  backgroundColor: themeConfig.bgHeader,
                  borderColor: themeConfig.border
                }}
              >
                <Search className="w-3 h-3 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Filter files..."
                  value={fileSearch}
                  onChange={(e) => setFileSearch(e.target.value)}
                  className="w-full bg-transparent text-[11px] outline-none"
                  style={{ color: themeConfig.textPrimary }}
                />
              </div>

              <div className="flex-1 overflow-y-auto p-1 divide-y" style={{ borderColor: themeConfig.border }}>
                {isLoadingFiles ? (
                  <div className="p-4 text-center text-[11px]" style={{ color: themeConfig.textMuted }}>
                    Scanning directory...
                  </div>
                ) : (currentDir !== project.path && (
                  <div
                    onClick={() => setCurrentDir(currentDir.replace(/[\\/][^\\/]+[\\/]?$/, '') || project.path)}
                    title={currentDir}
                    className="px-2 py-1.5 rounded flex items-center gap-2 cursor-pointer text-[11px]"
                    style={{ color: themeConfig.textSecondary }}
                  >
                    <Folder className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                    <span>..</span>
                  </div>
                ))}
                {isLoadingFiles ? null : filteredFiles.length === 0 ? (
                  <div className="p-4 text-center text-[11px]" style={{ color: themeConfig.textMuted }}>
                    No files found
                  </div>
                ) : (
                  filteredFiles.map((file) => {
                    const isSelected = selectedFile?.path === file.path;
                    return (
                      <div
                        key={file.path}
                        onClick={() => loadFilePreview(file)}
                        className="px-2 py-1.5 rounded flex items-center gap-2 cursor-pointer transition-colors text-[11px]"
                        style={{
                          backgroundColor: isSelected ? themeConfig.bgTabActive : 'transparent',
                          color: isSelected ? themeConfig.textPrimary : themeConfig.textSecondary
                        }}
                      >
                        {file.isDirectory ? (
                          <Folder className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                        ) : file.name.endsWith('.ts') || file.name.endsWith('.tsx') || file.name.endsWith('.js') ? (
                          <FileCode className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                        ) : file.name.endsWith('.json') ? (
                          <FileJson className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                        ) : (
                          <FileIcon className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                        )}
                        <span className="truncate flex-1">{file.name}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* File Preview Content */}
            <div className="flex-1 flex flex-col overflow-hidden" style={{ backgroundColor: themeConfig.bgMain }}>
              {selectedFile ? (
                <>
                  <div
                    className="h-9 px-4 border-b flex items-center justify-between text-xs"
                    style={{
                      backgroundColor: themeConfig.bgHeader,
                      borderColor: themeConfig.border
                    }}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="font-bold" style={{ color: themeConfig.textPrimary }}>{selectedFile.name}</span>
                      <span className="text-[10px]" style={{ color: themeConfig.textMuted }}>{selectedFile.path}</span>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => {
                          playClickSound();
                          navigator.clipboard.writeText(selectedContent);
                          setCopiedFile(true);
                          setTimeout(() => setCopiedFile(false), 1500);
                        }}
                        className="px-2 py-0.5 rounded text-[10px] border flex items-center gap-1"
                        style={{
                          backgroundColor: themeConfig.bgTabActive,
                          borderColor: themeConfig.border,
                          color: themeConfig.textSecondary
                        }}
                      >
                        {copiedFile ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedFile ? 'Copied' : 'Copy'}</span>
                      </button>

                      <button
                        onClick={() => onOpenEditor(selectedFile.path)}
                        className="px-2 py-0.5 rounded text-[10px] border flex items-center gap-1"
                        style={{
                          backgroundColor: themeConfig.bgTabActive,
                          borderColor: themeConfig.border,
                          color: themeConfig.textSecondary
                        }}
                      >
                        <Code2 className="w-3 h-3" />
                        <span>Open Editor</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-auto p-4 text-xs font-mono select-text leading-relaxed">
                    {isLoadingContent ? (
                      <div className="text-center py-10" style={{ color: themeConfig.textMuted }}>Reading file...</div>
                    ) : (
                      <pre className="whitespace-pre-wrap">{selectedContent}</pre>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-xs" style={{ color: themeConfig.textMuted }}>
                  Select a file on the left to preview
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Marks every case-insensitive occurrence of query in text.
const Highlight: React.FC<{ text: string; query: string; color: string }> = ({ text, query, color }) => {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? <mark key={i} style={{ backgroundColor: color, color: '#fff', borderRadius: 2 }}>{part}</mark> : part
      )}
    </>
  );
};
