// Soak tests (not part of the quick suite's budget: `npm run test:soak`).
//  1. random-input soak: SOAK_MINUTES (default 5) of random clicks, keys, purchases, fights, prestiges and
//     quality switches, sampling console errors, JS heap (after gc), GPU resources, DOM nodes, NaN/Infinity text
//     and whether the frame loop is still alive.
//  2. long-numbers soak: huge money / prestige currencies (towers), every panel opened in every number format,
//     the UI must never show NaN / Infinity / undefined and the game must keep running.
import { test, expect } from '@playwright/test';
import { openGame } from './helpers.js';

const MINUTES = Number(process.env.SOAK_MINUTES || 5);
const BAD = /NaN|Infinity|undefined|\[object/;

const PANEL_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Escape'];
const OTHER_KEYS = ['Space', 'KeyT', 'KeyP', 'KeyR', 'KeyX', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyM', 'Equal', 'Minus', 'Home'];

async function sample(page) {
  return page.evaluate(() => {
    if (window.gc) window.gc();
    const g = window.__game;
    const a = g.gpuAudit();
    const text = document.body.innerText;
    return {
      heap: performance.memory ? performance.memory.usedJSHeapSize : 0,
      geometries: a.renderer.geometries,
      textures: a.renderer.textures,
      programs: a.renderer.programs,
      reveal: !!window.__game.reveal.active,
      revealNodes: document.querySelectorAll('#reveal *').length,
      tracked: JSON.stringify(a.tracked),
      dom: document.getElementsByTagName('*').length,
      frames: g.loop.frames,
      bad: (text.match(/NaN|Infinity|undefined|\[object/) || [null])[0],
      level: g.state.level,
      region: g.state.region,
    };
  });
}

test('random-input soak: no errors, no leaks, no NaN, frame loop alive', async ({ page }) => {
  test.setTimeout((MINUTES + 3) * 60_000);
  const errors = await openGame(page);
  let seed = 12345;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];

  await page.evaluate(() => { const d = window.__game.game.debug; d.grantMoney(1e6); d.setLevel(12); window.__game.set('advancedUI', true); });
  const samples = [];
  const t0 = Date.now();
  let lastSample = 0;
  let actions = 0;
  while (Date.now() - t0 < MINUTES * 60_000) {
    const r = rnd();
    try {
      if (r < 0.25) {
        await page.keyboard.press(pick(PANEL_KEYS));
      } else if (r < 0.4) {
        await page.keyboard.press(pick(OTHER_KEYS));
      } else if (r < 0.65) {
        // click a random visible enabled button
        const btns = page.locator('#panels button:visible:enabled, #dock button:visible');
        const n = await btns.count();
        if (n) await btns.nth(Math.floor(rnd() * n)).click({ timeout: 1500, trial: false }).catch(() => {});
      } else if (r < 0.75) {
        await page.mouse.click(200 + rnd() * 500, 150 + rnd() * 400);
      } else if (r < 0.82) {
        await page.evaluate((v) => { const g = window.__game; g.game.roll(v); }, pick([1, 10, 100]));
        if (rnd() < 0.5) await page.keyboard.press(pick(['Escape', 'Enter', 'Space']));
      } else if (r < 0.88) {
        // rare results go through the reveal machines: reels, summaries and full cutscenes, skipped or not
        await page.evaluate(([t, n, skip]) => { const rv = window.__game.reveal; rv.push(Array.from({ length: n }, (_, i) => ({ uid: 1e6 + i, tier: t, icon: 'gem', label: 'Soak', color: '#d96bff', title: 'Soak item', isNew: i === 0 })), { source: n > 1 ? 'auto' : 'manual' }); if (skip) rv.skip(); }, [pick([2, 6, 9, 14, 40]), pick([1, 1, 10, 30]), rnd() < 0.5]);
        await page.evaluate(() => { const g = window.__game.game; g.debug.grantMoney(1e9); g.autoPlace && g.autoPlace(); });
      } else if (r < 0.93) {
        await page.evaluate((s) => window.__game.game.debug.advance(s), pick([5, 30, 120, 600]));
      } else if (r < 0.96) {
        await page.evaluate(([q, th]) => { window.__game.set('quality', q); window.__game.set('themeOverride', th); }, [pick(['low', 'medium', 'high']), pick([null, 'factory', 'steampunk', 'space', 'scifi', 'pixel'])]);
      } else if (r < 0.98) {
        await page.evaluate(() => window.__game.game.startRush());
      } else {
        await page.evaluate(() => { const g = window.__game.game; g.prestige(0, { confirmed: true }); });
      }
    } catch (e) {
      errors.push('action threw: ' + e.message);
    }
    actions++;
    await page.waitForTimeout(120);
    if (Date.now() - lastSample > 15_000) {
      lastSample = Date.now();
      const s = await sample(page);
      samples.push(s);
      expect(s.bad, 'bad text on screen: ' + s.bad).toBeNull();
    }
  }
  const last = await sample(page);
  samples.push(last);
  console.log(`soak: ${actions} actions in ${MINUTES} min, ${samples.length} samples`);
  console.log('heap MB:', samples.map((s) => (s.heap / 1048576).toFixed(1)).join(' '));
  console.log('dom nodes:', samples.map((s) => s.dom).join(' '));
  console.log('geometries/textures/programs:', samples.map((s) => `${s.geometries}/${s.textures}/${s.programs}`).join(' '));
  console.log('level/region at end:', last.level, last.region);
  console.log('reveal DOM nodes:', samples.map((s) => s.revealNodes).join(' '));
  expect(Math.max(...samples.map((s) => s.revealNodes)), 'reveal DOM stays small').toBeLessThan(120);

  // frame loop alive: frames strictly increase between samples
  for (let i = 1; i < samples.length; i++) expect(samples[i].frames).toBeGreaterThan(samples[i - 1].frames);
  // GPU resources are bounded (quality switches rebuild pools, prestige changes themes)
  const g0 = samples[Math.min(2, samples.length - 1)];
  const maxGeo = Math.max(...samples.map((s) => s.geometries));
  const maxTex = Math.max(...samples.map((s) => s.textures));
  expect(maxGeo, 'geometries bounded').toBeLessThan(g0.geometries * 3 + 60);
  expect(maxTex, 'textures bounded').toBeLessThan(g0.textures * 3 + 60);
  // DOM nodes bounded
  expect(Math.max(...samples.map((s) => s.dom)), 'dom nodes bounded').toBeLessThan(6000);
  // heap: the second half must not keep growing without bound (compare medians of halves)
  const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const h = samples.map((s) => s.heap).filter(Boolean);
  if (h.length >= 6) {
    const half = Math.floor(h.length / 2);
    expect(med(h.slice(half)) - med(h.slice(0, half)), 'heap growth between halves (bytes)').toBeLessThan(40 * 1048576);
  }
  expect(errors, errors.join('\n')).toEqual([]);
});

test('long-numbers soak: huge values never break formatting, panels or the loop', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = await openGame(page);
  await page.evaluate(async () => {
    const { Big } = await import('/src/core/bignum.js');
    const rebirth = await import('/src/sim/rebirth.js');
    const g = window.__game;
    const s = g.state;
    const tower = (h) => { let b = Big.fromNumber(10); for (let i = 0; i < h; i++) b = Big.fromNumber(10).pow(b); return b; };
    g.game.debug.setLevel(500);
    s.money = tower(6);
    s.runMoney = tower(6);
    for (const k of [0, 1, 2, 3, 7, 40]) {
      const ls = rebirth.layerState ? rebirth.layerState(s, k) : (s.layers[k] ||= {});
      ls.total = tower(4 + (k % 3));
      ls.currency = tower(3 + (k % 3));
      ls.count = 1e6;
    }
    for (let i = 0; i < 12; i++) g.game.debug.giveItem('pebble_drill', 3000 + i * 500);
    g.game.autoPlace && g.game.autoPlace();
  });
  const panels = ['Roll', 'Backpack', 'Base', 'Shop', 'Rewards', 'Combat', 'Refinery', 'Rebirth', 'Index', 'Help', 'Settings'];
  await page.evaluate(() => window.__game.set('advancedUI', true));
  for (const fmtMode of ['friendly', 'suffix', 'scientific', 'engineering']) {
    await page.evaluate((m) => window.__game.set('numberFormat', m), fmtMode);
    for (const p of panels) {
      await page.getByRole('button', { name: new RegExp(p) }).first().click();
      await page.evaluate(() => window.__game.game.debug.advance(5));
      await page.waitForTimeout(250);
      const text = await page.evaluate(() => document.body.innerText);
      expect(text, `${p} / ${fmtMode} shows bad text`).not.toMatch(/NaN|Infinity|undefined|\[object/);
    }
  }
  // the simulation keeps running with absurd numbers, and the state still serialises and reloads
  await page.evaluate(() => window.__game.game.debug.advance(600));
  await page.evaluate(() => window.__game.saveNow());
  const txt = await page.evaluate(() => window.__game.game.exportText());
  expect(txt.startsWith('TRNG1.')).toBe(true);
  const a = await page.evaluate(() => window.__game.loop.frames);
  await page.waitForTimeout(500);
  const b = await page.evaluate(() => window.__game.loop.frames);
  expect(b).toBeGreaterThan(a);
  const hudText = await page.locator('#hud').innerText();
  expect(hudText).not.toMatch(BAD);
  await page.reload();
  await page.waitForFunction(() => window.__game && window.__game.loop.frames > 2);
  expect(await page.locator('#hud').innerText()).not.toMatch(/NaN|Infinity|undefined/);
  expect(errors, errors.join('\n')).toEqual([]);
});
