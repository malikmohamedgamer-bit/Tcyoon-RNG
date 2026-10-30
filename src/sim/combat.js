// Combat: deterministic, pure simulation (no DOM, no Three.js, no wall clock, no Math.random).
// Everything random comes from a seeded Rng derived from (world seed, wave, kind), so a given
// build + wave always plays out the same way, in the browser and in Node.
//
// Battlefield: the base core is at the origin. Enemies spawn on a ring (radius 36), walk to
// their stop distance (melee ~1.4, ranged up to 9) and then attack the base: each enemy removes
// `dpsFrac` of the base's max HP per second. Defence is automatic: placed turrets fire from
// their cells, equipped weapons fire from the core. The player may take manual control of the
// weapons (move, aim, abilities); manual weapons deal +50% damage.
//
//   hit damage   = dmg * (1 - resist[dtype])   (void ignores resist)
//   specials     = crit (x2 at p), splash (60% in 2u), chain (60% to N-1 nearby), pierce (80% to N-1 in line),
//                  slow (-40..% speed for 2 s), burn (dot = amount x hit/s for 3 s, refreshed)
//   waves        every 60 s (from level 4); win -> wave + 1 and rewards; lose -> wave - 1 and a small penalty
//   penalty      min(2% of money, 30 s of income); items and saves are never touched
import EN from '../data/enemies.json' with { type: 'json' };
import BS from '../data/bosses.json' with { type: 'json' };
import { ZERO } from '../core/bignum.js';
import { rngFrom } from '../core/rng.js';
import { emit } from '../core/events.js';
import { buildWave, waveHp, enemyTemplate } from '../gen/monsters.js';
import { diffMods } from './difficulty.js';
import { bossDef, mechanic } from '../gen/bosses.js';
import { itemStats, typeOf } from './items.js';
import { modifiers, rollCost, addMoney, luckOf } from './economy.js';
import { cellCenter } from './placement.js';
import { addXp, rollXp } from './leveling.js';
import { generateItem } from '../gen/items.js';
import { addToBag, bagFull } from './inventory.js';
import { typicalTier } from './rolling.js';
import { refreshProduction } from './production.js';
import { upgradeLevel } from './shop.js';

export const WAVE_INTERVAL = EN.base.waveInterval;
/** Seconds between waves for this save (Relaxed mode slows them down). */
export const waveInterval = (state) => WAVE_INTERVAL * diffMods(state).wavePace;
export const SPAWN_RADIUS = EN.base.spawnRadius;
export const WAVE_START_LEVEL = 4;
export const MANUAL_BONUS = 1.5;
export const RUSH = { slotMult: 2, rewardMult: 2.5 };
const AVATAR_SPEED = 9;
const ABILITY = { dash: { cd: 4, dist: 5 }, nova: { cd: 12, radius: 6, secs: 3 }, shield: { cd: 20, secs: 4, absorb: 0.5 } };
const SPLASH = { radius: 2.2, frac: 0.6 };
const CHAIN = { radius: 4.5, frac: 0.6 };
const PIERCE = { frac: 0.8, width: 1.2 };
const BURN_SECS = 3;
const SLOW_SECS = 2;
const EVENT_CAP = 160;

export function createCombatState() {
  return { wave: 1, bestWave: 1, bossIndex: 0, timer: WAVE_INTERVAL, bossCd: 0 };
}

/** Max base HP: 100 * V(wave scale) * hp modifiers. Enemy damage is a fraction of this, so upgrades matter. */
export function baseMaxHp(state, wave = state.combat.wave) {
  return waveHp(wave).mul(100 / EN.base.hp).mul(modifiers(state).baseHp);
}

export const gearSlots = (state) => 2 + Math.floor(modifiers(state).gearSlots);

// ------------------------------------------------------------------ defenders
/** Snapshot of everything that shoots: turrets on the base and weapons in gear slots. */
export function buildDefenders(state) {
  const mods = modifiers(state);
  const side = state.base.side;
  const out = [];
  for (const it of Object.values(state.items)) {
    const type = typeOf(it);
    const isTurret = it.loc === 'placed' && type === 'turret';
    const isGear = it.loc === 'gear' && type === 'weapon';
    if (!isTurret && !isGear) continue;
    const s = itemStats(it);
    if (!s.dmg || !s.rof) continue;
    const pos = isTurret ? cellCenter(it.x, it.y, side) : { x: 0, z: 0 };
    out.push({ uid: it.uid, kind: isTurret ? 'turret' : 'weapon', x: pos.x, z: pos.z, range: s.range, rof: s.rof, dmg: s.dmg.mul(mods.dmg), dtype: s.dtype || 'physical', special: s.special || null, cd: 0 });
  }
  return out;
}

