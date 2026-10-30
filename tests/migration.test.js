import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SaveManager, MemoryStorage, SAVE_KEY } from '../src/core/save.js';
import { createState, serializeState, deserializeState, SAVE_VERSION, MIGRATIONS } from '../src/sim/state.js';
import { place } from '../src/sim/placement.js';
import { computeProduction } from '../src/sim/production.js';
import { big } from '../src/core/bignum.js';

const v1 = JSON.parse(readFileSync(new URL('./fixtures/save-v1.json', import.meta.url), 'utf8'));

test('fixture really is a v1 save (array of items, no base)', () => {
  assert.equal(v1.v, 1);
  assert.ok(Array.isArray(v1.items));
  assert.equal(v1.base, undefined);
});

test('v1 fixture loads through SaveManager, migrates to the current version and keeps everything', () => {
  const st = new MemoryStorage();
  st.setItem(SAVE_KEY, JSON.stringify(v1));
  const m = new SaveManager({ version: SAVE_VERSION, migrations: MIGRATIONS, storage: st });
  const r = m.load();
  assert.equal(r.status, 'migrated');
  assert.equal(r.migratedFrom, 1);
  const s = deserializeState(r.data);
  assert.equal(s.v, SAVE_VERSION);
  assert.equal(s.level, v1.level);
  assert.equal(s.seed, v1.seed);
  assert.equal(s.playtime, v1.playtime);
  assert.equal(Object.keys(s.items).length, v1.items.length);
  assert.equal(s.bag.length, v1.items.length);
  assert.deepEqual(s.bag, v1.items.map((i) => i.uid)); // order preserved
  assert.ok(s.money.eq(big(v1.money)));
  assert.ok(s.money.gt(10000) && s.money.lt(12345.5)); // 12 paid rolls were deducted
  assert.equal(s.base.side, 6);
  assert.deepEqual(s.presets, []);
  assert.equal(s.nextUid, Math.max(...v1.items.map((i) => i.uid)) + 1);
  for (const [uid, it] of Object.entries(s.items)) {
    assert.equal(it.loc, 'bag');
    const orig = v1.items.find((i) => i.uid === Number(uid));
    assert.equal(it.tpl, orig.tpl);
    assert.equal(it.tier, orig.tier);
    assert.deepEqual(it.mut, orig.mut);
  }
  // the RNG stream continues exactly where the v1 save stopped
  assert.deepEqual(s.rng.getState(), v1.rngState);
  // the migrated game is playable: place the starter kit and earn
  const drill = Object.values(s.items).find((i) => i.tpl === 'pebble_drill');
  const stall = Object.values(s.items).find((i) => i.tpl === 'stall');
  assert.ok(place(s, drill.uid, 0, 0, 0).ok);
  assert.ok(place(s, stall.uid, 1, 0, 0).ok);
  assert.ok(computeProduction(s).income.gt(0));
});

test('importing a v1 export text migrates it too', () => {
  const m = new SaveManager({ version: SAVE_VERSION, migrations: MIGRATIONS, storage: new MemoryStorage() });
  const text = m.exportText ? new SaveManager({ version: 1, storage: new MemoryStorage() }).exportText(v1) : '';
  const r = m.importText(text);
  assert.ok(r.ok, r.error);
  assert.equal(r.migratedFrom, 1);
  assert.equal(r.data.v, SAVE_VERSION);
  assert.equal(r.data.bag.length, v1.items.length);
});

test('v2 round trip: placed items, presets, base size, mega tiles survive', () => {
  const s = createState(5, 0);
  const [a, b] = s.bag.slice();
  place(s, a, 2, 3, 1);
  place(s, b, 3, 3, 0);
  s.base = { side: 9, expansions: 3, mega: 0 };
  s.presets.push({ name: 'x', side: 9, layout: [{ uid: a, x: 2, y: 3, dir: 1 }] });
  const t = deserializeState(JSON.parse(JSON.stringify(serializeState(s, 1))));
  assert.equal(t.items[a].loc, 'placed');
  assert.deepEqual([t.items[a].x, t.items[a].y, t.items[a].dir], [2, 3, 1]);
  assert.equal(t.base.side, 9);
  assert.equal(t.presets[0].name, 'x');
  assert.ok(computeProduction(t).income.eq(computeProduction(s).income));
});

