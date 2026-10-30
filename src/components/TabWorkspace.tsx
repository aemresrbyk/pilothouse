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
  Trash2
} from 'lucide-react';
import { ProjectItem, TabSession, ProjectFlags, FileItem } from '../types';
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
}

export const TabWorkspace: React.FC<TabWorkspaceProps> = ({
  project,
  tabSession,
  onUpdateFlags,
  onOpenFolder,
  onOpenEditor,
  themeConfig,
  isActive
}) => {
  const [viewMode, setViewMode] = useState<'terminal' | 'claude-md' | 'files'>('terminal');
  const [customInput, setCustomInput] = useState<string>(tabSession.customInput || '');
  const [termSessionKey, setTermSessionKey] = useState<number>(1);
  const [copiedPath, setCopiedPath] = useState(false);

  // CLAUDE.md state
  const [claudeMdContent, setClaudeMdContent] = useState<string>('');
  const [isLoadingMd, setIsLoadingMd] = useState(false);
  const [copiedMd, setCopiedMd] = useState(false);

  // Files state
  const [files, setFiles] = useState<FileItem[]>([]);
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

  // Compile full command for Claude
  const fullCommand = useMemo(() => {
    const parts = ['claude'];
    if (flags.dangerouslySkipPermissions) parts.push('--dangerously-skip-permissions');
    if (flags.continueLast) parts.push('--continue');
    if (flags.chrome) parts.push('--chrome');
    if (flags.verbose) parts.push('--verbose');
    if (flags.bare) parts.push('--bare');
    if (customInput.trim()) {
      parts.push(customInput.trim());
    }
    return parts.join(' ');
  }, [flags, customInput]);

  const toggleFlag = (key: keyof ProjectFlags) => {
    const nextVal = !flags[key];
    playToggleSound(nextVal);
    onUpdateFlags(project.id, {
      ...flags,
      [key]: nextVal
    });
  };

  const handleRestartClaude = () => {
    playLaunchSound();
    setViewMode('terminal');
    window.electronAPI.ptyWrite(tabSession.id, `${fullCommand}\r`);
  };

  const handleResetSession = () => {
    playClickSound();
    setViewMode('terminal');
    setTermSessionKey((k) => k + 1);
  };

  const handleSendInterrupt = () => {
    playClickSound();
    window.electronAPI.ptyWrite(tabSession.id, '\x03');
  };

  const handleClearTerminal = () => {
    playClickSound();
    window.electronAPI.ptyWrite(tabSession.id, 'clear\r');
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
      setIsLoadingMd(true);
      window.electronAPI.readFile(`${project.path}/CLAUDE.md`)
        .then((res) => setClaudeMdContent(res.content))
        .catch(() => setClaudeMdContent('// No CLAUDE.md found. Run /init in Claude Code to generate one.'))
        .finally(() => setIsLoadingMd(false));
    }

    if (viewMode === 'files' && files.length === 0) {
      setIsLoadingFiles(true);
      window.electronAPI.listFiles(project.path)
        .then((items) => {
          setFiles(items);
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
  }, [viewMode, project.path]);

  const loadFilePreview = async (item: FileItem) => {
    if (item.isDirectory) return;
    setSelectedFile(item);
    setIsLoadingContent(true);
    try {
      const res = await window.electronAPI.readFile(item.path);
      setSelectedContent(res.content);
    } catch (err: any) {
      setSelectedContent(`// Error reading file: ${err.message}`);
    } finally {
      setIsLoadingContent(false);
    }
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
    <div
      className="flex-1 flex flex-col overflow-hidden font-mono"
      style={{ backgroundColor: themeConfig.bgMain }}
    >
      {/* 1. Slim, Sleek Control Bar (No AI-slop, clean and functional) */}
      <div
        className="px-3 py-1.5 flex items-center justify-between text-xs border-b gap-2 flex-wrap select-none"
        style={{
          backgroundColor: themeConfig.bgHeader,
          borderColor: themeConfig.border
        }}
      >
        {/* Left: Project Path & Git Branch */}
        <div className="flex items-center gap-2 min-w-0">
          <div
            onClick={handleCopyPath}
            title="Click to copy path"
            className="flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer transition-colors text-[11px] max-w-xs truncate"
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

          {project.gitInfo?.isGit && (
            <div
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]"
              style={{
                backgroundColor: themeConfig.bgTabActive,
                color: themeConfig.textMuted
              }}
            >
              <GitBranch className="w-3 h-3" />
              <span>{project.gitInfo.branch || 'git'}</span>
            </div>
          )}
        </div>

        {/* Center: Essential Flags & Quick Omnibar */}
        <div className="flex items-center gap-1.5 flex-1 max-w-xl min-w-0 justify-center">
          {/* --dangerously-skip-permissions pill */}
          <button
            type="button"
            onClick={() => toggleFlag('dangerouslySkipPermissions')}
            title="Bypass tool & permission prompts"
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
              placeholder="Custom flags or prompt (e.g. -p 'fix bug')..."
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

        {/* Right: View Switcher & Actions */}
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
          </div>

          {/* Action: Run / Restart Claude */}
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

      {/* 2. Workspace Body: The Embedded Terminal Canvas! */}
      <div className="relative flex-1 w-full h-full min-h-0 min-w-0 overflow-hidden">
        {/* Terminal Canvas (Always alive in DOM so process/output isn't lost!) */}
        <div
          className="absolute inset-0 w-full h-full"
          style={{ display: viewMode === 'terminal' ? 'block' : 'none' }}
        >
          <EmbeddedTerminal
            key={`term-${tabSession.id}-${termSessionKey}`}
            tabId={tabSession.id}
            projectPath={project.path}
            initialCommand={fullCommand}
            theme={themeConfig}
            isActive={isActive && viewMode === 'terminal'}
          />
        </div>

        {/* CLAUDE.md Reader View */}
        {viewMode === 'claude-md' && (
          <div className="flex-1 flex flex-col overflow-hidden p-4 max-w-4xl w-full mx-auto">
            <div
              className="p-3 border rounded-xl flex items-center justify-between text-xs mb-3"
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
                <button
                  onClick={() => {
                    playClickSound();
                    navigator.clipboard.writeText(claudeMdContent);
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
                  <span>Edit in VS Code</span>
                </button>
              </div>
            </div>

            <div
              className="flex-1 overflow-auto p-4 rounded-xl border text-xs select-text font-mono leading-relaxed"
              style={{
                backgroundColor: themeConfig.bgCard,
                borderColor: themeConfig.border,
                color: themeConfig.textPrimary
              }}
            >
              {isLoadingMd ? (
                <div className="text-center py-10" style={{ color: themeConfig.textMuted }}>Loading CLAUDE.md...</div>
              ) : (
                <pre className="whitespace-pre-wrap">{claudeMdContent}</pre>
              )}
            </div>
          </div>
        )}

        {/* Files Explorer & Code Viewer View */}
        {viewMode === 'files' && (
          <div className="flex-1 flex overflow-hidden border-t" style={{ borderColor: themeConfig.border }}>
            {/* File List Column */}
            <div
              className="w-72 border-r flex flex-col flex-shrink-0"
              style={{
                backgroundColor: themeConfig.bgHeader,
                borderColor: themeConfig.border
              }}
            >
              <div className="p-2 border-b flex items-center gap-2" style={{ borderColor: themeConfig.border }}>
                <Search className="w-3.5 h-3.5" style={{ color: themeConfig.textMuted }} />
                <input
                  type="text"
                  placeholder="Filter files..."
                  value={fileSearch}
                  onChange={(e) => setFileSearch(e.target.value)}
                  className="w-full bg-transparent text-xs outline-none"
                  style={{ color: themeConfig.textPrimary }}
                />
              </div>

              <div className="flex-1 overflow-y-auto p-1 divide-y" style={{ borderColor: themeConfig.border }}>
                {isLoadingFiles ? (
                  <div className="text-center py-8 text-xs" style={{ color: themeConfig.textMuted }}>Loading files...</div>
                ) : filteredFiles.map((f) => {
                  const isSelected = selectedFile?.path === f.path;
                  return (
                    <div
                      key={f.path}
                      onClick={() => {
                        playClickSound();
                        loadFilePreview(f);
                      }}
                      className="px-2 py-1.5 rounded cursor-pointer text-xs flex items-center justify-between transition-colors"
                      style={{
                        backgroundColor: isSelected ? themeConfig.bgTabActive : 'transparent',
                        color: isSelected ? themeConfig.textPrimary : themeConfig.textSecondary
                      }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {getFileIcon(f)}
                        <span className="truncate">{f.name}</span>
                      </div>
                      {f.size !== undefined && (
                        <span className="text-[9px] ml-1 opacity-50">
                          {f.size > 1024 ? `${Math.round(f.size / 1024)}k` : `${f.size}b`}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* File Preview Column */}
            <div className="flex-1 flex flex-col overflow-hidden" style={{ backgroundColor: themeConfig.bgMain }}>
              {selectedFile ? (
                <>
                  <div
                    className="px-4 py-2 border-b flex items-center justify-between text-xs"
                    style={{
                      backgroundColor: themeConfig.bgHeader,
                      borderColor: themeConfig.border
                    }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {getFileIcon(selectedFile)}
                      <span className="font-bold truncate" style={{ color: themeConfig.textPrimary }}>
                        {selectedFile.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          playClickSound();
                          navigator.clipboard.writeText(selectedContent);
                          setCopiedFile(true);
                          setTimeout(() => setCopiedFile(false), 1500);
                        }}
                        className="px-2 py-1 rounded text-[11px] border flex items-center gap-1"
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
                        onClick={() => onOpenEditor(project.path)}
                        className="px-2 py-1 rounded text-[11px] border flex items-center gap-1"
                        style={{
                          backgroundColor: themeConfig.bgTabActive,
                          borderColor: themeConfig.border,
                          color: themeConfig.textSecondary
                        }}
                      >
                        <Code2 className="w-3 h-3" />
                        <span>Open in VS Code</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-auto p-4 text-xs select-text font-mono leading-relaxed">
                    {isLoadingContent ? (
                      <div className="text-center py-10" style={{ color: themeConfig.textMuted }}>Loading file...</div>
                    ) : (
                      <pre className="whitespace-pre-wrap" style={{ color: themeConfig.textPrimary }}>
                        {selectedContent}
                      </pre>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-xs" style={{ color: themeConfig.textMuted }}>
                  Select a file from the left to inspect
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
