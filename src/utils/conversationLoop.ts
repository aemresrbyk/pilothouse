// Conversation mode: a spoken back-and-forth with the agent in the active tab.
// listen -> (ask again if unclear) -> send -> wait while the agent works (you can still say "stop")
// -> read its answer aloud or ask its approval question -> listen again. Talking over it cuts it off.
// Audio, Whisper and the terminal come in through ConvoDeps, so the turn logic is testable without them.
import { Heard, Lang, langOf, judge, yesNo, isStop, isGoodbye, applyCorrection, speakable, approvalQuestion, say as T } from './conversation';

export type ConvoState = 'listening' | 'thinking' | 'speaking' | 'working';

export interface ConvoDeps {
  // Record one utterance and transcribe it; null = nobody spoke before the timeout or the signal aborted.
  listen(opts?: { timeoutMs?: number; signal?: AbortSignal }): Promise<Heard | null>;
  // Say text; if the user talks over it, speech stops and their utterance comes back as `heard`.
  speak(text: string, lang: Lang): Promise<{ interrupted: boolean; heard?: Heard | null }>;
  send(text: string): void; // type into the agent and press Enter
  keys(seq: string): void; // raw keystrokes (approve, deny, interrupt)
  waitForAgent(signal: AbortSignal): Promise<'idle' | 'waiting' | 'timeout'>;
  lastReply(): Promise<string | null>;
  screen(): Promise<string>;
  agentName: string;
  approveKey: string;
  denyKey: string;
  interruptKey: string;
  vocab: string[];
  fixedLang?: Lang;
  cancelled(): boolean;
  onState(state: ConvoState, text?: string): void;
}

export async function converse(d: ConvoDeps, first?: Heard | null): Promise<'silence' | 'goodbye' | 'cancelled' | 'limit'> {
  let lang: Lang = d.fixedLang ?? 'en';
  let awaitingApproval = false;

  // Speak, then hear the next thing the user says (cut-in speech or a fresh listen).
  const talk = async (text: string): Promise<Heard | null> => {
    d.onState('speaking', text);
    const r = await d.speak(text, lang);
    if (d.cancelled()) return null;
    if (r.interrupted) return r.heard ?? null;
    d.onState('listening');
    return d.listen();
  };

  // While the agent works keep listening: "stop" interrupts it, a clear instruction is queued to it.
  const afterSend = async (): Promise<Heard | null> => {
    for (;;) {
      d.onState('working');
      const ctl = new AbortController();
      const agent = d.waitForAgent(ctl.signal).then((r) => ({ agent: r }) as const);
      const ears = d.listen({ timeoutMs: 20 * 60_000, signal: ctl.signal }).then((h) => ({ heard: h }) as const);
      const first = await Promise.race([agent, ears]);
      ctl.abort();
      if (d.cancelled()) return null;
      if ('heard' in first) {
        const h = first.heard;
        if (!h) continue;
        if (!d.fixedLang) lang = langOf(h.language);
        if (isStop(h.text)) {
          d.keys(d.interruptKey);
          return talk(T[lang].stopped);
        }
        if (judge(h, d.vocab).kind === 'ok') {
          d.send(h.text);
          await d.speak(T[lang].sentNoWait, lang);
        }
        continue; // unclear chatter while it works is ignored
      }
      if (first.agent === 'waiting') {
        awaitingApproval = true;
        return talk(T[lang].approval(approvalQuestion(await d.screen()), d.agentName));
      }
      const reply = await d.lastReply();
      return talk(reply ? speakable(reply, lang) : T[lang].noReply);
    }
  };

  d.onState('listening');
  let heard = first === undefined ? await d.listen() : first;
  for (let turn = 0; turn < 60; turn++) {
    if (d.cancelled()) return 'cancelled';
    if (!heard) return 'silence';
    if (!d.fixedLang) lang = langOf(heard.language);
    d.onState('thinking', heard.text);

    if (awaitingApproval) {
      const yn = yesNo(heard.text);
      if (!yn) { heard = await talk(T[lang].yesOrNo); continue; }
      awaitingApproval = false;
      if (yn === 'no') {
        d.keys(d.denyKey);
        heard = await talk(T[lang].denied);
        continue;
      }
      d.keys(d.approveKey);
      await d.speak(T[lang].approved, lang);
      heard = await afterSend();
      continue;
    }

    if (isGoodbye(heard.text)) {
      d.onState('speaking', T[lang].bye);
      await d.speak(T[lang].bye, lang);
      return 'goodbye';
    }
    if (isStop(heard.text)) {
      d.keys(d.interruptKey);
      heard = await talk(T[lang].stopped);
      continue;
    }

    const verdict = judge(heard, d.vocab);
    if (verdict.kind === 'repeat') { heard = await talk(T[lang].didntCatch); continue; }
    let text = heard.text;
    if (verdict.kind === 'confirm') {
      const reply = await talk(T[lang].unsure(verdict.words));
      if (!reply) return d.cancelled() ? 'cancelled' : 'silence';
      const yn = yesNo(reply.text);
      if (yn === 'no') { heard = await talk(T[lang].didntCatch); continue; }
      if (yn !== 'yes') text = applyCorrection(text, verdict.words, reply.text);
    }

    d.send(text);
    await d.speak(T[lang].onIt, lang);
    heard = await afterSend();
  }
  return 'limit';
}
