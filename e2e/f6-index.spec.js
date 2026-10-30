import { test, expect } from '@playwright/test';
import { openGame, expectNoErrors } from './helpers.js';

const open = (page) => page.evaluate(() => window.__game.shell.open('index'));
const rows = (page) => page.locator('#panels .vrow');

test('Index: sections with completion, silhouettes with a hint for what is missing, full details for what is found', async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => window.__game.game.debug.giveItem('gem_forge', 5));
  await open(page);
  await expect(page.getByRole('heading', { name: /Index/ })).toBeVisible();
  for (const name of ['Items', 'Rarities', 'Mutations', 'Weapons', 'Monsters', 'Bosses']) await expect(page.locator('.tab', { hasText: name })).toBeVisible();
  const found = rows(page).filter({ hasText: 'Gem Forge' });
  await expect(found).toContainText('Mythic');
  await expect(found).toContainText('of rolls are this item');
  await expect(found).toContainText(/Found 1× · first/);
  const locked = rows(page).filter({ hasText: '???' }).first();
  await expect(locked).toContainText('you get by rolling');
  // a locked entry reveals nothing: its name is not in the page
  const text = await page.locator('#panels').innerText();
  expect(text).not.toContain('Star Mine');
  await expectNoErrors(errors);
});

test('a new discovery shows a toast and fills the entry in; the same item again is not a discovery', async ({ page }) => {
  await openGame(page);
  await open(page);
  await expect(rows(page).filter({ hasText: 'Star Mine' })).toHaveCount(0);
  await page.evaluate(() => window.__game.game.debug.giveItem('star_mine', 2));
  await expect(page.locator('#toasts')).toContainText('New in the Index: Star Mine');
  await expect(rows(page).filter({ hasText: 'Star Mine' })).toHaveCount(1);
  await page.waitForTimeout(3300);
  await page.evaluate(() => window.__game.game.debug.giveItem('star_mine', 2));
  await page.waitForTimeout(400);
  await expect(page.locator('#toasts')).not.toContainText('Star Mine');
  await expect(rows(page).filter({ hasText: 'Star Mine' })).toContainText('Found 2×');
});

test('search and filters work in the UI and the result count is announced', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => { const g = window.__game.game; g.debug.giveItem('gem_forge', 3); g.debug.giveItem('ore_pump', 1); window.__game.state.index.items.gem_forge.th = 'space'; });
  await open(page);
  await page.getByRole('searchbox', { name: 'Search this section' }).fill('gem');
  await expect(rows(page)).toHaveCount(1);
  await expect(page.locator('#panels [role="status"]').filter({ hasText: 'match your filters' })).toContainText('1 entry');
  await page.getByRole('searchbox', { name: 'Search this section' }).fill('');
  await page.locator('summary', { hasText: 'Filters' }).click();
  await page.locator('select[data-key="theme"]').selectOption('space');
  await expect(rows(page)).toHaveCount(1);
  await page.locator('select[data-key="theme"]').selectOption('');
  await page.locator('select[data-key="status"]').selectOption('missing');
  expect(await rows(page).count()).toBeGreaterThan(5);
  await expect(rows(page).filter({ hasText: 'Gem Forge' })).toHaveCount(0);
  await page.locator('select[data-key="status"]').selectOption('');
  await page.locator('select[data-key="type"]').selectOption('seller');
  const names = await rows(page).locator('b').allInnerTexts();
  expect(names.length).toBeGreaterThan(0);
});

