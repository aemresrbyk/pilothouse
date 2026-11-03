// Run: bun tests/selfcheck.ts
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { detectRunCommands, getCodexSessions, readTranscript, searchHistory } from '../electron/scanner';
import { findProject, stripAnsi } from '../electron/control';
import { Endpointer } from '../src/utils/voice';
import { pcmToWav, cleanTranscript, transcribe, whisperBinary, hasModel } from '../electron/voice';
import { toFlagList, buildAgentCommand, agentById } from '../src/types';
import { newActivity, noteOutput, nextStatus } from '../electron/activity';
import { parseChoices } from '../src/utils/inbox';
import { treeUsage } from '../electron/resources';
import { ttsCommand } from '../electron/voice';

{
  // Windows speech: the language code can't break out of the PowerShell string.
  const [cmd, args] = ttsCommand("tr'; Remove-Item x; '", 'win32')!;
  assert.equal(cmd, 'powershell.exe');
  assert.ok(args[3].includes("-like 'trRemove*'") && !args[3].includes("x; '"), args[3]);
  assert.ok(ttsCommand('en', 'win32')![1][3].includes("-like 'en*'"));
}

{
  // Inbox: the last redraw of a numbered prompt wins; y/n prompts fall back to y/n; plain output has no choices.
  const claude = ' Do you want to proceed?\n ❯ 1. Yes\n   2. No\n' +
    '│ Do you want to proceed?            │\n│ ❯ 1. Yes                           │\n│   2. Yes, and don\'t ask again      │\n│   3. No (esc)                      │\n';
  assert.deepStrictEqual(parseChoices(claude).map((c) => [c.key, c.label]), [['1', 'Yes'], ['2', "Yes, and don't ask again"], ['3', 'No (esc)']]);
  assert.deepStrictEqual(parseChoices('Overwrite file? (y/n) ').map((c) => c.key), ['y\r', 'n\r']);
  assert.deepStrictEqual(parseChoices('Step 2. build the app\nall done'), []);

  // Resources: a tab's usage is its shell plus every descendant, not other trees.
  const ps = '  1 0 0.0 1024\n 10 1 1.0 2048\n 11 10 50.5 102400\n 12 11 10.0 1024\n 20 1 99.0 1024\n';
  const u = treeUsage(ps, [10, 99]).get(10)!;
  assert.equal(u.cpu, 61.5);
  assert.equal(u.memMB, 103);
  assert.deepStrictEqual(treeUsage(ps, [99]).get(99), { cpu: 0, memMB: 0 });
  console.log('inbox + resources ok');
}

const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ph-'));
fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ scripts: { dev: 'vite', predev: 'x', build: 'tsc' } }));
fs.writeFileSync(path.join(d, 'pnpm-lock.yaml'), '');
fs.writeFileSync(path.join(d, 'Makefile'), 'X := 1\nserve: build\n\techo\n.PHONY: serve\n');
fs.writeFileSync(path.join(d, 'README.md'), '# x\n```bash\n$ git clone foo  # get it\n# comment\npnpm run dev\n```\n');
const cmds = detectRunCommands(d).map(c => c.command);
assert.deepStrictEqual(cmds, ['pnpm install', 'pnpm run dev', 'pnpm run build', 'make serve', 'git clone foo']);

assert.deepStrictEqual(toFlagList({ dangerouslySkipPermissions: true, continueLast: false, verbose: true, bogus: true }), ['--dangerously-skip-permissions', '--verbose']);
assert.deepStrictEqual(toFlagList(['--model opus', 3]), ['--model opus']);
assert.deepStrictEqual(toFlagList(undefined), []);

{
  // Agent status: a 3s run then silence = idle; silence after an approval prompt = waiting; typing echo is ignored.
  const a = newActivity(0);
  for (let t = 100; t <= 3100; t += 100) noteOutput(a, t);
  assert.equal(nextStatus(a, 3200, ''), 'idle', 'startup screen is not a run');
  for (let t = 6000; t <= 9000; t += 100) noteOutput(a, t);
  assert.equal(a.status = nextStatus(a, 9100, ''), 'running');
  assert.equal(nextStatus(a, 12000, 'All done.'), 'idle');
  assert.equal(nextStatus(a, 12000, 'Doyouwantto make\nthis edit?\n❯ 1. Yes'), 'waiting');
  const b = newActivity(0);
  for (let t = 6000; t <= 9000; t += 100) { b.lastInput = t - 50; noteOutput(b, t); }
  assert.equal(nextStatus(b, 9100, ''), 'idle', 'typing echo is not a run');
}

