import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createReel, stepReel, skipReel, reelView, createBatch, stepBatch, skipBatch, summarise, createCutscene, stepCutscene, cutsceneParams,
  cutsceneLevel, surprise, flashTimes, maxFlashesInAnySecond, createRevealManager, LEVELS, MAX_FLASHES_PER_SECOND,
} from '../src/sim/reveal.js';
import { createGame } from '../src/game.js';
import { MemoryStorage } from '../src/core/save.js';
import { tierInfo } from '../src/gen/tiers.js';

const res = (tier, uid = tier) => ({ uid, tier, icon: 'gem', label: tierInfo(tier).label, title: `Item ${uid}` });
const fillers = [0, 1, 2, 3].map((t) => ({ tier: t, icon: 'drill', label: 'x' }));

test('a reel always lands exactly on its result, whatever the mode or seed; the strip content before it never matters', () => {
  for (const mode of ['normal', 'quick']) {
    for (let seed = 0; seed < 25; seed++) {
      const r = createReel(res(7, seed), { mode, seed, fillers });
      let landed = 0;
      for (let t = 0; t < 4 && !r.done; t += 0.05) if (stepReel(r, 0.05).landed) landed++;
      assert.ok(r.done, `${mode}/${seed}`);
      assert.equal(landed, 1, 'lands once');
      assert.equal(r.pos, r.target);
      assert.equal(reelView(r).center.uid, seed, `${mode}/${seed} lands on its own result`);
      assert.equal(reelView(r).center.tier, 7);
    }
  }
});

test('the reel decelerates: the distance moved per step never grows after the spin, ticks happen and thin out, landing is smooth', () => {
  const r = createReel(res(5), { mode: 'normal', seed: 3, fillers });
  const steps = [];
  let prev = 0;
  const ticks = [];
  for (let t = 0; t < 3 && !r.done; t += 0.05) {
    const o = stepReel(r, 0.05);
    steps.push(r.pos - prev);
    prev = r.pos;
    ticks.push(o.ticks);
  }
  const iDecel = steps.findIndex((_, i) => i * 0.05 >= r.p.spin);
  for (let i = iDecel + 1; i < steps.length - 1; i++) assert.ok(steps[i] <= steps[i - 1] + 1e-9, `step ${i}`);
  assert.ok(ticks.reduce((a, b) => a + b, 0) >= r.target - 1);
  const firstHalf = ticks.slice(0, Math.floor(ticks.length / 2)).reduce((a, b) => a + b, 0);
  const secondHalf = ticks.slice(Math.floor(ticks.length / 2)).reduce((a, b) => a + b, 0);
  assert.ok(firstHalf >= secondHalf, 'ticks are denser while it is fast');
  assert.ok(steps.at(-1) === 0 || r.done);
});

test('skip: the reel jumps to the result at once, never loses it, and reports it landed', () => {
  const r = createReel(res(9, 42), { mode: 'normal', seed: 1, fillers });
  stepReel(r, 0.2);
  skipReel(r);
  assert.ok(r.done && r.landed);
  assert.equal(reelView(r).center.uid, 42);
});

test('static (reduced motion) reels show the result immediately with no spin and no blur', () => {
  const r = createReel(res(4, 8), { mode: 'static' });
  assert.ok(r.landed);
  const v = reelView(r);
  assert.equal(v.center.uid, 8);
  assert.equal(v.blur, false);
  assert.equal(v.speed, 0);
  for (let t = 0; t < 1 && !r.done; t += 0.05) stepReel(r, 0.05);
  assert.ok(r.done);
});

test('x10 batch: staggered reels land on the best results, then a summary highlights the best; skip jumps to the summary, a second skip closes', () => {
  const results = [res(2, 1), res(11, 2), res(1, 3), res(6, 4), res(0, 5), res(3, 6), res(0, 7), res(1, 8), res(2, 9), res(5, 10)];
  const b = createBatch(results, { seed: 5, fillers });
  assert.equal(b.reels.length, 5);
  assert.equal(b.reels[0].reel.result.uid, 2, 'the best result leads');
  assert.equal(b.summary.best.uid, 2);
  assert.equal(b.summary.total, 10);
  let t = 0;
  while (b.phase === 'run' && t < 5) { stepBatch(b, 0.05); t += 0.05; }
  assert.equal(b.phase, 'summary');
  assert.ok(t < 2.5, `fast: ${t}s`);
  const b2 = createBatch(results, { seed: 6, fillers });
  stepBatch(b2, 0.1);
  skipBatch(b2);
  assert.equal(b2.phase, 'summary');
  assert.ok(!b2.done);
  skipBatch(b2);
  assert.ok(b2.done);
});

