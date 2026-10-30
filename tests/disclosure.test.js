import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game.js';
import { MemoryStorage } from '../src/core/save.js';
import { createState, serializeState, deserializeState } from '../src/sim/state.js';
import { visiblePanels, visibleChips, checkUnlocks, unlockHint, tutorialPanels } from '../src/sim/disclosure.js';
import { drain } from '../src/core/events.js';

test('a new player sees only the core panels; progress unlocks the rest, once, with an event', () => {
  const s = createState(1, 0);
  const v = visiblePanels(s);
  assert.deepEqual([...v].sort(), ['backpack', 'base', 'help', 'index', 'roll', 'settings']);
  assert.ok(!v.has('shop') && !v.has('combat') && !v.has('rebirth') && !v.has('refinery'));
  assert.deepEqual([...visibleChips(s)].sort(), ['income', 'level', 'money']);
  s.level = 2;
  const fresh = checkUnlocks(s);
  assert.deepEqual(fresh.sort(), ['rewards', 'shop']);
  assert.ok(visiblePanels(s).has('shop') && visibleChips(s).has('luck'));
  assert.deepEqual(checkUnlocks(s), [], 'announced only once');
  assert.deepEqual(drain(s).filter((e) => e.type === 'unlock').map((e) => e.id).sort(), ['rewards', 'shop']);
  s.level = 4;
  s.level = 6;
  assert.deepEqual(checkUnlocks(s).sort(), ['combat', 'refinery']);
  s.totalMoney = s.totalMoney.add(200000);
  assert.deepEqual(checkUnlocks(s), ['rebirth']);
  assert.equal(unlockHint('shop'), 'Unlocks at level 2');
});

test('Advanced UI shows everything from the start; fps chip only in advanced', () => {
  const s = createState(1, 0);
  s.settings.advancedUI = true;
  assert.ok(visiblePanels(s).has('rebirth') && visiblePanels(s).has('combat'));
  assert.ok(visibleChips(s).has('fps') && visibleChips(s).has('region'));
  s.settings.advancedUI = false;
  s.level = 50;
  assert.ok(!visibleChips(s).has('fps'));
});

test('the tutorial reveals the panel a step needs, and it stays visible afterwards', () => {
  const g = createGame({ storage: new MemoryStorage(), seed: 5 });
  g.tutorial.start();
  while (g.tutorial.step.id !== 'upgrade') g.tutorial.skipStep();
  assert.ok(tutorialPanels(g.state).includes('shop'));
  assert.ok(visiblePanels(g.state).has('shop'));
  for (let i = 0; i < 12; i++) g.step(0.1);
  g.tutorial.skip({ forever: true });
  assert.ok(g.state.ui.unlocked.shop, 'kept');
  assert.ok(visiblePanels(g.state).has('shop'));
});

test('old saves keep what they already reached (no fanfare), unlocks persist through save and load', () => {
  const s = createState(1, 0);
  s.level = 12;
  const data = JSON.parse(JSON.stringify(serializeState(s)));
  delete data.ui;
  const old = deserializeState(data);
  assert.ok(visiblePanels(old).has('refinery') && visiblePanels(old).has('combat'));
  assert.equal(drain(old).filter((e) => e.type === 'unlock').length, 0);
  const back = deserializeState(JSON.parse(JSON.stringify(serializeState(old))));
  assert.ok(back.ui.unlocked.shop);
});
