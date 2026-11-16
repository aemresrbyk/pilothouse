// Run: bun tests/selfcheck.ts
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import crypto from 'crypto';
import { detectRunCommands, getCodexSessions, readTranscript, searchHistory } from '../electron/scanner';
import { findProject, stripAnsi } from '../electron/control';
import { BRAINSTORM } from '../src/utils/conversation';
import { Screen, paletteColor } from '../electron/screen';
import { Endpointer } from '../src/utils/voice';
import { pcmToWav, cleanTranscript, transcribe, whisperBinary, hasModel } from '../electron/voice';
import { toFlagList, buildAgentCommand, agentById } from '../src/types';
import { newActivity, noteOutput, nextStatus } from '../electron/activity';
import { parseChoices } from '../src/utils/inbox';
import { treeUsage } from '../electron/resources';
import { ttsCommand } from '../electron/voice';
import { formatHandoff, writeHandoff } from '../electron/handoff';
import { hitLimit } from '../electron/activity';
import { promptArgs, handoffPrompt, AGENTS } from '../src/types';
import { execFileSync } from 'child_process';
import { mergeProjects } from '../electron/setup';
import { setGeminiApiKey, geminiKeyStatus } from '../electron/geminiKey';

{
  // Gemini API key: owner-only .env, other lines kept, auth type switched, broken settings never overwritten.
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ph-gem-'));
  fs.mkdirSync(path.join(home, '.gemini'));
  fs.writeFileSync(path.join(home, '.gemini', '.env'), 'OTHER=1\nGEMINI_API_KEY=old\n');
  fs.writeFileSync(path.join(home, '.gemini', 'settings.json'), JSON.stringify({ ui: { theme: 'x' } }));
  assert.ok(setGeminiApiKey('AIzaSyTESTKEY_0123456789abcd', home).ok);
  assert.equal(fs.readFileSync(path.join(home, '.gemini', '.env'), 'utf-8'), 'OTHER=1\nGEMINI_API_KEY=AIzaSyTESTKEY_0123456789abcd\n');
  assert.equal(fs.statSync(path.join(home, '.gemini', '.env')).mode & 0o777, 0o600);
  const st = JSON.parse(fs.readFileSync(path.join(home, '.gemini', 'settings.json'), 'utf-8'));
  assert.deepStrictEqual(st, { ui: { theme: 'x' }, security: { auth: { selectedType: 'gemini-api-key' } } });
  assert.deepStrictEqual(geminiKeyStatus(home), { hasKey: true, last4: 'abcd' });
  assert.ok(setGeminiApiKey('', home).ok);
  assert.deepStrictEqual(geminiKeyStatus(home), { hasKey: false });
  assert.ok(setGeminiApiKey('bad key; rm', home).error);
  fs.writeFileSync(path.join(home, '.gemini', 'settings.json'), '{ broken');
  assert.ok(setGeminiApiKey('AIzaSyTESTKEY_0123456789abcd', home).error);
  assert.equal(fs.readFileSync(path.join(home, '.gemini', 'settings.json'), 'utf-8'), '{ broken');
  console.log('gemini key ok');
}
import { parseClaudeEfforts, parseCodexModels, parseOpencodeModels, parseAgyModels, parseAgyEfforts } from '../electron/agentOptions';

{
  // Model/effort lists come from each agent's own output; the command gets them in that agent's syntax.
  assert.deepStrictEqual(parseClaudeEfforts('  --effort <level>     Effort level for the current session\n                        (low, medium, high, xhigh, max)\n'), ['low', 'medium', 'high', 'xhigh', 'max']);
  const codex = parseCodexModels(JSON.stringify([
    { slug: 'gpt-reserve', visibility: 'hide' },
    { slug: 'gpt-6-luna', display_name: 'GPT-6 Luna', visibility: 'list', default_reasoning_level: 'medium', supported_reasoning_levels: [{ effort: 'low' }, { effort: 'ultra' }] }
  ]));
  assert.deepStrictEqual(codex, [{ id: 'gpt-6-luna', label: 'GPT-6 Luna', efforts: ['low', 'ultra'], defaultEffort: 'medium' }]);
  assert.deepStrictEqual(parseCodexModels('not json'), []);
  assert.deepStrictEqual(parseOpencodeModels('opencode/big-pickle\nanthropic/claude-haiku-4-5\nWarning: x\n').map((m) => m.id), ['opencode/big-pickle', 'anthropic/claude-haiku-4-5']);
  const cmd = (id: string, model?: string, effort?: string) => buildAgentCommand(agentById(id), id, [], undefined, undefined, { model, effort });
  assert.equal(cmd('claude', 'sonnet', 'low'), 'claude --model sonnet --effort low');
  assert.equal(cmd('codex', 'gpt-6-luna', 'high'), 'codex -m gpt-6-luna -c model_reasoning_effort=high');
  assert.equal(cmd('gemini', 'flash', 'high'), 'gemini -m flash', 'Gemini has no effort setting');
  assert.equal(cmd('opencode', 'anthropic/claude-haiku-4-5'), 'opencode -m anthropic/claude-haiku-4-5');
  assert.equal(cmd('claude', 'x; rm -rf ~', 'low'), 'claude --effort low', 'unsafe model ids are dropped');
  assert.equal(cmd('codex'), 'codex', 'no choice = the account default');
  assert.equal(cmd('antigravity', 'gemini-3.8-flash-high', 'max'), 'antigravity --model gemini-3.8-flash-high --effort max');
  assert.deepStrictEqual(parseAgyModels('Fetching available models...\ngemini-3.8-flash-high\tGemini 3.8 Flash (High)\nclaude-opus-4-6-thinking\tClaude Opus 4.6 (Thinking)\n'),
    [{ id: 'gemini-3.8-flash-high', label: 'Gemini 3.8 Flash (High)' }, { id: 'claude-opus-4-6-thinking', label: 'Claude Opus 4.6 (Thinking)' }]);
  assert.deepStrictEqual(parseAgyEfforts('  --effort                        Reasoning effort for the current CLI session (low|medium|high|xhigh|max)\n'), ['low', 'medium', 'high', 'xhigh', 'max']);
  console.log('models ok');
}

