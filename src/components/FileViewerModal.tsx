import React, { useState, useEffect } from 'react';
import {
  X,
  Folder,
  File,
  FolderOpen,
  Code2,
  Copy,
  Check,
  FileCode,
  FileJson,
  FileText
} from 'lucide-react';
import { ProjectItem, FileItem } from '../types';

interface FileViewerModalProps {
  project: ProjectItem | null;
  onClose: () => void;
  onOpenFolder: (path: string) => void;
  onOpenEditor: (path: string) => void;
}

export const FileViewerModal: React.FC<FileViewerModalProps> = ({
  project,
  onClose,
  onOpenFolder,
  onOpenEditor
}) => {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [isTruncated, setIsTruncated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (project) {
      loadFiles(project.path);
    }
  }, [project]);

  const loadFiles = async (dirPath: string) => {
    setIsLoading(true);
    try {
      const items = await window.electronAPI.listFiles(dirPath);
      setFiles(items);
      
      // Auto select CLAUDE.md or first text file if available
      const claudeMd = items.find(
        (f) => f.name.toLowerCase() === 'claude.md'
      );
      if (claudeMd) {
        handleSelectFile(claudeMd);
      } else if (items.length > 0 && !items[0].isDirectory) {
        handleSelectFile(items[0]);
      } else {
        setSelectedFile(null);
        setFileContent('');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectFile = async (item: FileItem) => {
    if (item.isDirectory) return;
    setSelectedFile(item);
    try {
      const result = await window.electronAPI.readFile(item.path);
      setFileContent(result.content);
      setIsTruncated(result.truncated);
    } catch (err: any) {
      setFileContent(`Error reading file: ${err.message}`);
    }
  };

  const handleCopyContent = () => {
    navigator.clipboard.writeText(fileContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!project) return null;

  const getFileIcon = (file: FileItem) => {
    if (file.isDirectory) return <Folder className="w-4 h-4 text-amber-400 flex-shrink-0" />;
    if (file.name.toLowerCase() === 'claude.md') return <FileText className="w-4 h-4 text-[#cc6b49] flex-shrink-0" />;
    if (file.extension === '.json') return <FileJson className="w-4 h-4 text-emerald-400 flex-shrink-0" />;
    if (['.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go'].includes(file.extension || '')) {
      return <FileCode className="w-4 h-4 text-sky-400 flex-shrink-0" />;
    }
    return <File className="w-4 h-4 text-zinc-400 flex-shrink-0" />;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#12151d] border border-[#2b3348] rounded-2xl w-full max-w-4xl h-[80vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#212738] bg-[#161a24]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#cc6b49]/15 text-[#f29472] rounded-lg">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <span>{project.name}</span>
                <span className="text-[11px] font-mono text-zinc-400 font-normal">
                  ({files.length} items)
                </span>
              </h3>
              <p className="text-[11px] font-mono text-zinc-500 truncate max-w-md">
                {project.path}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onOpenEditor(project.path)}
              className="flex items-center gap-1.5 text-xs text-zinc-300 hover:text-white bg-[#202534] hover:bg-[#2b3246] px-2.5 py-1.5 rounded-lg border border-[#30384d] transition-colors"
              title="Open in VS Code"
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>Open Editor</span>
            </button>
            <button
              onClick={() => onOpenFolder(project.path)}
              className="flex items-center gap-1.5 text-xs text-zinc-300 hover:text-white bg-[#202534] hover:bg-[#2b3246] px-2.5 py-1.5 rounded-lg border border-[#30384d] transition-colors"
              title="Open in Finder"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>Finder</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-[#232938] rounded-lg transition-colors ml-2"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Two-Pane Body */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: File Tree */}
          <div className="w-64 border-r border-[#212738] bg-[#0f1118] overflow-y-auto p-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 px-2 py-1 mb-1">
              Project Files
            </div>
            {isLoading ? (
              <div className="p-4 text-xs text-zinc-500 text-center">Loading files...</div>
            ) : files.length === 0 ? (
              <div className="p-4 text-xs text-zinc-500 text-center">No files found</div>
            ) : (
              <div className="space-y-0.5">
                {files.map((item) => (
                  <button
                    key={item.path}
                    onClick={() => handleSelectFile(item)}
                    disabled={item.isDirectory}
                    className={`w-full text-left px-2 py-1.5 rounded-md text-xs flex items-center gap-2 transition-colors ${
                      item.isDirectory
                        ? 'opacity-70 cursor-default'
                        : selectedFile?.path === item.path
                        ? 'bg-[#cc6b49]/20 text-[#f29472] font-medium'
                        : 'text-zinc-300 hover:bg-[#1a1f2b]'
                    }`}
                  >
                    {getFileIcon(item)}
                    <span className="truncate">{item.name}</span>
                    {item.size !== undefined && (
                      <span className="text-[10px] text-zinc-600 ml-auto flex-shrink-0">
                        {Math.round(item.size / 1024)}k
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: Content Preview */}
          <div className="flex-1 flex flex-col bg-[#0b0c11] overflow-hidden">
            {selectedFile ? (
              <>
                <div className="flex items-center justify-between px-4 py-2 border-b border-[#212738] bg-[#141721]">
                  <div className="flex items-center gap-2">
                    {getFileIcon(selectedFile)}
                    <span className="text-xs font-mono font-medium text-zinc-200">
                      {selectedFile.name}
                    </span>
                    {isTruncated && (
                      <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded">
                        Preview truncated
                      </span>
                    )}
                  </div>
                  <button
                    onClick={handleCopyContent}
                    className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 px-2 py-1 rounded bg-[#1e2331] hover:bg-[#282f42] transition-colors"
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
                </div>
                <div className="flex-1 overflow-auto p-4">
                  <pre className="text-xs font-mono text-zinc-300 whitespace-pre-wrap leading-relaxed select-text">
                    {fileContent}
                  </pre>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-zinc-500 text-xs">
                Select a file to preview its content
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

