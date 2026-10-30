import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../src/core/rng.js';
import { big } from '../src/core/bignum.js';
import { createState, serializeState, deserializeState } from '../src/sim/state.js';
import { doRoll, maxBatch, stepAutoRoll } from '../src/sim/rolling.js';
import { addToBag, sellItem, sellDuplicates, fuse, fuseChance, canFuse, bagFull, bagFree } from '../src/sim/inventory.js';
import { rollCost, backpackCapacity, backpackCost, sellValue, trySpend, luckOf } from '../src/sim/economy.js';
import { drain } from '../src/core/events.js';

const near = (a, b, rel = 1e-6) => Math.abs(a.toNumber() - b.toNumber()) <= rel * Math.max(1, Math.abs(b.toNumber()));
const mk = (seed = 7) => {
  const s = createState(seed, 0);
  s.money = big(1e9);
  return s;
};
const plain = (tpl, tier, mut = []) => ({ tpl, tier, vs: 0, hy: null, mut });

test('new game: starter kit in the backpack, one free roll, money set', () => {
  const s = createState(1, 0);
  assert.equal(s.bag.length, 2);
  assert.deepEqual(s.bag.map((u) => s.items[u].tpl), ['pebble_drill', 'stall']);
  assert.equal(s.freeRoll.count, 1);
  assert.ok(s.money.eq(100));
});

test('a roll costs money, lands in the backpack, and gives xp', () => {
  const s = mk();
  s.freeRoll.count = 0;
  const before = s.money;
  const r = doRoll(s, 1);
  assert.equal(r.rolled.length, 1);
  assert.equal(s.bag.length, 3);
  assert.ok(s.money.lt(before));
  assert.ok(near(before.sub(s.money), rollCost(s)));
  assert.ok(s.xp.gt(0));
  assert.equal(s.stats.rolls, 1);
});

test('free roll is used first and costs nothing', () => {
  const s = mk();
  const before = s.money;
  const r = doRoll(s, 1);
  assert.equal(r.freeUsed, 1);
  assert.ok(s.money.eq(before));
  assert.equal(s.freeRoll.count, 0);
});

test('backpack limit blocks a roll with a reason, and money is not spent', () => {
  const s = mk();
  s.freeRoll.count = 0;
  while (!bagFull(s)) addToBag(s, plain('belt', 0));
  const before = s.money;
  const r = doRoll(s, 1);
  assert.equal(r.blocked, 'full');
  assert.equal(r.rolled.length, 0);
  assert.ok(s.money.eq(before));
  assert.equal(bagFree(s), 0);
  assert.equal(drain(s).some((e) => e.type === 'blocked'), true);
});

test('multi-roll stops when the backpack fills and charges only performed rolls', () => {
  const s = mk();
  s.level = 15;
  s.freeRoll.count = 0;
  while (s.bag.length < backpackCapacity(s) - 3) addToBag(s, plain('belt', 0));
  const before = s.money;
  const r = doRoll(s, 10);
  assert.equal(r.rolled.length, 3);
  assert.equal(r.blocked, 'full');
  assert.ok(near(before.sub(s.money), rollCost(s).mul(3)));
});

test('x10 / x100 are locked until their level; money never goes negative', () => {
  const s = mk();
  assert.equal(maxBatch(s), 1);
  assert.equal(doRoll(s, 10).blocked, 'locked');
  s.level = 5;
  assert.equal(maxBatch(s), 10);
  s.level = 15;
  assert.equal(maxBatch(s), 100);
  const poor = createState(2, 0);
  poor.freeRoll.count = 0;
  poor.level = 15;
  poor.money = rollCost(poor).mul(1.5);
  const r = doRoll(poor, 100);
  assert.equal(r.blocked, 'money');
  assert.ok(poor.money.gte(0));
  assert.equal(r.rolled.length, 1);
});

test('trySpend checks the balance first', () => {
  const s = createState(1, 0);
  s.money = big(50);
  assert.equal(trySpend(s, 60), false);
  assert.ok(s.money.eq(50));
  assert.equal(trySpend(s, 50), true);
  assert.ok(s.money.isZero());
  assert.equal(trySpend(s, -5), false);
});

test('auto-roll rolls on a timer, stops when broke or full', () => {
  const s = mk();
  s.level = 3;
  s.autoRoll = true;
  const n = stepAutoRoll(s, 3);
  assert.ok(n >= 4 && n <= 6);
  s.money = big(0);
  s.freeRoll.count = 0;
  assert.equal(stepAutoRoll(s, 5), 0);
  s.level = 2;
  s.money = big(1e6);
  assert.equal(stepAutoRoll(s, 5), 0); // not unlocked
});

test('prices follow the documented formulas', () => {
  const s = createState(1, 0);
  assert.ok(rollCost(s).eq(10));
  s.level = 11;
  assert.ok(Math.abs(rollCost(s).toNumber() - 10 * Math.pow(1 + 10 / 10, 3)) < 1e-6); // 10 * (1 + (L-1)/10)^3 = 80
  assert.equal(backpackCapacity(s), 20);
  s.backpackTier = 3;
  assert.equal(backpackCapacity(s), 20 + 24 + Math.floor(Math.pow(3, 1.4)));
  assert.ok(Math.abs(backpackCost(s).toNumber() - 400 * Math.pow(3.2, 3)) < 1e-6);
  s.backpackTier = 1000; // endless capacity tiers
  assert.ok(backpackCost(s).isFinite() && backpackCapacity(s) > 8000);
});

