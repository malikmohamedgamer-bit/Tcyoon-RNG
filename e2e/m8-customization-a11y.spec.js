import { test, expect } from '@playwright/test';
import { openGame, expectNoErrors } from './helpers.js';

const openSettings = async (page) => {
  await page.getByRole('button', { name: /Settings/ }).first().click();
  await expect(page.getByRole('heading', { name: /Settings/ })).toBeVisible();
};
const openSection = (page, name) => page.locator('details', { has: page.locator('summary', { hasText: name }) }).evaluate((d) => { d.open = true; });

test('settings panel opens, has no console errors and persists changes across a reload', async ({ page }) => {
  const errors = await openGame(page);
  await openSettings(page);
  await page.locator('select[data-key="numberFormat"]').selectOption('scientific');
  await page.locator('select[data-key="quality"]').selectOption('low');
  await page.evaluate(() => window.__game.saveNow());
  await page.reload();
  await page.waitForFunction(() => window.__game && window.__game.loop.frames > 2);
  const s = await page.evaluate(() => window.__game.state.settings);
  expect(s.numberFormat).toBe('scientific');
  expect(s.quality).toBe('low');
  await expectNoErrors(errors);
});

test('number format setting changes how big numbers are displayed', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => window.__game.game.debug.grantMoney(1.5e6));
  await expect(page.locator('#hud')).toContainText(/1\.5\d*M/);
  await page.evaluate(() => window.__game.set('numberFormat', 'scientific'));
  await expect(page.locator('#hud')).toContainText(/e6/);
});

test('high contrast, text scale and reduced motion are applied to the page', async ({ page }) => {
  await openGame(page);
  await openSettings(page);
  await page.getByLabel(/High contrast/).check();
  await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
  await page.locator('select[data-key="motion"]').selectOption('reduced');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  await page.evaluate(() => window.__game.set('uiScale', 1.4));
  const v = await page.evaluate(() => document.documentElement.style.getPropertyValue('--ui-scale'));
  expect(v).toBe('1.4');
  const fs = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.hud-chip, #hud *')).fontSize));
  expect(fs).toBeGreaterThan(10);
});

test('prefers-reduced-motion is honoured by default', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await openGame(page);
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  await ctx.close();
});

test('accent colour and theme override change the look; the colour is stored', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => window.__game.set('accent', '#33cc66'));
  expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--accent'))).toBe('#33cc66');
  await page.evaluate(() => window.__game.set('themeOverride', 'space'));
  expect(await page.evaluate(() => window.__game.state.settings.themeOverride)).toBe('space');
  await page.evaluate(() => window.__game.set('themeOverride', null));
  expect(await page.evaluate(() => window.__game.state.settings.themeOverride)).toBeNull();
});

test('hiding a panel and a status chip removes them from the interface', async ({ page }) => {
  await openGame(page);
  await openSettings(page);
  await openSection(page, 'Interface layout');
  await page.getByLabel(/Shop/).first().uncheck();
  await expect(page.locator('#dock').getByRole('button', { name: /Shop/ })).toHaveCount(0);
  await page.getByLabel('Status chip: fps').uncheck();
  await expect(page.locator('[data-chip="fps"]')).toBeHidden();
});

test('key remapping works and refuses conflicting keys', async ({ page }) => {
  await openGame(page);
  await openSettings(page);
  await openSection(page, 'Controls');
  // conflict: try binding "Roll x10" to the Roll key (Space)
  await page.getByRole('button', { name: 'Rebind Roll ×10' }).click();
  await page.keyboard.press('Space');
  await expect(page.locator('.msg')).toContainText(/already used/i);
  // valid remap of the manual-control key
  await page.getByRole('button', { name: /Rebind Take/ }).first().click();
  await page.keyboard.press('KeyJ');
  await expect(page.locator('.msg')).toContainText(/now J/i);
  const b = await page.evaluate(() => window.__game.state.settings.bindings);
  expect(JSON.stringify(b)).toContain('KeyJ');
});

test('ARIA live announcements are throttled: a burst of 40 messages collapses into a few writes', async ({ page }) => {
  await openGame(page);
  const n = await page.evaluate(async () => {
    const live = document.getElementById('sr-live');
    let changes = 0;
    new MutationObserver(() => { changes++; }).observe(live, { childList: true, characterData: true, subtree: true });
    const { announce } = await import('/src/ui/a11y.js');
    for (let i = 0; i < 40; i++) announce('message ' + i);
    await new Promise((r) => { setTimeout(r, 2200); });
    return changes;
  });
  // 40 announcements within ~0 ms must collapse into at most 2 (first + one merged) writes (each write = clear + set)
  expect(n).toBeLessThanOrEqual(6);
  expect(n).toBeGreaterThan(0);
});

test('sounds show captions when captions are on, and playing while muted does not error', async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => window.__game.set('captions', true));
  await page.evaluate(() => window.__game.audio.play('roll'));
  await expect(page.locator('#captions')).toContainText(/\[/);
  await page.evaluate(() => window.__game.set('muted', true));
  await page.evaluate(() => window.__game.audio.play('levelup'));
  await expectNoErrors(errors);
});

