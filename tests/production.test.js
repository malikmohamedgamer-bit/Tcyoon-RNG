import { test } from 'node:test';
import assert from 'node:assert/strict';
import { big } from '../src/core/bignum.js';
import { createState } from '../src/sim/state.js';
import { computeProduction, refreshProduction, stepProduction, megaBonus } from '../src/sim/production.js';
import { place, rotate, pickUp, sellPlaced, expand, expandCost, canPlace, autoLayout, savePreset, loadPreset, deletePreset, itemAt, MAX_SIDE } from '../src/sim/placement.js';
import { addToBag } from '../src/sim/inventory.js';
import { addMoney } from '../src/sim/economy.js';

const near = (a, b, rel = 1e-9) => Math.abs(a.toNumber() - b) <= rel * Math.max(1, Math.abs(b));
const blank = () => {
  const s = createState(1, 0);
  for (const u of [...s.bag]) delete s.items[u];
  s.bag = [];
  s.money = big(1e6);
  return s;
};
const give = (s, tpl, tier = 0, mut = []) => addToBag(s, { tpl, tier, vs: 0, hy: null, mut }, { force: true }).uid;
const put = (s, tpl, x, y, dir = 0, tier = 0, mut = []) => {
  const u = give(s, tpl, tier, mut);
  const r = place(s, u, x, y, dir);
  assert.ok(r.ok, r.reason);
  return u;
};

test('dropper -> seller: income = rate * value * sell multiplier', () => {
  const s = blank();
  put(s, 'pebble_drill', 0, 0);
  put(s, 'stall', 1, 0);
  assert.ok(near(computeProduction(s).income, 1 * 1 * 1.3));
});

test('every item on the path applies its effect in order (multiplier then upgrader differs from upgrader then multiplier)', () => {
  const a = blank();
  put(a, 'pebble_drill', 0, 0);
  put(a, 'amp', 1, 0); // x1.25
  put(a, 'tuner', 2, 0); // +0.6 per unit
  put(a, 'stall', 3, 0);
  assert.ok(near(computeProduction(a).income, (1 * 1.25 + 0.6) * 1.3)); // (w*1.25 + u*0.6) * sell
  const b = blank();
  put(b, 'pebble_drill', 0, 0);
  put(b, 'tuner', 1, 0);
  put(b, 'amp', 2, 0);
  put(b, 'stall', 3, 0);
  assert.ok(near(computeProduction(b).income, (1 + 0.6) * 1.25 * 1.3));
  assert.ok(computeProduction(b).income.gt(computeProduction(a).income)); // order matters
});

test('conveyors carry in their direction; turning corners works', () => {
  const s = blank();
  put(s, 'pebble_drill', 0, 0, 1); // faces south
  put(s, 'belt', 0, 1, 0); // east
  put(s, 'belt', 1, 1, 3); // north
  put(s, 'stall', 1, 0, 0);
  assert.ok(near(computeProduction(s).income, 1.3));
});

test('blocked flow: facing an empty cell, a wall, a turret, or a loop produces nothing and flags the item', () => {
  const s = blank();
  const d = put(s, 'pebble_drill', 0, 0, 3); // faces north: edge
  put(s, 'stall', 5, 5);
  const p = computeProduction(s);
  assert.ok(p.income.isZero());
  assert.ok(p.blocked.includes(d));
  // facing a turret
  const s2 = blank();
  s2.level = 5;
  put(s2, 'pebble_drill', 0, 0, 0);
  put(s2, 'gun_turret', 1, 0, 0);
  assert.ok(computeProduction(s2).income.isZero());
  // loop
  const s3 = blank();
  put(s3, 'pebble_drill', 0, 0, 0);
  put(s3, 'belt', 1, 0, 1);
  put(s3, 'belt', 1, 1, 2);
  put(s3, 'belt', 0, 1, 3);
  assert.ok(computeProduction(s3).income.isZero());
});

test('loops are detected and never hang or crash', () => {
  const s = blank();
  put(s, 'belt', 0, 0, 0);
  put(s, 'belt', 1, 0, 1);
  put(s, 'belt', 1, 1, 2);
  put(s, 'belt', 0, 1, 3);
  const p = computeProduction(s);
  assert.ok(p.income.isZero());
  assert.equal(p.blocked.length, 4);
});

test('throughput caps limit merged flow; a faster conveyor fixes it', () => {
  const mk = (convTpl) => {
    const s = blank();
    s.base.side = 8;
    for (let i = 0; i < 4; i++) put(s, 'slime_vat', i, 0, 0); // 4 x 3 units/s = 12... belt cap 12 at tier0
    put(s, convTpl, 4, 0);
    put(s, 'bazaar', 5, 0);
    return computeProduction(s).income;
  };
  const slow = mk('belt');
  const fast = mk('hyperlane');
  assert.ok(fast.gte(slow));
  // 12 units/s * 0.35 value, seller bazaar cap 16, mult 1.15
  assert.ok(near(slow, 12 * 0.35 * 1.15));
  const s = blank();
  s.base.side = 8;
  for (let i = 0; i < 5; i++) put(s, 'slime_vat', i, 0, 0); // 15 units/s into belt cap 12
  put(s, 'belt', 5, 0);
  put(s, 'bazaar', 6, 0);
  assert.ok(near(computeProduction(s).income, 12 * 0.35 * 1.15)); // 3 units/s lost to the cap
});

