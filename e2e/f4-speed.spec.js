import { test, expect } from '@playwright/test';
import { openGame, expectNoErrors } from './helpers.js';

const speedSelect = (page) => page.locator('select[data-key="gameSpeed"]');
const openSettings = async (page) => { await page.evaluate(() => window.__game.shell.open('settings')); await page.locator('summary', { hasText: 'Display' }).evaluate((el) => { el.parentElement.open = true; }); };

test('speed starts at 1x; the selector shows locked speeds as locked with their requirement and a locked speed cannot be chosen', async ({ page }) => {
  const errors = await openGame(page, { simpleUI: true });
  expect(await page.evaluate(() => window.__game.loop.speed)).toBe(1);
  await openSettings(page);
  const opts = await speedSelect(page).locator('option').evaluateAll((os) => os.map((o) => ({ v: o.value, text: o.textContent.trim(), disabled: o.disabled })));
  expect(opts.find((o) => o.v === '1' && !o.disabled)).toBeTruthy();
  expect(opts.find((o) => o.v === '0.5' && !o.disabled), 'slow speeds are never locked').toBeTruthy();
  const two = opts.find((o) => o.v === '2');
  expect(two.disabled).toBe(true);
  expect(two.text).toMatch(/locked: unlocks at level 10/);
  expect(opts.find((o) => o.v === '4').text).toMatch(/level 30/);
  // forcing the disabled option through the browser changes nothing (the option is disabled and the simulation validates too)...
  await speedSelect(page).selectOption('2', { timeout: 1500 }).catch(() => {});
  expect(await page.evaluate(() => window.__game.state.settings.gameSpeed)).toBe(1);
  expect(await page.evaluate(() => window.__game.loop.speed)).toBe(1);
  // ...and setting it directly is refused by the simulation
  await page.evaluate(() => window.__game.set('gameSpeed', 4));
  expect(await page.evaluate(() => window.__game.state.settings.gameSpeed)).toBe(1);
  expect(await page.evaluate(() => window.__game.loop.speed)).toBe(1);
  await expect(page.locator('#hud [data-chip="speed"]')).toBeHidden();
  await expectNoErrors(errors);
});

test('slow speeds are always available and really slow the simulation', async ({ page }) => {
  await openGame(page);
  await openSettings(page);
  await speedSelect(page).selectOption('0.5');
  expect(await page.evaluate(() => window.__game.loop.speed)).toBe(0.5);
  const t0 = await page.evaluate(() => window.__game.loop.simTime);
  await page.waitForTimeout(2000);
  const t1 = await page.evaluate(() => window.__game.loop.simTime);
  expect(t1 - t0).toBeGreaterThan(0.5);
  expect(t1 - t0).toBeLessThan(1.6); // about 1 simulated second in 2 real seconds
});

test('reaching level 10 unlocks 2x: the HUD speed button appears, cycles, and the sim runs twice as fast while saves and playtime stay real-time', async ({ page }) => {
  const errors = await openGame(page, { simpleUI: true });
  await page.evaluate(() => { window.__game.game.debug.setLevel(10); window.__game.game.step(1.1); });
  await expect(page.locator('#hud [data-chip="speed"]')).toBeVisible();
  await expect(page.locator('#hud [data-chip="speed"]')).toContainText('1×');
  await page.locator('#hud [data-chip="speed"]').click();
  await expect(page.locator('#hud [data-chip="speed"]')).toContainText('2×');
  expect(await page.evaluate(() => window.__game.loop.speed)).toBe(2);
  const m = () => page.evaluate(() => ({ sim: window.__game.loop.simTime, play: window.__game.state.playtime, saved: window.__game.state.savedAt }));
  const a = await m();
  await page.waitForTimeout(2000);
  const b = await m();
  const simDt = b.sim - a.sim;
  const playDt = b.play - a.play;
  expect(simDt).toBeGreaterThan(2.4); // ~4 simulated seconds in 2 real seconds
  expect(playDt).toBeGreaterThan(1.2);
  expect(playDt).toBeLessThan(simDt * 0.75); // playtime counts real seconds, not simulated ones
  // the next press goes back to 1x (4x needs level 30)
  await page.locator('#hud [data-chip="speed"]').click();
  await expect(page.locator('#hud [data-chip="speed"]')).toContainText('1×');
  // a save written at 2x reloads at 2x (the unlock is derived from level, not stored as a flag)
  await page.locator('#hud [data-chip="speed"]').click();
  await page.evaluate(() => window.__game.saveNow());
  await page.reload();
  await page.waitForFunction(() => window.__game && window.__game.loop.frames > 2);
  expect(await page.evaluate(() => window.__game.loop.speed)).toBe(2);
  await expectNoErrors(errors);
});

test('a saved speed that is not unlocked (edited save) is clamped when the game loads', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => { window.__game.state.settings.gameSpeed = 64; window.__game.saveNow(); });
  await page.reload();
  await page.waitForFunction(() => window.__game && window.__game.loop.frames > 2);
  expect(await page.evaluate(() => window.__game.loop.speed)).toBe(1);
});

test('offline progress is the same whatever the game speed was', async ({ page }) => {
  await openGame(page);
  const gain = (speed) => page.evaluate((sp) => {
    const g = window.__game.game;
    const s = window.__game.state;
    s.settings.gameSpeed = sp;
    g.place(s.bag.find((u) => s.items[u].tpl === 'pebble_drill'), 1, 1, 0);
    g.place(s.bag.find((u) => s.items[u].tpl === 'stall'), 2, 1, 0);
    const before = s.money.toNumber();
    g.catchUp(Date.now() - 3600 * 1000); // an hour away
    return s.money.toNumber() - before;
  }, speed);
  const a = await gain(1);
  // a second identical catch-up at another speed on the same layout earns the same amount
  const b = await page.evaluate(() => {
    const g = window.__game.game;
    const s = window.__game.state;
    s.settings.gameSpeed = 0.5;
    const before = s.money.toNumber();
    g.catchUp(Date.now() - 3600 * 1000);
    return s.money.toNumber() - before;
  });
  expect(a).toBeGreaterThan(1000);
  expect(Math.abs(a - b) / a).toBeLessThan(1e-6);
});
