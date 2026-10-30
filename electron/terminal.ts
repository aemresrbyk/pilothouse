import { exec, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ProjectFlags, TerminalOption } from '../src/types';

export function buildClaudeCommand(
  flags: ProjectFlags,
  customFlags?: string,
  claudeBinary: string = 'claude'
): string {
  const parts: string[] = [claudeBinary];

  if (flags.dangerouslySkipPermissions) {
    parts.push('--dangerously-skip-permissions');
  }
  if (flags.continueLast) {
    parts.push('--continue');
  }
  if (flags.chrome) {
    parts.push('--chrome');
  }
  if (flags.verbose) {
    parts.push('--verbose');
  }
  if (flags.bare) {
    parts.push('--bare');
  }

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
      installed: fs.existsSync('/Applications/Alacritty.app'),
      command: 'Alacritty'
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
    exec(whichCmd, { stdio: 'ignore' });
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

export function launchInTerminal(
  projectPath: string,
  claudeCommand: string,
  terminalId: string = 'Terminal'
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const isMac = process.platform === 'darwin';
    const isWin = process.platform === 'win32';

    // Ensure PATH contains ~/.local/bin and Homebrew so claude binary is found
    const envPath = `${os.homedir()}/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH`;
    const fullCommand = `export PATH="${envPath}"; cd "${projectPath}" && ${claudeCommand}`;

    if (isMac) {
      if (terminalId === 'iTerm') {
        const script = `
          tell application "iTerm"
            activate
            try
              tell current window
                create tab with default profile
                tell current session
                  write text "${fullCommand.replace(/"/g, '\\"')}"
                end tell
              end tell
            on error
              create window with default profile
              tell current session of current window
                write text "${fullCommand.replace(/"/g, '\\"')}"
              end tell
            end try
          end tell
        `;
        exec(`osascript -e '${script.replace(/'/g, "'\\''")}'`, (err) => {
          if (err) {
            // Fallback to Terminal.app
            launchTerminalApp(projectPath, fullCommand, resolve);
          } else {
            resolve({ success: true });
          }
        });
        return;
      }

      if (terminalId === 'Ghostty') {
        const escaped = fullCommand.replace(/"/g, '\\"');
        exec(`open -a Ghostty --args -e "bash -c \\"${escaped}; exec bash\\""`, (err) => {
          if (err) {
            launchTerminalApp(projectPath, fullCommand, resolve);
          } else {
            resolve({ success: true });
          }
        });
        return;
      }

      if (terminalId === 'VSCode') {
        exec(`open -a "Visual Studio Code" "${projectPath}"`, (err) => {
          if (err) {
            resolve({ success: false, error: err.message });
          } else {
            resolve({ success: true });
          }
        });
        return;
      }

      if (terminalId === 'Cursor') {
        exec(`open -a "Cursor" "${projectPath}"`, (err) => {
          if (err) {
            resolve({ success: false, error: err.message });
          } else {
            resolve({ success: true });
          }
        });
        return;
      }

      // Default macOS Terminal.app
      launchTerminalApp(projectPath, fullCommand, resolve);
    } else if (isWin) {
      const winCmd = `cd /d "${projectPath}" && ${claudeCommand}`;
      if (terminalId === 'WindowsTerminal') {
        exec(`wt.exe -d "${projectPath}" cmd /k "${claudeCommand}"`, (err) => {
          if (err) {
            exec(`start cmd.exe /k "${winCmd}"`, (err2) => {
              resolve({ success: !err2, error: err2?.message });
            });
          } else {
            resolve({ success: true });
          }
        });
      } else {
        exec(`start cmd.exe /k "${winCmd}"`, (err) => {
          resolve({ success: !err, error: err?.message });
        });
      }
    } else {
      // Linux
      exec(`gnome-terminal --working-directory="${projectPath}" -- bash -c "${fullCommand}; exec bash"`, (err) => {
        if (err) {
          exec(`xterm -e "cd '${projectPath}' && ${claudeCommand}; exec bash"`, (err2) => {
            resolve({ success: !err2, error: err2?.message });
          });
        } else {
          resolve({ success: true });
        }
      });
    }
  });
}

function launchTerminalApp(
  _projectPath: string,
  fullCommand: string,
  resolve: (res: { success: boolean; error?: string }) => void
) {
  const safeScript = `
tell application "Terminal"
  activate
  do script "${fullCommand.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"
end tell
  `;
  exec(`osascript -e '${safeScript.replace(/'/g, "'\\''")}'`, (err) => {
    if (err) {
      resolve({ success: false, error: err.message });
    } else {
      resolve({ success: true });
    }
  });
}
