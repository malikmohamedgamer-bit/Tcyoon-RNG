import { test, expect } from '@playwright/test';
import { openGame, expectNoErrors } from './helpers.js';

test('loads, renders a non-blank 3D scene, loop is alive, no console errors', async ({ page }) => {
  const errors = await openGame(page);
  const f0 = await page.evaluate(() => window.__game.loop.frames);
  await page.waitForTimeout(500);
  const f1 = await page.evaluate(() => window.__game.loop.frames);
  expect(f1).toBeGreaterThan(f0);
  // read back the WebGL canvas: not a single flat colour
  const distinct = await page.evaluate(() => {
    window.__game.gfx.render(0.016); // read back in the same task as the draw (no preserveDrawingBuffer)
    const c = document.getElementById('view');
    const t = document.createElement('canvas');
    t.width = 64; t.height = 64;
    const g = t.getContext('2d');
    g.drawImage(c, 0, 0, 64, 64);
    const d = g.getImageData(0, 0, 64, 64).data;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 4) seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    return seen.size;
  });
  expect(distinct).toBeGreaterThan(6);
  await expectNoErrors(errors);
});

test('pixel size setting changes the render target resolution', async ({ page }) => {
  await openGame(page);
  const sizes = await page.evaluate(() => {
    const p = window.__game.gfx.pixel;
    p.setPixelSize(2); const a = p.targetSize.slice();
    p.setPixelSize(8); const b = p.targetSize.slice();
    p.setPixelSize(1); const c = p.targetSize.slice();
    return { a, b, c };
  });
  expect(sizes.a[0]).toBeGreaterThan(sizes.b[0]);
  expect(sizes.c[0]).toBeGreaterThanOrEqual(sizes.a[0]);
});

test('the save is written to localStorage with the current schema version', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => window.__game.loop.advance(3));
  await page.evaluate(() => window.__game.saveNow());
  const raw = await page.evaluate(() => localStorage.getItem('tcyoon-rng:save'));
  const data = JSON.parse(raw);
  expect(data.v).toBe(await page.evaluate(() => window.__game.game.save.version));
  expect(data.v).toBeGreaterThanOrEqual(2);
  expect(typeof data.savedAt).toBe('number');
});
