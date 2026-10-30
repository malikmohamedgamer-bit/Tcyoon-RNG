import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../src/core/rng.js';
import { big } from '../src/core/bignum.js';
import { itemStats, itemTitle, TEMPLATES, ITEM_TEMPLATES, WEAPON_TEMPLATES, TYPES, statLines } from '../src/sim/items.js';
import { generateItem, pickTemplate } from '../src/gen/items.js';
import { getMutation, rollMutations, mutationSlots, generatedMutation, HAND_MUTATIONS } from '../src/gen/mutations.js';
import { canAddMutation, addMutation, mutationMultipliers } from '../src/sim/mutations.js';

const it = (tpl, tier, mut = [], extra = {}) => ({ uid: 1, tpl, tier, vs: 0, hy: null, mut, ...extra });

test('every template references a known type and has base stats', () => {
  for (const t of TEMPLATES.values()) {
    assert.ok(TYPES[t.type], t.id);
    assert.ok(t.base && Object.keys(t.base).length, t.id);
    assert.ok(t.weight > 0);
    const s = itemStats(it(t.id, 3));
    assert.ok(Object.keys(s).length > 0, t.id);
  }
  assert.ok(ITEM_TEMPLATES.length >= 20 && WEAPON_TEMPLATES.length >= 6);
});

test('stats grow with tier and stay finite at absurd tiers', () => {
  let prev = big(0);
  for (const tier of [0, 1, 5, 12, 40, 500, 1e5, 1e9]) {
    const s = itemStats(it('pebble_drill', tier));
    assert.ok(s.value.isFinite() && s.rate.isFinite());
    const income = s.value.mul(s.rate);
    assert.ok(income.gt(prev), `tier ${tier}`);
    prev = income;
  }
  assert.ok(itemStats(it('amp', 5)).mult.gt(1));
  assert.ok(itemStats(it('clover', 5)).luck.gt(1));
});

test('tier 0 baseline: pebble drill = 1 unit/s worth 1', () => {
  const s = itemStats(it('pebble_drill', 0));
  assert.ok(s.rate.eq(1) && s.value.eq(1));
  assert.ok(itemStats(it('stall', 0)).sell.eq(1.3));
});

test('mutations multiply the main stat; stack multiplicatively; levels raise to a power', () => {
  const base = itemStats(it('pebble_drill', 0)).value;
  assert.ok(itemStats(it('pebble_drill', 0, [['shiny', 1]])).value.eq(base.mul(1.5)));
  assert.ok(itemStats(it('pebble_drill', 0, [['shiny', 1], ['radiant', 1]])).value.eq(base.mul(3)));
  assert.ok(itemStats(it('pebble_drill', 0, [['shiny', 2]])).value.eq(base.mul(2.25)));
  const cursed = itemStats(it('pebble_drill', 0, [['cursed', 1]]));
  assert.ok(cursed.value.eq(base.mul(6)) && cursed.rate.eq(0.5)); // trade-off
  assert.ok(mutationMultipliers([]).main === undefined);
});

test('mutation on a multiplier boosts the (mult-1) part, not the whole multiplier', () => {
  const m0 = itemStats(it('amp', 0)).mult; // 1.25
  const m1 = itemStats(it('amp', 0, [['golden', 1]])).mult; // 1 + 0.25*3
  assert.ok(m0.eq(1.25) && m1.eq(1.75));
});

test('stats cache invalidates when mutations change', () => {
  const item = it('pebble_drill', 0);
  const a = itemStats(item).value;
  addMutation(item, 'golden');
  assert.ok(itemStats(item).value.eq(a.mul(3)));
});

test('stacking rules: one per exclusive group, slots by tier, type applicability', () => {
  const item = it('pebble_drill', 0, [['shiny', 1]]);
  assert.equal(canAddMutation(item, 'dropper', 'golden').ok, false); // same group (sheen)
  assert.equal(canAddMutation(item, 'dropper', 'radiant').ok, false); // no slot at tier 0
  assert.equal(mutationSlots(0), 1);
  assert.equal(mutationSlots(4), 2);
  assert.equal(mutationSlots(40), 11);
  const t4 = it('pebble_drill', 4, [['shiny', 1]]);
  assert.equal(canAddMutation(t4, 'dropper', 'radiant').ok, true);
  assert.equal(canAddMutation(t4, 'dropper', 'sturdy').ok, false); // applies to conveyors only
  assert.equal(canAddMutation(t4, 'dropper', 'shiny').ok, false);
  assert.equal(canAddMutation(t4, 'dropper', 'nope').ok, false);
});

