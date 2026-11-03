import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  FolderPlus,
  Terminal,
  UploadCloud,
  Mic,
  Loader2,
  Volume2
} from 'lucide-react';
import { startRecording, Recording } from './utils/voice';
import { converse, ConvoDeps } from './utils/conversationLoop';
import { Heard } from './utils/conversation';
import { WakeWordDetector, startWakeListener, WakeListener } from './utils/wakeword';
import { ProjectItem, ProjectFlags, AppSettings, TabSession, AppTheme, PtyStatus, TabState, InboxEvent, PendingLaunch, handoffPrompt, agentById, agentBinary, agentFlagPresets } from './types';
import { InboxPanel } from './components/InboxPanel';
import { SetupWizard, SetupResult } from './components/SetupWizard';
import { isMac, isAppShortcut, keyLabel, tabKeyLabel } from './utils/platform';
import { THEMES, ThemeConfig, DEFAULT_THEME, themeOrDefault } from './theme';
import { ChromeTabBar } from './components/ChromeTabBar';
import { TabWorkspace } from './components/TabWorkspace';
import { SettingsModal } from './components/SettingsModal';
import { AddProjectModal } from './components/AddProjectModal';
import { CommandPaletteModal } from './components/CommandPaletteModal';
import {
  isSoundEnabled,
  toggleSound,
  playClickSound,
  playLaunchSound
} from './utils/audio';

