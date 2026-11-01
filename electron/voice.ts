// Local speech-to-text: whisper.cpp (bundled whisper-cli) + Whisper large-v3-turbo, downloaded once on request.
// Nothing leaves the machine.
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';

export const MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin';
export const MODEL_SHA256 = '394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2';
export const MODEL_BYTES = 574_041_195;
export const MODEL_FILE = path.join(os.homedir(), '.pilothouse', 'models', 'ggml-large-v3-turbo-q5_0.bin');

// Packaged: Resources/whisper-cli (built in CI). Dev: vendor/whisper/whisper-cli. Else a Homebrew install.
export function whisperBinary(resourcesPath: string | undefined, appPath: string): string | null {
  const candidates = [
    resourcesPath && path.join(resourcesPath, 'whisper-cli'),
    path.join(appPath, 'vendor', 'whisper', 'whisper-cli'),
    '/opt/homebrew/bin/whisper-cli',
    '/usr/local/bin/whisper-cli'
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

export function transcribe(binary: string, pcm: Buffer, language: string, prompt?: string): Promise<string> {
  const wav = path.join(os.tmpdir(), `pilothouse-voice-${process.pid}-${Date.now()}.wav`);
  fs.writeFileSync(wav, pcmToWav(pcm));
  const args = ['-m', MODEL_FILE, '-f', wav, '-l', language || 'auto', '-nt', '-np'];
  if (prompt) args.push('--prompt', prompt);
  return new Promise((resolve, reject) => {
    execFile(binary, args, { timeout: 60_000, maxBuffer: 1024 * 1024 }, (err, stdout) => {
      fs.rmSync(wav, { force: true });
      if (err) return reject(new Error(`speech recognition failed: ${err.message}`));
      resolve(cleanTranscript(stdout));
    });
  });
}
