import React, { useEffect, useRef, useState } from 'react';
import { Inbox, X, Cpu, ArrowRight, Square, CornerDownLeft } from 'lucide-react';
import { ProjectItem, TabSession, TabState, InboxEvent, AGENTS } from '../types';
import { ThemeConfig } from '../theme';
import { parseChoices, Choice } from '../utils/inbox';

interface InboxPanelProps {
  isOpen: boolean;
  onClose: () => void;
  tabs: TabSession[];
  projects: ProjectItem[];
  tabStatus: Record<string, TabState>;
  events: InboxEvent[];
  awaySince: number | null; // set when the panel opened by itself after you were away
  onGoToTab: (tabId: string) => void;
  onStopTab: (tabId: string) => void;
  onHandoff: (tabId: string, agentId: string) => void;
  themeConfig: ThemeConfig;
}

const RED = '#ef4444';
const AMBER = '#f59e0b';
const GREEN = '#22c55e';
const KIND = {
  limit: { color: '#a855f7', label: 'Limit reached' },
  waiting: { color: AMBER, label: 'Needs you' },
  failed: { color: RED, label: 'Failed' },
  finished: { color: GREEN, label: 'Finished' }
} as const;

const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// One column for everything the agents ask you, what failed, and what each tab is using.
export const InboxPanel: React.FC<InboxPanelProps> = ({
  isOpen, onClose, tabs, projects, tabStatus, events, awaySince, onGoToTab, onStopTab, onHandoff, themeConfig: t
}) => {
  const [view, setView] = useState<'inbox' | 'resources'>('inbox');
  const [choices, setChoices] = useState<Record<string, Choice[]>>({});
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [usage, setUsage] = useState<{ id: string; cpu: number; memMB: number }[]>([]);
  // Take focus from the terminal, or 1–9 would also be typed into it.
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (isOpen) boxRef.current?.focus(); }, [isOpen]);

  const name = (tab?: TabSession) => {
    const p = projects.find((x) => x.id === tab?.projectId);
    return `${p?.name || 'Project'}${tab?.initialCommand ? ` · ${tab.initialCommand}` : ''}`;
  };
  const waiting = tabs.filter((x) => tabStatus[x.id]?.status === 'waiting');
  const failed = tabs.filter((x) => tabStatus[x.id]?.failed !== undefined && tabStatus[x.id]?.status !== 'waiting');
  const limited = tabs.filter((x) => tabStatus[x.id]?.limit);
  const finished = tabs.filter((x) => tabStatus[x.id]?.unseen && tabStatus[x.id]?.status === 'idle' && tabStatus[x.id]?.failed === undefined && !tabStatus[x.id]?.limit);
  const agentOf = (tab: TabSession) => projects.find((p) => p.id === tab.projectId)?.agent || 'claude';

  // Read each waiting prompt's options from the terminal.
  const waitingKey = waiting.map((x) => x.id).join(',');
  useEffect(() => {
    if (!isOpen) return;
    let live = true;
    Promise.all(waiting.map(async (x) => [x.id, parseChoices(await window.electronAPI.ptyTail(x.id, 3000))] as const))
      .then((rows) => live && setChoices(Object.fromEntries(rows)));
    return () => { live = false; };
  }, [isOpen, waitingKey]);

  useEffect(() => {
    if (!isOpen || view !== 'resources') return;
    // The Windows query can take longer than the interval, so never stack calls.
    let busy = false;
    const poll = () => {
      if (busy) return;
      busy = true;
      window.electronAPI.ptyResources().then(setUsage).catch(() => {}).finally(() => { busy = false; });
    };
    poll();
    const timer = setInterval(poll, 2000);
    return () => clearInterval(timer);
  }, [isOpen, view]);

  const answer = (tabId: string, c: Choice) => window.electronAPI.ptyWrite(tabId, c.key);
  const reply = (tabId: string) => {
    const text = replies[tabId]?.trim();
    if (!text) return;
    window.electronAPI.ptyWrite(tabId, text);
    setTimeout(() => window.electronAPI.ptyWrite(tabId, '\r'), 80);
    setReplies((r) => ({ ...r, [tabId]: '' }));
  };

  // 1–9 answers the top prompt, Esc closes.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose();
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || e.metaKey || e.ctrlKey) return;
      const top = waiting[0];
      const c = top && choices[top.id]?.find((x) => x.key.startsWith(e.key));
      if (c && /^[1-9yn]$/i.test(e.key)) { e.preventDefault(); answer(top.id, c); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, waitingKey, choices]);

  if (!isOpen) return null;

  const card = (tab: TabSession, kind: keyof typeof KIND, body: React.ReactNode) => (
    <div key={`${kind}-${tab.id}`} className="rounded-lg border p-3 flex flex-col gap-2"
      style={{ borderColor: kind === 'waiting' ? KIND.waiting.color : t.border, backgroundColor: t.bgMain }}>
      <div className="flex items-center gap-2 text-xs">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: KIND[kind].color }} />
        <span className="font-bold truncate" style={{ color: t.textPrimary }}>{name(tab)}</span>
        <span style={{ color: KIND[kind].color }}>{KIND[kind].label}</span>
        <button onClick={() => { onGoToTab(tab.id); onClose(); }} className="ml-auto flex items-center gap-1 hover:opacity-80"
          style={{ color: t.textMuted }} title="Open this tab">
          Open <ArrowRight className="w-3 h-3" />
        </button>
      </div>
      {body}
    </div>
  );

  const inbox = (
    <div className="flex flex-col gap-2">
      {awaySince && (
        <p className="text-xs" style={{ color: t.textSecondary }}>
          While you were away (since {clock(awaySince)}): {events.filter((e) => e.at >= awaySince).length} event(s).
        </p>
      )}
      {limited.map((tab) => card(tab, 'limit', (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs" style={{ color: t.textSecondary }}>
            Continue with another agent. It gets the conversation, the changed files and the project memory.
          </span>
          <div className="flex flex-wrap gap-1.5">
            {AGENTS.filter((a) => a.id !== agentOf(tab)).map((a) => (
              <button key={a.id} onClick={() => onHandoff(tab.id, a.id)} className="px-2 py-1 rounded border text-xs hover:opacity-80"
                style={{ borderColor: t.border, color: t.textPrimary, backgroundColor: t.bgCard }}>
                Continue with {a.name}
              </button>
            ))}
          </div>
        </div>
      )))}
      {waiting.map((tab) => card(tab, 'waiting', (
        <div className="flex flex-wrap gap-1.5">
          {(choices[tab.id] || []).map((c) => (
            <button key={c.key} onClick={() => answer(tab.id, c)} className="px-2 py-1 rounded border text-xs text-left hover:opacity-80"
              style={{ borderColor: t.border, color: t.textPrimary, backgroundColor: t.bgCard }}>
              <span style={{ color: t.accent }}>{c.key.trim()}</span> {c.label}
            </button>
          ))}
          {!choices[tab.id]?.length && <span className="text-xs" style={{ color: t.textMuted }}>Answer in the terminal.</span>}
        </div>
      )))}
      {failed.map((tab) => card(tab, 'failed', (
        <span className="text-xs" style={{ color: t.textSecondary }}>Exited with code {tabStatus[tab.id]?.failed}.</span>
      )))}
      {finished.map((tab) => card(tab, 'finished', (
        <form onSubmit={(e) => { e.preventDefault(); reply(tab.id); }} className="flex gap-1.5">
          <input value={replies[tab.id] || ''} onChange={(e) => setReplies((r) => ({ ...r, [tab.id]: e.target.value }))}
            placeholder="Reply to the agent…" aria-label={`Reply to ${name(tab)}`}
            className="flex-1 px-2 py-1 rounded border text-xs bg-transparent outline-none"
            style={{ borderColor: t.border, color: t.textPrimary }} />
          <button type="submit" className="px-2 rounded border" style={{ borderColor: t.border, color: t.accent }} aria-label="Send reply">
            <CornerDownLeft className="w-3 h-3" />
          </button>
        </form>
      )))}
      {!limited.length && !waiting.length && !failed.length && !finished.length && (
        <p className="text-xs py-6 text-center" style={{ color: t.textMuted }}>Nothing needs you right now.</p>
      )}
      {events.length > 0 && (
        <div className="mt-2">
          <h3 className="text-[10px] font-bold uppercase mb-1" style={{ color: t.textMuted }}>Activity</h3>
          {events.slice(0, 20).map((e, i) => (
            <div key={i} className="flex gap-2 text-[11px] py-0.5" style={{ color: t.textSecondary }}>
              <span style={{ color: t.textMuted }}>{clock(e.at)}</span>
              <span style={{ color: KIND[e.kind].color }}>{KIND[e.kind].label}{e.code !== undefined ? ` (${e.code})` : ''}</span>
              <span className="truncate">{name(tabs.find((x) => x.id === e.tabId))}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const resources = (
    <table className="w-full text-xs">
      <thead>
        <tr style={{ color: t.textMuted }}>
          <th className="text-left font-normal pb-1">Tab</th><th className="text-right font-normal">CPU</th>
          <th className="text-right font-normal">Memory</th><th />
        </tr>
      </thead>
      <tbody>
        {[...usage].sort((a, b) => b.cpu - a.cpu).map((u) => {
          const tab = tabs.find((x) => x.id === u.id);
          if (!tab) return null;
          return (
            <tr key={u.id} style={{ color: t.textPrimary }}>
              <td className="py-1 truncate max-w-[16rem]">{name(tab)}</td>
              <td className="text-right" style={{ color: u.cpu > 80 ? RED : undefined }}>{u.cpu.toFixed(0)}%</td>
              <td className="text-right">{u.memMB.toFixed(0)} MB</td>
              <td className="text-right whitespace-nowrap pl-2">
                <button onClick={() => { onGoToTab(u.id); onClose(); }} className="px-1 hover:opacity-80" style={{ color: t.textMuted }} title="Open this tab" aria-label="Open this tab"><ArrowRight className="w-3 h-3" /></button>
                <button onClick={() => onStopTab(u.id)} className="px-1 hover:opacity-80" style={{ color: RED }} title="Stop: close the tab and end its processes" aria-label="Stop"><Square className="w-3 h-3" /></button>
              </td>
            </tr>
          );
        })}
        {!usage.length && <tr><td colSpan={4} className="py-6 text-center" style={{ color: t.textMuted }}>No running terminals.</td></tr>}
      </tbody>
    </table>
  );

  const tabBtn = (id: 'inbox' | 'resources', icon: React.ReactNode, label: string) => (
    <button onClick={() => setView(id)} aria-pressed={view === id} className="flex items-center gap-1.5 px-2 py-1 rounded text-xs"
      style={{ color: view === id ? t.accent : t.textMuted, backgroundColor: view === id ? t.accentBg : 'transparent' }}>
      {icon} {label}
    </button>
  );

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4 bg-black/60 backdrop-blur-sm font-mono animate-fade-in">
      <div ref={boxRef} tabIndex={-1} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Inbox"
        className="w-full max-w-xl max-h-[75vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col border"
        style={{ backgroundColor: t.bgCard, borderColor: t.border }}>
        <div className="flex items-center gap-1 px-3 py-2 border-b" style={{ backgroundColor: t.bgHeader, borderColor: t.border }}>
          {tabBtn('inbox', <Inbox className="w-3.5 h-3.5" />, `Inbox${waiting.length ? ` (${waiting.length})` : ''}`)}
          {tabBtn('resources', <Cpu className="w-3.5 h-3.5" />, 'Resources')}
          <span className="ml-auto text-[10px]" style={{ color: t.textMuted }}>{view === 'inbox' && waiting.length ? '1–9 answers the top prompt · ' : ''}Esc</span>
          <button onClick={onClose} className="p-1 hover:opacity-80" style={{ color: t.textMuted }} aria-label="Close"><X className="w-3.5 h-3.5" /></button>
        </div>
        <div className="p-3 overflow-y-auto">{view === 'inbox' ? inbox : resources}</div>
      </div>
    </div>
  );
};
