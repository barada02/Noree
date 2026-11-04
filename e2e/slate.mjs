// M3 "done when": writing z = 3 + 4i gives outline, arrow and Argand plane, and a second browser sees it with sliders in sync.
// Makes one real model call. Pass "nomodel" to skip it.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://127.0.0.1:5199';
const shots = process.argv[3];
const useModel = process.argv[4] !== 'nomodel';
const backend = new URL('../back_end/', import.meta.url);
const dataDir = mkdtempSync(join(tmpdir(), 'noree-m3-'));

const server = spawn('node', ['dist/main.js'], { cwd: backend, env: { ...process.env, PORT: '3000', DATA_DIR: dataDir }, stdio: ['ignore', 'ignore', 'pipe'] });
server.stderr.on('data', (d) => { const s = String(d); if (!s.includes('Unknown project')) console.error('[server]', s.slice(0, 300)); });
const quit = (code) => { server.kill(); process.exit(code); };
process.on('uncaughtException', (e) => { console.log('CRASH', e.message.split('\n')[0]); quit(2); });
process.on('unhandledRejection', (e) => { console.log('CRASH', String(e?.message ?? e).split('\n')[0]); quit(2); });
for (let i = 0; i < 60; i++) {
  try { if ((await fetch('http://127.0.0.1:3000/')).ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 250));
}

let failures = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); if (!ok) failures++; };
const passes = (name, promise) => promise.then(() => check(name, true), (e) => check(name, false, String(e.message).split('\n')[0]));

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const open = async () => {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push('console: ' + m.text().slice(0, 240)); });
  return page;
};