// Agent commands: resume goes right after the binary (Codex uses a subcommand), --continue is dropped on resume.
assert.equal(buildAgentCommand(agentById('codex'), 'codex', ['--full-auto', '--continue'], '', 'abc'), 'codex resume abc --full-auto');
assert.equal(buildAgentCommand(agentById('claude'), '/my bin/claude', ['--verbose'], 'fix it'), '"/my bin/claude" --verbose fix it');
assert.equal(agentById('nope').id, 'claude');

{
  // Codex sessions are matched to the project by the cwd in session_meta; titles come from session_index.jsonl.
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-'));
  const day = path.join(home, 'sessions', '2026', '10', '31');
  fs.mkdirSync(day, { recursive: true });
  const id1 = '019d798b-93f5-7eb2-9f62-17b532d52f45', id2 = '019d798b-0000-7eb2-9f62-17b532d52f46';
  const meta = (id: string, cwd: string) => JSON.stringify({ type: 'session_meta', payload: { id, cwd } }) + '\n';
  fs.writeFileSync(path.join(day, `rollout-2026-10-31T10-00-00-${id1}.jsonl`), meta(id1, d) + JSON.stringify({ type: 'event_msg', payload: { type: 'user_message', message: 'add tests' } }) + '\n');
  fs.writeFileSync(path.join(day, `rollout-2026-10-31T11-00-00-${id2}.jsonl`), meta(id2, '/somewhere/else'));
  fs.writeFileSync(path.join(home, 'session_index.jsonl'), JSON.stringify({ id: 'other', thread_name: 'x' }) + '\n');
  const s = getCodexSessions(d, home);
  assert.deepStrictEqual(s.map((x) => [x.id, x.title]), [[id1, 'add tests']]);
}

