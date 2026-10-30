// The staged production site (scripts/stamp.js) served under /Tcyoon-RNG/ like GitHub project pages:
// nothing may rely on the domain root, every request must succeed, and a save must move between addresses.
import { test, expect } from '@playwright/test';

const SUB = 'http://localhost:5198/Tcyoon-RNG/';

test('the game boots from a sub-path with every request succeeding, no console errors, and the staged layout', async ({ page }) => {
  const failed = [];
  const errors = [];
  const urls = [];
  page.on('response', (r) => { urls.push(r.url()); if (r.status() >= 400 && !r.url().endsWith('favicon.ico')) failed.push(`${r.status()} ${r.url()}`); });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(SUB);
  await page.waitForFunction(() => window.__game && window.__game.loop.frames > 3);
  expect(failed).toEqual([]);
  expect(errors).toEqual([]);
  // every game file came from the versioned folder under the sub-path, nothing from the domain root
  expect(urls.filter((u) => u.includes('/src/') || u.includes('/vendor/')).every((u) => u.startsWith(SUB + 'v/e2e-1.0/'))).toBe(true);
  expect(urls.some((u) => /vendor\/fonts\/.*\.woff2/.test(u))).toBe(true);
  expect(urls.every((u) => u.startsWith('http://localhost:5198/Tcyoon-RNG/') || u.startsWith('data:'))).toBe(true);
  expect(await page.evaluate(() => window.__game.version)).toBe('e2e-1.0');
  // fonts really loaded from there
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => [...document.fonts].some((f) => f.status === 'loaded' && f.family.includes('Atkinson')))).toBe(true);
  // social tags point at the published address
  expect(await page.locator('meta[property="og:image"]').getAttribute('content')).toBe(SUB + 'assets/og.png');
  const og = await page.request.get(SUB + 'assets/og.png');
  expect(og.status()).toBe(200);
});

test('a roll works and the 404 page is served for unknown paths under the sub-path', async ({ page }) => {
  await page.goto(SUB);
  await page.waitForFunction(() => window.__game && window.__game.loop.frames > 3);
  await page.locator('.modal [data-choice="standard"]').click();
  await page.getByRole('button', { name: 'Skip tutorial' }).click();
  await page.getByRole('button', { name: "Skip and don't ask again" }).click();
  const before = await page.evaluate(() => window.__game.state.stats.rolls);
  await page.locator('.roll-main').click();
  await expect.poll(() => page.evaluate(() => window.__game.state.stats.rolls)).toBe(before + 1);
  const res = await page.goto(SUB + 'nope/nothing');
  expect(res.status()).toBe(404);
  await expect(page.getByRole('link', { name: 'Back to the game' })).toBeVisible();
  const outside = await page.request.get('http://localhost:5198/index.html');
  expect(outside.status(), 'nothing is served outside the base path').toBe(404);
});

test('a local save exports from the dev address and imports into the sub-path (hosted) address', async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  await a.goto('http://localhost:5199/');
  await a.waitForFunction(() => window.__game && window.__game.loop.frames > 3);
  await a.locator('.modal [data-choice="standard"]').click();
  await a.evaluate(() => { const g = window.__game.game; g.tutorial.skip({ forever: true }); g.debug.setLevel(9); g.debug.giveItem('gem_forge', 6); });
  const text = await a.evaluate(() => window.__game.game.exportText());
  expect(text.startsWith('TRNG1.')).toBe(true);
  const b = await (await browser.newContext()).newPage();
  await b.goto(SUB);
  await b.waitForFunction(() => window.__game && window.__game.loop.frames > 3);
  await b.locator('.modal [data-choice="standard"]').click();
  await b.evaluate(() => window.__game.game.tutorial.skip({ forever: true }));
  expect(await b.evaluate(() => window.__game.state.level)).toBe(1);
  await b.evaluate(() => window.__game.shell.open('settings'));
  await b.locator('summary', { hasText: 'Save data' }).evaluate((el) => { el.parentElement.open = true; });
  await b.locator('textarea[data-act="save-text"]').fill(text);
  await b.getByRole('button', { name: 'Import from text' }).click();
  await expect(b.locator('.msg')).toContainText(/imported/i);
  expect(await b.evaluate(() => window.__game.state.level)).toBe(9);
  expect(await b.evaluate(() => Object.values(window.__game.state.items).some((i) => i.tpl === 'gem_forge' && i.tier === 6))).toBe(true);
});

test('settings explain where the save lives and how to move it; a new-version banner appears when version.json changes', async ({ page }) => {
  await page.goto(SUB);
  await page.waitForFunction(() => window.__game && window.__game.loop.frames > 3);
  await page.locator('.modal [data-choice="standard"]').click();
  await page.evaluate(() => window.__game.game.tutorial.skip({ forever: true }));
  await page.evaluate(() => window.__game.shell.open('settings'));
  await page.locator('summary', { hasText: 'Save data' }).evaluate((el) => { el.parentElement.open = true; });
  await expect(page.locator('#panels')).toContainText('this browser, for this web address');
  await expect(page.locator('#panels')).toContainText('Version e2e-1.0');
  await expect(page.getByRole('button', { name: 'Export save text' })).toBeVisible();
  // simulate a new deploy: version.json now says something else
  await page.route('**/version.json*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: 'e2e-2.0' }) }));
  expect(await page.evaluate(() => window.__game.updates.check())).toBe(true);
  await expect(page.locator('#update-banner')).toBeVisible();
  await expect(page.locator('#update-banner')).toContainText('A new version is available');
  await expect(page.locator('#update-banner').getByRole('button', { name: 'Reload' })).toBeVisible();
});
