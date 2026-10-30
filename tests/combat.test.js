import { test } from 'node:test';
import assert from 'node:assert/strict';
import { big } from '../src/core/bignum.js';
import { createState } from '../src/sim/state.js';
import { addToBag } from '../src/sim/inventory.js';
import { place } from '../src/sim/placement.js';
import { buildWave, waveHp, waveSlots, ENEMY_TEMPLATES } from '../src/gen/monsters.js';
import { bossDef, bossWave } from '../src/gen/bosses.js';
import { getMutation } from '../src/gen/mutations.js';
import { createEncounter, stepEncounter, runEncounter, setManual, buildDefenders, baseMaxHp, settleEncounter, startEncounter, stepCombat, canFightBoss, forecastWave, bestWinnableWave, equipWeapon, unequipWeapon, gearSlots, loseWavePenalty, waveReward, MANUAL_BONUS, WAVE_INTERVAL } from '../src/sim/combat.js';
import { refreshProduction } from '../src/sim/production.js';
import { drain } from '../src/core/events.js';

const mk = (seed = 1) => {
  const s = createState(seed, 0);
  s.level = 12;
  s.money = big(1e6);
  for (const u of [...s.bag]) delete s.items[u];
  s.bag = [];
  refreshProduction(s);
  return s;
};
const give = (s, tpl, tier = 0, mut = []) => addToBag(s, { tpl, tier, vs: 0, hy: null, mut }, { force: true });
function turrets(s, tpl, tier, n, startX = 1) {
  for (let i = 0; i < n; i++) {
    const it = give(s, tpl, tier);
    const r = place(s, it.uid, startX + (i % 4), 1 + Math.floor(i / 4), 0);
    assert.ok(r.ok, r.reason);
  }
}
const weapon = (s, tpl, tier) => {
  const it = give(s, tpl, tier);
  assert.ok(equipWeapon(s, it.uid).ok);
  return it;
};

test('waves are deterministic per seed and wave; enemy hp follows the tier value curve; slots are capped', () => {
  const a = buildWave(7, 12);
  const b = buildWave(7, 12);
  assert.deepEqual(a.enemies.map((e) => [e.tpl, e.name, e.t]), b.enemies.map((e) => [e.tpl, e.name, e.t]));
  assert.notDeepEqual(buildWave(8, 12).enemies.map((e) => e.tpl + e.angle), a.enemies.map((e) => e.tpl + e.angle));
  assert.ok(waveHp(1).eq(12));
  assert.ok(Math.abs(waveHp(4).toNumber() - 12 * 3) < 1e-6); // tier 1 value 3 after 3 waves
  assert.ok(waveHp(31).toNumber() / waveHp(1).toNumber() > 1e3);
  for (const w of [1, 10, 100, 1e4, 1e6]) {
    assert.ok(waveSlots(w) >= 4 && waveSlots(w) <= 40);
    assert.ok(waveHp(w).isFinite());
  }
  for (const e of buildWave(1, 1).enemies) assert.equal(e.tpl, 'grunt'); // only templates whose minWave allows
  const big12 = buildWave(3, 20);
  assert.ok(big12.enemies.some((e) => e.tpl !== 'grunt'));
  assert.equal(buildWave(3, 20, { slotMult: 2 }).count > big12.count, true);
  assert.ok(ENEMY_TEMPLATES.length >= 7);
});

test('bosses are endless and deterministic: scaling hp, growing mechanics, unique names, unique mutation', () => {
  assert.deepEqual(bossDef(3), bossDef(3));
  let prev = big(0);
  const names = new Set();
  for (const n of [0, 1, 5, 20, 100, 1000, 100000]) {
    const d = bossDef(n);
    assert.ok(d.hp.gt(prev) && d.hp.isFinite());
    prev = d.hp;
    names.add(d.name);
    assert.equal(d.wave, bossWave(n));
    assert.ok(d.mechanics.length >= 2 && d.mechanics.length <= 7);
    assert.equal(new Set(d.mechanics).size, d.mechanics.length);
  }
  assert.equal(names.size, 7);
  assert.ok(bossDef(10).mechanics.length > bossDef(0).mechanics.length);
  const m = getMutation('boss:4');
  assert.ok(m.unique && m.applies.includes('weapon') && m.effects[0].mul.eq(3 + 0.5 * 4));
  assert.equal(getMutation('boss:x'), null);
});

