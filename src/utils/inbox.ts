// Reads the options of an agent's approval prompt from the end of its terminal output, e.g.
//   ❯ 1. Yes
//     2. Yes, and don't ask again
//     3. No, and tell Claude what to do differently (esc)
// key is what to type to pick the option (Claude Code, Codex and Gemini CLI all take the number).
export interface Choice {
  key: string;
  label: string;
}

const OPTION_RE = /^[\s│┃|❯›>●○*•]*([1-9])[.)]\s+(.+?)[\s│┃|]*$/;

// tail: output with ANSI codes removed.
export function parseChoices(tail: string): Choice[] {
  let list: Choice[] = [];
  // TUIs redraw the prompt, so the last numbered list that starts at 1 wins.
  for (const line of tail.split(/\r\n|\r|\n/).slice(-40)) {
    const m = OPTION_RE.exec(line);
    if (!m) continue;
    const n = Number(m[1]);
    if (n === 1) list = [];
    if (n === list.length + 1) list.push({ key: m[1], label: m[2] });
  }
  if (list.length >= 2) return list;
  if (/\(y\/n\)|\[y\/n\]/i.test(tail.slice(-300))) return [{ key: 'y\r', label: 'Yes' }, { key: 'n\r', label: 'No' }];
  return [];
}
