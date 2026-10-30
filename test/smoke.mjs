// Browser smoke test: plays through the real page in headless Chromium.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { chromium } from 'playwright';

const PORT = '8123';
const CACHED_CHROME = `${homedir()}/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome`;
const { maps } = JSON.parse(readFileSync(new URL('../data/maps.json', import.meta.url)));

const server = spawn('node', ['scripts/serve.mjs'], { env: { ...process.env, PORT }, cwd: new URL('..', import.meta.url) });
await new Promise((resolve) => server.stdout.once('data', resolve));
const browser = await chromium.launch(existsSync(CACHED_CHROME) ? { executablePath: CACHED_CHROME } : {});

// Screen position of a grid point, using the SVG's own transform.
function screenPoint(page, x, y) {
  return page.evaluate(([gx, gy]) => {
    const point = new DOMPoint(gx, gy).matrixTransform(document.getElementById('map').getScreenCTM());
    return { x: point.x, y: point.y };
  }, [x, y]);
}

async function clickGrid(page, x, y) {
  const point = await screenPoint(page, x, y);
  await page.mouse.click(point.x, point.y);
}

async function currentRoom(page, map) {
  const name = await page.locator('#prompt').textContent();
  const room = map.rooms.find((r) => r.name === name);
  assert.ok(room, `prompt "${name}" is not a room on ${map.name}`);
  return room;
}

async function clickInside(page, map) {
  const [x, y, w, h] = (await currentRoom(page, map)).rects[0];
  await clickGrid(page, x + w / 2, y + h / 2);
}

// Clicks the corner of the grid opposite the target's first rectangle.
async function clickFarAway(page, map) {
  const [x, y] = (await currentRoom(page, map)).rects[0];
  await clickGrid(page, x < 50 ? 99 : 1, y < 50 ? 99 : 1);
}

const errors = [];
function watch(page) {
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
}

try {
  // Normal desktop play.
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  watch(page);
  await page.goto(`http://localhost:${PORT}/`);
  await page.locator('#map g').first().waitFor();
  const map = maps[0];

  await clickInside(page, map);
  await page.locator('#status', { hasText: 'Correct' }).waitFor();
  assert.equal(await page.locator('#map .good').count(), 1, 'correct room lights green');
  await page.locator('#progress', { hasText: '2 / 10' }).waitFor();
  console.log('ok: click inside the target is correct');

  await clickFarAway(page, map);
  await page.locator('#status', { hasText: 'Wrong' }).waitFor();
  assert.equal(await page.locator('#map .marker').count(), 1, 'wrong click is marked');
  assert.equal(await page.locator('#map .good').count(), 1, 'right room lights green');
  assert.equal(await page.locator('#map text').count(), 1, 'right room is named');
  await page.keyboard.press('Space');
  await page.locator('#progress', { hasText: '3 / 10' }).waitFor();
  console.log('ok: click far away is wrong, and Space moves on');

  for (let i = 3; i <= 10; i += 1) {
    await page.locator('#progress', { hasText: `${i} / 10` }).waitFor();
    await clickInside(page, map);
    await page.locator('#status', { hasText: 'Correct' }).waitFor();
  }
  await page.locator('#end-buttons button').first().waitFor();
  assert.match(await page.locator('#prompt').textContent(), /^90% correct$/);
  assert.equal(await page.locator('#map .weak').count(), 3, 'three weakest highlighted');
  console.log('ok: a whole round reaches the end screen');

  await page.getByRole('button', { name: 'Drill these' }).click();
  await page.locator('#progress', { hasText: '1 / 3' }).waitFor();
  console.log('ok: Drill these starts a round of three');

  await page.getByRole('button', { name: 'Study' }).click();
  assert.equal(await page.locator('#map text').count(), map.rooms.length, 'study shows every label');
  const before = await page.locator('#progress').textContent();
  await clickGrid(page, 50, 50);
  assert.equal(await page.locator('#progress').textContent(), before, 'study pauses the quiz');
  await page.getByRole('button', { name: 'Study' }).click();
  await page.locator('#progress', { hasText: '1 / 3' }).waitFor();
  console.log('ok: Study shows labels and pauses the quiz');

  // Last-used map is remembered across a reload.
  await page.getByRole('button', { name: maps[2].name }).click();
  await page.reload();
  await page.locator('#map g').first().waitFor();
  assert.equal(await page.locator('#chooser [aria-pressed="true"]').textContent(), maps[2].name);
  console.log('ok: last-used map is remembered');

  // A phone-width screen with storage blocked.
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  watch(phone);
  await phone.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
  });
  await phone.goto(`http://localhost:${PORT}/`);
  await phone.locator('#map g').first().waitFor();
  const scroll = await phone.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(scroll <= 390, `page scrolls sideways at 390 px (${scroll})`);
  await clickInside(phone, map);
  await phone.locator('#status', { hasText: 'Correct' }).waitFor();
  console.log('ok: works at 390 px wide with storage blocked');

  assert.deepEqual(errors, [], 'no console errors');
  console.log('ok: no console errors');
  console.log('Smoke test passed.');
} finally {
  await browser.close();
  server.kill();
}
