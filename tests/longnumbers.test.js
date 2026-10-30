// Regression for the long-numbers soak: a full roll at tower-sized luck / xp multipliers must finish quickly
// (it used to loop forever in the level-up search) and leave a finite, serialisable state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { big } from '../src/core/bignum.js';
import { createState, serializeState, deserializeState } from '../src/sim/state.js';
import { doRoll } from '../src/sim/rolling.js';
import { refreshProduction } from '../src/sim/production.js';
import { layerState } from '../src/sim/rebirth.js';

const tower = (h) => { let b = big(10); for (let i = 0; i < h; i++) b = big(10).pow(b); return b; };

test('rolling with tower-sized prestige currencies is fast and finite', () => {
  const s = createState(5, 0);
  s.money = tower(6);
  for (const k of [0, 1, 2, 3, 7, 40]) {
    const ls = layerState(s, k);
    ls.total = tower(4 + (k % 3));
    ls.currency = tower(3 + (k % 3));
    ls.count = 1e6;
  }
  refreshProduction(s);
  const t = performance.now();
  for (let i = 0; i < 20; i++) doRoll(s, 1);
  assert.ok(performance.now() - t < 1000, `${performance.now() - t} ms`);
  assert.ok(s.stats.rolls >= 1);
  const back = deserializeState(JSON.parse(JSON.stringify(serializeState(s, 1))));
  assert.ok(back.money.isFinite());
  assert.equal(back.level, s.level);
});
