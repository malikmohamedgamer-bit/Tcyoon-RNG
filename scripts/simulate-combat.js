#!/usr/bin/env node
// Combat simulator: builds "reasonable" defences (6 turrets + 2 weapons of tier t) and plays real,
// deterministic encounters to measure how far each tier gets. It verifies the documented guarantees:
//   1. a reasonable tier-t build beats waves up to ~3t (every tier can be beaten)
//   2. ...but not far beyond (difficulty never becomes trivial): wave 3t + 18 is lost
//   3. the beatable wave is non-decreasing in tier (progress is never punished) and grows without bound
//   4. every boss is beatable by a build 2 tiers above its equivalent wave tier, and NOT by one 6 tiers below
//   5. bosses and waves get strictly tougher forever, numbers stay finite at absurd waves
//   6. manual play is faster than auto (never required, never worse)
// Usage: node scripts/simulate-combat.js [--quick] [--tiers 30] [--bosses 12] [--seed 1]
import { Big } from '../src/core/bignum.js';
import { createState } from '../src/sim/state.js';
import { addToBag } from '../src/sim/inventory.js';
import { place } from '../src/sim/placement.js';
import { createEncounter, runEncounter, equipWeapon, setManual, stepEncounter, forecastWave, bestWinnableWave } from '../src/sim/combat.js';
import { refreshProduction } from '../src/sim/production.js';
import { bossDef } from '../src/gen/bosses.js';
import { waveHp } from '../src/gen/monsters.js';

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? Number(args[i + 1]) : d; };
const quick = args.includes('--quick');
const DIFFICULTY = args.includes('--difficulty') ? args[args.indexOf('--difficulty') + 1] : null;
const TIERS = flag('tiers', quick ? 12 : 30);
const BOSSES = flag('bosses', quick ? 5 : 12);
const SEED = flag('seed', 1);

export const BOUNDS = {
  beatSlack: 0, // tier t must beat wave 3t (+ slack)
  trivialAfter: 18, // ...and lose by wave 3t + 18
  bossTierPlus: 2,
  bossWeakerBy: 6,
};

const TURRETS = ['gun_turret', 'flame_tower', 'frost_spire', 'arc_coil', 'void_cannon', 'gun_turret'];

/** The reference "reasonable build": 6 turrets and 2 weapons of tier t on a 6x6 base. */
export function buildState(tier, seed = SEED, difficulty = DIFFICULTY) {
  const s = createState(seed, 0);
  if (difficulty) s.difficulty = difficulty;
  s.level = 12;
  for (const u of [...s.bag]) delete s.items[u];
  s.bag = [];
  TURRETS.forEach((tpl, i) => {
    const it = addToBag(s, { tpl, tier, vs: 0, hy: null, mut: [] }, { force: true });
    place(s, it.uid, 1 + (i % 4), 1 + Math.floor(i / 4), 0);
  });
  for (const tpl of ['bolt_rifle', 'plasma_pistol']) {
    const it = addToBag(s, { tpl, tier, vs: 0, hy: null, mut: [] }, { force: true });
    equipWeapon(s, it.uid);
  }
  refreshProduction(s);
  return s;
}

function beats(tier, wave, seed, difficulty = DIFFICULTY) {
  const s = buildState(tier, seed, difficulty);
  s.combat.wave = wave;
  const enc = createEncounter(s, 'wave');
  return runEncounter(enc, { maxSeconds: 300 }) === 'win';
}

/** Highest wave the tier-t reference build beats (binary search; waves are monotonically harder). */
export function maxWave(tier, seed = SEED, difficulty = DIFFICULTY) {
  let lo = 0;
  let hi = 4;
  while (hi < 5000 && beats(tier, hi, seed, difficulty)) {
    lo = hi;
    hi *= 2;
  }
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (beats(tier, mid, seed, difficulty)) lo = mid;
    else hi = mid;
  }
  return lo;
}

function beatsBoss(tier, n, seed) {
  const s = buildState(tier, seed);
  s.combat.bossIndex = n;
  const enc = createEncounter(s, 'boss', { bossN: n });
  return runEncounter(enc, { maxSeconds: 200 }) === 'win';
}

/** Weapons-only defence of tier t at `wave`; manual = the avatar stands at the core and aims at the incoming enemies. */
function weaponsOnly(tier, wave, seed, manual) {
  const s = createState(seed, 0);
  s.level = 12;
  for (const u of [...s.bag]) delete s.items[u];
  s.bag = [];
  for (const tpl of ['bolt_rifle', 'plasma_pistol']) equipWeapon(s, addToBag(s, { tpl, tier, vs: 0, hy: null, mut: [] }, { force: true }).uid);
  s.combat.wave = wave;
  const enc = createEncounter(s, 'wave');
  if (manual) setManual(enc, true);
  let n = 0;
  while (!enc.done && n++ < 8000) stepEncounter(enc, 0.05, manual ? { mx: 0, mz: 0, ax: 0, az: -8 } : null);
  if (!enc.done) enc.done = 'lose';
  return enc;
}

function maxWaveWeapons(tier, seed, manual) {
  let lo = 0;
  let hi = 4;
  while (hi < 2000 && weaponsOnly(tier, hi, seed, manual).done === 'win') {
    lo = hi;
    hi *= 2;
  }
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (weaponsOnly(tier, mid, seed, manual).done === 'win') lo = mid;
    else hi = mid;
  }
  return lo;
}

