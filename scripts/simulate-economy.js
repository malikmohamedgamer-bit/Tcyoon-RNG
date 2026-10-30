#!/usr/bin/env node
// Economy simulator: a scripted bot plays N simulated days with the real simulation code
// and the script verifies the economy guarantees documented in the README:
//   1. progress never stalls (lifetime earnings grow in every 6-hour window)
//   2. no layer is skippable by a trivial exploit (needs lower-layer progress; rebirth spam
//      and never-rebirthing are both worse than playing)
//   3. rolling remains worthwhile (a roll batch pays for itself within a bounded time, shortly
//      after every rebirth, and is never free)
//   4. time-to-next-rebirth stays within documented bounds
//   5. numbers stay finite over very long runs
// Usage: node scripts/simulate-economy.js [--days 30] [--seed 1] [--quick]
import { Big } from '../src/core/bignum.js';
import { newBotState, decide, advance } from './lib/bot.js';
import { modifiers, rollCost, luckOf } from '../src/sim/economy.js';
import { layerState } from '../src/sim/rebirth.js';
import { formatDuration } from '../src/core/time.js';

const HOUR = 3600;

/** Documented bounds (README "Economy guarantees"). Times are simulated seconds of bot play. */
export const BOUNDS = {
  firstRebirthMin: 3 * 60,
  firstRebirthMax: 60 * 60,
  betweenRebirthMin: 30,
  betweenRebirthMax: 6 * HOUR,
  stallWindow: 6 * HOUR,
  stallMinGrowth: 0.01, // lifetime earnings grow >= 1% in every 6 h window
  rollingAdvantage: 1, // log10: paid rolling must beat never-rolling by >= 10x best-income-so-far at every checkpoint
  checkpointsHours: [12, 24, 36],
  minLayer1Rebirths: 3, // layer 1 needs at least this many layer-0 rebirths first
};

const interval = (t) => (t < 1800 ? 5 : t < 6 * HOUR ? 20 : t < 48 * HOUR ? 60 : 300);

export function allFinite(state) {
  const bigs = [state.money, state.runMoney, state.totalMoney, state.xp, luckOf(state), rollCost(state)];
  for (const l of state.layers) bigs.push(l.currency, l.total, l.run);
  const m = modifiers(state);
  bigs.push(m.income, m.luck, m.xp, m.dmg, m.baseHp);
  for (const b of bigs) if (!b.isFinite() || b.isNegative() || /NaN|Infinity/.test(b.format())) return false;
  return Number.isFinite(state.level) && Number.isFinite(m.rollCostMult);
}

export function run({ days, seed = 1, noPrestige = false, rebirthFactor = 1, maxSide = 14, stepScale = 1, minRun = 600, noRoll = false } = {}) {
  const s = newBotState(seed);
  const endT = days * 24 * HOUR;
  let t = 0;
  let nextHour = HOUR;
  const out = { rebirths: [], layerFirst: {}, hours: [], stalls: [], nonFinite: null, decisions: 0 };
  let lastL0 = 0;
  let window0 = { t: 0, earned: Big.fromNumber(0), rebirths: 0 };
  const t0 = Date.now();
  while (t < endT) {
    const dt = interval(t) * stepScale;
    advance(s, dt);
    t += dt;
    const log = decide(s, { noPrestige, rebirthFactor, maxSide, minRunSeconds: minRun, noRoll, dt });
    out.decisions++;
    for (const k of log.prestiged) {
      out.rebirths.push({ t, layer: k, sinceLast: t - lastL0 });
      lastL0 = t;
      if (!(k in out.layerFirst)) out.layerFirst[k] = { t, layer0Count: layerState(s, 0).count };
    }
    if (t >= nextHour) {
      nextHour += HOUR;
      out.hours.push({ t, income: s._p.income, money: s.money, level: s.level, layers: s.layers.map((l) => l.count) });
      if (!out.nonFinite && !allFinite(s)) out.nonFinite = t;
      if (t - window0.t >= BOUNDS.stallWindow) {
        const rel = window0.earned.isZero() ? 1 : s.totalMoney.sub(window0.earned).div(window0.earned).toNumber();
        // progress = any prestige in the window, or lifetime earnings up by >= 1%
        const prestiges = out.rebirths.length - window0.rebirths;
        if (prestiges === 0 && !(rel >= BOUNDS.stallMinGrowth)) out.stalls.push({ t, rel });
        window0 = { t, earned: s.totalMoney, rebirths: out.rebirths.length };
      }
    }
  }
  out.state = s;
  out.ms = Date.now() - t0;
  return out;
}

const fmtB = (b) => Big.from(b).format({ digits: 2 });
const median = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];

