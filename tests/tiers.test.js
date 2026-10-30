import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../src/core/rng.js';
import { big } from '../src/core/bignum.js';
import { logOdds, logValue, tierFromLog, tierInfo, MAX_TIER, HAND_TIER_COUNT, tierName, tierIcon } from '../src/gen/tiers.js';
import { drawTier, oddsTable, updatePity, accrueFreeRolls } from '../src/sim/rolling.js';
import { createState } from '../src/sim/state.js';

test('odds and value are strictly increasing forever (always a rarer tier above)', () => {
  let prevO = -1;
  let prevV = -1;
  for (const t of [0, 1, 5, 11, 12, 13, 50, 200, 1e4, 1e6, 1e9, 1e12]) {
    const o = logOdds(t);
    const v = logValue(t);
    assert.ok(Number.isFinite(o) && Number.isFinite(v), `finite at ${t}`);
    assert.ok(o > prevO && v > prevV, `increasing at ${t}`);
    prevO = o;
    prevV = v;
  }
  for (let t = 0; t < 400; t++) assert.ok(logOdds(t + 1) > logOdds(t));
});

test('tierFromLog is the exact inverse of logOdds (hand tiers and generated tiers)', () => {
  for (let t = 0; t < 600; t++) {
    assert.equal(tierFromLog(logOdds(t)), t, `t=${t}`);
    assert.equal(tierFromLog(logOdds(t) + 1e-6), t);
    if (t > 0) assert.equal(tierFromLog(logOdds(t) - 1e-6), t - 1);
  }
  assert.equal(tierFromLog(-5), 0);
  assert.equal(tierFromLog(0), 0);
  assert.equal(tierFromLog(NaN), 0);
  assert.ok(tierFromLog(1e300) <= MAX_TIER);
  assert.ok(tierFromLog(Infinity) <= MAX_TIER);
});

test('hand-written tiers have unique names, icons and colours; generated tiers have names and icons too', () => {
  const names = new Set();
  const icons = new Set();
  for (let t = 0; t < HAND_TIER_COUNT; t++) {
    names.add(tierName(t));
    icons.add(tierIcon(t));
  }
  assert.equal(names.size, HAND_TIER_COUNT);
  assert.equal(icons.size, HAND_TIER_COUNT);
  for (const t of [12, 13, 99, 1e7]) {
    const i = tierInfo(t);
    assert.ok(i.name.length > 2 && i.icon.length >= 1 && i.short.includes(i.icon));
  }
  assert.equal(tierName(77), tierName(77));
});

function distribution(logLuck, n, seed = 1, pity = null) {
  const rng = new Rng(seed);
  const counts = new Map();
  for (let i = 0; i < n; i++) {
    const { tier } = drawTier(rng, logLuck, pity);
    counts.set(tier, (counts.get(tier) || 0) + 1);
  }
  return counts;
}
const atLeast = (counts, t, n) => [...counts].filter(([k]) => k >= t).reduce((s, [, c]) => s + c, 0) / n;

test('roll odds at luck 1 follow P(tier>=t) = 1/odds_t (200k seeded rolls)', () => {
  const N = 200000;
  const c = distribution(0, N);
  for (const [t, odds] of [[1, 4], [2, 15], [3, 60], [4, 300]]) {
    const p = atLeast(c, t, N);
    const expected = 1 / odds;
    const sd = Math.sqrt((expected * (1 - expected)) / N);
    assert.ok(Math.abs(p - expected) < 5 * sd + 1e-4, `tier>=${t}: got ${p}, want ${expected}`);
  }
});

test('luck scales odds linearly: luck 10 makes P(tier>=t) ten times higher (until it saturates)', () => {
  const N = 200000;
  const c = distribution(1, N, 7);
  for (const [t, odds] of [[2, 15], [3, 60], [4, 300], [5, 2000]]) {
    const expected = Math.min(1, 10 / odds);
    const p = atLeast(c, t, N);
    const sd = Math.sqrt((expected * (1 - expected)) / N);
    assert.ok(Math.abs(p - expected) < 5 * sd + 1e-4, `tier>=${t}: got ${p}, want ${expected}`);
  }
});