test('sell: pays <= 50% of the roll price, removes the item, never negative', () => {
  const s = mk();
  const it = addToBag(s, plain('amp', 11, [['shiny', 1], ['golden', 1]]), { force: true });
  assert.ok(sellValue(s, it).lte(rollCost(s).mul(0.5)));
  const before = s.money;
  const r = sellItem(s, it.uid);
  assert.ok(r.ok);
  assert.ok(s.money.gt(before));
  assert.equal(s.items[it.uid], undefined);
  assert.equal(sellItem(s, it.uid).ok, false);
  // roll-then-sell can never be profitable at any luck
  for (const tier of [0, 5, 11, 40, 400]) assert.ok(sellValue(s, { tier, mut: [] }).lt(rollCost(s)));
});

test('sell duplicates keeps one of each exact duplicate', () => {
  const s = mk();
  for (let i = 0; i < 4; i++) addToBag(s, plain('belt', 0));
  addToBag(s, plain('belt', 1));
  const before = s.bag.length;
  const r = sellDuplicates(s);
  assert.equal(r.count, 3);
  assert.equal(s.bag.length, before - 3);
  assert.equal(s.bag.filter((u) => s.items[u].tpl === 'belt').length, 2);
});

test('fuse odds are documented: base 30% +10% per extra item +15% identical, cap 90%', () => {
  const mkItems = (n, same) => Array.from({ length: n }, (_, i) => plain(same ? 'belt' : i % 2 ? 'amp' : 'belt', 2));
  assert.ok(Math.abs(fuseChance(mkItems(3, false)) - 0.3) < 1e-9);
  assert.ok(Math.abs(fuseChance(mkItems(3, true)) - 0.45) < 1e-9);
  assert.ok(Math.abs(fuseChance(mkItems(5, false)) - 0.5) < 1e-9);
  assert.equal(fuseChance(mkItems(10, true)), 0.9);
  assert.equal(fuseChance(mkItems(2, true)), 0);
  assert.ok(Math.abs(fuseChance(mkItems(3, false), 0.1) - 0.4) < 1e-9);
});

test('fuse validation: count, same tier, in backpack, no weapon mixing', () => {
  const s = mk();
  const a = [1, 2, 3].map(() => addToBag(s, plain('belt', 2), { force: true }).uid);
  assert.equal(canFuse(s, a.slice(0, 2)).ok, false);
  const odd = addToBag(s, plain('belt', 3), { force: true }).uid;
  assert.equal(canFuse(s, [...a.slice(0, 2), odd]).ok, false);
  const w = addToBag(s, plain('bolt_rifle', 2), { force: true }).uid;
  assert.equal(canFuse(s, [...a.slice(0, 2), w]).ok, false);
  assert.equal(canFuse(s, a).ok, true);
  assert.equal(canFuse(s, [...a, 9999]).ok, false);
});

test('fuse empirical success rate matches the documented chance; inputs always consumed', () => {
  let wins = 0;
  const N = 4000;
  const rng = new Rng(123);
  for (let i = 0; i < N; i++) {
    const s = mk(i + 1);
    const ids = [1, 2, 3].map(() => addToBag(s, plain('belt', 2), { force: true }).uid);
    const before = s.bag.length;
    const r = fuse(s, ids, rng);
    assert.ok(r.ok);
    assert.equal(s.bag.length, before - 2);
    assert.equal(r.item.tier, r.success ? 3 : 2);
    if (r.success) wins++;
  }
  const p = wins / N;
  assert.ok(Math.abs(p - 0.45) < 0.04, `fuse success ${p}`); // identical x3 = 45% (pity pushes it up slightly)
});

test('fuse pity raises the chance after failures and resets on success', () => {
  const s = mk();
  s.fusePity = 4;
  const ids = [1, 2, 3].map(() => addToBag(s, plain('belt', 1), { force: true }).uid);
  const rng = { chance: (p) => { if (rng.p === undefined) rng.p = p; return true; }, pick: (a) => a[0], shuffle: (a) => a, next: () => 0, int: () => 0 };
  const r = fuse(s, ids, rng);
  assert.ok(Math.abs(rng.p - (0.45 + 0.2)) < 1e-9);
  assert.ok(r.success);
  assert.equal(s.fusePity, 0);
});

test('save round trip keeps items, money, rng stream and counters', () => {
  const s = mk(99);
  doRoll(s, 1);
  addToBag(s, plain('amp', 5, [['golden', 1]]), { force: true });
  const text = JSON.stringify(serializeState(s, 5));
  const t = deserializeState(JSON.parse(text));
  assert.equal(t.bag.length, s.bag.length);
  assert.ok(t.money.eq(s.money));
  assert.equal(t.level, s.level);
  assert.deepEqual(t.items[t.bag.at(-1)].mut, [['golden', 1]]);
  assert.equal(t.rng.u32(), s.rng.u32()); // the roll stream continues exactly
  assert.equal(t.nextUid, s.nextUid);
});

test('luck is >= 1 and never NaN', () => {
  const s = createState(1, 0);
  assert.ok(luckOf(s).gte(1));
  s.level = 1e6;
  assert.ok(luckOf(s).isFinite());
});

test('whole game is reproducible from a seed', () => {
  const run = () => {
    const s = mk(2024);
    s.level = 5;
    for (let i = 0; i < 6; i++) doRoll(s, 10);
    return s.bag.map((u) => `${s.items[u].tpl}:${s.items[u].tier}:${s.items[u].mut.map((m) => m[0])}`).join('|');
  };
  assert.equal(run(), run());
});