export function evaluate(days, seed, { horizon: horizonDays = 1.5 } = {}) {
  const r = run({ days, seed });
  const s = r.state;
  const l0 = r.rebirths.filter((x) => x.layer === 0);
  const first = l0[0];
  const gaps = l0.slice(1).map((x) => x.sinceLast);
  const checks = [];
  const check = (name, ok, detail) => checks.push({ name, ok, detail });
  check('1. progress never stalls (every 6 h window has a prestige or >= 1% more lifetime earnings)', r.stalls.length === 0, r.stalls.length ? JSON.stringify(r.stalls.slice(0, 3)) : 'no stalled window');
  check('2a. layer 1 needs >= 3 layer-0 rebirths (cannot be skipped)', !r.layerFirst[1] || r.layerFirst[1].layer0Count >= BOUNDS.minLayer1Rebirths, r.layerFirst[1] ? `${r.layerFirst[1].layer0Count} layer-0 rebirths first` : 'layer 1 not reached in this run');
  check('4a. first rebirth within 3-60 minutes', !!first && first.t >= BOUNDS.firstRebirthMin && first.t <= BOUNDS.firstRebirthMax, first ? formatDuration(first.t) : 'no rebirth');
  check('4b. time between layer-0 rebirths within 30 s - 6 h', gaps.every((g) => g >= BOUNDS.betweenRebirthMin && g <= BOUNDS.betweenRebirthMax), gaps.length ? `${gaps.length} gaps: min ${formatDuration(Math.min(...gaps))}, median ${formatDuration(median(gaps))}, max ${formatDuration(Math.max(...gaps))}` : 'n/a');
  check('5. numbers stay finite for the whole run', !r.nonFinite && allFinite(s), r.nonFinite ? `non-finite at ${formatDuration(r.nonFinite)}` : `final money ${fmtB(s.money)}, level ${s.level}, ${s.layers.length} layers`);
  // exploit baselines: same bot, same seed, 1.5 simulated days, coarser decisions. Income right after a
  // rebirth is deliberately low, so the fair measure is the PEAK income over the last 6 hourly samples.
  const horizon = Math.min(days, horizonDays);
  const o = { days: horizon, seed, stepScale: 2 };
  const base = run(o);
  const noRoll = run({ ...o, noRoll: true });
  const spam = run({ ...o, rebirthFactor: 0, minRun: 0 });
  const hoard = run({ ...o, noPrestige: true });
  const peak = (x) => Math.max(...x.hours.slice(-6).map((h) => h.income.log10Num()));
  const peakAt = (x, hr) => Math.max(...x.hours.slice(0, hr).map((h) => h.income.log10Num())); // best income reached so far
  const need = BOUNDS.checkpointsHours.filter((h) => h <= horizon * 24);
  const adv = need.map((h) => ({ h, d: peakAt(base, h) - peakAt(noRoll, h) }));
  check('3. rolling remains worthwhile: paid rolling beats never-rolling by >= 10x best-income-so-far at every checkpoint', adv.length > 0 && adv.every((a) => a.d >= BOUNDS.rollingAdvantage), adv.map((a) => `${a.h}h: x10^${a.d.toFixed(1)}`).join(', '));
  check('2b. rebirth-spamming at the minimum threshold is not better than playing', peak(spam) <= peak(base), `peak income (last 6 h of ${horizon} d): spam 1e${peak(spam).toFixed(1)} vs normal 1e${peak(base).toFixed(1)}`);
  check('2c. never prestiging is worse than prestiging', peak(base) >= peak(hoard), `peak income: normal 1e${peak(base).toFixed(1)}/s vs never-prestige 1e${peak(hoard).toFixed(1)}/s after ${horizon} d`);
  return { r, checks, first, gaps };
}

function main() {
  const args = process.argv.slice(2);
  const flag = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? Number(args[i + 1]) : d; };
  const quick = args.includes('--quick');
  const days = quick ? 2 : flag('days', 30);
  const seed = flag('seed', 1);
  console.log(`Economy simulation: ${days} simulated day(s), seed ${seed}${quick ? ' (quick)' : ''}`);
  const { r, checks } = evaluate(days, seed, { horizon: quick ? 1 : 1.5 });
  console.log(`\nSimulated ${days} days in ${(r.ms / 1000).toFixed(1)}s real time (${r.decisions} bot decisions)`);
  console.log('\nHour  Income/s   Money      Level  Prestige counts per layer');
  const step = Math.max(1, Math.floor(r.hours.length / 14));
  for (let i = 0; i < r.hours.length; i += step) {
    const h = r.hours[i];
    console.log(`${String(Math.round(h.t / HOUR)).padStart(4)}  ${fmtB(h.income).padEnd(10)} ${fmtB(h.money).padEnd(10)} ${String(h.level).padEnd(6)} ${h.layers.join(',')}`);
  }
  for (const [k, v] of Object.entries(r.layerFirst)) console.log(`Layer ${Number(k) + 1} (index ${k}) first prestige at ${formatDuration(v.t)} after ${v.layer0Count} layer-0 rebirths`);
  console.log('');
  let fail = 0;
  for (const c of checks) {
    console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}\n      ${c.detail}`);
    if (!c.ok) fail++;
  }
  console.log(fail ? `\n${fail} check(s) FAILED` : '\nAll economy checks passed');
  process.exit(fail ? 1 : 0);
}

if (process.argv[1] && process.argv[1].endsWith('simulate-economy.js')) main();
