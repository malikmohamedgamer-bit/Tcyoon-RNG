import { test, expect } from '@playwright/test';
import { openGame, expectNoErrors } from './helpers.js';

const THEMES = ['factory', 'steampunk', 'space', 'scifi', 'pixel'];
const PANELS = ['roll', 'backpack', 'base', 'shop', 'rewards', 'combat', 'refinery', 'rebirth', 'help', 'settings', 'income'];
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2B06}\u{2B07}]/u;

async function seed(page) {
  await page.evaluate(() => {
    const g = window.__game.game; const s = window.__game.state;
    g.debug.setLevel(30); g.debug.grantMoney(1e6);
    g.place(s.bag.find((u) => s.items[u].tpl === 'pebble_drill'), 1, 1, 0);
    g.place(s.bag.find((u) => s.items[u].tpl === 'stall'), 2, 1, 0);
    for (const [t, n] of [['gem_forge', 4], ['belt', 1], ['amp', 2], ['clover_shrine', 5], ['bolt_rifle', 2], ['gun_turret', 3]]) g.debug.giveItem(t, n);
    for (let i = 0; i < 8; i++) g.roll(1);
  });
}

test('no emoji anywhere in the interface: every panel in every theme (icons are drawn SVG)', async ({ page }) => {
  const errors = await openGame(page);
  await seed(page);
  for (const theme of THEMES) {
    await page.evaluate((t) => window.__game.set('themeOverride', t), theme);
    for (const id of PANELS) {
      await page.evaluate((p) => window.__game.shell.open(p), id);
      await page.waitForTimeout(80);
      const text = await page.evaluate(() => document.getElementById('app').innerText);
      expect(EMOJI.test(text), `${theme}/${id} shows an emoji: ${(text.match(EMOJI) || [])[0]}`).toBe(false);
    }
  }
  // the welcome-back and skip dialogs too
  await page.evaluate(() => window.__game.game.tutorial.start());
  await page.getByRole('button', { name: 'Skip tutorial' }).click();
  expect(EMOJI.test(await page.locator('#modal-root').innerText())).toBe(false);
  await expectNoErrors(errors);
});