test('seller capacity limits sales (excess units are lost)', () => {
  const s = blank();
  for (let i = 0; i < 3; i++) put(s, 'slime_vat', i, 0, 0); // 9 units/s
  put(s, 'stall', 3, 0); // cap 6
  assert.ok(near(computeProduction(s).income, 6 / 9 * (9 * 0.35) * 1.3));
});

test('refiner multiplies only up to its capacity', () => {
  const s = blank();
  put(s, 'slime_vat', 0, 0); // 3 units/s, 1.05 value/s
  put(s, 'crucible', 1, 0); // refine +100% up to 2 units/s
  put(s, 'bazaar', 2, 0);
  const w = 3 * 0.35;
  const factor = 1 + 1.0 * (2 / 3);
  assert.ok(near(computeProduction(s).income, w * factor * 1.15));
});

test('dynamo boosts adjacent droppers; clover and lamp add global luck/xp', () => {
  const s = blank();
  put(s, 'pebble_drill', 1, 1, 0);
  put(s, 'stall', 2, 1);
  const base = computeProduction(s).income;
  put(s, 'dynamo', 1, 0, 0); // adjacent (above)
  assert.ok(near(computeProduction(s).income, base.toNumber() * 1.2));
  put(s, 'clover', 4, 4);
  put(s, 'lamp', 4, 5);
  const p = computeProduction(s);
  assert.ok(p.luck.gt(1.09) && p.xp.gt(1.09));
  refreshProduction(s);
  assert.ok(s._d.luck.gt(1));
});

test('mutations flow through: a Golden dropper triples income, Radiant doubles output value', () => {
  const s = blank();
  put(s, 'pebble_drill', 0, 0, 0, 0, [['golden', 1]]);
  put(s, 'stall', 1, 0);
  assert.ok(near(computeProduction(s).income, 3 * 1.3));
  const r = blank();
  put(r, 'pebble_drill', 0, 0, 0, 0, [['radiant', 1]]);
  put(r, 'stall', 1, 0);
  assert.ok(near(computeProduction(r).income, 2 * 1.3));
});

test('per-item income attribution sums to total income', () => {
  const s = blank();
  put(s, 'pebble_drill', 0, 0);
  put(s, 'gem_forge', 1, 0, 0, 2);
  put(s, 'amp', 2, 0);
  put(s, 'tuner', 3, 0);
  put(s, 'stall', 4, 0);
  put(s, 'ore_pump', 0, 3);
  put(s, 'stall', 1, 3);
  const p = computeProduction(s);
  let sum = big(0);
  for (const v of p.perItem.values()) sum = sum.add(v.out);
  assert.ok(near(sum, p.income.toNumber(), 1e-9), `${sum.toNumber()} vs ${p.income.toNumber()}`);
  assert.ok(p.income.gt(0));
});

test('income stays finite at absurd tiers and with huge multipliers', () => {
  const s = blank();
  put(s, 'pebble_drill', 0, 0, 0, 1e6);
  for (let i = 1; i < 5; i++) put(s, 'amp', i, 0, 0, 1e6);
  put(s, 'stall', 5, 0, 0, 1e6);
  const p = computeProduction(s);
  assert.ok(p.income.isFinite() && p.income.gt('1e1000'));
  assert.ok(!/NaN|Infinity/.test(p.income.format()));
});

test('stepProduction credits money = income * dt', () => {
  const s = blank();
  put(s, 'pebble_drill', 0, 0);
  put(s, 'stall', 1, 0);
  s.money = big(0);
  for (let i = 0; i < 100; i++) stepProduction(s, 0.1, addMoney);
  assert.ok(near(s.money, 13, 1e-9));
  assert.ok(near(s.runMoney, 13, 1e-9));
});

// ------------------------------------------------------------------ placement rules
test('placement: bounds, occupied cells, weapons, unknown items', () => {
  const s = blank();
  const a = give(s, 'belt');
  const b = give(s, 'belt');
  const w = give(s, 'bolt_rifle');
  assert.equal(canPlace(s, a, -1, 0).ok, false);
  assert.equal(canPlace(s, a, 6, 0).ok, false);
  assert.equal(canPlace(s, a, 1.5, 0).ok, false);
  assert.equal(canPlace(s, w, 0, 0).ok, false);
  assert.equal(canPlace(s, 999, 0, 0).ok, false);
  assert.ok(place(s, a, 2, 2).ok);
  assert.equal(place(s, b, 2, 2).ok, false); // occupied
  assert.equal(s.items[b].loc, 'bag');
  assert.equal(s.bag.includes(a), false);
});