test('x100 uses a counter instead of a hundred reels and a summary by rarity', () => {
  const results = Array.from({ length: 100 }, (_, i) => res(i % 7 === 0 ? 4 : i % 3, i));
  const b = createBatch(results, { seed: 1 });
  assert.equal(b.reels.length, 0);
  assert.ok(b.counter > 0);
  let t = 0;
  while (!b.done && t < 10) { stepBatch(b, 0.05); t += 0.05; }
  assert.ok(b.done && t < 4);
  const sm = summarise(results);
  assert.equal(sm.byTier.reduce((a, x) => a + x.count, 0), 100);
  assert.ok(sm.byTier[0].tier >= sm.byTier.at(-1).tier, 'rarest first');
});

test('cutscene level is a formula over the endless ladder: it grows with rarity, shrinks with luck, and works for any generated tier', () => {
  const lv = (tier, logLuck = 0, o) => cutsceneLevel(tier, logLuck, o).id;
  assert.equal(lv(0), 'none');
  assert.equal(lv(2), 'none');
  assert.equal(lv(4), 'flash');
  assert.equal(lv(5), 'short');
  assert.equal(lv(8), 'full');
  assert.equal(lv(5, 3), 'none', 'with luck x1000 a Mythic is nothing special');
  assert.equal(lv(1e6), 'full');
  assert.equal(lv(1e15), 'full');
  assert.equal(lv(500, 1e6), 'none', 'a huge luck makes even tier 500 ordinary');
  let prev = -1;
  for (const t of [0, 1, 3, 4, 5, 8, 20, 100, 1e5]) {
    const i = cutsceneLevel(t, 0).index;
    assert.ok(i >= prev, `monotone at ${t}`);
    prev = i;
  }
  assert.ok(Number.isFinite(surprise(1e15, 5)));
});

test('first time in the Index lifts a result to at least a flash; the length setting caps the level (short, off)', () => {
  assert.equal(cutsceneLevel(0, 0, { firstTime: true }).id, 'flash');
  assert.equal(cutsceneLevel(8, 0, { cap: 'short' }).id, 'short');
  assert.equal(cutsceneLevel(8, 0, { cap: 'off' }).id, 'none');
  assert.equal(cutsceneLevel(0, 0, { firstTime: true, cap: 'off' }).id, 'none');
  assert.ok(LEVELS.every((l, i) => i === 0 || l.seconds >= LEVELS[i - 1].seconds), 'bigger moment = longer');
});

test('cutscene: deterministic timeline, every text/sting/burst fires exactly once, it ends in a few seconds, curves start and end at 0', () => {
  const spec = { level: cutsceneLevel(9, 0), rarityLabel: 'Eternal', title: 'Gem Forge', theme: 'space', first: true, reduced: false };
  const run = () => {
    const c = createCutscene(spec);
    const evs = [];
    let max = { camera: 0, tint: 0 };
    for (let t = 0; t < 6 && !c.done; t += 0.05) {
      evs.push(...stepCutscene(c, 0.05).map((e) => e.kind + (e.slot ? ':' + e.slot : '')));
      const p = cutsceneParams(c);
      max = { camera: Math.max(max.camera, p.camera), tint: Math.max(max.tint, p.tint) };
    }
    return { c, evs, max };
  };
  const a = run();
  const b = run();
  assert.deepEqual(a.evs, b.evs, 'deterministic');
  assert.ok(a.c.done && a.c.seconds <= 4.0);
  assert.equal(a.evs.filter((e) => e === 'sting').length, 1);
  assert.equal(a.evs.filter((e) => e === 'burst').length, 1);
  assert.deepEqual(a.evs.filter((e) => e.startsWith('text')), ['text:theme', 'text:rarity', 'text:title', 'text:first', 'text:tag']);
  assert.ok(a.max.camera > 0 && a.max.tint > 0.9);
  assert.equal(cutsceneParams(a.c).camera, 0);
  assert.equal(cutsceneParams(createCutscene(spec)).camera, 0);
});

test('flash safety: never more than 3 flashes in any second, for every level, and none at all with reduced motion', () => {
  for (const level of LEVELS) {
    const c = createCutscene({ level, rarityLabel: 'x', title: 'y', theme: 'factory', first: false, reduced: false });
    assert.ok(maxFlashesInAnySecond(flashTimes(c)) <= MAX_FLASHES_PER_SECOND, level.id);
    const r = createCutscene({ level, rarityLabel: 'x', title: 'y', theme: 'factory', first: false, reduced: true });
    assert.equal(flashTimes(r).length, 0);
    assert.equal(r.burst, 0);
    assert.ok(r.seconds <= 1.6);
    assert.equal(cutsceneParams(r).camera, 0, 'no camera movement');
  }
});

