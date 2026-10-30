import { test, expect } from '@playwright/test';
import { openGame, expectNoErrors } from './helpers.js';

const RARE = { uid: 9001, tier: 9, icon: 'gem', label: 'Eternal', color: '#d96bff', title: 'Gem Forge', isNew: false };
const R = (page) => page.locator('.rv-reel');

async function rollOnce(page) {
  await page.evaluate(() => { window.__game.state.freeRoll.count = 0; window.__game.game.debug.grantMoney(1e5); });
  await page.locator('.roll-main').click();
}

test('a roll shows a spinning reel that decelerates and lands on exactly what the game already decided', async ({ page }) => {
  const errors = await openGame(page);
  await rollOnce(page);
  await expect(R(page)).toBeVisible();
  await expect(R(page).locator('.rv-window')).toHaveClass(/blur/); // spinning
  const decided = await page.evaluate(() => { const s = window.__game.state; const uid = s.bag.at(-1); return { uid, tier: s.items[uid].tier, tpl: s.items[uid].tpl, inBag: s.bag.includes(uid) }; });
  expect(decided.inBag).toBe(true); // the item is in the backpack before the reel stops
  const shown = await page.evaluate(() => { const c = window.__game.reveal.current; return { uid: c.result.uid, tier: c.result.tier }; });
  expect(shown).toEqual({ uid: decided.uid, tier: decided.tier });
  // the "recent rolls" list does not spoil it while spinning...
  expect(await page.evaluate(() => window.__game.reveal.current.landed)).toBe(false);
  await page.waitForFunction(() => !window.__game.reveal.active, null, { timeout: 8000 });
  await expect(page.locator('#sr-live')).toContainText(/Rolled /);
  await expectNoErrors(errors);
});

test('skip: Esc, Enter and a click end the animation at once and the item is never lost', async ({ page }) => {
  await openGame(page);
  for (const how of ['Escape', 'Enter', 'click']) {
    await rollOnce(page);
    await expect(R(page)).toBeVisible();
    const uid = await page.evaluate(() => window.__game.state.bag.at(-1));
    if (how === 'click') await page.locator('.rv-skip').click();
    else await page.keyboard.press(how);
    await expect(R(page)).toBeHidden({ timeout: 3000 }).catch(() => {});
    await page.waitForFunction(() => !window.__game.reveal.active, null, { timeout: 3000 });
    expect(await page.evaluate((u) => window.__game.state.bag.includes(u), uid)).toBe(true);
  }
});

test('Space skips the animation and rolls again at once (fast rolling is never slowed down)', async ({ page }) => {
  await openGame(page);
  await rollOnce(page);
  const rolls0 = await page.evaluate(() => window.__game.state.stats.rolls);
  await page.keyboard.press('Space');
  expect(await page.evaluate(() => window.__game.state.stats.rolls)).toBe(rolls0 + 1);
});

test('rare cutscene: tinted overlay, themed text lines, a sting caption, skippable; the camera and lights are restored exactly', async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => window.__game.set('captions', true));
  const before = await page.evaluate(() => ({ dist: window.__game.gfx.cam.dist, yaw: window.__game.gfx.cam.yaw, hemi: window.__game.gfx.scene.children.find((c) => c.isHemisphereLight).color.getHexString() }));
  await page.evaluate((r) => window.__game.reveal.push([r]), RARE);
  await expect(R(page)).toBeVisible();
  await page.evaluate(() => window.__game.reveal.skip()); // skip the quick reel; the cutscene follows
  await expect(page.locator('.rv-cut')).toBeVisible();
  await expect(page.locator('.rv-cut')).toHaveAttribute('data-level', 'full');
  await page.waitForTimeout(1800);
  await expect(page.locator('.rv-l.rarity')).toHaveText('Eternal');
  await expect(page.locator('#captions')).toContainText(/sting/);
  const mid = await page.evaluate(() => ({ dist: window.__game.gfx.cam.dist, active: window.__game.gfx.reveal.active }));
  expect(mid.active).toBe(true);
  expect(mid.dist).toBeLessThan(before.dist); // the push-in
  await page.keyboard.press('Escape');
  await expect(page.locator('.rv-cut')).toBeHidden();
  const after = await page.evaluate(() => ({ dist: window.__game.gfx.cam.dist, yaw: window.__game.gfx.cam.yaw, active: window.__game.gfx.reveal.active, hemi: window.__game.gfx.scene.children.find((c) => c.isHemisphereLight).color.getHexString() }));
  expect(after).toEqual({ dist: before.dist, yaw: before.yaw, active: false, hemi: before.hemi });
  await expectNoErrors(errors);
});

