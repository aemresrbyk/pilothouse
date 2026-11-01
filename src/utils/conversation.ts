// Turn-taking rules for conversation mode: when to ask the speaker to repeat, how to read yes/no and corrections,
// and how to turn an agent's markdown answer into something worth hearing. Pure functions, no audio.

export interface Word {
  text: string;
  p: number; // lowest token probability inside the word
}

export interface Heard {
  text: string;
  language: string;
  words: Word[];
}

export type Lang = 'en' | 'tr';
export const langOf = (code?: string): Lang => (code === 'tr' ? 'tr' : 'en');

const LOW_P = 0.3;
// Tokens Whisper is often unsure about even when right (short tech words).
const FAMILIAR = /^(npm|pnpm|yarn|bun|git|ts|js|tsx|jsx|api|ui|cli|json|yaml|readme|claude|codex|ok|okay|tamam)$/i;

const bare = (w: string) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}.]+$/gu, '').replace(/\.$/, '');

export type Verdict = { kind: 'ok' } | { kind: 'repeat' } | { kind: 'confirm'; words: string[] };

// vocab: words the user is likely to say that Whisper may doubt (project names, files).
export function judge(h: Heard, vocab: string[] = []): Verdict {
  const words = h.words.filter((w) => bare(w.text));
  if (!h.text.trim() || !words.length) return { kind: 'repeat' };
  const known = new Set(vocab.map((v) => v.toLowerCase()));
  // Familiar tech words and project names are excused: Whisper doubts them even when right.
  const judged = words.filter((w) => !FAMILIAR.test(bare(w.text)) && !known.has(bare(w.text).toLowerCase()));
  if (!judged.length) return { kind: 'ok' };
  const unsure = judged.filter((w) => w.p < LOW_P);
  const mean = judged.reduce((s, w) => s + w.p, 0) / judged.length;
  if (mean < 0.5 || unsure.length > Math.max(2, judged.length / 3)) return { kind: 'repeat' };
  if (unsure.length) return { kind: 'confirm', words: unsure.slice(0, 2).map((w) => bare(w.text)) };
  return { kind: 'ok' };
}

const YES = /^(yes|yeah|yep|yup|sure|ok|okay|correct|right|go ahead|do it|approve|evet|tamam|olur|doğru|aynen|onayla|devam|devam et|tabii|tabi)\b/i;
const NO = /^(no|nope|nah|don'?t|cancel|stop|wrong|deny|hayır|yok|iptal|dur|vazgeç|yanlış|istemiyorum|reddet)\b/i;
const clean = (t: string) => t.trim().toLowerCase().replace(/[.,!?]+/g, '').replace(/\s+/g, ' ');

export function yesNo(text: string): 'yes' | 'no' | null {
  const t = clean(text);
  if (NO.test(t)) return 'no';
  if (YES.test(t)) return 'yes';
  return null;
}

const STOP = /^(stop|wait|hold on|cancel that|dur|bekle|durdur|iptal et)$/i;
export const isStop = (text: string) => STOP.test(clean(text));

const BYE = /^(bye|goodbye|that'?s all|thanks?(,? that'?s all)?|thank you|that'?s it|görüşürüz|teşekkürler|teşekkür ederim|sağ ol|bu kadar|tamam bu kadar|kapat)$/i;
export const isGoodbye = (text: string) => BYE.test(clean(text));

// The user answered "did you say X?" with something other than yes/no: a short reply replaces the doubtful word,
// a long one is a restatement of the whole request.
export function applyCorrection(original: string, unsure: string[], reply: string): string {
  const r = reply.trim().replace(/[.!?]+$/, '');
  if (r.split(/\s+/).length > 4 || !unsure.length) return r;
  const at = original.indexOf(unsure[0]);
  return at < 0 ? r : original.slice(0, at) + r + original.slice(at + unsure[0].length);
}

// Markdown answer -> a few spoken sentences. Code and long lists stay on screen.
export function speakable(md: string, lang: Lang, max = 420): string {
  const onScreen = lang === 'tr' ? 'Kod ekranda.' : 'The code is on screen.';
  let t = md
    .replace(/```[\s\S]*?```/g, ` ${onScreen} `)
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*#+\s*/gm, '')
    .replace(/^\s*\|.*\|\s*$/gm, '')
    .replace(/[*_~>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  t = t.replace(new RegExp(`(${onScreen.replace('.', '\\.')}\\s*)+`, 'g'), onScreen + ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  const more = lang === 'tr' ? 'Devamı ekranda.' : 'The rest is on screen.';
  return (end > max / 3 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '') + '…') + ' ' + more;
}

// The approval question at the bottom of an agent's screen ("Do you want to make this edit to auth.ts?").
export function approvalQuestion(screen: string): string | null {
  const lines = screen.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/(do you want|would you like|allow|approve|proceed)[^?]*\?/i.test(lines[i])) return lines[i].replace(/^[^A-Za-z]+/, '');
  }
  return null;
}

const T = {
  en: {
    didntCatch: "Sorry, I didn't catch that. Could you say it again?",
    unsure: (w: string[]) => `Did you say ${w.map((x) => `"${x}"`).join(' and ')}? Say yes, or say it again.`,
    onIt: 'On it.',
    sentNoWait: 'Sent.',
    approval: (q: string | null, agent: string) => `${agent} asks: ${q ?? 'it needs your approval.'} Yes or no?`,
    approved: 'Approved.',
    denied: 'Okay, cancelled.',
    yesOrNo: 'Please say yes or no.',
    stopped: 'Stopped.',
    noTab: 'Open a project tab first.',
    noReply: 'Done. Have a look at the screen.',
    bye: 'Okay, talk later.'
  },
  tr: {
    didntCatch: 'Kusura bakma, anlayamadım. Tekrar söyler misin?',
    unsure: (w: string[]) => `${w.map((x) => `"${x}"`).join(' ve ')} mi dedin? Evet de, ya da tekrar söyle.`,
    onIt: 'Tamam, bakıyorum.',
    sentNoWait: 'Gönderdim.',
    approval: (q: string | null, agent: string) => `${agent} onay istiyor: ${q ?? 'devam etmek için iznin gerekiyor.'} Evet mi, hayır mı?`,
    approved: 'Onaylandı.',
    denied: 'Tamam, iptal ettim.',
    yesOrNo: 'Evet ya da hayır der misin?',
    stopped: 'Durdurdum.',
    noTab: 'Önce bir proje sekmesi aç.',
    noReply: 'Bitti, ekrana bakabilirsin.',
    bye: 'Tamam, görüşürüz.'
  }
};
export const say = T;
