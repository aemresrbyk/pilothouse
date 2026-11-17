// Interface language. The app's text is English in the components; when another language is picked, a small
// observer swaps every visible string, tooltip and placeholder that has a translation (exact match), and puts the
// English back when switching to English. Terminals, code, file contents and inputs are never touched.
// To translate a string set from code (toasts etc.), use t('English text').
import tr from './tr';
import es from './es';
import pt from './pt';
import de from './de';
import fr from './fr';
import ru from './ru';
import zh from './zh';
import ja from './ja';
import ko from './ko';

type Dict = Record<string, string>;
const DICTS: Record<string, Dict> = { tr, es, pt, de, fr, ru, zh, ja, ko };

// Each named in its own language.
export const UI_LANGUAGES: [string, string][] = [
  ['auto', 'Auto (system)'], ['en', 'English'], ['tr', 'Türkçe'], ['es', 'Español'], ['pt', 'Português'], ['de', 'Deutsch'],
  ['fr', 'Français'], ['ru', 'Русский'], ['zh', '中文'], ['ja', '日本語'], ['ko', '한국어']
];

// 'auto' (or unset) follows the system language when there is a translation, else English.
export function uiLanguageFor(setting?: string): string {
  const code = (setting && setting !== 'auto' ? setting : navigator.language || 'en').slice(0, 2).toLowerCase();
  return DICTS[code] ? code : 'en';
}

let dict: Dict = {};
export const t = (s: string): string => dict[s] ?? s;

const ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];
const SKIP = '.xterm, pre, code, textarea, [contenteditable="true"], [data-no-i18n]';
// Per node (and per attribute): the English original and what we last wrote. If the current value isn't what we
// wrote, someone (React) set a new original.
const textState = new WeakMap<Text, { orig: string; shown: string }>();
const attrState = new WeakMap<Element, Record<string, { orig: string; shown: string }>>();

function textNode(n: Text) {
  const el = n.parentElement;
  if (!el || el.closest(SKIP)) return;
  const current = n.nodeValue || '';
  const st = textState.get(n);
  const orig = st && current === st.shown ? st.orig : current;
  const key = orig.trim();
  const want = key && dict[key] ? orig.replace(key, dict[key]) : orig;
  textState.set(n, { orig, shown: want });
  if (current !== want) n.nodeValue = want;
}

function attrs(el: Element) {
  if (el.closest(SKIP)) return;
  for (const a of ATTRS) {
    const current = el.getAttribute(a);
    if (current === null) continue;
    const saved = attrState.get(el) || {};
    const orig = saved[a] && current === saved[a].shown ? saved[a].orig : current;
    const want = dict[orig] ?? orig;
    saved[a] = { orig, shown: want };
    attrState.set(el, saved);
    if (current !== want) el.setAttribute(a, want);
  }
}

function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) return textNode(root as Text);
  if (!(root instanceof Element)) return;
  attrs(root);
  const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = it.nextNode(); n; n = it.nextNode()) n.nodeType === Node.TEXT_NODE ? textNode(n as Text) : attrs(n as Element);
}

let observer: MutationObserver | null = null;
export function applyLanguage(code: string) {
  dict = DICTS[code] || {};
  document.documentElement.lang = code;
  walk(document.body);
  if (observer) return;
  observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') textNode(r.target as Text);
      else if (r.type === 'attributes') attrs(r.target as Element);
      else r.addedNodes.forEach(walk);
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
