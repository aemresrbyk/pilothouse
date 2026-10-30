import React, { useState } from 'react';
import { X, FolderPlus, FolderSearch, Plus } from 'lucide-react';

interface AddProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddProject: (folderPath: string) => void;
}

export const AddProjectModal: React.FC<AddProjectModalProps> = ({
  isOpen,
  onClose,
  onAddProject
}) => {
  const [manualPath, setManualPath] = useState('');
  const [isPicking, setIsPicking] = useState(false);

  if (!isOpen) return null;

  const handlePickFolder = async () => {
    setIsPicking(true);
    try {
      const picked = await window.electronAPI.pickDirectory();
      if (picked) {
        onAddProject(picked);
        onClose();
      }
    } finally {
      setIsPicking(false);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualPath.trim()) {
      onAddProject(manualPath.trim());
      setManualPath('');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#12151d] border border-[#2b3348] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#212738] bg-[#161a24]">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-[#cc6b49]/15 text-[#f29472] rounded-lg">
              <FolderPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">Add Project</h3>
              <p className="text-[11px] text-zinc-400">
                Register a new project for Claude Code
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-[#232938] rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Quick Browse button */}
          <div>
            <button
              onClick={handlePickFolder}
              disabled={isPicking}
              className="w-full flex items-center justify-center gap-2 bg-[#1a1f2c] hover:bg-[#242b3d] border border-[#2e374f] hover:border-[#cc6b49] py-3 px-4 rounded-xl text-zinc-200 text-xs font-medium transition-all group shadow-sm"
            >
              <FolderSearch className="w-4 h-4 text-[#cc6b49] group-hover:scale-110 transition-transform" />
              <span>Browse Folder on Computer...</span>
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-[#232938]"></div>
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">
              Or enter path
            </span>
            <div className="flex-1 h-px bg-[#232938]"></div>
          </div>

          {/* Manual input */}
          <form onSubmit={handleManualSubmit} className="space-y-3">
            <div>
              <input
                type="text"
                placeholder="/Users/username/Desktop/my-project"
                value={manualPath}
                onChange={(e) => setManualPath(e.target.value)}
                className="w-full bg-[#151924] border border-[#262c3e] focus:border-[#cc6b49] text-xs font-mono text-zinc-200 placeholder-zinc-600 rounded-lg px-3 py-2 outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="text-xs text-zinc-400 hover:text-zinc-200 px-3 py-1.5 rounded-lg hover:bg-[#202534] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!manualPath.trim()}
                className="flex items-center gap-1.5 bg-gradient-to-r from-[#cc6b49] to-[#d97706] disabled:opacity-40 text-white text-xs font-medium px-4 py-1.5 rounded-lg shadow-sm transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
