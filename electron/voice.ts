// Local speech-to-text: whisper.cpp (bundled whisper-cli) + Whisper large-v3-turbo, downloaded once on request.
// Nothing leaves the machine.
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { execFile, execFileSync, spawn, ChildProcess } from 'child_process';

export const MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin';
export const MODEL_SHA256 = '394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2';
export const MODEL_BYTES = 574_041_195;
export const MODEL_FILE = path.join(os.homedir(), '.pilothouse', 'models', 'ggml-large-v3-turbo-q5_0.bin');

// Packaged: Resources/whisper-cli (built in CI). Dev: vendor/whisper/whisper-cli. Else a Homebrew / system install.
export function whisperBinary(resourcesPath: string | undefined, appPath: string): string | null {
  const exe = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli';
  const candidates = [
    resourcesPath && path.join(resourcesPath, exe),
    path.join(appPath, 'vendor', 'whisper', exe),
    '/opt/homebrew/bin/whisper-cli',
    '/usr/local/bin/whisper-cli',
    '/usr/bin/whisper-cli'
  ].filter(Boolean) as string[];
  return candidates.find((c) => fs.existsSync(c)) || null;
}

export const hasModel = () => {
  try { return fs.statSync(MODEL_FILE).size === MODEL_BYTES; } catch { return false; }
};

let downloading: Promise<void> | null = null;

// Streams to a .part file, checks the SHA-256, then renames, so a cut download never looks complete.
export function downloadModel(onProgress: (received: number, total: number) => void): Promise<void> {
  if (downloading) return downloading;
  downloading = (async () => {
    fs.mkdirSync(path.dirname(MODEL_FILE), { recursive: true });
    const part = MODEL_FILE + '.part';
    const res = await fetch(MODEL_URL);
    if (!res.ok || !res.body) throw new Error(`download failed: HTTP ${res.status}`);
    const total = Number(res.headers.get('content-length')) || MODEL_BYTES;
    const hash = crypto.createHash('sha256');
    const out = fs.createWriteStream(part);
    let received = 0, lastReport = 0;
    try {
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        hash.update(chunk);
        received += chunk.length;
        if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
        if (received - lastReport > 2_000_000) { lastReport = received; onProgress(received, total); }
      }
    } finally {
      await new Promise((r) => out.end(r));
    }
    if (hash.digest('hex') !== MODEL_SHA256) {
      fs.rmSync(part, { force: true });
      throw new Error('downloaded model is corrupt (checksum mismatch), please try again');
    }
    fs.renameSync(part, MODEL_FILE);
    onProgress(total, total);
  })().finally(() => { downloading = null; });
  return downloading;
}

// 16 kHz mono 16-bit PCM -> WAV bytes.
export function pcmToWav(pcm: Buffer, rate = 16000): Buffer {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

// Whisper invents filler on silence/noise ("Thank you.", "*Piano*", "♪", subtitle credits). Those are never commands.
export function cleanTranscript(text: string): string {
  const t = text.replace(/\[[^\]]*\]|\([^)]*\)|\*[^*]*\*|♪/g, ' ').replace(/\s+/g, ' ').trim();
  const bare = t.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').trim();
  const junk = ['thank you', 'thanks for watching', 'you', 'altyazı mk', 'teşekkürler', 'teşekkür ederim', 'abone olmayı unutmayın'];
  return junk.includes(bare) || bare.includes('subtitles by') || bare.includes('altyazı') ? '' : t;
}

export interface Heard {
  text: string;
  language: string;
  words: { text: string; p: number }[];
}

// Whisper's full JSON gives a probability per token; a word's confidence is its least certain token.
export function wordsFromWhisperJson(json: any): { language: string; words: { text: string; p: number }[] } {
  const words: { text: string; p: number }[] = [];
  for (const seg of json?.transcription || []) {
    for (const tok of seg.tokens || []) {
      const t: string = tok.text || '';
      if (/^\[_.*\]$/.test(t.trim()) || !t) continue;
      if (t.startsWith(' ') || !words.length) words.push({ text: t.trim(), p: tok.p });
      else {
        const last = words[words.length - 1];
        last.text += t;
        last.p = Math.min(last.p, tok.p);
      }
    }
  }
  return { language: json?.result?.language || 'en', words };
}

