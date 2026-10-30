import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../src/core/rng.js';
import { word, tierWord, mutationWord, variantWord, layerName, bossName, monsterName } from '../src/gen/names.js';
import { generateItem, rollVariant, rollHybrid } from '../src/gen/items.js';
import { ITEM_TEMPLATES, WEAPON_TEMPLATES, itemStats } from '../src/sim/items.js';
import { tierInfo } from '../src/gen/tiers.js';

test('names are deterministic and pronounceable; collisions across thousands of seeds are rare', () => {
  assert.equal(word('x'), word('x'));
  assert.notEqual(word('x'), word('y'));
  const seen = new Set();
  for (let t = 12; t < 5012; t++) seen.add(tierWord(t));
  assert.ok(seen.size > 4000, `unique tier words ${seen.size}`);
  for (const w of [tierWord(12), mutationWord(3), variantWord(99)]) assert.match(w, /^[A-Z][a-z]+$/);
  assert.equal(layerName(0), 'Rebirth');
  assert.equal(layerName(1), 'Ascension');
  assert.equal(layerName(40), layerName(40));
  assert.notEqual(layerName(40), layerName(41));
  assert.ok(bossName(5).length > 5 && bossName(5) === bossName(5));
  assert.ok(monsterName('Slime', 3).endsWith('Slime'));
});

test('generated tiers have unique display labels over a long range', () => {
  const labels = new Set();
  for (let t = 0; t < 3000; t++) labels.add(tierInfo(t).label);
  assert.ok(labels.size > 2600);
});

test('every template can be generated and produces finite stats at every tier', () => {
  for (const t of [...ITEM_TEMPLATES, ...WEAPON_TEMPLATES]) {
    for (const tier of [0, 3, 15, 300]) {
      const g = generateItem(new Rng(t.id + tier), { tier, level: 10, logLuck: 3, tpl: t.id });
      assert.equal(g.tpl, t.id);
      const stats = itemStats({ uid: 1, ...g });
      for (const v of Object.values(stats)) {
        if (v && typeof v.isFinite === 'function') assert.ok(v.isFinite() && !v.isNegative(), `${t.id} ${tier}`);
      }
    }
  }
});

test('variants and hybrids are generated endlessly: more variants at higher tiers, hybrids only where legal', () => {
  const rng = new Rng(4);
  const share = (tier) => {
    let n = 0;
    for (let i = 0; i < 4000; i++) if (rollVariant(rng, tier)) n++;
    return n / 4000;
  };
  assert.ok(share(0) < share(20));
  assert.ok(share(100) <= 0.5 + 0.03);
  let hy = 0;
  let turretHy = 0;
  for (let i = 0; i < 5000; i++) {
    if (rollHybrid(rng, ITEM_TEMPLATES.find((t) => t.id === 'belt'))) hy++;
    if (rollHybrid(rng, ITEM_TEMPLATES.find((t) => t.id === 'gun_turret'))) turretHy++;
  }
  assert.ok(hy / 5000 > 0.03 && hy / 5000 < 0.09);
  assert.equal(turretHy, 0);
});

test('a hybrid item really gains the secondary effect (a belt with a built-in multiplier)', () => {
  const plain = itemStats({ uid: 1, tpl: 'belt', tier: 5, vs: 0, hy: null, mut: [] });
  const hyb = itemStats({ uid: 1, tpl: 'belt', tier: 5, vs: 0, hy: 'mult', mut: [] });
  assert.ok(!plain.mult && hyb.mult && hyb.mult.gt(1));
});