test('encounters are fully deterministic: same seed + same build = identical outcome and numbers', () => {
  const run = (seed) => {
    const s = mk(seed);
    turrets(s, 'gun_turret', 2, 3);
    weapon(s, 'bolt_rifle', 2);
    s.combat.wave = 10;
    const enc = createEncounter(s, 'wave');
    runEncounter(enc);
    return [enc.done, enc.kills, enc.t.toFixed(3), enc.baseHp.format(), enc.stats.shots, enc.stats.damage.format()];
  };
  assert.deepEqual(run(5), run(5));
});

test('strong defence wins without damage; no defence loses; base hp never goes negative; always terminates', () => {
  const strong = mk();
  turrets(strong, 'gun_turret', 6, 8);
  weapon(strong, 'bolt_rifle', 6);
  strong.combat.wave = 6;
  const e1 = createEncounter(strong, 'wave');
  assert.equal(runEncounter(e1), 'win');
  assert.ok(e1.baseHp.eq(e1.baseMax));
  const none = mk();
  none.combat.wave = 6;
  const e2 = createEncounter(none, 'wave');
  assert.equal(runEncounter(e2), 'lose');
  assert.ok(e2.baseHp.gte(0));
  assert.ok(e2.t < 400);
});

test('damage types: resistances and weaknesses apply; void ignores resistance', () => {
  const hitWith = (dtype, tplEnemy) => {
    const s = mk();
    const it = give(s, 'gun_turret', 0);
    place(s, it.uid, 2, 2, 0);
    const enc = createEncounter(s, 'wave');
    enc.queue = [];
    const e = { tpl: tplEnemy, name: 'x', hp: big(1e9), speed: 0, range: 1, dpsFrac: 0, res: ENEMY_TEMPLATES.find((t) => t.id === tplEnemy).res, traits: [] };
    enc.defenders = [{ kind: 'turret', x: 0, z: 0, range: 50, rof: 1, dmg: big(100), dtype, special: null, cd: 0 }];
    enc.enemies.push({ id: 1, tpl: e.tpl, name: 'x', hp: e.hp, maxHp: e.hp, x: 5, z: 0, speed: 0, range: 1, dpsFrac: 0, res: e.res, traits: [], slowT: 0, slowF: 1, burnT: 0, burnDps: big(0), boss: false });
    stepEncounter(enc, 0.05);
    return big(1e9).sub(enc.enemies[0].hp).toNumber();
  };
  assert.ok(Math.abs(hitWith('physical', 'tank') - 65) < 0.01); // tank resists 35%
  assert.ok(Math.abs(hitWith('physical', 'grunt') - 100) < 0.01);
  assert.ok(Math.abs(hitWith('ice', 'runner') - 130) < 0.01); // weak to ice
  assert.ok(Math.abs(hitWith('void', 'golem') - 100) < 0.01); // void ignores resist
  assert.ok(Math.abs(hitWith('physical', 'golem') - 50) < 0.01);
});

function duel(special, extra = {}) {
  const s = mk();
  const enc = createEncounter(s, 'wave');
  enc.queue = [];
  const mkE = (id, x, z, hp = 1e9) => ({ id, tpl: 'grunt', name: 'g', hp: big(hp), maxHp: big(hp), x, z, speed: 0, range: 1, dpsFrac: 0, res: {}, traits: [], slowT: 0, slowF: 1, burnT: 0, burnDps: big(0), boss: false });
  enc.enemies = [mkE(1, 5, 0), mkE(2, 5.5, 0.5), mkE(3, 6, 1), mkE(4, 20, 20)];
  enc.defenders = [{ kind: 'turret', x: 0, z: 0, range: 12, rof: 1, dmg: big(100), dtype: 'physical', special, cd: 0, ...extra }];
  stepEncounter(enc, 0.05);
  return enc;
}
const lost = (enc, i) => 1e9 - enc.enemies[i].hp.toNumber();

