import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game.js';
import { MemoryStorage } from '../src/core/save.js';
import { drain } from '../src/core/events.js';
import { TIPS, sanitizeTips, seenTips } from '../src/sim/tips.js';
import { serializeState, deserializeState } from '../src/sim/state.js';

const newGame = () => createGame({ storage: new MemoryStorage(), seed: 9 });
const tipsOf = (g) => drain(g.state).filter((e) => e.type === 'tip');

test('tip data: unique ids, titles and text, known triggers', () => {
  const ids = new Set();
  for (const t of TIPS) {
    assert.ok(!ids.has(t.id));
    ids.add(t.id);
    assert.ok(t.title && t.text && (t.on.event || t.on.cond));
  }
  assert.ok(TIPS.length >= 8);
});

test('a backpack-full tip appears once, the first time rolls are blocked', () => {
  const g = newGame();
  g.debug.fillBag();
  g.roll(1);
  const first = tipsOf(g);
  assert.equal(first.length, 1);
  assert.equal(first[0].id, 'bagFull');
  g.roll(1);
  assert.equal(tipsOf(g).length, 0, 'never twice');
  assert.equal(seenTips(g.state).length, 1);
});

test('tips are not shown while the tutorial runs, and not at all when turned off', () => {
  const g = newGame();
  g.tutorial.start();
  g.debug.fillBag();
  g.roll(1);
  assert.equal(tipsOf(g).length, 0);
  assert.equal(g.state.tips.seen.bagFull, undefined, 'not consumed while suppressed');
  g.tutorial.skip({ forever: true });
  g.setSetting('tips', false);
  g.roll(1);
  assert.equal(tipsOf(g).length, 0);
  g.setSetting('tips', true);
  g.roll(1);
  assert.equal(tipsOf(g).length, 1);
});

test('named-condition tips: rebirth ready is announced once when the threshold is reached', () => {
  const g = newGame();
  g.state.runMoney = g.state.runMoney.add(5e6);
  for (let i = 0; i < 25; i++) g.step(0.1);
  const ids = tipsOf(g).map((t) => t.id);
  assert.ok(ids.includes('rebirthReady'));
  for (let i = 0; i < 40; i++) g.step(0.1);
  assert.equal(tipsOf(g).filter((t) => t.id === 'rebirthReady').length, 0);
});

test('seen tips persist, unknown ids are dropped, and old saves do not get tips for things already done', () => {
  const g = newGame();
  g.debug.fillBag();
  g.roll(1);
  const back = deserializeState(JSON.parse(JSON.stringify(serializeState(g.state))));
  assert.ok(back.tips.seen.bagFull);
  assert.deepEqual(Object.keys(sanitizeTips({ seen: { nope: 1, bagFull: 5, firstWave: 'x' } }).seen), ['bagFull']);
  const data = JSON.parse(JSON.stringify(serializeState(g.state)));
  delete data.tips;
  data.level = 20;
  assert.ok(deserializeState(data).tips.seen.firstWave);
});
