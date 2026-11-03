// CPU and memory of each terminal tab: its shell plus everything started inside it (agent, dev server …).
import { execFile } from 'child_process';

export interface Usage {
  cpu: number; // percent of one core, summed over the process tree
  memMB: number;
}

// ps: output of `ps -A -o pid=,ppid=,%cpu=,rss=` (rss in KB).
export function treeUsage(ps: string, roots: number[]): Map<number, Usage> {
  const kids = new Map<number, number[]>();
  const own = new Map<number, Usage>();
  for (const line of ps.split('\n')) {
    const [pid, ppid, cpu, rss] = line.trim().split(/\s+/).map(Number);
    if (!pid) continue;
    own.set(pid, { cpu: cpu || 0, memMB: (rss || 0) / 1024 });
    kids.set(ppid, [...(kids.get(ppid) || []), pid]);
  }
  const out = new Map<number, Usage>();
  for (const root of roots) {
    const sum = { cpu: 0, memMB: 0 };
    const seen = new Set<number>();
    const stack = [root];
    while (stack.length) {
      const pid = stack.pop()!;
      if (seen.has(pid)) continue;
      seen.add(pid);
      const u = own.get(pid);
      if (u) { sum.cpu += u.cpu; sum.memMB += u.memMB; }
      stack.push(...(kids.get(pid) || []));
    }
    out.set(root, sum);
  }
  return out;
}

export function processUsage(roots: number[]): Promise<Map<number, Usage>> {
  // shortcut: no Windows support (no ps); add a wmic/PowerShell query when Windows builds ship.
  if (process.platform === 'win32' || !roots.length) return Promise.resolve(new Map());
  return new Promise((resolve) => {
    execFile('ps', ['-A', '-o', 'pid=,ppid=,%cpu=,rss='], { timeout: 3000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      resolve(err ? new Map() : treeUsage(stdout, roots));
    });
  });
}