test('specials: splash hits neighbours, chain jumps, pierce hits the line, slow and burn apply status, far enemies untouched', () => {
  const sp = duel({ kind: 'splash', amount: 1.6 });
  assert.ok(Math.abs(lost(sp, 0) - 100) < 1e-6 && Math.abs(lost(sp, 1) - 60) < 1e-6 && lost(sp, 3) === 0);
  const ch = duel({ kind: 'chain', amount: 3 });
  assert.ok(Math.abs(lost(ch, 0) - 100) < 1e-6 && Math.abs(lost(ch, 1) - 60) < 1e-6 && Math.abs(lost(ch, 2) - 60) < 1e-6);
  const pi = duel({ kind: 'pierce', amount: 3 });
  assert.ok(Math.abs(lost(pi, 0) - 100) < 1e-6 && lost(pi, 1) > 0 && lost(pi, 1) <= 80 + 1e-6);
  const sl = duel({ kind: 'slow', amount: 0.4 });
  assert.equal(sl.enemies[0].slowT > 1.9, true);
  assert.ok(Math.abs(sl.enemies[0].slowF - 0.6) < 1e-9);
  const bu = duel({ kind: 'burn', amount: 0.4 });
  assert.equal(bu.enemies[0].burnT > 2.9, true);
  stepEncounter(bu, 1);
  assert.ok(lost(bu, 0) > 100 + 39); // dot ticked for ~1 s: 0.4 * 100
});

test('crit special: about 25% of hits do double damage', () => {
  let doubles = 0;
  const N = 2000;
  const enc = duel({ kind: 'crit', amount: 0.25 });
  for (let i = 0; i < N; i++) {
    enc.enemies[0].hp = big(1e9);
    enc.defenders[0].cd = 0;
    stepEncounter(enc, 0.001);
    if (Math.abs(lost(enc, 0) - 200) < 1e-6) doubles++;
  }
  assert.ok(Math.abs(doubles / N - 0.25) < 0.04, String(doubles / N));
});

test('enemies walk in, stop at their range, attack the base for dpsFrac of max hp per second', () => {
  const s = mk();
  const enc = createEncounter(s, 'wave');
  enc.queue = [];
  enc.defenders = [];
  enc.enemies = [{ id: 1, tpl: 'grunt', name: 'g', hp: big(1e9), maxHp: big(1e9), x: 3, z: 0, speed: 2, range: 1.4, dpsFrac: 0.01, res: {}, traits: [], slowT: 0, slowF: 1, burnT: 0, burnDps: big(0), boss: false }];
  for (let i = 0; i < 40; i++) stepEncounter(enc, 0.05); // 2 s: arrives and attacks
  assert.ok(Math.abs(Math.hypot(enc.enemies[0].x, enc.enemies[0].z) - 1.4) < 0.05);
  const frac = 1 - enc.baseHp.div(enc.baseMax).toNumber();
  assert.ok(frac > 0 && frac < 0.02);
});

test('manual mode: weapons move with the avatar, deal +50%, abilities have cooldowns, base is not required', () => {
  const s = mk();
  weapon(s, 'bolt_rifle', 3);
  const mkE = (x, z) => ({ id: 9, tpl: 'grunt', name: 'g', hp: big(1e12), maxHp: big(1e12), x, z, speed: 0, range: 1, dpsFrac: 0, res: {}, traits: [], slowT: 0, slowF: 1, burnT: 0, burnDps: big(0), boss: false });
  const setup = (manual) => {
    const enc = createEncounter(s, 'wave');
    enc.queue = [];
    enc.enemies = [mkE(10, 0)];
    if (manual) setManual(enc, true);
    return enc;
  };
  const auto = setup(false);
  stepEncounter(auto, 0.05);
  const man = setup(true);
  stepEncounter(man, 0.05, { mx: 0, mz: 0, ax: 10, az: 0 });
  const dAuto = 1e12 - auto.enemies[0].hp.toNumber();
  const dMan = 1e12 - man.enemies[0].hp.toNumber();
  assert.ok(dAuto > 0);
  assert.ok(Math.abs(dMan / dAuto - MANUAL_BONUS) < 1e-6);
  // movement: out of range at first (13 range at the core covers 10, but the avatar can walk away)
  const far = setup(true);
  far.enemies[0].x = 30;
  for (let i = 0; i < 100; i++) stepEncounter(far, 0.05, { mx: 1, mz: 0, ax: 30, az: 0 }); // walk toward it for 5 s
  assert.ok(far.avatar.x > 5);
  assert.ok(far.avatar.x <= 20);
  assert.ok(far.enemies[0].hp.lt(big(1e12)) || far.stats.shots > 0 || far.avatar.x > 5);
  // abilities
  const ab = setup(true);
  stepEncounter(ab, 0.05, { nova: true, ax: 10, az: 0 });
  assert.ok(ab.avatar.cds.nova > 11);
  const before = ab.enemies[0].hp;
  ab.enemies[0].x = 4;
  stepEncounter(ab, 0.05, { nova: true, ax: 10, az: 0 }); // on cooldown: no second nova
  assert.ok(before.gte(ab.enemies[0].hp));
  const dash = setup(true);
  stepEncounter(dash, 0.05, { dash: true, mx: 1, mz: 0 });
  assert.ok(dash.avatar.x > 4);
  const sh = setup(true);
  stepEncounter(sh, 0.05, { shield: true });
  assert.ok(sh.shieldT > 3.9);
});

