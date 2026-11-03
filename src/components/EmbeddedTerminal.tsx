import React, { useEffect, useRef } from 'react';
import { isMac, APP_KEYS } from '../utils/platform';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { ThemeConfig } from '../theme';

interface EmbeddedTerminalProps {
  tabId: string;
  projectPath: string;
  initialCommand?: string;
  theme: ThemeConfig;
  isActive: boolean;
  onExit?: () => void;
}

export const EmbeddedTerminal: React.FC<EmbeddedTerminalProps> = ({
  tabId,
  projectPath,
  initialCommand,
  theme,
  isActive,
  onExit
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // 1. Initialize Terminal with safe standard dimensions
    const term = new Terminal({
      cols: 80,
      rows: 24,
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.25,
      scrollback: 10000,
      theme: theme.terminalTheme,
      allowTransparency: false
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // 2. Safe Fit helper function
    const safeFit = () => {
      if (!containerRef.current || !term || !fitAddon) return;
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      if (width < 100 || height < 100) return;

      try {
        const dims = fitAddon.proposeDimensions();
        if (dims && dims.cols >= 40 && dims.rows >= 8) {
          term.resize(dims.cols, dims.rows);
          window.electronAPI.ptyResize(tabId, dims.cols, dims.rows);
        }
      } catch (err) {
        console.warn('Fit error:', err);
      }
    };

    // 3. Spawn PTY in Electron main
    window.electronAPI.ptyCreate({
      id: tabId,
      cwd: projectPath,
      initialCommand,
      cols: 80,
      rows: 24
    }).then(() => {
      // Trigger fit right after creation
      safeFit();
      term.focus();
    }).catch((err) => {
      console.error('PTY spawn failed:', err);
    });

    // Run fit after layout settles
    const t1 = setTimeout(safeFit, 60);
    const t2 = setTimeout(safeFit, 250);

    // 4. Data streaming: PTY -> Terminal & Terminal -> PTY
    const unbindData = window.electronAPI.onPtyData(tabId, (data) => {
      term.write(data);
    });

    const unbindExit = window.electronAPI.onPtyExit(tabId, () => {
      onExit?.();
    });

    term.onData((data) => {
      window.electronAPI.ptyWrite(tabId, data);
    });

    term.onResize(({ cols, rows }) => {
      if (cols >= 40 && rows >= 8) {
        window.electronAPI.ptyResize(tabId, cols, rows);
      }
    });

    // 5. Handle Copy/Paste & Key Shortcuts
    term.attachCustomKeyEventHandler((e) => {
      // Paste is left to xterm's native paste handler, which honours bracketed-paste mode.
      // Copy: Cmd+C (mac) / Ctrl+C (others) when there is a selection; otherwise Ctrl+C stays SIGINT.
      const mod = isMac ? e.metaKey : e.ctrlKey;
      // Off mac, don't let xterm turn Ctrl+V into ^V; returning false lets the browser fire a native paste.
      if (!isMac && e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'v') return false;
      // Off mac, Ctrl+Shift+T/W/K/P/I/F are app shortcuts (handled on window), not keys for the shell.
      if (!isMac && e.ctrlKey && e.shiftKey && APP_KEYS.test(e.key)) return false;
      if (mod && e.key.toLowerCase() === 'c' && term.hasSelection() && e.type === 'keydown') {
        navigator.clipboard.writeText(term.getSelection()).catch(() => {});
        return false;
      }
      return true;
    });

    // 6. Direct click-to-focus listeners
    const el = containerRef.current;
    const handleFocus = () => {
      term.focus();
    };
    el.addEventListener('pointerdown', handleFocus);
    el.addEventListener('click', handleFocus);

    const handleWindowResize = () => {
      safeFit();
    };
    window.addEventListener('resize', handleWindowResize);

    const resizeObserver = new ResizeObserver(() => {
      safeFit();
    });
    resizeObserver.observe(el);

    // Initial focus
    term.focus();

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      unbindData();
      unbindExit();
      window.removeEventListener('resize', handleWindowResize);
      resizeObserver.disconnect();
      el.removeEventListener('pointerdown', handleFocus);
      el.removeEventListener('click', handleFocus);
      try {
        term.dispose();
      } catch {}
      window.electronAPI.ptyKill(tabId);
    };
  }, [tabId]);

  // Update theme dynamically when changed
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = theme.terminalTheme;
    }
  }, [theme]);

  // Refit and focus when tab becomes active
  useEffect(() => {
    if (isActive && fitAddonRef.current && termRef.current) {
      const timer = setTimeout(() => {
        try {
          const dims = fitAddonRef.current?.proposeDimensions();
          if (dims && dims.cols >= 40 && dims.rows >= 8) {
            termRef.current?.resize(dims.cols, dims.rows);
            window.electronAPI.ptyResize(tabId, dims.cols, dims.rows);
          }
          termRef.current?.focus();
        } catch {}
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isActive, tabId]);

  return (
    <div
      className="w-full h-full overflow-hidden p-2"
      style={{ backgroundColor: theme.terminalTheme.background }}
    >
      <div
        ref={containerRef}
        className="w-full h-full overflow-hidden cursor-text select-text"
      />
    </div>
  );
};
