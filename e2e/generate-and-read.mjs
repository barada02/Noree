// M5 and M6 "done when", with the real 3D service, Modal and models.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://127.0.0.1:5199';
const shots = process.argv[3];
const backend = new URL('../back_end/', import.meta.url);
const dataDir = mkdtempSync(join(tmpdir(), 'noree-m5-'));

const server = spawn('node', ['dist/main.js'], { cwd: backend, env: { ...process.env, PORT: '3000', DATA_DIR: dataDir }, stdio: ['ignore', 'ignore', 'pipe'] });
server.stderr.on('data', (d) => { const s = String(d); if (!s.includes('Unknown project')) console.error('[server]', s.slice(0, 500)); });
const quit = (code) => { server.kill(); process.exit(code); };
process.on('uncaughtException', (e) => { console.log('CRASH', String(e.message).slice(0, 300)); quit(2); });
process.on('unhandledRejection', (e) => { console.log('CRASH', String(e?.message ?? e).slice(0, 300)); quit(2); });
for (let i = 0; i < 60; i++) {
  try { if ((await fetch('http://127.0.0.1:3000/')).ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 250));
}

let failures = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); if (!ok) failures++; };
const passes = (name, promise) => promise.then(() => check(name, true), (e) => check(name, false, String(e.message).slice(0, 160)));

const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const open = async () => {
  const context = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push('console: ' + m.text().slice(0, 240)); });
  return page;
};
const node = (page, type, n = 0) => page.locator(`.react-flow__node:has([data-block-type="${type}"])`).nth(n);
const canvasDrag = async (page, locator, x, y) => {
  const box = await locator.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + 12);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 10, box.y + 25, { steps: 3 });
  await page.mouse.move(x, y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(250);
};

const a = await open();
await a.goto(`${base}/#/app`);
await a.getByRole('button', { name: 'New project', exact: true }).first().click();
await a.waitForSelector('[aria-label="Project name"]');
await a.locator('[data-connection="connected"]').waitFor({ timeout: 8000 });
const url = a.url();
await a.getByLabel('Project name').fill('3D test');
await a.getByLabel('Project name').press('Enter');

// A Slate with content, connected to a 3D block.
await a.getByRole('button', { name: 'Add Slate', exact: true }).click();
await a.waitForTimeout(200);
await a.getByRole('button', { name: 'Add 3D model', exact: true }).click();
await a.waitForTimeout(250);
const pane = await a.locator('.react-flow').boundingBox();
await canvasDrag(a, node(a, 'model3d'), pane.x + pane.width - 190, pane.y + 60);
await canvasDrag(a, node(a, 'slate'), pane.x + 270, pane.y + 60);

const slateBox = await node(a, 'slate').boundingBox();
await a.mouse.dblclick(slateBox.x + slateBox.width / 2, slateBox.y + slateBox.height / 2);
await a.waitForSelector('[data-slate-page="focus"]');
await a.evaluate(() => {
  const data = new DataTransfer();
  data.setData('text/plain', 'Build this: a red cube sitting on top of a blue sphere');
  window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
});
await a.waitForSelector('[data-slate-page="focus"] [data-paste="text"]');
await a.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
await a.waitForTimeout(1000);

const from = await node(a, 'slate').locator('.react-flow__handle.source').boundingBox();
const to = await node(a, 'model3d').locator('.react-flow__handle.target').boundingBox();
await a.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
await a.mouse.down();
await a.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 });
await a.waitForTimeout(100);
await a.mouse.up();
await a.waitForTimeout(300);
check('connected', (await a.locator('.react-flow__edge').count()) === 1);

const generateA = node(a, 'model3d').getByRole('button', { name: 'Generate', exact: true });
check('Generate is available from the connection alone', await generateA.isEnabled());

// A second person watches.
const b = await open();
await b.goto(url);
await b.waitForSelector('[data-block-type="model3d"]');
await b.locator('[data-connection="connected"]').waitFor({ timeout: 8000 });

const started = Date.now();
await generateA.click();
await passes('progress shows in the block', a.locator('[data-generating]').waitFor({ timeout: 20000 }));
await passes('the other browser sees the same progress', b.locator('[data-generating]').waitFor({ timeout: 8000 }));
const refused = await node(a, 'model3d').getByRole('button', { name: 'Working' }).isDisabled();
check('cannot start a second run while one is going', refused);

// Up to 15 minutes: the first run can build Modal's browser image.
let lastStep = '';
const deadline = Date.now() + 15 * 60_000;
while (Date.now() < deadline) {
  if (!(await a.locator('[data-generating]').count())) break;
  const step = (await a.locator('[data-generating]').innerText().catch(() => '')).trim();
  if (step && step !== lastStep) {
    console.log(`      ${Math.round((Date.now() - started) / 1000)}s  ${step}`);
    lastStep = step;
  }
  await a.waitForTimeout(1000);
}
const alert = await node(a, 'model3d').getByRole('alert').count();
if (alert) console.log('      block error:', await node(a, 'model3d').getByRole('alert').innerText());
const status = await a.locator('[data-model-status]').first().getAttribute('data-model-status').catch(() => null);
console.log(`      finished in ${Math.round((Date.now() - started) / 1000)}s with status ${status}`);
check('a version was produced', status === 'approved' || status === 'draft', String(status));

