import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, serializeState } from '../src/sim/state.js';
import { createGame } from '../src/game.js';
import { MemoryStorage } from '../src/core/save.js';
import { createLoop } from '../src/core/loop.js';
import { unlockedSpeeds, isUnlocked, effectiveSpeed, speedOptions, speedRule, describeReq, requirementMet } from '../src/sim/speed.js';
import { applyOffline } from '../src/sim/offline.js';
import { place } from '../src/sim/placement.js';

test('speed starts at 1x; slow speeds are never locked; faster ones are locked at first', () => {
  const s = createState(1, 0);
  assert.deepEqual(unlockedSpeeds(s), [0.5, 0.75, 1]);
  assert.equal(effectiveSpeed(s), 1);
  assert.equal(s.settings.gameSpeed, 1);
  assert.ok(!isUnlocked(s, 2));
});

test('unlock rules are data: level 10 -> 2x, level 30 -> 4x, first rebirth -> 8x, then endless generated speeds', () => {
  const s = createState(1, 0);
  s.level = 10;
  assert.ok(isUnlocked(s, 2) && !isUnlocked(s, 4));
  s.level = 30;
  assert.ok(isUnlocked(s, 4) && !isUnlocked(s, 8));
  s.stats.rebirths = 1;
  assert.ok(isUnlocked(s, 8) && !isUnlocked(s, 16));
  s.stats.rebirths = 2;
  assert.ok(isUnlocked(s, 16));
  s.stats.rebirths = 40;
  const u = unlockedSpeeds(s);
  assert.ok(u.includes(2 ** 20), 'endless: 2^20 is generated');
  assert.ok(u.every((x, i) => i === 0 || x > u[i - 1]));
  assert.equal(speedRule(3).speed, 16);
  assert.equal(speedRule(5).speed, 64);
});

test('requirements are described in plain words and the selector lists locked options with them', () => {
  const s = createState(1, 0);
  const opts = speedOptions(s);
  const locked = opts.filter((o) => !o.unlocked);
  assert.equal(locked.length, 2);
  assert.equal(locked[0].speed, 2);
  assert.equal(locked[0].note, 'Unlocks at level 10');
  assert.match(describeReq({ kind: 'rebirths', value: 1 }), /1 rebirth$/);
  assert.ok(requirementMet(s, { kind: 'level', value: 1 }));
  assert.ok(!requirementMet(s, { kind: 'tree', layer: 0, node: 'x', level: 1 }));
});

test('a locked speed cannot be chosen; a stored locked speed is clamped to the fastest unlocked one below it', () => {
  const g = createGame({ storage: new MemoryStorage(), seed: 3 });
  g.setSetting('gameSpeed', 4);
  assert.equal(g.state.settings.gameSpeed, 1);
  g.setSetting('gameSpeed', 0.5);
  assert.equal(g.state.settings.gameSpeed, 0.5);
  g.state.settings.gameSpeed = 8; // e.g. an edited save
  assert.equal(effectiveSpeed(g.state), 1);
  g.state.level = 12;
  assert.equal(effectiveSpeed(g.state), 2);
  g.setSetting('gameSpeed', 2);
  assert.equal(g.state.settings.gameSpeed, 2);
});

test('pure speed scaling: the loop simulates speed x real time, in bounded work per frame, with the same fixed step up to 4x', () => {
  const run = (speed, frames = 60, frameMs = 16.667) => {
    let t = 0;
    const cbs = [];
    let calls = 0;
    const loopU = createLoop({ update: (dt) => { calls++; loopU.simSeconds = (loopU.simSeconds || 0) + dt; }, render: () => {}, raf: (fn) => { cbs.length = 0; cbs.push(fn); return 1; }, caf: () => {} });
    loopU.speed = speed;
    loopU.start();
    for (let i = 0; i < frames; i++) {
      t += frameMs;
      const fn = cbs.pop();
      fn(t);
    }
    return { sim: loopU.simSeconds || 0, calls };
  };
  const real = 60 * 0.016667;
  for (const sp of [0.5, 1, 2, 4]) assert.ok(Math.abs(run(sp).sim - real * sp) < 0.2 * sp + 0.1, `speed ${sp}`);
  const fast = run(64);
  assert.ok(fast.sim > real * 20, 'very fast speeds still advance a lot');
  assert.ok(fast.calls <= 60 * 10, 'bounded steps per frame');
});

test('game speed never touches saves, playtime or offline progress: same offline result at every speed', () => {
  const mk = (speed) => {
    const s = createState(5, 0);
    s.settings.gameSpeed = speed;
    place(s, s.bag.find((u) => s.items[u].tpl === 'pebble_drill'), 1, 1, 0);
    place(s, s.bag.find((u) => s.items[u].tpl === 'stall'), 2, 1, 0);
    return s;
  };
  const results = [0.5, 1, 2, 4, 64].map((sp) => {
    const s = mk(sp);
    const r = applyOffline(s, 3600);
    return r.money.toString();
  });
  assert.equal(new Set(results).size, 1, results.join(' | '));
  // the serialised save does not depend on the speed except for the setting itself
  const a = serializeState(mk(1), 0);
  const b = serializeState(mk(4), 0);
  delete a.settings;
  delete b.settings;
  delete a.index; // the Index stores wall-clock first-found times, which differ between two states built a millisecond apart
  delete b.index;
  assert.deepEqual(a, b);
});

test('playtime counts real seconds: stepping at 8x does not make playtime rewards come faster', () => {
  const g = createGame({ storage: new MemoryStorage(), seed: 3 });
  g.step(0.4, 0.05);
  assert.ok(Math.abs(g.state.playtime - 0.05) < 1e-9);
});
