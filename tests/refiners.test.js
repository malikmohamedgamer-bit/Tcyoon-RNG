import { test } from 'node:test';
import assert from 'node:assert/strict';
import { big } from '../src/core/bignum.js';
import { Rng } from '../src/core/rng.js';
import { createState } from '../src/sim/state.js';
import { addToBag } from '../src/sim/inventory.js';
import { reroll, transfer, combine, combineChance, refineCost } from '../src/sim/refiners.js';

const mk = () => {
  const s = createState(3, 0);
  s.money = big(1e9);
  return s;
};
const give = (s, tpl, tier, mut) => addToBag(s, { tpl, tier, vs: 0, hy: null, mut }, { force: true });

test('reroll costs money, replaces mutations with a valid set, refuses when poor', () => {
  const s = mk();
  const it = give(s, 'pebble_drill', 6, [['shiny', 1]]);
  const before = s.money;
  const r = reroll(s, it.uid, new Rng(1));
  assert.ok(r.ok);
  assert.ok(s.money.lt(before));
  assert.ok(it.mut.length <= 2);
  s.money = big(1);
  assert.equal(reroll(s, it.uid).ok, false);
  assert.ok(s.money.eq(1));
  assert.equal(reroll(s, 9999).ok, false);
});

test('reroll odds are boosted: more mutations on average than a plain roll', () => {
  const s = mk();
  const rng = new Rng(2);
  let n = 0;
  for (let i = 0; i < 300; i++) {
    const it = give(s, 'pebble_drill', 0, []);
    reroll(s, it.uid, rng);
    n += it.mut.length;
  }
  assert.ok(n / 300 > 0.2); // plain tier-0 rate is ~0.12
});

test('transfer moves a mutation when the target can take it', () => {
  const s = mk();
  const a = give(s, 'pebble_drill', 0, [['shiny', 1]]);
  const b = give(s, 'pebble_drill', 4, []);
  const r = transfer(s, a.uid, b.uid, 'shiny');
  assert.ok(r.ok);
  assert.deepEqual(a.mut, []);
  assert.deepEqual(b.mut, [['shiny', 1]]);
  // same group conflict
  const c = give(s, 'pebble_drill', 4, [['golden', 1]]);
  const d = give(s, 'pebble_drill', 0, [['shiny', 1]]);
  assert.equal(transfer(s, d.uid, c.uid, 'shiny').ok, false);
  assert.deepEqual(d.mut, [['shiny', 1]]); // donor untouched on failure
  // inapplicable
  const e = give(s, 'belt', 4, []);
  const f = give(s, 'pebble_drill', 0, [['radiant', 1]]);
  assert.equal(transfer(s, f.uid, e.uid, 'radiant').ok, false);
  assert.equal(transfer(s, a.uid, a.uid, 'shiny').ok, false);
  assert.equal(transfer(s, a.uid, b.uid, 'nope').ok, false);
});

test('combine raises the level with the documented chance and consumes the donor mutation', () => {
  assert.equal(combineChance(1), 0.75);
  assert.ok(Math.abs(combineChance(3) - 0.55) < 1e-9);
  assert.equal(combineChance(50), 0.1);
  const s = mk();
  const rng = new Rng(7);
  let wins = 0;
  const N = 2000;
  for (let i = 0; i < N; i++) {
    const t = give(s, 'pebble_drill', 0, [['shiny', 1]]);
    const d = give(s, 'pebble_drill', 0, [['shiny', 1]]);
    const r = combine(s, t.uid, d.uid, 'shiny', rng);
    assert.ok(r.ok);
    assert.deepEqual(d.mut, []);
    if (r.success) {
      wins++;
      assert.equal(t.mut[0][1], 2);
    } else assert.equal(t.mut[0][1], 1);
    s.money = big(1e9);
  }
  assert.ok(Math.abs(wins / N - 0.75) < 0.04);
  const t = give(s, 'pebble_drill', 0, [['shiny', 5]]);
  const d = give(s, 'pebble_drill', 0, [['shiny', 1]]);
  assert.match(combine(s, t.uid, d.uid, 'shiny').reason, /maximum/);
  const x = give(s, 'pebble_drill', 0, [['shiny', 1]]);
  const y = give(s, 'pebble_drill', 0, []);
  assert.equal(combine(s, x.uid, y.uid, 'shiny').ok, false);
});

test('refinery cost grows with mutation count and never goes negative', () => {
  const s = mk();
  const a = give(s, 'belt', 0, []);
  const b = give(s, 'belt', 0, [['sturdy', 1]]);
  assert.ok(refineCost(s, 'reroll', b).gt(refineCost(s, 'reroll', a)));
  assert.ok(refineCost(s, 'combine', a).gt(refineCost(s, 'reroll', a)));
});