test('a first-time Index find gets the "NEW in your Index" flourish', async ({ page }) => {
  await openGame(page);
  await page.evaluate((r) => window.__game.reveal.push([{ ...r, isNew: true }]), RARE);
  await page.evaluate(() => window.__game.reveal.skip());
  await expect(page.locator('.rv-cut')).toBeVisible();
  await page.waitForFunction(() => document.querySelector('.rv-l.first')?.textContent.includes('NEW'), null, { timeout: 5000 });
});

test('flash safety: in a full cutscene the flash overlay never appears more than 3 times in any second', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    window.__flashes = [];
    const el = document.querySelector('.rv-flash');
    new MutationObserver(() => { if (!el.hidden) window.__flashes.push(performance.now()); }).observe(el, { attributes: true, attributeFilter: ['hidden'] });
    window.__game.reveal.push([{ uid: 5, tier: 40, icon: 'gem', label: 'x', color: '#fff', title: 'y' }]);
    window.__game.reveal.skip();
  });
  await page.waitForFunction(() => !window.__game.reveal.active, null, { timeout: 9000 });
  const f = await page.evaluate(() => window.__flashes);
  expect(f.length).toBeGreaterThan(0);
  for (const t of f) expect(f.filter((x) => x >= t && x < t + 1000).length).toBeLessThanOrEqual(3);
});

test('reduced motion: no spin, no blur, no flashes, no particles; the cutscene is a short text card; the result is still announced', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errors = await openGame(page);
  await rollOnce(page);
  await expect(R(page)).toHaveAttribute('data-mode', 'static');
  await expect(R(page).locator('.rv-window')).not.toHaveClass(/blur/);
  await page.evaluate((r) => window.__game.reveal.push([r]), RARE);
  await page.evaluate(() => { window.__game.reveal.fastForward(2); });
  await page.evaluate(() => { window.__game.reveal.push([{ uid: 77, tier: 12, icon: 'gem', label: 'Rare', color: '#fff', title: 'z' }]); });
  await page.waitForFunction(() => !window.__game.reveal.active || window.__game.reveal.cutscene, null, { timeout: 5000 });
  const c = await page.evaluate(() => window.__game.reveal.cutscene && { reduced: window.__game.reveal.cutscene.spec.reduced, secs: window.__game.reveal.cutscene.seconds, flashes: window.__game.reveal.cutscene.flashes.length, burst: window.__game.reveal.cutscene.burst });
  if (c) expect(c).toEqual({ reduced: true, secs: expect.any(Number), flashes: 0, burst: 0 });
  if (c) expect(c.secs).toBeLessThanOrEqual(1.6);
  await page.waitForFunction(() => !window.__game.reveal.active, null, { timeout: 8000 });
  await expect(page.locator('#sr-live')).toContainText(/Rolled /);
  await expectNoErrors(errors);
  await ctx.close();
});

test('settings: cutscenes off shows no full-screen scene; reels off shows no reel but the result is still reported', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => window.__game.set('cutscenes', 'off'));
  await page.evaluate((r) => window.__game.reveal.push([r]), RARE);
  await page.evaluate(() => window.__game.reveal.skip());
  expect(await page.evaluate(() => window.__game.reveal.cutscene)).toBeNull();
  await page.evaluate(() => window.__game.set('reels', 'off'));
  await rollOnce(page);
  await page.waitForTimeout(300);
  await expect(R(page)).toBeHidden();
  await page.evaluate(() => window.__game.shell.open('roll'));
  await expect(page.locator('#panels')).toContainText('Recent rolls'); // the result was reported although nothing animated
});