test('move, swap, rotate, pick up (blocked when the backpack is full), sell from base', () => {
  const s = blank();
  const a = put(s, 'belt', 0, 0);
  const b = put(s, 'amp', 1, 0);
  assert.ok(place(s, a, 3, 3).ok); // move
  assert.equal(itemAt(s, 3, 3).uid, a);
  const sw = place(s, a, 1, 0); // swap onto b
  assert.ok(sw.ok && sw.swapped);
  assert.equal(itemAt(s, 1, 0).uid, a);
  assert.equal(itemAt(s, 3, 3).uid, b);
  assert.equal(rotate(s, a).dir, 1);
  assert.equal(rotate(s, a, -2).dir, 3);
  assert.equal(rotate(s, 999).ok, false);
  while (s.bag.length < 20) give(s, 'belt');
  assert.equal(pickUp(s, a).ok, false);
  assert.ok(pickUp(s, a, { force: true }).ok);
  s.bag.pop();
  delete s.items[s.bag.pop()];
  const before = s.money;
  assert.ok(sellPlaced(s, b).ok);
  assert.ok(s.money.gt(before));
  assert.equal(s.items[b], undefined);
});

test('base expansion: price formula, grows to the max, then mega tiles with a soft-capped bonus', () => {
  const s = blank();
  s.money = big('1e300');
  assert.ok(near(expandCost(s), 150));
  assert.equal(s.base.side, 6);
  expand(s);
  assert.equal(s.base.side, 7);
  assert.ok(near(expandCost(s), 150 * 1.9));
  while (s.base.side < MAX_SIDE) expand(s);
  assert.equal(s.base.side, 32);
  const r = expand(s);
  assert.equal(r.mega, 1);
  assert.equal(s.base.side, 32);
  for (let i = 0; i < 1000; i++) {
    s.money = big('1e300');
    expand(s);
  }
  assert.ok(megaBonus(1000) < 2.5 && megaBonus(1000) > 2.49);
  assert.equal(megaBonus(0), 1);
  const poor = blank();
  poor.money = big(10);
  assert.equal(expand(poor).ok, false);
  assert.ok(poor.money.eq(10)); // checked before spending
});

test('expansion mega bonus multiplies income', () => {
  const s = blank();
  put(s, 'pebble_drill', 0, 0);
  put(s, 'stall', 1, 0);
  const a = computeProduction(s).income;
  s.base.mega = 20;
  assert.ok(computeProduction(s).income.gt(a));
});

test('presets: save, rearrange, load back; missing items skipped; backpack room required', () => {
  const s = blank();
  const a = put(s, 'pebble_drill', 0, 0);
  const b = put(s, 'stall', 1, 0);
  assert.ok(savePreset(s, 'Lane').ok);
  place(s, a, 4, 4);
  place(s, b, 5, 5);
  assert.ok(loadPreset(s, 0).ok);
  assert.equal(itemAt(s, 0, 0).uid, a);
  assert.equal(itemAt(s, 1, 0).uid, b);
  // an extra placed item not in the preset returns to the backpack
  const c = put(s, 'belt', 3, 3);
  assert.ok(loadPreset(s, 0).ok);
  assert.equal(s.items[c].loc, 'bag');
  // sold item is skipped
  place(s, c, 3, 3);
  sellPlaced(s, b);
  const r = loadPreset(s, 0);
  assert.ok(r.ok && r.skipped === 1);
  // no room: evictions need space
  while (s.bag.length < 20) give(s, 'belt');
  place(s, s.bag[0], 2, 2);
  s.bag.push(give(s, 'belt'));
  const full = loadPreset(s, 0);
  assert.equal(full.ok, false);
  assert.match(full.reason, /backpack slot/);
  assert.ok(deletePreset(s, 0).ok);
  assert.equal(loadPreset(s, 0).ok, false);
});

test('autoLayout builds a working lane layout that earns money, and keeps every item', () => {
  const s = blank();
  for (let i = 0; i < 5; i++) give(s, i % 2 ? 'ore_pump' : 'pebble_drill', i % 3);
  give(s, 'amp', 2);
  give(s, 'tuner', 1);
  give(s, 'smelter', 1);
  give(s, 'stall', 0);
  give(s, 'bazaar', 1);
  give(s, 'dynamo', 2);
  const total = Object.keys(s.items).length;
  const r = autoLayout(s);
  assert.ok(r.placed >= 9);
  assert.equal(Object.keys(s.items).length, total);
  assert.ok(computeProduction(s).income.gt(0));
  assert.equal(computeProduction(s).blocked.length, 0);
  // cells are unique
  const cells = Object.values(s.items).filter((i) => i.loc === 'placed').map((i) => `${i.x},${i.y}`);
  assert.equal(new Set(cells).size, cells.length);
  // idempotent income
  const inc = computeProduction(s).income;
  autoLayout(s);
  assert.ok(near(computeProduction(s).income, inc.toNumber()));
});
