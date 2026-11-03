import React, { useEffect, useState } from 'react';
import { Check, FolderPlus, Loader2, RefreshCw, X } from 'lucide-react';
import { AGENTS, agentById } from '../types';
import type { SetupProject } from '../../electron/setup';
import { ThemeConfig } from '../theme';

export interface SetupResult {
  agentPaths: Record<string, string>;
  projects: { path: string; known: boolean; include: boolean; agent: string }[];
}

interface SetupWizardProps {
  isOpen: boolean;
  onFinish: (result: SetupResult) => void;
  onSkip: () => void;
  themeConfig: ThemeConfig;
}

const INSTALL: Record<string, string> = {
  claude: 'npm install -g @anthropic-ai/claude-code',
  codex: 'npm install -g @openai/codex',
  gemini: 'npm install -g @google/gemini-cli (personal Google accounts: use Antigravity, or an API key)',
  antigravity: 'install Antigravity from https://antigravity.google',
  opencode: 'curl -fsSL https://opencode.ai/install | bash'
};

type Row = SetupProject & { include: boolean; pick: string };

// The agent a project probably wants: its current one, else the one with more saved sessions, else the first installed.
const guessAgent = (p: SetupProject, installed: string[]) =>
  p.agent || (p.codex > p.claude ? 'codex' : p.claude > 0 ? 'claude' : installed[0] || 'claude');

