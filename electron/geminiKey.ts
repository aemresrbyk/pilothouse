// Gemini CLI with an API key (aistudio.google.com): personal Google logins are no longer accepted by Gemini CLI.
// The key goes where Gemini CLI itself looks (~/.gemini/.env, owner-only), never into Pilothouse's config, so it
// also works outside Pilothouse.
import fs from 'fs';
import os from 'os';
import path from 'path';

const KEY_RE = /^[A-Za-z0-9_-]{20,200}$/;
const VAR = 'GEMINI_API_KEY';

const files = (home: string) => ({
  env: path.join(home, '.gemini', '.env'),
  settings: path.join(home, '.gemini', 'settings.json')
});

const readLines = (f: string) => { try { return fs.readFileSync(f, 'utf-8').split(/\r?\n/); } catch { return []; } };

export function geminiKeyStatus(home = os.homedir()): { hasKey: boolean; last4?: string } {
  const line = readLines(files(home).env).find((l) => l.startsWith(`${VAR}=`));
  const key = line?.slice(VAR.length + 1).trim().replace(/^["']|["']$/g, '');
  return key ? { hasKey: true, last4: key.slice(-4) } : { hasKey: false };
}

// Empty key = remove it. Other lines of .env and other settings stay as they are.
export function setGeminiApiKey(key: string, home = os.homedir()): { ok?: true; error?: string } {
  const k = key.trim();
  if (k && !KEY_RE.test(k)) return { error: 'That does not look like an API key.' };
  const f = files(home);
  // Read settings first: a broken settings.json is reported, never overwritten.
  let settings: any = {};
  if (fs.existsSync(f.settings)) {
    try { settings = JSON.parse(fs.readFileSync(f.settings, 'utf-8')); } catch { return { error: `${f.settings} is not valid JSON; fix it first.` }; }
  }
  fs.mkdirSync(path.dirname(f.env), { recursive: true });
  const lines = readLines(f.env).filter((l) => !l.startsWith(`${VAR}=`) && l !== '');
  if (k) lines.push(`${VAR}=${k}`);
  fs.writeFileSync(f.env, lines.length ? `${lines.join('\n')}\n` : '', { mode: 0o600 });
  fs.chmodSync(f.env, 0o600);
  settings.security = { ...settings.security, auth: { ...settings.security?.auth, selectedType: k ? 'gemini-api-key' : 'oauth-personal' } };
  fs.writeFileSync(f.settings, `${JSON.stringify(settings, null, 2)}\n`);
  return { ok: true };
}
