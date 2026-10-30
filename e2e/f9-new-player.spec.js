// A brand-new player who knows nothing and follows ONLY what the interface tells them, until the first rebirth.
// No internal hooks: this file never touches window.__game (a unit test checks that). Everything is found by what a
// person sees: buttons by their names, the tutorial's spotlight ring and card, tips, dialogs and the status bar.
// "Time passes" is the browser clock jumping forward (like closing the laptop lid), which the game handles through its
// real offline-progress path when the player comes back.
import { test, expect } from '@playwright/test';

async function clickSpotlight(page) {
  await expect(page.locator('.tut-card')).toBeVisible();
  const step = await page.locator('.tut-card').getAttribute('data-step');
  // find the centre of the highlighted control and click it in one atomic read (the spotlight moves as panels open)
  let pt = null;
  await expect.poll(async () => {
    pt = await page.evaluate(() => {
      const r = document.querySelector('.tut-ring:not([hidden])')?.getBoundingClientRect();
      if (!r) return null;
      const x = r.x + r.width / 2;
      const y = r.y + r.height / 2;
      const el = document.elementFromPoint(x, y);
      return el && el.closest('button:not([disabled]), article.item, #view, [data-tut], input') ? { x, y } : null;
    });
    return !!pt;
  }, { message: `spotlight on something clickable for ${step}`, timeout: 15000 }).toBe(true);
  await page.mouse.click(pt.x, pt.y);
}
const stepNow = (page) => page.locator('.tut-card').getAttribute('data-step');

test('a new player follows the tutorial, the tips and the dialogs, and reaches their first rebirth', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => localStorage.clear());
  await page.clock.install();
  await page.goto('/');

  // 1. the game asks for a pace; the recommended one is already focused
  const pace = page.getByRole('alertdialog');
  await expect(pace).toContainText('Choose your pace');
  await expect(pace.getByRole('button', { name: /Relaxed/ })).toBeFocused();
  await pace.getByRole('button', { name: /Relaxed/ }).click();

  // 2. the tutorial: every step says one sentence and highlights what to press
  await expect(page.locator('.tut-count')).toHaveText('Step 1 of 16');
  const seen = [];
  for (let guard = 0; guard < 60; guard++) {
    const card = page.locator('.tut-card');
    if (!(await card.isVisible())) break;
    const step = await stepNow(page);
    if (!seen.includes(step)) {
      seen.push(step);
      const words = (await page.locator('.tut-text').innerText()).trim().split(/\s+/).length;
      expect(words, `${step} sentence`).toBeLessThanOrEqual(20);
    }
    if (step === 'luck' || step === 'mutations' || step === 'finish') {
      await page.getByRole('button', { name: 'Got it' }).click();
    } else if (step === 'wave') {
      // watch the practice wave: the game moves on by itself
      await expect.poll(() => stepNow(page), { timeout: 120_000 }).not.toBe('wave');
    } else if (step === 'earn') {
      await expect.poll(() => stepNow(page), { timeout: 60_000 }).not.toBe('earn');
    } else if (step === 'fuse') {
      // "Tick three, press Fuse": tick three same-tier items in the backpack, then press the button the card names
      const boxes = page.locator('#panels input[type="checkbox"]');
      await expect(boxes.first()).toBeVisible();
      const n = await boxes.count();
      expect(n).toBeGreaterThanOrEqual(3);
      await page.getByRole('button', { name: /Select 3\+ matching items for me/ }).click();
      await page.getByRole('button', { name: /^Fuse \d+ selected/ }).click();
    } else {
      await clickSpotlight(page);
      // placing needs two clicks: the Place button, then the lit tile (the spotlight moves to it by itself)
      if (step === 'place_dropper' || step === 'place_seller' || step === 'turret') {
        await expect.poll(() => page.evaluate(() => { const r = document.querySelector('.tut-ring').getBoundingClientRect(); const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!el && el.id === 'view'; }), { timeout: 10_000 }).toBe(true);
        await clickSpotlight(page);
      }
    }
    await expect.poll(async () => ((await page.locator('.tut-card').isVisible()) ? await stepNow(page) : 'done'), { timeout: 60_000, message: `leaving ${step}` }).not.toBe(step);
  }
  expect(seen).toEqual(['roll', 'backpack', 'place_dropper', 'place_seller', 'earn', 'upgrade', 'freeroll', 'rarity', 'luck', 'mutations', 'turret', 'wave', 'rebirth', 'fuse', 'sell', 'finish']);
  await expect(page.locator('#toasts')).toContainText('Tutorial complete');

  // 3. the base now earns money (the status bar says so)
  await expect(page.locator('[data-chip="income"]')).not.toContainText('$0/s');
  const income = await page.locator('[data-bind="income"]').innerText();
  expect(income).toMatch(/^\$[\d.,]+\w*\/s$/);

  // 4. the player rolls with the big button until something unlocks a new menu (levels come from rolling)
  const dockHas = async (name) => (await page.locator('#dock button', { hasText: name }).count()) > 0;
  for (let i = 0; i < 60 && !(await dockHas('Shop')); i++) {
    const roll = page.locator('.roll-main');
    if (await roll.isDisabled()) {
      // the button says why: use the offered fix ("Backpack full: sell or fuse something" -> sell duplicates in the Backpack)
      await page.locator('#dock button', { hasText: 'Backpack' }).click();
      await page.getByRole('button', { name: 'Sell duplicates' }).click();
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      continue;
    }
    await roll.click();
    await page.keyboard.press('Escape'); // skip the reel
    await page.clock.runFor(300);
  }

  // 5. time passes (laptop lid closed for three weeks); coming back shows the welcome-back screen
  await page.clock.fastForward(504 * 3600 * 1000); // three weeks
  const welcome = page.getByRole('alertdialog');
  await expect(welcome).toContainText('Welcome back', { timeout: 20_000 });
  await expect(welcome).toContainText('Earned');
  await welcome.getByRole('button', { name: 'Continue' }).click();

  // 6. the game says a new menu appeared and then that rebirth is possible; the player does what the cards say
  await expect(page.locator('#dock button', { hasText: 'Rebirth' })).toBeVisible({ timeout: 20_000 });
  await page.clock.runFor(2500);
  const tip = page.locator('.tip-card', { hasText: 'You can Rebirth now' });
  await expect(tip).toBeVisible({ timeout: 20_000 });
  await tip.getByRole('button', { name: 'Open rebirth' }).click();
  await expect(page.getByRole('heading', { name: /Rebirth/ }).first()).toBeVisible();
  const region0 = await page.locator('[data-bind="region"]').innerText().catch(() => '1');
  await page.getByRole('button', { name: /Rebirth for \+/ }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toContainText(/lose|reset/i);
  await confirm.getByRole('button', { name: /Rebirth now/ }).click();

  // 7. the first rebirth happened: a new region, the toast says so, and the status bar agrees
  await expect(page.locator('#toasts')).toContainText('Region 2');
  await page.clock.runFor(500);
  const region1 = await page.locator('[data-bind="region"]').innerText().catch(() => '2');
  expect(region1).toBe('2');
  expect(region0).toBe('1');
  expect(errors).toEqual([]);
});
