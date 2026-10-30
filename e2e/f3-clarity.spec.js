import { test, expect } from '@playwright/test';
import { openGame, expectNoErrors } from './helpers.js';

const dockNames = (page) => page.locator('#dock button:visible').evaluateAll((els) => els.map((e) => e.textContent.replace(/NEW/g, '').replace(/[^A-Za-z ]/g, '').trim()));

test('tooltips: hover, keyboard focus and Esc on HUD terms; the popover is a real tooltip wired with aria-describedby', async ({ page }) => {
  const errors = await openGame(page);
  const luck = page.locator('#hud [data-tip="luck"]');
  await luck.hover();
  await expect(page.locator('#tooltip')).toBeVisible();
  await expect(page.locator('#tooltip')).toContainText('rarer items more likely');
  await expect(luck).toHaveAttribute('aria-describedby', 'tooltip');
  await page.mouse.move(600, 400);
  await expect(page.locator('#tooltip')).toBeHidden();
  await luck.focus();
  await expect(page.locator('#tooltip')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#tooltip')).toBeHidden();
  await expectNoErrors(errors);
});

test('tooltips on item cards: rarity, item type, mutation and stats explain themselves', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => { const g = window.__game.game; g.debug.giveItem('gem_forge', 4); });
  await page.getByRole('button', { name: /Backpack/ }).first().click();
  const card = page.locator('#panels article.item').last();
  await card.locator('.rar').focus();
  await expect(page.locator('#tooltip')).toContainText(/1 in .* rolls at luck/);
  await card.locator('[data-tip^="type:"]').focus();
  await expect(page.locator('#tooltip')).toContainText(/Makes units/);
  const stat = card.locator('.stats [data-tip]').first();
  await stat.hover();
  await expect(page.locator('#tooltip')).toBeVisible();
});

test('touch: tapping a term toggles its popover and tapping elsewhere closes it', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await openGame(page);
  await page.locator('#hud [data-tip="money"]').tap();
  await expect(page.locator('#tooltip')).toBeVisible();
  await expect(page.locator('#tooltip')).toContainText('Your coins');
  await page.waitForTimeout(500); // a second tap within 400 ms of the focus-triggered show is ignored on purpose
  await page.locator('#hud [data-tip="money"]').tap();
  await expect(page.locator('#tooltip')).toBeHidden();
  await page.locator('#hud [data-tip="luck"]').tap();
  await expect(page.locator('#tooltip')).toBeVisible();
  await page.mouse.click(200, 400);
  await expect(page.locator('#tooltip')).toBeHidden();
  await ctx.close();
});

test('"Why is my income this?": click the Income number; it lists each line, the multipliers in order, and blocked items', async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => {
    const g = window.__game.game;
    const s = window.__game.state;
    g.place(s.bag.find((u) => s.items[u].tpl === 'pebble_drill'), 1, 1, 0);
    g.place(s.bag.find((u) => s.items[u].tpl === 'stall'), 2, 1, 0);
    g.debug.giveItem('slime_vat', 0);
    g.place(s.bag.at(-1), 0, 3, 0); // faces nothing: blocked
    g.debug.grantMoney(500);
    g.buyUpgrade('income');
  });
  await page.locator('[data-chip="income"]').click();
  const panel = page.locator('#panels');
  await expect(panel).toContainText('Why is my income this?');
  await expect(panel).toContainText('Pebble Drill');
  await expect(panel).toContainText('Market Stall');
  await expect(panel).toContainText('Multipliers, in the order they are applied');
  await expect(panel).toContainText('×1.05');
  await expect(panel).toContainText('accepts units');
  await panel.getByRole('button', { name: 'show on base' }).first().click();
  await expect(page.getByRole('heading', { name: /Base/ }).first()).toBeVisible();
  await expectNoErrors(errors);
});

test('Help: opens with 9, is searchable, shows the rarity table and a worked rebirth example', async ({ page }) => {
  const errors = await openGame(page);
  await page.keyboard.press('Digit9');
  await expect(page.getByRole('heading', { name: /Help/ })).toBeVisible();
  const box = page.getByRole('searchbox', { name: 'Search the help' });
  await box.fill('pity');
  await expect(page.locator('#panels')).toContainText(/\d+ results? for/);
  await expect(page.locator('#panels details[data-help="rolling"]')).toBeVisible();
  await expect(page.locator('#panels details[data-help="rolling"]')).toContainText('1 in');
  await box.fill('zzzz');
  await expect(page.locator('#panels')).toContainText('Nothing matches');
  await box.fill('rebirth');
  await expect(page.locator('#panels')).toContainText(/Rebirth Points/);
  await expect(page.locator('#panels')).toContainText('Example: you finish a run with $4M');
  await expectNoErrors(errors);
});

