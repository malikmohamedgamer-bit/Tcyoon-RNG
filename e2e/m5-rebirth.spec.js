import { test, expect } from '@playwright/test';
import { openGame, expectNoErrors } from './helpers.js';

test('rebirth: button locked until enough progress, confirm dialog warns, cancel keeps everything', async ({ page }) => {
  const errors = await openGame(page);
  await page.getByRole('button', { name: /Rebirth/ }).first().click();
  const btn = page.getByRole('button', { name: /Rebirth for \+/ });
  await expect(btn).toBeDisabled();
  await page.evaluate(() => { const g = window.__game.game; g.place(g.state.bag[0], 1, 1); g.debug.grantMoney(5e6); });
  await expect(btn).toBeEnabled();
  await expect(btn).toContainText('+2');
  await btn.click();
  const dlg = page.getByRole('alertdialog');
  await expect(dlg).toContainText('You will lose');
  await expect(dlg).toContainText('You keep');
  await dlg.getByRole('button', { name: 'Cancel' }).click();
  await expect(dlg).toHaveCount(0);
  expect(await page.evaluate(() => window.__game.state.region)).toBe(0);
  // Escape also cancels
  await btn.click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect(await page.evaluate(() => window.__game.state.region)).toBe(0);
  await expectNoErrors(errors);
});

test('rebirth: confirm resets the run, grants currency, switches the region theme, tree purchase works', async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => { const g = window.__game.game; g.place(g.state.bag[0], 1, 1); g.debug.grantMoney(5e6); window.__game.shell.open('rebirth'); });
  const themeBefore = await page.evaluate(() => window.__game.gfx.scene.background.getHexString());
  await page.getByRole('button', { name: /Rebirth for \+/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: /Rebirth now/ }).click();
  const s = await page.evaluate(() => ({ region: window.__game.state.region, pts: window.__game.state.layers[0].currency.toNumber(), placed: Object.values(window.__game.state.items).filter((i) => i.loc === 'placed').length, money: window.__game.state.money.toNumber(), level: window.__game.state.level }));
  expect(s.region).toBe(1);
  expect(s.pts).toBe(2);
  expect(s.placed).toBe(0);
  expect(s.money).toBeLessThan(1000);
  await expect(page.locator('#toasts')).toContainText('Region 2');
  await page.waitForTimeout(500);
  const themeAfter = await page.evaluate(() => window.__game.gfx.scene.background.getHexString());
  expect(themeAfter).not.toBe(themeBefore); // new region, new sky colour
  await page.getByRole('button', { name: /Buy 1 / }).first().click(); // Efficient Drills costs 1
  expect(await page.evaluate(() => window.__game.state.layers[0].tree['L0-income'])).toBe(1);
  expect(await page.evaluate(() => window.__game.state.layers[0].currency.toNumber())).toBe(1);
  await expectNoErrors(errors);
});

test('layers are endless in the UI: a high layer shows its generated name and tree', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    const s = window.__game.state;
    const mk = () => ({ count: 1, currency: s.money.mul(0).add(5), total: s.money.mul(0).add(5), run: s.money.mul(0), tree: {} });
    while (s.layers.length < 8) s.layers.push(mk());
    window.__game.shell.open('rebirth');
  });
  await expect(page.locator('#panels section.card')).toHaveCount(9);
  await expect(page.locator('#panels')).toContainText('layer 9');
});

test('reload keeps rebirth progress', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => { const g = window.__game.game; g.debug.grantMoney(5e6); g.prestige(0, { confirmed: true }); window.__game.saveNow(); });
  await page.reload();
  await page.waitForFunction(() => window.__game && window.__game.loop.frames > 2);
  const s = await page.evaluate(() => ({ region: window.__game.state.region, pts: window.__game.state.layers[0].currency.toNumber() }));
  expect(s).toEqual({ region: 1, pts: 2 });
});
