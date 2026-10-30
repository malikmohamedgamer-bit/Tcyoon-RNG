import { test } from 'node:test';
import assert from 'node:assert/strict';
import { big } from '../src/core/bignum.js';
import { createState, serializeState, deserializeState } from '../src/sim/state.js';
import { gainFor, canPrestige, prestige, buyNode, applyLayerMods, layerState, visibleLayers, prestigePreview, requirement, nodeInfo } from '../src/sim/rebirth.js';
import { layerDef, layerGainFor, currencyMultiplier, lowerLayerBoost, nodeCost, HAND_LAYER_COUNT } from '../src/gen/layers.js';
import { modifiers, luckOf, rollCost } from '../src/sim/economy.js';
import { addMoney } from '../src/sim/economy.js';
import { addToBag } from '../src/sim/inventory.js';
import { place } from '../src/sim/placement.js';
import { regionTheme } from '../src/gen/themes.js';
import { createGame } from '../src/game.js';
import { MemoryStorage } from '../src/core/save.js';

const fresh = () => createState(11, 0);
const earn = (s, n) => addMoney(s, big(n));

test('layer 0 gain = floor(sqrt(runMoney / 1e6)); nothing below the threshold', () => {
  const s = fresh();
  assert.ok(gainFor(s, 0).isZero());
  earn(s, 999999);
  assert.ok(gainFor(s, 0).isZero());
  assert.equal(canPrestige(s, 0), false);
  earn(s, 1);
  assert.ok(gainFor(s, 0).eq(1));
  earn(s, 99e6); // 1e8 total
  assert.ok(gainFor(s, 0).eq(10));
  assert.ok(layerGainFor(layerDef(0), big('1e12')).eq(1000));
});

test('layer 1 needs layer-0 currency earned: infinite money alone can never skip it', () => {
  const s = fresh();
  earn(s, '1e300');
  assert.ok(gainFor(s, 1).isZero());
  assert.ok(requirement(s, 1).isZero());
  assert.equal(prestige(s, 1).ok, false);
  assert.ok(gainFor(s, 0).gt(0));
  prestige(s, 0);
  assert.ok(requirement(s, 1).gt(0)); // now layer 1 has progress, from layer 0 only
});

test('prestige resets money/items/base/upgrades but keeps level, xp, counts, currency; moves to the next region', () => {
  const s = fresh();
  s.level = 12;
  s.xp = big(5);
  s.rewards.levelClaimed = 12;
  const a = addToBag(s, { tpl: 'pebble_drill', tier: 3, vs: 0, hy: null, mut: [] }, { force: true });
  place(s, a.uid, 2, 2);
  s.base.side = 9;
  s.backpackTier = 4;
  earn(s, 4e6); // gain = 2
  const keep = { level: s.level, xp: s.xp };
  const r = prestige(s, 0);
  assert.ok(r.ok && r.gain.eq(2));
  assert.equal(s.level, keep.level);
  assert.ok(s.xp.eq(keep.xp));
  assert.equal(s.rewards.levelClaimed, 12);
  assert.ok(layerState(s, 0).currency.eq(2) && layerState(s, 0).total.eq(2));
  assert.equal(layerState(s, 0).count, 1);
  assert.equal(s.region, 1);
  assert.equal(s.base.side, 6);
  assert.equal(s.backpackTier, 0);
  assert.ok(s.runMoney.isZero());
  assert.equal(Object.values(s.items).length, 2); // fresh starter kit only
  assert.equal(Object.values(s.items).filter((i) => i.loc === 'placed').length, 0);
  assert.ok(s.money.gte(100)); // starting money + rule bonus
  assert.ok(s.money.lt(1000));
  assert.equal(s.stats.rebirths, 1);
});

test('a second rebirth needs fresh progress (run money resets)', () => {
  const s = fresh();
  earn(s, 4e6);
  prestige(s, 0);
  assert.equal(canPrestige(s, 0), false);
  assert.equal(prestige(s, 0).ok, false);
  earn(s, 1e6);
  assert.ok(prestige(s, 0).ok);
  assert.equal(layerState(s, 0).count, 2);
  assert.ok(layerState(s, 0).total.eq(3)); // 2 + 1
});

