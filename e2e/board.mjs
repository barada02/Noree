// M1 "done when": two projects, add and group blocks, reload, everything still there.
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://127.0.0.1:5199';
const shots = process.argv[3];
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 240)); });

let failures = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); if (!ok) failures++; };
const add = async (label) => { await page.getByRole('button', { name: `Add ${label}`, exact: true }).click(); await page.waitForTimeout(150); };
const blocks = (type) => page.locator(`[data-block-type="${type}"]`);
const nodeOf = (type, n = 0) => page.locator(`.react-flow__node:has([data-block-type="${type}"])`).nth(n);
async function box(locator) { return locator.boundingBox(); }
async function dragTo(locator, x, y) {
  const b = await box(locator);
  // Grab the header area so we drag the block and not its text area.
  await page.mouse.move(b.x + b.width / 2, b.y + 12);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 10, b.y + 22, { steps: 3 });
  await page.mouse.move(x, y, { steps: 12 });
  await page.waitForTimeout(120);
  await page.mouse.up();
  await page.waitForTimeout(250);
}

await page.goto(`${base}/#/app`);
await page.getByText('Plan together with AI').waitFor({ timeout: 8000 });
check('project list shows empty state', true);

await page.getByRole('button', { name: 'New project', exact: true }).first().click();
await page.waitForSelector('[aria-label="Project name"]');
const firstUrl = page.url();
check('new project opens its own URL', /#\/p\/[a-f0-9]{48}$/.test(firstUrl), firstUrl.split('#')[1]);

await page.getByLabel('Project name').fill('Phasors');
await page.getByLabel('Project name').press('Enter');

await add('Frame');
await add('Text');
await add('Sticky');
await add('Slate');
await add('3D model');
check('all block types added', (await blocks('frame').count()) === 1 && (await blocks('text').count()) === 1 && (await blocks('sticky').count()) === 1 && (await blocks('slate').count()) === 1 && (await blocks('model3d').count()) === 1);

// Spread blocks out.
const pane = await box(page.locator('.react-flow'));

await dragTo(nodeOf('slate'), pane.x + 260, pane.y + 520);
await dragTo(nodeOf('model3d'), pane.x + 900, pane.y + 60);
await dragTo(nodeOf('sticky'), pane.x + 640, pane.y + 600);
await dragTo(nodeOf('frame'), pane.x + 340, pane.y + 60);
await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });

// Type in the text block.
await page.locator('[data-block-type="text"] textarea').fill('Second harmonic notes');
const stickyArea = page.locator('[data-block-type="sticky"] textarea');
await stickyArea.fill('Remember units');

// Drop the text block into the frame.
const frameBox = await box(nodeOf('frame'));
await dragTo(nodeOf('text'), frameBox.x + frameBox.width / 2, frameBox.y + frameBox.height / 2);

// Move the frame and confirm the child follows.
const before = await box(nodeOf('text'));
const fb = await box(nodeOf('frame'));
await page.mouse.move(fb.x + 12, fb.y + fb.height - 12);
await page.mouse.down();
await page.mouse.move(fb.x + 30, fb.y + fb.height + 8, { steps: 4 });
await page.mouse.move(fb.x + 72, fb.y + fb.height + 28, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(250);
const after = await box(nodeOf('text'));
check('block moves with its frame', Math.abs(after.x - before.x) > 30 && Math.abs(after.y - before.y) > 20, `dx=${Math.round(after.x - before.x)} dy=${Math.round(after.y - before.y)}`);
await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });

// Frame appears in the sidebar and flies there.
check('frame listed in the sidebar', await page.getByRole('navigation', { name: 'Projects' }).getByRole('button', { name: 'Frame', exact: true }).isVisible());

// Connect slate -> 3D.
const src = await box(nodeOf('slate').locator('.react-flow__handle.source'));
const dst = await box(nodeOf('model3d').locator('.react-flow__handle.target'));
await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2);
await page.mouse.down();
await page.mouse.move(dst.x + dst.width / 2, dst.y + dst.height / 2, { steps: 15 });
await page.waitForTimeout(100);
await page.mouse.up();
await page.waitForTimeout(250);
check('connection created', (await page.locator('.react-flow__edge').count()) === 1);

const positions = async () => page.locator('.react-flow__node').evaluateAll((els) => Object.fromEntries(els.map((e) => [e.getAttribute('data-id'), e.style.transform + '|' + e.style.width + '|' + e.style.height])));
await page.waitForTimeout(400);
const saved = await positions();
if (shots) await page.screenshot({ path: `${shots}/m1-board.png` });

// Second project.
await page.getByRole('button', { name: '+ New project' }).click();
await page.waitForFunction((u) => location.href !== u, firstUrl);
await page.waitForSelector('[aria-label="Project name"]');
await page.getByLabel('Project name').fill('Trip');
await page.getByLabel('Project name').press('Enter');
await add('Sticky');
await page.waitForTimeout(300);
check('second project is separate', (await page.locator('.react-flow__node').count()) === 1);
const nav = page.getByRole('navigation', { name: 'Projects' });
check('sidebar lists both projects', (await nav.getByRole('link', { name: 'Phasors' }).isVisible()) && (await nav.getByRole('link', { name: 'Trip' }).isVisible()));

// Back to the first, then reload.
await nav.getByRole('link', { name: 'Phasors' }).click();
await page.waitForSelector('[data-block-type="frame"]');
await page.waitForTimeout(400);
await page.reload();
await page.waitForSelector('[data-block-type="frame"]');
await page.waitForTimeout(600);
const restored = await positions();
check('layout survives reload', JSON.stringify(saved) === JSON.stringify(restored), JSON.stringify(saved) === JSON.stringify(restored) ? '' : `\n saved ${JSON.stringify(saved)}\n after ${JSON.stringify(restored)}`);
check('text survives reload', (await page.locator('[data-block-type="text"] textarea').inputValue()) === 'Second harmonic notes');
check('connection survives reload', (await page.locator('.react-flow__edge').count()) === 1);
check('title survives reload', (await page.getByLabel('Project name').inputValue()) === 'Phasors');

// Delete a frame: the child stays.
await page.locator('.react-flow__controls-fitview').click();
await page.waitForTimeout(400);
const frameNow = await box(nodeOf('frame'));
await page.mouse.click(frameNow.x + 8, frameNow.y + frameNow.height - 8);
await page.waitForTimeout(150);
await page.keyboard.press('Delete');
await page.waitForTimeout(300);
check('deleting a frame keeps its block', (await blocks('frame').count()) === 0 && (await blocks('text').count()) === 1);

// Typing Backspace in a text area must not delete the block.
await page.locator('[data-block-type="text"] textarea').click();
await page.keyboard.press('End');
await page.keyboard.press('Backspace');
await page.waitForTimeout(150);
check('Backspace while typing edits text only', (await blocks('text').count()) === 1 && (await page.locator('[data-block-type="text"] textarea').inputValue()) === 'Second harmonic note');

if (shots) await page.screenshot({ path: `${shots}/m1-after.png` });
check('no browser errors', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
