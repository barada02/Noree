// M2 on the live site: real nginx, HTTPS and WebSockets. Creates one project titled "Live sync test".
import { chromium } from 'playwright-core';

const base = process.env.LIVE_URL ?? 'https://kanya.alito.tech';
const shots = process.argv[2];
let failures = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); if (!ok) failures++; };
const passes = (name, promise) => promise.then(() => check(name, true), () => check(name, false));

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const open = async () => {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push('console: ' + m.text().slice(0, 200)); });
  return page;
};
const nodeOf = (page, type) => page.locator(`.react-flow__node:has([data-block-type="${type}"])`).first();
const add = async (page, label) => { await page.getByRole('button', { name: `Add ${label}`, exact: true }).click(); await page.waitForTimeout(200); };
const live = (page) => page.locator('[data-connection="connected"]').waitFor({ timeout: 15000 });

try {
  const a = await open();
  await a.goto(`${base}/#/app`);
  await a.getByRole('button', { name: 'New project', exact: true }).first().click();
  await a.waitForSelector('[aria-label="Project name"]', { timeout: 15000 });
  await passes('A connects over wss through nginx', live(a));
  const url = a.url();
  check('project created by the live server', /#\/p\/[a-f0-9]{48}$/.test(url));

  const b = await open();
  await b.goto(url);
  await b.waitForSelector('[aria-label="Project name"]', { timeout: 15000 });
  await passes('B connects', live(b));

  await a.getByLabel('Project name').fill('Live sync test');
  await a.getByLabel('Project name').press('Enter');
  await passes('rename reaches B', b.waitForFunction(() => document.querySelector('[aria-label="Project name"]').value === 'Live sync test', null, { timeout: 6000 }));

  await add(a, 'Text');
  await passes('block appears in B', nodeOf(b, 'text').waitFor({ timeout: 6000 }));

  await a.locator('[data-block-type="text"] textarea').click();
  await a.keyboard.type('Hello ');
  await b.waitForFunction(() => document.querySelector('[data-block-type="text"] textarea')?.value === 'Hello ', null, { timeout: 6000 });
  await b.locator('[data-block-type="text"] textarea').click();
  await b.keyboard.press('End');
  await b.keyboard.type('from B');
  await passes('text merges both ways', a.waitForFunction(() => document.querySelector('[data-block-type="text"] textarea')?.value === 'Hello from B', null, { timeout: 6000 }));

  const start = await nodeOf(a, 'text').boundingBox();
  const startB = await nodeOf(b, 'text').boundingBox();
  await a.mouse.move(start.x + start.width / 2, start.y + 12);
  await a.mouse.down();
  await a.mouse.move(start.x + start.width / 2 + 60, start.y + 50, { steps: 5 });
  await a.mouse.move(start.x + start.width / 2 + 180, start.y + 120, { steps: 10 });
  await a.waitForTimeout(400);
  const mid = await nodeOf(b, 'text').boundingBox();
  check('B sees the drag live, before the drop', Math.abs(mid.x - startB.x) > 50, `moved ${Math.round(mid.x - startB.x)}px`);
  await a.mouse.up();
  await a.mouse.move(700, 500, { steps: 3 });
  await passes('cursor visible to the other person', b.locator('[data-peer-cursor]').first().waitFor({ timeout: 5000 }));
  check('presence shows the other person', (await b.locator('[data-peer]').count()) === 1);
  if (shots) await b.screenshot({ path: `${shots}/live-b.png` });

  // A fresh browser has no local copy, so what it shows came from the server.
  await a.waitForTimeout(3000);
  const c = await open();
  await c.goto(url);
  await c.waitForSelector('[aria-label="Project name"]', { timeout: 15000 });
  await live(c);
  check('fresh browser loads from the server', (await c.locator('[data-block-type="text"] textarea').inputValue()) === 'Hello from B');

  // The camera shares this server's WebSockets.
  const cam = await open();
  await cam.goto(`${base}/#/camera`);
  await cam.waitForTimeout(3500);
  const qr = await cam.locator('svg, canvas').count();
  const text = (await cam.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 170);
  check('camera page pairs (QR shown)', qr > 0, `:: ${text}`);

  const errors = [a, b, c, cam].flatMap((p) => p.errors);
  check('no browser errors', errors.length === 0, errors.slice(0, 4).join(' | '));
  console.log('project url:', url);
} catch (e) {
  failures++;
  console.log('CRASH', String(e.message).split('\n')[0]);
}
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
