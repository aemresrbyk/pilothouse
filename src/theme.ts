export type AppTheme = 'claude' | 'dark' | 'cyber' | 'nord' | 'light';

export interface ThemeConfig {
  id: AppTheme;
  name: string;
  icon: string;
  bgMain: string;
  bgHeader: string;
  bgTabActive: string;
  bgTabHover: string;
  bgCard: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentHover: string;
  accentBg: string;
  terminalTheme: {
    background: string;
    foreground: string;
    cursor: string;
    cursorAccent: string;
    selectionBackground: string;
    black: string;
    red: string;
    green: string;
    yellow: string;
    blue: string;
    magenta: string;
    cyan: string;
    white: string;
    brightBlack: string;
    brightRed: string;
    brightGreen: string;
    brightYellow: string;
    brightBlue: string;
    brightMagenta: string;
    brightCyan: string;
    brightWhite: string;
  };
}

export const THEMES: Record<AppTheme, ThemeConfig> = {
  claude: {
    id: 'claude',
    name: 'Anthropic Warm',
    icon: '🔥',
    bgMain: '#141312',
    bgHeader: '#1c1a18',
    bgTabActive: '#23201d',
    bgTabHover: '#1f1c19',
    bgCard: '#1a1816',
    border: '#2e2924',
    textPrimary: '#f5efe6',
    textSecondary: '#d4cbbe',
    textMuted: '#8f8576',
    accent: '#d97706',
    accentHover: '#ea580c',
    accentBg: 'rgba(217, 119, 6, 0.15)',
    terminalTheme: {
      background: '#11100f',
      foreground: '#f5efe6',
      cursor: '#d97706',
      cursorAccent: '#11100f',
      selectionBackground: 'rgba(217, 119, 6, 0.35)',
      black: '#1c1a18',
      red: '#ef4444',
      green: '#10b981',
      yellow: '#f59e0b',
      blue: '#60a5fa',
      magenta: '#c084fc',
      cyan: '#38bdf8',
      white: '#f5efe6',
      brightBlack: '#4a443c',
      brightRed: '#f87171',
      brightGreen: '#34d399',
      brightYellow: '#fbbf24',
      brightBlue: '#93c5fd',
      brightMagenta: '#d8b4fe',
      brightCyan: '#7dd3fc',
      brightWhite: '#ffffff'
    }
  },
  dark: {
    id: 'dark',
    name: 'OLED Pure Black',
    icon: '🌑',
    bgMain: '#000000',
    bgHeader: '#0a0a0a',
    bgTabActive: '#151515',
    bgTabHover: '#101010',
    bgCard: '#0d0d0d',
    border: '#222222',
    textPrimary: '#ffffff',
    textSecondary: '#cccccc',
    textMuted: '#666666',
    accent: '#ffffff',
    accentHover: '#e5e5e5',
    accentBg: 'rgba(255, 255, 255, 0.12)',
    terminalTheme: {
      background: '#000000',
      foreground: '#f3f4f6',
      cursor: '#ffffff',
      cursorAccent: '#000000',
      selectionBackground: 'rgba(255, 255, 255, 0.25)',
      black: '#1f2937',
      red: '#f87171',
      green: '#4ade80',
      yellow: '#facc15',
      blue: '#60a5fa',
      magenta: '#c084fc',
      cyan: '#38bdf8',
      white: '#f3f4f6',
      brightBlack: '#4b5563',
      brightRed: '#ef4444',
      brightGreen: '#22c55e',
      brightYellow: '#eab308',
      brightBlue: '#3b82f6',
      brightMagenta: '#a855f7',
      brightCyan: '#06b6d4',
      brightWhite: '#ffffff'
    }
  },
  cyber: {
    id: 'cyber',
    name: 'Cyber Slate',
    icon: '⚡',
    bgMain: '#080c14',
    bgHeader: '#0e1422',
    bgTabActive: '#161f36',
    bgTabHover: '#121a2c',
    bgCard: '#0f1728',
    border: '#1e293b',
    textPrimary: '#f8fafc',
    textSecondary: '#cbd5e1',
    textMuted: '#64748b',
    accent: '#38bdf8',
    accentHover: '#0ea5e9',
    accentBg: 'rgba(56, 189, 248, 0.15)',
    terminalTheme: {
      background: '#060a12',
      foreground: '#f8fafc',
      cursor: '#38bdf8',
      cursorAccent: '#060a12',
      selectionBackground: 'rgba(56, 189, 248, 0.3)',
      black: '#1e293b',
      red: '#f43f5e',
      green: '#10b981',
      yellow: '#fbbf24',
      blue: '#38bdf8',
      magenta: '#a855f7',
      cyan: '#22d3ee',
      white: '#f8fafc',
      brightBlack: '#475569',
      brightRed: '#fb7185',
      brightGreen: '#34d399',
      brightYellow: '#fcd34d',
      brightBlue: '#7dd3fc',
      brightMagenta: '#c084fc',
      brightCyan: '#67e8f9',
      brightWhite: '#ffffff'
    }
  },
  nord: {
    id: 'nord',
    name: 'Nord Frost',
    icon: '❄️',
    bgMain: '#242933',
    bgHeader: '#2e3440',
    bgTabActive: '#3b4252',
    bgTabHover: '#353c4a',
    bgCard: '#2b303c',
    border: '#434c5e',
    textPrimary: '#eceff4',
    textSecondary: '#d8dee9',
    textMuted: '#81a1c1',
    accent: '#88c0d0',
    accentHover: '#81a1c1',
    accentBg: 'rgba(136, 192, 208, 0.15)',
    terminalTheme: {
      background: '#1f232b',
      foreground: '#eceff4',
      cursor: '#88c0d0',
      cursorAccent: '#1f232b',
      selectionBackground: 'rgba(136, 192, 208, 0.3)',
      black: '#3b4252',
      red: '#bf616a',
      green: '#a3be8c',
      yellow: '#ebcb8b',
      blue: '#81a1c1',
      magenta: '#b48ead',
      cyan: '#88c0d0',
      white: '#e5e9f0',
      brightBlack: '#4c566a',
      brightRed: '#d08770',
      brightGreen: '#a3be8c',
      brightYellow: '#ebcb8b',
      brightBlue: '#81a1c1',
      brightMagenta: '#b48ead',
      brightCyan: '#8fbcbb',
      brightWhite: '#eceff4'
    }
  },
  light: {
    id: 'light',
    name: 'Paper Minimal',
    icon: '☀️',
    bgMain: '#f8f9fa',
    bgHeader: '#ffffff',
    bgTabActive: '#ffffff',
    bgTabHover: '#f1f3f5',
    bgCard: '#ffffff',
    border: '#e2e8f0',
    textPrimary: '#0f172a',
    textSecondary: '#334155',
    textMuted: '#64748b',
    accent: '#d97706',
    accentHover: '#b45309',
    accentBg: 'rgba(217, 119, 6, 0.12)',
    terminalTheme: {
      background: '#ffffff',
      foreground: '#0f172a',
      cursor: '#0f172a',
      cursorAccent: '#ffffff',
      selectionBackground: 'rgba(217, 119, 6, 0.25)',
      black: '#0f172a',
      red: '#dc2626',
      green: '#16a34a',
      yellow: '#ca8a04',
      blue: '#2563eb',
      magenta: '#9333ea',
      cyan: '#0891b2',
      white: '#f1f5f9',
      brightBlack: '#64748b',
      brightRed: '#ef4444',
      brightGreen: '#22c55e',
      brightYellow: '#eab308',
      brightBlue: '#3b82f6',
      brightMagenta: '#a855f7',
      brightCyan: '#06b6d4',
      brightWhite: '#ffffff'
    }
  }
};

