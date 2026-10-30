import { test } from 'node:test';
import assert from 'node:assert/strict';
import { big } from '../src/core/bignum.js';
import { createState, serializeState, deserializeState } from '../src/sim/state.js';
import { levelReward, grantLevelReward, describeReward, HAND_LEVELS } from '../src/sim/rewards.js';
import { addXp, xpForLevel } from '../src/sim/leveling.js';
import { backpackCapacity, luckOf, modifiers, rollCost } from '../src/sim/economy.js';
import { drain } from '../src/core/events.js';
import { doRoll, typicalTier } from '../src/sim/rolling.js';
import { sellItem } from '../src/sim/inventory.js';
import { freeRollCap } from '../src/sim/economy.js';

test('levelReward is pure, deterministic and always sane for any level', () => {
  for (const L of [2, 3, 10, 11, 20, 21, 33, 100, 250, 9999, 1e6]) {
    const a = levelReward(L);
    assert.deepEqual(a, levelReward(L));
    assert.ok(a.rollPrices > 0);
    for (const k of ['freeRolls', 'backpack', 'luckPct', 'expansion', 'gear', 'freeCap']) assert.ok(!(k in a) || a[k] > 0, `${k} at ${L}`);
    for (const it of a.items || []) assert.ok((Number.isInteger(it.tier) && it.tier >= 0) || (Number.isInteger(it.tierPlus) && it.tierPlus >= 0 && it.tierPlus <= 2));
  }
  assert.equal(levelReward(0).level, 2);
  assert.equal(levelReward(NaN).level, 2);
});

test('hand-written levels win; generated levels follow the documented formula', () => {
  assert.ok(levelReward(4).hand && levelReward(4).items[0].tpl === 'gun_turret');
  assert.ok(levelReward(10).hand);
  const g = levelReward(30); // not hand written
  assert.equal(g.hand, false);
  assert.equal(g.rollPrices, 0.5 + 30 / 50);
  assert.equal(g.freeRolls, 2); // 30 is not a multiple of 4, but is a multiple of 10 (+2)
  assert.equal(g.backpack, 2);
  assert.equal(g.expansion, 1); // 30 % 15
  assert.deepEqual(g.items, [{ tierPlus: 2 }]);
  const h = levelReward(21);
  assert.equal(h.luckPct, 3);
  assert.ok(!('items' in h) && !('freeRolls' in h));
  assert.equal(levelReward(28).freeRolls, 1);
  assert.deepEqual(levelReward(24).items, [{ tierPlus: 1 }]);
  assert.equal(levelReward(50).gear, 1);
  assert.equal(levelReward(40).freeCap, 1);
  assert.ok(Object.keys(HAND_LEVELS).length >= 10);
});

test('every reward is granted exactly once, even if the hook fires twice', () => {
  const s = createState(1, 0);
  const m0 = s.money;
  assert.ok(grantLevelReward(s, 2));
  const m1 = s.money;
  assert.ok(m1.gt(m0));
  assert.equal(grantLevelReward(s, 2), null);
  assert.equal(grantLevelReward(s, 1), null);
  assert.ok(s.money.eq(m1));
  assert.equal(s.rewards.levelClaimed, 2);
});

test('levelling up through xp grants each level once, in order, with an event per reward', () => {
  const s = createState(2, 0);
  s.freeRoll.count = 0;
  addXp(s, xpForLevel(1).add(xpForLevel(2)).add(xpForLevel(3)).add(xpForLevel(4)).add(1));
  assert.equal(s.level, 5);
  assert.equal(s.rewards.levelClaimed, 5);
  const ev = drain(s).filter((e) => e.type === 'levelReward').map((e) => e.level);
  assert.deepEqual(ev, [2, 3, 4, 5]);
  // level 4 gave the guaranteed turret and a backpack bonus; level 5 gave luck and a free roll
  assert.ok(Object.values(s.items).some((i) => i.tpl === 'gun_turret' && i.tier === 1));
  assert.ok(s.bonus.backpack >= 2);
  assert.ok(luckOf(s).gt(1.05));
  assert.equal(s.freeRoll.count, 2); // 1 (L2) + 1 (L5), started from 0
});

test('bonuses feed the economy modifiers: backpack slots, luck, gear slots, free-roll cap', () => {
  const s = createState(3, 0);
  const cap0 = backpackCapacity(s);
  const luck0 = luckOf(s);
  const free0 = freeRollCap(s);
  grantLevelReward(s, 20);
  grantLevelReward(s, 21);
  assert.equal(backpackCapacity(s), cap0 + 4 + 0);
  assert.ok(luckOf(s).gt(luck0));
  assert.equal(modifiers(s).gearSlots, 1);
  assert.equal(freeRollCap(s), free0 + 1);
});

