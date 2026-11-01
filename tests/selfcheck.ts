// Run: bun tests/selfcheck.ts
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { detectRunCommands } from '../electron/scanner';
import { findProject, stripAnsi } from '../electron/control';

const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ph-'));
fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ scripts: { dev: 'vite', predev: 'x', build: 'tsc' } }));
fs.writeFileSync(path.join(d, 'pnpm-lock.yaml'), '');
fs.writeFileSync(path.join(d, 'Makefile'), 'X := 1\nserve: build\n\techo\n.PHONY: serve\n');
fs.writeFileSync(path.join(d, 'README.md'), '# x\n```bash\n$ git clone foo  # get it\n# comment\npnpm run dev\n```\n');
const cmds = detectRunCommands(d).map(c => c.command);
assert.deepStrictEqual(cmds, ['pnpm install', 'pnpm run dev', 'pnpm run build', 'make serve', 'git clone foo']);

const ps: any[] = [{ id: 'a', name: 'kitefold', path: '/x/kitefold' }, { id: 'b', name: 'claudecodeproject', path: '/x/ccp' }];
assert.equal(findProject(ps, 'Kitefold')?.id, 'a');
assert.equal(findProject(ps, '/x/ccp')?.id, 'b');
assert.equal(findProject(ps, 'claude code project')?.id, 'b');
assert.equal(findProject(ps, 'nope'), undefined);
assert.equal(stripAnsi('\x1b[31mhi\x1b[0m\r\x1b]0;t\x07ok'), 'hi\nok');
console.log('selfcheck ok');
