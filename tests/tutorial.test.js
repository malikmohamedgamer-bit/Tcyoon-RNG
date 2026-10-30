import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game.js';
import { MemoryStorage } from '../src/core/save.js';
import { drain } from '../src/core/events.js';
import { STEPS, sanitizeTutorial } from '../src/sim/tutorial.js';
import { serializeState, deserializeState } from '../src/sim/state.js';
import { describeReward } from '../src/sim/rewards.js';

const newGame = () => createGame({ storage: new MemoryStorage(), seed: 42 });
const run = (g, sec, dt = 0.1) => { for (let t = 0; t < sec; t += dt) g.step(dt); };

test('tutorial data: unique ids, one plain sentence of at most 20 words, valid conditions and rewards', () => {
  const ids = new Set();
  for (const s of STEPS) {
    assert.ok(!ids.has(s.id), 'duplicate id ' + s.id);
    ids.add(s.id);
    const words = s.text.trim().split(/\s+/).length;
    assert.ok(words <= 20, `${s.id}: ${words} words`);
    assert.ok(s.topic && s.target);
    assert.ok(['statSince', 'earnedSince', 'flag', 'ack'].includes(s.done.kind), s.id);
    if (s.reward) assert.ok(describeReward(s.reward).length > 0);
  }
  assert.ok(STEPS.length >= 12);
});

test('a new game starts with the tutorial not started; a legacy save does not get one', () => {
  const g = newGame();
  assert.equal(g.state.tutorial.status, 'new');
  const data = serializeState(g.state);
  delete data.tutorial;
  data.level = 12;
  assert.equal(deserializeState(data).tutorial.status, 'done');
  assert.equal(sanitizeTutorial({ status: 'bogus', step: 99 }).step, STEPS.length - 1);
});

test('walking the tutorial: every step advances only when its action was done, and the whole thing completes', () => {
  const g = newGame();
  const s = g.state;
  g.tutorial.start();
  const idOf = () => g.tutorial.step && g.tutorial.step.id;
  assert.equal(idOf(), 'roll');
  run(g, 3);
  assert.equal(idOf(), 'roll', 'does not advance without rolling');
  g.roll(1);
  run(g, 2);
  assert.equal(idOf(), 'backpack');
  g.tutorial.flag('panel:backpack');
  run(g, 2);
  assert.equal(idOf(), 'place_dropper');
  const drill = s.bag.find((u) => s.items[u].tpl === 'pebble_drill');
  assert.ok(g.place(drill, 1, 1).ok);
  run(g, 2);
  assert.equal(idOf(), 'place_seller');
  const stall = s.bag.find((u) => s.items[u].tpl === 'stall');
  assert.ok(g.place(stall, 2, 1).ok);
  run(g, 2);
  assert.equal(idOf(), 'earn');
  run(g, 6);
  assert.equal(idOf(), 'upgrade', 'money rose by itself');
  assert.ok(g.buyUpgrade('luckCharm').ok, 'assist gave enough money');
  run(g, 2);
  assert.equal(idOf(), 'freeroll');
  g.roll(1);
  run(g, 2);
  assert.equal(idOf(), 'rarity');
  g.tutorial.flag('inspect');
  run(g, 2);
  assert.equal(idOf(), 'luck');
  g.tutorial.ack();
  run(g, 2);
  assert.equal(idOf(), 'mutations');
  g.tutorial.ack();
  run(g, 2);
  assert.equal(idOf(), 'turret');
  const turret = s.bag.find((u) => s.items[u].tpl === 'gun_turret');
  assert.ok(turret, 'a practice turret was provided');
  assert.ok(g.place(turret, 3, 3).ok);
  run(g, 2);
  assert.equal(idOf(), 'wave');
  assert.ok(s._enc && s._enc.kind === 'demo', 'the scripted wave started');
  const before = { wave: s.combat.wave, money: s.money.toNumber() };
  run(g, 120);
  assert.equal(idOf(), 'rebirth', 'demo wave finished');
  assert.equal(s.combat.wave, before.wave, 'demo wave does not change wave progress');
  g.tutorial.flag('panel:rebirth');
  run(g, 2);
  assert.equal(idOf(), 'fuse');
  const scrap = s.bag.filter((u) => s.items[u].tpl === 'belt' && s.items[u].tier === 0);
  assert.ok(scrap.length >= 3);
  assert.ok(g.fuse(scrap.slice(0, 3)).ok);
  run(g, 2);
  assert.equal(idOf(), 'sell');
  const toSell = s.bag.find((u) => s.items[u].practice) ?? s.bag[0];
  assert.ok(g.sell(toSell).ok);
  run(g, 2);
  assert.equal(idOf(), 'finish');
  g.tutorial.ack();
  run(g, 2);
  assert.equal(s.tutorial.status, 'done');
  assert.equal(s.tutorial.completed, 1);
});

