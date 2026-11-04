// M2 "done when", locally through the Vite proxy: two browsers stay in sync, a restart loses nothing.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://127.0.0.1:5199';
const shots = process.argv[3];
const backend = new URL('../back_end/', import.meta.url);
const dataDir = mkdtempSync(join(tmpdir(), 'noree-m2-'));

let server;
async function startServer() {
  server = spawn('node', ['dist/main.js'], { cwd: backend, env: { ...process.env, PORT: '3000', DATA_DIR: dataDir }, stdio: ['ignore', 'ignore', 'pipe'] });
  server.stderr.on('data', (d) => console.error('[server stderr]', String(d).slice(0, 400)));
  server.once('exit', (c) => console.error('[server exit]', c));
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch('http://127.0.0.1:3000/')).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('server did not start');
}
const stopServer = () => new Promise((resolve) => { server.once('exit', resolve); server.kill(); });

let failures = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); if (!ok) failures++; };

// A failed step must not leave the test server holding port 3000.
process.on('uncaughtException', (e) => { console.error('CRASH', e.message.split('\n')[0]); server?.kill(); process.exit(2); });
process.on('unhandledRejection', (e) => { console.error('CRASH', String(e?.message ?? e).split('\n')[0]); server?.kill(); process.exit(2); });

await startServer();
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const open = async () => {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('WebSocket') && !m.text().includes('ERR_CONNECTION') && !m.text().includes('502')) page.errors.push('console: ' + m.text().slice(0, 240)); });
  return page;
};
const nodeOf = (page, type, n = 0) => page.locator(`.react-flow__node:has([data-block-type="${type}"])`).nth(n);
const add = async (page, label) => { await page.getByRole('button', { name: `Add ${label}`, exact: true }).click(); await page.waitForTimeout(150); };
const live = (page) => page.locator('[data-connection="connected"]').waitFor({ timeout: 8000 });