const resistFactor = (res, dtype) => (dtype === 'void' ? 1 : Math.max(0.05, 1 - (res[dtype] || 0)));

// ------------------------------------------------------------------ encounters
/**
 * Build an encounter. kind: 'wave' | 'rush' | 'boss'.
 * The encounter object is transient (never saved); a reload mid-fight simply restarts the wave timer.
 */
export function createEncounter(state, kind, { bossN = state.combat.bossIndex } = {}) {
  const w = kind === 'demo' ? 1 : state.combat.wave;
  const baseMax = baseMaxHp(state, kind === 'boss' ? Math.max(w, bossDef(bossN).wave) : w);
  const enc = {
    kind,
    wave: w,
    t: 0,
    done: null,
    seed: state.seed,
    rng: rngFrom(state.seed, 'enc', kind, kind === 'boss' ? bossN : w),
    baseMax,
    baseHp: baseMax,
    enemies: [],
    queue: [],
    defenders: buildDefenders(state),
    kills: 0,
    ev: [],
    nextId: 1,
    avatar: null,
    manual: false,
    boss: null,
    shieldT: 0,
    stats: { shots: 0, damage: ZERO },
  };
  if (kind === 'boss') {
    const def = bossDef(bossN);
    enc.boss = { def, spawned: false, summonT: 0, pulseT: 0 };
    enc.timeLimit = def.timeLimit * diffMods(state).bossTime;
    enc.queue.push({ t: 0, boss: true });
  } else {
    const wv = buildWave(state.seed, w, { slotMult: kind === 'rush' ? RUSH.slotMult : kind === 'demo' ? 0.5 : 1, hpMult: diffMods(state).enemyHp });
    enc.wave = w;
    enc.totalHp = wv.totalHp;
    enc.queue = wv.enemies.map((e) => ({ t: e.t, e }));
  }
  return enc;
}

export function setManual(enc, on) {
  enc.manual = !!on;
  if (on && !enc.avatar) enc.avatar = { x: 0, z: 3, cds: { dash: 0, nova: 0, shield: 0 }, aimX: 0, aimZ: -10 };
}

function spawn(enc, e, x, z) {
  const en = { id: enc.nextId++, tpl: e.tpl, name: e.name, hp: e.hp, maxHp: e.hp, x, z, speed: e.speed, range: e.range, dpsFrac: e.dpsFrac, res: e.res, traits: e.traits, slowT: 0, slowF: 1, burnT: 0, burnDps: ZERO, boss: false };
  enc.enemies.push(en);
  return en;
}

function spawnBoss(enc) {
  const d = enc.boss.def;
  const ang = enc.rng.next() * Math.PI * 2;
  const en = spawn(enc, { tpl: 'boss', name: d.name, hp: d.hp, speed: d.speed, range: d.range, dpsFrac: d.dpsFrac, res: d.res, traits: [] }, Math.cos(ang) * SPAWN_RADIUS, Math.sin(ang) * SPAWN_RADIUS);
  en.boss = true;
  enc.boss.spawned = true;
  enc.bossEnemy = en;
}

const pushEv = (enc, ev) => {
  if (enc.ev.length < EVENT_CAP) enc.ev.push(ev);
};
const dist2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);

function isShielded(enc) {
  if (!enc.boss || !enc.boss.def.mechanics.includes('shield')) return false;
  const m = mechanic('shield');
  return enc.t % m.period >= m.period - m.duration;
}

/** Apply one hit of `dmg` of `dtype` to an enemy (resist, boss shield). Returns damage dealt (Big). */
function hit(enc, en, dmg, dtype) {
  if (en.boss && isShielded(enc)) return ZERO;
  const f = resistFactor(en.res, dtype);
  const d = dmg.mul(f);
  en.hp = en.hp.sub(d);
  enc.stats.damage = enc.stats.damage.add(d);
  return d;
}