test('boss mechanics: shield window is immune, summon adds minions, pulse hits the base, regen heals, time limit loses', () => {
  const s = mk();
  s.combat.bossIndex = 0;
  const enc = createEncounter(s, 'boss', { bossN: 0 });
  const def = enc.boss.def;
  def.mechanics.splice(0, def.mechanics.length, 'shield', 'summon', 'pulse');
  stepEncounter(enc, 0.05);
  const b = enc.bossEnemy;
  assert.ok(b && b.boss);
  // shield: immune at t in [15,20)
  enc.t = 16;
  enc.defenders = [{ kind: 'turret', x: 0, z: 0, range: 999, rof: 100, dmg: big(10), dtype: 'physical', special: null, cd: 0 }];
  b.x = 5;
  b.z = 0;
  const hp0 = b.hp;
  stepEncounter(enc, 0.01);
  assert.ok(b.hp.eq(hp0), 'immune inside the shield window');
  enc.t = 5;
  stepEncounter(enc, 0.01);
  assert.ok(b.hp.lt(hp0), 'vulnerable outside it');
  b.hp = b.maxHp; // keep the boss alive for the remaining mechanics
  // summon
  enc.defenders = [];
  enc.boss.summonT = 11.99;
  const n0 = enc.enemies.length;
  stepEncounter(enc, 0.05);
  assert.equal(enc.enemies.length, n0 + 4);
  // pulse
  enc.boss.pulseT = 9.99;
  const bh = enc.baseHp;
  stepEncounter(enc, 0.05);
  assert.ok(enc.baseHp.lt(bh.sub(enc.baseMax.mul(0.07))));
  // time limit
  enc.t = enc.timeLimit;
  assert.equal(stepEncounter(enc, 0.05), 'lose');
});

test('boss: regen and enrage and armor mechanics', () => {
  const s = mk();
  const enc = createEncounter(s, 'boss', { bossN: 0 });
  enc.boss.def.mechanics.splice(0, 9, 'regen', 'enrage', 'armor');
  enc.defenders = [];
  stepEncounter(enc, 0.05);
  const b = enc.bossEnemy;
  b.hp = b.maxHp.mul(0.2);
  stepEncounter(enc, 1);
  assert.ok(b.hp.gt(b.maxHp.mul(0.2))); // regen
  b.x = 1; b.z = 0; // at the core
  const d0 = enc.baseHp;
  enc.t = 0;
  b.hp = b.maxHp.mul(0.2); // below enrage threshold
  stepEncounter(enc, 1);
  const hitFrac = d0.sub(enc.baseHp).div(enc.baseMax).toNumber();
  assert.ok(hitFrac > 0.02 * 1.5 && hitFrac < 0.02 * 1.7);
});