const preview = node(a, 'model3d').locator('img');
const loaded = await preview.evaluate((img) => (img.complete && img.naturalWidth > 0) || new Promise((resolve) => { img.onload = () => resolve(img.naturalWidth > 0); img.onerror = () => resolve(false); })).catch(() => false);
check('preview image shows on the board', loaded);
await passes('other browser shows the result', b.locator('[data-model-status]').first().waitFor({ timeout: 8000 }));
if (shots) await a.screenshot({ path: `${shots}/m5-board.png` });

// Live 3D in focus mode.
const modelBox = await node(a, 'model3d').boundingBox();
await a.mouse.dblclick(modelBox.x + modelBox.width / 2, modelBox.y + modelBox.height / 3);
await a.waitForSelector('[data-model-viewer]', { timeout: 8000 });
const frame = a.frameLocator('[data-model-viewer]');
await passes('live 3D renders a canvas', frame.locator('canvas').waitFor({ timeout: 25000 }));
await a.waitForTimeout(1500);
check('no display error in the viewer', !(await frame.locator('#error').isVisible()));
const sandboxed = await a.locator('[data-model-viewer]').getAttribute('sandbox');
check('viewer has scripts but no same-origin access', sandboxed === 'allow-scripts');
if (shots) await a.screenshot({ path: `${shots}/m5-focus.png` });
await a.keyboard.press('Escape');
await a.waitForTimeout(200);
if (await a.getByRole('dialog').count()) await a.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
await a.waitForTimeout(300);
check('only previews on the board, no live iframes', (await a.locator('[data-model-viewer]').count()) === 0);

// Out of date.
check('not out of date right after generating', (await a.locator('[data-out-of-date]').count()) === 0);
await node(a, 'model3d').getByLabel('3D model prompt').fill('Make the sphere green');
await node(a, 'model3d').getByLabel('3D model prompt').press('Tab');
await passes('editing the prompt marks it out of date', a.locator('[data-out-of-date]').waitFor({ timeout: 4000 }));
await passes('and for the other person too', b.locator('[data-out-of-date]').waitFor({ timeout: 4000 }));
check('nothing regenerates by itself', (await a.locator('[data-generating]').count()) === 0);

// Read view and export.
await a.getByRole('button', { name: 'Add Frame', exact: true }).click();
await a.waitForTimeout(250);
await a.getByRole('button', { name: 'Add Sticky', exact: true }).click();
await a.waitForTimeout(250);
const sticky = node(a, 'sticky');
await sticky.locator('textarea').fill('Remember the plinth');
const readOrder = async () => {
  await a.getByRole('button', { name: 'read', exact: true }).click();
  await a.waitForSelector('[data-read-view]');
  await a.waitForTimeout(250);
  const order = await a.locator('[data-read-block]').evaluateAll((els) => els.map((e) => e.dataset.readBlock));
  if (shots) await a.screenshot({ path: `${shots}/m6-read.png` });
  await a.getByRole('button', { name: 'board', exact: true }).click();
  await a.waitForTimeout(250);
  return order;
};
const exportText = async () => {
  const [download] = await Promise.all([a.waitForEvent('download'), a.getByRole('link', { name: 'Export' }).click()]);
  return readFileSync(await download.path(), 'utf8');
};

const order1 = await readOrder();
check('Read view lists the blocks', order1.includes('Slate') && order1.includes('3D model') && order1.includes('Sticky'), order1.join(', '));
await a.waitForTimeout(2600);
const md1 = await exportText();
check('export has the title, text and images', md1.includes('# 3D test') && md1.includes('> Remember the plinth') && /!\[3D model preview\]\(http/.test(md1), md1.length + ' chars');

// Move the sticky to the very top of the board, and both should change.
await a.getByRole('button', { name: 'Fit View' }).click().catch(() => {});
await a.locator('.react-flow__controls-fitview').click().catch(() => {});
await a.waitForTimeout(500);
const stickyBox = await sticky.boundingBox();
await a.mouse.move(stickyBox.x + stickyBox.width / 2, stickyBox.y + 12);
await a.mouse.down();
await a.mouse.move(stickyBox.x + stickyBox.width / 2, stickyBox.y - 10, { steps: 3 });
const paneNow = await a.locator('.react-flow').boundingBox();
await a.mouse.move(paneNow.x + paneNow.width / 2, paneNow.y + 4, { steps: 12 });
await a.mouse.up();
await a.waitForTimeout(400);
const order2 = await readOrder();
console.log('      order before:', order1.join(', '), '| after:', order2.join(', '));
check('moving a block changes the Read view', order1.join() !== order2.join());
await a.waitForTimeout(2600);
const md2 = await exportText();
const place = (md, title) => md.indexOf(`### ${title}`);
check('moving a block changes the export', place(md1, 'Sticky') !== place(md2, 'Sticky') && place(md2, 'Sticky') >= 0);
if (shots) await a.screenshot({ path: `${shots}/m6-board.png` });

const noise = (e) => e.includes('favicon');
const errors = [...a.errors, ...b.errors].filter((e) => !noise(e));
check('no browser errors', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
quit(failures ? 1 : 0);