function nearestInRange(enc, x, z, range, aimX, aimZ) {
  let best = null;
  let bd = Infinity;
  const r2 = range * range;
  for (const e of enc.enemies) {
    if (e.hp.lte(0)) continue;
    const d = dist2(x, z, e.x, e.z);
    if (d > r2) continue;
    // with an aim point (manual), prefer the enemy closest to the aim point
    const key = aimX == null ? d : dist2(aimX, aimZ, e.x, e.z);
    if (key < bd) {
      bd = key;
      best = e;
    }
  }
  return best;
}

function fire(enc, d, ox, oz, target, bonus) {
  let dmg = bonus === 1 ? d.dmg : d.dmg.mul(bonus);
  const sp = d.special;
  if (sp && sp.kind === 'crit' && enc.rng.chance(sp.amount)) dmg = dmg.mul(2);
  enc.stats.shots++;
  pushEv(enc, { k: 'shot', x1: ox, z1: oz, x2: target.x, z2: target.z, d: d.dtype });
  hit(enc, target, dmg, d.dtype);
  if (!sp) return;
  switch (sp.kind) {
    case 'splash':
      for (const e of enc.enemies) if (e !== target && e.hp.gt(0) && dist2(e.x, e.z, target.x, target.z) <= SPLASH.radius * SPLASH.radius) hit(enc, e, dmg.mul(SPLASH.frac), d.dtype);
      break;
    case 'chain': {
      let from = target;
      const used = new Set([target]);
      for (let j = 1; j < Math.round(sp.amount); j++) {
        let nx = null;
        let bd = CHAIN.radius * CHAIN.radius;
        for (const e of enc.enemies) {
          if (used.has(e) || e.hp.lte(0)) continue;
          const dd = dist2(e.x, e.z, from.x, from.z);
          if (dd < bd) {
            bd = dd;
            nx = e;
          }
        }
        if (!nx) break;
        used.add(nx);
        hit(enc, nx, dmg.mul(CHAIN.frac), d.dtype);
        pushEv(enc, { k: 'shot', x1: from.x, z1: from.z, x2: nx.x, z2: nx.z, d: d.dtype });
        from = nx;
      }
      break;
    }
    case 'pierce': {
      const dx = target.x - ox;
      const dz = target.z - oz;
      const len = Math.hypot(dx, dz) || 1;
      let n = 0;
      for (const e of enc.enemies) {
        if (e === target || e.hp.lte(0) || n >= Math.round(sp.amount) - 1) continue;
        const px = e.x - ox;
        const pz = e.z - oz;
        const along = (px * dx + pz * dz) / len;
        const across = Math.abs(px * dz - pz * dx) / len;
        if (along > 0 && across <= PIERCE.width && along <= d.range) {
          hit(enc, e, dmg.mul(PIERCE.frac), d.dtype);
          n++;
        }
      }
      break;
    }
    case 'slow':
      target.slowT = SLOW_SECS;
      target.slowF = Math.max(0.1, 1 - sp.amount);
      break;
    case 'burn':
      target.burnT = BURN_SECS;
      target.burnDps = target.burnDps.max(dmg.mul(sp.amount));
      break;
    default:
  }
}

/**
 * Advance the encounter by dt seconds. `input` (manual mode only):
 *   { mx, mz (-1..1 move), ax, az (aim point), dash, nova, shield }
 * @returns {null|'win'|'lose'} the outcome once the encounter has ended
 */
