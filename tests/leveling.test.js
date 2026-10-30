import { test } from 'node:test';
import assert from 'node:assert/strict';
import { big } from '../src/core/bignum.js';
import { createState } from '../src/sim/state.js';
import { xpForLevel, addXp, levelProgress, rollXp } from '../src/sim/leveling.js';
import { drain } from '../src/core/events.js';

test('xp requirement grows geometrically and is finite forever', () => {
  let prev = big(0);
  for (const l of [1, 2, 10, 100, 1000, 1e5, 1e7]) {
    const x = xpForLevel(l);
    assert.ok(x.isFinite() && x.gt(prev));
    prev = x;
  }
  assert.ok(xpForLevel(1).gt(0));
});

test('addXp levels up, carries remainder, emits events and calls the hook once per level', () => {
  const s = createState(1, 0);
  const seen = [];
  const gained = addXp(s, xpForLevel(1).add(xpForLevel(2)).add(1), (l) => seen.push(l));
  assert.equal(gained, 2);
  assert.equal(s.level, 3);
  assert.deepEqual(seen, [2, 3]);
  assert.ok(Math.abs(s.xp.toNumber() - 1) < 1e-6);
  assert.equal(drain(s).filter((e) => e.type === 'level').length, 2);
  assert.ok(levelProgress(s) > 0 && levelProgress(s) < 1);
});

test('absurd xp does not hang and never produces NaN', () => {
  const s = createState(1, 0);
  const t = Date.now();
  addXp(s, big('1e300'), () => {});
  assert.ok(Date.now() - t < 2000);
  assert.ok(s.level > 500);
  assert.ok(s.xp.isFinite() && !s.xp.isNegative());
  addXp(s, big(-5));
  assert.ok(!s.xp.isNegative());
});

test('rolling a rarer item gives more xp', () => {
  assert.ok(rollXp(1, 5).gt(rollXp(1, 0)));
  assert.ok(rollXp(20, 0).gt(rollXp(1, 0)));
});

import { xpBetween, levelReachable } from '../src/sim/leveling.js';

test('xpBetween (closed form) equals summing xpForLevel level by level', () => {
  for (const [L, M] of [[1, 2], [1, 40], [5, 150], [100, 400], [1000, 1100], [7, 7], [9, 8]]) {
    let sum = big(0);
    for (let l = L; l < M; l++) sum = sum.add(xpForLevel(l));
    const cf = xpBetween(L, M);
    const a = sum.toNumber();
    const b = cf.toNumber();
    assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, a), `${L}->${M}: loop ${a} closed ${b}`);
  }
});

test('levelReachable agrees with a level-by-level loop (including just below/above a boundary)', () => {
  for (const [L, xp] of [[1, 1e6], [10, 5e9], [200, 1e30], [3000, 1e200]]) {
    const M = levelReachable(L, big(xp));
    assert.ok(xpBetween(L, M).lte(big(xp).mul(1 + 1e-9)));
    assert.ok(xpBetween(L, M + 1).gt(big(xp).mul(1 - 1e-9)));
    if (xp <= 1e30) {
      let l = L;
      let left = big(xp);
      while (left.gte(xpForLevel(l))) {
        left = left.sub(xpForLevel(l));
        l++;
      }
      assert.ok(Math.abs(l - M) <= 1, `${L}: loop ${l} vs closed ${M}`);
    }
  }
});

test('a mass level-up is closed form: 10^300 xp is instant, rewards are granted once as permanent bonuses', () => {
  const s = createState(3, 0);
  const t = performance.now();
  addXp(s, big('1e300'));
  assert.ok(performance.now() - t < 200, `${performance.now() - t} ms`);
  assert.ok(s.level > 4000);
  assert.equal(s.rewards.levelClaimed, s.level);
  assert.ok(s.bonus.backpack > 1000 && s.bonus.luckPct > 1000);
  assert.ok(s.xp.isFinite() && !s.xp.isNegative());
  const bonus = s.bonus.backpack;
  addXp(s, big(1)); // nothing is re-granted
  assert.equal(s.bonus.backpack, bonus);
});