test('layer 1 prestige resets layer 0 (currency, total, tree) but keeps its count; layer 1 keeps its own', () => {
  const s = fresh();
  earn(s, '1e10'); // gain 100
  prestige(s, 0);
  buyNode(s, 0, 'L0-income');
  assert.ok(layerState(s, 0).tree['L0-income'] === 1);
  assert.ok(gainFor(s, 1).eq(1)); // sqrt(100/100)
  const r = prestige(s, 1);
  assert.ok(r.ok);
  assert.equal(layerState(s, 0).count, 1);
  assert.ok(layerState(s, 0).currency.isZero() && layerState(s, 0).total.isZero());
  assert.deepEqual(layerState(s, 0).tree, {});
  assert.ok(layerState(s, 1).currency.eq(1));
  assert.equal(s.region, 2);
  assert.equal(visibleLayers(s), 3); // layer 2 appears once layer 1 has been prestiged
});

test('tree: cost formula, balance checked first, max level, endless node never maxes', () => {
  const s = fresh();
  earn(s, '1e10');
  prestige(s, 0); // 100 points
  const def = layerDef(0);
  const node = def.tree.find((n) => n.id === 'L0-income');
  assert.ok(nodeCost(node, 0).eq(1));
  assert.ok(Math.abs(nodeCost(node, 3).toNumber() - 2.2 ** 3) < 1e-9);
  const before = layerState(s, 0).currency;
  assert.equal(buyNode(s, 0, 'nope').ok, false);
  assert.ok(buyNode(s, 0, 'L0-income').ok);
  assert.ok(layerState(s, 0).currency.lt(before));
  const poor = fresh();
  assert.equal(buyNode(poor, 0, 'L0-income').ok, false);
  assert.ok(layerState(poor, 0).currency.isZero()); // never negative
  const land = def.tree.find((n) => n.id === 'L0-land');
  layerState(s, 0).currency = big('1e30');
  for (let i = 0; i < land.max; i++) assert.ok(buyNode(s, 0, land.id).ok);
  assert.equal(buyNode(s, 0, land.id).reason, 'Already at max level');
  const endless = def.tree.find((n) => n.id === 'L0-endless');
  assert.equal(endless.max, 0);
  for (let i = 0; i < 60; i++) assert.ok(buyNode(s, 0, endless.id).ok);
  assert.equal(nodeInfo(s, 0, endless).maxed, false);
});

test('tree effects reach the economy: income, luck, roll cost, starting money, backpack, free cap', () => {
  const s = fresh();
  layerState(s, 0).currency = big('1e12');
  const m0 = modifiers(s);
  const cost0 = rollCost(s);
  for (const id of ['L0-income', 'L0-luck', 'L0-roll', 'L0-start', 'L0-bag', 'L0-free', 'L0-xp', 'L0-land']) assert.ok(buyNode(s, 0, id).ok, id);
  const m1 = modifiers(s);
  assert.ok(Math.abs(m1.income.toNumber() - 1.25) < 1e-9);
  assert.ok(Math.abs(m1.luck.toNumber() - 1.1) < 1e-9);
  assert.ok(Math.abs(m1.xp.toNumber() - 1.2) < 1e-9);
  assert.ok(rollCost(s).lt(cost0));
  assert.equal(m1.backpackBonus, m0.backpackBonus + 3);
  assert.equal(m1.freeCap, m0.freeCap + 1);
  assert.ok(m1.startMoney.eq(500));
  assert.equal(m1.startSide, 1);
});

test('currency multiplier = 1 + a * total^b (diminishing), applied to the layer kind; lower-layer boost from the layer above', () => {
  const d = layerDef(0);
  assert.ok(currencyMultiplier(d, 0).eq(1));
  assert.ok(Math.abs(currencyMultiplier(d, 100).toNumber() - (1 + 0.5 * 100 ** 0.8)) < 1e-9);
  assert.ok(currencyMultiplier(d, 1e6).toNumber() / currencyMultiplier(d, 1e3).toNumber() < 1e3 ** 0.8 + 1); // sub-linear
  const s = fresh();
  layerState(s, 0).total = big(100);
  assert.ok(Math.abs(modifiers(s).income.toNumber() - (1 + 0.5 * 100 ** 0.8)) < 1e-6);
  const s2 = fresh();
  layerState(s2, 1).total = big(100);
  earn(s2, 1e8);
  const withBoost = gainFor(s2, 0);
  assert.ok(withBoost.eq(Math.floor(10 * lowerLayerBoost(big(100)).toNumber())));
  assert.ok(luckOf(s2).gt(1)); // layer 1 kind is luck
});

