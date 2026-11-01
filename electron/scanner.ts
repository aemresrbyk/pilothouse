import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { ProjectItem, FileItem, GitInfo, ClaudeMetrics, ClaudeSession, RunCommand, MemoryFile } from '../src/types';

const execFileAsync = promisify(execFile);

export function getClaudeJsonPath(): string {
  return path.join(os.homedir(), '.claude.json');
}

export function getProjectSessions(projectPath: string, withTitles = false): ClaudeSession[] {
  try {
    const homedir = os.homedir();
    // Claude Code encodes the project dir by replacing every non-alphanumeric char with '-'.
    const encodedDirName = projectPath.replace(/[^a-zA-Z0-9]/g, '-');
    const projectSessionsDir = path.join(homedir, '.claude', 'projects', encodedDirName);

    if (!fs.existsSync(projectSessionsDir)) {
      return [];
    }

    const files = fs.readdirSync(projectSessionsDir);
    const sessions: ClaudeSession[] = [];

    for (const f of files) {
      if (f.endsWith('.jsonl')) {
        const sessionId = f.replace('.jsonl', '');
        const fullPath = path.join(projectSessionsDir, f);
        try {
          const stat = fs.statSync(fullPath);
          const sizeKb = Math.round(stat.size / 1024);
          const formattedSize = sizeKb > 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`;
          const d = new Date(stat.mtimeMs);
          const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

          sessions.push({
            id: sessionId,
            modifiedAt: stat.mtimeMs,
            sizeBytes: stat.size,
            formattedSize,
            dateStr,
            title: withTitles ? getSessionTitle(fullPath) : undefined
          });
        } catch {
          // ignore stat errors
        }
      }
    }

    return sessions.sort((a, b) => b.modifiedAt - a.modifiedAt);
  } catch (err) {
    console.error('Failed to get project sessions:', err);
    return [];
  }
}

// First real user prompt of a session transcript, used as its title in the History view.
export function getSessionTitle(filePath: string, maxBytes = 256 * 1024): string | undefined {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(maxBytes);
    const n = fs.readSync(fd, buf, 0, maxBytes, 0);
    fs.closeSync(fd);
    for (const line of buf.toString('utf-8', 0, n).split('\n')) {
      if (!line.includes('"type":"user"')) continue;
      let o: any;
      try { o = JSON.parse(line); } catch { continue; } // last line may be cut off at maxBytes
      if (o.type !== 'user' || o.isMeta) continue;
      const c = o.message?.content;
      const text = typeof c === 'string' ? c : Array.isArray(c) ? c.find((b: any) => b?.type === 'text')?.text : undefined;
      // skip command wrappers / tool output, which start with an XML-ish tag
      if (typeof text === 'string' && text.trim() && !text.trimStart().startsWith('<')) {
        return text.trim().replace(/\s+/g, ' ').slice(0, 160);
      }
    }
  } catch {}
  return undefined;
}

export function getProjectClaudeMetrics(projectPath: string): ClaudeMetrics | undefined {
  const claudeJsonPath = getClaudeJsonPath();
  const sessions = getProjectSessions(projectPath);

  if (!fs.existsSync(claudeJsonPath)) {
    return sessions.length > 0 ? { sessions } : undefined;
  }

  try {
    const raw = fs.readFileSync(claudeJsonPath, 'utf-8');
    const data = JSON.parse(raw);
    const meta = (data.projects || {})[projectPath];
    if (!meta) {
      return sessions.length > 0 ? { sessions } : undefined;
    }

    const models = meta.lastModelUsage ? Object.keys(meta.lastModelUsage) : undefined;

    return {
      lastCost: typeof meta.lastCost === 'number' ? Number(meta.lastCost.toFixed(4)) : undefined,
      models,
      inputTokens: meta.lastTotalInputTokens,
      outputTokens: meta.lastTotalOutputTokens,
      lastDurationMs: meta.lastDuration,
      lastSessionId: meta.lastSessionId,
      sessions
    };
  } catch {
    return sessions.length > 0 ? { sessions } : undefined;
  }
}

export function scanClaudeProjects(): Array<{ path: string; lastStartTime?: number; metrics?: ClaudeMetrics }> {
  const claudeJsonPath = getClaudeJsonPath();
  if (!fs.existsSync(claudeJsonPath)) {
    return [];
  }

  try {
    const raw = fs.readFileSync(claudeJsonPath, 'utf-8');
    const data = JSON.parse(raw);
    const projectsObj = data.projects || {};
    
    const results: Array<{ path: string; lastStartTime?: number; metrics?: ClaudeMetrics }> = [];

    for (const [projPath, meta] of Object.entries(projectsObj)) {
      if (typeof projPath === 'string' && fs.existsSync(projPath)) {
        // Filter out macOS .app bundles and home root directory
        if (projPath.endsWith('.app') || projPath === os.homedir()) {
          continue;
        }

        const metadata = meta as any;
        const models = metadata?.lastModelUsage ? Object.keys(metadata.lastModelUsage) : undefined;
        const metrics: ClaudeMetrics = {
          lastCost: typeof metadata?.lastCost === 'number' ? Number(metadata.lastCost.toFixed(4)) : undefined,
          models,
          inputTokens: metadata?.lastTotalInputTokens,
          outputTokens: metadata?.lastTotalOutputTokens,
          lastDurationMs: metadata?.lastDuration,
          lastSessionId: metadata?.lastSessionId
        };

        results.push({
          path: projPath,
          lastStartTime: metadata?.lastStartTime,
          metrics
        });
      }
    }

    // Sort by lastStartTime desc
    results.sort((a, b) => (b.lastStartTime || 0) - (a.lastStartTime || 0));
    return results;
  } catch (err) {
    console.error('Error scanning .claude.json:', err);
    return [];
  }
}

// Async + parallel: the old execSync version blocked the main process ~200ms per project on every list refresh.
export async function getGitInfo(projectPath: string): Promise<GitInfo> {
  const gitDir = path.join(projectPath, '.git');
  if (!fs.existsSync(gitDir)) {
    return { isGit: false };
  }

  const git = (...args: string[]) =>
    // timeout kills git: `status` can take minutes in repos with huge untracked trees
    execFileAsync('git', args, { cwd: projectPath, encoding: 'utf-8', timeout: 1500 })
      .then((r) => r.stdout.trim())
      .catch(() => undefined);

  // No direct reads of project files in the main process: on an iCloud "optimized" Desktop a file can be
  // evicted (dataless) and a sync read blocks until it downloads, which froze the whole app. git runs in a
  // child process that the timeout kills instead.
  const [statusOut, commitHash, gitBranch] = await Promise.all([
    git('status', '--porcelain'),
    git('rev-parse', '--short', 'HEAD'),
    git('rev-parse', '--abbrev-ref', 'HEAD')
  ]);

  // undefined = status timed out/failed: unknown, not "clean"
  const uncommittedCount = statusOut === undefined ? undefined : statusOut.split('\n').filter(Boolean).length;
  return {
    isGit: true,
    branch: gitBranch || 'git',
    hasUncommitted: uncommittedCount === undefined ? undefined : uncommittedCount > 0,
    uncommittedCount,
    commitHash: commitHash || undefined
  };
}

export function buildProjectItem(
  projectPath: string,
  existing?: Partial<ProjectItem>,
  lastStartTime?: number,
  metrics?: ClaudeMetrics
): ProjectItem {
  const folderName = path.basename(projectPath) || projectPath;
  const hasClaudeMd = fs.existsSync(path.join(projectPath, 'CLAUDE.md')) || fs.existsSync(path.join(projectPath, 'claude.md'));
  const hasPackageJson = fs.existsSync(path.join(projectPath, 'package.json'));
  const resolvedMetrics = metrics || existing?.metrics || getProjectClaudeMetrics(projectPath);

  return {
    id: existing?.id || Buffer.from(projectPath).toString('base64url'),
    name: existing?.name || folderName,
    path: projectPath,
    flags: existing?.flags || {
      dangerouslySkipPermissions: true, // Default to true as user specifically requested this flag!
      continueLast: false,
      chrome: false,
      verbose: false,
      bare: false
    },
    customFlags: existing?.customFlags || '',
    lastLaunched: existing?.lastLaunched || lastStartTime,
    createdAt: existing?.createdAt || Date.now(),
    isFavorite: existing?.isFavorite || false,
    tags: existing?.tags || [],
    terminalOverride: existing?.terminalOverride || 'default',
    gitInfo: existing?.gitInfo, // refreshed asynchronously by StorageManager.getProjects()
    hasClaudeMd,
    hasPackageJson,
    metrics: resolvedMetrics
  };
}

export function listProjectFiles(dirPath: string): FileItem[] {
  if (!fs.existsSync(dirPath)) return [];

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const items: FileItem[] = [];

    // Filter out .git, node_modules from top-level listing for clean view
    for (const entry of entries) {
      if (entry.name === '.git' && entry.isDirectory()) continue;
      
      const fullPath = path.join(dirPath, entry.name);
      let size: number | undefined = undefined;
      
      try {
        if (!entry.isDirectory()) {
          const stat = fs.statSync(fullPath);
          size = stat.size;
        }
      } catch {
        // ignore stat errors
      }

      items.push({
        name: entry.name,
        path: fullPath,
        isDirectory: entry.isDirectory(),
        size,
        extension: entry.isDirectory() ? undefined : path.extname(entry.name).toLowerCase()
      });
    }

    // Sort: directories first, then alphabetical
    return items.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
  } catch (err) {
    console.error('Failed to list files:', err);
    return [];
  }
}

// Async for the same iCloud reason as getGitInfo: a stuck read must not freeze the main process.
export async function readFileContent(filePath: string, maxBytes: number = 200000): Promise<{ content: string; truncated: boolean; error?: string }> {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error('File not found');
    }
    const stat = await fs.promises.stat(filePath);
    if (stat.isDirectory()) {
      throw new Error('Cannot read directory as file');
    }

    const fh = await fs.promises.open(filePath, 'r');
    const buffer = Buffer.alloc(Math.min(stat.size, maxBytes));
    let bytesRead = 0;
    try {
      ({ bytesRead } = await fh.read(buffer, 0, buffer.length, 0));
    } finally {
      await fh.close();
    }

    const content = buffer.toString('utf-8', 0, bytesRead);
    return {
      content,
      truncated: stat.size > maxBytes
    };
  } catch (err: any) {
    return { content: '', truncated: false, error: err.message };
  }
}

export async function saveFileContent(filePath: string, content: string): Promise<{ success: boolean; error?: string }> {
  try {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, content, 'utf-8');
    return { success: true };
  } catch (err: any) {
    console.error('Failed to save file:', err);
    return { success: false, error: err.message };
  }
}

export async function getGitStatusDetails(dirPath: string): Promise<{ isGit: boolean; branch: string; modifiedCount: number; statusText: string }> {
  const info = await getGitInfo(dirPath);
  if (!info.isGit) {
    return { isGit: false, branch: '', modifiedCount: 0, statusText: 'Not a git repo' };
  }
  const n = info.uncommittedCount;
  return {
    isGit: true,
    branch: info.branch || 'git',
    modifiedCount: n ?? 0,
    statusText: n === undefined ? 'status unavailable (git status too slow)' : n > 0 ? `${n} modified` : 'Clean'
  };
}

export async function getSystemHealth(): Promise<{ claudeInstalled: boolean; claudePath: string; claudeVersion: string; nodeVersion: string }> {
  let claudeInstalled = false;
  let claudePath = '';
  let claudeVersion = '';
  const nodeVersion = process.version;

  const candidatePaths = [
    path.join(os.homedir(), '.local/bin/claude'),
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
    path.join(os.homedir(), '.bun/bin/claude')
  ];

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      claudeInstalled = true;
      claudePath = p;
      break;
    }
  }

  if (!claudeInstalled) {
    try {
      claudePath = (await execFileAsync('which', ['claude'], { encoding: 'utf-8', timeout: 1000 })).stdout.trim();
      if (claudePath && fs.existsSync(claudePath)) {
        claudeInstalled = true;
      }
    } catch {}
  }

  if (claudeInstalled && claudePath) {
    try {
      const { stdout: verOut } = await execFileAsync(claudePath, ['--version'], {
        encoding: 'utf-8',
        timeout: 2000,
        env: { ...process.env, PATH: `${os.homedir()}/.local/bin:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}` }
      });
      claudeVersion = verOut.trim().split('\n')[0];
    } catch {
      claudeVersion = 'Ready';
    }
  }

  return {
    claudeInstalled,
    claudePath,
    claudeVersion,
    nodeVersion
  };
}

function readText(p: string): string | null {
  try { return fs.readFileSync(p, 'utf-8'); } catch { return null; }
}

// Startup commands a cloned repo (GitHub or elsewhere) declares, so they can be picked instead of guessed.
export function detectRunCommands(dir: string): RunCommand[] {
  const out: RunCommand[] = [];
  const add = (label: string, command: string, source: string) => {
    if (!out.some(c => c.command === command)) out.push({ label, command, source });
  };
  const has = (f: string) => fs.existsSync(path.join(dir, f));

  const pkgRaw = readText(path.join(dir, 'package.json'));
  if (pkgRaw) {
    const pm = has('bun.lock') || has('bun.lockb') ? 'bun' : has('pnpm-lock.yaml') ? 'pnpm' : has('yarn.lock') ? 'yarn' : 'npm';
    if (!has('node_modules')) add('install', `${pm} install`, 'package.json');
    try {
      const scripts = JSON.parse(pkgRaw).scripts || {};
      for (const name of Object.keys(scripts)) {
        if (/^(pre|post)/.test(name) && scripts[name.replace(/^(pre|post)/, '')]) continue;
        add(name, `${pm} run ${name}`, 'package.json');
      }
    } catch {}
  }

  const deno = readText(path.join(dir, 'deno.json')) ?? readText(path.join(dir, 'deno.jsonc'));
  if (deno) {
    try { for (const t of Object.keys(JSON.parse(deno).tasks || {})) add(t, `deno task ${t}`, 'deno.json'); } catch {}
  }

  for (const [file, tool] of [['Makefile', 'make'], ['makefile', 'make'], ['justfile', 'just']] as const) {
    const txt = readText(path.join(dir, file));
    if (!txt) continue;
    for (const m of txt.matchAll(/^([A-Za-z0-9][\w.-]*)\s*:(?!=)/gm)) add(m[1], `${tool} ${m[1]}`, file);
  }

  if (has('Cargo.toml')) { add('run', 'cargo run', 'Cargo.toml'); add('test', 'cargo test', 'Cargo.toml'); }
  if (has('go.mod')) { add('run', 'go run .', 'go.mod'); add('test', 'go test ./...', 'go.mod'); }
  if (has('requirements.txt')) add('install', 'pip install -r requirements.txt', 'requirements.txt');
  if (has('manage.py')) add('runserver', 'python manage.py runserver', 'manage.py');
  for (const f of ['main.py', 'app.py']) if (has(f)) add(f, `python ${f}`, f);
  for (const f of ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml']) {
    if (has(f)) { add('compose up', 'docker compose up', f); break; }
  }

  // Shell lines from the README's code blocks: that is where most repos document how to start them.
  const readme = ['README.md', 'readme.md', 'README.MD', 'Readme.md'].map(f => readText(path.join(dir, f))).find(Boolean);
  if (readme) {
    let n = 0;
    for (const block of readme.matchAll(/```(?:bash|sh|shell|zsh|console)\s*\n([\s\S]*?)```/g)) {
      for (let line of block[1].split('\n')) {
        line = line.replace(/^\s*\$\s+/, '').replace(/\s+#.*$/, '').trim();
        if (!line || line.startsWith('#') || line.length > 160 || n >= 20) continue;
        add(line.split(/\s+/).slice(0, 3).join(' '), line, 'README');
        n++;
      }
    }
  }
  return out;
}

// Everything Claude Code loads as memory for this project: CLAUDE.md files and its auto-memory folder.
export function listMemoryFiles(projectPath: string): MemoryFile[] {
  const home = os.homedir();
  const memDir = path.join(home, '.claude', 'projects', projectPath.replace(/[^a-zA-Z0-9]/g, '-'), 'memory');
  const candidates: MemoryFile[] = [
    { label: 'Project CLAUDE.md', path: path.join(projectPath, 'CLAUDE.md') },
    { label: 'Project .claude/CLAUDE.md', path: path.join(projectPath, '.claude', 'CLAUDE.md') },
    { label: 'Local CLAUDE.local.md', path: path.join(projectPath, 'CLAUDE.local.md') },
    { label: 'Global ~/.claude/CLAUDE.md', path: path.join(home, '.claude', 'CLAUDE.md') },
  ];
  try {
    for (const f of fs.readdirSync(memDir).filter(f => f.endsWith('.md')).sort((a, b) => a === 'MEMORY.md' ? -1 : b === 'MEMORY.md' ? 1 : a.localeCompare(b))) {
      candidates.push({ label: `Auto memory · ${f}`, path: path.join(memDir, f) });
    }
  } catch {}
  return candidates.filter(c => fs.existsSync(c.path));
}
