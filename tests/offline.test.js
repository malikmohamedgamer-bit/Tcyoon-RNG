import { test } from 'node:test';
import assert from 'node:assert/strict';
import { big } from '../src/core/bignum.js';
import { createState } from '../src/sim/state.js';
import { applyOffline } from '../src/sim/offline.js';
import { accrueFreeRolls } from '../src/sim/rolling.js';
import { stepProduction, refreshProduction } from '../src/sim/production.js';
import { stepBoosters, buyBooster } from '../src/sim/shop.js';
import { addMoney, luckOf } from '../src/sim/economy.js';
import { place } from '../src/sim/placement.js';
import { addToBag } from '../src/sim/inventory.js';
import { sanitizeElapsed, MAX_OFFLINE_SECONDS } from '../src/core/time.js';
import { createGame } from '../src/game.js';
import { MemoryStorage, SAVE_KEY } from '../src/core/save.js';
import { serializeState } from '../src/sim/state.js';

const rel = (a, b) => Math.abs(a - b) / Math.max(1, Math.abs(b));
function withBase() {
  const s = createState(41, 0);
  for (const u of [...s.bag]) delete s.items[u];
  s.bag = [];
  const give = (tpl, tier = 0) => addToBag(s, { tpl, tier, vs: 0, hy: null, mut: [] }, { force: true }).uid;
  place(s, give('gem_forge', 3), 0, 0, 0);
  place(s, give('amp', 2), 1, 0, 0);
  place(s, give('bazaar', 2), 2, 0, 0);
  s.money = big(0);
  s.freeRoll = { progress: 17, count: 0 };
  refreshProduction(s);
  return s;
}
// the reference: tick-by-tick simulation exactly as the live loop does it
function tick(s, seconds, dt = 0.05) {
  const n = Math.round(seconds / dt); // integer step count (float accumulation would add a spurious extra step)
  for (let i = 0; i < n; i++) {
    accrueFreeRolls(s, dt);
    stepProduction(s, dt, addMoney);
    stepBoosters(s, dt);
  }
}

test('closed form == real simulation for income and free rolls (tolerance 1e-6 relative, documented)', () => {
  for (const seconds of [10, 60, 301.5, 1800]) {
    const a = withBase();
    const b = withBase();
    tick(a, seconds);
    const sum = applyOffline(b, seconds);
    assert.ok(rel(b.money.toNumber(), a.money.toNumber()) < 1e-6, `${seconds}s: ${b.money.toNumber()} vs ${a.money.toNumber()}`);
    assert.equal(b.freeRoll.count, a.freeRoll.count);
    assert.ok(Math.abs(b.freeRoll.progress - a.freeRoll.progress) < 0.06);
    assert.ok(sum.money.gt(0));
  }
});

test('boosters expiring mid-absence are credited only for their duration', () => {
  const mkB = () => {
    const s = withBase();
    s.money = big(1e9);
    buyBooster(s, 'goldRush'); // income x2 for 600 s
    s.money = big(0);
    refreshProduction(s);
    return s;
  };
  for (const seconds of [300, 600, 1000, 5000]) {
    const a = mkB();
    const b = mkB();
    tick(a, seconds, 0.1);
    const sum = applyOffline(b, seconds);
    assert.ok(rel(b.money.toNumber(), a.money.toNumber()) < 1e-3, `${seconds}s: ${b.money.toNumber()} vs ${a.money.toNumber()}`); // dt granularity at the expiry edge
    assert.equal(b.boosts.length, a.boosts.length);
    if (seconds > 600) assert.equal(sum.boostersExpired, 1);
  }
  // and it is far less than if the booster had lasted the whole time
  const c = mkB();
  applyOffline(c, 5000);
  const base = withBase();
  applyOffline(base, 5000);
  assert.ok(c.money.toNumber() < base.money.toNumber() * (1 + 600 / 5000) * 1.0001);
  assert.ok(c.money.toNumber() > base.money.toNumber());
});

test('free rolls: closed form equals stepping for many random spans (bounded by the cap)', () => {
  let seed = 7;
  const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 200; i++) {
    const a = createState(1, 0);
    const b = createState(1, 0);
    const init = { progress: r() * 100, count: Math.floor(r() * 3) };
    a.freeRoll = { ...init };
    b.freeRoll = { ...init };
    const sec = r() * 1000;
    accrueFreeRolls(a, sec);
    for (let t = 0; t < Math.floor(sec); t++) accrueFreeRolls(b, 1);
    accrueFreeRolls(b, sec - Math.floor(sec));
    assert.equal(a.freeRoll.count, b.freeRoll.count);
    assert.ok(Math.abs(a.freeRoll.progress - b.freeRoll.progress) < 1e-6);
  }
});

