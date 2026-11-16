import { exec, execFile, execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ProjectFlags, TerminalOption } from '../src/types';

export function buildClaudeCommand(
  flags: ProjectFlags,
  customFlags?: string,
  claudeBinary: string = 'claude'
): string {
  const parts: string[] = [claudeBinary, ...flags];

  if (customFlags && customFlags.trim().length > 0) {
    parts.push(customFlags.trim());
  }

  return parts.join(' ');
}

export function getAvailableTerminals(): TerminalOption[] {
  const isMac = process.platform === 'darwin';
  const isWin = process.platform === 'win32';
  const isLinux = process.platform === 'linux';

  const terminals: TerminalOption[] = [];

  if (isMac) {
    terminals.push({
      id: 'Terminal',
      name: 'macOS Terminal',
      installed: fs.existsSync('/System/Applications/Utilities/Terminal.app'),
      command: 'Terminal'
    });

    terminals.push({
      id: 'iTerm',
      name: 'iTerm2',
      installed: fs.existsSync('/Applications/iTerm.app'),
      command: 'iTerm'
    });

    terminals.push({
      id: 'Ghostty',
      name: 'Ghostty',
      installed: fs.existsSync('/Applications/Ghostty.app'),
      command: 'Ghostty'
    });

    terminals.push({
      id: 'Warp',
      name: 'Warp',
      installed: fs.existsSync('/Applications/Warp.app'),
      command: 'Warp'
    });

    terminals.push({
      id: 'Alacritty',
      name: 'Alacritty',
      installed: fs.existsSync('/Applications/Alacritty.app') || isCommandAvailable('alacritty'),
      command: 'alacritty'
    });

    terminals.push({
      id: 'Kitty',
      name: 'Kitty',
      installed: fs.existsSync('/Applications/kitty.app') || isCommandAvailable('kitty'),
      command: 'kitty'
    });

    terminals.push({
      id: 'VSCode',
      name: 'VS Code Terminal',
      installed: fs.existsSync('/Applications/Visual Studio Code.app') || isCommandAvailable('code'),
      command: 'code'
    });

    terminals.push({
      id: 'Cursor',
      name: 'Cursor',
      installed: fs.existsSync('/Applications/Cursor.app') || isCommandAvailable('cursor'),
      command: 'cursor'
    });
  } else if (isWin) {
    terminals.push({
      id: 'WindowsTerminal',
      name: 'Windows Terminal (wt)',
      installed: isCommandAvailable('wt'),
      command: 'wt'
    });
    terminals.push({
      id: 'CMD',
      name: 'Command Prompt',
      installed: true,
      command: 'cmd.exe'
    });
    terminals.push({
      id: 'PowerShell',
      name: 'PowerShell',
      installed: true,
      command: 'powershell.exe'
    });
  } else if (isLinux) {
    terminals.push({
      id: 'gnome-terminal',
      name: 'GNOME Terminal',
      installed: isCommandAvailable('gnome-terminal'),
      command: 'gnome-terminal'
    });
    terminals.push({
      id: 'konsole',
      name: 'Konsole',
      installed: isCommandAvailable('konsole'),
      command: 'konsole'
    });
    terminals.push({
      id: 'xterm',
      name: 'XTerm',
      installed: isCommandAvailable('xterm'),
      command: 'xterm'
    });
  }

  return terminals;
}

function isCommandAvailable(cmd: string): boolean {
  try {
    const whichCmd = process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`;
    execSync(whichCmd, { stdio: 'ignore', timeout: 800 });
    return true;
  } catch {
    return false;
  }
}

export function findClaudeBinary(): string {
  // Check typical locations
  const home = os.homedir();
  const candidates = [
    path.join(home, '.local', 'bin', 'claude'),
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
    path.join(home, '.npm-global', 'bin', 'claude'),
    'claude'
  ];

  for (const cand of candidates) {
    if (cand === 'claude') return 'claude';
    if (fs.existsSync(cand)) return cand;
  }

  return 'claude';
}

// POSIX single-quote: the path reaches the shell as one literal word, whatever it contains ($, `, ", spaces).
export const shQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
// Text inside an AppleScript "..." string.
export const asString = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

// Programs run with execFile (no shell in between), so a folder name is never parsed as a command.
const run = (file: string, args: string[]) => new Promise<Error | null>(r => execFile(file, args, err => r(err)));

export function launchInTerminal(
  projectPath: string,
  claudeCommand: string,
  terminalId: string = 'Terminal'
): Promise<{ success: boolean; error?: string }> {
  const done = (err: Error | null) => ({ success: !err, error: err?.message });
  const isMac = process.platform === 'darwin';
  const isWin = process.platform === 'win32';

  // Ensure PATH contains ~/.local/bin and Homebrew so claude binary is found
  const envPath = `${os.homedir()}/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH`;
  const fullCommand = `export PATH="${envPath}"; cd ${shQuote(projectPath)} && ${claudeCommand}`;
  const terminalApp = async () => done(await run('osascript', ['-e', `tell application "Terminal"\n  activate\n  do script ${asString(fullCommand)}\nend tell`]));
  const orTerminalApp = async (err: Error | null) => err ? terminalApp() : done(null);

  return (async () => {
    if (isMac) {
      if (terminalId === 'iTerm') {
        const write = `write text ${asString(fullCommand)}`;
        return orTerminalApp(await run('osascript', ['-e', `tell application "iTerm"
  activate
  try
    tell current window
      create tab with default profile
      tell current session
        ${write}
      end tell
    end tell
  on error
    create window with default profile
    tell current session of current window
      ${write}
    end tell
  end try
end tell`]));
      }
      if (terminalId === 'Ghostty') return orTerminalApp(await run('open', ['-a', 'Ghostty', '--args', '-e', 'bash', '-c', `${fullCommand}; exec bash`]));
      if (terminalId === 'Warp') return orTerminalApp(await run('open', ['-a', 'Warp', projectPath]));
      if (terminalId === 'Alacritty') return orTerminalApp(await run('open', ['-a', 'Alacritty', '--args', '--working-directory', projectPath, '-e', 'bash', '-c', `${fullCommand}; exec bash`]));
      if (terminalId === 'Kitty') return orTerminalApp(await run('open', ['-a', 'kitty', '--args', '--directory', projectPath, 'bash', '-c', `${fullCommand}; exec bash`]));
      if (terminalId === 'VSCode') return done(await run('open', ['-a', 'Visual Studio Code', projectPath]));
      if (terminalId === 'Cursor') return done(await run('open', ['-a', 'Cursor', projectPath]));
      return terminalApp();
    }
    if (isWin) {
      // cmd.exe has to parse these; Windows paths cannot contain ", so quoting the path is enough.
      const winCmd = `cd /d "${projectPath}" && ${claudeCommand}`;
      const startCmd = () => new Promise<Error | null>(r => exec(`start cmd.exe /k "${winCmd}"`, err => r(err)));
      if (terminalId === 'WindowsTerminal') {
        const err = await new Promise<Error | null>(r => exec(`wt.exe -d "${projectPath}" cmd /k "${claudeCommand}"`, e => r(e)));
        if (!err) return done(null);
      }
      return done(await startCmd());
    }
    // Linux
    const err = await run('gnome-terminal', [`--working-directory=${projectPath}`, '--', 'bash', '-c', `${fullCommand}; exec bash`]);
    if (!err) return done(null);
    return done(await run('xterm', ['-e', 'bash', '-c', `${fullCommand}; exec bash`]));
  })();
}
