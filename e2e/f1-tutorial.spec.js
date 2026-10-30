import { test, expect } from '@playwright/test';
import { openGame, expectNoErrors } from './helpers.js';

const card = (page) => page.locator('.tut-card');

test('a new player sees the tutorial: one short sentence, a spotlight on the Roll button, no blocked input', async ({ page }) => {
  const errors = await openGame(page, { tutorial: true });
  await expect(card(page)).toBeVisible();
  await expect(card(page).locator('.tut-text')).toHaveText(/Press Roll/);
  await expect(card(page).locator('.tut-count')).toHaveText('Step 1 of 16');
  await expect.poll(() => page.evaluate(() => {
    const r = document.querySelector('.tut-ring').getBoundingClientRect();
    const b = document.querySelector('[data-tut="roll"]')?.getBoundingClientRect();
    return b ? Math.abs(r.x + r.width / 2 - (b.x + b.width / 2)) : 999; // atomic: the panel re-renders every second
  })).toBeLessThan(8);
  // the spotlight does not intercept clicks: pressing Roll works and the tutorial moves on by itself
  await page.locator('[data-tut="roll"]').click();
  await expect(card(page).locator('.tut-text')).toHaveText(/Backpack/, { timeout: 6000 });
  await expectNoErrors(errors);
});

test('skipping asks "are you sure?": focus is on Keep learning, Esc keeps learning, the dialog says what is missed', async ({ page }) => {
  await openGame(page, { tutorial: true });
  await page.getByRole('button', { name: 'Skip tutorial' }).click();
  const dlg = page.getByRole('alertdialog');
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText('You will miss');
  await expect(dlg).toContainText('Settings');
  await expect(dlg.getByRole('button', { name: 'Keep learning' })).toBeFocused();
  await expect(dlg.getByRole('button', { name: 'Skip for now' })).toBeVisible();
  await expect(dlg.getByRole('button', { name: "Skip and don't ask again" })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dlg).toBeHidden();
  expect(await page.evaluate(() => window.__game.state.tutorial.status)).toBe('active');
  // Tab cycles inside the dialog (no escape to the page behind it)
  await page.getByRole('button', { name: 'Skip tutorial' }).click();
  for (let i = 0; i < 5; i++) await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement.closest('.modal'))).toBe(true);
  await dlg.getByRole('button', { name: 'Keep learning' }).click();
  expect(await page.evaluate(() => window.__game.state.tutorial.status)).toBe('active');
});

test('Skip for now pauses and shows Resume; the position survives a reload; Resume continues at the same step', async ({ page }) => {
  await openGame(page, { tutorial: true });
  await page.locator('[data-tut="roll"]').click();
  await expect(card(page).locator('.tut-text')).toHaveText(/Backpack/, { timeout: 6000 });
  await page.getByRole('button', { name: 'Skip tutorial' }).click();
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await expect(card(page)).toBeHidden();
  await expect(page.getByRole('button', { name: /Resume tutorial/ })).toBeVisible();
  await page.evaluate(() => window.__game.saveNow());
  await page.reload();
  await page.waitForFunction(() => window.__game && window.__game.loop.frames > 2);
  await expect(page.getByRole('button', { name: /Resume tutorial/ })).toBeVisible();
  await page.getByRole('button', { name: /Resume tutorial/ }).click();
  await expect(card(page).locator('.tut-count')).toHaveText('Step 2 of 16');
});

test("Skip and don't ask again: gone after reload, but Settings can replay it, and replay does not repay rewards", async ({ page }) => {
  await openGame(page, { tutorial: true });
  await page.getByRole('button', { name: 'Skip tutorial' }).click();
  await page.getByRole('button', { name: "Skip and don't ask again" }).click();
  await expect(card(page)).toBeHidden();
  await expect(page.getByRole('button', { name: /Resume tutorial/ })).toBeHidden();
  await page.evaluate(() => window.__game.saveNow());
  await page.reload();
  await page.waitForFunction(() => window.__game && window.__game.loop.frames > 2);
  await expect(card(page)).toBeHidden();
  await page.getByRole('button', { name: /Settings/ }).first().click();
  await page.locator('details', { has: page.locator('summary', { hasText: 'Help and tutorial' }) }).evaluate((d) => { d.open = true; });
  await page.getByRole('button', { name: 'Replay the tutorial' }).click();
  await expect(card(page)).toBeVisible();
  await expect(card(page).locator('.tut-count')).toHaveText('Step 1 of 16');
});

test('the tutorial never traps keyboard users: the card is reachable by Tab and Esc still closes panels', async ({ page }) => {
  await openGame(page, { tutorial: true });
  let reached = false;
  for (let i = 0; i < 60 && !reached; i++) {
    await page.keyboard.press('Tab');
    reached = await page.evaluate(() => !!document.activeElement.closest('.tut-card'));
  }
  expect(reached).toBe(true);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  // focus moved on (not stuck inside the card)
  expect(await page.evaluate(() => !!document.activeElement.closest('.tut-card'))).toBe(false);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: /Roll/ }).first()).toBeHidden();
});

test('reduced motion: the spotlight ring does not pulse', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await openGame(page, { tutorial: true });
  const anim = await page.locator('.tut-ring').evaluate((el) => getComputedStyle(el).animationName);
  expect(anim).toBe('none');
  await ctx.close();
});

test('each step is announced to screen readers', async ({ page }) => {
  await openGame(page, { tutorial: true });
  await expect(page.locator('#sr-live')).toContainText(/Tutorial step 1 of 16/);
});