const a = await open();
await a.goto(`${base}/#/app`);
await a.getByRole('button', { name: 'New project', exact: true }).first().click();
await a.waitForSelector('[aria-label="Project name"]');
await live(a);
const url = a.url();
check('project created by the server', /#\/p\/[a-f0-9]{48}$/.test(url));
check('title comes from the server', (await a.getByLabel('Project name').inputValue()) === 'Untitled project');

const b = await open();
globalThis.dbgPages = [a, b];
await b.goto(url);
await b.waitForSelector('[aria-label="Project name"]');
await live(b);

await a.getByLabel('Project name').fill('Shared board');
await a.getByLabel('Project name').press('Enter');
await b.waitForFunction(() => document.querySelector('[aria-label="Project name"]').value === 'Shared board', null, { timeout: 4000 }).then(() => check('rename reaches the other browser', true), () => check('rename reaches the other browser', false));

await add(a, 'Text');
await nodeOf(b, 'text').waitFor({ timeout: 4000 }).then(() => check('block added in A appears in B', true), () => check('block added in A appears in B', false));

// Typing merges in both directions.
await a.locator('[data-block-type="text"] textarea').click();
await a.keyboard.type('Hello ');
await b.waitForFunction(() => document.querySelector('[data-block-type="text"] textarea')?.value === 'Hello ', null, { timeout: 4000 });
await b.locator('[data-block-type="text"] textarea').click();
await b.keyboard.press('End');
await b.keyboard.type('from B');
await a.waitForFunction(() => document.querySelector('[data-block-type="text"] textarea')?.value === 'Hello from B', null, { timeout: 4000 }).then(() => check('text merges both ways', true), () => check('text merges both ways', false));

// A's caret stays put while B types earlier in the text.
const aCaret = await a.evaluate(() => { const t = document.querySelector('[data-block-type="text"] textarea'); t.focus(); t.setSelectionRange(5, 5); return t.selectionStart; });
await b.locator('[data-block-type="text"] textarea').evaluate((t) => t.setSelectionRange(0, 0));
await b.keyboard.type('>> ');
await a.waitForFunction(() => document.querySelector('[data-block-type="text"] textarea')?.value.startsWith('>> '), null, { timeout: 4000 });
await a.waitForTimeout(50);
const moved = await a.evaluate(() => document.querySelector('[data-block-type="text"] textarea').selectionStart);
check('caret follows remote edits', aCaret === 5 && moved === 8, `caret ${aCaret} -> ${moved}`);

// Dragging in A is seen in B.
const nodeA = nodeOf(a, 'text');
const before = await nodeA.boundingBox();
const startB = await nodeOf(b, 'text').boundingBox();
await a.mouse.move(before.x + before.width / 2, before.y + 12);
await a.mouse.down();
await a.mouse.move(before.x + before.width / 2 + 60, before.y + 50, { steps: 5 });
await a.mouse.move(before.x + before.width / 2 + 180, before.y + 120, { steps: 10 });
await a.waitForTimeout(150);
const midB = await nodeOf(b, 'text').boundingBox();
check('other browser sees the drag live, before the drop', Math.abs(midB.x - startB.x) > 50, `moved ${Math.round(midB.x - startB.x)}px`);

// Cursor of A is visible in B while the pointer is over the board.
await a.mouse.up();
await a.waitForTimeout(250);
const movedB = await nodeOf(b, 'text').boundingBox();
const movedA = await nodeOf(a, 'text').boundingBox();
check('final position matches', Math.abs((movedA.x - before.x) - (movedB.x - startB.x)) < 2);
await a.mouse.move(700, 500, { steps: 3 });
await b.locator('[data-peer-cursor]').first().waitFor({ timeout: 3000 }).then(() => check('cursor visible to the other person', true), () => check('cursor visible to the other person', false));
check('presence shows the other person', (await b.locator('[data-peer]').count()) === 1);

if (shots) await b.screenshot({ path: `${shots}/m2-b.png` });

// Undo: A undoes only A's change.
await add(b, 'Sticky');
await nodeOf(a, 'sticky').waitFor({ timeout: 4000 });
await a.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
await a.getByRole('button', { name: 'Undo' }).click();
await a.waitForTimeout(250);
const afterUndoA = await nodeOf(a, 'text').boundingBox({ timeout: 3000 });
check("undo reverts A's own move", Math.abs(afterUndoA.x - before.x) < 2, `${Math.round(afterUndoA.x - before.x)}px off`);
check("undo leaves B's block alone", (await nodeOf(a, 'sticky').count()) === 1);

// Connection drops and returns: edits made offline merge.
await a.waitForTimeout(2600); // let the save delay pass
await stopServer();
await a.locator('[data-connection="disconnected"], [data-connection="connecting"]').first().waitFor({ timeout: 8000 }).then(() => check('status shows the connection dropped', true), () => check('status shows the connection dropped', false));
await add(a, 'Frame');
await a.waitForTimeout(300);
await startServer();
await live(a);
await live(b);
await nodeOf(b, 'frame').waitFor({ timeout: 6000 }).then(() => check('offline edit merges after reconnect', true), () => check('offline edit merges after reconnect', false));

// Restart keeps everything: a brand-new browser with no local copy.
await a.waitForTimeout(500);
await stopServer();
await startServer();
const c = await open();
await c.goto(url);
await c.waitForSelector('[aria-label="Project name"]');
await live(c);
await nodeOf(c, 'frame').waitFor({ timeout: 5000 }).then(() => check('restart loses nothing (fresh browser)', true), () => check('restart loses nothing (fresh browser)', false));
check('text kept', (await c.locator('[data-block-type="text"] textarea').inputValue()) === '>> Hello from B');
check('title kept', (await c.getByLabel('Project name').inputValue()) === 'Shared board');

// Unknown project.
const d = await open();
await d.goto(`${base}/#/p/${'a'.repeat(48)}`);
await d.getByText('Project not found').waitFor({ timeout: 5000 }).then(() => check('unknown link shows not found', true), () => check('unknown link shows not found', false));

const errors = [...a.errors, ...b.errors, ...c.errors, ...d.errors].filter((e) => !e.includes('404'));
check('no browser errors', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close();
await stopServer();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
