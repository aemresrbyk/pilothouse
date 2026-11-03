import React, { useState } from 'react';
import { X, FolderPlus, FolderSearch, Plus } from 'lucide-react';
import { playClickSound } from '../utils/audio';

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
    playClickSound();
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
      playClickSound();
      onAddProject(manualPath.trim());
      setManualPath('');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm select-none font-mono">
      <div className="bg-[#0c0e14] border border-[#21283a] rounded-xl w-full max-w-md shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1b2131] bg-[#10131d]">
          <div className="flex items-center gap-2">
            <FolderPlus className="w-4 h-4 text-[#C8FF2E]" />
            <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-wider">
              // REGISTER REPOSITORY
            </h3>
          </div>
          <button
            onClick={() => {
              playClickSound();
              onClose();
            }}
            className="p-1 text-zinc-500 hover:text-zinc-200 hover:bg-[#1a2030] rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          <button
            onClick={handlePickFolder}
            disabled={isPicking}
            className="w-full flex items-center justify-center gap-2 bg-[#121620] hover:bg-[#191f2d] border border-[#212a3d] hover:border-[#C8FF2E]/60 py-3 px-4 rounded-lg text-zinc-200 text-xs font-bold transition-all group shadow-sm active:scale-95"
          >
            <FolderSearch className="w-4 h-4 text-[#C8FF2E] group-hover:scale-110 transition-transform" />
            <span>BROWSE FOLDER ON SYSTEM...</span>
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-[#181f2d]"></div>
            <span className="text-[10px] text-zinc-600 uppercase tracking-widest font-semibold">
              OR DIRECT PATH
            </span>
            <div className="flex-1 h-px bg-[#181f2d]"></div>
          </div>

          <form onSubmit={handleManualSubmit} className="space-y-3">
            <input
              type="text"
              placeholder="/Users/username/Desktop/my-project"
              value={manualPath}
              onChange={(e) => setManualPath(e.target.value)}
              className="w-full bg-[#10131c] border border-[#1b2233] focus:border-[#C8FF2E] text-xs text-zinc-200 placeholder-zinc-700 rounded px-3 py-2 outline-none font-mono"
            />

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  playClickSound();
                  onClose();
                }}
                className="text-xs text-zinc-400 hover:text-zinc-200 px-3 py-1.5 rounded hover:bg-[#1a2030] transition-colors"
              >
                CANCEL
              </button>
              <button
                type="submit"
                disabled={!manualPath.trim()}
                className="flex items-center gap-1.5 bg-\[#C8FF2E\] disabled:opacity-40 text-[#0B0D10] text-xs font-bold px-4 py-1.5 rounded shadow transition-all active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>REGISTER</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