export function stepEncounter(enc, dt, input = null) {
  if (enc.done) return enc.done;
  enc.t += dt;
  // spawns
  while (enc.queue.length && enc.queue[0].t <= enc.t) {
    const q = enc.queue.shift();
    if (q.boss) spawnBoss(enc);
    else spawn(enc, q.e, Math.cos(q.e.angle) * SPAWN_RADIUS, Math.sin(q.e.angle) * SPAWN_RADIUS);
  }
  // avatar
  const av = enc.avatar && enc.manual ? enc.avatar : null;
  if (av) {
    for (const k of Object.keys(av.cds)) av.cds[k] = Math.max(0, av.cds[k] - dt);
    if (input) {
      const mx = Math.max(-1, Math.min(1, input.mx || 0));
      const mz = Math.max(-1, Math.min(1, input.mz || 0));
      const len = Math.hypot(mx, mz) || 1;
      const sp = AVATAR_SPEED * dt * Math.min(1, len);
      av.x = Math.max(-20, Math.min(20, av.x + (mx / len) * sp));
      av.z = Math.max(-20, Math.min(20, av.z + (mz / len) * sp));
      if (input.ax != null) {
        av.aimX = input.ax;
        av.aimZ = input.az;
      }
      if (input.dash && av.cds.dash === 0) {
        const dx = input.mx || 0;
        let dz = input.mz || 0;
        if (dx === 0 && dz === 0) dz = -1; // no direction held: dash forward (towards the incoming enemies)
        const l = Math.hypot(dx, dz) || 1;
        av.x = Math.max(-20, Math.min(20, av.x + (dx / l) * ABILITY.dash.dist));
        av.z = Math.max(-20, Math.min(20, av.z + (dz / l) * ABILITY.dash.dist));
        av.cds.dash = ABILITY.dash.cd;
      }
      if (input.nova && av.cds.nova === 0) {
        av.cds.nova = ABILITY.nova.cd;
        let sum = ZERO;
        for (const d of enc.defenders) if (d.kind === 'weapon') sum = sum.add(d.dmg.mul(d.rof));
        const dmg = sum.mul(ABILITY.nova.secs * MANUAL_BONUS);
        for (const e of enc.enemies) if (e.hp.gt(0) && dist2(e.x, e.z, av.x, av.z) <= ABILITY.nova.radius * ABILITY.nova.radius) hit(enc, e, dmg, 'void');
        pushEv(enc, { k: 'nova', x: av.x, z: av.z, r: ABILITY.nova.radius });
      }
      if (input.shield && av.cds.shield === 0) {
        av.cds.shield = ABILITY.shield.cd;
        enc.shieldT = ABILITY.shield.secs;
      }
    }
  }
  enc.shieldT = Math.max(0, enc.shieldT - dt);
  // defenders fire
  for (const d of enc.defenders) {
    d.cd -= dt;
    if (d.cd > 0) continue;
    const manualWeapon = av && d.kind === 'weapon';
    const ox = manualWeapon ? av.x : d.x;
    const oz = manualWeapon ? av.z : d.z;
    const target = nearestInRange(enc, ox, oz, d.range, manualWeapon ? av.aimX : null, manualWeapon ? av.aimZ : null);
    if (!target) continue;
    d.cd += 1 / d.rof;
    if (d.cd < 0) d.cd = 0;
    fire(enc, d, ox, oz, target, manualWeapon ? MANUAL_BONUS : 1);
  }
  // boss mechanics
  if (enc.boss && enc.boss.spawned && enc.bossEnemy && enc.bossEnemy.hp.gt(0)) {
    const b = enc.bossEnemy;
    const mech = enc.boss.def.mechanics;
    if (mech.includes('regen')) b.hp = b.hp.add(b.maxHp.mul(mechanic('regen').frac * dt)).min(b.maxHp);
    if (mech.includes('summon')) {
      const m = mechanic('summon');
      enc.boss.summonT += dt;
      if (enc.boss.summonT >= m.period) {
        enc.boss.summonT -= m.period;
        const mini = enemyTemplate('grunt');
        for (let i = 0; i < m.count; i++) spawn(enc, { tpl: 'grunt', name: 'Minion', hp: waveHp(enc.boss.def.wave).mul(0.15), speed: mini.speed, range: mini.range, dpsFrac: mini.dpsFrac, res: {}, traits: [] }, b.x + (i - 1.5), b.z + 0.5);
      }
    }
    if (mech.includes('pulse')) {
      const m = mechanic('pulse');
      enc.boss.pulseT += dt;
      if (enc.boss.pulseT >= m.period) {
        enc.boss.pulseT -= m.period;
        enc.baseHp = enc.baseHp.sub(enc.baseMax.mul(m.frac * (enc.shieldT > 0 ? 1 - ABILITY.shield.absorb : 1)));
        pushEv(enc, { k: 'pulse' });
      }
    }
  }
  // enemies: status effects, healing, movement, attacks
  let attackFrac = 0;
  for (const e of enc.enemies) {
    if (e.hp.lte(0)) continue;
    if (e.burnT > 0) {
      e.burnT -= dt;
      e.hp = e.hp.sub(e.burnDps.mul(dt));
    }
    if (e.slowT > 0) e.slowT -= dt;
    if (e.traits.includes('heal')) {
      for (const o of enc.enemies) if (o !== e && o.hp.gt(0) && dist2(o.x, o.z, e.x, e.z) < 36) o.hp = o.hp.add(o.maxHp.mul(0.08 * dt)).min(o.maxHp);
    }
    const dist = Math.hypot(e.x, e.z);
    const stop = Math.max(1.0, e.range);
    if (dist > stop) {
      const sp = e.speed * (e.slowT > 0 ? e.slowF : 1) * dt;
      const k = Math.max(0, dist - sp) / dist;
      e.x *= k;
      e.z *= k;
    } else {
      let f = e.dpsFrac;
      if (e.boss && enc.boss.def.mechanics.includes('enrage') && e.hp.lt(e.maxHp.mul(mechanic('enrage').threshold))) f *= mechanic('enrage').boost;
      attackFrac += f;
    }
  }
  if (attackFrac > 0) enc.baseHp = enc.baseHp.sub(enc.baseMax.mul(attackFrac * dt * (enc.shieldT > 0 ? 1 - ABILITY.shield.absorb : 1)));
  // deaths
  const alive = [];
  for (const e of enc.enemies) {
    if (e.hp.gt(0)) alive.push(e);
    else {
      enc.kills++;
      pushEv(enc, { k: 'kill', x: e.x, z: e.z, boss: e.boss });
    }
  }
  enc.enemies = alive;
  // outcome
  if (enc.baseHp.lte(0)) enc.done = 'lose';
  else if (enc.timeLimit && enc.t >= enc.timeLimit && (enc.bossEnemy ? enc.bossEnemy.hp.gt(0) : true)) enc.done = 'lose';
  else if (enc.kind === 'boss' ? enc.boss.spawned && enc.enemies.every((e) => !e.boss) : enc.queue.length === 0 && enc.enemies.length === 0) enc.done = 'win';
  if (enc.baseHp.lt(0)) enc.baseHp = ZERO;
  return enc.done;
}

