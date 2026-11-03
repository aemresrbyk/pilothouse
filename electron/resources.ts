// CPU and memory of each terminal tab: its shell plus everything started inside it (agent, dev server …).
import { execFile } from 'child_process';

export interface Usage {
  cpu: number; // percent of one core, summed over the process tree
  memMB: number;
}

// ps: lines of "pid ppid cpu% memKB", as `ps -A -o pid=,ppid=,%cpu=,rss=` prints them.
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

// Windows has no ps: the process performance counters give the same four columns (working set in bytes -> KB).
const WIN_QUERY = "Get-CimInstance Win32_PerfFormattedData_PerfProc_Process | ForEach-Object { \"$($_.IDProcess) $($_.CreatingProcessID) $($_.PercentProcessorTime) $([math]::Round($_.WorkingSetPrivate / 1024))\" }";

export function processUsage(roots: number[]): Promise<Map<number, Usage>> {
  if (!roots.length) return Promise.resolve(new Map());
  const [cmd, args] = process.platform === 'win32'
    ? ['powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', WIN_QUERY]]
    : ['ps', ['-A', '-o', 'pid=,ppid=,%cpu=,rss=']];
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 8000, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (err, stdout) => {
      resolve(err ? new Map() : treeUsage(stdout, roots));
    });
  });
}