export function transcribe(binary: string, pcm: Buffer, language: string, prompt?: string): Promise<Heard> {
  const base = path.join(os.tmpdir(), `pilothouse-voice-${process.pid}-${Date.now()}`);
  const wav = base + '.wav';
  fs.writeFileSync(wav, pcmToWav(pcm));
  const args = ['-m', MODEL_FILE, '-f', wav, '-l', language || 'auto', '-nt', '-np', '-ojf', '-of', base];
  if (prompt) args.push('--prompt', prompt);
  return new Promise((resolve, reject) => {
    execFile(binary, args, { timeout: 60_000, maxBuffer: 1024 * 1024 }, (err, stdout) => {
      let json: any = null;
      try { json = JSON.parse(fs.readFileSync(base + '.json', 'utf-8')); } catch {}
      fs.rmSync(wav, { force: true });
      fs.rmSync(base + '.json', { force: true });
      if (err) return reject(new Error(`speech recognition failed: ${err.message}`));
      const text = cleanTranscript(stdout);
      const { language: lang, words } = wordsFromWhisperJson(json);
      resolve({ text, language: lang, words: text ? words : [] });
    });
  });
}

// --- Speech output: the system's own voices (macOS say, Windows SAPI, Linux espeak-ng), killable for barge-in. ---

// Best installed voice per language: Premium > Enhanced > natural voices > Eloquence voices; novelty voices never.
const NOVELTY = /^(albert|bad news|bahh|bells|boing|bubbles|cellos|wobble|fred|good news|jester|junior|kathy|organ|superstar|ralph|trinoids|whisper|zarvox|deranged|hysterical|pipe organ)\b/i;
const NATURAL = /^(samantha|ava|allison|alex|tom|susan|zoe|evan|nathan|daniel|karen|moira|tessa|rishi|serena|kate|oliver|yelda|cem)\b/i;
let voiceList: { name: string; locale: string }[] | null = null;
export function pickVoice(lang: string, list = listVoices()): string | undefined {
  const mine = list.filter((v) => v.locale.toLowerCase().startsWith(lang.toLowerCase()) && !NOVELTY.test(v.name));
  const rank = (v: { name: string; locale: string }) =>
    (/premium/i.test(v.name) ? 0 : /enhanced|gelişmiş|geliştirilmiş/i.test(v.name) ? 10 : NATURAL.test(v.name) ? 20 : 30) +
    (lang === 'en' && v.locale !== 'en_US' ? 1 : 0);
  return [...mine].sort((a, b) => rank(a) - rank(b))[0]?.name;
}
export function parseVoices(out: string): { name: string; locale: string }[] {
  return out.split('\n').map((l) => l.match(/^(.+?)\s+([a-z]{2,3}_[A-Z0-9]{2,})\s+#/)).filter(Boolean).map((m) => ({ name: m![1].trim(), locale: m![2] }));
}
function listVoices() {
  if (!voiceList) {
    try { voiceList = parseVoices(execFileSync('say', ['-v', '?'], { encoding: 'utf-8' })); } catch { voiceList = []; }
  }
  return voiceList;
}

// Windows: the built-in SAPI voices, first one installed for the language. Text is read from stdin as UTF-8.
const winSpeech = (lang: string) =>
  `[Console]::InputEncoding = [Text.Encoding]::UTF8; Add-Type -AssemblyName System.Speech; ` +
  `$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; ` +
  `$v = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like '${lang}*' } | Select-Object -First 1; ` +
  `if ($v) { $s.SelectVoice($v.VoiceInfo.Name) }; $s.Speak([Console]::In.ReadToEnd())`;

let linuxTts: string | null | undefined;
// Program + args that read the text from stdin, so nothing in it can be read as an option. null = no speech engine.
export function ttsCommand(lang: string, platform = process.platform): [string, string[]] | null {
  const code = lang.replace(/[^a-zA-Z-]/g, '').slice(0, 8) || 'en';
  if (platform === 'darwin') {
    const voice = pickVoice(code);
    return ['say', voice ? ['-v', voice] : []];
  }
  if (platform === 'win32') return ['powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', winSpeech(code)]];
  // shortcut: Linux needs espeak-ng (or espeak) installed; without one, answers are only shown, not read aloud.
  if (linuxTts === undefined) {
    linuxTts = ['espeak-ng', 'espeak'].find((bin) => {
      try { execFileSync('which', [bin], { stdio: 'ignore' }); return true; } catch { return false; }
    }) || null;
  }
  return linuxTts ? [linuxTts, ['-v', code, '--stdin']] : null;
}

let speaking: ChildProcess | null = null;
// Resolves true if it was cut off (stopSpeaking), false when it finished.
export function speak(text: string, lang: string): Promise<boolean> {
  stopSpeaking();
  const tts = ttsCommand(lang);
  if (!tts) return Promise.resolve(false);
  const proc = spawn(tts[0], tts[1], { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true });
  speaking = proc;
  proc.stdin!.on('error', () => {}); // engine missing or quit early: EPIPE must not crash the app
  proc.stdin!.end(text);
  return new Promise((resolve) => {
    proc.on('close', (code, signal) => {
      if (speaking === proc) speaking = null;
      resolve(signal !== null);
    });
    proc.on('error', () => resolve(false));
  });
}
export function stopSpeaking() {
  if (speaking) { speaking.kill('SIGTERM'); speaking = null; }
}
