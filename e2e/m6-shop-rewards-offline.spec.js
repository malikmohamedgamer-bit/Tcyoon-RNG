import { test, expect } from '@playwright/test';
import { openGame, expectNoErrors } from './helpers.js';

test('buying in the shop lowers the balance by the shown price and applies the upgrade', async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => window.__game.game.debug.grantMoney(5000));
  await page.getByRole('button', { name: /Shop/ }).first().click();
  const before = await page.evaluate(() => window.__game.state.money.toNumber());
  await page.getByText('Luck', { exact: false }).first().waitFor();
  await page.locator('li.shop-item', { hasText: 'Luck Charm' }).getByRole('button', { name: /^Buy \$200$/ }).click(); // Luck Charm (20 x $10)
  const after = await page.evaluate(() => window.__game.state.money.toNumber());
  expect(before - after).toBeCloseTo(200, 5);
  expect(await page.evaluate(() => window.__game.state.upgrades.luckCharm)).toBe(1);
  expect(await page.evaluate(() => window.__game.game.state.money.isNegative())).toBe(false);
  await expect(page.locator('.top, #hud')).toContainText('×1.25');
  await expectNoErrors(errors);
});

test('cannot overspend: a purchase beyond the balance is refused and money stays >= 0', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => { window.__game.state.money = window.__game.state.money.mul(0).add(5); });
  const r = await page.evaluate(() => window.__game.game.buyUpgrade('income'));
  expect(r.ok).toBe(false);
  expect(await page.evaluate(() => window.__game.state.money.toNumber())).toBe(5);
  await page.getByRole('button', { name: /Shop/ }).first().click();
  await expect(page.getByRole('button', { name: /^Buy \$/ }).first()).toBeDisabled();
});

test('daily reward is granted exactly once (also after a reload)', async ({ page }) => {
  await openGame(page);
  await page.getByRole('button', { name: /Rewards/ }).first().click();
  const money0 = await page.evaluate(() => window.__game.state.money.toNumber());
  const btn = page.getByRole('button', { name: /Claim today/ });
  await expect(btn).toBeEnabled();
  await btn.click();
  const money1 = await page.evaluate(() => window.__game.state.money.toNumber());
  expect(money1).toBeGreaterThan(money0);
  await expect(page.getByRole('button', { name: /Claimed — come back tomorrow/ })).toBeDisabled();
  expect((await page.evaluate(() => window.__game.game.claimDaily())).ok).toBe(false);
  await page.evaluate(() => window.__game.saveNow());
  await page.reload();
  await page.waitForFunction(() => window.__game && window.__game.loop.frames > 2);
  expect((await page.evaluate(() => window.__game.game.claimDaily())).ok).toBe(false);
  const money2 = await page.evaluate(() => window.__game.state.money.toNumber());
  expect(Math.abs(money2 - money1)).toBeLessThan(5); // only a few seconds of income at most
});

test('quest: claimable when finished, granted once, UI shows Claimed', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => { window.__game.state.stats.rolls = 12; });
  await page.getByRole('button', { name: /Rewards/ }).first().click();
  const quest = page.locator('li.quest', { hasText: 'Warm-up' });
  await expect(quest.getByRole('button', { name: 'Claim' })).toBeEnabled();
  const m0 = await page.evaluate(() => window.__game.state.money.toNumber());
  await quest.getByRole('button', { name: 'Claim' }).click();
  expect(await page.evaluate(() => window.__game.state.money.toNumber())).toBeGreaterThan(m0);
  await expect(quest.getByRole('button', { name: /Claimed/ })).toBeDisabled();
  const m1 = await page.evaluate(() => window.__game.state.money.toNumber());
  expect((await page.evaluate(() => window.__game.game.claimTask('roll10'))).ok).toBe(false);
  expect(Math.abs((await page.evaluate(() => window.__game.state.money.toNumber())) - m1)).toBeLessThan(1);
  expect(await page.locator('li.quest').count()).toBeGreaterThan(30);
});

test('offline progress is applied on load and the welcome-back screen reports it', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    const g = window.__game.game;
    g.place(g.state.bag[0], 1, 1, 0);
    g.place(g.state.bag[0], 2, 1, 0);
    window.__game.saveNow();
    // pretend the save is 3 hours old
    const raw = JSON.parse(localStorage.getItem('tcyoon-rng:save'));
    raw.savedAt = Date.now() - 3 * 3600 * 1000;
    raw.money = 'b0,0,0,0';
    localStorage.setItem('tcyoon-rng:save', JSON.stringify(raw));
    window.__game.game.saveNow = () => true; // the old page must not overwrite the faked save when it unloads
  });
  await page.reload();
  await page.waitForFunction(() => window.__game && window.__game.loop.frames > 2);
  const dlg = page.getByRole('alertdialog');
  await expect(dlg).toContainText('Welcome back');
  await expect(dlg).toContainText('3h 0m');
  const money = await page.evaluate(() => window.__game.state.money.toNumber());
  expect(money).toBeGreaterThan(1.3 * 3 * 3600 * 0.99);
  expect(money).toBeLessThan(1.3 * 3 * 3600 * 1.02 + 50);
  await dlg.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('a save from the future (clock moved back) gives nothing and says so', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    window.__game.saveNow();
    const raw = JSON.parse(localStorage.getItem('tcyoon-rng:save'));
    raw.savedAt = Date.now() + 5 * 3600 * 1000;
    localStorage.setItem('tcyoon-rng:save', JSON.stringify(raw));
    window.__game.game.saveNow = () => true;
  });
  await page.reload();
  await page.waitForFunction(() => window.__game && window.__game.loop.frames > 2);
  await expect(page.getByRole('alertdialog')).toContainText('clock appears to have moved backwards');
});
