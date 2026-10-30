import React, { useEffect, useRef } from 'react';
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
  const isCreatedRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current || isCreatedRef.current) return;
    isCreatedRef.current = true;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.25,
      scrollback: 5000,
      theme: theme.terminalTheme,
      allowTransparency: false
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Small delay to ensure layout is ready before fitting
    const timer = setTimeout(() => {
      try {
        fitAddon.fit();
        term.focus();

        window.electronAPI.ptyCreate({
          id: tabId,
          cwd: projectPath,
          initialCommand,
          cols: term.cols || 80,
          rows: term.rows || 24
        });
      } catch (err) {
        console.error('PTY initialization error:', err);
      }
    }, 60);

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
      window.electronAPI.ptyResize(tabId, cols, rows);
    });

    const handleWindowResize = () => {
      try {
        fitAddon.fit();
      } catch {}
    };
    window.addEventListener('resize', handleWindowResize);

    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
      } catch {}
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      clearTimeout(timer);
      unbindData();
      unbindExit();
      window.removeEventListener('resize', handleWindowResize);
      resizeObserver.disconnect();
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
          fitAddonRef.current?.fit();
          termRef.current?.focus();
        } catch {}
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isActive]);

  return (
    <div
      ref={containerRef}
      onClick={() => termRef.current?.focus()}
      className="w-full h-full select-text overflow-hidden cursor-text p-2"
      style={{ backgroundColor: theme.terminalTheme.background }}
    />
  );
};