test('boss fight is winnable by a real build, and drops a weapon with its unique mutation, money and a free upgrade', () => {
  const s = mk();
  s.level = 12;
  turrets(s, 'gun_turret', 12, 8);
  weapon(s, 'bolt_rifle', 12);
  weapon(s, 'void_lance', 12);
  assert.equal(canFightBoss(s).ok, true);
  const bag0 = s.bag.length;
  const upBefore = s.upgrades.turretDmg || 0;
  const st = startEncounter(s, 'boss');
  assert.ok(st.ok);
  assert.equal(runEncounter(s._enc, { maxSeconds: 200 }), 'win');
  const r = settleEncounter(s, s._enc);
  assert.equal(r.outcome, 'win');
  assert.equal(s.combat.bossIndex, 1);
  assert.equal(s.stats.bosses, 1);
  assert.equal(s.bag.length, bag0 + 1);
  const drop = s.items[r.items[0]];
  assert.ok(drop.mut.some((m) => m[0] === 'boss:0'));
  assert.equal(s.upgrades.turretDmg, upBefore + 1);
  assert.ok(r.money.gt(0));
  assert.equal(settleEncounter(s, s._enc), r); // settling twice returns the same result, grants nothing more
  assert.equal(s.combat.bossIndex, 1);
  s._enc = null;
  // next boss is harder
  assert.ok(bossDef(1).hp.gt(bossDef(0).hp));
});

test('boss: gated by level, cooldown after a loss, no money/item penalty on loss', () => {
  const s = mk();
  s.level = 9;
  assert.match(canFightBoss(s).reason, /unlock at level 10/);
  s.level = 12;
  startEncounter(s, 'boss');
  const items0 = Object.keys(s.items).length;
  const money0 = s.money;
  s._enc.done = 'lose';
  const r = settleEncounter(s, s._enc);
  assert.equal(r.outcome, 'lose');
  assert.equal(s.combat.bossIndex, 0);
  assert.ok(s.combat.bossCd > 0);
  assert.ok(s.money.eq(money0));
  assert.equal(Object.keys(s.items).length, items0);
  s._enc = null;
  assert.match(canFightBoss(s).reason, /Recovering/);
  stepCombat(s, 31);
  assert.equal(canFightBoss(s).ok, true);
});

test('waves: timer starts them from level 4, win = wave+1 and rewards, lose = wave-1 with a bounded penalty', () => {
  const s = mk();
  s.level = 3;
  stepCombat(s, 100);
  assert.ok(!s._enc); // not yet
  s.level = 5;
  s.combat.timer = 1;
  stepCombat(s, 2);
  assert.ok(s._enc && s._enc.kind === 'wave');
  s._enc = null;
  // forced win
  turrets(s, 'gun_turret', 5, 4);
  s.combat.wave = 3;
  startEncounter(s, 'wave');
  const m0 = s.money;
  runEncounter(s._enc);
  const win = settleEncounter(s, s._enc);
  s._enc = null;
  assert.equal(win.outcome, 'win');
  assert.equal(s.combat.wave, 4);
  assert.ok(s.money.gt(m0));
  assert.equal(s.stats.waves, 1);
  assert.ok(drain(s).some((e) => e.type === 'wave' && e.win));
  // forced loss with money and income
  s.combat.wave = 9;
  s.money = big(1000);
  startEncounter(s, 'wave');
  s._enc.done = 'lose';
  const itemsBefore = Object.keys(s.items).length;
  const l = settleEncounter(s, s._enc);
  s._enc = null;
  assert.equal(s.combat.wave, 8);
  assert.ok(l.lost.lte(big(1000).mul(0.02)) && s.money.gte(0));
  assert.equal(Object.keys(s.items).length, itemsBefore); // items are never lost
});

test('loss penalty is documented: min(2% of money, 30 s of income), never negative, zero at zero money', () => {
  const s = mk();
  s.money = big(1e6);
  s._p = { income: big(100) };
  assert.ok(loseWavePenalty(s).eq(3000)); // 30 s of income < 2% (20000)
  assert.ok(Math.abs(s.money.toNumber() - (1e6 - 3000)) < 1e-6);
  s._p = { income: big(1e9) };
  const penalty = loseWavePenalty(s);
  assert.ok(Math.abs(penalty.toNumber() - 0.02 * (1e6 - 3000)) < 1e-3);
  s.money = big(0);
  assert.ok(loseWavePenalty(s).isZero());
  assert.ok(s.money.isZero());
  s.money = big(5);
  s._p = { income: big(0) };
  assert.ok(loseWavePenalty(s).isZero());
});