test('rewards and assists are granted exactly once, also when the tutorial is replayed', () => {
  const g = newGame();
  const s = g.state;
  g.tutorial.start();
  const advanceAll = () => {
    for (let i = 0; i < STEPS.length * 3 && s.tutorial.status === 'active'; i++) {
      const st = g.tutorial.step;
      g.tutorial.skipStep(); // skipping steps never grants their reward
      void st;
    }
  };
  advanceAll();
  assert.equal(s.tutorial.status, 'done');
  assert.ok(!s.tutorial.claimed['reward:place_dropper'], 'skipped steps pay nothing');
  // really complete the paying step twice (second time as a replay)
  const freeBefore = () => s.freeRoll.count;
  g.tutorial.start({ replay: true });
  while (g.tutorial.step.id !== 'place_dropper') g.tutorial.skipStep();
  const drill = s.bag.find((u) => s.items[u].tpl === 'pebble_drill' || s.items[u].practice);
  g.place(drill, 1, 1);
  const f0 = freeBefore();
  run(g, 3);
  assert.equal(s.freeRoll.count, f0 + 1, 'free roll reward granted');
  assert.equal(s.tutorial.claimed['reward:place_dropper'], true);
  const f1 = freeBefore();
  g.tutorial.start({ replay: true });
  while (g.tutorial.step.id !== 'place_dropper') g.tutorial.skipStep();
  const drill2 = s.bag.find((u) => s.items[u].practice) ?? s.bag[0];
  g.place(drill2, 2, 2);
  run(g, 3);
  assert.equal(s.freeRoll.count, f1, 'no second reward on replay');
  assert.equal(s.tutorial.replays, 2);
});

test('practice items are worth $0 and cannot be farmed', () => {
  const g = newGame();
  g.tutorial.start();
  while (g.tutorial.step.id !== 'sell') g.tutorial.skipStep();
  const practice = g.state.bag.find((u) => g.state.items[u].practice);
  assert.ok(practice);
  const before = g.state.money.toNumber();
  const r = g.sell(practice);
  assert.ok(r.ok);
  assert.equal(g.state.money.toNumber(), before);
});

test('skip: summary lists what is missed; skip-for-now pauses, forever marks skipped; resume works', () => {
  const g = newGame();
  const sum0 = g.tutorial.summary();
  assert.equal(sum0.remaining, STEPS.length);
  assert.ok(sum0.topics.includes('rarity') && sum0.rewardCount >= 2);
  g.tutorial.start();
  g.roll(1);
  run(g, 3);
  assert.ok(g.tutorial.skip({ forever: false }));
  assert.equal(g.state.tutorial.status, 'paused');
  const step = g.state.tutorial.step;
  assert.ok(g.tutorial.resume());
  assert.equal(g.state.tutorial.step, step, 'resumes at the same step');
  g.tutorial.skip({ forever: true });
  assert.equal(g.state.tutorial.status, 'skipped');
  assert.ok(g.tutorial.summary().remaining < STEPS.length);
});

test('the tutorial position survives a save and reload', () => {
  const g = newGame();
  g.tutorial.start();
  g.roll(1);
  run(g, 3);
  g.tutorial.flag('panel:backpack');
  run(g, 2);
  const data = JSON.parse(JSON.stringify(serializeState(g.state)));
  const back = deserializeState(data);
  assert.equal(back.tutorial.status, 'active');
  assert.equal(back.tutorial.step, g.state.tutorial.step);
  assert.deepEqual(back.tutorial.claimed, g.state.tutorial.claimed);
  drain(g.state);
});