function main() {
  console.log(`Combat simulation: tiers 1-${TIERS}, bosses 0-${BOSSES - 1}, seed ${SEED}${DIFFICULTY ? `, difficulty ${DIFFICULTY}` : ''}${quick ? ' (quick)' : ''}`);
  const t0 = Date.now();
  const checks = [];
  const check = (name, ok, detail) => checks.push({ name, ok, detail });

  console.log('\nTier  best wave  (target >= 3t, lose by 3t+18)   forecast');
  const best = [];
  for (let t = 1; t <= TIERS; t++) {
    const w = maxWave(t);
    best.push(w);
    const fc = bestWinnableWave(buildState(t), 1);
    console.log(`${String(t).padStart(4)}  ${String(w).padStart(9)}  ${String(3 * t).padStart(6)}..${String(3 * t + BOUNDS.trivialAfter).padEnd(6)}                  ${fc}`);
  }
  const tooWeak = best.map((w, i) => ({ t: i + 1, w })).filter(({ t, w }) => w < 3 * t + BOUNDS.beatSlack);
  check('1. every tier can be beaten: a tier-t build beats wave 3t', tooWeak.length === 0, tooWeak.length ? `below 3t: ${JSON.stringify(tooWeak.slice(0, 4))}` : `min margin ${Math.min(...best.map((w, i) => w - 3 * (i + 1)))} waves`);
  const trivial = best.map((w, i) => ({ t: i + 1, w })).filter(({ t, w }) => w >= 3 * t + BOUNDS.trivialAfter);
  check('2. never trivial: a tier-t build loses by wave 3t+18', trivial.length === 0, trivial.length ? `too strong: ${JSON.stringify(trivial.slice(0, 4))}` : `max overshoot ${Math.max(...best.map((w, i) => w - 3 * (i + 1)))} waves`);
  const mono = best.every((w, i) => i === 0 || w >= best[i - 1]);
  check('3. beatable wave is non-decreasing in tier and unbounded', mono && best[best.length - 1] > best[0], `tier 1 -> wave ${best[0]}, tier ${TIERS} -> wave ${best[best.length - 1]}`);

  const bossRows = [];
  let bossOk = true;
  for (let n = 0; n < BOSSES; n++) {
    const d = bossDef(n);
    const need = Math.ceil(d.wave / 3) + BOUNDS.bossTierPlus;
    const strong = beatsBoss(need, n, SEED);
    const weak = need - BOUNDS.bossWeakerBy >= 1 ? beatsBoss(need - BOUNDS.bossWeakerBy, n, SEED) : false;
    bossRows.push(`boss ${n} (${d.name}, wave-eq ${d.wave}, ${d.mechanics.join('+')}): tier ${need} ${strong ? 'WINS' : 'loses'}; ${need - BOUNDS.bossWeakerBy >= 1 ? `tier ${need - BOUNDS.bossWeakerBy} ${weak ? 'wins (too easy)' : 'loses'}` : 'weak build n/a (tier < 1)'}`);
    if (!strong || weak) bossOk = false;
  }
  console.log('\n' + bossRows.join('\n'));
  check(`4. bosses 0-${BOSSES - 1}: beatable at tier(wave)+2, not at tier(wave)-4`, bossOk, bossOk ? 'all bosses within the intended band' : 'see rows above');

  let hpOk = true;
  for (let n = 1; n < 400; n++) if (!bossDef(n).hp.gt(bossDef(n - 1).hp)) hpOk = false;
  for (let w = 2; w < 3000; w++) if (!waveHp(w).gt(waveHp(w - 1))) hpOk = false;
  let finite = true;
  const s = buildState(8);
  for (const w of [1e3, 1e5, 1e8]) {
    const f = forecastWave(s, w);
    if (!f.enemyHp.isFinite() || Number.isNaN(f.baseDamage)) finite = false;
  }
  if (!bossDef(1e6).hp.isFinite() || bossDef(1e6).hp.lte(Big.fromNumber(0))) finite = false;
  check('5. waves and bosses get strictly tougher forever; numbers stay finite at wave 1e8 / boss 1e6', hpOk && finite, `monotone hp: ${hpOk}, finite: ${finite}`);

  const tiersM = quick ? [4, 8] : [4, 8, 14];
  const rows = tiersM.map((t) => ({ t, auto: maxWaveWeapons(t, SEED, false), manual: maxWaveWeapons(t, SEED, true) }));
  check('6. manual play beats waves auto play cannot (never worse), so it is faster progress but never required', rows.every((r) => r.manual >= r.auto + 1), rows.map((r) => `tier ${r.t}: auto wave ${r.auto} vs manual wave ${r.manual}`).join('; '));

  if (!DIFFICULTY) {
    const rel = [2, 6, 10].map((t) => ({ t, std: best[t - 1] ?? maxWave(t), rel: maxWave(t, SEED, 'relaxed') }));
    check('7. relaxed is easier but not trivial: it beats at least as many waves, but at most 6 more', rel.every((r) => r.rel >= r.std && r.rel <= r.std + 6), rel.map((r) => `tier ${r.t}: standard wave ${r.std} vs relaxed wave ${r.rel}`).join('; '));
  }
  console.log(`\n(${((Date.now() - t0) / 1000).toFixed(1)} s)\n`);
  let fail = 0;
  for (const c of checks) {
    console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}\n      ${c.detail}`);
    if (!c.ok) fail++;
  }
  console.log(fail ? `\n${fail} check(s) FAILED` : '\nAll combat checks passed');
  process.exit(fail ? 1 : 0);
}

if (process.argv[1] && process.argv[1].endsWith('simulate-combat.js')) main();
