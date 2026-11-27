// Writes THIRD_PARTY_NOTICES.md: the license text of every package bundled into the app, plus the
// non-npm parts we ship (whisper.cpp, the wake word models). Run after changing dependencies:
//   bun scripts/notices.ts
import fs from 'fs';
import path from 'path';

// Packages that end up in the app: runtime deps plus the dev deps Vite bundles into main/renderer.
const BUNDLED = ['electron-updater', 'node-pty', '@xterm/xterm', '@xterm/addon-fit', '@xterm/addon-webgl',
  '@xterm/headless', 'lucide-react', 'onnxruntime-web', 'qrcode', 'react', 'react-dom', 'web-push'];

const pkg = (n: string) => {
  try { return JSON.parse(fs.readFileSync(path.join('node_modules', n, 'package.json'), 'utf8')); } catch { return null; }
};
const licenseText = (n: string) => {
  const dir = path.join('node_modules', n);
  const f = fs.readdirSync(dir).find(x => /^(licen[cs]e|copying)/i.test(x));
  return f ? fs.readFileSync(path.join(dir, f), 'utf8').trim() : '';
};

const seen = new Map<string, any>();
const queue = [...BUNDLED];
while (queue.length) {
  const n = queue.shift()!;
  if (seen.has(n)) continue;
  const p = pkg(n);
  if (!p) continue; // optional dep not installed on this platform
  seen.set(n, p);
  queue.push(...Object.keys({ ...p.dependencies, ...p.optionalDependencies }));
}

const out = ['# Third-party notices', '',
  'Pilothouse is MIT licensed (see LICENSE). It ships the following third-party software under their own licenses.', '',
  '## Not from npm', '',
  '- **Electron and Chromium**: MIT and Chromium licenses, in LICENSE.electron.txt and LICENSES.chromium.html next to the app.',
  '- **whisper.cpp** (bin/whisper-cli): MIT, Copyright (c) 2023-2024 The ggml authors. https://github.com/ggml-org/whisper.cpp',
  '- **Whisper large-v3-turbo model** (downloaded on first use of voice, not shipped): MIT, Copyright (c) 2022 OpenAI.',
  '- **openWakeWord feature models** (wakeword/melspectrogram.onnx, wakeword/embedding_model.onnx): Apache License 2.0, Copyright David Scripka; the embedding model is derived from Google\'s speech_embedding model (Apache License 2.0). https://github.com/dscripka/openWakeWord',
  '- **"Hey Pilothouse" wake word model** (wakeword/hey_pilothouse.onnx): CC BY-NC-SA 4.0, see resources/wakeword/LICENSE.md.',
  '', '## npm packages', ''];
for (const [n, p] of [...seen].sort(([a], [b]) => a.localeCompare(b))) {
  const lic = typeof p.license === 'string' ? p.license : p.license?.type ?? 'see text';
  const text = licenseText(n);
  out.push(`### ${n} ${p.version} (${lic})`, '', text ? '```\n' + text + '\n```' : `License: ${lic} (no license file in the package)`, '');
  if (!/MIT|ISC|BSD|Apache|MPL|BlueOak|0BSD|Python|CC0|Unlicense/.test(lic)) throw new Error(`check the license of ${n}: ${lic}`);
}
fs.writeFileSync('THIRD_PARTY_NOTICES.md', out.join('\n'));
console.log(`THIRD_PARTY_NOTICES.md: ${seen.size} packages`);
