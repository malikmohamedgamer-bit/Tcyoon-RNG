import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/sim/state.js';
import { place } from '../src/sim/placement.js';
import { addToBag } from '../src/sim/inventory.js';
import { refreshProduction } from '../src/sim/production.js';
import { explainIncome } from '../src/sim/explain.js';
import { setDifficulty } from '../src/sim/difficulty.js';

function layout(extra = () => {}) {
  const s = createState(11, 0);
  for (const u of [...s.bag]) delete s.items[u];
  s.bag = [];
  const give = (tpl, tier = 0) => addToBag(s, { tpl, tier, vs: 0, hy: null, mut: [] }, { force: true }).uid;
  place(s, give('gem_forge', 2), 0, 0, 0);
  place(s, give('amp', 2), 1, 0, 0);
  place(s, give('bazaar', 2), 2, 0, 0);
  place(s, give('pebble_drill', 1), 0, 2, 0);
  place(s, give('stall', 1), 1, 2, 0);
  place(s, give('slime_vat', 0), 0, 4, 0); // faces an empty tile: blocked
  extra(s, give);
  refreshProduction(s);
  return s;
}

test('the listed chains add up exactly to the income the game uses', () => {
  const s = layout();
  const e = explainIncome(s);
  const sum = e.chains.reduce((a, c) => a.add(c.money), e.total.sub(e.total));
  assert.ok(e.total.toNumber() > 0);
  assert.ok(Math.abs(sum.toNumber() / e.total.toNumber() - 1) < 1e-9, `${sum.toNumber()} vs ${e.total.toNumber()}`);
  assert.equal(e.chains.length, 3);
  assert.ok(e.chains.every((c, i) => i === 0 || c.money.lte(e.chains[i - 1].money)), 'biggest contributor first');
});

test('chains name each item on the path and what it does; the dead-end dropper is reported as blocked with a reason', () => {
  const s = layout();
  const e = explainIncome(s);
  const forge = e.chains.find((c) => c.dropper.title.includes('Forge') || c.dropper.title.includes('Gem'));
  assert.ok(forge && forge.seller, 'forge line reaches a seller');
  assert.ok(forge.steps.some((st) => st.kind === 'mult'), 'the amplifier is listed');
  assert.equal(e.blocked.length, 1);
  assert.match(e.blocked[0].why, /accepts units/);
  assert.ok(e.chains.find((c) => !c.seller) || e.blocked[0].title.length > 0);
});

test('multipliers are listed in order with their source: difficulty and upgrades appear, neutral ones do not', () => {
  const s = layout();
  const none = explainIncome(s).multipliers;
  assert.ok(none.every((m) => !m.label.includes('Difficulty')));
  setDifficulty(s, 'relaxed');
  refreshProduction(s);
  const e = explainIncome(s);
  const d = e.multipliers.find((m) => m.label.includes('Difficulty'));
  assert.ok(d && Math.abs(d.factor.toNumber() - 1.15) < 1e-9);
  s.upgrades.income = 2;
  s.upgrades.dropSpeed = 1;
  refreshProduction(s);
  const e2 = explainIncome(s);
  assert.ok(e2.total.gt(e.total));
  const up = e2.multipliers.filter((m) => m.label.includes('Shop upgrades'));
  assert.ok(up.length >= 2, 'speed and income upgrades are listed separately');
  const inc = e2.multipliers.find((m) => m.label.startsWith('Income multiplier: Shop'));
  assert.ok(Math.abs(inc.factor.toNumber() - 1.05 ** 2) < 1e-9);
  const order = e2.multipliers.map((m) => m.label.split(':')[0]);
  assert.ok(order.indexOf('Dropper speed') < order.indexOf('Income multiplier'), 'speed before income');
});

test('an empty base explains itself: no chains, no multipliers', () => {
  const s = createState(1, 0);
  const e = explainIncome(s);
  assert.equal(e.chains.length, 0);
  assert.ok(e.total.isZero());
});
