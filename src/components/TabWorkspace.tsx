import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  History
} from 'lucide-react';
import { ProjectItem, TabSession, ProjectFlags, FileItem, ClaudeSession } from '../types';
import { ThemeConfig } from '../theme';
import { EmbeddedTerminal } from './EmbeddedTerminal';
import { playClickSound, playToggleSound, playLaunchSound } from '../utils/audio';

interface TabWorkspaceProps {
  project: ProjectItem;
  tabSession: TabSession;
  onUpdateFlags: (projectId: string, flags: ProjectFlags) => void;
  onOpenFolder: (path: string) => void;
  onOpenEditor: (path: string, editor?: string) => void;
  themeConfig: ThemeConfig;
  isActive: boolean;
  claudePath: string;
}

export const TabWorkspace: React.FC<TabWorkspaceProps> = ({
  project,
  tabSession,
  onUpdateFlags,
  onOpenFolder,
  onOpenEditor,
  themeConfig,
  isActive,
  claudePath
}) => {
  const [viewMode, setViewMode] = useState<'terminal' | 'claude-md' | 'files' | 'history'>('terminal');
  // Command the next terminal (re)mount runs; null = the normal fullCommand.
  const [launchCommand, setLaunchCommand] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ClaudeSession[] | null>(null);
  const [customInput, setCustomInput] = useState<string>(tabSession.customInput || '');
  const [termSessionKey, setTermSessionKey] = useState<number>(1);
  const [copiedPath, setCopiedPath] = useState(false);

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

  const flags = project.flags || {
    dangerouslySkipPermissions: true,
    continueLast: false,
    chrome: false,
    verbose: false,
    bare: false
  };

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

  // Compile full command for Claude; with resumeId it reopens that session instead of --continue / the input bar.
  const buildCommand = (resumeId?: string) => {
    const parts = [/\s/.test(claudePath) ? `"${claudePath}"` : claudePath];
    if (flags.dangerouslySkipPermissions) parts.push('--dangerously-skip-permissions');
    if (flags.continueLast && !resumeId) parts.push('--continue');
    if (flags.chrome) parts.push('--chrome');
    if (flags.verbose) parts.push('--verbose');
    if (flags.bare) parts.push('--bare');
    if (resumeId) {
      parts.push('--resume', resumeId);
    } else if (customInput.trim()) {
      parts.push(customInput.trim());
    }
    return parts.join(' ');
  };
  const fullCommand = useMemo(() => buildCommand(), [flags, customInput, claudePath]);

  const toggleFlag = (key: keyof ProjectFlags) => {
    const nextVal = !flags[key];
    playToggleSound(nextVal);
    onUpdateFlags(project.id, {
      ...flags,
      [key]: nextVal
    });
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

    if (viewMode === 'history') {
      setSessions(null);
      window.electronAPI.getSessions(project.path).then(setSessions).catch(() => setSessions([]));
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

  const loadClaudeMd = () => {
    setIsLoadingMd(true);
    window.electronAPI.readFile(`${project.path}/CLAUDE.md`)
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
      const res = await window.electronAPI.saveFile(`${project.path}/CLAUDE.md`, editedMdContent);
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
    const template = `# CLAUDE.md - ${project.name} Guidelines

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
  const quickActions = [
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
              title={`Git Branch: ${gitStatus.branch}${gitStatus.modifiedCount > 0 ? ` (${gitStatus.modifiedCount} modified files). Click to review with Claude!` : ''}`}
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
        </div>

        {/* Center: Essential Flags & Quick Omnibar */}
        <div className="flex items-center gap-1.5 flex-1 max-w-xl min-w-0 justify-center">
          {/* --dangerously-skip-permissions pill */}
          <button
            type="button"
            onClick={() => toggleFlag('dangerouslySkipPermissions')}
            title="Bypass tool & permission prompts (Zero interruption)"
            className="px-2 py-1 rounded text-[11px] font-medium transition-all flex items-center gap-1.5 border flex-shrink-0"
            style={{
              backgroundColor: flags.dangerouslySkipPermissions ? themeConfig.accentBg : 'transparent',
              borderColor: flags.dangerouslySkipPermissions ? themeConfig.accent : themeConfig.border,
              color: flags.dangerouslySkipPermissions ? themeConfig.accent : themeConfig.textMuted
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: flags.dangerouslySkipPermissions ? themeConfig.accent : themeConfig.textMuted }}
            />
            <span className="hidden sm:inline">--dangerously-skip-permissions</span>
            <span className="sm:hidden">--skip-perm</span>
          </button>

          {/* --continue pill */}
          <button
            type="button"
            onClick={() => toggleFlag('continueLast')}
            title="Resume latest conversation (-c)"
            className="px-2 py-1 rounded text-[11px] font-medium transition-all border flex-shrink-0"
            style={{
              backgroundColor: flags.continueLast ? themeConfig.accentBg : 'transparent',
              borderColor: flags.continueLast ? themeConfig.accent : themeConfig.border,
              color: flags.continueLast ? themeConfig.accent : themeConfig.textMuted
            }}
          >
            --continue
          </button>

          {/* Omnibar Input Field for Extra Flags / Prompt */}
          <div className="flex-1 relative min-w-[120px] flex items-center">
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
              <span>CLAUDE.md</span>
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

            <button
              onClick={() => {
                playClickSound();
                setViewMode('history');
              }}
              title="Previous Claude sessions in this project"
              className="px-2 py-0.5 rounded text-[10px] font-medium transition-colors flex items-center gap-1"
              style={{
                backgroundColor: viewMode === 'history' ? themeConfig.bgTabActive : 'transparent',
                color: viewMode === 'history' ? themeConfig.textPrimary : themeConfig.textMuted
              }}
            >
              <History className="w-3 h-3" />
              <span>History</span>
            </button>
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

          {/* Action: Interrupt ^C */}
          <button
            onClick={handleSendInterrupt}
            title="Send SIGINT (^C) to Terminal"
            className="p-1 rounded hover:bg-black/20 transition-colors border"
            style={{
              borderColor: themeConfig.border,
              color: themeConfig.textMuted
            }}
          >
            <Square className="w-3 h-3" />
          </button>

          {/* Action: Clear */}
          <button
            onClick={handleClearTerminal}
            title="Clear terminal screen"
            className="p-1 rounded hover:bg-black/20 transition-colors border"
            style={{
              borderColor: themeConfig.border,
              color: themeConfig.textMuted
            }}
          >
            <Trash2 className="w-3 h-3" />
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

          {/* Action: Open in VS Code */}
          <button
            onClick={() => onOpenEditor(project.path)}
            title="Open in VS Code"
            className="p-1 rounded hover:bg-black/20 transition-colors border"
            style={{
              borderColor: themeConfig.border,
              color: themeConfig.textMuted
            }}
          >
            <Code2 className="w-3 h-3" />
          </button>

          {/* Action: Reveal in Finder */}
          <button
            onClick={() => onOpenFolder(project.path)}
            title="Reveal in Finder"
            className="p-1 rounded hover:bg-black/20 transition-colors border"
            style={{
              borderColor: themeConfig.border,
              color: themeConfig.textMuted
            }}
          >
            <FolderOpen className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* 2. Quick Actions & Slash Commands Strip (Visible in Terminal mode) */}
      {viewMode === 'terminal' && (
        <div
          className="h-7 px-3 flex items-center gap-1.5 overflow-x-auto no-scrollbar border-b text-[10px] flex-shrink-0"
          style={{
            backgroundColor: themeConfig.bgMain,
            borderColor: themeConfig.border
          }}
        >
          <span className="text-[9px] uppercase font-bold tracking-wider mr-1" style={{ color: themeConfig.textMuted }}>
            QUICK ACTIONS:
          </span>

          {quickActions.map((qa) => (
            <button
              key={qa.label}
              type="button"
              onClick={() => handleExecuteCommand(qa.cmd)}
              title={`${qa.desc} (Click to execute in Claude)`}
              className="px-2 py-0.5 rounded flex items-center gap-1 transition-all border flex-shrink-0 hover:opacity-100 opacity-80"
              style={{
                backgroundColor: themeConfig.bgTabActive,
                borderColor: themeConfig.border,
                color: themeConfig.textSecondary
              }}
            >
              <span style={{ color: themeConfig.accent }}>{qa.icon}</span>
              <span className="font-medium">{qa.label}</span>
            </button>
          ))}
        </div>
      )}

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
            initialCommand={launchCommand ?? fullCommand}
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
                <span>CLAUDE.md (Project Context &amp; Instructions)</span>
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
                  Loading CLAUDE.md...
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
                    No CLAUDE.md Found in Project Root
                  </h3>
                  <p className="text-xs mt-1 max-w-md leading-relaxed" style={{ color: themeConfig.textMuted }}>
                    A CLAUDE.md file helps Claude Code understand your architecture, build commands, test patterns, and style guide automatically.
                  </p>
                  <div className="mt-4 flex items-center gap-2">
                    <button
                      onClick={handleGenerateSmartClaudeMd}
                      className="px-4 py-2 rounded-lg text-xs font-bold text-white shadow-md flex items-center gap-1.5 transition-all active:scale-95"
                      style={{ backgroundColor: themeConfig.accent }}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>✦ Generate Smart CLAUDE.md Template</span>
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

        {/* Files Browser View */}
        {viewMode === 'history' && (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="max-w-4xl mx-auto">
              <div className="text-[11px] mb-3" style={{ color: themeConfig.textMuted }}>
                Claude Code saves every conversation for this project. Pick one to reopen it with <code>--resume</code> in this tab.
              </div>
              {sessions === null ? (
                <div className="text-center py-16 text-xs" style={{ color: themeConfig.textMuted }}>Loading sessions...</div>
              ) : sessions.length === 0 ? (
                <div className="text-center py-16 text-xs" style={{ color: themeConfig.textMuted }}>No saved sessions for this project yet.</div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {sessions.map((sess) => (
                    <button
                      key={sess.id}
                      type="button"
                      onClick={() => handleResumeSession(sess.id)}
                      title={`${sess.title}\n\nSession ${sess.id}`}
                      className="group w-full text-left px-3 py-2 rounded-lg border flex items-center gap-3 transition-colors hover:opacity-100"
                      style={{ backgroundColor: themeConfig.bgCard, borderColor: themeConfig.border }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs truncate" style={{ color: themeConfig.textPrimary }}>{sess.title}</div>
                        <div className="text-[10px] mt-0.5" style={{ color: themeConfig.textMuted }}>
                          {sess.dateStr} · {sess.formattedSize} · {sess.id.slice(0, 8)}
                        </div>
                      </div>
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 flex-shrink-0 text-white"
                        style={{ backgroundColor: themeConfig.accent }}
                      >
                        <RotateCcw className="w-3 h-3" />
                        Resume
                      </span>
                    </button>
                  ))}
                </div>
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
