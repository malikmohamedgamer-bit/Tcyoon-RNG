import { test, expect } from '@playwright/test';
import { openGame, expectNoErrors } from './helpers.js';

const stepId = (page) => page.evaluate(() => window.__game.game.tutorial.step?.id ?? null);
const waitStep = async (page, id) => { await expect.poll(() => stepId(page), { timeout: 8000, message: `waiting for step ${id}` }).toBe(id); };

/** Click whatever the spotlight ring is around (the centre of the ring). */
async function clickRing(page) {
  const sid0 = await stepId(page);
  await expect(page.locator(`.tut-card[data-step="${sid0}"]`), `card for step ${sid0}`).toBeVisible(); // ring is positioned for this step
  await expect(page.locator('.tut-ring'), `ring visible on step ${sid0}`).toBeVisible();
  // wait until the ring sits on something clickable (it first falls back to a panel header while a panel renders)
  await expect.poll(() => page.evaluate(() => {
    const r = document.querySelector('.tut-ring').getBoundingClientRect();
    const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return !!(el && el.closest('button:not([disabled]), article.item, #view, [data-tut], input'));
  }), { message: `ring on clickable for step ${sid0}` }).toBe(true);
  const box = await page.locator('.tut-ring').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

/** Click the lit tile: wait until the ring has moved from the Place button onto the 3D view first. */
async function clickTile(page) {
  const sid = await stepId(page);
  await expect.poll(() => page.evaluate(() => window.__game.placement.state.placing != null), { message: `placement should start on step ${sid}` }).toBe(true);
  await expect(page.locator(`.tut-card[data-step="${sid}"]`)).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const r = document.querySelector('.tut-ring').getBoundingClientRect();
    const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return el && el.id === 'view';
  })).toBe(true);
  await clickRing(page);
}

test('walk the whole tutorial with real clicks on what the spotlight shows; rewards are paid once', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await openGame(page, { tutorial: true, pace: 'relaxed' });
  expect(await page.evaluate(() => window.__game.state.difficulty)).toBe('relaxed');
  const adv = (s) => page.evaluate((x) => window.__game.game.debug.advance(x), s);
  const free0 = await page.evaluate(() => window.__game.state.freeRoll.count);
  void free0;

  await waitStep(page, 'roll'); await clickRing(page);
  await waitStep(page, 'backpack'); await clickRing(page);
  await waitStep(page, 'place_dropper'); await clickRing(page); // Place button
  await clickTile(page);
  await waitStep(page, 'place_seller'); await clickRing(page);
  await clickTile(page);
  await waitStep(page, 'earn');
  await adv(5);
  await waitStep(page, 'upgrade'); // the shop opens by itself
  await clickRing(page);
  await waitStep(page, 'freeroll'); await clickRing(page);
  await waitStep(page, 'rarity'); await clickRing(page);
  await waitStep(page, 'luck'); await page.getByRole('button', { name: 'Got it' }).click();
  await waitStep(page, 'mutations'); await page.getByRole('button', { name: 'Got it' }).click();
  await waitStep(page, 'turret'); await clickRing(page);
  await clickTile(page);
  await waitStep(page, 'wave');
  expect(await page.evaluate(() => window.__game.state._enc?.kind)).toBe('demo');
  await adv(120);
  await waitStep(page, 'rebirth'); await clickRing(page);
  await waitStep(page, 'fuse');
  const card = page.locator('[data-tut="fuse"]');
  await expect(card).toBeVisible();
  const boxes = page.locator('#panels input[data-act="select"]');
  const n = await boxes.count();
  const ids = await page.evaluate(() => { const s = window.__game.state; return s.bag.filter((u) => s.items[u].tpl === 'belt' && s.items[u].tier === 0); });
  expect(ids.length).toBeGreaterThanOrEqual(3);
  for (let i = 0; i < ids.length && i < 3; i++) await page.locator(`#panels input[data-act="select"][data-uid="${ids[i]}"]`).check();
  void n;
  await page.getByRole('button', { name: /^Fuse 3 selected/ }).click();
  await waitStep(page, 'sell'); await clickRing(page);
  await waitStep(page, 'finish'); await page.getByRole('button', { name: 'Got it' }).click();
  await expect.poll(() => page.evaluate(() => window.__game.state.tutorial.status)).toBe('done');
  const claimed = await page.evaluate(() => Object.keys(window.__game.state.tutorial.claimed).filter((k) => k.startsWith('reward:')));
  expect(claimed.sort()).toEqual(['reward:finish', 'reward:place_dropper', 'reward:upgrade']);
  await expectNoErrors(errors);
});

test('first run asks for a pace with the exact differences; Standard leaves the multipliers at 1', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');
  const dlg = page.getByRole('alertdialog');
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText('Relaxed');
  await expect(dlg).toContainText('waves every 90 s instead of 60 s');
  await expect(dlg.getByRole('button', { name: /Relaxed/ })).toBeFocused();
  await dlg.getByRole('button', { name: 'Standard' }).click();
  expect(await page.evaluate(() => window.__game.state.difficulty)).toBe('standard');
  await expect(page.locator('.tut-card')).toBeVisible();
});

test('one-time tips: shown once, listed on Tips seen, and they can be turned off', async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => { const g = window.__game.game; g.debug.fillBag(); g.roll(1); });
  await expect(page.locator('.tip-card')).toContainText('backpack is full');
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(page.locator('.tip-card')).toBeHidden();
  await page.evaluate(() => window.__game.game.roll(1)); // blocked again: no second tip
  await page.waitForTimeout(300);
  await expect(page.locator('.tip-card')).toBeHidden();
  await page.getByRole('button', { name: /Settings/ }).first().click();
  await page.locator('details', { has: page.locator('summary', { hasText: 'Help and tutorial' }) }).evaluate((d) => { d.open = true; });
  await page.locator('summary', { hasText: /^Tips seen/ }).evaluate((el) => { el.parentElement.open = true; });
  await expect(page.locator('#panels')).toContainText('Your backpack is full');
  await page.getByLabel(/Show one-time tips/).uncheck();
  expect(await page.evaluate(() => window.__game.state.settings.tips)).toBe(false);
  await expectNoErrors(errors);
});