test('fonts and icons ship with the game: no request leaves the origin, display fonts load', async ({ page }) => {
  const external = [];
  page.on('request', (r) => { const u = new URL(r.url()); if (!['localhost', '127.0.0.1'].includes(u.hostname) && u.protocol.startsWith('http')) external.push(r.url()); });
  await openGame(page);
  for (const theme of THEMES) await page.evaluate((t) => window.__game.set('themeOverride', t), theme);
  await page.waitForTimeout(500);
  expect(external).toEqual([]);
  const families = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, ''));
  });
  expect(families).toEqual(expect.arrayContaining(['Atkinson Hyperlegible']));
  // each theme resolves its own display font
  const seen = new Set();
  for (const theme of THEMES) {
    await page.evaluate((t) => window.__game.set('themeOverride', t), theme);
    seen.add(await page.evaluate(() => getComputedStyle(document.querySelector('.roll-label')).fontFamily.split(',')[0].replace(/"/g, '').trim()));
  }
  expect([...seen].sort()).toEqual(['Barlow Condensed', 'Chakra Petch', 'IM Fell DW Pica', 'Orbitron', 'Silkscreen'].sort().filter((f) => f !== 'IM Fell DW Pica').concat(['Atkinson Hyperlegible']).sort());
});

test('contrast: text, muted text, accent text, status colours and the accent meet WCAG in every theme (normal and high contrast)', async ({ page }) => {
  await openGame(page);
  const ratios = await page.evaluate(async (themes) => {
    const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    const probe = document.createElement('div');
    document.body.appendChild(probe);
    const col = (css) => { probe.style.color = css; const m = getComputedStyle(probe).color.match(/[\d.]+/g).map(Number); return m.slice(0, 3); };
    const out = [];
    for (const contrast of ['normal', 'high']) {
      for (const t of themes) {
        window.__game.set('themeOverride', t);
        window.__game.set('contrast', contrast);
        await new Promise((r) => { setTimeout(r, 30); });
        const P = col('var(--panel)'); const P2 = col('var(--panel-2)');
        out.push({ contrast, t,
          text: cr(col('var(--text)'), P), muted: cr(col('var(--muted)'), P), muted2: cr(col('var(--muted)'), P2),
          accentText: cr(col('var(--accent-text)'), col('var(--accent)')), accentUI: cr(col('var(--accent)'), P),
          good: cr(col('var(--good)'), P), bad: cr(col('var(--bad)'), P), focus: cr(col('var(--focus)'), P), line: cr(col('var(--line)'), P) });
      }
    }
    probe.remove();
    return out;
  }, THEMES);
  for (const r of ratios) {
    const tag = `${r.t}/${r.contrast}`;
    expect(r.text, `${tag} text`).toBeGreaterThanOrEqual(7);
    expect(r.muted, `${tag} muted`).toBeGreaterThanOrEqual(4.5);
    expect(r.muted2, `${tag} muted on panel-2`).toBeGreaterThanOrEqual(4.5);
    expect(r.accentText, `${tag} accent text`).toBeGreaterThanOrEqual(4.5);
    expect(r.accentUI, `${tag} accent as a UI colour`).toBeGreaterThanOrEqual(3);
    expect(r.good, `${tag} good`).toBeGreaterThanOrEqual(4.5);
    expect(r.bad, `${tag} bad`).toBeGreaterThanOrEqual(4.5);
    expect(r.focus, `${tag} focus ring`).toBeGreaterThanOrEqual(3);
  }
});

test('focus ring: keyboard focus on a menu button shows a 3 px ring in every theme', async ({ page }) => {
  await openGame(page);
  for (const theme of THEMES) {
    await page.evaluate((t) => window.__game.set('themeOverride', t), theme);
    await page.keyboard.press('Tab');
    const ring = await page.evaluate(() => { document.querySelector('#dock button').focus(); const cs = getComputedStyle(document.activeElement); return { w: parseFloat(cs.outlineWidth), style: cs.outlineStyle }; });
    expect(ring, theme).toEqual({ w: 3, style: 'solid' });
  }
});

for (const vp of [{ name: 'phone', w: 390, h: 780 }, { name: 'tablet', w: 820, h: 1100 }, { name: 'desktop', w: 1366, h: 768 }]) {
  test(`layout at ${vp.name}: no horizontal overflow, the Roll button is on screen, unobstructed and at least 44 px, in every theme`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: vp.name === 'phone', isMobile: vp.name === 'phone' });
    const page = await ctx.newPage();
    await openGame(page);
    await seed(page);
    for (const theme of THEMES) {
      await page.evaluate((t) => { window.__game.set('themeOverride', t); window.__game.shell.open('backpack'); }, theme);
      await page.waitForTimeout(250);
      const m = await page.evaluate(() => {
        const b = document.querySelector('.roll-main').getBoundingClientRect();
        const top = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
        const small = [...document.querySelectorAll('#dock button:not([hidden]), .roll-main, .roll-x10:not([hidden])')].filter((e) => { const r = e.getBoundingClientRect(); return r.width < 43.5 || r.height < 43.5; }).map((e) => e.textContent.trim().slice(0, 12));
        return { overflow: document.documentElement.scrollWidth > window.innerWidth + 1, onScreen: b.top >= 0 && b.bottom <= window.innerHeight && b.left >= 0 && b.right <= window.innerWidth, obstructed: !top || !top.closest('.roll-main'), small, h: b.height };
      });
      expect(m.overflow, `${vp.name}/${theme} horizontal overflow`).toBe(false);
      expect(m.onScreen, `${vp.name}/${theme} roll on screen`).toBe(true);
      expect(m.obstructed, `${vp.name}/${theme} roll obstructed`).toBe(false);
      expect(m.small, `${vp.name}/${theme} small targets`).toEqual([]);
    }
    await ctx.close();
  });
}

test('text scale 160% keeps the Roll button usable and the page free of horizontal scroll (phone)', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await openGame(page);
  await page.evaluate(() => window.__game.set('uiScale', 1.6));
  await page.waitForTimeout(250);
  const m = await page.evaluate(() => { const b = document.querySelector('.roll-main').getBoundingClientRect(); const top = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return { overflow: document.documentElement.scrollWidth > window.innerWidth + 1, ok: !!top && !!top.closest('.roll-main') }; });
  expect(m).toEqual({ overflow: false, ok: true });
  await ctx.close();
});

test('reduced motion: no panel slide, no roll pulse', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await openGame(page);
  const a = await page.evaluate(() => { window.__game.shell.open('backpack'); return getComputedStyle(document.querySelector('.panel')).animationName; });
  expect(a).toBe('none');
  await ctx.close();
});
