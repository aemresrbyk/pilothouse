import { useState, useEffect, useRef, MutableRefObject } from 'react';
import { startRecording, Recording } from '../utils/voice';
import { converse, ConvoDeps } from '../utils/conversationLoop';
import { Heard } from '../utils/conversation';
import { WakeWordDetector, startWakeListener, WakeListener } from '../utils/wakeword';
import { ProjectItem, AppSettings, TabSession, PtyStatus, agentById } from '../types';
import { playLaunchSound } from '../utils/audio';

export type VoicePhase = 'idle' | 'listening' | 'transcribing' | 'needs-model' | 'downloading' | 'speaking' | 'working';

interface VoiceInput {
  activeTabId: string;
  projects: ProjectItem[];
  settings: AppSettings;
  tabs: TabSession[];
  // Per-tab status subscribers, fed by App's PTY status events (conversation mode waits on the agent through them).
  statusListeners: MutableRefObject<Map<string, Set<(s: PtyStatus) => void>>>;
}

// Everything voice: dictation, conversation mode, the wake word, the model download.
export function useVoice({ activeTabId, projects, settings, tabs, statusListeners }: VoiceInput) {
  // Voice prompts: hotkey or mic button -> record until a pause -> local Whisper -> typed into the active tab.
  const [voice, setVoice] = useState<{ phase: VoicePhase; level?: number; progress?: number; note?: string }>({ phase: 'idle' });
  const recRef = useRef<Recording | null>(null);
  const voicePhase = useRef<VoicePhase>('idle');
  voicePhase.current = voice.phase;
  const voiceCtx = useRef({ activeTabId, projects, settings, tabs });
  voiceCtx.current = { activeTabId, projects, settings, tabs };

  const flashVoice = (note: string) => {
    setVoice({ phase: 'idle', note });
    setTimeout(() => setVoice((v) => (v.phase === 'idle' && v.note === note ? { phase: 'idle' } : v)), 6000);
  };

  const voicePrompt = (ctx = voiceCtx.current) => `Projects: ${ctx.projects.map((p) => p.name).join(', ')}.`;

  // Model downloaded, engine present, mic allowed?
  const voiceReady = async (): Promise<boolean> => {
    const st = await window.electronAPI.voiceStatus();
    if (!st.binary) { flashVoice('The speech engine is missing from this build.'); return false; }
    if (!st.model) { setVoice({ phase: 'needs-model' }); return false; }
    if (!(await window.electronAPI.voiceMicAccess())) {
      flashVoice('Microphone access is off. Allow Pilothouse in System Settings → Privacy & Security → Microphone.');
      return false;
    }
    return true;
  };

  // One utterance from the mic (null = nobody spoke / aborted).
  const recordOnce = async (opts: { timeoutMs?: number; signal?: AbortSignal; onSpeechStart?: () => void } = {}): Promise<ArrayBuffer | null> => {
    if (opts.signal?.aborted) return null;
    const rec = await startRecording((level) => setVoice((v) => (v.phase === 'listening' ? { ...v, level } : v)), {
      startTimeoutMs: opts.timeoutMs,
      onSpeechStart: opts.onSpeechStart
    });
    recRef.current = rec;
    opts.signal?.addEventListener('abort', () => rec.cancel());
    const pcm = await rec.result;
    if (recRef.current === rec) recRef.current = null;
    return pcm;
  };

  const transcribePcm = async (pcm: ArrayBuffer): Promise<Heard | null> => {
    const ctx = voiceCtx.current;
    const res = await window.electronAPI.voiceTranscribe(pcm, ctx.settings.voiceLanguage || 'auto', voicePrompt(ctx));
    if (res.error) { flashVoice(res.error); return null; }
    return { text: res.text || '', language: res.language || 'en', words: res.words || [] };
  };

  // Conversation mode: talk with the agent in the tab that was active when it started.
  const convoRef = useRef<{ cancel: boolean } | null>(null);
  const endConversation = () => {
    if (!convoRef.current) return;
    convoRef.current.cancel = true;
    window.electronAPI.stopSpeaking();
    recRef.current?.cancel();
  };

  const startConversation = async () => {
    const ctx = voiceCtx.current;
    const tab = ctx.tabs.find((t) => t.id === ctx.activeTabId);
    const project = tab && ctx.projects.find((p) => p.id === tab.projectId);
    if (!tab || !project) return flashVoice('Open a project tab first.');
    const agent = agentById(project.agent);
    const convo = { cancel: false };
    convoRef.current = convo;
    let sentAt = Date.now();
    const write = (seq: string) => { sentAt = Date.now(); window.electronAPI.ptyWrite(tab.id, seq); };
    const fixed = ctx.settings.voiceLanguage === 'tr' || ctx.settings.voiceLanguage === 'en' ? ctx.settings.voiceLanguage : undefined;

    const deps: ConvoDeps = {
      listen: async (o = {}) => {
        const pcm = await recordOnce({ timeoutMs: o.timeoutMs, signal: o.signal });
        if (!pcm || convo.cancel) return null;
        setVoice({ phase: 'transcribing' });
        return transcribePcm(pcm);
      },
      speak: async (text, lang) => {
        // Listen while talking: if the user starts speaking, stop and take what they say as the next turn.
        const ctl = new AbortController();
        let barged = false;
        const ears = recordOnce({
          timeoutMs: 60_000,
          signal: ctl.signal,
          onSpeechStart: () => {
            barged = true;
            window.electronAPI.stopSpeaking();
            setVoice({ phase: 'listening', level: 0 });
          }
        });
        await window.electronAPI.speak(text, lang);
        if (!barged) {
          ctl.abort();
          await ears;
          return { interrupted: false };
        }
        const pcm = await ears;
        if (!pcm || convo.cancel) return { interrupted: true, heard: null };
        setVoice({ phase: 'transcribing' });
        return { interrupted: true, heard: await transcribePcm(pcm) };
      },
      send: (text) => {
        write(text);
        // Enter separately so the agent's TUI doesn't treat it as part of the paste.
        setTimeout(() => window.electronAPI.ptyWrite(tab.id, '\r'), 150);
      },
      keys: write,
      waitForAgent: (signal) => new Promise((resolve) => {
        let sawRunning = false;
        const set = statusListeners.current.get(tab.id) ?? new Set();
        statusListeners.current.set(tab.id, set);
        const done = (r: 'idle' | 'waiting' | 'timeout') => {
          set.delete(onStatus);
          clearTimeout(quick);
          clearTimeout(max);
          resolve(r);
        };
        const onStatus = (s: PtyStatus) => {
          if (s === 'running') sawRunning = true;
          else if (sawRunning) done(s);
        };
        set.add(onStatus);
        // Very short answers never look "running"; don't wait forever for them.
        const quick = setTimeout(() => { if (!sawRunning) done('idle'); }, 8000);
        const max = setTimeout(() => done('timeout'), 20 * 60_000);
        signal.addEventListener('abort', () => done('timeout'));
      }),
      lastReply: () => window.electronAPI.agentLastReply(project.path, agent.id, sentAt),
      screen: () => window.electronAPI.ptyTail(tab.id, 1500),
      agentName: agent.name,
      approveKey: agent.id === 'codex' ? 'y' : '\r',
      denyKey: agent.id === 'codex' ? 'n' : '\x1b',
      interruptKey: '\x1b',
      vocab: [...ctx.projects.map((p) => p.name), agent.name],
      fixedLang: fixed,
      cancelled: () => convo.cancel,
      onState: (state, text) => setVoice({
        phase: state === 'thinking' ? 'transcribing' : state,
        level: 0,
        note: text
      })
    };

    try {
      await converse(deps);
    } catch (err: any) {
      flashVoice(`Conversation stopped: ${err.message}`);
    } finally {
      window.electronAPI.stopSpeaking();
      if (convoRef.current === convo) convoRef.current = null;
      setVoice((v) => (v.phase === 'idle' && v.note ? v : { phase: 'idle' }));
    }
  };

  const toggleVoice = async () => {
    // During a conversation: the hotkey cuts the voice off mid-sentence, otherwise ends the conversation.
    if (convoRef.current) {
      if (voicePhase.current === 'speaking') window.electronAPI.stopSpeaking();
      else endConversation();
      return;
    }
    if (recRef.current) return recRef.current.stop();
    if (voicePhase.current === 'transcribing' || voicePhase.current === 'downloading') return;
    if (!(await voiceReady())) return;
    if (voiceCtx.current.settings.voiceConversation !== false) return startConversation();

    // Dictation: one utterance typed into the active tab.
    setVoice({ phase: 'listening', level: 0 });
    let pcm: ArrayBuffer | null;
    try {
      pcm = await recordOnce();
    } catch (err: any) {
      return flashVoice(`Microphone error: ${err.message}`);
    }
    if (!pcm) return flashVoice("Didn't hear anything.");
    setVoice({ phase: 'transcribing' });
    const heard = await transcribePcm(pcm);
    if (!heard) return;
    if (!heard.text) return flashVoice("Didn't catch that, try again.");
    const ctx = voiceCtx.current;
    const tab = ctx.tabs.find((t) => t.id === ctx.activeTabId);
    if (!tab) return flashVoice(`Heard "${heard.text}", but no tab is open.`);
    window.electronAPI.ptyWrite(tab.id, heard.text);
    if (ctx.settings.voiceAutoSend) setTimeout(() => window.electronAPI.ptyWrite(tab.id, '\r'), 150);
    flashVoice(`${ctx.settings.voiceAutoSend ? 'Sent' : 'Typed (press Enter to send)'}: ${heard.text}`);
  };
  const toggleVoiceRef = useRef(toggleVoice);
  toggleVoiceRef.current = toggleVoice;

  const downloadVoiceModel = async () => {
    setVoice({ phase: 'downloading', progress: 0 });
    const r = await window.electronAPI.voiceDownloadModel();
    if (!r.success) return flashVoice(`Download failed: ${r.error}`);
    setVoice({ phase: 'idle' });
    toggleVoiceRef.current();
  };

  useEffect(() => window.electronAPI.onVoiceEvent((event, data) => {
    if (event === 'toggle') toggleVoiceRef.current();
    else if (event === 'progress') setVoice((v) => (v.phase === 'downloading' ? { ...v, progress: data.received / data.total } : v));
    else if (event === 'error') flashVoice(String(data));
  }), []);

  // "Hey Pilothouse": keep a wake-word listener running while the setting is on; it starts a voice prompt.
  useEffect(() => {
    if (!settings.wakeWordEnabled) return;
    let cancelled = false;
    let listener: WakeListener | null = null;
    (async () => {
      const assets = await window.electronAPI.wakeAssets();
      if ('error' in assets) return flashVoice(`"Hey Pilothouse" is unavailable: ${assets.error}`);
      if (!(await window.electronAPI.voiceMicAccess())) {
        return flashVoice('Microphone access is off. Allow Pilothouse in System Settings → Privacy & Security → Microphone.');
      }
      const detector = await WakeWordDetector.create(assets);
      if (cancelled) return;
      listener = await startWakeListener(
        detector,
        () => {
          window.electronAPI.focusApp();
          playLaunchSound();
          toggleVoiceRef.current();
        },
        () => voicePhase.current !== 'idle'
      );
      if (cancelled) listener.stop();
    })().catch((err) => flashVoice(`"Hey Pilothouse" failed to start: ${err.message}`));
    return () => {
      cancelled = true;
      listener?.stop();
    };
  }, [settings.wakeWordEnabled]);

  // Esc throws the recording away / ends the conversation.
  useEffect(() => {
    if (voice.phase === 'idle' || voice.phase === 'needs-model' || voice.phase === 'downloading') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (convoRef.current) endConversation();
      else recRef.current?.cancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [voice.phase]);

  // conversing: a conversation is running (Esc ends it rather than cancelling one recording).
  return { voice, setVoice, toggleVoice: () => toggleVoiceRef.current(), downloadVoiceModel, endConversation, flashVoice, conversing: !!convoRef.current };
}