test('undo: Z (and the Undo chip) reverses placing and selling; the window and the rules are visible', async ({ page }) => {
  const errors = await openGame(page);
  await page.getByRole('button', { name: /Backpack/ }).first().click();
  await page.locator('#panels article.item', { hasText: 'Pebble Drill' }).getByRole('button', { name: 'Place' }).click();
  const p = await page.evaluate(() => window.__game.cellScreen(1, 1));
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
  expect(await page.evaluate(() => Object.values(window.__game.state.items).filter((i) => i.loc === 'placed').length)).toBe(1);
  await expect(page.locator('.undo-chip')).toContainText('Undo: Placed');
  await page.keyboard.press('KeyZ');
  expect(await page.evaluate(() => Object.values(window.__game.state.items).filter((i) => i.loc === 'placed').length)).toBe(0);
  await expect(page.locator('.undo-chip')).toBeHidden();
  // sell then undo with the chip
  await page.evaluate(() => window.__game.shell.open('backpack'));
  const money0 = await page.evaluate(() => window.__game.state.money.toNumber());
  await page.locator('#panels article.item', { hasText: 'Market Stall' }).getByRole('button', { name: /^Sell/ }).click();
  await expect(page.locator('.undo-chip')).toContainText('Undo: Sold');
  expect(await page.evaluate(() => window.__game.state.money.toNumber())).toBeGreaterThan(money0);
  await page.locator('.undo-chip').click();
  expect(await page.evaluate(() => window.__game.state.money.toNumber())).toBeCloseTo(money0, 6);
  await expect(page.locator('#panels article.item', { hasText: 'Market Stall' })).toBeVisible();
  await expectNoErrors(errors);
});

test('progressive disclosure: a new player sees only Roll, Backpack, Base, Help, Settings; Shop appears at level 2 with a NEW badge; Advanced UI shows everything', async ({ page }) => {
  const errors = await openGame(page, { simpleUI: true });
  expect(await dockNames(page)).toEqual(['Roll', 'Backpack', 'Base', 'Help', 'Settings']);
  await expect(page.locator('#hud [data-chip="luck"]')).toBeHidden();
  await page.evaluate(() => window.__game.game.debug.setLevel(2));
  await page.evaluate(() => window.__game.game.step(1.1)); // the once-a-second unlock check
  await expect(page.locator('#dock [data-panel="shop"]')).toBeVisible();
  await expect(page.locator('#dock [data-panel="shop"]')).toHaveClass(/is-new/);
  await expect(page.locator('#toasts')).toContainText('Shop unlocked');
  await page.locator('#dock [data-panel="shop"]').click();
  await expect(page.locator('#dock [data-panel="shop"]')).not.toHaveClass(/is-new/);
  expect(await dockNames(page)).not.toContain('Combat');
  await page.getByRole('button', { name: /Settings/ }).first().click();
  await page.locator('summary', { hasText: 'Interface layout' }).evaluate((el) => { el.parentElement.open = true; });
  await page.getByLabel(/Advanced UI/).check();
  expect(await dockNames(page)).toEqual(expect.arrayContaining(['Combat', 'Refinery', 'Rebirth', 'Shop']));
  await expectNoErrors(errors);
});

test('blocked actions explain themselves and offer a fix: not enough money, fuse without matching items', async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => { const s = window.__game.state; s.money = s.money.mul(0); s.freeRoll.count = 0; });
  await page.evaluate(() => window.__game.shell.open('roll'));
  await expect(page.locator('#panels')).toContainText(/Need \$.* more/);
  await page.getByRole('button', { name: 'Open the Base' }).click();
  await expect(page.getByRole('heading', { name: /Base/ }).first()).toBeVisible();
  await page.evaluate(() => { const g = window.__game.game; for (let i = 0; i < 3; i++) g.debug.giveItem('belt', 2); });
  await page.evaluate(() => window.__game.shell.open('backpack'));
  await page.getByRole('button', { name: /Select 3\+ matching items for me/ }).click();
  await expect(page.getByRole('button', { name: /^Fuse 3 selected/ })).toBeEnabled();
  await expectNoErrors(errors);
});

test('friendly numbers by default: $12,345 below a million, suffixes above; larger default text on phones', async ({ page, browser }) => {
  await openGame(page);
  await page.evaluate(() => { const s = window.__game.state; s.money = s.money.mul(0).add(12345); });
  await expect(page.locator('[data-bind="money"]')).toHaveText('$12,345');
  await page.evaluate(() => { const s = window.__game.state; s.money = s.money.mul(0).add(1234567); });
  await expect(page.locator('[data-bind="money"]')).toHaveText('$1.23M');
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
  const phone = await ctx.newPage();
  await openGame(phone);
  const sizes = await Promise.all([page, phone].map((p) => p.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize))));
  expect(sizes[1]).toBeGreaterThan(sizes[0]);
  await ctx.close();
});

test('a focused tooltip term keeps keyboard focus (and its tooltip) when the panel re-renders', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => { window.__game.game.debug.giveItem('gem_forge', 3); window.__game.shell.open('backpack'); });
  const term = page.locator('#panels article.item').last().locator('.stats [data-tip]').first();
  await page.evaluate(() => { const el = [...document.querySelectorAll('#panels article.item')].at(-1).querySelector('.rar'); el.focus(); });
  await expect(page.locator('#tooltip')).toBeVisible();
  await page.evaluate(() => { window.__game.game.debug.grantMoney(5); window.__game.shell.refresh(); }); // forces a different render
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('rar'))).toBe(true);
  void term;
});