test('endless content stays light: 20,000 discovered mutations are in a virtual list with a tiny DOM, and scrolling shows later entries', async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => { const m = window.__game.state.index.mutations; for (let i = 0; i < 20000; i++) m['g:' + i] = { n: 1, first: Date.now(), th: 'factory' }; });
  await open(page);
  await page.locator('.tab', { hasText: 'Mutations' }).click();
  await expect(page.locator('#panels [role="status"]').filter({ hasText: 'entries' })).toContainText('20016');
  const domRows = await rows(page).count();
  expect(domRows).toBeGreaterThan(5);
  expect(domRows).toBeLessThan(30);
  const nodes = await page.locator('#panels *').count();
  expect(nodes).toBeLessThan(900);
  expect(await rows(page).first().getAttribute('aria-setsize')).toBe('20016');
  // scroll to the middle of the list
  await page.locator('[data-scroll="index"]').evaluate((el) => { el.scrollTop = el.scrollHeight / 2; });
  await expect.poll(async () => (await rows(page).first().getAttribute('aria-posinset'))).not.toBe('1');
  const pos = Number(await rows(page).first().getAttribute('aria-posinset'));
  expect(pos).toBeGreaterThan(5000);
  expect(await rows(page).count()).toBeLessThan(30);
  await expect(page.locator('#panels')).not.toContainText('NaN');
  await expectNoErrors(errors);
});

test('endless rarities: a found generated rarity is listed after the 12 hand-made ones, followed by locked silhouettes', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => { const r = window.__game.state.index.rarities; for (const t of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 25]) r[String(t)] = { n: 1, first: Date.now(), th: 'factory' }; });
  await open(page);
  await page.locator('.tab', { hasText: 'Rarities' }).click();
  await page.locator('[data-scroll="index"]').evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await expect.poll(async () => (await page.locator('#panels .vrow.locked').count())).toBeGreaterThan(0);
  const last = rows(page).last();
  await expect(last).toContainText('???');
  expect(await page.locator('#panels .vrow:not(.locked)').filter({ hasText: /Tier 25/ }).count()).toBe(1);
});

test('completion rewards: claim appears at 25%, pays once, survives a reload, and the dock shows how many are waiting', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => { const g = window.__game.game; for (const t of ['ore_pump', 'gem_forge', 'slime_vat', 'star_mine', 'roller', 'hyperlane']) g.debug.giveItem(t, 1); });
  await expect(page.locator('#dock [data-panel="index"] .badge-n')).toHaveText('1');
  await open(page);
  const money0 = await page.evaluate(() => window.__game.state.money.toNumber());
  await page.getByRole('button', { name: 'Claim' }).first().click();
  expect(await page.evaluate(() => window.__game.state.money.toNumber())).toBeGreaterThan(money0);
  await expect(page.locator('#panels')).toContainText('claimed');
  await expect(page.locator('#dock [data-panel="index"] .badge-n')).toBeHidden();
  const money1 = await page.evaluate(() => window.__game.state.money.toNumber());
  expect(await page.evaluate(() => window.__game.game.index.claim('items:25').ok)).toBe(false);
  expect(await page.evaluate(() => window.__game.state.money.toNumber())).toBe(money1);
  await page.evaluate(() => window.__game.saveNow());
  await page.reload();
  await page.waitForFunction(() => window.__game && window.__game.loop.frames > 2);
  expect(await page.evaluate(() => window.__game.game.index.claim('items:25').ok)).toBe(false);
});

test('accessibility and layout: list semantics, keyboard-scrollable, no overflow on a phone', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await openGame(page);
  await open(page);
  const list = page.locator('[data-scroll="index"]');
  await expect(list).toHaveAttribute('role', 'list');
  await expect(list).toHaveAttribute('tabindex', '0');
  await expect(rows(page).first()).toHaveAttribute('role', 'listitem');
  await expect(rows(page).first()).toHaveAttribute('aria-posinset', '1');
  await expect(page.locator('#panels [role="progressbar"]').first()).toHaveAttribute('aria-valuenow', /\d+/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)).toBe(false);
  await list.focus();
  await page.keyboard.press('PageDown');
  await page.waitForTimeout(300);
  expect(await list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await page.screenshot({ path: 'docs/shots/f6-index-phone.png' });
  await ctx.close();
});
