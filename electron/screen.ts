// A shadow copy of a tab's terminal (headless xterm), so the phone and the web remote can show the screen exactly as
// the desktop does: TUIs draw with cursor moves, which plain output text cannot reproduce.
import { Terminal } from '@xterm/headless';

// One styled piece of a line: text, foreground colour (CSS, '' = default), bold.
export type Run = [string, string, boolean?];
export interface Snapshot { cols: number; rows: number; lines: Run[][]; cursor: { x: number; y: number } }

// xterm's default 16 colours, then the 6x6x6 cube and the grey ramp of the 256-colour palette.
const BASE = ['#2e3436', '#ef6b6b', '#8ae234', '#fce94f', '#729fcf', '#ad7fa8', '#34e2e2', '#d3d7cf',
  '#555753', '#ff8080', '#a6f05a', '#fff27a', '#9cc2f5', '#c99bc4', '#6ef5f5', '#eeeeec'];
export function paletteColor(n: number): string {
  if (n < 16) return BASE[n];
  if (n < 232) {
    const i = n - 16, v = (x: number) => (x ? 55 + x * 40 : 0);
    return rgb(v(Math.floor(i / 36)), v(Math.floor(i / 6) % 6), v(i % 6));
  }
  const g = 8 + (n - 232) * 10;
  return rgb(g, g, g);
}
const rgb = (r: number, g: number, b: number) => `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;

export class Screen {
  private term: Terminal;
  constructor(cols: number, rows: number, seed = '') {
    this.term = new Terminal({ cols, rows, scrollback: 0, allowProposedApi: true });
    if (seed) this.term.write(seed);
  }
  write(data: string) { this.term.write(data); }
  resize(cols: number, rows: number) { this.term.resize(cols, rows); }
  dispose() { this.term.dispose(); }

  // Waits for pending writes, then reads the visible screen as runs of same-styled text.
  snapshot(): Promise<Snapshot> {
    return new Promise(resolve => this.term.write('', () => {
      const t = this.term, buf = t.buffer.active, lines: Run[][] = [];
      const cell = buf.getNullCell();
      for (let y = 0; y < t.rows; y++) {
        const line = buf.getLine(buf.viewportY + y);
        const runs: Run[] = [];
        const width = line ? line.translateToString(true).length : 0;
        for (let x = 0; x < width; x++) {
          line!.getCell(x, cell);
          if (cell.getWidth() === 0) continue; // second half of a wide character
          const fg = cell.isInverse() ? '#0b0d10' : cell.isFgRGB() ? rgb((cell.getFgColor() >> 16) & 255, (cell.getFgColor() >> 8) & 255, cell.getFgColor() & 255)
            : cell.isFgPalette() ? paletteColor(cell.getFgColor()) : '';
          const bold = !!cell.isBold();
          const ch = cell.getChars() || ' ';
          const lastRun = runs[runs.length - 1];
          if (lastRun && lastRun[1] === fg && !!lastRun[2] === bold) lastRun[0] += ch;
          else runs.push(bold ? [ch, fg, true] : [ch, fg]);
        }
        lines.push(runs);
      }
      resolve({ cols: t.cols, rows: t.rows, lines, cursor: { x: buf.cursorX, y: buf.cursorY } });
    }));
  }
}