{
  // Setup wizard projects: known first, symlinked duplicates merged, home and temp folders dropped, history counted.
  const codex = new Map([['/w/api', { count: 3, last: 300 }], ['/tmp/scratch', { count: 1, last: 999 }]]);
  const canon = (p: string) => (p === '/desk/web' ? '/w/web' : p);
  const ps = mergeProjects(
    [{ path: '/w/web', agent: 'codex', lastLaunched: 100 }],
    [{ path: '/desk/web', lastStartTime: 50 }, { path: '/w/api', lastStartTime: 200 }, { path: '/home/me' }, { path: '/w/gone' }],
    codex, (p) => (p === '/w/api' ? 2 : 0), (p) => p !== '/w/gone', '/home/me', ['/tmp'], canon
  );
  assert.deepStrictEqual(ps.map((p) => [p.path, p.known, p.agent, p.claude, p.codex, p.last]),
    [['/w/web', true, 'codex', 0, 0, 100], ['/w/api', false, undefined, 2, 3, 300]]);
  console.log('setup ok');
}

{
  // Hand-off file: conversation, git and memory sections; long messages are cut.
  const text = formatHandoff({
    fromAgent: 'claude', at: new Date('2026-11-03T10:00:00Z'),
    messages: [{ role: 'user', text: 'add login' }, { role: 'assistant', text: 'x'.repeat(2000) }],
    git: { status: ' M src/a.ts', diffStat: ' 1 file changed', log: 'abc first' },
    memory: [{ label: 'Project CLAUDE.md', text: 'Use tabs.' }]
  });
  assert.ok(text.startsWith('# Hand-off from Claude Code'));
  assert.ok(text.includes('**User:** add login') && text.includes('… (cut)') && text.includes(' M src/a.ts') && text.includes('Use tabs.'));

  // Real hand-off in a repo without commits: file written, kept out of git, no crash on missing HEAD.
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ph-ho-'));
  execFileSync('git', ['init', '-q', repo]);
  fs.writeFileSync(path.join(repo, 'AGENTS.md'), 'Run the tests.');
  const r = await writeHandoff(repo, 'gemini');
  assert.ok(r.path && fs.readFileSync(r.path, 'utf-8').includes('Run the tests.'), JSON.stringify(r));
  assert.ok(fs.readFileSync(path.join(repo, '.git', 'info', 'exclude'), 'utf-8').includes('.pilothouse/'));
  assert.ok(!execFileSync('git', ['-C', repo, 'status', '--short'], { encoding: 'utf-8' }).includes('.pilothouse'));
  await writeHandoff(repo, 'gemini');
  assert.equal(fs.readFileSync(path.join(repo, '.git', 'info', 'exclude'), 'utf-8').split('.pilothouse/').length, 2, 'exclude added once');

  // Usage limits of the agents are noticed; normal output is not.
  assert.ok(hitLimit("You've hit your usage limit. Upgrade to Plus or try again in 2 hours."));
  assert.ok(hitLimit('Claude usage limit reached. Your limit will reset at 3pm'));
  assert.ok(hitLimit('Quota exceeded for quota metric'));
  assert.ok(hitLimit('Error authenticating: _GaxiosError: Resource has been exhausted (e.g. check quota).'), 'real Gemini message');
  assert.ok(!hitLimit('Done. All 12 tests pass.'));

  // Each agent gets the first prompt its own way; shell characters are refused.
  const ids = Object.fromEntries(AGENTS.map((a) => [a.id, promptArgs(a, 'hi there')]));
  assert.deepStrictEqual(ids, { claude: '"hi there"', codex: '"hi there"', gemini: '-i "hi there"', antigravity: '-i "hi there"', opencode: '--prompt "hi there"' });
  assert.doesNotThrow(() => promptArgs(AGENTS[0], handoffPrompt('Claude Code')));
  assert.throws(() => promptArgs(AGENTS[0], 'x"; rm -rf ~'));
  console.log('handoff ok');
}

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
// Claude Code redraws skip unchanged spaces with absolute column jumps (ESC[nG).
assert.deepEqual(parseChoices(stripAnsi('❯ 1. Yes\n  2. Yes,\x1b[12Gand\x1b[16Gswitch\n  3. No')).map(c => c.label), ['Yes', 'Yes, and switch', 'No']);

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
  const run = async (user: any[], agent: Array<'idle' | 'waiting'>, opts: { reply?: string; bargeAt?: number; preamble?: string } = {}) => {
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
      vocab: ['kitefold'], cancelled: () => false, onState: () => {}, preamble: opts.preamble
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
  // Brainstorm: the set-up goes in front of the first message only.
  r = await run([H('a habit tracker app'), H('for students')], ['idle', 'idle'], { preamble: '[Voice brainstorm]' });
  assert.deepStrictEqual(r.sent, ['[Voice brainstorm] a habit tracker app', 'for students']);
  assert.ok(BRAINSTORM.includes('SPEC.md') && !BRAINSTORM.includes('\n'), 'one line, names the file');
  console.log('conversation ok');
}

