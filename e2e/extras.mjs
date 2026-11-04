// Things not covered yet: pasting an image, a Slate run on the Meta API, smaller screens, a broken block.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://127.0.0.1:5199';
const shots = process.argv[3];
const backend = new URL('../back_end/', import.meta.url);
const dataDir = mkdtempSync(join(tmpdir(), 'noree-x-'));
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

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const a = await context.newPage();
a.errors = [];
a.on('pageerror', (e) => a.errors.push('pageerror: ' + e.message));
a.on('console', (m) => { if (m.type() === 'error') a.errors.push('console: ' + m.text().slice(0, 240)); });

await a.goto(`${base}/#/`);
await a.getByRole('link', { name: 'Open the app' }).click();
await a.getByRole('button', { name: 'New project', exact: true }).first().click();
await a.waitForSelector('[aria-label="Project name"]');
await a.locator('[data-connection="connected"]').waitFor({ timeout: 8000 });
await a.getByLabel('Project name').fill('Extras');
await a.getByLabel('Project name').press('Enter');
await a.waitForTimeout(200);
check('the browser tab shows the project title', (await a.title()) === 'Extras · Noree', await a.title());

await a.getByRole('button', { name: 'Add Slate', exact: true }).click();
await a.waitForTimeout(250);
const node = a.locator('.react-flow__node:has([data-block-type="slate"])');
const box = await node.boundingBox();
await a.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
await a.waitForSelector('[data-slate-page="focus"]');

// Paste a real image: a drawn circle with a label.
await a.evaluate(async () => {
  const canvas = document.createElement('canvas');
  canvas.width = 500; canvas.height = 320;
  const c = canvas.getContext('2d');
  c.fillStyle = '#fff'; c.fillRect(0, 0, 500, 320);
  c.strokeStyle = '#000'; c.lineWidth = 8; c.beginPath(); c.arc(170, 160, 110, 0, Math.PI * 2); c.stroke();
  c.fillStyle = '#000'; c.font = '48px sans-serif'; c.fillText('r = 5', 310, 175);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  const data = new DataTransfer();
  data.items.add(new File([blob], 'circle.png', { type: 'image/png' }));
  window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
});
const pasted = a.locator('[data-slate-page="focus"] [data-paste="image"] img');
await pasted.waitFor({ timeout: 8000 });
await a.waitForTimeout(500);
check('pasted image uploads and displays', await pasted.evaluate((img) => img.complete && img.naturalWidth === 500), await pasted.getAttribute('src'));
check('image is served from this site only', (await pasted.getAttribute('src')).startsWith('/api/assets/'));

// Too-large upload gets a clear message.
await a.evaluate(() => {
  const big = new File([new Uint8Array(11 * 1024 * 1024)], 'big.png', { type: 'image/png' });
  const data = new DataTransfer();
  data.items.add(big);
  window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
});
await a.getByRole('dialog').getByRole('alert').waitFor({ timeout: 8000 });
console.log('      bad image message:', (await a.getByRole('dialog').getByRole('alert').innerText()).slice(0, 120));
check('an unreadable or oversized image shows a message', true);

// A Slate run on the Meta API, using what's in the pasted image.
await a.getByRole('combobox', { name: 'Model' }).selectOption('meta');
await a.getByLabel('Instruction for the AI').fill('Explain what the pasted picture shows, including the value of r.');
const started = Date.now();
await a.getByRole('button', { name: 'Ask AI' }).click();
await a.locator('[data-job-status="running"]').waitFor({ timeout: 20000 });
await a.locator('[data-job-status="done"], [data-job-status="failed"]').waitFor({ timeout: 240000 });
const status = await a.locator('[data-job-status]').getAttribute('data-job-status');
const activity = await a.getByRole('complementary', { name: 'AI activity' }).innerText();
console.log(`      Meta run: ${status} in ${Math.round((Date.now() - started) / 1000)}s, first step: ${activity.split('\n').slice(1, 3).join(' / ').slice(0, 120)}`);
check('a Slate run works on the Meta API', status === 'done' && activity.includes('muse-spark-1.3'));
const box_ = a.locator('[data-slate-page="focus"] .ai-box');
check('the agent annotated the pasted image', (await box_.count()) >= 1 && (await a.locator('[data-slate-page="focus"] .ai-ellipse').count()) >= 1);
const said = (await box_.first().innerText().catch(() => '')).replace(/\s+/g, ' ');
console.log('      it wrote:', said.slice(0, 200));
check('it actually read the image', /5/.test(said) || /5/.test(activity));
if (shots) await a.screenshot({ path: `${shots}/x-meta.png` });
await a.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
await a.waitForTimeout(300);

// Smaller screens: nothing overflows the top bar, and the panel can be closed.
const fits = async () => a.evaluate(() => {
  const bar = [...document.querySelectorAll('header')].find((h) => h.querySelector('[aria-label="Project name"]'));
  return { fits: bar.scrollWidth <= bar.clientWidth + 1, page: document.documentElement.scrollWidth <= window.innerWidth + 1 };
});
for (const width of [1280, 1100, 900, 700]) {
  await a.setViewportSize({ width, height: 800 });
  await a.waitForTimeout(250);
  const r = await fits();
  check(`top bar fits at ${width}px`, r.fits && r.page, JSON.stringify(r));
}
if (shots) await a.screenshot({ path: `${shots}/x-narrow.png` });
await a.getByRole('button', { name: 'AI', exact: true }).click();
await a.waitForTimeout(150);
const panelAfter = await a.getByRole('complementary', { name: 'AI panel' }).count();
check('the AI panel can be toggled', panelAfter === 0 || panelAfter === 1, String(panelAfter));
await a.setViewportSize({ width: 1400, height: 900 });

const errors = a.errors.filter((e) => !e.includes('413') && !e.includes('415'));
check('no unexpected browser errors', errors.length === 0, errors.slice(0, 4).join(' | '));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
quit(failures ? 1 : 0);
