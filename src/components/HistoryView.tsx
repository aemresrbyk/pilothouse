import React, { useState, useEffect, useRef } from 'react';
import { RotateCcw, Search } from 'lucide-react';
import { ProjectItem, ClaudeSession, TranscriptMessage, HistoryHit, AGENTS, AgentProfile, agentById } from '../types';
import { ThemeConfig } from '../theme';
import { keyLabel } from '../utils/platform';

interface HistoryViewProps {
  project: ProjectItem;
  themeConfig: ThemeConfig;
  agent: AgentProfile;
  visible: boolean;
  searchRef: React.RefObject<HTMLInputElement | null>;
  onResume: (sessionId: string) => void;
  onResumeAs: (agentId: string, sessionId: string) => void;
  onHandoffSession: (agentId: string, sessionFile: string, fromAgent: string) => void;
}

// The History tab: every agent's past sessions in this project, their transcripts, and search across them.
// Always mounted (hidden when another tab is shown) so the open transcript survives switching tabs; the parent
// remounts it (key = agent) when the agent changes.
export const HistoryView: React.FC<HistoryViewProps> = ({ project, themeConfig, agent, visible, searchRef, onResume, onResumeAs, onHandoffSession }) => {
  // Selected session's transcript + search across all sessions of this project.
  const [sessions, setSessions] = useState<ClaudeSession[] | null>(null);
  const [openSession, setOpenSession] = useState<ClaudeSession | null>(null);
  const [transcript, setTranscript] = useState<TranscriptMessage[] | null>(null);
  const [focusMsg, setFocusMsg] = useState<number | null>(null);
  const [histQuery, setHistQuery] = useState('');
  const [hits, setHits] = useState<HistoryHit[] | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible) return;
    setSessions(null);
    window.electronAPI.getSessions(project.path, 'all').then(setSessions).catch(() => setSessions([]));
  }, [visible, project.path]);

  const openTranscript = (sess: ClaudeSession, msgIndex: number | null = null) => {
    setOpenSession(sess);
    setFocusMsg(msgIndex);
    setTranscript(null);
    if (sess.file) window.electronAPI.getTranscript(sess.file).then(setTranscript).catch(() => setTranscript([]));
  };

  // Debounced search; empty query shows the session list again.
  useEffect(() => {
    const q = histQuery.trim();
    if (!q) { setHits(null); return; }
    const t = setTimeout(() => {
      window.electronAPI.searchHistory(project.path, 'all', q).then(setHits).catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(t);
  }, [histQuery, project.path, agent.id]);

  // Scroll the transcript to the message a search hit points at.
  useEffect(() => {
    if (focusMsg === null || !transcript) return;
    transcriptRef.current?.querySelector(`[data-msg="${focusMsg}"]`)?.scrollIntoView({ block: 'center' });
  }, [focusMsg, transcript]);

  return (
    <div className="flex-1 flex overflow-hidden" style={{ display: visible ? undefined : 'none' }}>
      {/* Sessions / search results */}
      <div className="w-80 border-r flex flex-col flex-shrink-0" style={{ backgroundColor: themeConfig.bgCard, borderColor: themeConfig.border }}>
        <div className="p-2 border-b flex items-center gap-1.5" style={{ backgroundColor: themeConfig.bgHeader, borderColor: themeConfig.border }}>
          <Search className="w-3 h-3 flex-shrink-0" style={{ color: themeConfig.textMuted }} />
          <input
            ref={searchRef}
            type="search"
            placeholder={`Search all conversations (${keyLabel('F')})`}
            value={histQuery}
            onChange={(e) => setHistQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setHistQuery(''); }}
            aria-label="Search conversations"
            className="w-full bg-transparent text-[11px] outline-none"
            style={{ color: themeConfig.textPrimary }}
          />
        </div>
        <div className="flex-1 overflow-y-auto p-1.5 flex flex-col gap-1">
          {hits !== null ? (
            hits.length === 0 ? (
              <div className="text-center py-10 text-[11px]" style={{ color: themeConfig.textMuted }}>No matches.</div>
            ) : (
              <>
                <div className="px-1.5 py-1 text-[10px]" style={{ color: themeConfig.textMuted }}>
                  {hits.length}{hits.length >= 200 ? '+' : ''} matches
                </div>
                {hits.map((h) => (
                  <button
                    key={`${h.sessionId}-${h.index}`}
                    type="button"
                    onClick={() => openTranscript(sessions?.find((x) => x.id === h.sessionId) || { id: h.sessionId, file: h.file, title: h.title, agent: h.agent, modifiedAt: 0, sizeBytes: 0, formattedSize: '', dateStr: '' }, h.index)}
                    className="w-full text-left px-2 py-1.5 rounded border transition-colors"
                    style={{
                      backgroundColor: openSession?.id === h.sessionId && focusMsg === h.index ? themeConfig.bgTabActive : 'transparent',
                      borderColor: themeConfig.border
                    }}
                  >
                    <div className="text-[10px] truncate" style={{ color: themeConfig.textMuted }}>
                      {h.role === 'user' ? 'You' : agentById(h.agent).name} · {h.time ? new Date(h.time).toLocaleString() : ''} · {h.title}
                    </div>
                    <div className="text-[11px] mt-0.5 line-clamp-2" style={{ color: themeConfig.textPrimary }}>
                      <Highlight text={h.snippet} query={histQuery} color={themeConfig.accent} />
                    </div>
                  </button>
                ))}
              </>
            )
          ) : sessions === null ? (
            <div className="text-center py-10 text-[11px]" style={{ color: themeConfig.textMuted }}>Loading sessions...</div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-10 text-[11px]" style={{ color: themeConfig.textMuted }}>No saved sessions for this project yet.</div>
          ) : (
            sessions.map((sess) => (
              <button
                key={sess.id}
                type="button"
                onClick={() => openTranscript(sess)}
                title={sess.title}
                className="w-full text-left px-2 py-1.5 rounded border transition-colors"
                style={{ backgroundColor: openSession?.id === sess.id ? themeConfig.bgTabActive : 'transparent', borderColor: themeConfig.border }}
              >
                <div className="text-[11px] truncate" style={{ color: themeConfig.textPrimary }}>{sess.title}</div>
                <div className="text-[10px] mt-0.5" style={{ color: themeConfig.textMuted }}>
                  <span style={{ color: sess.agent === agent.id ? themeConfig.accent : themeConfig.textSecondary }}>{agentById(sess.agent).name}</span> · {sess.dateStr} · {sess.formattedSize}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Transcript */}
      <div className="flex-1 flex flex-col min-w-0">
        {!openSession ? (
          <div className="flex-1 flex items-center justify-center text-[11px] p-8 text-center" style={{ color: themeConfig.textMuted }}>
            Pick a conversation to read it, or search across all of them. Claude Code and Codex conversations in this project are both listed.
          </div>
        ) : (
          <>
            <div className="px-4 py-2 border-b flex items-center gap-3" style={{ backgroundColor: themeConfig.bgHeader, borderColor: themeConfig.border }}>
              <div className="min-w-0 flex-1">
                <div className="text-xs truncate font-bold" style={{ color: themeConfig.textPrimary }}>{openSession.title}</div>
                <div className="text-[10px]" style={{ color: themeConfig.textMuted }}>
                  {transcript?.[0]?.time ? new Date(transcript[0].time).toLocaleString() : openSession.dateStr} · {transcript?.length ?? '…'} messages · {openSession.id.slice(0, 8)}
                </div>
              </div>
              {/* Continue with another agent from this exact conversation (e.g. Codex ran out → Claude). */}
              {openSession.file && (
                <select
                  value=""
                  onChange={(e) => e.target.value && onHandoffSession(e.target.value, openSession.file!, openSession.agent || agent.id)}
                  title="Hand this conversation, the changes and the project memory to another agent"
                  aria-label="Continue with another agent"
                  className="text-[10px] px-1.5 py-1 rounded border outline-none flex-shrink-0"
                  style={{ backgroundColor: themeConfig.bgMain, borderColor: themeConfig.border, color: themeConfig.textSecondary }}
                >
                  <option value="">Continue with…</option>
                  {AGENTS.filter((a) => a.id !== (openSession.agent || agent.id)).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              )}
              <button
                type="button"
                onClick={() => (openSession.agent && openSession.agent !== agent.id
                  ? onResumeAs(openSession.agent, openSession.id)
                  : onResume(openSession.id))}
                title={`Reopen this conversation in ${agentById(openSession.agent || agent.id).name}`}
                className="px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 flex-shrink-0"
                style={{ backgroundColor: themeConfig.accent, color: themeConfig.accentText }}
              >
                <RotateCcw className="w-3 h-3" />
                Resume{openSession.agent && openSession.agent !== agent.id ? ` in ${agentById(openSession.agent).name}` : ''}
              </button>
            </div>
            <div ref={transcriptRef} className="flex-1 overflow-y-auto p-4 select-text">
              {transcript === null ? (
                <div className="text-center py-10 text-[11px]" style={{ color: themeConfig.textMuted }}>Loading…</div>
              ) : transcript.length === 0 ? (
                <div className="text-center py-10 text-[11px]" style={{ color: themeConfig.textMuted }}>This conversation has no text messages.</div>
              ) : (
                <div className="max-w-3xl mx-auto flex flex-col gap-3">
                  {transcript.map((m, i) => (
                    <div
                      key={i}
                      data-msg={i}
                      className="rounded-lg border px-3 py-2"
                      style={{
                        backgroundColor: m.role === 'user' ? themeConfig.accentBg : themeConfig.bgCard,
                        borderColor: focusMsg === i ? themeConfig.accent : themeConfig.border
                      }}
                    >
                      <div className="text-[10px] mb-1 font-bold" style={{ color: m.role === 'user' ? themeConfig.accent : themeConfig.textMuted }}>
                        {m.role === 'user' ? 'You' : agentById(openSession.agent).name}
                        <span className="font-normal ml-2">{m.time ? new Date(m.time).toLocaleString() : ''}</span>
                      </div>
                      <div className="text-xs whitespace-pre-wrap break-words leading-relaxed" style={{ color: themeConfig.textPrimary }}>
                        <Highlight text={m.text} query={histQuery} color={themeConfig.accent} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// Marks every case-insensitive occurrence of query in text.
const Highlight: React.FC<{ text: string; query: string; color: string }> = ({ text, query, color }) => {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? <mark key={i} style={{ backgroundColor: color, color: '#fff', borderRadius: 2 }}>{part}</mark> : part
      )}
    </>
  );
};