const G = {
  z: [[[0, 0.2], [1, 0.2], [0, 1], [1, 1]]],
  '=': [[[0, 0.4], [1, 0.4]], [[0, 0.75], [1, 0.75]]],
  3: [[[0, 0], [1, 0], [0.4, 0.45], [1, 0.7], [0.7, 1], [0, 0.95]]],
  '+': [[[0.5, 0.2], [0.5, 0.9]], [[0, 0.55], [1, 0.55]]],
  4: [[[0.8, 1], [0.8, 0], [0, 0.65], [1, 0.65]]],
  i: [[[0.5, 0.35], [0.5, 1]], [[0.5, 0.08], [0.5, 0.16]]],
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

const a = await open();
await a.goto(`${base}/#/`);
await a.getByRole('link', { name: 'Open app' }).click();
await a.getByRole('button', { name: 'New project', exact: true }).first().click();
await a.waitForSelector('[aria-label="Project name"]');
await a.locator('[data-connection="connected"]').waitFor({ timeout: 8000 });
const url = a.url();
await a.getByRole('button', { name: 'Add Slate', exact: true }).click();
await a.waitForSelector('[data-slate-page="preview"]');
check('Slate block shows a preview on the board', true);

const b = await open();
await b.goto(url);
await b.waitForSelector('[data-slate-page="preview"]');

// Dragging the preview moves the block and does not draw.
const node = a.locator('.react-flow__node:has([data-block-type="slate"])');
const before = await node.boundingBox();
await a.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
await a.mouse.down();
await a.mouse.move(before.x + before.width / 2 - 60, before.y + before.height / 2 - 40, { steps: 8 });
await a.mouse.up();
await a.waitForTimeout(200);
const after = await node.boundingBox();
check('dragging the preview moves the block', Math.abs(after.x - before.x) > 30);
check('dragging the preview draws nothing', (await a.locator('[data-slate-page="preview"] .ink').count()) === 0);

// Double-click opens focus mode.
await a.mouse.dblclick(after.x + after.width / 2, after.y + after.height / 2);
await a.waitForSelector('[data-slate-page="focus"]', { timeout: 4000 });
check('double-click opens focus mode', true);

const canvas = await a.locator('[data-slate-page="focus"]').boundingBox();
const ox = canvas.x + canvas.width * 0.25;
const oy = canvas.y + canvas.height * 0.4;
await write(a, 'z=3+4i', ox, oy, 42);
const inkA = await a.locator('[data-slate-page="focus"] .ink').count();
check('handwriting creates strokes', inkA === 9, `${inkA} strokes`);
await passes('other browser sees the ink live', b.waitForFunction(() => document.querySelectorAll('[data-slate-page="preview"] .ink').length === 9, null, { timeout: 5000 }));

// Undo and redo a stroke, with the Delete key not touching the board while focused.
await a.getByRole('dialog').getByRole('button', { name: 'Undo', exact: true }).click();
await a.waitForTimeout(150);
check('Undo removes the last stroke', (await a.locator('[data-slate-page="focus"] .ink').count()) === 8);
await a.getByRole('dialog').getByRole('button', { name: 'Redo', exact: true }).click();
await a.waitForTimeout(150);
check('Redo restores it', (await a.locator('[data-slate-page="focus"] .ink').count()) === 9);
await a.keyboard.press('Delete');
await a.waitForTimeout(150);
check('Delete in focus mode leaves the block alone', (await a.locator('[data-slate-page="focus"]').count()) === 1);

// Eraser.
await a.getByRole('button', { name: 'Eraser', exact: true }).click();
await a.mouse.move(canvas.x + canvas.width * 0.8, canvas.y + canvas.height * 0.85);
await a.mouse.down();
await a.mouse.up();
check('eraser ignores empty space', (await a.locator('[data-slate-page="focus"] .ink').count()) === 9);
await a.getByRole('button', { name: 'Pen', exact: true }).click();

// Pasting text.
await a.evaluate(() => {
  const data = new DataTransfer();
  data.setData('text/plain', 'Pasted note about phasors');
  window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
});
await a.waitForSelector('[data-paste="text"]', { timeout: 3000 });
check('pasted text appears on the page', true);
const pasted = await a.locator('[data-slate-page="focus"] [data-paste="text"]').boundingBox();
await a.mouse.move(pasted.x + 30, pasted.y + 20);
await a.mouse.down();
await a.mouse.move(pasted.x + 120, pasted.y + 80, { steps: 6 });
await a.mouse.up();
await a.waitForTimeout(200);
const moved = await a.locator('[data-slate-page="focus"] [data-paste="text"]').boundingBox();
check('pasted text can be moved', Math.abs(moved.x - pasted.x) > 50, `moved ${Math.round(moved.x - pasted.x)}px`);
check('moving it draws no ink', (await a.locator('[data-slate-page="focus"] .ink').count()) === 9);
await passes('other browser sees the paste', b.waitForSelector('[data-paste="text"]', { timeout: 4000 }));

// A real model run.
if (useModel) {
  await a.getByRole('button', { name: 'Ask AI' }).click();
  const started = Date.now();
  await passes('a run starts and shows activity', a.locator('[data-job-status="running"]').waitFor({ timeout: 15000 }));
  await a.locator('[data-job-status="done"], [data-job-status="failed"]').waitFor({ timeout: 180000 });
  const status = await a.locator('[data-job-status]').getAttribute('data-job-status');
  console.log(`      run took ${Math.round((Date.now() - started) / 1000)}s, status ${status}`);
  check('the run finishes', status === 'done', status === 'done' ? '' : await a.locator('[aria-label="AI activity"]').innerText());
  const counts = async (p, kind) => p.locator(`[data-slate-page] ${kind}`).count();
  check('outline and arrow drawn', (await counts(a, '.ai-ellipse')) >= 1 && (await counts(a, '.ai-arrow')) >= 1);
  const boxes = await counts(a, '.ai-box');
  check('an explanation or widget appears', boxes >= 1, `${boxes} box(es)`);
  await passes('other browser sees the AI result on its board', b.waitForFunction(() => document.querySelectorAll('[data-slate-page="preview"] .ai-ellipse').length >= 1, null, { timeout: 6000 }));

  if (shots) await a.screenshot({ path: `${shots}/m3-focus.png` });

  const slider = a.locator('[data-slate-page="focus"] .wg-slider input[type="range"]').first();
  if (await slider.count()) {
    await b.locator('.react-flow__node:has([data-block-type="slate"])').dblclick({ position: { x: 240, y: 170 } });
    await b.waitForSelector('[data-slate-page="focus"]');
    await slider.evaluate((el) => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(el, '1.5');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await passes('moving a slider updates the other browser', b.waitForFunction(() => document.querySelector('.wg-slider output')?.textContent?.includes('1.5'), null, { timeout: 4000 }));
    await b.getByRole('button', { name: 'Close' }).click();
  } else {
    console.log('      this run made no slider widget, so slider sync was not checked');
  }

  await a.getByRole('button', { name: 'Undo AI' }).click();
  await a.waitForTimeout(250);
  check('Undo AI removes the run and keeps the ink', (await counts(a, '.ai-box')) === 0 && (await a.locator('[data-slate-page="focus"] .ink').count()) === 9);
} else {
  console.log('      skipped the real model run');
}

// Pages.
await a.getByRole('button', { name: 'Add page' }).click();
await a.waitForTimeout(250);
check('Add page opens a blank page', (await a.locator('[data-page-indicator]').innerText()).startsWith('2 / 2') && (await a.locator('[data-slate-page="focus"] .ink').count()) === 0);
await write(a, 'i', ox, oy, 42);
await a.getByRole('button', { name: 'Previous page' }).click();
await a.waitForTimeout(250);
check('previous page keeps its ink', (await a.locator('[data-slate-page="focus"] .ink').count()) === 9);
await a.getByRole('button', { name: 'Next page' }).click();
await a.waitForTimeout(250);
check('next page keeps its own ink', (await a.locator('[data-slate-page="focus"] .ink').count()) === 2);

await a.keyboard.press('Escape');
await a.waitForTimeout(300);
check('Esc closes focus mode', (await a.locator('[data-slate-page="focus"]').count()) === 0);
if (shots) await a.screenshot({ path: `${shots}/m3-board.png` });

// A fresh browser gets it all from the server.
await a.waitForTimeout(2600);
const c = await open();
await c.goto(url);
await c.waitForSelector('[data-slate-page="preview"]');
await c.waitForTimeout(400);
check('fresh browser loads the Slate from the server', (await c.locator('[data-slate-page="preview"] .ink').count()) === 2);

const errors = [...a.errors, ...b.errors, ...c.errors];
check('no browser errors', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
quit(failures ? 1 : 0);
