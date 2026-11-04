// The main agent, with real models: planning a board, undo, answering, and delegating to the 3D specialist.
// Also needs services/agent-sandbox on port 8000 for the 3D part.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://127.0.0.1:5199';
const shots = process.argv[3];
const backend = new URL('../back_end/', import.meta.url);
const dataDir = mkdtempSync(join(tmpdir(), 'noree-main-'));

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

const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const open = async () => {
  const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push('console: ' + m.text().slice(0, 240)); });
  return page;
};
const panel = (page) => page.getByRole('complementary', { name: 'AI panel' });
const blocks = (page, type) => page.locator(`.react-flow__node:has([data-block-type="${type}"])`);
const allBlocks = (page) => page.locator('.react-flow__node');

/** Sends a request and waits for the reply. Returns the newest AI message. */
async function ask(page, text, timeout = 300000) {
  const before = await panel(page).locator('[data-message="assistant"]').count();
  await panel(page).getByLabel('Ask the AI').fill(text);
  const started = Date.now();
  await panel(page).getByLabel('Ask the AI').press('Enter');
  await page.waitForFunction(
    (count) => document.querySelectorAll('aside[aria-label="AI panel"] [data-message="assistant"]').length > count,
    before,
    { timeout },
  );
  // A specialist can post before the main agent finishes, so wait until nothing is running.
  await panel(page).locator('[data-agent-activity]').waitFor({ state: 'detached', timeout });
  const reply = (await panel(page).locator('[data-message="assistant"]').last().innerText()).replace(/\s+/g, ' ');
  console.log(`      ${Math.round((Date.now() - started) / 1000)}s: ${reply.slice(0, 170)}`);
  return reply;
}

const a = await open();
await a.goto(`${base}/#/app`);
await a.getByRole('button', { name: 'New project', exact: true }).first().click();
await a.waitForSelector('[aria-label="Project name"]');
await a.locator('[data-connection="connected"]').waitFor({ timeout: 8000 });
const url = a.url();
await a.getByLabel('Project name').fill('Main agent test');
await a.getByLabel('Project name').press('Enter');

const b = await open();
await b.goto(url);
await b.waitForSelector('[aria-label="Project name"]');
await b.locator('[data-connection="connected"]').waitFor({ timeout: 8000 });

check('with nothing selected, the panel offers the board agent', await panel(a).getByText('Ask about the board').isVisible());

// 1. Plan a board from one sentence.
await ask(a, 'Plan a launch for a coffee shop mobile app. Use two frames, Build and Launch, with two short notes in each.');
const frames = await blocks(a, 'frame').count();
const notes = (await blocks(a, 'text').count()) + (await blocks(a, 'sticky').count());
check('it built the board', frames === 2 && notes >= 4, `${frames} frames, ${notes} notes`);
await b.waitForFunction((n) => document.querySelectorAll('.react-flow__node').length === n, frames + notes, { timeout: 6000 }).then(() => check('the other person sees it', true), () => check('the other person sees it', false));
check('the other person sees the conversation', (await panel(b).locator('[data-message="assistant"]').count()) === 1);
await a.waitForTimeout(800);
const overlap = await a.evaluate(() => {
  const items = [...document.querySelectorAll('.react-flow__node')].filter((n) => !n.querySelector('[data-block-type="frame"]')).map((n) => n.getBoundingClientRect());
  let hits = 0;
  items.forEach((p, i) => items.slice(i + 1).forEach((q) => { if (p.left < q.right && q.left < p.right && p.top < q.bottom && q.top < p.bottom) hits++; }));
  return hits;
});
check('blocks do not overlap', overlap === 0, `${overlap} overlapping`);
const inView = await a.evaluate(() => {
  const pane = document.querySelector('.react-flow').getBoundingClientRect();
  return [...document.querySelectorAll('.react-flow__node')].every((n) => { const r = n.getBoundingClientRect(); return r.left >= pane.left - 2 && r.right <= pane.right + 2 && r.top >= pane.top - 2 && r.bottom <= pane.bottom + 2; });
});
check('new blocks are brought into view', inView);
if (shots) await a.screenshot({ path: `${shots}/agent-board.png` });

// 2. Undo removes it all at once.
await panel(a).getByRole('button', { name: 'Undo these changes' }).click();
await a.waitForFunction(() => document.querySelectorAll('.react-flow__node').length === 0, null, { timeout: 6000 }).then(() => check('one Undo reverses the whole run', true), () => check('one Undo reverses the whole run', false));
await a.waitForTimeout(300);
check('Undo is then gone', (await panel(a).getByRole('button', { name: 'Undo these changes' }).count()) === 0);

// 3. A plain question changes nothing.
await a.getByRole('button', { name: 'Add Text', exact: true }).click();
await a.waitForTimeout(200);
await blocks(a, 'text').locator('textarea').fill('Our budget is 7000 dollars.');
await a.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
await a.waitForTimeout(300);
const reply = await ask(a, 'What is our budget?');
check('it answers from the board', /7[, ]?000/.test(reply));
const afterQuestion = await a.locator('[data-block-type]').evaluateAll((els) => els.map((e) => e.dataset.blockType));
check('answering changes nothing, even right after an undo', afterQuestion.length === 1, afterQuestion.join(', '));

