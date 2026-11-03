export const isMac = typeof navigator !== 'undefined' && navigator.platform.startsWith('Mac');

// App shortcuts are ⌘X on macOS and Ctrl+Shift+X elsewhere: plain Ctrl+T/W/K/P/I/F are shell keys in the terminal
// (Ctrl+W deletes a word, Ctrl+I is Tab …).
export const APP_KEYS = /^[tTwWkKpPiIfF]$/;
export const isAppShortcut = (e: KeyboardEvent, key: string) =>
  e.key.toLowerCase() === key && (isMac ? e.metaKey : e.ctrlKey && e.shiftKey);
export const keyLabel = (key: string) => (isMac ? `⌘${key}` : `Ctrl+Shift+${key}`);
// Tab switching keeps plain Ctrl on Windows/Linux (shells don't use Ctrl+digit, and Shift would change the key).
export const tabKeyLabel = isMac ? '⌘1-9' : 'Ctrl+1-9';