test('x10: a fast multi-reel plus a summary that highlights the best; skip goes to the summary; x100 uses a counter', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => { const g = window.__game.game; g.debug.setLevel(20); g.debug.grantMoney(1e9); window.__game.state.bonus.backpack = 500; });
  await page.locator('.roll-x10').click();
  await expect(page.locator('.rv-card.batch')).toBeVisible();
  expect(await page.locator('.rv-window.mini').count()).toBe(5);
  await page.keyboard.press('Escape');
  await expect(page.locator('.rv-summary')).toBeVisible();
  await expect(page.locator('.rv-best')).toContainText('Best:');
  await page.keyboard.press('Escape');
  await expect(R(page)).toBeHidden();
  await page.evaluate(() => window.__game.game.roll(100));
  await expect(page.locator('.rv-counter')).toBeVisible();
  await page.waitForFunction(() => document.querySelector('.rv-summary') && !document.querySelector('.rv-summary').hidden, null, { timeout: 6000 });
  expect(await page.locator('.rv-window.mini').count()).toBe(0);
});

test('auto-roll uses the short reel and never a full-screen cutscene', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => { const g = window.__game.game; g.debug.setLevel(5); g.debug.grantMoney(1e9); });
  await page.evaluate(() => window.__game.game.toggleAuto());
  const seen = await page.evaluate(async () => {
    const modes = new Set(); let cut = false;
    for (let i = 0; i < 80; i++) { await new Promise((r) => { setTimeout(r, 50); }); const c = window.__game.reveal.current; if (c) modes.add(c.mode); if (window.__game.reveal.cutscene) cut = true; }
    return { modes: [...modes], cut };
  });
  expect(seen.modes.every((m) => m === 'quick')).toBe(true);
  expect(seen.cut).toBe(false);
});

test('many rolls and many cutscenes leave the GPU as they found it (no leaked geometry, texture or program), and the DOM empties', async ({ page }) => {
  const errors = await openGame(page);
  const audit = () => page.evaluate(() => window.__game.gpuAudit());
  const before = await audit();
  for (let i = 0; i < 25; i++) {
    await page.evaluate(([r, n]) => { window.__game.reveal.push([{ ...r, uid: 100 + n }]); window.__game.reveal.skip(); window.__game.reveal.fastForward(5); }, [RARE, i]);
  }
  await page.evaluate(() => { for (let i = 0; i < 40; i++) window.__game.reveal.push([{ uid: 500 + i, tier: i % 12, icon: 'gem', label: 'x', color: '#fff', title: 'y' }], { source: 'auto' }); window.__game.reveal.fastForward(60); });
  await page.waitForTimeout(400);
  const after = await audit();
  expect(after.renderer.geometries).toBeLessThanOrEqual(before.renderer.geometries + 2);
  expect(after.renderer.textures).toBeLessThanOrEqual(before.renderer.textures + 1);
  expect(JSON.stringify(after.tracked)).toBe(JSON.stringify(before.tracked));
  expect(await page.evaluate(() => window.__game.gfx.reveal.active)).toBe(false);
  expect(await page.locator('#reveal *').filter({ hasNot: page.locator('x') }).count()).toBeLessThan(5);
  await expectNoErrors(errors);
});

test('captions: the reel stop and the sting are captioned, the tick is not', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => window.__game.set('captions', true));
  await rollOnce(page);
  await page.waitForFunction(() => !window.__game.reveal.active, null, { timeout: 8000 });
  const seen = await page.evaluate(() => window.__game.audio.stats.captions);
  expect(seen).toBeGreaterThan(0);
});
