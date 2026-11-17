// UI smoke test: opens the built app in a throwaway home (so it never sees your projects, settings or pairings) and
// clicks through the main screens over the Chrome DevTools protocol. Fails on any page error.
// Run: npm run build && bun tests/ui-smoke.ts   (CI on Linux: xvfb-run -a bun tests/ui-smoke.ts)
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import electron from 'electron';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ph-ui-'));
const project = path.join(home, 'demo-project');
fs.mkdirSync(project);
fs.writeFileSync(path.join(project, 'README.md'), '# demo\n');
const port = 9500 + Math.floor(Math.random() * 400);
const env: Record<string, string> = { ...(process.env as Record<string, string>), HOME: home, USERPROFILE: home };
delete env.ELECTRON_RUN_AS_NODE;
const args = ['.', `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(home, 'user-data')}`];
if (process.platform === 'linux') args.push('--no-sandbox'); // CI containers lack the setuid sandbox helper
const app = spawn(electron as unknown as string, args, { cwd: path.join(import.meta.dir, '..'), env, stdio: 'ignore' });

let failed = false;
const done = (code: number) => { try { app.kill(); } catch {} fs.rmSync(home, { recursive: true, force: true }); process.exit(code); };
const fail = (msg: string) => { console.error('FAIL', msg); failed = true; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
setTimeout(() => { console.error('FAIL timed out'); done(1); }, 120_000);

let page: any;
for (let i = 0; i < 60 && !page; i++) {
  await sleep(1000);
  try { page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((p: any) => p.type === 'page'); } catch {}
}
if (!page) { console.error('FAIL app did not start'); done(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map<number, (v: any) => void>();
const errors: string[] = [];
ws.onmessage = (e) => {
  const m = JSON.parse(String(e.data));
  if (m.id && pending.has(m.id)) { pending.get(m.id)!(m.result); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text);
};
const send = (method: string, params: any = {}) => new Promise<any>((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const run = async (expr: string) => {
  const r = await send('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
await send('Runtime.enable');
const waitFor = async (what: string, expr: string, ms = 15_000) => {
  for (let t = 0; t < ms; t += 250) { if (await run(expr).catch(() => false)) return true; await sleep(250); }
  fail(what); return false;
};
const step = async (name: string, fn: () => Promise<void>) => {
  try { await fn(); console.log('ok  ', name); } catch (e: any) { fail(`${name}: ${e.message}`); }
};
const H = `const vis = (e) => e && e.offsetParent !== null;
  const btn = (re) => [...document.querySelectorAll('button')].find((b) => vis(b) && re.test(b.title || b.getAttribute('aria-label') || b.textContent.trim()));`;

await step('renders', async () => { await waitFor('root renders', `return document.querySelector('#root')?.children.length > 0`); });

await step('first run: add a project', async () => {
  await run(`await window.electronAPI.updateSettings({ setupDone: true, uiLanguage: 'en' }); await window.electronAPI.addProject(${JSON.stringify(project)}); location.reload(); return true;`);
  await sleep(1500);
  await waitFor('project listed after reload', `return document.body.innerText.includes('demo-project')`);
});

const openTab = async () => {
  const before = await run(`return document.querySelectorAll('.xterm').length`);
  await run(`${H} btn(/Open or Create Terminal Tab|New tab/i).click(); return true;`);
  await sleep(300);
  await run(`const i = [...document.querySelectorAll('input')].pop(); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true;`);
  await waitFor('terminal appears', `return document.querySelectorAll('.xterm').length > ${before}`);
};
await step('open two terminal tabs', async () => { await openTab(); await openTab(); });

await step('tab switching stays fast', async () => {
  const times: number[] = await run(`const tabs = [...document.querySelectorAll('[draggable=true]')]; const out = [];
    for (const t of [...tabs, ...tabs]) { const t0 = performance.now(); t.click(); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); out.push(Math.round(performance.now() - t0)); await new Promise((r) => setTimeout(r, 100)); }
    return out;`);
  if (Math.max(...times) > 600) throw new Error(`slow switch: ${times.join(',')} ms`);
});

await step('drag a tab to reorder; terminals keep running', async () => {
  // Labels renumber with the order (#1, #2), so mark the tab elements and compare the marks' order.
  const r = await run(`document.querySelectorAll('[draggable=true]').forEach((t, i) => (t.dataset.mark = String(i)));
    const names = () => [...document.querySelectorAll('[draggable=true]')].map((t) => t.dataset.mark);
    document.querySelectorAll('.xterm').forEach((x, i) => (x.dataset.mark = String(i)));
    const before = names(), tabs = [...document.querySelectorAll('[draggable=true]')], dt = new DataTransfer();
    tabs[0].dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    tabs[1].dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    tabs[1].dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    await new Promise((r) => setTimeout(r, 300));
    return { moved: JSON.stringify(before) !== JSON.stringify(names()), kept: [...document.querySelectorAll('.xterm')].every((x) => x.dataset.mark !== undefined) };`);
  if (!r.moved || !r.kept) throw new Error(JSON.stringify(r));
});

await step('drafts → debate panel', async () => {
  await run(`${H} btn(/Prompt Drafter/i).click(); return true;`);
  await waitFor('drafts open', `return [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Debate')`);
  await run(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Debate').click(); return true;`);
  await waitFor('debate panel', `return !!document.querySelector('[aria-label="Agents in the debate"]')`);
});

await step('settings: remote control, voice languages, interface language', async () => {
  const b = await run(`const b = document.querySelector('button[title="System Settings"]'); if (b) { b.click(); return ''; } return [...document.querySelectorAll('button[title]')].map((x) => x.title).join(' | ');`); // may be off-screen in a small window
  if (b) throw new Error('no English settings button (a translation stuck?): ' + b.slice(0, 300));
  await waitFor('settings open', `return document.body.innerText.includes('Remote control')`);
  const r = await run(`const sels = [...document.querySelectorAll('select')];
    return { voice: Math.max(0, ...sels.map((s) => s.options.length)), ui: !!document.querySelector('select[aria-label="Interface language"]') };`);
  if (r.voice < 30) throw new Error(`voice languages: ${r.voice}`);
  if (!r.ui) throw new Error('no interface language picker');
});

await step('interface language switches (Türkçe) and back', async () => {
  await run(`await window.electronAPI.updateSettings({ uiLanguage: 'tr' }); location.reload(); return true;`);
  await waitFor('Turkish UI', `return document.body.innerText.includes('Dosyalar') || document.body.innerText.includes('Geçmiş')`);
  await run(`await window.electronAPI.updateSettings({ uiLanguage: 'en' }); location.reload(); return true;`);
  await waitFor('English UI again', `return document.body.innerText.includes('demo-project')`);
});

if (errors.length) fail(`page errors:\n${errors.join('\n')}`);
console.log(failed ? 'ui smoke FAILED' : 'ui smoke ok');
done(failed ? 1 : 0);
