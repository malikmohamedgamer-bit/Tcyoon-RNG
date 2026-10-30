import { test, expect } from '@playwright/test';
import { openGame, expectNoErrors } from './helpers.js';

const cellScreen = (page, x, y) => page.evaluate(([cx, cy]) => window.__game.cellScreen(cx, cy), [x, y]);
const income = (page) => page.evaluate(() => window.__game.game.income.toNumber());
const placedAt = (page, x, y) => page.evaluate(([cx, cy]) => { const it = Object.values(window.__game.state.items).find((i) => i.loc === 'placed' && i.x === cx && i.y === cy); return it ? { tpl: it.tpl, dir: it.dir } : null; }, [x, y]);

async function placeFromBackpack(page, tpl, cell) {
  await page.getByRole('button', { name: /Backpack/ }).first().click();
  const card = page.locator('#panels article.item', { hasText: tpl }).first();
  await card.getByRole('button', { name: 'Place' }).click();
  const p = await cellScreen(page, cell[0], cell[1]);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
}

test('select an item, see a ghost with validity text, click to place; income rises from 0', async ({ page }) => {
  const errors = await openGame(page);
  expect(await income(page)).toBe(0);
  await page.getByRole('button', { name: /Backpack/ }).first().click();
  await page.locator('#panels article.item', { hasText: 'Pebble Drill' }).getByRole('button', { name: 'Place' }).click();
  // hover a valid tile: label says it is valid (text, not just colour)
  const p0 = await cellScreen(page, 1, 1);
  await page.mouse.move(p0.x, p0.y);
  await expect(page.locator('#ghost-label')).toContainText('Place here');
  await expect(page.locator('#ghost-label svg.ico-check')).toBeVisible(); // a check mark shape, not only colour
  await page.mouse.click(p0.x, p0.y);
  expect(await placedAt(page, 1, 1)).toEqual({ tpl: 'pebble_drill', dir: 0 });
  expect(await income(page)).toBe(0); // dropper alone: nothing cashes out
  // blocked marker is reported in the base panel
  await page.getByRole('button', { name: /Base/ }).first().click();
  await expect(page.locator('#panels')).toContainText('blocked');
  // place the seller right in front of the dropper (east)
  await placeFromBackpack(page, 'Market Stall', [2, 1]);
  expect(await placedAt(page, 2, 1)).toMatchObject({ tpl: 'stall' });
  expect(await income(page)).toBeCloseTo(1.3, 6);
  await expectNoErrors(errors);
});

test('invalid placement shows a cross + reason text and does not place', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => { const g = window.__game.game; const u = g.state.bag[0]; g.place(u, 3, 3); });
  await page.getByRole('button', { name: /Backpack/ }).first().click();
  await page.locator('#panels article.item', { hasText: 'Market Stall' }).getByRole('button', { name: 'Place' }).click();
  const p = await cellScreen(page, 3, 3);
  await page.mouse.move(p.x, p.y);
  await expect(page.locator('#ghost-label')).toContainText('Cell is occupied');
  await expect(page.locator('#ghost-label svg.ico-cross')).toBeVisible(); // a cross shape plus the reason text
  await page.mouse.click(p.x, p.y);
  await expect(page.locator('#toasts')).toContainText('Cell is occupied');
  expect(await page.evaluate(() => Object.values(window.__game.state.items).filter((i) => i.loc === 'placed').length)).toBe(1);
});

test('rotate with R while placing, then the item faces the chosen way', async ({ page }) => {
  await openGame(page);
  await page.getByRole('button', { name: /Backpack/ }).first().click();
  await page.locator('#panels article.item', { hasText: 'Pebble Drill' }).getByRole('button', { name: 'Place' }).click();
  await page.keyboard.press('r');
  await page.keyboard.press('r');
  const p = await cellScreen(page, 2, 2);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
  expect(await placedAt(page, 2, 2)).toEqual({ tpl: 'pebble_drill', dir: 2 });
  // selected item: R rotates it again
  await page.keyboard.press('r');
  expect((await placedAt(page, 2, 2)).dir).toBe(3);
});

test('drag a placed item to move it, and drag onto another to swap', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => { const g = window.__game.game; g.place(g.state.bag[0], 1, 1); g.place(g.state.bag[0], 4, 4); });
  const a = await cellScreen(page, 1, 1);
  const b = await cellScreen(page, 3, 1);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await expect(page.locator('#ghost-label')).toContainText('Move here');
  await page.mouse.up();
  expect(await placedAt(page, 3, 1)).toMatchObject({ tpl: 'pebble_drill' });
  expect(await placedAt(page, 1, 1)).toBeNull();
  // swap
  const c = await cellScreen(page, 4, 4);
  await page.mouse.move(b.x, b.y);
  await page.mouse.down();
  await page.mouse.move((b.x + c.x) / 2, (b.y + c.y) / 2, { steps: 4 });
  await page.mouse.move(c.x, c.y, { steps: 4 });
  await expect(page.locator('#ghost-label')).toContainText('Swap here');
  await page.mouse.up();
  expect(await placedAt(page, 4, 4)).toMatchObject({ tpl: 'pebble_drill' });
  expect(await placedAt(page, 3, 1)).toMatchObject({ tpl: 'stall' });
});

