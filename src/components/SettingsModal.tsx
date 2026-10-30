import React, { useState, useEffect } from 'react';
import { X, Settings, Terminal, Code2, Sliders, Check, RefreshCw } from 'lucide-react';
import { AppSettings, TerminalOption } from '../types';

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
    onSaveSettings(formData);
    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
      onClose();
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#12151d] border border-[#2b3348] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#212738] bg-[#161a24]">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-[#cc6b49]/15 text-[#f29472] rounded-lg">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">Preferences</h3>
              <p className="text-[11px] text-zinc-400">
                Configure your Claude Code launch environment
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

        {/* Form Body */}
        <div className="p-5 space-y-5">
          {/* Preferred Terminal */}
          <div>
            <label className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5 mb-2">
              <Terminal className="w-3.5 h-3.5 text-amber-500" />
              <span>Default Terminal</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {terminals.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setFormData({ ...formData, defaultTerminal: t.id })}
                  className={`text-left p-2.5 rounded-lg border text-xs transition-all flex items-center justify-between ${
                    formData.defaultTerminal === t.id
                      ? 'border-[#cc6b49] bg-[#cc6b49]/15 text-white font-medium'
                      : 'border-[#262c3e] bg-[#151924] text-zinc-300 hover:border-[#38435d]'
                  }`}
                >
                  <span className="truncate">{t.name}</span>
                  {t.installed && (
                    <span className="text-[9px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-1 py-0.2 rounded ml-1">
                      found
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Preferred Editor */}
          <div>
            <label className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5 mb-2">
              <Code2 className="w-3.5 h-3.5 text-sky-400" />
              <span>Default Code Editor</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {['VSCode', 'Cursor'].map((ed) => (
                <button
                  key={ed}
                  type="button"
                  onClick={() => setFormData({ ...formData, defaultEditor: ed })}
                  className={`p-2.5 rounded-lg border text-xs transition-all text-center ${
                    formData.defaultEditor === ed
                      ? 'border-[#cc6b49] bg-[#cc6b49]/15 text-white font-medium'
                      : 'border-[#262c3e] bg-[#151924] text-zinc-300 hover:border-[#38435d]'
                  }`}
                >
                  {ed === 'VSCode' ? 'Visual Studio Code' : 'Cursor IDE'}
                </button>
              ))}
            </div>
          </div>

          {/* Claude Binary Path */}
          <div>
            <label className="text-xs font-semibold text-zinc-200 block mb-1.5">
              Claude CLI Binary Path
            </label>
            <input
              type="text"
              value={formData.claudePath}
              onChange={(e) => setFormData({ ...formData, claudePath: e.target.value })}
              placeholder="claude or /path/to/claude"
              className="w-full bg-[#151924] border border-[#262c3e] focus:border-[#cc6b49] text-xs font-mono text-zinc-200 rounded-lg px-3 py-2 outline-none"
            />
            <p className="text-[10px] text-zinc-500 mt-1">
              Usually detected at ~/.local/bin/claude or in PATH.
            </p>
          </div>

          {/* Default Flags for New Projects */}
          <div>
            <label className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5 mb-2">
              <Sliders className="w-3.5 h-3.5 text-purple-400" />
              <span>Default Flags for New Projects</span>
            </label>
            <div className="bg-[#151924] border border-[#262c3e] rounded-lg p-3 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={formData.defaultFlags.dangerouslySkipPermissions}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      defaultFlags: {
                        ...formData.defaultFlags,
                        dangerouslySkipPermissions: e.target.checked
                      }
                    })
                  }
                  className="w-3.5 h-3.5 rounded bg-[#1f2433] border-[#374056] text-[#cc6b49] accent-[#cc6b49] cursor-pointer"
                />
                <span className="text-xs font-mono text-zinc-300">
                  --dangerously-skip-permissions <span className="text-[10px] text-zinc-500 font-sans">(skip permission prompts)</span>
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={formData.defaultFlags.continueLast}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      defaultFlags: {
                        ...formData.defaultFlags,
                        continueLast: e.target.checked
                      }
                    })
                  }
                  className="w-3.5 h-3.5 rounded bg-[#1f2433] border-[#374056] text-[#cc6b49] accent-[#cc6b49] cursor-pointer"
                />
                <span className="text-xs font-mono text-zinc-300">
                  --continue <span className="text-[10px] text-zinc-500 font-sans">(-c resume session)</span>
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-[#212738] bg-[#161a24]">
          <button
            onClick={onClose}
            className="text-xs text-zinc-400 hover:text-zinc-200 px-3 py-1.5 rounded-lg hover:bg-[#202534] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 bg-gradient-to-r from-[#cc6b49] to-[#d97706] text-white text-xs font-medium px-4 py-1.5 rounded-lg shadow-md transition-all"
          >
            {isSaved ? <Check className="w-3.5 h-3.5" /> : null}
            <span>{isSaved ? 'Saved!' : 'Save Changes'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
