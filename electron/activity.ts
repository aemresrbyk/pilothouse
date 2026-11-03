// Guesses whether an agent in a PTY is working, waiting for approval, or done, from its output alone.
// Agent TUIs (Claude Code, Codex …) animate a spinner the whole time they work, so steady output = running,
// and output that stops after a run = the agent handed control back to the user.
// shortcut: output heuristic, can misfire on chatty dev servers or new prompt wording; upgrade to agent hooks if it does.

import type { PtyStatus } from '../src/types';

export interface Activity {
  status: PtyStatus;
  busySince: number;
  lastData: number;
  lastInput: number;
  created: number;
}

const ECHO_MS = 400; // output this soon after a keystroke is the echo of the user's typing
const QUIET_MS = 1500; // this long without output ends a run (agent spinners redraw every ~100 ms)
const BUSY_MS = 1500; // output must flow this long to count as a run (skips redraws)
const STARTUP_MS = 5000; // the agent's startup screen is not a run

// Approval prompts of Claude Code, Codex, Gemini CLI and generic y/n questions. Matched with all whitespace
// removed, because TUIs often position words with cursor moves instead of spaces.
const APPROVAL_RE = /doyouwantto|wouldyouliketo|allow(this|command|once)|approve|proceed\?|\(y\/n\)|\[y\/n\]|❯1\.yes|entertoconfirm/i;

// "You've hit your usage limit" (Claude Code, Codex), quota errors (Gemini), provider rate limits (opencode).
// shortcut: can also match when the conversation itself is about limits; it only suggests a hand-off, never acts.
const LIMIT_RE = /usagelimit|limitreached|hityour(usage)?limit|quotaexceeded|exhaustedyour(daily)?quota|resource_exhausted|ratelimitexceeded/i;
export const hitLimit = (tail: string) => LIMIT_RE.test(tail.replace(/\s+/g, ''));

export const newActivity = (now: number): Activity => ({ status: 'idle', busySince: now, lastData: 0, lastInput: 0, created: now });

export function noteOutput(a: Activity, now: number): void {
  if (now - a.lastInput < ECHO_MS) return;
  if (now - a.lastData > QUIET_MS) a.busySince = now;
  a.lastData = now;
}

// tail: the last few hundred characters of output with ANSI codes removed.
export function nextStatus(a: Activity, now: number, tail: string): PtyStatus {
  if (now - a.lastData < QUIET_MS) return now - a.busySince >= BUSY_MS && now - a.created >= STARTUP_MS ? 'running' : a.status;
  if (a.status === 'running') return APPROVAL_RE.test(tail.replace(/\s+/g, '')) ? 'waiting' : 'idle';
  return a.status;
}