test('money reward scales with the level reached (roll prices)', () => {
  const s = createState(4, 0);
  s.level = 40;
  s.rewards.levelClaimed = 39;
  s.money = big(0);
  grantLevelReward(s, 40);
  const prices = s.money.div(rollCost(s)).toNumber();
  assert.ok(Math.abs(prices - (0.5 + 40 / 50)) < 1e-6);
});

test('free base expansion reward grows the base', () => {
  const s = createState(5, 0);
  s.rewards.levelClaimed = 7;
  grantLevelReward(s, 8);
  assert.equal(s.base.side, 7);
});

test('absurd xp: thousands of levels at once stay finite, fast, once-only and bounded in items', () => {
  const s = createState(6, 0);
  const t = Date.now();
  addXp(s, big('1e200'));
  assert.ok(Date.now() - t < 5000);
  assert.ok(s.level > 1000);
  assert.equal(s.rewards.levelClaimed, s.level);
  assert.ok(s.money.isFinite() && s.money.gt(0));
  assert.ok(s.bag.length <= backpackCapacity(s) + 41);
  assert.ok(luckOf(s).isFinite());
});

test('reward state survives save/load, so a reload cannot re-grant', () => {
  const s = createState(7, 0);
  addXp(s, xpForLevel(1).add(xpForLevel(2)).add(1));
  const t = deserializeState(JSON.parse(JSON.stringify(serializeState(s, 1))));
  assert.equal(t.rewards.levelClaimed, s.rewards.levelClaimed);
  assert.deepEqual(t.bonus.backpack, s.bonus.backpack);
  const before = t.money;
  assert.equal(grantLevelReward(t, 2), null);
  assert.ok(t.money.eq(before));
  assert.ok(t._onLevel);
});

test('descriptions are readable', () => {
  assert.match(describeReward(levelReward(10)), /unlocks Arena/);
  assert.match(describeReward(levelReward(30)), /free base expansion/);
});

// ---- the exploit the economy simulator found: levelling used to pay far more than it cost ----
function printerLoop({ xpMult = 1, bonusLuck = 1, rolls = 4000, seed = 5 }) {
  const s = createState(seed, 0);
  for (const u of [...s.bag]) delete s.items[u];
  s.bag = [];
  s.money = big('1e15');
  s.freeRoll.count = 0;
  s.bonus.luckPct = (bonusLuck - 1) * 100;
  if (xpMult !== 1) s._modFns.push((m) => { m.xp = m.xp.mul(xpMult); });
  const start = s.money;
  let lastLevel = s.level;
  for (let i = 0; i < rolls; i++) {
    const r = doRoll(s, 1);
    if (r.rolled[0]) sellItem(s, r.rolled[0].uid);
    else if (s.freeRoll.count === 0 && r.blocked === 'money') break;
    s.freeRoll.count = Math.min(s.freeRoll.count, 3);
    lastLevel = s.level;
  }
  return { start, end: s.money, level: lastLevel };
}

test('no money printing: rolling + selling + level rewards never nets a profit, at any xp multiplier or luck', () => {
  for (const [xpMult, bonusLuck] of [[1, 1], [6, 1], [100, 1], [1e6, 1], [1, 1e6], [50, 1e9]]) {
    const r = printerLoop({ xpMult, bonusLuck });
    assert.ok(r.end.lte(r.start), `xp x${xpMult}, luck x${bonusLuck}: money grew from ${r.start.format()} to ${r.end.format()} (level ${r.level})`);
    assert.ok(r.level > 1, `loop should level up at xp x${xpMult}`);
  }
});

test('levelling is paced: the first levels take real rolls and levels do not explode', () => {
  const s = createState(9, 0);
  s.money = big('1e12');
  s.freeRoll.count = 0;
  let rolls = 0;
  while (s.level < 5 && rolls < 2000) {
    const r = doRoll(s, 1);
    if (r.rolled[0]) sellItem(s, r.rolled[0].uid);
    rolls++;
  }
  assert.equal(s.level, 5);
  assert.ok(rolls >= 15 && rolls <= 400, `rolls to level 5: ${rolls}`);
});

test('reward item tiers are relative to your luck: even at level 1000 a reward is never far above what luck can roll', () => {
  const s = createState(77, 0);
  s.level = 999;
  s.rewards.levelClaimed = 999;
  grantLevelReward(s, 1000); // L % 10 == 0 -> an item
  const items = Object.values(s.items).filter((i) => i.tier > 0);
  assert.ok(items.length >= 1);
  const typical = typicalTier(luckOf(s));
  for (const it of items) assert.ok(it.tier <= typical + 2, `reward tier ${it.tier} vs typical ${typical}`);
  assert.ok(Math.max(...items.map((i) => i.tier)) < 12); // not tier 200
});
