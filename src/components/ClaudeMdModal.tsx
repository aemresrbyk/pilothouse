import React, { useState, useEffect } from 'react';
import { X, FileText, Copy, Check, Code2, FolderOpen } from 'lucide-react';
import { ProjectItem } from '../types';

interface ClaudeMdModalProps {
  project: ProjectItem | null;
  onClose: () => void;
  onOpenEditor: (path: string) => void;
}

export const ClaudeMdModal: React.FC<ClaudeMdModalProps> = ({
  project,
  onClose,
  onOpenEditor
}) => {
  const [content, setContent] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!project) return;
    const loadClaudeMd = async () => {
      setIsLoading(true);
      try {
        const mdPath = `${project.path}/CLAUDE.md`;
        const res = await window.electronAPI.readFile(mdPath);
        setContent(res.content);
      } catch (err: any) {
        setContent(`Could not load CLAUDE.md: ${err.message}`);
      } finally {
        setIsLoading(false);
      }
    };
    loadClaudeMd();
  }, [project]);

  if (!project) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#12151d] border border-[#2b3348] rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#212738] bg-[#161a24]">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-[#cc6b49]/15 text-[#f29472] rounded-lg">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <span>CLAUDE.md</span>
                <span className="text-[10px] bg-[#cc6b49]/20 text-[#f29472] px-1.5 py-0.5 rounded font-mono">
                  {project.name}
                </span>
              </h3>
              <p className="text-[11px] text-zinc-400">
                Instructions and project context for Claude Code
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 text-xs text-zinc-300 hover:text-white bg-[#202534] hover:bg-[#2b3246] px-2.5 py-1.5 rounded-lg border border-[#30384d] transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </>
              )}
            </button>
            <button
              onClick={() => onOpenEditor(project.path)}
              className="flex items-center gap-1.5 text-xs text-zinc-300 hover:text-white bg-[#202534] hover:bg-[#2b3246] px-2.5 py-1.5 rounded-lg border border-[#30384d] transition-colors"
              title="Edit in VS Code"
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>Edit</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-[#232938] rounded-lg transition-colors ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-5 bg-[#0b0c11]">
          {isLoading ? (
            <div className="text-xs text-zinc-500 text-center py-10">Loading CLAUDE.md...</div>
          ) : (
            <pre className="text-xs font-mono text-zinc-200 whitespace-pre-wrap leading-relaxed select-text font-normal">
              {content}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
};

