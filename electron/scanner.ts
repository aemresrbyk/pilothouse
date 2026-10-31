import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { ProjectItem, FileItem, GitInfo, ClaudeMetrics, ClaudeSession } from '../src/types';

export function getClaudeJsonPath(): string {
  return path.join(os.homedir(), '.claude.json');
}

export function getProjectSessions(projectPath: string): ClaudeSession[] {
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
            dateStr
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

export function getGitInfo(projectPath: string): GitInfo {
  const gitDir = path.join(projectPath, '.git');
  if (!fs.existsSync(gitDir)) {
    return { isGit: false };
  }

  try {
    let branch = 'main';
    // Try fast file read of .git/HEAD
    const headPath = path.join(gitDir, 'HEAD');
    if (fs.existsSync(headPath)) {
      const headContent = fs.readFileSync(headPath, 'utf-8').trim();
      if (headContent.startsWith('ref: refs/heads/')) {
        branch = headContent.replace('ref: refs/heads/', '').trim();
      }
    } else {
      branch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 800,
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim();
    }

    let uncommittedCount = 0;
    try {
      const statusOut = execSync('git status --porcelain', {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 800,
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim();
      if (statusOut) {
        uncommittedCount = statusOut.split('\n').filter(Boolean).length;
      }
    } catch {
      // ignore
    }

    let commitHash: string | undefined = undefined;
    try {
      commitHash = execSync('git rev-parse --short HEAD', {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 800,
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim();
    } catch {
      // ignore
    }

    return {
      isGit: true,
      branch,
      hasUncommitted: uncommittedCount > 0,
      uncommittedCount,
      commitHash
    };
  } catch {
    return { isGit: true, branch: 'git' };
  }
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
  const gitInfo = getGitInfo(projectPath);
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
    gitInfo,
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

export function readFileContent(filePath: string, maxBytes: number = 200000): { content: string; truncated: boolean; error?: string } {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error('File not found');
    }
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      throw new Error('Cannot read directory as file');
    }

    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(Math.min(stat.size, maxBytes));
    const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
    fs.closeSync(fd);

    const content = buffer.toString('utf-8', 0, bytesRead);
    return {
      content,
      truncated: stat.size > maxBytes
    };
  } catch (err: any) {
    return { content: '', truncated: false, error: err.message };
  }
}

export function saveFileContent(filePath: string, content: string): { success: boolean; error?: string } {
  try {
    const parentDir = path.dirname(filePath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true };
  } catch (err: any) {
    console.error('Failed to save file:', err);
    return { success: false, error: err.message };
  }
}

export function getGitStatusDetails(dirPath: string): { isGit: boolean; branch: string; modifiedCount: number; statusText: string } {
  try {
    if (!fs.existsSync(path.join(dirPath, '.git'))) {
      return { isGit: false, branch: '', modifiedCount: 0, statusText: 'Not a git repo' };
    }

    const branch = execSync('git branch --show-current', {
      cwd: dirPath,
      encoding: 'utf-8',
      timeout: 1500,
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim() || 'detached';

    const statusOutput = execSync('git status --porcelain', {
      cwd: dirPath,
      encoding: 'utf-8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();

    const lines = statusOutput ? statusOutput.split('\n').filter(Boolean) : [];
    const modifiedCount = lines.length;

    return {
      isGit: true,
      branch,
      modifiedCount,
      statusText: modifiedCount > 0 ? `${modifiedCount} modified` : 'Clean'
    };
  } catch {
    return { isGit: false, branch: '', modifiedCount: 0, statusText: '' };
  }
}

export function getSystemHealth(): { claudeInstalled: boolean; claudePath: string; claudeVersion: string; nodeVersion: string } {
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
      claudePath = execSync('which claude', { encoding: 'utf-8', timeout: 1000 }).trim();
      if (claudePath && fs.existsSync(claudePath)) {
        claudeInstalled = true;
      }
    } catch {}
  }

  if (claudeInstalled && claudePath) {
    try {
      const verOut = execSync(`"${claudePath}" --version`, {
        encoding: 'utf-8',
        timeout: 2000,
        env: { ...process.env, PATH: `${os.homedir()}/.local/bin:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}` }
      }).trim();
      claudeVersion = verOut.split('\n')[0];
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