/** Run an encounter to completion with a fixed step (for Node tests and the combat simulator). */
export function runEncounter(enc, { dt = 0.05, maxSeconds = 400, input = null } = {}) {
  let n = 0;
  const max = Math.ceil(maxSeconds / dt);
  while (!enc.done && n++ < max) stepEncounter(enc, dt, input);
  if (!enc.done) enc.done = 'lose';
  return enc.done;
}

// ------------------------------------------------------------------ closed-form forecast
const SPECIAL_FACTOR = {
  crit: (s) => 1 + s.amount,
  splash: () => 1.8,
  chain: (s) => 1 + CHAIN.frac * Math.min(Math.max(0, s.amount - 1), 2.5),
  pierce: (s) => 1 + PIERCE.frac * Math.min(Math.max(0, s.amount - 1), 2) * 0.5,
  slow: () => 1.12,
  burn: (s, rof) => 1 + Math.min(s.amount / Math.max(0.5, rof), 0.8),
};
export const specialFactor = (sp, rof) => (sp && SPECIAL_FACTOR[sp.kind] ? SPECIAL_FACTOR[sp.kind](sp, rof) : 1);

/**
 * Expected outcome of wave `w` against the current defence, in closed form (no ticking).
 * Model: enemies need T_a seconds to arrive; killing every group takes T_kill = sum_g hp_g/(eta*D_g) seconds
 * (eta = 0.75 for overkill and targeting); if T_kill > T_a the leftover T2 = T_kill - T_a is spent with the
 * remaining enemies hitting the base at a linearly decreasing rate: damage = 0.5 * A * (T2/T_kill) * T2.
 * win <=> the base survives (damage fraction < 1). A group no defender can reach is a certain loss.
 * @returns {{win:boolean, margin:number, baseDamage:number, defenceDps:Big, enemyHp:Big, arrival:number}}
 */
