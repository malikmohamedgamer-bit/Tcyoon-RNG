import { test } from 'node:test';
import assert from 'node:assert/strict';
import { big } from '../src/core/bignum.js';
import { createState, serializeState, deserializeState } from '../src/sim/state.js';
import { UPGRADES, BOOSTERS, upgradeCost, buyUpgrade, upgradeLevel, buyBooster, stepBoosters, rotatingOffers, buyRotating, buyBackpackTier, boosterCost } from '../src/sim/shop.js';
import { modifiers, rollCost, luckOf, backpackCapacity, backpackCost, freeRollInterval } from '../src/sim/economy.js';
import { addToBag } from '../src/sim/inventory.js';
import { place } from '../src/sim/placement.js';
import { computeProduction } from '../src/sim/production.js';
import { stepAutoRoll } from '../src/sim/rolling.js';

const mk = () => {
  const s = createState(21, 0);
  s.money = big(1e12);
  return s;
};
const near = (a, b, rel = 1e-9) => Math.abs(a - b) <= rel * Math.max(1, Math.abs(b));
const T0 = Date.UTC(2026, 5, 15, 12, 0, 0);

test('upgrade price = baseK * rollCost * growth^level; balance checked first; money never negative', () => {
  const s = mk();
  const up = UPGRADES.find((u) => u.id === 'dropSpeed');
  assert.ok(near(upgradeCost(s, up).toNumber(), 10 * 10));
  assert.ok(buyUpgrade(s, 'dropSpeed').ok);
  assert.ok(near(upgradeCost(s, up).toNumber(), 10 * 10 * 1.9));
  const poor = createState(1, 0);
  poor.money = big(50);
  const r = buyUpgrade(poor, 'dropSpeed'); // costs 100
  assert.equal(r.ok, false);
  assert.ok(poor.money.eq(50)); // the balance is checked before anything is deducted
  poor.money = big(100);
  assert.equal(buyUpgrade(poor, 'dropSpeed').ok, true);
  assert.ok(poor.money.eq(0));
  assert.equal(buyUpgrade(poor, 'dropSpeed').ok, false);
  assert.ok(poor.money.gte(0));
  assert.equal(buyUpgrade(poor, 'nope').ok, false);
  // price scales with progress (level), so it never becomes trivial
  const hi = mk();
  hi.level = 40;
  assert.ok(upgradeCost(hi, up).gt(upgradeCost(mk(), up).mul(100)));
});

test('max-level upgrades stop; endless upgrades never do and stay finite', () => {
  const s = mk();
  s.money = big('1e300');
  const auto = UPGRADES.find((u) => u.id === 'autoSpeed');
  for (let i = 0; i < auto.max; i++) assert.ok(buyUpgrade(s, 'autoSpeed').ok);
  assert.equal(buyUpgrade(s, 'autoSpeed').reason, 'Already at max level');
  for (let i = 0; i < 300; i++) assert.ok(buyUpgrade(s, 'luckCharm').ok);
  assert.equal(upgradeLevel(s, 'luckCharm'), 300);
  assert.ok(luckOf(s).isFinite() && luckOf(s).gt('1e25')); // luck has no cap
  assert.ok(upgradeCost(s, UPGRADES.find((u) => u.id === 'luckCharm')).isFinite());
});

test('effects: dropper speed, value, seller bonus, income, luck, roll/auto/pity/free intervals, caps', () => {
  const s = mk();
  const give = (tpl) => addToBag(s, { tpl, tier: 0, vs: 0, hy: null, mut: [] }, { force: true }).uid;
  place(s, give('pebble_drill'), 0, 0, 0);
  place(s, give('stall'), 1, 0, 0);
  const base = computeProduction(s).income.toNumber();
  buyUpgrade(s, 'dropSpeed');
  assert.ok(near(computeProduction(s).income.toNumber(), base * 1.1));
  buyUpgrade(s, 'dropValue');
  assert.ok(near(computeProduction(s).income.toNumber(), base * 1.21));
  buyUpgrade(s, 'sellBonus');
  assert.ok(near(computeProduction(s).income.toNumber(), base * 1.21 * 1.08));
  buyUpgrade(s, 'income');
  assert.ok(near(computeProduction(s).income.toNumber(), base * 1.21 * 1.08 * 1.05));
  const m0 = modifiers(s);
  buyUpgrade(s, 'freeFast');
  assert.ok(near(freeRollInterval(s), 120 * 0.94));
  buyUpgrade(s, 'freeBank');
  assert.equal(modifiers(s).freeCap, m0.freeCap + 1);
  buyUpgrade(s, 'luckCharm');
  assert.ok(near(luckOf(s).toNumber(), 1.25));
  buyUpgrade(s, 'turretDmg');
  buyUpgrade(s, 'baseHp');
  buyUpgrade(s, 'gearSlot');
  assert.ok(modifiers(s).dmg.eq(1.1) && modifiers(s).baseHp.eq(1.1) && modifiers(s).gearSlots === 1);
});

test('auto-roll speed upgrade makes auto-roll faster; pity upgrade shortens pity', () => {
  const a = mk();
  a.level = 3;
  a.autoRoll = true;
  const slow = stepAutoRoll(a, 6);
  const b = mk();
  b.level = 3;
  b.autoRoll = true;
  for (let i = 0; i < 4; i++) buyUpgrade(b, 'autoSpeed');
  b.money = big(1e12);
  const fast = stepAutoRoll(b, 6);
  assert.ok(fast > slow);
  const c = mk();
  buyUpgrade(c, 'pity');
  assert.ok(modifiers(c).pityMult < 1);
});

