import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { AGENTS, DEBATE_AGENTS, ProjectItem } from '../types';
import { ThemeConfig } from '../theme';
import { playClickSound } from '../utils/audio';

// Debate: the picked agents answer one question in turns (read-only), live from .pilothouse/debate.md.
export const DebateView: React.FC<{
  project: ProjectItem;
  themeConfig: ThemeConfig;
  initialTopic: string;
  onClose: () => void;
  onUseDecision: (text: string) => void;
}> = ({ project, themeConfig: t, initialTopic, onClose, onUseDecision }) => {
  const [topic, setTopic] = useState(initialTopic);
  const [picked, setPicked] = useState<string[]>(() => [...new Set([project.agent || 'claude', ...DEBATE_AGENTS])].filter((a) => DEBATE_AGENTS.includes(a)).slice(0, 2));
  const [rounds, setRounds] = useState(3);
  const [running, setRunning] = useState(false);
  const [markdown, setMarkdown] = useState('');
  const [error, setError] = useState('');

  useEffect(() => window.electronAPI.onDebateUpdate((u) => {
    if (u.projectPath !== project.path) return;
    if (u.markdown) setMarkdown(u.markdown);
    if (u.error) setError(u.error);
    if (u.done) setRunning(false);
  }), [project.path]);

  const start = async () => {
    playClickSound();
    setError(''); setMarkdown('');
    const r = await window.electronAPI.debateStart(project.path, topic, picked, rounds);
    if (r.error) setError(r.error); else setRunning(true);
  };
  const decision = markdown.includes('\n---\n') ? markdown.slice(markdown.lastIndexOf('\n---\n') + 5).trim() : '';
  const box = { backgroundColor: t.bgTabActive, borderColor: t.border, color: t.textSecondary };

  return (
    <div className="flex-1 p-2 flex flex-col gap-2 min-h-0 text-[11px]" style={{ color: t.textSecondary }}>
      <div className="flex items-center justify-between">
        <span className="font-bold" style={{ color: t.accent }}>Debate</span>
        <button onClick={onClose} aria-label="Close debate" style={{ color: t.textMuted }}><X className="w-3.5 h-3.5" /></button>
      </div>
      <textarea
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        disabled={running}
        rows={3}
        placeholder="The question, e.g. Should auth move to JWT?"
        className="w-full p-2 rounded-lg font-mono outline-none resize-none border"
        style={{ backgroundColor: t.bgMain, borderColor: t.border, color: t.textPrimary }}
      />
      <div className="flex flex-wrap gap-1" role="group" aria-label="Agents in the debate">
        {AGENTS.filter((a) => DEBATE_AGENTS.includes(a.id)).map((a) => {
          const on = picked.includes(a.id);
          return (
            <button key={a.id} disabled={running} aria-pressed={on}
              onClick={() => setPicked(on ? picked.filter((x) => x !== a.id) : [...picked, a.id])}
              className="px-2 py-0.5 rounded border disabled:opacity-50"
              style={on ? { backgroundColor: t.accent, borderColor: t.accent, color: t.accentText } : box}>
              {a.name}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1">
          Rounds
          <select value={rounds} disabled={running} onChange={(e) => setRounds(Number(e.target.value))} className="rounded border px-1" style={box}>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <span className="flex-1" style={{ color: t.textMuted }}>Read-only · uses each agent's own account</span>
        {running
          ? <button onClick={() => window.electronAPI.debateStop(project.path)} className="px-2 py-1 rounded border" style={box}>Stop</button>
          : <button onClick={start} disabled={!topic.trim() || picked.length < 2} className="px-2.5 py-1 rounded font-bold disabled:opacity-40" style={{ backgroundColor: t.accent, color: t.accentText }}>Start</button>}
      </div>
      {error && <div role="alert" style={{ color: '#f87171' }}>{error}</div>}
      <pre aria-live="polite" className="flex-1 min-h-0 overflow-auto whitespace-pre-wrap break-words rounded border p-2 font-mono" style={{ borderColor: t.border, backgroundColor: t.bgMain, color: t.textPrimary }}>
        {markdown || (running ? 'Starting…' : 'Agents answer in turns and can read the project, but not change it. It stops early when all agree; the last turn writes the decision to .pilothouse/debate.md.')}
        {running && markdown ? '\n\n… next agent is thinking' : ''}
      </pre>
      {decision && !running && (
        <button onClick={() => onUseDecision(decision)} className="px-2 py-1 rounded border" style={box}
          title="Put the decision and tasks into Drafts, ready to send, queue or run in a worktree">
          Use decision as draft
        </button>
      )}
    </div>
  );
};
