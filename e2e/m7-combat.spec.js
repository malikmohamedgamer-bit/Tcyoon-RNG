import { test, expect } from '@playwright/test';
import { openGame, expectNoErrors } from './helpers.js';

async function strongBase(page, { tier = 10, level = 12, wave = 1 } = {}) {
  await page.evaluate(([tier2, lvl, w]) => {
    const g = window.__game.game;
    const d = g.debug;
    d.setLevel(lvl);
    g.state.rewards.levelClaimed = lvl;
    d.grantMoney(1e6);
    ['gun_turret', 'flame_tower', 'frost_spire', 'arc_coil', 'void_cannon', 'gun_turret'].forEach((t, i) => {
      const it = d.giveItem(t, tier2);
      g.place(it.uid, 1 + (i % 4), 1 + Math.floor(i / 4));
    });
    for (const t of ['bolt_rifle', 'plasma_pistol']) g.equip(d.giveItem(t, tier2).uid);
    g.state.combat.wave = w;
  }, [tier, level, wave]);
}

test('a wave is defended: automatic defence wins, wave counter and rewards advance, UI reports it', async ({ page }) => {
  const errors = await openGame(page);
  await strongBase(page, { tier: 8, wave: 5 });
  const m0 = await page.evaluate(() => window.__game.state.money.toNumber());
  await page.getByRole('button', { name: /Combat/ }).first().click();
  await expect(page.locator('#panels')).toContainText('Wave 5');
  await expect(page.locator('#panels')).toContainText('should hold');
  await page.evaluate(() => { window.__game.game.startWaveNow(); });
  await expect(page.locator('#arena-ui')).toBeVisible();
  await expect(page.locator('#arena-ui')).toContainText('Wave 5');
  await page.evaluate(() => window.__game.game.debug.advance(70));
  const s = await page.evaluate(() => ({ wave: window.__game.state.combat.wave, waves: window.__game.state.stats.waves, enc: !!window.__game.state._enc, money: window.__game.state.money.toNumber() }));
  expect(s.waves).toBeGreaterThanOrEqual(1);
  expect(s.wave).toBeGreaterThanOrEqual(6);
  expect(s.money).toBeGreaterThan(m0);
  await expect(page.locator('#panels')).toContainText(/Wave \d+/);
  await expectNoErrors(errors);
});

test('automatic waves arrive on their own timer from level 4 (no input at all)', async ({ page }) => {
  await openGame(page);
  await strongBase(page, { tier: 8, wave: 2, level: 5 });
  await page.evaluate(() => { window.__game.state.combat.timer = 5; });
  await page.evaluate(() => window.__game.game.debug.advance(10));
  expect(await page.evaluate(() => !!window.__game.state._enc || window.__game.state.stats.waves > 0)).toBe(true);
  await page.evaluate(() => window.__game.game.debug.advance(60));
  expect(await page.evaluate(() => window.__game.state.stats.waves)).toBeGreaterThanOrEqual(1);
});

test('losing a wave costs a small bounded penalty, never items, never negative money', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    const g = window.__game.game;
    g.debug.setLevel(6);
    g.state.rewards.levelClaimed = 6;
    g.place(g.state.bag[0], 1, 1, 0); // starter dropper + seller: 1.3 $/s
    g.place(g.state.bag[0], 2, 1, 0);
    g.state.money = g.state.money.mul(0).add(10000);
    g.state.combat.wave = 20; // and no defence at all
  });
  const items0 = await page.evaluate(() => Object.keys(window.__game.state.items).length);
  await page.evaluate(() => window.__game.game.startWaveNow());
  await page.evaluate(() => window.__game.game.debug.advance(200));
  const r = await page.evaluate(() => ({ wave: window.__game.state.combat.wave, money: window.__game.state.money.toNumber(), items: Object.keys(window.__game.state.items).length, losses: window.__game.state.stats.waveLosses }));
  expect(r.losses).toBeGreaterThanOrEqual(1);
  expect(r.wave).toBeLessThan(20);
  expect(r.items).toBe(items0); // items are never lost
  expect(r.money).toBeGreaterThan(0);
  // documented penalty: min(2% of money, 30 s of income) per lost wave => at most 30 * 1.3 = 39 each
  const earned = 1.3 * 200;
  expect(r.money).toBeGreaterThan(10000 + earned - r.losses * 40 - 1);
});

test('boss fight is won through the UI; drops a weapon with the unique mutation, next boss unlocks', async ({ page }) => {
  const errors = await openGame(page);
  await strongBase(page, { tier: 12 });
  await page.getByRole('button', { name: /Combat/ }).first().click();
  const challenge = page.getByRole('button', { name: 'Challenge boss' });
  await expect(challenge).toBeEnabled();
  const bag0 = await page.evaluate(() => window.__game.state.bag.length);
  await challenge.click();
  await expect(page.locator('#arena-ui')).toContainText('Worldbreaker');
  await page.evaluate(() => window.__game.game.debug.advance(120));
  const s = await page.evaluate(() => { const st = window.__game.state; return { idx: st.combat.bossIndex, bosses: st.stats.bosses, drop: st.bag.map((u) => st.items[u]).find((i) => i.mut.some((m) => m[0] === 'boss:0')), bag: st.bag.length }; });
  expect(s.idx).toBe(1);
  expect(s.bosses).toBe(1);
  expect(s.drop).toBeTruthy();
  expect(s.bag).toBe(bag0 + 1);
  await expect(page.locator('#toasts')).toContainText('Boss defeated');
  await expect(page.locator('#panels')).toContainText('boss #2');
  await expectNoErrors(errors);
});

