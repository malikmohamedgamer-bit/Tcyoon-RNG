// Runs against the deployed site. It fails loudly (non-zero exit, red job) if the game is not up or not working.
import { test, expect } from '@playwright/test';

test('the live site loads, renders, has no errors, a roll works and the save is written', async ({ page, baseURL }) => {
  const errors = [];
  const failed = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().endsWith('favicon.ico')) failed.push(`${r.status()} ${r.url()}`); });

  const res = await page.goto('./');
  expect(res.status(), `GET ${baseURL}`).toBe(200);
  await page.waitForFunction(() => window.__game && window.__game.loop && window.__game.loop.frames > 5, null, { timeout: 30_000 });

  // the version the page runs equals the version published next to it
  const published = await (await page.request.get('./version.json')).json();
  expect(published.version).toBeTruthy();
  expect(await page.evaluate(() => window.__game.version)).toBe(published.version);

  // first run: choose a pace and skip the tutorial through the UI, like a player
  await page.locator('.modal [data-choice="standard"]').click();
  await page.getByRole('button', { name: 'Skip tutorial' }).click();
  await page.getByRole('button', { name: "Skip and don't ask again" }).click();

  // the canvas actually renders something
  const lit = await page.evaluate(() => {
    const c = document.getElementById('view');
    window.__game.gfx.render(0, window.__game.state); // a WebGL canvas can only be read in the same task it was drawn in
    const g = document.createElement('canvas');
    g.width = 64; g.height = 64;
    g.getContext('2d').drawImage(c, 0, 0, 64, 64);
    const d = g.getContext('2d').getImageData(0, 0, 64, 64).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 30) n++;
    return n;
  });
  expect(lit, 'the 3D view is not blank').toBeGreaterThan(200);

  // a roll works (the free roll), through the button
  const before = await page.evaluate(() => window.__game.state.stats.rolls);
  await page.locator('.roll-main').click();
  await expect.poll(() => page.evaluate(() => window.__game.state.stats.rolls)).toBe(before + 1);

  // the save is written to this browser's storage
  await page.evaluate(() => window.__game.saveNow());
  const saved = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes('tcyoon')).length);
  expect(saved).toBeGreaterThan(0);

  expect(failed, 'no request failed (a 404 here usually means an absolute path or a stale cache)').toEqual([]);
  expect(errors).toEqual([]);
});

test('the 404 page exists and links back to the game', async ({ page }) => {
  const res = await page.goto('./this-page-does-not-exist-' + Date.now());
  expect(res.status()).toBe(404);
  await expect(page.getByRole('link', { name: 'Back to the game' })).toBeVisible();
});