// 4. With a block selected, it works from that block.
const textBox = await blocks(a, 'text').boundingBox();
await a.mouse.click(textBox.x + 60, textBox.y + 12);
await a.waitForTimeout(250);
check('selecting a block switches the conversation', (await panel(a).getByRole('heading').innerText()) === 'Text' && (await panel(a).locator('[data-message]').count()) === 0);
const selectedReply = await ask(a, 'Add a sticky that says the budget in euros is not known yet, and connect this block to it.');
await a.waitForTimeout(300);
check('it acts on the selected block', (await blocks(a, 'sticky').count()) === 1 && (await a.locator('.react-flow__edge').count()) === 1, selectedReply.slice(0, 60));

// 5. It delegates to the Slate specialist, which annotates the page with its own tools.
await a.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
await a.waitForTimeout(200);
await a.getByRole('button', { name: 'Add Slate', exact: true }).click();
await a.waitForTimeout(400);
const slateNode = blocks(a, 'slate').first();
const slateBox = await slateNode.boundingBox();
await a.mouse.dblclick(slateBox.x + slateBox.width / 2, slateBox.y + slateBox.height / 2);
await a.waitForSelector('[data-slate-page="focus"]');
const page = await a.locator('[data-slate-page="focus"]').boundingBox();
const stroke = async (points) => {
  await a.mouse.move(points[0][0], points[0][1]);
  await a.mouse.down();
  for (const [x, y] of points.slice(1)) await a.mouse.move(x, y, { steps: 6 });
  await a.mouse.up();
};
const ox = page.x + page.width * 0.3;
const oy = page.y + page.height * 0.35;
await stroke([[ox, oy], [ox + 60, oy + 80]]);
await stroke([[ox + 60, oy], [ox, oy + 80]]);
await stroke([[ox + 95, oy + 30], [ox + 150, oy + 30]]);
await stroke([[ox + 95, oy + 55], [ox + 150, oy + 55]]);
await stroke([[ox + 185, oy], [ox + 245, oy], [ox + 205, oy + 85]]);
await a.waitForTimeout(3600); // the page snapshot saves shortly after the last change
await a.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
await a.waitForTimeout(800);
const slateNow = await slateNode.boundingBox();
await a.mouse.click(slateNow.x + 60, slateNow.y + 12);
await a.waitForTimeout(250);
const slateReply = await ask(a, 'Use your Slate specialist to explain what is written here.');
await a.waitForTimeout(500);
const annotated = await a.locator('[data-slate-page="preview"] .ai-ellipse').count();
check('the Slate specialist annotated the page', annotated >= 1, `${annotated} outline(s)`);
check('and the main agent speaks for it, in one voice', (await panel(a).locator('[data-message="assistant"]').count()) === 1 && /^AI/.test(slateReply), slateReply.slice(0, 70));
await a.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
await a.waitForTimeout(250);

// 6. It delegates to the 3D specialist, which works on its own block.
await a.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
await a.waitForTimeout(250);
const pendingBefore = await blocks(a, 'model3d').count();
check('no 3D block yet', pendingBefore === 0);
const repliesBefore = await panel(a).locator('[data-message="assistant"]').count();
const delegating = panel(a).getByLabel('Ask the AI');
await delegating.fill('Build a 3D model of a smooth copper torus knot.');
const started = Date.now();
await delegating.press('Enter');
await blocks(a, 'model3d').first().waitFor({ timeout: 60000 }).then(() => check('it adds a 3D block', true), () => check('it adds a 3D block', false));
await a.locator('[data-generating]').waitFor({ timeout: 60000 }).then(() => check('the block shows the specialist working', true), () => check('the block shows the specialist working', false));
await b.locator('[data-generating]').waitFor({ timeout: 8000 }).then(() => check('so does the other browser', true), () => check('so does the other browser', false));
await a.waitForTimeout(1200);
const working = await blocks(a, 'model3d').first().boundingBox();
const paneNow = await a.locator('.react-flow').boundingBox();
check('the new block is in view while it works', working && working.x >= paneNow.x - 2 && working.x + working.width <= paneNow.x + paneNow.width + 2 && working.y >= paneNow.y - 2 && working.y + working.height <= paneNow.y + paneNow.height + 2);
const activity = await panel(a).locator('[data-agent-activity]').innerText().catch(() => '');
check('the panel says which specialist is working', /3D agent/.test(activity), activity);
await a.locator('[data-model-status]').first().waitFor({ timeout: 480000 });
const status = await a.locator('[data-model-status]').first().getAttribute('data-model-status');
console.log(`      3D finished in ${Math.round((Date.now() - started) / 1000)}s, status ${status}`);
check('the specialist produced a model', status === 'approved' || status === 'draft', String(status));
await a.waitForFunction((count) => document.querySelectorAll('aside[aria-label="AI panel"] [data-message="assistant"]').length > count, repliesBefore, { timeout: 90000 });
const finalReply = (await panel(a).locator('[data-message="assistant"]').last().innerText()).replace(/\s+/g, ' ');
console.log('      final reply:', finalReply.slice(0, 170));
check('the main agent reports back on what the specialist did', /3D|model|torus|draft|generated/i.test(finalReply), finalReply.slice(0, 80));
const details = panel(a).locator('details summary');
if (await details.count()) await details.click();
if (shots) await a.screenshot({ path: `${shots}/agent-3d.png` });

// 7. A specialist still works by itself: Generate on the block does not need the main agent.
const direct = blocks(a, 'model3d').first().getByRole('button', { name: 'Regenerate' });
check('the 3D block keeps its own button', (await direct.count()) === 1 && (await direct.isEnabled()));

const errors = [...a.errors, ...b.errors];
check('no browser errors', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
quit(failures ? 1 : 0);