export function forecastWave(state, w, { slotMult = 1, defenders = null } = {}) {
  const wv = buildWave(state.seed, w, { slotMult, hpMult: diffMods(state).enemyHp });
  const defs = defenders || buildDefenders(state);
  const ETA = 0.75;
  // group enemy hp by template for resist/coverage weighting
  const groups = new Map();
  let H = ZERO;
  let A = 0;
  let speedSum = 0;
  for (const e of wv.enemies) {
    H = H.add(e.hp);
    A += e.dpsFrac;
    speedSum += e.speed;
    const g = groups.get(e.tpl) || { hp: ZERO, stop: Math.max(1, e.range), res: e.res, n: 0 };
    g.hp = g.hp.add(e.hp);
    g.n++;
    groups.set(e.tpl, g);
  }
  // sequential kill model: every group g needs hp_g / (eta * D_g) seconds of the whole defence's attention,
  // where D_g only counts defenders that can reach the spot where group g stops (range + 3 >= stop + distance
  // of the turret from the core) and uses g's resistance. A group nobody can reach is never killed -> certain loss.
  let Dtotal = ZERO;
  let Tkill = 0;
  const ANGLES = 24;
  for (const g of groups.values()) {
    // an enemy of this group stops at radius g.stop from the core at a random angle: which defenders reach it?
    let Dg = ZERO;
    let dead = 0;
    for (let a = 0; a < ANGLES; a++) {
      const ex = g.stop * Math.cos((a / ANGLES) * Math.PI * 2);
      const ez = g.stop * Math.sin((a / ANGLES) * Math.PI * 2);
      let any = false;
      for (const d of defs) {
        if (dist2(d.x, d.z, ex, ez) > d.range * d.range) continue;
        any = true;
        Dg = Dg.add(d.dmg.mul(d.rof).mul(specialFactor(d.special, d.rof)).mul(resistFactor(g.res, d.dtype)).div(ANGLES));
      }
      if (!any) dead++;
    }
    // P(at least one unit of the group lands on an angle nobody covers) > 50% -> it is never killed
    const pDead = 1 - Math.pow(1 - dead / ANGLES, g.n);
    g.D = Dg;
    Dtotal = Dtotal.add(Dg.mul(g.hp.div(H)));
    Tkill += Dg.isZero() || pDead > 0.5 ? Infinity : g.hp.div(Dg.mul(ETA)).toNumber();
  }
  const D = Dtotal;
  const avgSpeed = wv.enemies.length ? speedSum / wv.enemies.length : 2;
  const spread = (wv.enemies.length ? wv.enemies[wv.enemies.length - 1].t : 0) / 2;
  const Ta = (SPAWN_RADIUS - 3) / avgSpeed + spread;
  let baseDamage = 0;
  if (Tkill > Ta) {
    const T2 = Tkill - Ta;
    baseDamage = Number.isFinite(Tkill) ? 0.5 * A * (T2 / Tkill) * T2 : Infinity;
  }
  return { win: baseDamage < 1, margin: baseDamage, baseDamage, defenceDps: D, enemyHp: H, arrival: Ta, killTime: Tkill, count: wv.count };
}

/** The highest wave the current defence is forecast to beat (binary search; waves get monotonically harder). */
export function bestWinnableWave(state, from = 1, cap = 1e6) {
  const defs = buildDefenders(state);
  if (!forecastWave(state, Math.max(1, from), { defenders: defs }).win) {
    let w = Math.max(1, from) - 1;
    while (w >= 1 && !forecastWave(state, w, { defenders: defs }).win) w -= Math.max(1, Math.floor(w / 4));
    return Math.max(0, w);
  }
  let lo = Math.max(1, from);
  let hi = lo * 2;
  while (hi < cap && forecastWave(state, hi, { defenders: defs }).win) {
    lo = hi;
    hi *= 2;
  }
  hi = Math.min(hi, cap);
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (forecastWave(state, mid, { defenders: defs }).win) lo = mid;
    else hi = mid;
  }
  return lo;
}

// ------------------------------------------------------------------ rewards and flow
/** Reward for clearing wave w: 20 s of income (at least half a roll price) and XP of a few rolls. */
export function waveReward(state, w, mult = 1) {
  const income = state._p ? state._p.income : ZERO;
  const money = income.mul(20).max(rollCost(state).mul(0.5)).mul(mult);
  const xp = rollXp(state.level, 0).mul(3 * mult);
  void w;
  return { money, xp };
}

function dropWeapon(state, rng, tierPlus) {
  const tier = typicalTier(luckOf(state)) + tierPlus;
  const logLuck = luckOf(state).log10Num();
  const data = generateItem(rng, { tier, level: Math.max(state.level, WAVE_START_LEVEL), logLuck });
  return { tier, data };
}

export function loseWavePenalty(state) {
  const income = state._p ? state._p.income : ZERO;
  const lost = state.money.mul(0.02).min(income.mul(30)).mul(diffMods(state).lossPenalty).nonNeg();
  state.money = state.money.sub(lost).nonNeg(); // never negative, never touches items or the save
  return lost;
}

