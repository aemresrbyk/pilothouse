import React, { useState, useEffect } from 'react';
import { X, Settings, Terminal, Code2, Sliders, Check, Palette } from 'lucide-react';
import { AppSettings, TerminalOption, AppTheme, isDangerFlag, AGENTS, agentFlagPresets } from '../types';
import { THEMES } from '../theme';
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
  // Toolbar flags are edited per agent; presetsText holds the one currently shown.
  const [editAgent, setEditAgent] = useState('claude');
  const [presetsByAgent, setPresetsByAgent] = useState<Record<string, string>>({});
  const presetsText = presetsByAgent[editAgent] ?? '';
  const setPresetsText = (text: string) => setPresetsByAgent((prev) => ({ ...prev, [editAgent]: text }));
  const toList = (text: string) => [...new Set(text.split('\n').map((l) => l.trim()).filter(Boolean))];
  const presetList = toList(presetsText);
  const defaultAgent = formData.defaultAgent || 'claude';

  useEffect(() => {
    setFormData(settings);
    setPresetsByAgent(Object.fromEntries(AGENTS.map((a) => [a.id, agentFlagPresets(settings, a.id).join('\n')])));
    setEditAgent(settings.defaultAgent || 'claude');
    if (isOpen) {
      window.electronAPI.getTerminals().then(setTerminals);
    }
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const handleSave = () => {
    playClickSound();
    // Drop defaults whose toolbar toggle was removed.
    const agentPresets = Object.fromEntries(AGENTS.map((a) => [a.id, toList(presetsByAgent[a.id] ?? '')]));
    onSaveSettings({
      ...formData,
      agentFlagPresets: agentPresets,
      defaultFlags: formData.defaultFlags.filter((f) => agentPresets[defaultAgent].includes(f))
    });
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
          {/* Theme Selection */}
          <div>
            <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <Palette className="w-3.5 h-3.5 text-amber-500" />
              <span>APPLICATION THEME</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(THEMES) as AppTheme[]).map((tId) => {
                const t = THEMES[tId];
                const isSelected = (formData.theme || 'claude') === tId;
                return (
                  <button
                    key={tId}
                    type="button"
                    onClick={() => {
                      playClickSound();
                      setFormData({ ...formData, theme: tId });
                    }}
                    className={`p-2 rounded border text-xs transition-all flex items-center justify-between ${
                      isSelected
                        ? 'border-amber-500/80 bg-amber-500/15 text-white font-bold'
                        : 'border-[#1b2233] bg-[#10131c] text-zinc-400 hover:border-[#2b354e]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span>{t.icon}</span>
                      <span>{t.name}</span>
                    </div>
                    {isSelected && <span className="text-amber-400 text-[10px]">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>

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

          {/* Toolbar flags + which of them new projects start with */}
          <div>
            <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
              <Sliders className="w-3.5 h-3.5 text-purple-400" />
              <span>AGENTS &amp; TOOLBAR FLAGS</span>
            </label>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] text-zinc-500">New projects use</span>
              <select
                value={defaultAgent}
                onChange={(e) => setFormData({ ...formData, defaultAgent: e.target.value, defaultFlags: [] })}
                className="bg-[#10131c] border border-[#1b2233] text-xs text-zinc-200 rounded px-1.5 py-1 outline-none"
              >
                {AGENTS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="flex gap-1 mb-1.5">
              {AGENTS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setEditAgent(a.id)}
                  className={`px-2 py-0.5 rounded text-[10px] border ${editAgent === a.id ? 'border-amber-500/80 bg-amber-500/15 text-white' : 'border-[#1b2233] text-zinc-400'}`}
                >
                  {a.name}
                </button>
              ))}
            </div>
            <textarea
              value={presetsText}
              onChange={(e) => setPresetsText(e.target.value)}
              rows={4}
              spellCheck={false}
              placeholder={'--continue\n--model opus'}
              className="w-full bg-[#10131c] border border-[#1b2233] focus:border-amber-500 text-xs text-zinc-200 rounded px-2.5 py-1.5 outline-none font-mono resize-y"
            />
            <p className="text-[10px] text-zinc-600 mt-1 mb-2">
              One flag per line. Each becomes an on/off toggle in the toolbar when a project runs this agent.
              {editAgent === defaultAgent && ' Tick the ones new projects should start with:'}
            </p>
            {editAgent === defaultAgent && presetList.length > 0 && <div className="bg-[#10131c] border border-[#1b2233] rounded p-2.5 space-y-2">
              {presetList.map((flag) => (
                <label key={flag} className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formData.defaultFlags.includes(flag)}
                    onChange={(e) => {
                      playClickSound();
                      setFormData({
                        ...formData,
                        defaultFlags: e.target.checked
                          ? [...formData.defaultFlags, flag]
                          : formData.defaultFlags.filter((f) => f !== flag)
                      });
                    }}
                    className="w-3.5 h-3.5 rounded bg-zinc-900 border-[#2a344a] text-amber-500 accent-amber-500 cursor-pointer"
                  />
                  <span className={`text-xs font-mono ${isDangerFlag(flag) ? 'text-red-400' : 'text-zinc-300'}`}>{flag}</span>
                </label>
              ))}
            </div>}
          </div>

          {/* Voice */}
          <div>
            <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-1.5">VOICE PROMPTS</label>
            <div className="bg-[#10131c] border border-[#1b2233] rounded p-2.5 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={formData.voiceEnabled !== false}
                  onChange={(e) => setFormData({ ...formData, voiceEnabled: e.target.checked })}
                  className="w-3.5 h-3.5 accent-amber-500 cursor-pointer"
                />
                <span className="text-xs text-zinc-300">Global hotkey</span>
                <input
                  type="text"
                  value={formData.voiceHotkey || 'CommandOrControl+Shift+Space'}
                  onChange={(e) => setFormData({ ...formData, voiceHotkey: e.target.value })}
                  spellCheck={false}
                  aria-label="Voice hotkey"
                  className="flex-1 bg-[#0c0e14] border border-[#1b2233] focus:border-amber-500 text-[11px] text-zinc-200 rounded px-2 py-0.5 outline-none font-mono"
                />
              </label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-300">Language</span>
                <select
                  value={formData.voiceLanguage || 'auto'}
                  onChange={(e) => setFormData({ ...formData, voiceLanguage: e.target.value })}
                  className="bg-[#0c0e14] border border-[#1b2233] text-xs text-zinc-200 rounded px-1.5 py-0.5 outline-none"
                >
                  <option value="auto">Auto-detect (slower)</option>
                  <option value="en">English</option>
                  <option value="tr">Türkçe</option>
                  <option value="de">Deutsch</option>
                  <option value="es">Español</option>
                  <option value="fr">Français</option>
                </select>
              </div>
              <label className="flex items-start gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={formData.voiceConversation !== false}
                  onChange={(e) => setFormData({ ...formData, voiceConversation: e.target.checked })}
                  className="mt-0.5 w-3.5 h-3.5 accent-amber-500 cursor-pointer"
                />
                <span>
                  <span className="text-xs text-zinc-300 block">Conversation mode</span>
                  <span className="text-[10px] text-zinc-600">
                    Reads the agent's answers aloud, asks you to repeat what it didn't catch, takes approvals by voice and keeps listening. You can talk over it. Off: plain dictation.
                  </span>
                </span>
              </label>
              {formData.voiceConversation === false && <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={!!formData.voiceAutoSend}
                  onChange={(e) => setFormData({ ...formData, voiceAutoSend: e.target.checked })}
                  className="w-3.5 h-3.5 accent-amber-500 cursor-pointer"
                />
                <span className="text-xs text-zinc-300">Send right away</span>
                <span className="text-[10px] text-zinc-600">(off: the text is typed and you press Enter)</span>
              </label>}
              <label className="flex items-start gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={!!formData.wakeWordEnabled}
                  onChange={(e) => setFormData({ ...formData, wakeWordEnabled: e.target.checked })}
                  className="mt-0.5 w-3.5 h-3.5 accent-amber-500 cursor-pointer"
                />
                <span>
                  <span className="text-xs text-zinc-300 block">Say "Hey Pilothouse" to start</span>
                  <span className="text-[10px] text-zinc-600">
                    Keeps the microphone on (macOS shows the orange dot) and listens for the phrase on this computer. Closing the window keeps Pilothouse in the menu bar / system tray.
                  </span>
                </span>
              </label>
              {formData.wakeWordEnabled && (
                <label className="flex items-center gap-2 cursor-pointer select-none pl-5">
                  <input
                    type="checkbox"
                    checked={!!formData.openAtLogin}
                    onChange={(e) => setFormData({ ...formData, openAtLogin: e.target.checked })}
                    className="w-3.5 h-3.5 accent-amber-500 cursor-pointer"
                  />
                  <span className="text-xs text-zinc-300">Open at login, in the menu bar</span>
                </label>
              )}
              <p className="text-[10px] text-zinc-600">Speech is recognised on this computer with Whisper; audio never leaves your computer.</p>
            </div>
          </div>

          {/* Notifications */}
          <label className="flex items-start gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={formData.notificationsEnabled !== false}
              onChange={(e) => setFormData({ ...formData, notificationsEnabled: e.target.checked })}
              className="mt-0.5 w-3.5 h-3.5 rounded bg-zinc-900 border-[#2a344a] accent-amber-500 cursor-pointer"
            />
            <span>
              <span className="text-xs text-zinc-300 block">Notifications</span>
              <span className="text-[10px] text-zinc-600">
                Notify when an agent in a background tab finishes or asks for approval.
              </span>
            </span>
          </label>

          {/* Local control API */}
          <label className="flex items-start gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={!!formData.controlApiEnabled}
              onChange={(e) => setFormData({ ...formData, controlApiEnabled: e.target.checked })}
              className="mt-0.5 w-3.5 h-3.5 rounded bg-zinc-900 border-[#2a344a] accent-amber-500 cursor-pointer"
            />
            <span>
              <span className="text-xs text-zinc-300 block">Local control API</span>
              <span className="text-[10px] text-zinc-600">
                Lets other apps on this computer open tabs, send prompts and read terminal output (token in ~/.pilothouse/control.json). Takes effect after a restart.
              </span>
            </span>
          </label>
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