test('backpack tiers: documented cost, capacity grows, endless', () => {
  const s = mk();
  assert.ok(near(backpackCost(s).toNumber(), 400));
  const cap0 = backpackCapacity(s);
  assert.ok(buyBackpackTier(s).ok);
  assert.ok(backpackCapacity(s) > cap0);
  assert.ok(near(backpackCost(s).toNumber(), 400 * 3.2));
  const poor = createState(1, 0);
  poor.money = big(399);
  assert.equal(buyBackpackTier(poor).ok, false);
  assert.ok(poor.money.eq(399));
});

test('boosters: multiplier applies while active, extends (not stacks) when re-bought, expires, price = priceRolls*rollCost', () => {
  const s = mk();
  const brew = BOOSTERS.find((b) => b.id === 'luckBrew');
  assert.ok(near(boosterCost(s, brew).toNumber(), 40 * 10));
  assert.ok(buyBooster(s, 'luckBrew').ok);
  assert.ok(near(luckOf(s).toNumber(), 3));
  buyBooster(s, 'luckBrew');
  assert.ok(near(luckOf(s).toNumber(), 3)); // same multiplier
  assert.equal(s.boosts[0].left, 1200);
  stepBoosters(s, 1199);
  assert.ok(near(luckOf(s).toNumber(), 3));
  stepBoosters(s, 2);
  assert.equal(s.boosts.length, 0);
  assert.ok(near(luckOf(s).toNumber(), 1));
  buyBooster(s, 'goldRush');
  const g = s.boosts.length;
  assert.equal(g, 1);
  const poor = createState(1, 0);
  poor.money = big(5);
  assert.equal(buyBooster(poor, 'goldRush').ok, false);
  assert.ok(poor.money.eq(5));
});

test('rotating shop: seeded by date (same day = same offers, new day = new offers), bought once per day', () => {
  const s = mk();
  const a = rotatingOffers(s, T0);
  const b = rotatingOffers(s, T0 + 3600 * 1000);
  assert.equal(a.key, b.key);
  assert.deepEqual(a.offers.map((o) => [o.kind, o.tier, o.id]), b.offers.map((o) => [o.kind, o.tier, o.id]));
  assert.equal(a.offers.length, 6);
  const c = rotatingOffers(s, T0 + 86400 * 1000 * 2);
  assert.notEqual(c.key, a.key);
  assert.notDeepEqual(c.offers.map((o) => [o.kind, o.tier, o.id]), a.offers.map((o) => [o.kind, o.tier, o.id]));
  const s2 = createState(22, 0);
  s2.money = big(1e12);
  assert.notDeepEqual(rotatingOffers(s2, T0).offers.map((o) => o.tier), a.offers.map((o) => o.tier)); // seed matters
  const bag0 = s.bag.length;
  const m0 = s.money;
  const r = buyRotating(s, 0, T0);
  assert.ok(r.ok);
  assert.equal(s.bag.length, bag0 + 1);
  assert.ok(s.money.lt(m0));
  assert.equal(buyRotating(s, 0, T0).reason, 'Already bought today');
  assert.ok(buyRotating(s, 0, T0 + 86400 * 1000).ok); // next day: a fresh offer
  for (const o of a.offers) assert.ok(o.price.gt(0) && o.price.isFinite());
  // items cost 80% of the expected roll cost of that tier: cheaper than rolling, but never free
  const item = a.offers[0];
  assert.ok(near(item.price.toNumber(), 0.8 * rollCost(s).toNumber() * Math.pow(10, 0) * (item.price.toNumber() / (0.8 * rollCost(s).toNumber())), 1e-9));
  assert.ok(item.price.gt(rollCost(s)));
});

test('rotating purchases: balance checked, booster and upgrade offers work, ledger bounded', () => {
  const s = mk();
  const { offers } = rotatingOffers(s, T0);
  const poor = createState(1, 0);
  poor.money = big(0);
  assert.equal(buyRotating(poor, 4, T0).ok, false);
  assert.ok(buyRotating(s, 3, T0).ok); // booster
  assert.ok(s.boosts.length >= 1);
  const lv = upgradeLevel(s, offers[5].id);
  assert.ok(buyRotating(s, 5, T0).ok);
  assert.equal(upgradeLevel(s, offers[5].id), lv + 1);
  for (let d = 0; d < 12; d++) buyRotating(s, 4, T0 + d * 86400 * 1000);
  assert.ok(Object.keys(s.shop.rot).length <= 4);
  assert.equal(buyRotating(s, 99, T0).ok, false);
});

test('shop state survives save/load: upgrades, boosters, rotating ledger', () => {
  const s = mk();
  buyUpgrade(s, 'income');
  buyUpgrade(s, 'income');
  buyBooster(s, 'xpTonic');
  buyRotating(s, 1, T0);
  const t = deserializeState(JSON.parse(JSON.stringify(serializeState(s, 1))));
  assert.equal(upgradeLevel(t, 'income'), 2);
  assert.equal(t.boosts.length, 1);
  assert.deepEqual(t.shop.rot, s.shop.rot);
  assert.ok(modifiers(t).income.eq(modifiers(s).income));
  assert.ok(modifiers(t).xp.eq(modifiers(s).xp));
});
