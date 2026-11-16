import React, { useState, useEffect, useMemo } from 'react';
import { Check, Code2, Copy, FileCode, File as FileIcon, FileJson, Folder, Search } from 'lucide-react';
import { ProjectItem, FileItem } from '../types';
import { ThemeConfig } from '../theme';
import { playClickSound } from '../utils/audio';

// The Files tab of a project: browse folders and preview files. Kept mounted once opened (hidden otherwise),
// so the folder and the previewed file survive switching tabs; the list reloads whenever it is shown again.
export const FilesView: React.FC<{ project: ProjectItem; themeConfig: ThemeConfig; visible: boolean; onOpenEditor: (path: string) => void }> = ({ project, themeConfig, visible, onOpenEditor }) => {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [currentDir, setCurrentDir] = useState<string>(project.path);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [fileSearch, setFileSearch] = useState('');
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [selectedContent, setSelectedContent] = useState<string>('');
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [copiedFile, setCopiedFile] = useState(false);

  useEffect(() => {
    if (!visible) return;
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
  }, [visible, currentDir]);

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

  return (
    <div className="flex-1 flex overflow-hidden" style={{ display: visible ? undefined : 'none' }}>
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
              <Folder className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
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
                    <Folder className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                  ) : file.name.endsWith('.ts') || file.name.endsWith('.tsx') || file.name.endsWith('.js') ? (
                    <FileCode className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
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
  );
};
