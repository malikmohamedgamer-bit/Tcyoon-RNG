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