test('corrupt or hostile v2 data is sanitised, never crashes', () => {
  const s = createState(5, 0);
  const data = JSON.parse(JSON.stringify(serializeState(s, 1)));
  const uids = Object.keys(data.items);
  data.items[uids[0]] = { ...data.items[uids[0]], loc: 'placed', x: 99, y: -3, dir: 7 }; // out of bounds
  data.items[uids[1]] = { ...data.items[uids[1]], loc: 'placed', x: 1, y: 1, dir: 6 };
  data.items.bad = { uid: 77, tpl: 'does_not_exist', tier: 1 };
  data.items.nulls = null;
  data.money = 'garbage';
  data.level = -4;
  data.freeRoll = { count: 'x', progress: -9 };
  const t = deserializeState(data);
  assert.equal(t.items[uids[0]].loc, 'bag');
  assert.equal(t.items[uids[1]].dir, 2);
  assert.equal(t.items[77], undefined);
  assert.ok(t.money.isZero());
  assert.equal(t.level, 1);
  assert.equal(t.freeRoll.count, 0);
  assert.ok(t.freeRoll.progress >= 0);
  assert.equal(t.bag.length + Object.values(t.items).filter((i) => i.loc !== 'bag').length, Object.keys(t.items).length);
});

import { sanitizeSettings, defaultSettings } from '../src/sim/state.js';

test('settings sanitiser: defaults, clamping, enum checks, hostile input, key bindings', () => {
  assert.deepEqual(sanitizeSettings(undefined), sanitizeSettings(defaultSettings()));
  const bad = sanitizeSettings({ pixelSize: 999, quality: 'ultra', numberFormat: 'hex', accent: 'red', themeOverride: 'lava', uiScale: -5, gameSpeed: 'fast', volume: { master: 9, sfx: 'x' }, camera: { speed: 100 }, hiddenPanels: [1, 'shop'], hud: { fps: 0, bogus: true }, bindings: { rotate: ['KeyZ'], x: 'no', y: [1] } });
  assert.equal(bad.pixelSize, 16);
  assert.equal(bad.quality, 'medium');
  assert.equal(bad.numberFormat, 'friendly');
  assert.equal(bad.accent, null);
  assert.equal(bad.themeOverride, null);
  assert.equal(bad.uiScale, 0.8);
  assert.equal(bad.gameSpeed, 1);
  assert.equal(bad.volume.master, 1);
  assert.equal(bad.camera.speed, 3);
  assert.deepEqual(bad.hiddenPanels, ['shop']);
  assert.equal(bad.hud.fps, false);
  assert.ok(!('bogus' in bad.hud));
  assert.deepEqual(bad.bindings, { rotate: ['KeyZ'] });
  const ok = sanitizeSettings({ accent: '#FFAA00', themeOverride: 'space', gameSpeed: 2, motion: 'reduced', contrast: 'high', numberFormat: 'engineering' });
  assert.deepEqual([ok.accent, ok.themeOverride, ok.gameSpeed, ok.motion, ok.contrast, ok.numberFormat], ['#ffaa00', 'space', 2, 'reduced', 'high', 'engineering']);
  // idempotent
  assert.deepEqual(sanitizeSettings(ok), ok);
  // survives a v1 save (old settings had only pixelSize/quality)
  const t = deserializeState(JSON.parse(JSON.stringify({ ...serializeState(createState(1, 0), 1), settings: { pixelSize: 6, quality: 'high' } })));
  assert.equal(t.settings.pixelSize, 6);
  assert.equal(t.settings.numberFormat, 'friendly');
});

test('item nicknames and skins persist, are length-limited and sanitised; nickname replaces the generated title', async () => {
  const { itemTitle } = await import('../src/sim/items.js');
  const s = createState(2, 0);
  const uid = s.bag[0];
  s.items[uid].nick = 'Old Faithful';
  s.items[uid].skin = 3;
  assert.equal(itemTitle(s.items[uid]), 'Old Faithful');
  const t = deserializeState(JSON.parse(JSON.stringify(serializeState(s, 1))));
  assert.equal(t.items[uid].nick, 'Old Faithful');
  assert.equal(t.items[uid].skin, 3);
  const data = JSON.parse(JSON.stringify(serializeState(s, 1)));
  data.items[uid].nick = 'x'.repeat(100);
  data.items[uid].skin = 99;
  const u = deserializeState(data);
  assert.equal(u.items[uid].nick.length, 24);
  assert.equal(u.items[uid].skin, undefined);
});