{
  // Phone remote: Tailscale-only, Host check, per-device pairing, stale-prompt guard, two-tap risky approvals, audit log.
  const { isTailscaleIp, hostOk, riskOf, startRemoteServer, auditFile, pairingLink, listDevices, pushTargets, sessionView, autoChoice, promptSummary, projectDiff } = await import('../electron/remote');
  assert.ok(isTailscaleIp('100.101.2.3') && !isTailscaleIp('100.128.0.1') && !isTailscaleIp('192.168.1.5'));
  assert.ok(hostOk('100.64.0.1:4747', '100.64.0.1', 4747) && hostOk('mac.tail1234.ts.net:4747', '100.64.0.1', 4747));
  assert.ok(!hostOk('evil.com:4747', '100.64.0.1', 4747) && !hostOk(undefined, '100.64.0.1', 4747));
  assert.equal(riskOf('Bash(rm -rf build)\nDo you want to proceed?'), 'danger');
  assert.equal(riskOf('git push --force origin main'), 'danger');
  assert.equal(riskOf('Bash(npm test)\nDo you want to proceed?'), 'normal');

  process.env.PILOTHOUSE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ph-remote-'));
  const writes: string[] = [], opened: string[] = [];
  let tail = 'Bash(npm test)\nDo you want to proceed?\n❯ 1. Yes\n  2. No\n';
  const r = await startRemoteServer({
    listProjects: () => [{ id: 'p', name: 'demo', path: '/tmp/demo' } as any, { id: 'q', name: 'other', path: '/tmp/other' } as any],
    sessions: () => [{ id: 't1', cwd: '/tmp/demo', status: 'waiting', buf: tail }],
    write: (_id, d) => { writes.push(d); return true; },
    screen: (id) => id === 't1' ? new Screen(20, 3, 'hi \x1b[31mred\x1b[0m').snapshot() : null,
    openTab: async (pid) => { opened.push(pid); return 'tab'; },
    resume: async () => 'tab'
  }, '127.0.0.1', 0);
  assert.ok('server' in r);
  const port = (r.server.address() as any).port;
  const secret = /#p=(\w+)/.exec(pairingLink(r.url))![1];
  let token = '';
  const call = (p: string, body?: unknown, auth = token, host = `127.0.0.1:${port}`) => new Promise<{ status: number; body: any }>((res, rej) => {
    const req = http.request({ port, path: p, method: body ? 'POST' : 'GET', headers: { host, authorization: `Bearer ${auth}`, 'content-type': 'application/json' } }, (resp) => {
      let raw = ''; resp.on('data', (c) => raw += c); resp.on('end', () => res({ status: resp.statusCode!, body: raw.startsWith('<') ? raw : JSON.parse(raw) }));
    });
    req.on('error', rej); req.end(body ? JSON.stringify(body) : undefined);
  });
  assert.equal((await call('/api/pair', { secret: 'wrong', name: 'x' })).status, 401);
  token = (await call('/api/pair', { secret, name: 'iPhone' })).body.token;
  assert.match(token, /^[0-9a-f]{48}$/);
  assert.ok(!fs.readFileSync(path.join(process.env.PILOTHOUSE_DIR!, 'remote.json'), 'utf-8').includes(token)); // only the hash is kept
  assert.equal((await call('/api/sessions', undefined, 'nope')).status, 401);
  assert.equal((await call('/api/sessions', undefined, token, 'evil.com')).status, 421);
  assert.ok(String((await call('/')).body).includes('textContent'));
  // The page's script must parse: one bad escape inside the template string silently kills the whole web remote.
  const page = String((await call('/')).body);
  new Function(page.split('<script>')[1].split('</script>')[0]);
  assert.ok(!/[\x00-\x08\x1b]/.test(page), 'no raw control characters in the page');
  const [s] = (await call('/api/sessions')).body;
  assert.equal(s.project, 'demo');
  assert.deepStrictEqual((await call('/api/projects')).body, [{ id: 'q', name: 'other' }]); // open ones are cards already
  assert.equal((await call('/api/open', { project: 'q' })).status, 200);
  assert.deepStrictEqual(opened, ['q']);
  assert.deepStrictEqual(s.choices.map((c: any) => c.key), ['1', '2']);
  assert.equal((await call('/api/choose', { id: 't1', key: '1', sig: 'stale' })).status, 409);
  assert.equal((await call('/api/choose', { id: 't1', key: '1', sig: s.sig })).status, 200);
  assert.deepStrictEqual(writes, ['1']);
  tail = 'Bash(rm -rf dist)\nDo you want to proceed?\n❯ 1. Yes\n  2. No\n';
  const [d] = (await call('/api/sessions')).body;
  assert.equal(d.risk, 'danger');
  assert.equal((await call('/api/choose', { id: 't1', key: '1', sig: d.sig })).status, 428);
  assert.equal((await call('/api/choose', { id: 't1', key: '2', sig: d.sig })).status, 200); // No: one tap
  assert.equal((await call('/api/choose', { id: 't1', key: '1', sig: d.sig, confirm: true })).status, 200);
  assert.equal(fs.readFileSync(auditFile(), 'utf-8').trim().split('\n').length, 6); // refused pair, pair, open, 3 chooses

  // Push token registration, and revoking one device leaves the others working.
  const reg = await call('/api/push-token', { token: 'ab'.repeat(32), sandbox: true });
  assert.equal(Buffer.from(reg.body.pushKey, 'base64').length, 32);
  assert.deepStrictEqual(pushTargets(), [{ token: 'ab'.repeat(32), sandbox: true, key: reg.body.pushKey }]);
  assert.equal((await call('/api/push-token', { token: 'cd'.repeat(32) })).body.pushKey, reg.body.pushKey); // stable per phone
  // A pairing code works once: a screenshot of an old QR cannot pair another device.
  assert.equal((await call('/api/pair', { secret, name: 'thief' })).status, 401);
  const fresh = /#p=(\w+)/.exec(pairingLink(r.url))![1];
  assert.notEqual(fresh, secret);
  // ...and only for 10 minutes.
  const stateFile = path.join(process.env.PILOTHOUSE_DIR!, 'remote.json');
  const st = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
  fs.writeFileSync(stateFile, JSON.stringify({ ...st, pairAt: Date.now() - 11 * 60_000 }));
  assert.equal((await call('/api/pair', { secret: fresh, name: 'late' })).status, 401);
  assert.notEqual(/#p=(\w+)/.exec(pairingLink(r.url))![1], fresh); // Settings shows a new one
  const other = (await call('/api/pair', { secret: /#p=(\w+)/.exec(pairingLink(r.url))![1], name: 'iPad' })).body.token;
  assert.match(other, /^[0-9a-f]{48}$/);
  // Live terminal: the screen with colours and cursor; raw keys go through, their content stays out of the audit log.
  const scr = (await call('/api/screen?id=t1')).body;
  assert.deepStrictEqual(scr.lines[0], [['hi ', ''], ['red', '#ef6b6b']]);
  assert.deepStrictEqual([scr.cols, scr.rows, scr.cursor], [20, 3, { x: 6, y: 0 }]);
  assert.equal((await call('/api/screen?id=nope')).status, 404);
  writes.length = 0;
  assert.equal((await call('/api/keys', { id: 't1', data: '\x1b[A' })).status, 200);
  assert.deepStrictEqual(writes, ['\x1b[A']);
  assert.equal((await call('/api/keys', { id: 't1', data: '' })).status, 400);
  assert.ok(!fs.readFileSync(auditFile(), 'utf-8').includes('\\u001b[A'));
  // Web Push: only real browser push services are accepted (the computer POSTs to that address).
  const { validWebPush } = await import('../electron/push');
  const goodSub = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'B' + 'a'.repeat(86), auth: 'x'.repeat(22) } };
  assert.ok(validWebPush(goodSub));
  for (const endpoint of ['http://fcm.googleapis.com/x', 'https://169.254.169.254/latest', 'https://evil.com/fcm.googleapis.com', 'https://fcm.googleapis.com.evil.com/x', 'https://localhost:4747/api/keys'])
    assert.ok(!validWebPush({ ...goodSub, endpoint }), endpoint);
  assert.equal((await call('/api/web-push', { subscription: { ...goodSub, endpoint: 'https://127.0.0.1/' } })).status, 400);
  assert.match((await call('/api/web-push-key')).body.key, /^[A-Za-z0-9_-]{80,}$/);
  assert.equal((await call('/api/web-push', { subscription: goodSub })).status, 200);
  const { webPushTargets } = await import('../electron/remote');
  assert.deepStrictEqual(webPushTargets(), [goodSub]);
  assert.equal((await call('/api/web-push', { subscription: null })).status, 200);
  assert.deepStrictEqual(webPushTargets(), []);
  // Hostile input: oversized and broken bodies, tokens of the wrong shape.
  assert.equal((await call('/api/send', { id: 't1', text: 'x'.repeat(30_000) })).status, 413);
  assert.equal((await call('/api/sessions', undefined, token + '0')).status, 401);
  assert.equal((await call('/api/sessions', undefined, token.toUpperCase())).status, 401);
  // Multi-line messages arrive as one bracketed paste, then Enter.
  writes.length = 0;
  tail = '\x1b[?2004h' + tail; // the agent TUI switched bracketed paste on
  assert.equal((await call('/api/send', { id: 't1', text: 'line one\nline two' })).status, 200);
  assert.deepStrictEqual(writes, ['\x1b[200~line one\nline two\x1b[201~', '\r']);
  assert.equal((await call('/api/unpair', {}, other)).status, 200);
  assert.equal((await call('/api/sessions', undefined, other)).status, 401);
  assert.equal((await call('/api/sessions')).status, 200);
  assert.deepStrictEqual(listDevices().map(d => d.name), ['iPhone']);
  assert.equal((await call('/manifest.json')).status, 200);
  assert.equal(fs.statSync(auditFile()).mode & 0o777, 0o600);
  // Web relay: the browser side (WebCrypto, as the page does it) against the computer's handler, no network.
  {
    const { relayHandler } = await import('../electron/relayLink');
    const { remoteApi } = await import('../electron/remote');
    const handle = relayHandler(remoteApi({ listProjects: () => [], sessions: () => [], write: () => true, screen: () => null, openTab: async () => '', resume: async () => '' }));
    const te = new TextEncoder(), td = new TextDecoder();
    const aes = (raw: Uint8Array) => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
    const seal = async (key: CryptoKey, d: string, obj: unknown) => {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: te.encode(d) }, key, te.encode(JSON.stringify(obj))));
      return Buffer.concat([iv, ct]).toString('base64');
    };
    const unseal = async (key: CryptoKey, d: string, box: string) => {
      const raw = Buffer.from(box, 'base64');
      return JSON.parse(td.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.subarray(0, 12), additionalData: te.encode(d) }, key, raw.subarray(12))));
    };
    const code = /#p=(\w+)/.exec(pairingLink(''))![1];
    const pk = await aes(new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(code))));
    const req = (o: object) => ({ id: 'a', t: Date.now(), n: crypto.randomUUID(), ...o });
    // Pairing through the relay hands over token + relay key, sealed with the code's key.
    const pairMsg = JSON.stringify({ d: 'pair', c: await seal(pk, 'pair', req({ m: 'POST', p: '/api/pair', b: { secret: code, name: 'web' } })) });
    const out = JSON.parse((await handle(pairMsg))!);
    const paired = await unseal(pk, 'pair', out.c);
    assert.equal(paired.s, 200);
    assert.equal(typeof paired.b.computer, 'string'); // shown when one browser follows several computers
    const dk = await aes(Buffer.from(paired.b.relayKey, 'base64'));
    const dev = paired.b.device, tok = paired.b.token;
    assert.equal(await handle(pairMsg), null, 'a replayed pairing message is dropped');
    // Requests with the device key work; the wrong key, a wrong token, an old timestamp or a replay do not.
    const get = async (o: object, key = dk, d = dev) => { const r = await handle(JSON.stringify({ d, c: await seal(key, d, req({ m: 'GET', p: '/api/sessions', a: tok, ...o })) })); return r && (await unseal(key, d, JSON.parse(r).c)); };
    assert.deepStrictEqual((await get({}))!.b, []);
    assert.equal(await get({}, pk), null);
    assert.equal((await get({ a: 'f'.repeat(48) }))!.s, 401);
    assert.equal(await get({ t: Date.now() - 5 * 60_000 }), null);
    const fixed = JSON.stringify({ d: dev, c: await seal(dk, dev, req({ m: 'GET', p: '/api/sessions', a: tok })) });
    assert.ok(await handle(fixed)); assert.equal(await handle(fixed), null);
    // View-only link: pairs through the same door, reads, but every action is refused.
    const { viewOnlyLink } = await import('../electron/remote');
    const vcode = /[#&]p=(\w+)/.exec(viewOnlyLink())![1];
    const vk = await aes(new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(vcode))));
    const vp = await unseal(vk, 'pair', JSON.parse((await handle(JSON.stringify({ d: 'pair', c: await seal(vk, 'pair', req({ m: 'POST', p: '/api/pair', b: { secret: vcode, name: 'guest' } })) })))!).c);
    assert.equal(vp.b.viewOnly, true);
    const vdk = await aes(Buffer.from(vp.b.relayKey, 'base64'));
    const vcall = async (m: string, p: string, b = {}) => unseal(vdk, vp.b.device, JSON.parse((await handle(JSON.stringify({ d: vp.b.device, c: await seal(vdk, vp.b.device, req({ m, p, b, a: vp.b.token })) })))!).c);
    assert.equal((await vcall('GET', '/api/sessions')).s, 200);
    for (const p of ['/api/send', '/api/choose', '/api/keys', '/api/stop', '/api/open', '/api/resume', '/api/push-token']) assert.equal((await vcall('POST', p, { id: 'x' })).s, 403, p);
    assert.equal((await handle(JSON.stringify({ d: 'pair', c: await seal(vk, 'pair', req({ m: 'POST', p: '/api/pair', b: { secret: vcode, name: 'again' } })) }))), null, 'view code works once');
    // Only the pairing route goes with the pairing key; a revoked device is gone for good.
    const code2 = /#p=(\w+)/.exec(pairingLink(''))![1];
    const pk2 = await aes(new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(code2))));
    assert.equal(await handle(JSON.stringify({ d: 'pair', c: await seal(pk2, 'pair', req({ m: 'GET', p: '/api/sessions' })) })), null);
    const { revokeDevice } = await import('../electron/remote');
    revokeDevice(dev);
    assert.equal(await get({}), null);
    // The room id is derived from a secret that stays on the computer; the web link carries room + code, after the #.
    const { relayRoom, webPairingLink } = await import('../electron/remote');
    const { roomOf } = await import('../relay/worker.js');
    assert.equal(await roomOf(relayRoom().secret), relayRoom().room);
    assert.match(webPairingLink(), /^https:\/\/usepilothouse\.com\/app\/#r=[0-9a-f]{32}&p=[0-9a-f]{48}$/);
  }
  r.server.close();
  delete process.env.PILOTHOUSE_DIR;

  // Screen: cursor-drawn TUIs come out as the desktop shows them; 256-colour palette maths.
  const sc = new Screen(10, 2, 'abc\x1b[1;1HX\x1b[2;3H\x1b[1;38;2;255;0;0mR');
  const sn = await sc.snapshot();
  assert.deepStrictEqual(sn.lines, [[['Xbc', '']], [['  ', ''], ['R', '#ff0000', true]]]);
  assert.deepStrictEqual(sn.cursor, { x: 3, y: 1 });
  sc.resize(12, 3); assert.equal((await sc.snapshot()).cols, 12);
  sc.dispose();
  assert.deepStrictEqual([paletteColor(1), paletteColor(16), paletteColor(231), paletteColor(232), paletteColor(255)], ['#ef6b6b', '#000000', '#ffffff', '#080808', '#eeeeee']);

  // Messages keep their line breaks only where the program understands bracketed paste.
  const { pasteText } = await import('../electron/control');
  assert.equal(pasteText('\x1b[?2004h', 'a\nb'), '\x1b[200~a\nb\x1b[201~');
  assert.equal(pasteText('\x1b[?2004h\x1b[?2004l', 'a\nb'), 'a b'); // a plain shell would run each line
  assert.equal(pasteText('', 'a\r\nb', true), '\x1b[200~a\nb\x1b[201~');
  assert.equal(pasteText('', 'a\nb'), 'a b');
  assert.equal(pasteText('\x1b[?2004h', 'one line'), 'one line');
  assert.equal(pasteText('\x1b[?2004h', 'x\x1b[201~\nrm -rf ~'), '\x1b[200~x[201~\nrm -rf ~\x1b[201~'); // cannot end the paste early

  // Folder names reach external terminals and editors as literal text, never as shell code.
  const { shQuote, asString } = await import('../electron/terminal');
  for (const evil of ["a'b", 'x$(touch /tmp/ph-pwned)', '`id`', 'sp ace"; rm -rf ~ #', "it's \\ fine"]) {
    assert.equal(execFileSync('sh', ['-c', `printf %s ${shQuote(evil)}`]).toString(), evil);
    if (process.platform === 'darwin') assert.equal(execFileSync('osascript', ['-e', `return ${asString(evil)}`]).toString().replace(/\n$/, ''), evil);
  }
  assert.ok(!fs.existsSync('/tmp/ph-pwned'));

  // Auto-approval: only non-risky prompts that contain a rule phrase, always the first option.
  const view = (buf: string) => sessionView({ id: 'x', cwd: '/tmp/demo', status: 'waiting', buf }, []);
  const safe = view('Bash(npm test)\nDo you want to proceed?\n❯ 1. Yes\n  2. No\n');
  assert.equal(autoChoice(safe, ['npm test'])?.key, '1');
  assert.equal(autoChoice(safe, ['cargo build']), null);
  assert.equal(autoChoice(view('Bash(rm -rf dist && npm test)\nDo you want to proceed?\n❯ 1. Yes\n  2. No\n'), ['npm test']), null);
  assert.equal(promptSummary(safe.tail), 'Bash(npm test) · Do you want to proceed?');

  // Diff of a real repo: changed and new files.
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ph-diff-'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  fs.writeFileSync(path.join(repo, 'a.txt'), 'one\n');
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qam', 'x', '--allow-empty'], { cwd: repo });
  execFileSync('git', ['add', 'a.txt'], { cwd: repo });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'a'], { cwd: repo });
  fs.writeFileSync(path.join(repo, 'a.txt'), 'two\n');
  fs.writeFileSync(path.join(repo, 'b.txt'), 'new\n');
  const pd = await projectDiff(repo);
  assert.ok(pd.diff.includes('-one') && pd.diff.includes('+two') && pd.stat.includes('a.txt'));
  assert.deepStrictEqual(pd.untracked, ['b.txt']);

  // APNs: ES256 token that verifies with the key's public half, and the payload shape the iOS app reads.
  const { apnsJwt, apnsPayload } = await import('../electron/push');
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const keyPath = path.join(os.tmpdir(), `ph-apns-${process.pid}.p8`);
  fs.writeFileSync(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }));
  const jwt = apnsJwt({ keyPath, keyId: 'KEY123', teamId: 'TEAM', bundleId: 'x' }, 1_000_000);
  const [h, c, sig] = jwt.split('.');
  assert.deepStrictEqual(JSON.parse(Buffer.from(h, 'base64url').toString()), { alg: 'ES256', kid: 'KEY123' });
  assert.equal(JSON.parse(Buffer.from(c, 'base64url').toString()).iss, 'TEAM');
  assert.ok(crypto.verify('sha256', Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url')));
  const pl: any = apnsPayload({ title: 'demo', body: 'b', category: 'APPROVAL', data: { sid: 't1', sig: 's', approve: '1', deny: '2' } });
  assert.equal(pl.aps.category, 'APPROVAL');
  assert.equal(pl.sid, 't1');
  fs.rmSync(keyPath);

  // Relay mode: the sealed text opens with the phone's key and nothing else.
  const { seal } = await import('../electron/push');
  const k = crypto.randomBytes(32).toString('base64');
  const box = Buffer.from(seal(k, { title: 'demo', sid: 't1' }), 'base64');
  const d2 = crypto.createDecipheriv('aes-256-gcm', Buffer.from(k, 'base64'), box.subarray(0, 12));
  d2.setAuthTag(box.subarray(box.length - 16));
  assert.deepStrictEqual(JSON.parse(Buffer.concat([d2.update(box.subarray(12, box.length - 16)), d2.final()]).toString()), { title: 'demo', sid: 't1' });

  // The relay itself: validates input, signs for APNs, forwards only ciphertext, maps dead tokens to 410.
  const worker = (await import('../relay/worker.js')).default;
  const env = { APNS_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), APNS_KEY_ID: 'K1', APNS_TEAM_ID: 'T1', APNS_TOPIC: 'com.x' };
  const realFetch = globalThis.fetch;
  const sent: any[] = [];
  let reply = new Response('', { status: 200 });
  (globalThis as any).fetch = async (url: string, init: any) => { sent.push({ url, init }); return reply; };
  const post = (b: unknown) => worker.fetch(new Request('https://relay/push', { method: 'POST', body: JSON.stringify(b) }), env);
  assert.equal((await post({ token: 'zz', kind: 'done', enc: 'x' })).status, 400);
  const enc = seal(k, { title: 'secret project' });
  assert.equal((await post({ token: 'ab'.repeat(32), kind: 'risky', enc, sandbox: true })).status, 200);
  assert.equal(sent[0].url, `https://api.sandbox.push.apple.com/3/device/${'ab'.repeat(32)}`);
  assert.equal(sent[0].init.headers['apns-topic'], 'com.x');
  const fwd = JSON.parse(sent[0].init.body);
  assert.equal(fwd.aps.category, 'APPROVAL_RISKY');
  assert.equal(fwd.enc, enc);
  assert.ok(!sent[0].init.body.includes('secret project'));
  const [jh, jc, js] = sent[0].init.headers.authorization.slice(7).split('.');
  assert.ok(crypto.verify('sha256', Buffer.from(`${jh}.${jc}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(js, 'base64url')));
  reply = new Response(JSON.stringify({ reason: 'BadDeviceToken' }), { status: 400 });
  assert.equal((await post({ token: 'ab'.repeat(32), kind: 'done', enc })).status, 410);
  globalThis.fetch = realFetch;

  // Without Tailscale it refuses to start rather than falling back to the LAN.
  const off = await startRemoteServer({ listProjects: () => [], sessions: () => [], write: () => true, openTab: async () => '', resume: async () => '' }, '');
  assert.ok('error' in off);
  console.log('remote ok');
}

{
  // Usage per agent from local files only, which agent a tab runs, and project to-dos.
  const u = await import('../electron/usage');
  assert.equal(u.agentOfCommand('claude --dangerously-skip-permissions'), 'claude');
  assert.equal(u.agentOfCommand('"/Users/x/My Tools/codex" resume 1'), 'codex');
  assert.equal(u.agentOfCommand('/opt/homebrew/bin/agy -i "hi"'), 'antigravity');
  assert.equal(u.agentOfCommand('npm run dev'), undefined);
  assert.equal(u.withClaudeStatus('claude --model opus'), 'claude --settings "$HOME/.pilothouse/claude-settings.json" --model opus');
  assert.equal(u.withClaudeStatus('"/a b/claude" -c'), '"/a b/claude" --settings "$HOME/.pilothouse/claude-settings.json" -c');
  assert.equal(u.withClaudeStatus('claude --settings x.json'), 'claude --settings x.json');

  process.env.PILOTHOUSE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ph-usage-'));
  const claudeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ph-claude-'));
  u.ensureClaudeStatusHook(claudeHome);
  const hookSettings = JSON.parse(fs.readFileSync(path.join(process.env.PILOTHOUSE_DIR, 'claude-settings.json'), 'utf-8'));
  assert.ok(hookSettings.statusLine.command.includes('claude-statusline.sh'));
  // The script saves what Claude Code pipes in.
  const status = { rate_limits: { five_hour: { used_percentage: 42.4, resets_at: 4102444800 }, seven_day: { used_percentage: 10, resets_at: '2000-01-01T00:00:00Z' } } };
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ph-home-'));
  fs.mkdirSync(path.join(fakeHome, '.pilothouse'));
  const printed = execFileSync('sh', [path.join(process.env.PILOTHOUSE_DIR, 'claude-statusline.sh')], { input: JSON.stringify(status), env: { ...process.env, HOME: fakeHome } }).toString();
  assert.equal(printed, '');
  fs.copyFileSync(path.join(fakeHome, '.pilothouse', 'claude-status.json'), path.join(process.env.PILOTHOUSE_DIR, 'claude-status.json'));
  const cu = u.claudeUsage()!;
  assert.deepStrictEqual(cu.windows.map(w => [w.label, w.usedPercent]), [['5 hours', 42], ['week', 0]]); // past reset → 0
  // A user with their own status line keeps it.
  fs.writeFileSync(path.join(claudeHome, 'settings.json'), JSON.stringify({ statusLine: { type: 'command', command: 'mine' } }));
  u.ensureClaudeStatusHook(claudeHome);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(process.env.PILOTHOUSE_DIR, 'claude-settings.json'), 'utf-8')), {});

  const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ph-codex-'));
  const day = path.join(codexHome, 'sessions', '2026', '11', '03');
  fs.mkdirSync(day, { recursive: true });
  fs.writeFileSync(path.join(day, 'rollout-a.jsonl'), [
    JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', rate_limits: { primary: { used_percent: 5, window_minutes: 300, resets_at: 4102444800 }, secondary: { used_percent: 61.6, window_minutes: 10080, resets_at: 4102444800 }, plan_type: 'plus' } } }),
    JSON.stringify({ type: 'other' })
  ].join('\n'));
  const xu = u.codexUsage(codexHome)!;
  assert.deepStrictEqual(xu.windows.map(w => [w.label, w.usedPercent]), [['5 hours', 5], ['week', 62]]);
  assert.equal(xu.plan, 'plus');
  assert.equal(u.codexUsage(fs.mkdtempSync(path.join(os.tmpdir(), 'ph-nocodex-'))), null);

  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ph-todo-'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  fs.writeFileSync(path.join(repo, 'a.ts'), 'const x = 1; // TODO: handle errors\n// FIXME later\nconst todos = 2;\n');
  fs.writeFileSync(path.join(repo, 'plan.md'), '- [x] done\n- [ ] write tests\n');
  execFileSync('git', ['add', '.'], { cwd: repo });
  const todos = await u.projectTodos(repo);
  assert.deepStrictEqual(todos.map(t => [t.file, t.line, t.kind]), [['plan.md', 2, 'task'], ['a.ts', 1, 'todo'], ['a.ts', 2, 'todo']]);
  delete process.env.PILOTHOUSE_DIR;
  console.log('usage + todos ok');

  // Recent conversations from any terminal: Claude (cwd in the transcript) and Codex.
  const { recentSessions } = await import('../electron/scanner');
  const homes = { claude: fs.mkdtempSync(path.join(os.tmpdir(), 'ph-rc-')), codex: fs.mkdtempSync(path.join(os.tmpdir(), 'ph-rx-')) };
  fs.mkdirSync(path.join(homes.claude, 'projects', '-x-app'), { recursive: true });
  fs.writeFileSync(path.join(homes.claude, 'projects', '-x-app', 'abc.jsonl'), JSON.stringify({ type: 'user', cwd: '/x/app', message: { content: 'fix the login bug' } }) + '\n');
  fs.writeFileSync(path.join(homes.claude, 'projects', '-x-app', 'old.jsonl'), JSON.stringify({ type: 'user', cwd: '/x/app', message: { content: 'old' } }) + '\n');
  fs.utimesSync(path.join(homes.claude, 'projects', '-x-app', 'old.jsonl'), new Date(0), new Date(0));
  const rs = recentSessions(Date.now() - 60_000, homes);
  assert.deepStrictEqual(rs.map(r => [r.agent, r.id, r.cwd]), [['claude', 'abc', '/x/app']]);
  const { previewOf, cleanTail } = await import('../electron/remote');
  assert.equal(cleanTail('❯ do it\n✻ Grooving…\n o n\n   o i\n✻ r v\n  Contemplating…\n                 (2s · thinking)\n  n m thinking\n⏺ Done.\n'), '❯ do it\n  Contemplating…\n⏺ Done.');
  assert.equal(previewOf('⏺ Tests pass, pushed the fix.\n\n↓ 2 more\n────\n❯ \n  ⏵⏵ bypass permissions on (shift+tab to cycle)\n'), 'Tests pass, pushed the fix.');
  assert.equal(stripAnsi('\x1b(Bhello\x1b)0'), 'hello');
  assert.equal(previewOf('❯ say it\n✻ Contemplating… (2s · thinking)\n⏺\n  Bildirim testi tamam.\n  Contemplating… running Stop hooks… 1/2\n✻ Baked for 3s · done 17:14\n❯ \noff $0.00 0s Review Audit Board Details [-]\n'), 'Bildirim testi tamam.');
}

console.log('selfcheck ok');
