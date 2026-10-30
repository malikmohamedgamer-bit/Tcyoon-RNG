import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, serializeState, deserializeState } from '../src/sim/state.js';
import { modeId, setDifficulty, MODES } from '../src/sim/difficulty.js';
import { waveInterval, WAVE_INTERVAL, loseWavePenalty, offlineWaves, createEncounter, forecastWave } from '../src/sim/combat.js';
import { freeRollInterval } from '../src/sim/economy.js';
import { stepProduction, refreshProduction, incomeRate } from '../src/sim/production.js';
import { place } from '../src/sim/placement.js';
import { big } from '../src/core/bignum.js';

function stateWith(mode) {
  const s = createState(7, 0);
  if (mode) setDifficulty(s, mode);
  const drill = s.bag.find((u) => s.items[u].tpl === 'pebble_drill');
  const stall = s.bag.find((u) => s.items[u].tpl === 'stall');
  place(s, drill, 1, 1, 0);
  place(s, stall, 2, 1, 0);
  refreshProduction(s);
  return s;
}

test('modes are data: standard is all ones, relaxed is documented and easier in every knob', () => {
  assert.ok(Object.values(MODES.standard.mods).every((v) => v === 1));
  const r = MODES.relaxed.mods;
  assert.ok(r.income > 1 && r.wavePace > 1 && r.enemyHp < 1 && r.lossPenalty < 1 && r.freeRollInterval < 1 && r.bossTime > 1);
});

test('null/unknown difficulty behaves as standard; invalid values are refused and sanitised on load', () => {
  const s = createState(1, 0);
  assert.equal(s.difficulty, null);
  assert.equal(modeId(s), 'standard');
  assert.equal(setDifficulty(s, 'nightmare'), false);
  assert.equal(s.difficulty, null);
  const data = JSON.parse(JSON.stringify(serializeState(s)));
  data.difficulty = 'bogus';
  assert.equal(deserializeState(data).difficulty, null);
  setDifficulty(s, 'relaxed');
  assert.equal(deserializeState(JSON.parse(JSON.stringify(serializeState(s)))).difficulty, 'relaxed');
});

test('relaxed: income x1.15 exactly', () => {
  const a = incomeRate(stateWith('standard'));
  const b = incomeRate(stateWith('relaxed'));
  assert.ok(a.toNumber() > 0);
  assert.ok(Math.abs(b.toNumber() / a.toNumber() - 1.15) < 1e-9, `${b.toNumber() / a.toNumber()}`);
  const s = stateWith('relaxed');
  const before = s.money.toNumber();
  stepProduction(s, 10, (st, m) => (st.money = st.money.add(m)));
  assert.ok(s.money.toNumber() >= before);
});

test('relaxed: waves every 90 s instead of 60 s, offline waves counted accordingly, free rolls every 90 s', () => {
  assert.equal(waveInterval(stateWith('standard')), WAVE_INTERVAL);
  assert.equal(waveInterval(stateWith('relaxed')), WAVE_INTERVAL * 1.5);
  const std = stateWith('standard');
  const rel = stateWith('relaxed');
  for (const s of [std, rel]) s.level = 6;
  assert.equal(offlineWaves(std, 900)?.waves, 15);
  assert.equal(offlineWaves(rel, 900)?.waves, 10);
  assert.equal(freeRollInterval(rel) / freeRollInterval(std), 0.75);
});

test('relaxed: a lost wave costs half, enemies have 15% less hp, bosses get 25% more time', () => {
  const a = stateWith('standard');
  const b = stateWith('relaxed');
  for (const s of [a, b]) {
    s.money = big(1e6);
    s._p.income = big(1e9); // the cap is 2% of money in both modes
  }
  const la = loseWavePenalty(a);
  const lb = loseWavePenalty(b);
  assert.ok(Math.abs(lb.toNumber() / la.toNumber() - 0.5) < 1e-9);
  const ea = createEncounter(stateWith('standard'), 'wave');
  const eb = createEncounter(stateWith('relaxed'), 'wave');
  assert.ok(Math.abs(eb.totalHp.toNumber() / ea.totalHp.toNumber() - 0.85) < 1e-9);
  assert.ok(Math.abs(forecastWave(stateWith('relaxed'), 10).enemyHp.toNumber() / forecastWave(stateWith('standard'), 10).enemyHp.toNumber() - 0.85) < 1e-9);
  const ba = stateWith('standard');
  const bb = stateWith('relaxed');
  ba.level = bb.level = 12;
  assert.ok(Math.abs(createEncounter(bb, 'boss').timeLimit / createEncounter(ba, 'boss').timeLimit - 1.25) < 1e-9);
});