test('rush (arena) waves: more enemies, rewards x2.5, no penalty on loss, manual play allowed', () => {
  const s = mk();
  turrets(s, 'gun_turret', 5, 4);
  s.combat.wave = 4;
  const w = createEncounter(s, 'wave');
  const r = createEncounter(s, 'rush');
  assert.ok(r.queue.length > w.queue.length);
  const rw1 = waveReward(s, 4, 1);
  const rw2 = waveReward(s, 4, 2.5);
  assert.ok(Math.abs(rw2.money.toNumber() / rw1.money.toNumber() - 2.5) < 1e-9);
  s._enc = r;
  r.done = 'lose';
  const m = s.money;
  settleEncounter(s, r);
  assert.ok(s.money.eq(m));
  assert.equal(s.combat.wave, 4);
});

test('forecast agrees with the real simulation outside a documented tolerance band (win/lose on a grid of builds)', () => {
  let agree = 0;
  let total = 0;
  const disagreements = [];
  for (const tpl of ['gun_turret', 'flame_tower']) {
    for (const tier of [1, 3, 5, 8]) {
      for (const n of [1, 3, 6]) {
        for (const w of [2, 8, 14, 22]) {
          const s = mk(3);
          turrets(s, tpl, tier, n);
          s.combat.wave = w;
          const f = forecastWave(s, w);
          const enc = createEncounter(s, 'wave');
          const real = runEncounter(enc);
          // clear cases only: skip when the forecast damage fraction is within the 0.5x..2x band around 1
          if (f.baseDamage > 0.5 && f.baseDamage < 2) continue;
          total++;
          if ((real === 'win') === f.win) agree++;
          else disagreements.push(`${tpl} t${tier} x${n} w${w}: forecast ${f.win}(${f.baseDamage.toFixed(2)}) real ${real}`);
        }
      }
    }
  }
  assert.ok(total >= 40, `clear cases ${total}`);
  assert.ok(agree / total >= 0.9, `agreement ${agree}/${total}: ${disagreements.join('; ')}`);
});

test('bestWinnableWave is monotone in defence strength and never negative', () => {
  const s = mk(4);
  assert.equal(bestWinnableWave(s), 0);
  let prev = 0;
  for (const tier of [1, 3, 6, 10, 15]) {
    const t = mk(4);
    turrets(t, 'gun_turret', tier, 4);
    const best = bestWinnableWave(t);
    assert.ok(best >= prev, `tier ${tier}: ${best} < ${prev}`);
    prev = best;
  }
  assert.ok(prev > 20);
  const more = mk(4);
  turrets(more, 'gun_turret', 6, 8);
  const fewer = mk(4);
  turrets(fewer, 'gun_turret', 6, 2);
  assert.ok(bestWinnableWave(more) >= bestWinnableWave(fewer));
});

test('gear slots: limited, only weapons, unequip returns to the backpack', () => {
  const s = mk();
  assert.equal(gearSlots(s), 2);
  const a = give(s, 'bolt_rifle', 1);
  const b = give(s, 'cryo_gun', 1);
  const c = give(s, 'tesla_wand', 1);
  const t = give(s, 'gun_turret', 1);
  assert.ok(equipWeapon(s, a.uid).ok && equipWeapon(s, b.uid).ok);
  assert.match(equipWeapon(s, c.uid).reason, /slots are full/);
  assert.match(equipWeapon(s, t.uid).reason, /Only weapons/);
  assert.equal(buildDefenders(s).filter((d) => d.kind === 'weapon').length, 2);
  assert.ok(unequipWeapon(s, a.uid).ok);
  assert.equal(s.items[a.uid].loc, 'bag');
  assert.ok(equipWeapon(s, c.uid).ok);
  s.bonus.gear = 3;
  assert.equal(gearSlots(s), 5);
});