test('luck has no cap: huge luck keeps producing finite, ever higher tiers', () => {
  let prev = -1;
  for (const logL of [0, 5, 20, 100, 1000, 1e6, 1e12, 1e100, 1e300]) {
    const rng = new Rng(3);
    let best = 0;
    for (let i = 0; i < 200; i++) best = Math.max(best, drawTier(rng, logL).tier);
    assert.ok(Number.isFinite(best) && best <= MAX_TIER);
    assert.ok(best >= prev, `non-decreasing at logL=${logL}`);
    prev = best;
  }
  assert.ok(prev > 1e6);
});

test('rolls are reproducible: same seed -> same tiers', () => {
  const a = distribution(2, 5000, 99);
  const b = distribution(2, 5000, 99);
  assert.deepEqual([...a].sort(), [...b].sort());
});

test('odds table: probabilities are consistent and sum to ~1', () => {
  const rows = oddsTable(big(1), 0, 40);
  assert.ok(rows[0].atLeast.eq(1));
  assert.ok(Math.abs(rows[1].atLeast.toNumber() - 0.25) < 1e-9);
  const total = rows.reduce((s, r) => s + r.exact.toNumber(), 0);
  assert.ok(Math.abs(total - 1) < 1e-6, String(total));
  const rich = oddsTable(big('1e50'), 0, 12);
  assert.ok(rich[0].exact.isZero()); // at huge luck common never appears
  for (const r of rows) assert.ok(r.exact.gte(0));
});

test('pity guarantees progress: forced draws come at the documented spacing', () => {
  const rng = new Rng(11);
  const pity = { soft: 0, hard: 0 };
  let sinceGood = 0;
  let worst = 0;
  for (let i = 0; i < 20000; i++) {
    const { tier, logX } = drawTier(rng, 0, pity);
    updatePity(pity, 0, logX);
    if (tier >= 2) sinceGood = 0; // soft pity: logX >= log10(8) -> tier >= 2 (odds 15 > 8 is tier 1 ... see below)
    else sinceGood++;
    worst = Math.max(worst, sinceGood);
  }
  // soft pity forces logX >= log10(8) => tier 1 at least; hard pity forces >= log10(120) => tier 3
  const rng2 = new Rng(5);
  const p2 = { soft: 0, hard: 0 };
  let gap = 0;
  let worstGap = 0;
  for (let i = 0; i < 30000; i++) {
    const { tier, logX } = drawTier(rng2, 0, p2);
    updatePity(p2, 0, logX);
    if (tier >= 3) gap = 0;
    else gap++;
    worstGap = Math.max(worstGap, gap);
  }
  assert.ok(worstGap <= 200, `hard pity spacing violated: ${worstGap}`);
  assert.ok(worst < 400);
});

test('free rolls accrue in closed form, cap, and pause at the cap', () => {
  const s = createState(1, 0);
  s.freeRoll = { progress: 0, count: 0 };
  assert.equal(accrueFreeRolls(s, 119), 0);
  assert.equal(accrueFreeRolls(s, 1), 1);
  assert.equal(s.freeRoll.count, 1);
  accrueFreeRolls(s, 1e12); // years offline
  assert.equal(s.freeRoll.count, 3);
  assert.equal(s.freeRoll.progress, 0);
  assert.equal(accrueFreeRolls(s, 500), 0);
  assert.equal(accrueFreeRolls(s, -50), 0);
  // equals stepping second by second
  const a = createState(1, 0);
  const b = createState(1, 0);
  a.freeRoll = { progress: 30, count: 0 };
  b.freeRoll = { progress: 30, count: 0 };
  accrueFreeRolls(a, 250);
  for (let i = 0; i < 250; i++) accrueFreeRolls(b, 1);
  assert.equal(a.freeRoll.count, b.freeRoll.count);
  assert.ok(Math.abs(a.freeRoll.progress - b.freeRoll.progress) < 1e-6);
});
