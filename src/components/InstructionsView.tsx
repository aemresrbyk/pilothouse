import React, { useState, useEffect } from 'react';
import { Check, Code2, Copy, Edit3, Eye, FileText, Save, Sparkles } from 'lucide-react';
import { ProjectItem, AgentProfile } from '../types';
import { ThemeConfig } from '../theme';
import { playClickSound } from '../utils/audio';

// The agent's instructions file (CLAUDE.md, AGENTS.md, GEMINI.md …): view, edit, or start one from a template.
// Always mounted (hidden when another tab is shown); the parent remounts it (key = agent) when the agent changes.
export const InstructionsView: React.FC<{ project: ProjectItem; themeConfig: ThemeConfig; agent: AgentProfile; visible: boolean; onExecute: (cmd: string) => void; onOpenEditor: (path: string) => void }> = ({ project, themeConfig, agent, visible, onExecute, onOpenEditor }) => {
  const mdFile = agent.instructionsFile;
  const [claudeMdContent, setClaudeMdContent] = useState<string>('');
  const [isEditingMd, setIsEditingMd] = useState(false);
  const [editedMdContent, setEditedMdContent] = useState<string>('');
  const [isLoadingMd, setIsLoadingMd] = useState(false);
  const [isSavingMd, setIsSavingMd] = useState(false);
  const [copiedMd, setCopiedMd] = useState(false);
  const [mdSavedToast, setMdSavedToast] = useState(false);
  const [mdSaveError, setMdSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (visible && !claudeMdContent) loadClaudeMd();
  }, [visible]);

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

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-4 max-w-4xl w-full mx-auto" style={{ display: visible ? undefined : 'none' }}>
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
              className="px-2.5 py-1 rounded flex items-center gap-1 text-[11px] font-bold shadow-sm"
              style={{ backgroundColor: themeConfig.accent, color: themeConfig.accentText }}
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
                className="px-4 py-2 rounded-lg text-xs font-bold shadow-md flex items-center gap-1.5 transition-all active:scale-95"
                style={{ backgroundColor: themeConfig.accent, color: themeConfig.accentText }}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>✦ Generate Smart {mdFile} Template</span>
              </button>
              <button
                onClick={() => onExecute('/init')}
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
  );
};