/** Apply an ended encounter to the game state. Idempotent per encounter (encounter is marked settled). */
export function settleEncounter(state, enc) {
  if (enc.settled) return enc.result;
  enc.settled = true;
  const c = state.combat;
  const r = { kind: enc.kind, outcome: enc.done, wave: enc.wave, kills: enc.kills, lost: ZERO, money: ZERO, items: [] };
  if (enc.kind === 'demo') {
    // the scripted tutorial wave: no reward, no penalty, no wave progress
    state.stats.demoWaves = (state.stats.demoWaves || 0) + 1;
    emit(state, 'wave', { win: enc.done === 'win', wave: 1, kind: 'demo' });
    enc.result = r;
    return r;
  }
  if (enc.done === 'win') {
    if (enc.kind === 'boss') {
      const def = enc.boss.def;
      const money = rollCost(state).mul(BS.moneyRollPrices);
      addMoney(state, money);
      r.money = money;
      const tier = typicalTier(luckOf(state)) + BS.dropTierPlus;
      const rng = rngFrom(state.seed, 'bossdrop', def.n);
      const logLuck = luckOf(state).log10Num();
      const data = generateItem(rng, { tier, level: Math.max(state.level, 10), logLuck, tpl: def.dropWeapon });
      data.mut = [...(data.mut || []).filter((m) => m[0] !== def.mutationId), [def.mutationId, 1]].slice(0, 1 + Math.floor(tier / 4) + 1);
      const it = addToBag(state, data, { force: true });
      r.items.push(it.uid);
      const up = def.n % 2 === 0 ? 'turretDmg' : 'baseHp';
      state.upgrades[up] = upgradeLevel(state, up) + 1; // a free upgrade level
      refreshProduction(state);
      c.bossIndex += 1;
      state.stats.bosses = (state.stats.bosses || 0) + 1;
      addXp(state, rollXp(state.level, 0).mul(20), state._onLevel);
      r.upgrade = up;
      emit(state, 'boss', { win: true, name: def.name, n: def.n });
    } else {
      const mult = enc.kind === 'rush' ? RUSH.rewardMult : 1;
      const rw = waveReward(state, enc.wave, mult);
      addMoney(state, rw.money);
      addXp(state, rw.xp, state._onLevel);
      r.money = rw.money;
      if (enc.rng.chance(0.12 * mult)) {
        const { data } = dropWeapon(state, enc.rng, enc.rng.int(2));
        r.items.push(addToBag(state, data, { force: true }).uid);
      }
      c.wave += 1;
      c.bestWave = Math.max(c.bestWave, c.wave);
      state.stats.waves = (state.stats.waves || 0) + 1;
      emit(state, 'wave', { win: true, wave: enc.wave, kind: enc.kind });
    }
  } else if (enc.kind === 'wave') {
    r.lost = loseWavePenalty(state);
    c.wave = Math.max(1, c.wave - 1);
    state.stats.waveLosses = (state.stats.waveLosses || 0) + 1;
    emit(state, 'wave', { win: false, wave: enc.wave, kind: 'wave', lost: r.lost });
  } else if (enc.kind === 'boss') {
    c.bossCd = BS.cooldown;
    emit(state, 'boss', { win: false, name: enc.boss.def.name, n: enc.boss.def.n });
  } else emit(state, 'wave', { win: false, wave: enc.wave, kind: 'rush' });
  enc.result = r;
  state.combat.last = { kind: r.kind, outcome: r.outcome, wave: r.wave };
  return r;
}

export function canFightBoss(state) {
  if (state._enc) return { ok: false, reason: 'A fight is already in progress' };
  if (state.level < BS.unlockLevel) return { ok: false, reason: `Bosses unlock at level ${BS.unlockLevel}` };
  if (state.combat.bossCd > 0) return { ok: false, reason: `Recovering: ${Math.ceil(state.combat.bossCd)} s` };
  return { ok: true };
}

export function startEncounter(state, kind) {
  if (state._enc) return { ok: false, reason: 'A fight is already in progress' };
  if (kind === 'boss') {
    const c = canFightBoss(state);
    if (!c.ok) return c;
  } else if (kind !== 'demo' && state.level < WAVE_START_LEVEL) return { ok: false, reason: `Waves start at level ${WAVE_START_LEVEL}` };
  state._enc = createEncounter(state, kind);
  if (kind === 'wave') state.combat.timer = waveInterval(state); // waves come every 60 s start-to-start, however long a fight lasts
  emit(state, 'fightStart', { kind, wave: state.combat.wave });
  return { ok: true, enc: state._enc };
}