test('boss is gated by level and cooldown; leaving a boss fight has no penalty beyond the cooldown', async ({ page }) => {
  await openGame(page);
  await page.getByRole('button', { name: /Combat/ }).first().click();
  await expect(page.getByRole('button', { name: 'Challenge boss' })).toBeDisabled();
  await expect(page.locator('#panels')).toContainText('unlock at level 10');
  await strongBase(page, { tier: 3 });
  await page.getByRole('button', { name: 'Challenge boss' }).click();
  await page.getByRole('button', { name: 'Leave fight' }).click();
  await page.evaluate(() => window.__game.game.debug.advance(1));
  expect(await page.evaluate(() => window.__game.state.combat.bossIndex)).toBe(0);
  expect(await page.evaluate(() => window.__game.state.combat.bossCd)).toBeGreaterThan(20);
});

test('manual control: M toggles it, WASD moves the avatar, abilities have cooldowns, base is never required', async ({ page }) => {
  const errors = await openGame(page);
  await strongBase(page, { tier: 6, wave: 8 });
  await page.evaluate(() => window.__game.game.startRush());
  await expect(page.locator('.fight-abilities')).toBeHidden();
  await page.keyboard.press('m');
  await expect(page.locator('.fight-abilities')).toBeVisible();
  const a0 = await page.evaluate(() => ({ ...window.__game.state._enc.avatar }));
  await page.keyboard.down('d');
  await page.waitForTimeout(500);
  await page.keyboard.up('d');
  const a1 = await page.evaluate(() => ({ ...window.__game.state._enc.avatar }));
  expect(Math.hypot(a1.x - a0.x, a1.z - a0.z)).toBeGreaterThan(0.5);
  await page.keyboard.press('q'); // nova
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__game.state._enc.avatar.cds.nova)).toBeGreaterThan(8);
  await page.keyboard.press('e'); // shield
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.__game.state._enc.shieldT)).toBeGreaterThan(0);
  await expect(page.locator('[data-ab="nova"]')).toBeDisabled();
  await page.keyboard.press('m');
  await expect(page.locator('.fight-abilities')).toBeHidden();
  await page.evaluate(() => window.__game.game.debug.advance(200));
  // the rush finished on its own (a regular wave may have started meanwhile: they come every 60 s)
  expect(await page.evaluate(() => { const e = window.__game.state._enc; return !e || e.kind !== 'rush'; })).toBe(true);
  await expectNoErrors(errors);
});

test('gear: equip and unequip weapons from the Combat panel, limited by slots', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => { const d = window.__game.game.debug; d.setLevel(6); for (const t of ['bolt_rifle', 'cryo_gun', 'tesla_wand']) d.giveItem(t, 2); });
  await page.getByRole('button', { name: /Combat/ }).first().click();
  await expect(page.locator('#panels')).toContainText('Gear (0/2)');
  await page.locator('#panels article.item', { hasText: 'Bolt Rifle' }).getByRole('button', { name: 'Equip' }).click();
  await page.locator('#panels article.item', { hasText: 'Cryo Gun' }).getByRole('button', { name: 'Equip' }).click();
  await expect(page.locator('#panels')).toContainText('Gear (2/2)');
  await expect(page.locator('#panels article.item', { hasText: 'Tesla Wand' }).getByRole('button', { name: 'Equip' })).toBeDisabled();
  await page.locator('#panels article.item', { hasText: 'Bolt Rifle' }).getByRole('button', { name: 'Unequip' }).click();
  await expect(page.locator('#panels')).toContainText('Gear (1/2)');
});

test('combat renders enemies and effects within caps and does not leak GPU resources', async ({ page }) => {
  const errors = await openGame(page);
  await strongBase(page, { tier: 4, wave: 12 });
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => window.__game.gpuAudit());
  let maxLive = 0;
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => window.__game.game.startRush());
    for (let k = 0; k < 12; k++) {
      await page.evaluate(() => window.__game.game.debug.advance(4));
      await page.waitForTimeout(40);
      maxLive = Math.max(maxLive, await page.evaluate(() => window.__game.gfx.effects.live + window.__game.gfx.enemies.live));
    }
    await page.evaluate(() => { const g = window.__game.game; g.debug.advance(100); window.__game.state._enc = null; });
  }
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => window.__game.gpuAudit());
  expect(after.renderer.geometries).toBeLessThanOrEqual(before.renderer.geometries + 3);
  expect(after.renderer.textures).toBeLessThanOrEqual(before.renderer.textures + 1);
  expect(after.tracked.geometries).toBeLessThanOrEqual(before.tracked.geometries + 3);
  const caps = await page.evaluate(() => window.__game.gfx.effects.cap + window.__game.gfx.enemies.cap);
  expect(maxLive).toBeLessThanOrEqual(caps);
  await expectNoErrors(errors);
});

test('reload keeps wave, best wave and defeated bosses', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => { const s = window.__game.state; s.combat.wave = 17; s.combat.bestWave = 21; s.combat.bossIndex = 3; window.__game.saveNow(); });
  await page.reload();
  await page.waitForFunction(() => window.__game && window.__game.loop.frames > 2);
  expect(await page.evaluate(() => { const c = window.__game.state.combat; return [c.wave, c.bestWave, c.bossIndex]; })).toEqual([17, 21, 3]);
});