test('sell a placed item with X, pick up with Delete', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => { const g = window.__game.game; g.place(g.state.bag[0], 1, 1); g.place(g.state.bag[0], 2, 2); });
  const a = await cellScreen(page, 1, 1);
  await page.mouse.click(a.x, a.y);
  const before = await page.evaluate(() => window.__game.state.money.toNumber());
  await page.keyboard.press('x');
  expect(await placedAt(page, 1, 1)).toBeNull();
  expect(await page.evaluate(() => window.__game.state.money.toNumber())).toBeGreaterThan(before);
  const b = await cellScreen(page, 2, 2);
  await page.mouse.click(b.x, b.y);
  await page.keyboard.press('Delete');
  expect(await placedAt(page, 2, 2)).toBeNull();
  expect(await page.evaluate(() => window.__game.state.bag.length)).toBe(1);
});

test('income actually accrues over simulated time and buying (expanding the base) lowers the balance', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => { const g = window.__game.game; g.place(g.state.bag[0], 1, 1, 0); g.place(g.state.bag[0], 2, 1, 0); });
  const m0 = await page.evaluate(() => window.__game.state.money.toNumber());
  await page.evaluate(() => window.__game.game.debug.advance(100));
  const m1 = await page.evaluate(() => window.__game.state.money.toNumber());
  expect(m1 - m0).toBeGreaterThan(125); // 1.3/s * 100s
  await page.getByRole('button', { name: /Base/ }).first().click();
  await page.getByRole('button', { name: /Expand base/ }).click();
  const m2 = await page.evaluate(() => window.__game.state.money.toNumber());
  expect(m1 - m2).toBeGreaterThan(140);
  expect(await page.evaluate(() => window.__game.state.base.side)).toBe(7);
});

test('presets: save a layout, rearrange, load it back from the UI', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => { const g = window.__game.game; g.place(g.state.bag[0], 1, 1, 0); g.place(g.state.bag[0], 2, 1, 0); });
  await page.getByRole('button', { name: /Base/ }).first().click();
  await page.getByPlaceholder('Preset name').fill('Starter lane');
  await page.getByRole('button', { name: 'Save layout' }).click();
  await expect(page.locator('#panels')).toContainText('Starter lane');
  await page.evaluate(() => { const g = window.__game.game; const items = Object.values(g.state.items); g.place(items[0].uid, 4, 4); });
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  expect(await placedAt(page, 1, 1)).toMatchObject({ tpl: 'pebble_drill' });
});

test('reload keeps placed items and the income', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => { const g = window.__game.game; g.place(g.state.bag[0], 1, 1, 0); g.place(g.state.bag[0], 2, 1, 0); window.__game.saveNow(); });
  await page.reload();
  await page.waitForFunction(() => window.__game && window.__game.loop.frames > 2);
  expect(await placedAt(page, 2, 1)).toMatchObject({ tpl: 'stall' });
  expect(await income(page)).toBeCloseTo(1.3, 6);
});

test('GPU audit: re-laying out the base many times does not leak geometries, textures or programs', async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => { const d = window.__game.game.debug; d.grantMoney(1e9); for (const t of ['ore_pump', 'gem_forge', 'amp', 'tuner', 'bazaar', 'dynamo']) d.giveItem(t, 3, [['golden', 1]]); window.__game.game.autoPlace(); });
  await page.waitForTimeout(400);
  const before = await page.evaluate(() => window.__game.gpuAudit());
  for (let i = 0; i < 25; i++) {
    await page.evaluate((n) => { const g = window.__game.game; g.autoPlace(); if (n % 5 === 0) g.expand(); }, i);
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => window.__game.gpuAudit());
  expect(after.renderer.geometries).toBeLessThanOrEqual(before.renderer.geometries + 2);
  expect(after.renderer.textures).toBeLessThanOrEqual(before.renderer.textures + 1);
  expect(after.renderer.programs).toBeLessThanOrEqual(before.renderer.programs + 2);
  expect(after.tracked.geometries).toBeLessThanOrEqual(before.tracked.geometries + 1);
  await expectNoErrors(errors);
});