test('days, months and years away are instant and finite (closed form, not a loop)', () => {
  for (const seconds of [86400, 30 * 86400, 365 * 86400, 10 * 365 * 86400]) {
    const s = withBase();
    const t0 = performance.now();
    const sum = applyOffline(s, seconds);
    const ms = performance.now() - t0;
    assert.ok(ms < 100, `${seconds}s took ${ms}ms`);
    assert.ok(s.money.isFinite() && sum.money.isFinite());
    assert.ok(s.money.gt(0));
    assert.equal(s.freeRoll.count, 3);
  }
  const s = withBase();
  const income = s._p.income.toNumber();
  applyOffline(s, 365 * 86400);
  assert.ok(rel(s.money.toNumber(), income * 365 * 86400) < 1e-9);
});

test('absurd and invalid elapsed time is safe: negative ignored, NaN ignored, far future clamped to 10 years', () => {
  assert.deepEqual(sanitizeElapsed(2000, 1000), { seconds: 0, negative: true, clamped: false });
  assert.deepEqual(sanitizeElapsed(NaN, 1000), { seconds: 0, negative: false, clamped: false });
  assert.deepEqual(sanitizeElapsed(0, Infinity), { seconds: 0, negative: false, clamped: false });
  const far = sanitizeElapsed(0, 1e18);
  assert.equal(far.seconds, MAX_OFFLINE_SECONDS);
  assert.equal(far.clamped, true);
  assert.equal(MAX_OFFLINE_SECONDS, 10 * 365 * 24 * 3600);
  const s = withBase();
  const before = s.money;
  assert.equal(applyOffline(s, -100).seconds, 0);
  assert.equal(applyOffline(s, NaN).seconds, 0);
  assert.equal(applyOffline(s, Infinity).seconds, 0);
  assert.ok(s.money.eq(before));
});

test('game load applies offline progress from the save timestamp, once, with a welcome-back summary', () => {
  const storage = new MemoryStorage();
  const s = withBase();
  const income = s._p.income.toNumber();
  const away = 2 * 3600 * 1000;
  const money0 = 500;
  s.money = big(money0);
  storage.setItem(SAVE_KEY, JSON.stringify(serializeState(s, Date.now() - away)));
  const g = createGame({ storage });
  assert.ok(g.welcome, 'welcome-back summary');
  assert.ok(Math.abs(g.welcome.seconds - 7200) < 5);
  assert.ok(rel(g.state.money.toNumber() - money0, income * g.welcome.seconds) < 1e-9);
  assert.equal(g.welcome.freeRolls, 3);
  // a second load from the *new* save does not pay again
  g.saveNow();
  const g2 = createGame({ storage });
  assert.equal(g2.welcome, null);
});

test('a save whose timestamp is in the future (clock moved back) gives no offline progress', () => {
  const storage = new MemoryStorage();
  const s = withBase();
  s.money = big(500);
  storage.setItem(SAVE_KEY, JSON.stringify(serializeState(s, Date.now() + 5 * 3600 * 1000)));
  const g = createGame({ storage });
  assert.ok(g.welcome && g.welcome.negative);
  assert.ok(g.state.money.eq(500));
});

test('catchUp: normal absence => welcome summary; negative => ignored; clamp flagged', () => {
  const storage = new MemoryStorage();
  const g = createGame({ storage, seed: 3 });
  const place1 = g.state.bag[0];
  const place2 = g.state.bag[1];
  g.place(place1, 0, 0, 0);
  g.place(place2, 1, 0, 0);
  const m0 = g.state.money.toNumber();
  const w = g.catchUp(1_000_000, 1_000_000 + 3600 * 1000);
  assert.ok(w && w.seconds === 3600);
  assert.ok(rel(g.state.money.toNumber() - m0, 1.3 * 3600) < 1e-6);
  assert.ok(w.freeRolls >= 0 && !w.negative && !w.clamped);
  const m1 = g.state.money.toNumber();
  const back = g.catchUp(5_000_000, 1_000_000);
  assert.ok(back.negative);
  assert.equal(g.state.money.toNumber(), m1);
  const far = g.catchUp(0, 1e18);
  assert.ok(far.clamped);
  assert.ok(g.state.money.isFinite());
  assert.ok(luckOf(g.state).isFinite());
});