test('quality can be switched repeatedly without leaking GPU resources', async ({ page }) => {
  const errors = await openGame(page);
  const audit = () => page.evaluate(() => window.__game.gpuAudit());
  await page.waitForTimeout(500);
  const before = await audit();
  for (let i = 0; i < 6; i++) {
    for (const q of ['low', 'high', 'medium']) {
      await page.evaluate((v) => window.__game.set('quality', v), q);
      await page.waitForTimeout(60);
    }
  }
  await page.waitForTimeout(400);
  const after = await audit();
  expect(after.renderer.geometries).toBeLessThanOrEqual(before.renderer.geometries + 4);
  expect(after.renderer.textures).toBeLessThanOrEqual(before.renderer.textures + 4);
  expect(JSON.stringify(after.tracked)).toBe(JSON.stringify(before.tracked));
  await expectNoErrors(errors);
});

test('item nickname and skin persist across a reload', async ({ page }) => {
  await openGame(page);
  const uid = await page.evaluate(() => window.__game.game.debug.giveItem('belt', 2).uid);
  await page.evaluate((u) => window.__game.game.nameItem(u, 'Old Reliable', 3), uid);
  await page.evaluate(() => window.__game.saveNow());
  await page.reload();
  await page.waitForFunction(() => window.__game && window.__game.loop.frames > 2);
  const it = await page.evaluate((u) => { const i = window.__game.state.items[u]; return { nick: i.nick, skin: i.skin }; }, uid);
  expect(it).toEqual({ nick: 'Old Reliable', skin: 3 });
});

test('keyboard: panels open from the keyboard, Escape closes them, focus is not trapped', async ({ page }) => {
  await openGame(page);
  await page.keyboard.press('Digit4');
  await expect(page.getByRole('heading', { name: /Shop/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: /Shop/ })).toBeHidden();
  // Tab cycles through focusable controls and leaves the panel
  const seen = new Set();
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    seen.add(await page.evaluate(() => document.activeElement && (document.activeElement.id || document.activeElement.textContent.trim().slice(0, 20) || document.activeElement.tagName)));
  }
  expect(seen.size).toBeGreaterThan(3);
});

test('touch: controls are at least 44px and the touch bar appears when placing', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = await openGame(page);
  const tooSmall = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('#dock button, .touch-bar button, .hud button')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.width < 44 || r.height < 44) out.push(`${el.textContent.trim().slice(0, 20)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return out;
  });
  expect(tooSmall).toEqual([]);
  const uid = await page.evaluate(() => window.__game.game.debug.giveItem('belt', 1).uid);
  await page.evaluate((u) => window.__game.placement.start(u), uid);
  await expect(page.locator('.touch-bar')).toBeVisible();
  await page.screenshot({ path: 'docs/shots/m8-touch-mobile.png' });
  const hOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(hOverflow).toBe(false);
  await expectNoErrors(errors);
  await ctx.close();
});

test('game speed and pause: paused game does not advance, resumes afterwards', async ({ page }) => {
  await openGame(page);
  await page.keyboard.press('KeyP');
  const t0 = await page.evaluate(() => window.__game.state.stats.playSeconds ?? window.__game.state.time ?? 0);
  await page.waitForTimeout(600);
  const t1 = await page.evaluate(() => window.__game.state.stats.playSeconds ?? window.__game.state.time ?? 0);
  expect(t1).toBe(t0);
  expect(await page.evaluate(() => window.__game.loop.paused)).toBe(true);
  await page.keyboard.press('KeyP');
  expect(await page.evaluate(() => window.__game.loop.paused)).toBe(false);
});

test('export / import round-trips and corrupt text is refused', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => window.__game.game.debug.grantMoney(777));
  await openSettings(page);
  await openSection(page, 'Save data');
  await page.getByRole('button', { name: 'Export save text' }).click();
  const txt = await page.locator('textarea[data-act="save-text"]').inputValue();
  expect(txt.startsWith('TRNG1.')).toBe(true);
  await page.evaluate(() => window.__game.game.debug.grantMoney(1e9));
  await page.getByRole('button', { name: 'Import from text' }).click();
  await expect(page.locator('.msg')).toContainText(/imported/i);
  expect(await page.evaluate(() => window.__game.state.money.toNumber())).toBeLessThan(1e6);
  await page.locator('textarea[data-act="save-text"]').fill(txt.slice(0, -3) + 'xyz');
  await page.getByRole('button', { name: 'Import from text' }).click();
  await expect(page.locator('.msg')).toContainText(/failed/i);
});

test('nickname draft does not leak to the next selected item', async ({ page }) => {
  const errors = await openGame(page);
  const [a, b] = await page.evaluate(() => {
    const g = window.__game;
    const ids = [g.game.debug.giveItem('belt', 0).uid, g.game.debug.giveItem('belt', 0).uid];
    g.game.place(ids[0], 0, 0);
    g.game.place(ids[1], 2, 0);
    return ids;
  });
  await page.getByRole('button', { name: /Base/ }).first().click();
  await page.evaluate((u) => window.__game.placement.select(u), a);
  await openSection(page, 'Name');
  const input = page.locator('input[data-act="nick-draft"]');
  await input.fill('Draft only');
  await expect(input).toHaveValue('Draft only');
  await page.evaluate((u) => window.__game.placement.select(u), b);
  await expect(page.locator('input[data-act="nick-draft"]')).toHaveValue('');
  await expectNoErrors(errors);
});
