import { test, expect } from '@playwright/test';
import { openGame, expectNoErrors } from './helpers.js';

test('level-up grants the level reward once, shows it, and a reload cannot grant it again', async ({ page }) => {
  const errors = await openGame(page);
  await expect(page.locator('#panels')).toContainText('Level 2 reward');
  const before = await page.evaluate(() => ({ money: window.__game.state.money.toNumber(), free: window.__game.state.freeRoll.count }));
  await page.evaluate(() => window.__game.game.debug.grantXp(1e6)); // jumps several levels at once
  const lvl = await page.evaluate(() => window.__game.state.level);
  expect(lvl).toBeGreaterThanOrEqual(5);
  const claimed = await page.evaluate(() => window.__game.state.rewards.levelClaimed);
  expect(claimed).toBe(lvl);
  await expect(page.locator('#toasts')).toContainText(/reward/);
  const after = await page.evaluate(() => ({ money: window.__game.state.money.toNumber(), bag: window.__game.state.bag.length, backpackBonus: window.__game.state.bonus.backpack }));
  expect(after.money).toBeGreaterThan(before.money);
  expect(after.backpackBonus).toBeGreaterThanOrEqual(2);
  await page.evaluate(() => window.__game.saveNow());
  await page.reload();
  await page.waitForFunction(() => window.__game && window.__game.loop.frames > 2);
  const reloaded = await page.evaluate(() => ({ level: window.__game.state.level, claimed: window.__game.state.rewards.levelClaimed, money: window.__game.state.money.toNumber(), bag: window.__game.state.bag.length }));
  expect(reloaded.level).toBe(lvl);
  expect(reloaded.claimed).toBe(lvl);
  expect(Math.abs(reloaded.money - after.money)).toBeLessThan(1);
  expect(reloaded.bag).toBe(after.bag);
  await expectNoErrors(errors);
});

test('level 3 unlocks auto-roll in the UI and it rolls on its own', async ({ page }) => {
  await openGame(page);
  await expect(page.getByText(/Auto-roll\s+Lv 3/)).toBeVisible();
  await page.evaluate(() => { const d = window.__game.game.debug; d.grantMoney(1e5); d.grantXp(200); });
  expect(await page.evaluate(() => window.__game.state.level)).toBeGreaterThanOrEqual(3);
  await page.getByLabel('Auto-roll').check();
  const rolls0 = await page.evaluate(() => window.__game.state.stats.rolls);
  await page.evaluate(() => window.__game.game.debug.advance(6));
  const rolls1 = await page.evaluate(() => window.__game.state.stats.rolls);
  expect(rolls1 - rolls0).toBeGreaterThanOrEqual(5);
});