test('generated mutations are endless, deterministic, and escalate', () => {
  let prev = big(0);
  for (const n of [0, 1, 5, 30, 200, 5000]) {
    const m = generatedMutation(n);
    assert.equal(m.id, `g:${n}`);
    assert.deepEqual(m, generatedMutation(n));
    const mul = m.effects[0].mul;
    assert.ok(mul.isFinite() && mul.gt(prev));
    prev = mul;
  }
  assert.equal(getMutation('g:12').id, 'g:12');
  assert.equal(getMutation('g:-1'), null);
  assert.equal(getMutation('g:x'), null);
  assert.ok(getMutation('bossbane'));
});

test('rollMutations respects slots, groups and applicability; rates match chance', () => {
  const rng = new Rng(77);
  let shiny = 0;
  const N = 40000;
  for (let i = 0; i < N; i++) {
    const m = rollMutations(rng, { tier: 0, type: 'dropper', logLuck: 0 });
    assert.ok(m.length <= 1);
    for (const [id] of m) {
      const d = getMutation(id);
      assert.ok(!d.applies || d.applies.includes('dropper'));
      assert.ok(!d.minTier);
    }
    if (m.some((x) => x[0] === 'shiny')) shiny++;
  }
  // shiny base chance 0.08 (shuffled order + slot cap shaves a little)
  assert.ok(shiny / N > 0.05 && shiny / N < 0.09, String(shiny / N));
  const groups = new Set();
  for (let i = 0; i < 2000; i++) {
    const m = rollMutations(rng, { tier: 30, type: 'turret', logLuck: 30 });
    groups.clear();
    for (const [id] of m) {
      const g = getMutation(id).group;
      assert.ok(!groups.has(g), 'duplicate group');
      groups.add(g);
    }
  }
  assert.ok(HAND_MUTATIONS.every((m) => !m.minTier || m.minTier >= 0));
});

test('luck raises mutation odds (documented factor) but is capped', () => {
  const count = (logLuck) => {
    const rng = new Rng(5);
    let n = 0;
    for (let i = 0; i < 20000; i++) n += rollMutations(rng, { tier: 0, type: 'dropper', logLuck }).length;
    return n;
  };
  assert.ok(count(4) > count(0) * 2);
  assert.ok(count(60) > 0);
  // the luck factor is capped (25x), so far beyond the cap more luck changes nothing
  assert.equal(count(1e9), count(1e3));
});

test('generateItem: weapons and turrets only from level 4; types follow weights', () => {
  const rng = new Rng(8);
  const early = new Set();
  for (let i = 0; i < 3000; i++) early.add(TEMPLATES.get(pickTemplate(rng, 1).id).type);
  assert.ok(!early.has('turret') && !early.has('weapon'));
  const late = new Map();
  for (let i = 0; i < 20000; i++) {
    const t = TEMPLATES.get(pickTemplate(rng, 10).id).type;
    late.set(t, (late.get(t) || 0) + 1);
  }
  assert.ok(late.has('weapon') && late.has('turret'));
  assert.ok(Math.abs(late.get('weapon') / 20000 - 0.09) < 0.015);
  const gen = generateItem(new Rng(1), { tier: 7, level: 10, logLuck: 2 });
  assert.equal(gen.tier, 7);
  assert.ok(TEMPLATES.has(gen.tpl));
});

test('titles and stat lines are human readable', () => {
  const t = itemTitle(it('pebble_drill', 2));
  assert.equal(t, 'Rare Pebble Drill');
  const v = itemTitle({ ...it('pebble_drill', 2), vs: 12345 });
  assert.match(v, /Rare Pebble Drill «\w+»/);
  const lines = statLines(it('gun_turret', 3), (b) => b.format());
  assert.ok(lines.some((l) => l.startsWith('Damage')));
});