/** Per-frame combat driver used by the game loop: wave timer, active encounter, settlement. */
export function stepCombat(state, dt, input = null) {
  const c = state.combat;
  if (c.bossCd > 0) c.bossCd = Math.max(0, c.bossCd - dt);
  if (state._enc) {
    if (state._enc.kind === 'wave') c.timer -= dt; // the next wave is already counting down
    const out = stepEncounter(state._enc, dt, input);
    if (out) {
      const r = settleEncounter(state, state._enc);
      state._lastEnc = state._enc;
      if (state._enc.kind !== 'wave') c.timer = Math.max(c.timer, 10); // breathing room after a boss/rush
      state._enc = null;
      return r;
    }
    return null;
  }
  if (state.level < WAVE_START_LEVEL) return null;
  c.timer -= dt;
  if (c.timer <= 0) startEncounter(state, 'wave');
  return null;
}

// ------------------------------------------------------------------ gear
export function equipWeapon(state, uid) {
  const it = state.items[uid];
  if (!it || it.loc !== 'bag') return { ok: false, reason: 'Weapon is not in the backpack' };
  if (typeOf(it) !== 'weapon') return { ok: false, reason: 'Only weapons can be equipped' };
  const equipped = Object.values(state.items).filter((i) => i.loc === 'gear').length;
  if (equipped >= gearSlots(state)) return { ok: false, reason: 'All gear slots are full' };
  const i = state.bag.indexOf(uid);
  state.bag.splice(i, 1);
  it.loc = 'gear';
  return { ok: true };
}

export function unequipWeapon(state, uid, { force = false } = {}) {
  const it = state.items[uid];
  if (!it || it.loc !== 'gear') return { ok: false, reason: 'Not equipped' };
  if (!force && bagFull(state)) return { ok: false, reason: 'Backpack is full' };
  it.loc = 'bag';
  state.bag.push(uid);
  return { ok: true };
}


// ------------------------------------------------------------------ offline waves (closed form)
/**
 * Resolve the waves that would have come while away, by expected value (never by ticking):
 *   n = floor(seconds / 60) waves. best = highest wave the defence is forecast to beat.
 *   If the current wave is beatable, all n waves are wins (rewards x n) and the wave counter advances by
 *   up to n but never past `best` (documented: offline farming stays at the best winnable wave, it never
 *   oscillates into losses). If it is not beatable the counter retreats to `best` and the loss penalty is
 *   applied at most ONCE, however long you were away.
 */
export function offlineWaves(state, seconds) {
  const c = state.combat;
  if (state.level < WAVE_START_LEVEL || !(seconds > 0)) return null;
  const n = Math.floor(seconds / waveInterval(state));
  if (n < 1) return null;
  const best = bestWinnableWave(state, 1);
  const res = { waves: n, wins: 0, losses: 0, text: '' };
  if (best < c.wave) {
    const lost = loseWavePenalty(state);
    c.wave = Math.max(1, best);
    res.losses = 1;
    res.text = `Monsters broke through ${n > 1 ? 'a few times' : 'once'}; the loss penalty was applied once ($${lost.format()}). Your defence cannot hold wave ${best + 1} yet.`;
    state.stats.waveLosses = (state.stats.waveLosses || 0) + 1;
    return res;
  }
  const rw = waveReward(state, c.wave);
  addMoney(state, rw.money.mul(n));
  addXp(state, rw.xp.mul(n), state._onLevel);
  const target = Math.min(c.wave + n, Math.max(best, c.wave));
  c.wave = target;
  c.bestWave = Math.max(c.bestWave, c.wave);
  state.stats.waves = (state.stats.waves || 0) + n;
  const rng = rngFrom(state.seed, 'offline-waves', c.wave, n);
  const drops = Math.min(20, Math.round(0.12 * n));
  for (let i = 0; i < drops; i++) addToBag(state, dropWeapon(state, rng, rng.int(2)).data, { force: true });
  res.wins = n;
  res.money = rw.money.mul(n);
  res.text = `Your defences held ${n} wave${n > 1 ? 's' : ''} (+$${res.money.format()}${drops ? `, ${drops} drop${drops > 1 ? 's' : ''}` : ''}).`;
  return res;
}
