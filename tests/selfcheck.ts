// Run: bun tests/selfcheck.ts
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { detectRunCommands, getCodexSessions, readTranscript, searchHistory } from '../electron/scanner';
import { findProject, stripAnsi } from '../electron/control';
import { toFlagList, buildAgentCommand, agentById } from '../src/types';
import { newActivity, noteOutput, nextStatus } from '../electron/activity';

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

const ps: any[] = [{ id: 'a', name: 'kitefold', path: '/x/kitefold' }, { id: 'b', name: 'claudecodeproject', path: '/x/ccp' }];
assert.equal(findProject(ps, 'Kitefold')?.id, 'a');
assert.equal(findProject(ps, '/x/ccp')?.id, 'b');
assert.equal(findProject(ps, 'claude code project')?.id, 'b');
assert.equal(findProject(ps, 'nope'), undefined);
assert.equal(stripAnsi('\x1b[31mhi\x1b[0m\r\x1b]0;t\x07ok'), 'hi\nok');
console.log('selfcheck ok');