// First run (and Settings → Run setup again): find the agent CLIs, then choose projects and their agent.
export const SetupWizard: React.FC<SetupWizardProps> = ({ isOpen, onFinish, onSkip, themeConfig: t }) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [paths, setPaths] = useState<Record<string, string | null> | null>(null);
  const [rows, setRows] = useState<Row[]>([]);

  const scan = async () => {
    setPaths(null);
    const r = await window.electronAPI.setupScan();
    const found = Object.fromEntries(r.agents.map((a) => [a.id, a.path]));
    setPaths(found);
    const installed = r.agents.filter((a) => a.path).map((a) => a.id);
    // Projects already in Pilothouse stay selected; new ones are suggested when an agent has worked there.
    setRows(r.projects.map((p) => ({ ...p, include: p.known || p.claude + p.codex > 0, pick: guessAgent(p, installed) })));
  };
  useEffect(() => { if (isOpen) { setStep(1); scan(); } }, [isOpen]);

  if (!isOpen) return null;

  const choose = async (id: string) => {
    const p = await window.electronAPI.pickFile(`Where is ${agentById(id).name}?`);
    if (p) setPaths((cur) => ({ ...cur, [id]: p }));
  };
  const addFolder = async () => {
    const dir = await window.electronAPI.pickDirectory();
    if (!dir || rows.some((r) => r.path === dir)) return;
    const first = AGENTS.find((a) => paths?.[a.id])?.id || 'claude';
    setRows((cur) => [{ path: dir, name: dir.split(/[\\/]/).pop() || dir, known: false, claude: 0, codex: 0, last: Date.now(), include: true, pick: first }, ...cur]);
  };
  const setRow = (i: number, patch: Partial<Row>) => setRows((cur) => cur.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const finish = () => onFinish({
    agentPaths: Object.fromEntries(Object.entries(paths || {}).filter((e): e is [string, string] => !!e[1])),
    projects: rows.map((r) => ({ path: r.path, known: r.known, include: r.include, agent: r.pick }))
  });

  const muted = { color: t.textMuted };
  const btn = 'px-3 py-1.5 rounded-lg text-xs font-bold border transition-all active:scale-95';
  const selected = rows.filter((r) => r.include).length;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md font-mono">
      <div role="dialog" aria-label="Setup" className="w-full max-w-2xl max-h-[85vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden"
        style={{ backgroundColor: t.bgCard, borderColor: t.border }}>
        <div className="px-5 py-4 border-b flex items-center gap-3" style={{ backgroundColor: t.bgHeader, borderColor: t.border }}>
          <div className="flex-1">
            <h2 className="text-sm font-bold" style={{ color: t.textPrimary }}>
              {step === 1 ? 'Your AI agents' : 'Your projects'}
            </h2>
            <p className="text-[11px] mt-0.5" style={muted}>
              {step === 1
                ? 'Step 1 of 2 · Pilothouse looked for each agent. Choose the ones it could not find, or skip them.'
                : 'Step 2 of 2 · Pick the projects to open here and the agent each one uses. You can change both later.'}
            </p>
          </div>
          <button onClick={onSkip} className="p-1 hover:opacity-80" style={muted} title="Skip setup" aria-label="Skip setup"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {!paths ? (
            <div className="flex items-center justify-center gap-2 py-16 text-xs" style={muted}><Loader2 className="w-4 h-4 animate-spin" /> Looking for agents and projects…</div>
          ) : step === 1 ? (
            <div className="flex flex-col gap-2">
              {AGENTS.map((a) => (
                <div key={a.id} className="rounded-lg border px-3 py-2.5 flex items-center gap-3" style={{ borderColor: t.border, backgroundColor: t.bgMain }}>
                  <span className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: paths[a.id] ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.12)', color: paths[a.id] ? '#22c55e' : '#ef4444' }}>
                    {paths[a.id] ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold" style={{ color: t.textPrimary }}>{a.name}</div>
                    <div className="text-[10px] truncate" style={muted} title={paths[a.id] || ''}>
                      {paths[a.id] || <>Not found. Install: <span className="select-text" style={{ color: t.textSecondary }}>{INSTALL[a.id]}</span></>}
                    </div>
                  </div>
                  <button onClick={() => choose(a.id)} className={btn} style={{ borderColor: t.border, color: t.textSecondary }}>
                    {paths[a.id] ? 'Change' : 'Choose…'}
                  </button>
                </div>
              ))}
              <button onClick={scan} className="self-start mt-1 flex items-center gap-1.5 text-[11px] hover:opacity-80" style={muted}>
                <RefreshCw className="w-3 h-3" /> Look again (after installing one)
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <button onClick={addFolder} className="self-start mb-1 flex items-center gap-1.5 text-[11px] hover:opacity-80" style={{ color: t.accent }}>
                <FolderPlus className="w-3.5 h-3.5" /> Add another folder
              </button>
              {!rows.length && <p className="text-xs py-8 text-center" style={muted}>No projects found yet. Add a folder to start.</p>}
              {rows.map((r, i) => (
                <div key={r.path} className="rounded-lg border px-3 py-2 flex items-center gap-3"
                  style={{ borderColor: r.include ? t.accent : t.border, backgroundColor: t.bgMain, opacity: r.include ? 1 : 0.6 }}>
                  <input type="checkbox" checked={r.include} onChange={(e) => setRow(i, { include: e.target.checked })}
                    aria-label={`Use ${r.name}`} className="flex-shrink-0 accent-current" style={{ color: t.accent }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold truncate" style={{ color: t.textPrimary }}>{r.name}</div>
                    <div className="text-[10px] truncate" style={muted} title={r.path}>
                      {[r.claude && `Claude ${r.claude} sessions`, r.codex && `Codex ${r.codex} sessions`, r.last && `last used ${new Date(r.last).toLocaleDateString()}`]
                        .filter(Boolean).join(' · ') || r.path}
                    </div>
                  </div>
                  <select value={r.pick} onChange={(e) => setRow(i, { pick: e.target.value, include: true })} aria-label={`Agent for ${r.name}`}
                    className="text-[11px] px-1.5 py-1 rounded border outline-none flex-shrink-0"
                    style={{ backgroundColor: t.bgCard, borderColor: t.border, color: t.textPrimary }}>
                    {AGENTS.map((a) => <option key={a.id} value={a.id}>{a.name}{paths[a.id] ? '' : ' (not installed)'}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t flex items-center gap-2" style={{ borderColor: t.border }}>
          {step === 2 && <button onClick={() => setStep(1)} className={btn} style={{ borderColor: t.border, color: t.textSecondary }}>Back</button>}
          <span className="flex-1 text-[11px]" style={muted}>{step === 2 ? `${selected} selected` : ''}</span>
          {step === 1
            ? <button disabled={!paths} onClick={() => setStep(2)} className={`${btn} text-white`} style={{ backgroundColor: t.accent, borderColor: t.accent }}>Next</button>
            : <button onClick={finish} className={`${btn} text-white`} style={{ backgroundColor: t.accent, borderColor: t.accent }}>Start</button>}
        </div>
      </div>
    </div>
  );
};
