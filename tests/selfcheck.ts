// Run: bun tests/selfcheck.ts
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { detectRunCommands } from '../electron/scanner';
import { findProject, stripAnsi } from '../electron/control';
import { toFlagList } from '../src/types';
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

const ps: any[] = [{ id: 'a', name: 'kitefold', path: '/x/kitefold' }, { id: 'b', name: 'claudecodeproject', path: '/x/ccp' }];
assert.equal(findProject(ps, 'Kitefold')?.id, 'a');
assert.equal(findProject(ps, '/x/ccp')?.id, 'b');
assert.equal(findProject(ps, 'claude code project')?.id, 'b');
assert.equal(findProject(ps, 'nope'), undefined);
assert.equal(stripAnsi('\x1b[31mhi\x1b[0m\r\x1b]0;t\x07ok'), 'hi\nok');
console.log('selfcheck ok');