export const App: React.FC = () => {
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [tabs, setTabs] = useState<TabSession[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>('');
  const [theme, setTheme] = useState<AppTheme>(DEFAULT_THEME);

  const [settings, setSettings] = useState<AppSettings>({
    theme: DEFAULT_THEME,
    defaultTerminal: 'Terminal',
    defaultEditor: 'VSCode',
    defaultFlags: [],
    claudePath: 'claude',
    autoDetectOnStartup: true,
    soundEnabled: true
  });

  const [isSyncing, setIsSyncing] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [healthInfo, setHealthInfo] = useState<{ claudeInstalled: boolean; claudeVersion: string } | null>(null);
  const [toast, setToast] = useState<{ message: string; type?: 'info' | 'success' | 'error' } | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Modals
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAddProjectOpen, setIsAddProjectOpen] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);

  const themeConfig: ThemeConfig = useMemo(() => {
    return THEMES[theme] || THEMES[DEFAULT_THEME];
  }, [theme]);

  const showToast = (message: string, type: 'info' | 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadData = async () => {
    try {
      const [projs, setts] = await Promise.all([
        window.electronAPI.getProjects(),
        window.electronAPI.getSettings()
      ]);
      setProjects(projs);
      setSettings(setts);
      if (!setts.setupDone) setIsSetupOpen(true);

      setTheme(themeOrDefault(setts.theme));

      window.electronAPI.getSystemHealth?.().then((h) => {
        if (h) setHealthInfo(h);
      }).catch(() => {});

      // Restore saved tabs or initialize
      if (setts.savedTabs && setts.savedTabs.length > 0) {
        const validTabs = setts.savedTabs.filter((t) => projs.some((p) => p.id === t.projectId));
        if (validTabs.length > 0) {
          setTabs(validTabs);
          setActiveTabId(setts.activeTabId && validTabs.some((t) => t.id === setts.activeTabId) ? setts.activeTabId : validTabs[0].id);
          return;
        }
      }

      // Default: open initial project tabs
      if (projs.length > 0) {
        const initialProjs = projs.slice(0, Math.min(3, projs.length));
        const initialTabs: TabSession[] = initialProjs.map((p) => ({
          id: `tab-${p.id}`,
          projectId: p.id,
          customInput: '',
          isLaunched: true
        }));
        setTabs(initialTabs);
        setActiveTabId(initialTabs[0].id);
      }
    } catch (err) {
      console.error('Error loading data:', err);
    }
  };

  useEffect(() => {
    loadData();
    setSoundOn(isSoundEnabled());
  }, []);

  // Save tabs state on changes (debounced)
  useEffect(() => {
    if (projects.length > 0) {
      const timer = setTimeout(() => {
        window.electronAPI.updateSettings({
          savedTabs: tabs,
          activeTabId,
          theme
        });
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [tabs, activeTabId, theme, projects.length]);

  const handleSelectTheme = (newTheme: AppTheme) => {
    setTheme(newTheme);
    window.electronAPI.updateSettings({ theme: newTheme });
  };

  const handleSyncClaude = async () => {
    setIsSyncing(true);
    try {
      const res = await window.electronAPI.syncFromClaude();
      await loadData();
      if (res.addedCount > 0) {
        showToast(`DISCOVERED & SYNCED ${res.addedCount} REPOSITORIES`);
      } else {
        showToast('PROJECTS ARE UP TO DATE', 'info');
      }
    } catch (err: any) {
      showToast(`SYNC FAILED: ${err.message}`, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  // Tab Operations
  const handleSelectTab = (tabId: string) => {
    setActiveTabId(tabId);
  };

  const handleCloseTab = (tabId: string) => {
    const remaining = tabs.filter((t) => t.id !== tabId);
    setTabs(remaining);
    if (activeTabId === tabId) {
      setActiveTabId(remaining.length > 0 ? remaining[remaining.length - 1].id : '');
    }
  };

  const handleRemoveProject = async (projectId: string) => {
    const proj = projects.find((p) => p.id === projectId);
    await window.electronAPI.removeProject(projectId);
    const remaining = tabs.filter((t) => t.projectId !== projectId);
    setTabs(remaining);
    if (!remaining.some((t) => t.id === activeTabId)) {
      setActiveTabId(remaining.length > 0 ? remaining[remaining.length - 1].id : '');
    }
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    showToast(`REMOVED: ${proj?.name || 'project'} (files untouched)`, 'info');
  };

  const handleNewTab = (projectId?: string, initialCommand?: string): string => {
    if (!projectId) {
      setIsPaletteOpen(true);
      return '';
    }

    const newTabId = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newTab: TabSession = {
      id: newTabId,
      projectId,
      customInput: '',
      isLaunched: true,
      ...(initialCommand ? { initialCommand } : {})
    };

    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTabId);
    showToast(initialCommand
      ? `RUNNING: ${initialCommand}`
      : `OPENED TERMINAL: ${projects.find((p) => p.id === projectId)?.name || 'Project'}`);
    return newTabId;
  };

  // Control API (Jarvis): focus the project's Claude tab or open one; with a command, always a new tab.
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const newTabRef = useRef(handleNewTab);
  newTabRef.current = handleNewTab;
  useEffect(() => window.electronAPI.onControlOpenTab?.(({ projectId, command }) => {
    if (!command) {
      const existing = tabsRef.current.find((t) => t.projectId === projectId && !t.initialCommand);
      if (existing) {
        setActiveTabId(existing.id);
        return existing.id;
      }
    }
    return newTabRef.current(projectId, command);
  }), []);

  // Agent status per tab (guessed from PTY output in main). unseen = it finished or asked for approval while you looked elsewhere.
  const [tabStatus, setTabStatus] = useState<Record<string, TabState>>({});
  // Inbox: activity log (newest first) + the time you left, when it opened itself on your return.
  const [events, setEvents] = useState<InboxEvent[]>([]);
  const logEvent = (e: InboxEvent) => setEvents((prev) => [e, ...prev].slice(0, 100));
  const [isInboxOpen, setIsInboxOpen] = useState(false);
  const [awaySince, setAwaySince] = useState<number | null>(null);
  const [gridMode, setGridMode] = useState(false);
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const statusCtx = useRef({ tabs, projects, activeTabId, notify: true });
  statusCtx.current = { tabs, projects, activeTabId, notify: settings.notificationsEnabled !== false };

  // Conversation mode waits on a tab's status changes.
  const statusListeners = useRef(new Map<string, Set<(s: PtyStatus) => void>>());

  useEffect(() => window.electronAPI.onPtyStatus(({ id, status }) => {
    statusListeners.current.get(id)?.forEach((fn) => fn(status));
    const ctx = statusCtx.current;
    const tab = ctx.tabs.find((t) => t.id === id);
    if (!tab) return;
    const looking = id === ctx.activeTabId && document.hasFocus();
    // Run-command tabs (dev servers …) get a dot but never nag.
    const attention = status !== 'running' && !looking && !tab.initialCommand;
    // A new run clears an earlier failure.
    setTabStatus((prev) => ({ ...prev, [id]: {
      status,
      unseen: attention,
      failed: status === 'running' ? undefined : prev[id]?.failed,
      limit: status === 'running' ? undefined : prev[id]?.limit
    } }));
    if (attention) logEvent({ tabId: id, kind: status === 'waiting' ? 'waiting' : 'finished', at: Date.now() });
    if (attention && ctx.notify) {
      const name = ctx.projects.find((p) => p.id === tab.projectId)?.name || 'Project';
      const n = new Notification(name, { body: status === 'waiting' ? 'Needs your approval' : 'Finished, your turn' });
      n.onclick = () => {
        window.electronAPI.focusApp();
        setActiveTabId(id);
      };
    }
  }), []);

  // A command exited with an error: its own Inbox section, apart from "needs your answer".
  useEffect(() => window.electronAPI.onPtyFailed(({ id, code }) => {
    const ctx = statusCtx.current;
    const tab = ctx.tabs.find((t) => t.id === id);
    if (!tab || (id === ctx.activeTabId && document.hasFocus())) return;
    setTabStatus((prev) => ({ ...prev, [id]: { status: prev[id]?.status || 'idle', unseen: true, failed: code } }));
    logEvent({ tabId: id, kind: 'failed', at: Date.now(), code });
    if (ctx.notify) {
      const n = new Notification(ctx.projects.find((p) => p.id === tab.projectId)?.name || 'Project', { body: `Failed (exit code ${code})` });
      n.onclick = () => { window.electronAPI.focusApp(); setActiveTabId(id); };
    }
  }), []);

  // The agent ran out of its plan's usage: offer to continue with another agent (Inbox + notification).
  useEffect(() => window.electronAPI.onPtyLimit(({ id }) => {
    const ctx = statusCtx.current;
    const tab = ctx.tabs.find((t) => t.id === id);
    if (!tab) return;
    setTabStatus((prev) => ({ ...prev, [id]: { status: prev[id]?.status || 'idle', unseen: true, failed: prev[id]?.failed, limit: true } }));
    logEvent({ tabId: id, kind: 'limit', at: Date.now() });
    setAwaySince(null);
    setIsInboxOpen(true);
    if (ctx.notify) {
      const n = new Notification(ctx.projects.find((p) => p.id === tab.projectId)?.name || 'Project', { body: 'Usage limit reached. Continue with another agent from the Inbox.' });
      n.onclick = () => { window.electronAPI.focusApp(); setIsInboxOpen(true); };
    }
  }), []);

  // Looking at a tab clears its "unseen" and "failed" marks.
  useEffect(() => {
    const clear = () => {
      if (!document.hasFocus()) return;
      setTabStatus((prev) => (prev[activeTabId]?.unseen || prev[activeTabId]?.failed !== undefined
        ? { ...prev, [activeTabId]: { ...prev[activeTabId], unseen: false, failed: undefined } } : prev));
    };
    clear();
    window.addEventListener('focus', clear);
    return () => window.removeEventListener('focus', clear);
  }, [activeTabId]);

  // Back after a while with something new: open the Inbox on what happened meanwhile.
  const eventsRef = useRef(events);
  eventsRef.current = events;
  useEffect(() => {
    let leftAt = 0;
    const onBlur = () => { leftAt = Date.now(); };
    const onFocus = () => {
      const since = leftAt;
      leftAt = 0;
      if (since && Date.now() - since >= 5 * 60_000 && eventsRef.current.some((e) => e.at >= since)) {
        setAwaySince(since);
        setIsInboxOpen(true);
      }
    };
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    return () => { window.removeEventListener('blur', onBlur); window.removeEventListener('focus', onFocus); };
  }, []);

  // Tabs that need you: unseen result, pending approval or a failure. Dock badge + Inbox count.
  const needsYou = tabs.filter((t) => tabStatus[t.id]?.unseen || tabStatus[t.id]?.limit || tabStatus[t.id]?.status === 'waiting').length;
  useEffect(() => {
    window.electronAPI.setBadge(needsYou);
  }, [needsYou]);

  // Voice prompts: hotkey or mic button -> record until a pause -> local Whisper -> typed into the active tab.
  type VoicePhase = 'idle' | 'listening' | 'transcribing' | 'needs-model' | 'downloading' | 'speaking' | 'working';
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

  // The menu bar's "Stop Listening" changes settings from main.
  useEffect(() => window.electronAPI.onSettingsChanged((s) => setSettings(s)), []);

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

  const handleBrowseFolder = async () => {
    try {
      const dir = await window.electronAPI.pickDirectory();
      if (dir) {
        await handleAddProject(dir);
      }
    } catch (err: any) {
      showToast(`Browse failed: ${err.message}`, 'error');
    }
  };

  const handleUpdateFlags = async (projectId: string, flags: ProjectFlags) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, flags } : p))
    );
    await window.electronAPI.updateProject(projectId, { flags });
  };

  // Each agent keeps its own flags per project, so switching back restores them.
  const handleSwitchAgent = (projectId: string, agentId: string) => {
    const p = projects.find((x) => x.id === projectId);
    if (!p || (p.agent || 'claude') === agentId) return;
    const agentFlags = { ...(p.agentFlags || {}), [p.agent || 'claude']: p.flags };
    const updates = { agent: agentId, flags: agentFlags[agentId] || [], agentFlags };
    setProjects((prev) => prev.map((x) => (x.id === projectId ? { ...x, ...updates } : x)));
    window.electronAPI.updateProject(projectId, updates);
  };

  const handleAddProject = async (folderPath: string) => {
    try {
      const newProj = await window.electronAPI.addProject(folderPath);
      await loadData();
      handleNewTab(newProj.id);
      showToast(`REGISTERED: ${newProj.name}`);
    } catch (err: any) {
      showToast(`FAILED: ${err.message}`, 'error');
    }
  };

  // Hand-off: write .pilothouse/handoff.md from the current agent's work, switch the project to the next agent and
  // restart the tab with a first prompt telling it to read that file.
  // sessionFile/fromAgentId: continue from a past conversation picked in History instead of the latest one.
  const [pendingLaunches, setPendingLaunches] = useState<Record<string, PendingLaunch>>({});
  const handleHandoff = async (tabId: string, toAgentId: string, sessionFile?: string, fromAgentId?: string) => {
    const tab = tabs.find((t) => t.id === tabId);
    const proj = projects.find((p) => p.id === tab?.projectId);
    if (!tab || !proj) return;
    const from = agentById(fromAgentId || proj.agent);
    const r = await window.electronAPI.writeHandoff(proj.path, from.id, sessionFile);
    if (!r.path) return showToast(`HAND-OFF FAILED: ${r.error || 'unknown error'}`, 'error');
    handleSwitchAgent(proj.id, toAgentId);
    setPendingLaunches((p) => ({ ...p, [tabId]: { prompt: handoffPrompt(from.name) } }));
    setTabStatus((prev) => ({ ...prev, [tabId]: { status: 'idle', unseen: false } }));
    setActiveTabId(tabId);
    setIsInboxOpen(false);
    showToast(`HANDED OFF: ${from.name} → ${agentById(toAgentId).name}`, 'success');
  };
  // Reopen a past session in the agent that wrote it, switching the project's agent if needed.
  const handleResumeAs = (tabId: string, agentId: string, sessionId: string) => {
    const proj = projects.find((p) => p.id === tabs.find((t) => t.id === tabId)?.projectId);
    if (!proj) return;
    handleSwitchAgent(proj.id, agentId);
    setPendingLaunches((p) => ({ ...p, [tabId]: { resumeId: sessionId } }));
  };

  // A new tab in its own git worktree + branch, registered as a project so it gets history, CLAUDE.md etc.
  const handleOpenWorktree = async (projectPath: string) => {
    const r = await window.electronAPI.addWorktree(projectPath);
    if (!r.path) return showToast(`WORKTREE FAILED: ${r.error || 'unknown error'}`, 'error');
    await handleAddProject(r.path);
  };

  const handleOpenFolder = async (path: string) => {
    await window.electronAPI.openFolder(path);
  };

  const handleOpenEditor = async (path: string, editor?: string) => {
    await window.electronAPI.openInEditor(path, editor || settings.defaultEditor);
  };

  // Setup wizard: store the agent paths, add/remove projects, set each project's agent.
  const handleFinishSetup = async ({ agentPaths, projects: rows }: SetupResult) => {
    setIsSetupOpen(false);
    const norm = (p: string) => p.replace(/[\\/]+$/, '');
    const current = await window.electronAPI.getProjects();
    let failed = 0;
    for (const r of rows) {
      const existing = current.find((p) => norm(p.path) === norm(r.path));
      try {
        if (existing && !r.include) await window.electronAPI.removeProject(existing.id); // only leaves the list; files untouched
        if (!r.include) continue;
        const proj = existing || await window.electronAPI.addProject(r.path);
        const from = proj.agent || 'claude';
        if (from !== r.agent) {
          // Same bookkeeping as switching agent in the toolbar: each agent keeps its own flags.
          const agentFlags = { ...(proj.agentFlags || {}), [from]: proj.flags };
          await window.electronAPI.updateProject(proj.id, { agent: r.agent, flags: agentFlags[r.agent] || [], agentFlags });
        }
      } catch {
        failed++;
      }
    }
    // Claude's path goes to its existing Settings field, so editing it there keeps working.
    const { claude, ...others } = agentPaths;
    setSettings(await window.electronAPI.updateSettings({ agentPaths: others, ...(claude ? { claudePath: claude } : {}), setupDone: true }));
    const projs = await window.electronAPI.getProjects();
    setProjects(projs);
    setTabs((prev) => prev.filter((t) => projs.some((p) => p.id === t.projectId)));
    showToast(failed ? `SETUP SAVED, ${failed} PROJECT(S) FAILED` : `READY: ${rows.filter((r) => r.include).length} PROJECTS`, failed ? 'error' : 'success');
  };
  const handleSkipSetup = async () => {
    setIsSetupOpen(false);
    setSettings(await window.electronAPI.updateSettings({ setupDone: true }));
  };

  const handleSaveSettings = async (newSettings: Partial<AppSettings>) => {
    const updated = await window.electronAPI.updateSettings(newSettings);
    setSettings(updated);
    if (newSettings.theme) {
      setTheme(themeOrDefault(newSettings.theme));
    }
    showToast('PREFERENCES STORED');
  };

  // Drag and Drop folder handling
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDraggingOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      const targetPath = window.electronAPI.getPathForFile(file);
      if (targetPath) {
        const check = await window.electronAPI.validatePath(targetPath);
        if (check.exists && check.isDirectory) {
          playClickSound();
          handleAddProject(targetPath);
        } else {
          showToast('Dropped item is not a directory', 'error');
        }
      }
    }
  };

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ⌘P / ⌘K (Ctrl+Shift+P / K off macOS) -> Command Palette
      if (isAppShortcut(e, 'p') || isAppShortcut(e, 'k')) {
        e.preventDefault();
        playClickSound();
        setIsPaletteOpen(true);
        return;
      }

      // ⌘I -> Inbox
      if (isAppShortcut(e, 'i')) {
        e.preventDefault();
        setAwaySince(null);
        setIsInboxOpen((open) => !open);
        return;
      }

      // ⌘T -> Open New Tab / Project Selector
      if (isAppShortcut(e, 't')) {
        e.preventDefault();
        playClickSound();
        setIsPaletteOpen(true);
      }

      // ⌘W -> Close active tab
      if (isAppShortcut(e, 'w')) {
        if (tabs.length > 1 && activeTabId) {
          e.preventDefault();
          playClickSound();
          handleCloseTab(activeTabId);
        }
      }

      // Cmd/Ctrl + 1..9 -> Switch tab
      if ((isMac ? e.metaKey : e.ctrlKey) && /^[1-9]$/.test(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        if (tabs[idx]) {
          e.preventDefault();
          playClickSound();
          setActiveTabId(tabs[idx].id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tabs, activeTabId, projects]);

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="flex flex-col h-screen w-screen overflow-hidden font-mono relative"
      style={{
        backgroundColor: themeConfig.bgMain,
        color: themeConfig.textPrimary
      }}
    >
      {/* 1. Google Chrome Style Tab Bar (with dedicated traffic light gap & theme picker) */}
      <ChromeTabBar
        tabs={tabs}
        activeTabId={activeTabId}
        tabStatus={tabStatus}
        projects={projects}
        onSelectTab={handleSelectTab}
        onCloseTab={handleCloseTab}
        onNewTab={handleNewTab}
        onBrowseFolder={handleBrowseFolder}
        onOpenAddModal={() => setIsAddProjectOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenPalette={() => setIsPaletteOpen(true)}
        voiceActive={voice.phase === 'listening'}
        voiceHotkey={settings.voiceHotkey || 'CommandOrControl+Shift+Space'}
        onToggleVoice={() => toggleVoiceRef.current()}
        onSyncClaude={handleSyncClaude}
        isSyncing={isSyncing}
        soundEnabled={soundOn}
        onToggleSound={() => setSoundOn(toggleSound())}
        currentTheme={theme}
        onSelectTheme={handleSelectTheme}
        themeConfig={themeConfig}
        inboxCount={needsYou}
        onOpenInbox={() => { setAwaySince(null); setIsInboxOpen(true); }}
        gridMode={gridMode}
        onToggleGrid={() => setGridMode((g) => !g)}
      />

      {/* 2. Embedded Terminal Workspace Area (All tabs preserved in DOM; grid mode shows them side by side) */}
      <div
        className="flex-1 flex flex-col overflow-hidden relative"
        style={gridMode && tabs.length > 1 ? {
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.ceil(Math.sqrt(tabs.length))}, minmax(0, 1fr))`,
          gridAutoRows: 'minmax(0, 1fr)',
          gap: 2,
          backgroundColor: themeConfig.border
        } : undefined}
      >
        {tabs.length > 0 ? (
          tabs.map((tab) => {
            const proj = projects.find((p) => p.id === tab.projectId);
            if (!proj) return null;
            const isTabActive = tab.id === activeTabId;
            const inGrid = gridMode && tabs.length > 1;

            return (
              <div
                key={tab.id}
                onMouseDownCapture={inGrid ? () => setActiveTabId(tab.id) : undefined}
                className="flex-1 w-full h-full flex flex-col overflow-hidden"
                style={{
                  display: isTabActive || inGrid ? 'flex' : 'none',
                  backgroundColor: themeConfig.bgMain,
                  outline: inGrid && isTabActive ? `1px solid ${themeConfig.accent}` : undefined
                }}
              >
                <TabWorkspace
                  project={proj}
                  tabSession={tab}
                  onUpdateFlags={handleUpdateFlags}
                  onOpenFolder={handleOpenFolder}
                  onOpenEditor={handleOpenEditor}
                  themeConfig={themeConfig}
                  isActive={isTabActive}
                  agent={agentById(proj.agent)}
                  agentBinary={agentBinary(agentById(proj.agent), settings)}
                  flagPresets={agentFlagPresets(settings, proj.agent)}
                  quickCommands={settings.quickCommands}
                  onSwitchAgent={handleSwitchAgent}
                  onRunCommand={(cmd) => handleNewTab(proj.id, cmd)}
                  onOpenWorktree={() => handleOpenWorktree(proj.path)}
                  onHandoff={(agentId) => handleHandoff(tab.id, agentId)}
                  onHandoffSession={(agentId, sessionFile, fromAgent) => handleHandoff(tab.id, agentId, sessionFile, fromAgent)}
                  onResumeAs={(agentId, sessionId) => handleResumeAs(tab.id, agentId, sessionId)}
                  pendingLaunch={pendingLaunches[tab.id]}
                  modelChoice={proj.agentModels?.[proj.agent || 'claude']}
                  onSetModel={(choice) => {
                    const agentModels = { ...(proj.agentModels || {}), [proj.agent || 'claude']: choice };
                    setProjects((prev) => prev.map((p) => (p.id === proj.id ? { ...p, agentModels } : p)));
                    window.electronAPI.updateProject(proj.id, { agentModels });
                  }}
                  onLaunchUsed={() => setPendingLaunches(({ [tab.id]: _, ...rest }) => rest)}
                  onSaveCustomCommands={async (cmds) => {
                    const updated = await window.electronAPI.updateProject(proj.id, { customRunCommands: cmds });
                    if (updated) setProjects((prev) => prev.map((p) => (p.id === proj.id ? { ...p, customRunCommands: cmds } : p)));
                  }}
                />
              </div>
            );
          })
        ) : (
          <div
            className="flex-1 flex flex-col items-center justify-center p-8 select-none text-center"
            style={{ backgroundColor: themeConfig.bgMain }}
          >
            <Terminal className="w-10 h-10 mb-3" style={{ color: themeConfig.accent }} />
            <h2 className="text-sm font-bold" style={{ color: themeConfig.textPrimary }}>
              NO PROJECT TERMINAL OPEN
            </h2>
            <p className="text-xs mt-1 max-w-xs" style={{ color: themeConfig.textMuted }}>
              Press {keyLabel('T')} or click [+] to open a project with your agent.
            </p>
            {projects.length > 0 && (
              <button
                onClick={() => handleNewTab(projects[0].id)}
                className="mt-4 px-4 py-2 rounded-lg text-xs font-bold shadow-md transition-all active:scale-95"
                style={{ backgroundColor: themeConfig.accent, color: themeConfig.accentText }}
              >
                Open {projects[0].name}
              </button>
            )}
          </div>
        )}
      </div>

      {/* 3. Minimalist Clean Footer */}
      <footer
        className="h-6 px-3 flex items-center justify-between text-[10px] font-mono border-t select-none"
        style={{
          backgroundColor: themeConfig.bgHeader,
          borderColor: themeConfig.border,
          color: themeConfig.textMuted
        }}
      >
        <div className="flex items-center gap-3">
          <span
            onClick={() => setIsPaletteOpen(true)}
            className="cursor-pointer hover:opacity-100 transition-opacity"
          >
            <span style={{ color: themeConfig.accent }}>{keyLabel('P')}</span> Find
          </span>
          <span><span style={{ color: themeConfig.accent }}>{keyLabel('T')}</span> Tab</span>
          <span><span style={{ color: themeConfig.accent }}>{keyLabel('W')}</span> Close</span>
          <span><span style={{ color: themeConfig.accent }}>{tabKeyLabel}</span> Switch</span>
        </div>

        <div className="flex items-center gap-3">
          {healthInfo && (
            <div className="flex items-center gap-1.5" title={healthInfo.claudeVersion}>
              <span
                className="w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ backgroundColor: healthInfo.claudeInstalled ? '#10b981' : '#ef4444' }}
              />
              <span style={{ color: healthInfo.claudeInstalled ? themeConfig.textPrimary : '#ef4444' }}>
                {healthInfo.claudeInstalled ? `Claude ${healthInfo.claudeVersion.replace(' (Claude Code)', '')}` : 'Claude Not Found'}
              </span>
              <span>•</span>
            </div>
          )}
          <span>{tabs.length} SESSIONS ACTIVE</span>
          <span>•</span>
          <span>{themeConfig.name.toUpperCase()}</span>
        </div>
      </footer>

      {/* Drag & Drop Overlay */}
      {isDraggingOver && (
        <div className="absolute inset-0 z-50 bg-black/85 backdrop-blur-md border-2 border-dashed flex flex-col items-center justify-center animate-fade-in" style={{ borderColor: themeConfig.accent }}>
          <div className="p-4 rounded-2xl mb-3 animate-bounce" style={{ backgroundColor: themeConfig.accentBg, color: themeConfig.accent }}>
            <UploadCloud className="w-10 h-10" />
          </div>
          <h3 className="text-sm font-bold tracking-wider" style={{ color: themeConfig.textPrimary }}>
            DROP FOLDER HERE TO OPEN AS PROJECT TERMINAL
          </h3>
          <p className="text-xs mt-1" style={{ color: themeConfig.textMuted }}>
            Will register repository and open in a new tab.
          </p>
        </div>
      )}

      {/* Voice panel */}
      {(voice.phase !== 'idle' || voice.note) && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 max-w-[min(560px,90vw)] px-4 py-2.5 rounded-xl border shadow-2xl flex items-center gap-3 text-xs"
          style={{ backgroundColor: themeConfig.bgCard, borderColor: voice.phase === 'listening' ? '#ef4444' : themeConfig.border, color: themeConfig.textPrimary }}
        >
          {voice.phase === 'listening' && (
            <>
              <Mic className="w-4 h-4 flex-shrink-0 animate-pulse" style={{ color: '#ef4444' }} />
              <div className="w-16 h-1.5 rounded-full overflow-hidden flex-shrink-0" style={{ backgroundColor: themeConfig.border }}>
                <div className="h-full transition-all duration-75" style={{ width: `${Math.round((voice.level || 0) * 100)}%`, backgroundColor: '#ef4444' }} />
              </div>
              <span>Listening… I'll stop when you pause. <span style={{ color: themeConfig.textMuted }}>Esc {convoRef.current ? 'ends' : 'cancels'}</span></span>
            </>
          )}
          {voice.phase === 'transcribing' && (
            <>
              <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" style={{ color: themeConfig.accent }} />
              <span className="truncate">{voice.note ? `“${voice.note}”` : 'Transcribing on this computer…'}</span>
            </>
          )}
          {voice.phase === 'speaking' && (
            <>
              <Volume2 className="w-4 h-4 flex-shrink-0 animate-pulse" style={{ color: themeConfig.accent }} />
              <span className="line-clamp-2">{voice.note}</span>
              <span className="flex-shrink-0 text-[10px]" style={{ color: themeConfig.textMuted }}>talk to interrupt · Esc ends</span>
            </>
          )}
          {voice.phase === 'working' && (
            <>
              <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" style={{ color: themeConfig.accent }} />
              <span>Working on it… <span style={{ color: themeConfig.textMuted }}>say “stop” to interrupt · Esc ends</span></span>
            </>
          )}
          {voice.phase === 'needs-model' && (
            <>
              <Mic className="w-4 h-4 flex-shrink-0" style={{ color: themeConfig.accent }} />
              <span>Voice prompts need a one-time 574 MB speech model. It runs fully offline.</span>
              <button className="px-2 py-1 rounded font-bold flex-shrink-0" style={{ backgroundColor: themeConfig.accent, color: themeConfig.accentText }} onClick={downloadVoiceModel}>
                Download
              </button>
              <button className="px-2 py-1 rounded flex-shrink-0" style={{ color: themeConfig.textMuted }} onClick={() => setVoice({ phase: 'idle' })}>
                Not now
              </button>
            </>
          )}
          {voice.phase === 'downloading' && (
            <>
              <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" style={{ color: themeConfig.accent }} />
              <span>Downloading speech model… {Math.round((voice.progress || 0) * 100)}%</span>
            </>
          )}
          {voice.phase === 'idle' && voice.note && <span className="truncate">{voice.note}</span>}
        </div>
      )}

      {/* Floating Toast Notification */}
      {toast && (
        <div className="fixed bottom-10 right-4 z-50 animate-fade-in font-mono text-xs shadow-2xl">
          <div
            className="px-3.5 py-2 rounded-lg border flex items-center gap-2 shadow-lg"
            style={{
              backgroundColor: themeConfig.bgCard,
              borderColor: toast.type === 'error' ? '#ef4444' : themeConfig.accent,
              color: toast.type === 'error' ? '#ef4444' : themeConfig.textPrimary
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: toast.type === 'error' ? '#ef4444' : themeConfig.accent }} />
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Modals */}
      <AddProjectModal
        isOpen={isAddProjectOpen}
        onClose={() => setIsAddProjectOpen(false)}
        onAddProject={handleAddProject}
      />

      <CommandPaletteModal
        isOpen={isPaletteOpen}
        onClose={() => setIsPaletteOpen(false)}
        projects={projects}
        currentProjectId={tabs.find((t) => t.id === activeTabId)?.projectId}
        themeConfig={themeConfig}
        onSelectProject={(pId) => handleNewTab(pId)}
        onRemoveProject={handleRemoveProject}
        onOpenAddModal={() => setIsAddProjectOpen(true)}
        onBrowseFolder={handleBrowseFolder}
      />

      <InboxPanel
        isOpen={isInboxOpen}
        onClose={() => setIsInboxOpen(false)}
        tabs={tabs}
        projects={projects}
        tabStatus={tabStatus}
        events={events}
        awaySince={awaySince}
        onGoToTab={setActiveTabId}
        onStopTab={handleCloseTab}
        onHandoff={handleHandoff}
        themeConfig={themeConfig}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSaveSettings={handleSaveSettings}
        onRunSetup={() => setIsSetupOpen(true)}
      />

      <SetupWizard
        isOpen={isSetupOpen}
        onFinish={handleFinishSetup}
        onSkip={handleSkipSetup}
        themeConfig={themeConfig}
      />
    </div>
  );
};

export default App;
