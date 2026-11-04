// M4 "done when": a question on a Text block connected to a Slate gets an answer that uses what was handwritten.
// Makes real model calls: one transcription and one or two answers.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://127.0.0.1:5199';
const shots = process.argv[3];
const backend = new URL('../back_end/', import.meta.url);
const dataDir = mkdtempSync(join(tmpdir(), 'noree-m4-'));

const server = spawn('node', ['dist/main.js'], { cwd: backend, env: { ...process.env, PORT: '3000', DATA_DIR: dataDir }, stdio: ['ignore', 'ignore', 'pipe'] });
server.stderr.on('data', (d) => { const s = String(d); if (!s.includes('Unknown project')) console.error('[server]', s.slice(0, 400)); });
const quit = (code) => { server.kill(); process.exit(code); };
process.on('uncaughtException', (e) => { console.log('CRASH', e.message.split('\n')[0]); quit(2); });
process.on('unhandledRejection', (e) => { console.log('CRASH', String(e?.message ?? e).split('\n')[0]); quit(2); });
for (let i = 0; i < 60; i++) {
  try { if ((await fetch('http://127.0.0.1:3000/')).ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 250));
}

let failures = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); if (!ok) failures++; };
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const open = async () => {
  const context = await browser.newContext({ viewport: { width: 1500, height: 900 } });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push('console: ' + m.text().slice(0, 240)); });
  return page;
};
const G = {
  x: [[[0, 0.2], [1, 1]], [[1, 0.2], [0, 1]]],
  '=': [[[0, 0.4], [1, 0.4]], [[0, 0.75], [1, 0.75]]],
  7: [[[0, 0], [1, 0], [0.3, 1]]],
};
async function write(page, text, startX, startY, size) {
  let x = startX;
  for (const ch of text) {
    for (const line of G[ch]) {
      const [first, ...rest] = line.map(([px, py]) => [x + px * size, startY + py * size * 1.3]);
      await page.mouse.move(first[0], first[1]);
      await page.mouse.down();
      for (const p of rest) await page.mouse.move(p[0], p[1], { steps: 6 });
      await page.mouse.up();
    }
    x += size * 1.5;
  }
}
const node = (page, type) => page.locator(`.react-flow__node:has([data-block-type="${type}"])`).first();
const panel = (page) => page.getByRole('complementary', { name: 'AI panel' });

const a = await open();
await a.goto(`${base}/#/app`);
await a.getByRole('button', { name: 'New project', exact: true }).first().click();
await a.waitForSelector('[aria-label="Project name"]');
await a.locator('[data-connection="connected"]').waitFor({ timeout: 8000 });
const url = a.url();

check('panel asks you to select a block', await panel(a).getByText('Select a block to ask about it.').isVisible());

await a.getByRole('button', { name: 'Add Slate', exact: true }).click();
await a.waitForTimeout(200);
await a.getByRole('button', { name: 'Add Text', exact: true }).click();
await a.waitForTimeout(200);

// Lay them out side by side.
const paneBox = await a.locator('.react-flow').boundingBox();
const grab = async (type, x, y) => {
  const box = await node(a, type).boundingBox();
  await a.mouse.move(box.x + box.width / 2, box.y + 12);
  await a.mouse.down();
  await a.mouse.move(box.x + box.width / 2 + 10, box.y + 25, { steps: 3 });
  await a.mouse.move(x, y, { steps: 10 });
  await a.mouse.up();
  await a.waitForTimeout(200);
};
await grab('text', paneBox.x + paneBox.width - 180, paneBox.y + 120);
await grab('slate', paneBox.x + 280, paneBox.y + 120);

// Write on the Slate.
const slate = await node(a, 'slate').boundingBox();
await a.mouse.dblclick(slate.x + slate.width / 2, slate.y + slate.height / 2);
await a.waitForSelector('[data-slate-page="focus"]');
const canvas = await a.locator('[data-slate-page="focus"]').boundingBox();
await write(a, 'x=7', canvas.x + canvas.width * 0.3, canvas.y + canvas.height * 0.35, 70);
await a.keyboard.press('Escape');
await a.waitForTimeout(800);

// Connect Slate to Text.
const from = await node(a, 'slate').locator('.react-flow__handle.source').boundingBox();
const to = await node(a, 'text').locator('.react-flow__handle.target').boundingBox();
await a.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
await a.mouse.down();
await a.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 });
await a.waitForTimeout(100);
await a.mouse.up();
await a.waitForTimeout(250);
check('connection made, and the block shows it', (await a.locator('.react-flow__edge').count()) === 1 && (await a.locator('[data-source-count="1"]').count()) === 1);

// Select the Text block by its header.
const textBox = await node(a, 'text').boundingBox();
await a.mouse.click(textBox.x + 60, textBox.y + 12);
await a.waitForTimeout(250);
check('panel follows the selected block and lists its source', (await panel(a).getByText('Reads from').isVisible()) && (await panel(a).getByRole('heading').innerText()) === 'Text');

const b = await open();
await b.goto(url);
await b.waitForSelector('[data-block-type="text"]');
await b.locator('[data-connection="connected"]').waitFor({ timeout: 8000 });
const textB = await node(b, 'text').boundingBox();
await b.mouse.click(textB.x + 60, textB.y + 12);
await b.waitForTimeout(250);

// Ask.
const box = panel(a).getByLabel('Ask about this block');
await box.fill('What value of x is handwritten on the connected Slate? Reply with just the number.');
const started = Date.now();
await box.press('Enter');
await panel(a).locator('[data-message="assistant"]').waitFor({ timeout: 180000 });
const answer = await panel(a).locator('[data-message="assistant"]').first().innerText();
console.log(`      answered in ${Math.round((Date.now() - started) / 1000)}s: ${answer.replace(/\s+/g, ' ').slice(0, 160)}`);
check('answer uses the handwriting', /\b7\b/.test(answer));
check('question cleared after sending', (await box.inputValue()) === '');

await panel(b).locator('[data-message="assistant"]').waitFor({ timeout: 6000 }).then(() => check('other browser sees the conversation', true), () => check('other browser sees the conversation', false));
check('other browser sees who asked', (await panel(b).locator('[data-message="user"]').count()) === 1);
if (shots) await a.screenshot({ path: `${shots}/m4-panel.png` });

// Each block has its own thread.
const slateNow = await node(a, 'slate').boundingBox();
await a.mouse.click(slateNow.x + 60, slateNow.y + 12);
await a.waitForTimeout(300);
check('Slate has its own empty thread', (await panel(a).locator('[data-message]').count()) === 0 && (await panel(a).getByRole('heading').innerText()) === 'Slate');
await a.mouse.click(textBox.x + 60, textBox.y + 12);
await a.waitForTimeout(300);
check('Text thread comes back', (await panel(a).locator('[data-message="assistant"]').count()) === 1);

// Script injection through a question stays text.
await box.fill('<img src=x onerror=window.__pwned=1> Say OK.');
await box.press('Enter');
await a.waitForFunction(() => document.querySelectorAll('[data-message="assistant"]').length >= 2, null, { timeout: 120000 });
check('markup in messages does not run', (await a.evaluate(() => window.__pwned)) === undefined);

const errors = [...a.errors, ...b.errors];
check('no browser errors', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
quit(failures ? 1 : 0);