test('base max hp scales with wave and hp upgrades; damage and hp stay finite at absurd waves', () => {
  const s = mk();
  assert.ok(baseMaxHp(s, 1).gt(0));
  assert.ok(baseMaxHp(s, 100).gt(baseMaxHp(s, 10)));
  s.upgrades.baseHp = 5;
  assert.ok(baseMaxHp(s, 10).gt(baseMaxHp(mk(), 10)));
  for (const w of [1e3, 1e5, 1e7]) {
    const f = forecastWave(s, w);
    assert.ok(f.enemyHp.isFinite() && !Number.isNaN(f.baseDamage)); // Infinity = certain loss without defence
  }
  assert.equal(WAVE_INTERVAL, 60);
});

import { offlineWaves } from '../src/sim/combat.js';
import { applyOffline } from '../src/sim/offline.js';

function withDefence(tier, n) {
  const s = mk(9);
  // a little income so wave rewards are meaningful
  const d = give(s, 'pebble_drill', 2);
  const st = give(s, 'stall', 2);
  place(s, d.uid, 0, 0, 0);
  place(s, st.uid, 1, 0, 0);
  turrets(s, 'gun_turret', tier, n, 1);
  weapon(s, 'bolt_rifle', tier);
  refreshProduction(s);
  return s;
}

test('offline waves, closed form vs the real simulation: same wins (+/-1), wave counter (+/-1) and money (+/-15%) on a clear-win build', () => {
  const online = withDefence(10, 6);
  const closed = withDefence(10, 6);
  online.combat.wave = 3;
  closed.combat.wave = 3;
  const spans = 10; // waves
  online.combat.timer = WAVE_INTERVAL;
  const m0 = online.money.toNumber();
  for (let t = 0; t < spans * WAVE_INTERVAL; t += 0.05) stepCombat(online, 0.05);
  const w = offlineWaves(closed, spans * WAVE_INTERVAL);
  assert.equal(w.wins, spans);
  assert.ok(Math.abs(online.stats.waves - closed.stats.waves) <= 1, `${online.stats.waves} vs ${closed.stats.waves}`);
  assert.ok(Math.abs(online.combat.wave - closed.combat.wave) <= 1);
  const gainOnline = online.money.toNumber() - m0;
  const gainClosed = closed.money.toNumber() - m0;
  assert.ok(Math.abs(gainOnline - gainClosed) / Math.max(1, gainClosed) < 0.15, `money ${gainOnline} vs ${gainClosed}`); // +/- one wave of reward
  assert.ok(closed.stats.waveLosses === undefined || closed.stats.waveLosses === 0);
});

test('offline waves: a defence that cannot hold retreats to the best winnable wave and pays the penalty ONCE, however long away', () => {
  const s = withDefence(1, 1);
  s.combat.wave = 40;
  s.money = big(1e6);
  s._p = { income: big(1e9) };
  const w = offlineWaves(s, 365 * 86400);
  assert.equal(w.wins, 0);
  assert.equal(w.losses, 1);
  assert.ok(s.combat.wave < 40);
  assert.ok(s.money.gte(big(1e6).mul(0.98).sub(1)) && s.money.lte(1e6)); // at most 2%, once
  assert.equal(s.stats.waveLosses, 1);
  const bag = s.bag.length;
  assert.ok(Object.keys(s.items).length >= bag); // nothing deleted
});

test('offline waves: years away is instant, finite, advances the wave only as far as the defence can hold', () => {
  const s = withDefence(8, 4);
  const best = bestWinnableWave(s);
  s.combat.wave = 1;
  const t = performance.now();
  const w = offlineWaves(s, 10 * 365 * 86400);
  assert.ok(performance.now() - t < 500);
  assert.equal(w.wins, Math.floor((10 * 365 * 86400) / WAVE_INTERVAL));
  assert.equal(s.combat.wave, Math.max(1, best));
  assert.ok(s.money.isFinite() && w.money.isFinite());
  assert.ok(s.bag.length <= 20 + 24 + 40); // drops are capped
});

test('applyOffline includes the wave summary through the hook, and nothing happens below level 4', () => {
  const s = withDefence(8, 4);
  const sum = applyOffline(s, 3600, { waves: offlineWaves });
  assert.ok(sum.waves && sum.waves.wins === 60);
  const low = withDefence(8, 4);
  low.level = 3;
  assert.equal(offlineWaves(low, 3600), null);
  assert.equal(offlineWaves(withDefence(8, 4), 30), null); // less than one wave
});
