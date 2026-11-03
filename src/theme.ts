// 'claude' and 'cyber' were older theme ids; settings that still name them fall back to DEFAULT_THEME.
export type AppTheme = 'pilot' | 'dark' | 'nord' | 'light';
export const DEFAULT_THEME: AppTheme = 'pilot';

export interface ThemeConfig {
  id: AppTheme;
  name: string;
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
  accentText: string; // text on an accent-filled button (a light accent needs dark text)
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

// One cool, neutral ANSI palette for the dark themes, so agent output looks the same whichever is picked.
const ANSI_DARK = {
  black: '#1A1F25', red: '#FF5C6C', green: '#7EE787', yellow: '#F2CC60', blue: '#6CB6FF', magenta: '#C49BFF', cyan: '#56D4DD', white: '#D9DEE2',
  brightBlack: '#4A535C', brightRed: '#FF7B88', brightGreen: '#A2F0AA', brightYellow: '#F8DC8A', brightBlue: '#99CCFF', brightMagenta: '#D9BFFF', brightCyan: '#8AE6EC', brightWhite: '#FFFFFF'
};

export const THEMES: Record<AppTheme, ThemeConfig> = {
  // Default: the logo's colours. Near-black, cool greys, one phosphor-lime signal colour.
  pilot: {
    id: 'pilot',
    name: 'Pilothouse',
    bgMain: '#0B0D10',
    bgHeader: '#0F1215',
    bgTabActive: '#171B20',
    bgTabHover: '#13161A',
    bgCard: '#111418',
    border: '#1F252C',
    textPrimary: '#E8EDF0',
    textSecondary: '#A7B0B8',
    textMuted: '#5F6973',
    accent: '#C8FF2E',
    accentHover: '#D8FF6B',
    accentBg: 'rgba(200, 255, 46, 0.10)',
    accentText: '#0B0D10',
    terminalTheme: {
      background: '#0B0D10',
      foreground: '#E8EDF0',
      cursor: '#C8FF2E',
      cursorAccent: '#0B0D10',
      selectionBackground: 'rgba(200, 255, 46, 0.22)',
      ...ANSI_DARK
    }
  },
  dark: {
    id: 'dark',
    name: 'OLED Black',
    bgMain: '#000000',
    bgHeader: '#07080A',
    bgTabActive: '#121417',
    bgTabHover: '#0C0E10',
    bgCard: '#0A0B0D',
    border: '#1C1F23',
    textPrimary: '#F2F4F6',
    textSecondary: '#B4BBC2',
    textMuted: '#5C646C',
    accent: '#F2F4F6',
    accentHover: '#FFFFFF',
    accentBg: 'rgba(242, 244, 246, 0.10)',
    accentText: '#000000',
    terminalTheme: {
      background: '#000000',
      foreground: '#F2F4F6',
      cursor: '#F2F4F6',
      cursorAccent: '#000000',
      selectionBackground: 'rgba(242, 244, 246, 0.22)',
      ...ANSI_DARK
    }
  },
  nord: {
    id: 'nord',
    name: 'Nord Frost',
    bgMain: '#242933',
    bgHeader: '#2E3440',
    bgTabActive: '#3B4252',
    bgTabHover: '#353C4A',
    bgCard: '#2E3440',
    border: '#434C5E',
    textPrimary: '#ECEFF4',
    textSecondary: '#D8DEE9',
    textMuted: '#7B88A1',
    accent: '#88C0D0',
    accentHover: '#8FBCBB',
    accentBg: 'rgba(136, 192, 208, 0.15)',
    accentText: '#242933',
    terminalTheme: {
      background: '#242933',
      foreground: '#ECEFF4',
      cursor: '#88C0D0',
      cursorAccent: '#242933',
      selectionBackground: 'rgba(136, 192, 208, 0.3)',
      black: '#3B4252',
      red: '#BF616A',
      green: '#A3BE8C',
      yellow: '#EBCB8B',
      blue: '#81A1C1',
      magenta: '#B48EAD',
      cyan: '#88C0D0',
      white: '#E5E9F0',
      brightBlack: '#4C566A',
      brightRed: '#BF616A',
      brightGreen: '#A3BE8C',
      brightYellow: '#EBCB8B',
      brightBlue: '#81A1C1',
      brightMagenta: '#B48EAD',
      brightCyan: '#8FBCBB',
      brightWhite: '#ECEFF4'
    }
  },
  light: {
    id: 'light',
    name: 'Paper',
    bgMain: '#F6F7F8',
    bgHeader: '#ECEEF0',
    bgTabActive: '#FFFFFF',
    bgTabHover: '#F1F3F4',
    bgCard: '#FFFFFF',
    border: '#D9DDE1',
    textPrimary: '#0F1215',
    textSecondary: '#3E464E',
    textMuted: '#7A838C',
    accent: '#3F6200', // the lime, darkened until it reads on white
    accentHover: '#2F4A00',
    accentBg: 'rgba(63, 98, 0, 0.10)',
    accentText: '#FFFFFF',
    terminalTheme: {
      background: '#FFFFFF',
      foreground: '#1A1F25',
      cursor: '#3F6200',
      cursorAccent: '#FFFFFF',
      selectionBackground: 'rgba(63, 98, 0, 0.18)',
      black: '#1A1F25',
      red: '#C42B3B',
      green: '#2E7D32',
      yellow: '#9A6700',
      blue: '#0B5CAD',
      magenta: '#8250DF',
      cyan: '#0E7C86',
      white: '#D9DEE2',
      brightBlack: '#5C646C',
      brightRed: '#D73A49',
      brightGreen: '#3A9A3E',
      brightYellow: '#B08800',
      brightBlue: '#2F80ED',
      brightMagenta: '#9A6DFF',
      brightCyan: '#1B9AA6',
      brightWhite: '#0F1215'
    }
  }
};

// Settings may hold a theme id from an older version.
export const themeOrDefault = (id?: string): AppTheme => (id && id in THEMES ? (id as AppTheme) : DEFAULT_THEME);
