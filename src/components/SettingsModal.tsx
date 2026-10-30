import React, { useState, useEffect } from 'react';
import { X, Settings, Terminal, Code2, Sliders, Check } from 'lucide-react';
import { AppSettings, TerminalOption } from '../types';
import { playClickSound } from '../utils/audio';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSaveSettings: (settings: Partial<AppSettings>) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings
}) => {
  const [formData, setFormData] = useState<AppSettings>(settings);
  const [terminals, setTerminals] = useState<TerminalOption[]>([]);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    setFormData(settings);
    if (isOpen) {
      window.electronAPI.getTerminals().then(setTerminals);
    }
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const handleSave = () => {
    playClickSound();
    onSaveSettings(formData);
    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
      onClose();
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm select-none font-mono">
      <div className="bg-[#0c0e14] border border-[#21283a] rounded-xl w-full max-w-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1b2131] bg-[#10131d]">
          <div className="flex items-center gap-2.5">
            <Settings className="w-4 h-4 text-amber-500" />
            <div>
              <h3 className="text-xs font-bold text-zinc-100 tracking-wider uppercase">
                // SYSTEM CONFIGURATION
              </h3>
            </div>
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

        {/* Form Body */}
        <div className="p-5 space-y-4 text-xs">
          {/* Preferred Terminal */}
          <div>
            <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <Terminal className="w-3.5 h-3.5 text-amber-500" />
              <span>TERMINAL EMULATOR</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {terminals.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    playClickSound();
                    setFormData({ ...formData, defaultTerminal: t.id });
                  }}
                  className={`text-left p-2 rounded border text-xs transition-all flex items-center justify-between ${
                    formData.defaultTerminal === t.id
                      ? 'border-amber-500/80 bg-amber-500/15 text-white font-bold'
                      : 'border-[#1b2233] bg-[#10131c] text-zinc-400 hover:border-[#2b354e]'
                  }`}
                >
                  <span className="truncate">{t.name}</span>
                  {t.installed && (
                    <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1 rounded ml-1">
                      INSTALLED
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Preferred Editor */}
          <div>
            <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <Code2 className="w-3.5 h-3.5 text-sky-400" />
              <span>PRIMARY IDE / EDITOR</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {['VSCode', 'Cursor'].map((ed) => (
                <button
                  key={ed}
                  type="button"
                  onClick={() => {
                    playClickSound();
                    setFormData({ ...formData, defaultEditor: ed });
                  }}
                  className={`p-2 rounded border text-xs transition-all text-center ${
                    formData.defaultEditor === ed
                      ? 'border-amber-500/80 bg-amber-500/15 text-white font-bold'
                      : 'border-[#1b2233] bg-[#10131c] text-zinc-400 hover:border-[#2b354e]'
                  }`}
                >
                  {ed === 'VSCode' ? 'Visual Studio Code' : 'Cursor IDE'}
                </button>
              ))}
            </div>
          </div>

          {/* Claude Binary Path */}
          <div>
            <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
              CLAUDE CLI BINARY PATH
            </label>
            <input
              type="text"
              value={formData.claudePath}
              onChange={(e) => setFormData({ ...formData, claudePath: e.target.value })}
              placeholder="claude or /path/to/claude"
              className="w-full bg-[#10131c] border border-[#1b2233] focus:border-amber-500 text-xs text-zinc-200 rounded px-2.5 py-1.5 outline-none"
            />
            <p className="text-[10px] text-zinc-600 mt-1">
              Auto-detected at ~/.local/bin/claude or in system PATH.
            </p>
          </div>

          {/* Default Flags for New Projects */}
          <div>
            <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
              <Sliders className="w-3.5 h-3.5 text-purple-400" />
              <span>DEFAULT FLAGS FOR NEW REPOSITORIES</span>
            </label>
            <div className="bg-[#10131c] border border-[#1b2233] rounded p-2.5 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={formData.defaultFlags.dangerouslySkipPermissions}
                  onChange={(e) => {
                    playClickSound();
                    setFormData({
                      ...formData,
                      defaultFlags: {
                        ...formData.defaultFlags,
                        dangerouslySkipPermissions: e.target.checked
                      }
                    });
                  }}
                  className="w-3.5 h-3.5 rounded bg-zinc-900 border-[#2a344a] text-amber-500 accent-amber-500 cursor-pointer"
                />
                <span className="text-xs text-zinc-300 font-mono">
                  --dangerously-skip-permissions
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={formData.defaultFlags.continueLast}
                  onChange={(e) => {
                    playClickSound();
                    setFormData({
                      ...formData,
                      defaultFlags: {
                        ...formData.defaultFlags,
                        continueLast: e.target.checked
                      }
                    });
                  }}
                  className="w-3.5 h-3.5 rounded bg-zinc-900 border-[#2a344a] text-amber-500 accent-amber-500 cursor-pointer"
                />
                <span className="text-xs text-zinc-300 font-mono">
                  --continue (-c)
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[#1b2131] bg-[#10131d]">
          <button
            onClick={() => {
              playClickSound();
              onClose();
            }}
            className="text-xs text-zinc-400 hover:text-zinc-200 px-3 py-1 rounded hover:bg-[#1a2030] transition-colors"
          >
            CANCEL
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 bg-gradient-to-r from-[#cc6b49] to-[#d97706] text-white text-xs font-bold px-4 py-1.5 rounded shadow transition-all active:scale-95"
          >
            {isSaved ? <Check className="w-3.5 h-3.5" /> : null}
            <span>{isSaved ? 'STORED' : 'SAVE CHANGES'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