test('manager: a rare roll plays a quick reel, then the cutscene; skip works at every stage and the result is always reported once', () => {
  const landed = [];
  const m = createRevealManager({ getSettings: () => ({ cutscenes: 'full', reels: 'on', reduced: false }), getLogLuck: () => 0, fillers: () => fillers });
  m.onLanded((r) => landed.push(r.map((x) => x.uid)));
  m.push([res(9, 77)]);
  assert.equal(m.kind, 'reel');
  assert.ok(m.cutscene, 'a cutscene is waiting behind the reel');
  const kinds = new Set();
  let t = 0;
  while (m.active && t < 8) { for (const e of m.step(0.05)) kinds.add(e.kind); t += 0.05; }
  assert.ok(!m.active && t < 5.5, `total ${t}s`);
  assert.deepEqual([...kinds].filter((k) => ['tick', 'stop', 'sting', 'burst', 'cutsceneDone'].includes(k)).sort(), ['burst', 'cutsceneDone', 'sting', 'stop', 'tick']);
  assert.deepEqual(landed, [[77]]);
  // skip during the reel: the result is reported immediately, the cutscene can still be skipped too
  m.push([res(9, 78)]);
  m.step(0.1);
  m.skip();
  assert.deepEqual(landed.at(-1), [78], 'skipping never loses the result');
  assert.ok(m.active, 'the cutscene is next');
  m.skip();
  assert.ok(!m.active);
  assert.equal(landed.length, 2);
});

test('manager: auto-roll uses the short reel and never a full-screen cutscene; cutscenes off still shows the reel; reels off shows nothing but reports', () => {
  const landed = [];
  const mk = (settings) => { const m = createRevealManager({ getSettings: () => settings, fillers: () => fillers }); m.onLanded((r) => landed.push(r.length)); return m; };
  const auto = mk({ cutscenes: 'full', reels: 'on' });
  auto.push([res(12, 1)], { source: 'auto' });
  assert.equal(auto.cutscene, null);
  let t = 0;
  while (auto.active) { auto.step(0.05); t += 0.05; }
  assert.ok(t < 0.8, `auto reel ${t}s`);
  const noCut = mk({ cutscenes: 'off', reels: 'on' });
  noCut.push([res(12, 2)]);
  assert.equal(noCut.cutscene, null);
  assert.equal(noCut.kind, 'reel');
  const none = mk({ cutscenes: 'off', reels: 'off' });
  none.push([res(12, 3)]);
  assert.ok(!none.active);
  assert.equal(landed.at(-1), 1);
});

test('manager queue: many results arriving while busy become ONE summary with the best shown, not a queue of scenes', () => {
  const landed = [];
  const m = createRevealManager({ getSettings: () => ({ cutscenes: 'full', reels: 'on' }), fillers: () => fillers });
  m.onLanded((r) => landed.push(r.length));
  m.push([res(9, 1)]);
  for (let i = 0; i < 30; i++) m.push([res(i % 10, 100 + i)], { source: 'auto' });
  assert.equal(m.pending.length, 30);
  let scenes = 0;
  let guard = 0;
  while (m.active && guard++ < 4000) {
    const was = m.kind;
    m.step(0.05);
    if (was === 'cutscene' && m.kind !== 'cutscene') scenes++;
  }
  assert.ok(!m.active);
  assert.equal(scenes, 1, 'exactly one cutscene');
  assert.deepEqual(landed, [1, 30], 'the first result, then one summary of the other 30');
});

test('reduced motion: static reel (no spin), cutscene is a short text card without flashes or camera; the result is still reported once', () => {
  const landed = [];
  const m = createRevealManager({ getSettings: () => ({ cutscenes: 'full', reels: 'on', reduced: true }), fillers: () => fillers });
  m.onLanded((r) => landed.push(r[0].uid));
  m.push([res(9, 5)]);
  assert.equal(m.current.mode, 'static');
  assert.equal(reelView(m.current).blur, false);
  assert.deepEqual(landed, [5]);
  const evs = m.fastForward(6);
  assert.equal(evs.filter((e) => e.kind === 'flash').length, 0);
  assert.equal(evs.filter((e) => e.kind === 'burst').length, 0);
  assert.ok(!m.active);
  assert.equal(landed.length, 1);
});

test('the animation can never change an outcome: the game result is fixed before the reveal exists and the reveal uses its own RNG', () => {
  const g = createGame({ storage: new MemoryStorage(), seed: 99 });
  const g2 = createGame({ storage: new MemoryStorage(), seed: 99 });
  const rolled = g.roll(1).rolled[0];
  const rolled2 = g2.roll(1).rolled[0];
  assert.equal(rolled.tier, rolled2.tier);
  const rngBefore = JSON.stringify(g.state.rng.getState());
  const m = createRevealManager({ getSettings: () => ({ cutscenes: 'full', reels: 'on' }), fillers: () => fillers });
  m.push([{ uid: rolled.uid, tier: rolled.tier, icon: 'gem', label: 'x', title: 'y' }]);
  m.fastForward(8);
  m.push([res(3, 9)]);
  m.skip();
  assert.equal(JSON.stringify(g.state.rng.getState()), rngBefore, 'the game RNG is untouched by any animation');
  assert.equal(g.roll(1).rolled[0].tier, g2.roll(1).rolled[0].tier, 'the next roll is identical with or without animations');
});