{
  // Transcript: prompts + text answers only; consecutive answer blocks merge; tool calls, meta and command wrappers drop out.
  const f = path.join(d, 's.jsonl');
  const L = (o: any) => JSON.stringify(o);
  fs.writeFileSync(f, [
    L({ type: 'user', timestamp: 't1', message: { content: 'Fix the login bug' } }),
    L({ type: 'assistant', message: { content: [{ type: 'thinking', thinking: 'x' }, { type: 'text', text: 'Looking.' }] } }),
    L({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash' }] } }),
    L({ type: 'user', message: { content: [{ type: 'tool_result', content: 'ok' }] } }),
    L({ type: 'assistant', message: { content: [{ type: 'text', text: 'Fixed the Login check.' }] } }),
    L({ type: 'user', isMeta: true, message: { content: 'meta' } }),
    L({ type: 'user', message: { content: '<command-name>/cost</command-name>' } }),
    L({ type: 'event_msg', timestamp: 't9', payload: { type: 'agent_message', message: 'codex says hi' } })
  ].join('\n'));
  assert.deepStrictEqual(readTranscript(f).map((m) => [m.role, m.text, m.time]), [
    ['user', 'Fix the login bug', 't1'],
    ['assistant', 'Looking.\n\nFixed the Login check.\n\ncodex says hi', undefined]
  ]);
  const hits = searchHistory([{ id: 's', file: f, title: 'T' } as any], 'LOGIN');
  assert.deepStrictEqual(hits.map((h) => [h.index, h.role]), [[0, 'user'], [1, 'assistant']]);
}

const ps: any[] = [{ id: 'a', name: 'kitefold', path: '/x/kitefold' }, { id: 'b', name: 'pilothouse', path: '/x/pilothouse' }];
assert.equal(findProject(ps, 'Kitefold')?.id, 'a');
assert.equal(findProject(ps, '/x/pilothouse')?.id, 'b');
assert.equal(findProject(ps, 'pilot house')?.id, 'b');
assert.equal(findProject(ps, 'nope'), undefined);
assert.equal(stripAnsi('\x1b[31mhi\x1b[0m\r\x1b]0;t\x07ok'), 'hi\nok');

{
  // Voice endpointing: speech then a 1.5 s pause ends it; silence alone gives up after 8 s.
  const e = new Endpointer();
  assert.equal(e.feed(0.2, 256), null);
  for (let i = 0; i < 5; i++) assert.equal(e.feed(0.001, 256), null);
  assert.equal(e.feed(0.001, 256), 'done');
  const quiet = new Endpointer();
  let v: string | null = null;
  for (let t = 0; t < 8000 && !v; t += 256) v = quiet.feed(0.001, 256);
  assert.equal(v, 'empty');

  assert.equal(cleanTranscript(' Thank you. '), '');
  assert.equal(cleanTranscript('[BLANK_AUDIO]'), '');
  assert.equal(cleanTranscript(' *Piano* '), '');
  assert.equal(cleanTranscript('♪ ♪'), '');
  assert.equal(cleanTranscript(' Run the tests. '), 'Run the tests.');
  const wav = pcmToWav(Buffer.alloc(32000));
  assert.equal(wav.length, 44 + 32000);
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
}

// End-to-end speech recognition, only where the engine and model are installed (skipped in CI).
const bin = whisperBinary(undefined, path.join(import.meta.dir, '..'));
if (bin && hasModel()) {
  const pcm = fs.readFileSync(path.join(import.meta.dir, 'fixtures', 'voice-en.wav')).subarray(44);
  const heard = await transcribe(bin, pcm, 'auto');
  assert.match(heard.text.toLowerCase(), /unit tests.*login function.*npm test/, heard.text);
  assert.equal(heard.language, 'en');
  assert.ok(heard.words.length >= 8 && heard.words.every((w) => w.p > 0 && w.p <= 1));
  console.log('voice ok:', heard.text, '| min word p', Math.min(...heard.words.map((w) => w.p)).toFixed(2));
}

// Wake word: the bundled "hey pilothouse" model fires on the phrase and not on look-alikes.
{
  const { WakeWordDetector, CHUNK, Trigger } = await import('../src/utils/wakeword');
  const R = path.join(import.meta.dir, '..', 'resources', 'wakeword');
  if (fs.existsSync(path.join(R, 'hey_pilothouse.onnx'))) {
    const read = (f: string) => fs.readFileSync(path.join(R, f));
    const scores = async (file: string) => {
      const d = await WakeWordDetector.create({ mel: read('melspectrogram.onnx'), embedding: read('embedding_model.onnx'), wake: read('hey_pilothouse.onnx') });
      const pcm = new Int16Array(fs.readFileSync(path.join(import.meta.dir, 'fixtures', file)).buffer.slice(4096)); // say's WAV header is 4 KB
      const out: number[] = [];
      for (let i = 0; i + CHUNK <= pcm.length; i += CHUNK) out.push(await d.process(pcm.slice(i, i + CHUNK)));
      return out;
    };
    for (const f of ['wake-pos.wav', 'wake-pos2.wav']) {
      const max = Math.max(...(await scores(f)));
      assert.ok(max > 0.5, `${f}: max score ${max.toFixed(3)}`);
    }
    const neg = Math.max(...(await scores('wake-neg.wav')));
    assert.ok(neg < 0.5, `wake-neg.wav: max score ${neg.toFixed(3)}`);
    const t = new Trigger(0.5, 2000);
    assert.deepStrictEqual([t.hit(0.9, 0), t.hit(0.9, 500), t.hit(0.9, 2500), t.hit(0.2, 6000)], [true, false, true, false]);
    console.log('wake word ok');
  }
}

// Conversation mode: rules + whole dialogues against a fake mic/speaker/agent.
{
  const C = await import('../src/utils/conversation');
  const { converse } = await import('../src/utils/conversationLoop');
  const { wordsFromWhisperJson } = await import('../electron/voice');
  const H = (text: string, lang = 'en', lowWords: string[] = []): any => ({
    text, language: lang, words: text.split(/\s+/).map((w) => ({ text: w, p: lowWords.includes(w) ? 0.2 : 0.95 }))
  });

  const { pickVoice, parseVoices } = await import('../electron/voice');
  const voices = parseVoices(['Albert              en_US    # Hello', 'Eddy (English (US)) en_US    # Hi', 'Samantha            en_US    # Hi', 'Daniel              en_GB    # Hi', 'Ava (Premium)       en_US    # Hi', 'Yelda               tr_TR    # Merhaba'].join('\n'));
  assert.equal(pickVoice('en', voices), 'Ava (Premium)');
  assert.equal(pickVoice('en', voices.filter((v) => !/Ava/.test(v.name))), 'Samantha');
  assert.equal(pickVoice('tr', voices), 'Yelda');
  assert.equal(pickVoice('en', parseVoices('Albert  en_US  # x')), undefined, 'never a novelty voice');
  const ww = wordsFromWhisperJson({ result: { language: 'tr' }, transcription: [{ tokens: [{ text: '[_BEG_]', p: 1 }, { text: ' in', p: 0.9 }, { text: ' alt', p: 0.29 }, { text: 'v', p: 0.93 }, { text: '.ts', p: 0.9 }] }] });
  assert.deepStrictEqual(ww, { language: 'tr', words: [{ text: 'in', p: 0.9 }, { text: 'altv.ts', p: 0.29 }] });

  assert.equal(C.judge(H('add tests to auth.ts')).kind, 'ok');
  assert.deepStrictEqual(C.judge(H('add tests to altv.ts', 'en', ['altv.ts'])), { kind: 'confirm', words: ['altv.ts'] });
  assert.equal(C.judge(H('run npm test', 'en', ['npm'])).kind, 'ok', 'familiar tech words are not questioned');
  assert.equal(C.judge(H('kitefold', 'en', ['kitefold']), ['kitefold']).kind, 'ok', 'project names are vocabulary');
  assert.equal(C.judge(H('a b c d', 'en', ['a', 'b', 'c'])).kind, 'repeat');
  assert.equal(C.judge(H('')).kind, 'repeat');
  assert.deepStrictEqual(['Yes.', 'evet', 'Hayır!', 'no thanks', 'maybe'].map(C.yesNo), ['yes', 'yes', 'no', 'no', null]);
  assert.ok(C.isStop('Dur.') && C.isStop('stop') && !C.isStop('stop the server and restart it'));
  assert.ok(C.isGoodbye('Teşekkürler.') && C.isGoodbye("that's all") && !C.isGoodbye('thanks, now add tests'));
  assert.equal(C.applyCorrection('add tests to altv.ts', ['altv.ts'], 'auth.ts'), 'add tests to auth.ts');
  assert.equal(C.applyCorrection('add tests to altv.ts', ['altv.ts'], 'no I meant write tests for the login function'), 'no I meant write tests for the login function');
  assert.equal(C.speakable('I added **3 tests**:\n```ts\nx()\n```\nSee [docs](http://x).', 'en'), 'I added 3 tests: The code is on screen. See docs.');
  assert.ok(C.speakable('A. '.repeat(300), 'tr').endsWith('Devamı ekranda.'));
  assert.equal(C.approvalQuestion('Edit file\n Do you want to make this edit to auth.ts?\n ❯ 1. Yes\n 2. No'), 'Do you want to make this edit to auth.ts?');

  // Fake world: a scripted user, a speaker that records what was said, an agent that answers.
  const run = async (user: any[], agent: Array<'idle' | 'waiting'>, opts: { reply?: string; bargeAt?: number } = {}) => {
    const said: string[] = [], sent: string[] = [], keys: string[] = [];
    let listens = 0;
    const result = await converse({
      listen: async (o) => (o?.signal ? new Promise((r) => o.signal!.addEventListener('abort', () => r(null))) : (user[listens++] ?? null)),
      speak: async (text) => {
        said.push(text);
        if (opts.bargeAt === said.length) return { interrupted: true, heard: user[listens++] ?? null };
        return { interrupted: false };
      },
      send: (t) => sent.push(t),
      keys: (k) => keys.push(k),
      waitForAgent: async () => agent.shift() ?? 'idle',
      lastReply: async () => opts.reply ?? 'All **tests** pass.',
      screen: async () => ' Do you want to run npm test?\n ❯ 1. Yes',
      agentName: 'Claude', approveKey: '\r', denyKey: '\x1b', interruptKey: '\x1b',
      vocab: ['kitefold'], cancelled: () => false, onState: () => {}
    });
    return { result, said, sent, keys };
  };

  // Plain turn, answer read aloud, then goodbye.
  let r = await run([H('add tests to auth.ts'), H('thanks', 'en')], ['idle']);
  assert.deepStrictEqual(r.sent, ['add tests to auth.ts']);
  assert.deepStrictEqual(r.said, ['On it.', 'All tests pass.', 'Okay, talk later.']);
  assert.equal(r.result, 'goodbye');

  // Unclear word -> asks -> short correction replaces it.
  r = await run([H('add tests to altv.ts', 'en', ['altv.ts']), H('auth.ts')], ['idle']);
  assert.equal(r.said[0], 'Did you say "altv.ts"? Say yes, or say it again.');
  assert.deepStrictEqual(r.sent, ['add tests to auth.ts']);
  assert.equal(r.result, 'silence');

  // Mumble -> asks to repeat (in Turkish when spoken in Turkish).
  r = await run([H('', 'tr'), H('testleri çalıştır', 'tr')], ['idle']);
  assert.equal(r.said[0], 'Kusura bakma, anlayamadım. Tekrar söyler misin?');
  assert.deepStrictEqual(r.sent, ['testleri çalıştır']);
  assert.equal(r.said[1], 'Tamam, bakıyorum.');

  // Agent asks approval -> read out -> "evet" presses Enter -> answer after it finishes.
  r = await run([H('run the tests'), H('evet', 'tr')], ['waiting', 'idle']);
  assert.equal(r.said[1], 'Claude asks: Do you want to run npm test? Yes or no?');
  assert.deepStrictEqual(r.keys, ['\r']);
  assert.ok(r.said.includes('Onaylandı.'));

  // "no" denies with Esc.
  r = await run([H('delete the build folder'), H('no')], ['waiting']);
  assert.deepStrictEqual(r.keys, ['\x1b']);
  assert.equal(r.said[2], 'Okay, cancelled.');

  // Talking over the answer cuts it off and becomes the next request.
  r = await run([H('explain the router'), H('actually just list the files')], ['idle', 'idle'], { reply: 'The router is long. '.repeat(10), bargeAt: 2 });
  assert.deepStrictEqual(r.sent, ['explain the router', 'actually just list the files']);
  console.log('conversation ok');
}

console.log('selfcheck ok');
