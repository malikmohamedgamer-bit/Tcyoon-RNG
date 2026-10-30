import { test, expect } from '@playwright/test';
import { openGame, expectNoErrors } from './helpers.js';

const bagCount = (page) => page.evaluate(() => window.__game.state.bag.length);

test('roll: the free roll lands an item in the backpack and the UI shows it', async ({ page }) => {
  const errors = await openGame(page);
  expect(await bagCount(page)).toBe(2); // starter kit
  await page.getByRole('button', { name: /Free roll/ }).click();
  expect(await bagCount(page)).toBe(3);
  await page.getByRole('button', { name: /Backpack/ }).first().click();
  await expect(page.locator('#panels')).toContainText('Backpack');
  await expect(page.locator('#panels article.item')).toHaveCount(3);
  await expectNoErrors(errors);
});

test('a paid roll lowers the balance by exactly the roll price', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => { window.__game.state.freeRoll.count = 0; });
  const before = await page.evaluate(() => window.__game.state.money.toNumber());
  await page.getByRole('button', { name: /Roll — \$10/ }).click();
  const after = await page.evaluate(() => window.__game.state.money.toNumber());
  expect(before - after).toBeCloseTo(10, 5);
});

test('backpack limit blocks a roll with a clear message and a one-click sell-duplicates', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => { window.__game.debug.fillBag(); window.__game.state.freeRoll.count = 0; });
  await expect(page.locator('#panels')).toContainText('Backpack full');
  await expect(page.getByRole('button', { name: /Roll — / }).first()).toBeDisabled();
  const full = await bagCount(page);
  await page.getByRole('button', { name: 'Sell duplicates' }).first().click();
  expect(await bagCount(page)).toBeLessThan(full);
  await expect(page.getByRole('button', { name: /Roll — / }).first()).toBeEnabled();
});

test('sell an item: it leaves the backpack and money goes up', async ({ page }) => {
  await openGame(page);
  await page.getByRole('button', { name: /Backpack/ }).first().click();
  const before = await page.evaluate(() => window.__game.state.money.toNumber());
  await page.locator('#panels article.item').first().getByRole('button', { name: /Sell/ }).click();
  expect(await bagCount(page)).toBe(1);
  expect(await page.evaluate(() => window.__game.state.money.toNumber())).toBeGreaterThan(before);
});

test('fuse: select 3 same-tier items, fuse, inputs are consumed', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => { for (let i = 0; i < 3; i++) window.__game.debug.giveItem('belt', 2); });
  await page.getByRole('button', { name: /Backpack/ }).first().click();
  const fuseBtn = page.getByRole('button', { name: /^Fuse \d+ selected/ });
  await expect(fuseBtn).toBeDisabled();
  const boxes = page.locator('#panels article.item', { hasText: 'Rare Belt' }).getByRole('checkbox');
  await expect(boxes).toHaveCount(3);
  for (let i = 0; i < 3; i++) await boxes.nth(i).check();
  await expect(fuseBtn).toBeEnabled();
  await expect(fuseBtn).toContainText('45%');
  const before = await bagCount(page);
  await fuseBtn.click();
  expect(await bagCount(page)).toBe(before - 2);
  expect(await page.evaluate(() => window.__game.state.stats.fused)).toBe(1);
});

test('level up: xp from rolling raises the level and shows a toast', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => window.__game.debug.grantMoney(1e6));
  await page.getByRole('button', { name: /Free roll/ }).click();
  const lvl0 = await page.evaluate(() => window.__game.state.level);
  for (let i = 0; i < 80; i++) {
    await page.evaluate(() => { const g = window.__game.game; const r = g.roll(1); if (r.rolled[0]) g.sell(r.rolled[0].uid); });
    if ((await page.evaluate(() => window.__game.state.level)) > lvl0) break;
  }
  expect(await page.evaluate(() => window.__game.state.level)).toBeGreaterThan(lvl0);
  await expect(page.locator('#toasts')).toContainText(/Level \d+!/);
});

test('reload keeps the backpack, money and level', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => { window.__game.debug.giveItem('amp', 5, [['golden', 1]]); window.__game.debug.grantMoney(777); window.__game.saveNow(); });
  const snap = await page.evaluate(() => ({ bag: window.__game.state.bag.length, money: window.__game.state.money.toNumber() }));
  await page.reload();
  await page.waitForFunction(() => window.__game && window.__game.loop.frames > 2);
  const after = await page.evaluate(() => ({ bag: window.__game.state.bag.length, money: window.__game.state.money.toNumber(), mut: window.__game.state.items[window.__game.state.bag.at(-1)].mut }));
  expect(after.bag).toBe(snap.bag);
  expect(Math.abs(after.money - snap.money)).toBeLessThan(0.01);
  expect(after.mut).toEqual([['golden', 1]]);
});