test('layers are endless: layer 50, 500 and 50000 are generated with names, trees, thresholds and valid effects', () => {
  assert.equal(HAND_LAYER_COUNT, 3);
  const names = new Set();
  for (const k of [3, 4, 10, 50, 500, 50000]) {
    const d = layerDef(k);
    assert.equal(d.k, k);
    names.add(d.name);
    assert.ok(d.currency.name.length > 3 && d.currency.icon);
    assert.ok(d.threshold.isFinite() && d.threshold.gt(layerDef(k - 1).threshold));
    assert.ok(d.a > 0 && d.b > 0 && d.exponent > 0);
    assert.ok(d.tree.length >= 10);
    assert.ok(d.tree.some((n) => n.max === 0)); // an endless sink in every layer
    for (const n of d.tree) assert.ok(n.cost.isFinite() && n.cost.gt(0) && n.per >= 0);
    assert.deepEqual(d, layerDef(k)); // cached/deterministic
  }
  assert.equal(names.size, 6);
  assert.ok(layerDef(60).tree[0].cost.gt(layerDef(5).tree[0].cost));
});

test('a generated layer is a real, playable prestige layer (layer 3 and layer 12 prestige and apply their rule)', () => {
  for (const k of [3, 12]) {
    const s = fresh();
    layerState(s, k - 1).run = layerDef(k).threshold.mul(4);
    assert.ok(gainFor(s, k).eq(2), `layer ${k}`);
    const r = prestige(s, k);
    assert.ok(r.ok);
    assert.ok(layerState(s, k).currency.eq(2));
    assert.equal(s.region, 1);
    const m = modifiers(s);
    assert.ok(m.income.isFinite() && m.luck.isFinite());
  }
});

test('numbers stay finite through very high layers and huge currency', () => {
  const s = fresh();
  for (const k of [0, 1, 2, 3, 20, 200]) {
    const ls = layerState(s, k);
    ls.total = big('1e5000');
    ls.currency = big('1e5000');
    ls.count = 1e9;
    for (const n of layerDef(k).tree.slice(0, 4)) ls.tree[n.id] = 25;
  }
  const m = modifiers(s);
  for (const v of [m.income, m.luck, m.xp, m.dmg, m.baseHp, m.rate, m.sellMult]) {
    assert.ok(v.isFinite() && !v.isNegative());
    assert.ok(!/NaN|Infinity/.test(v.format()));
  }
  assert.ok(Number.isFinite(m.rollCostMult) && m.rollCostMult > 0);
  assert.ok(Number.isFinite(m.freeIntervalMult) && m.freeIntervalMult > 0);
  assert.ok(m.startSide <= 26);
  assert.ok(luckOf(s).isFinite() && rollCost(s).isFinite());
});

test('every layer changes the region/theme; themes cycle forever', () => {
  const s = fresh();
  const seen = [];
  for (let i = 0; i < 12; i++) {
    layerState(s, 0).run = big(0);
    earn(s, 1e6);
    prestige(s, 0);
    seen.push(regionTheme(s.region, s.seed).id);
  }
  assert.equal(s.region, 12);
  assert.equal(new Set(seen).size, 12); // 5 base themes + remixes: all distinct ids
  assert.equal(regionTheme(5).base, regionTheme(0).base);
});

test('prestige preview describes losses and keeps; game.prestige demands confirmation', () => {
  const g = createGame({ storage: new MemoryStorage(), seed: 1 });
  g.debug.grantMoney(5e6);
  const pv = prestigePreview(g.state, 0);
  assert.ok(pv.gain.eq(2) && pv.loses.items === 2 && pv.keeps.length >= 3);
  const r = g.prestige(0);
  assert.equal(r.ok, false);
  assert.equal(r.needsConfirm, true);
  assert.equal(g.state.region, 0); // nothing happened
  assert.ok(g.prestige(0, { confirmed: true }).ok);
  assert.equal(g.state.region, 1);
});

test('layers survive save/load and old saves without layers load fine', () => {
  const s = fresh();
  earn(s, '1e10');
  prestige(s, 0);
  buyNode(s, 0, 'L0-income');
  prestige(s, 1) && 0;
  const t = deserializeState(JSON.parse(JSON.stringify(serializeState(s, 1))));
  assert.equal(t.layers.length, s.layers.length);
  assert.ok(t.layers[0].currency.eq(s.layers[0].currency));
  assert.equal(t.region, s.region);
  assert.deepEqual(t.layers[0].tree, s.layers[0].tree);
  const data = JSON.parse(JSON.stringify(serializeState(s, 1)));
  delete data.layers;
  assert.equal(deserializeState(data).layers.length, 0);
  data.layers = [{ count: 'x', currency: 'junk', tree: { a: -1, b: 'z', c: 3 } }, null];
  const u = deserializeState(data);
  assert.ok(u.layers[0].currency.isZero());
  assert.deepEqual(u.layers[0].tree, { c: 3 });
  assert.equal(u.layers[1].count, 0);
  assert.ok(applyLayerMods && true);
});
