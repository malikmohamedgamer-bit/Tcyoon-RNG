// Item model: templates, stat computation (tier scaling + variant + hybrid + mutations).
//
// An item is plain data: { uid, tpl, tier, vs, hy, mut, loc, x, y, dir }.
//   tpl  template id (data/items.json or data/weapons.json)
//   tier rarity tier (number, endless)
//   vs   variant seed (0 = plain template). Variants jitter each stat 0.8x..1.3x and get a name.
//   hy   hybrid secondary effect: 'mult' | 'add' | 'refine' | 'sell' | null
//   mut  [[mutationId, level], ...]
// itemStats() derives everything else and caches it on the object (non-serialised `_c`).

import ITEMS from '../data/items.json' with { type: 'json' };
import WEAPONS from '../data/weapons.json' with { type: 'json' };
import { Big, ONE } from '../core/bignum.js';
import { Rng, hash32 } from '../core/rng.js';
import { valueOf, logValue, tierInfo } from '../gen/tiers.js';
import { variantWord } from '../gen/names.js';
import { mutationMultipliers } from './mutations.js';
import { getMutation } from '../gen/mutations.js';

export const TYPES = { ...ITEMS.types, weapon: { weight: 0, icon: '⚔️', main: 'dmg', label: 'Weapon', minLevel: 4 } };
export const TEMPLATES = new Map([...ITEMS.templates, ...WEAPONS.templates].map((t) => [t.id, t]));
export const ITEM_TEMPLATES = ITEMS.templates;
export const WEAPON_TEMPLATES = WEAPONS.templates;
export const HYBRID_BASE = { mult: 0.12, add: 0.25, refine: 0.2, sell: 0.1 };
export const HYBRID_FACTOR = 0.4;
export const HYBRID_TYPES = ['dropper', 'conveyor', 'multiplier', 'refiner', 'seller', 'upgrader'];

/**
 * Exponent of V (tier value) per stat: how strongly each stat grows with tier.
 * Multiplier-type stats (mult, refine, sell, aura, luck, xp: see EXTRA_STATS) do NOT use a power of V:
 * they grow polylogarithmically, (1 + log10(V)/2)^2, because stacking several power-law multipliers
 * makes a single run grow super-linearly in the number of rolls and makes prestige pointless
 * (found by scripts/simulate-economy.js; see BUGS.md #14).
 */
export const SCALE_EXP = { rate: 0.25, value: 0.75, cap: 0.3, rcap: 0.3, scap: 0.3, add: 0.9, dmg: 1 };
export const polylogScale = (logV) => Math.pow(1 + Math.max(0, logV) / 2, 2);
/** Stats stored as "1 + extra" (extra scales with tier and mutations). */
const EXTRA_STATS = new Set(['mult', 'refine', 'sell', 'aura', 'luck', 'xp']);
const RANGE_LOG_FACTOR = 0.03;
const RANGE_MAX_MULT = 3;
const ROF_MAX = 20;

/** Player-selectable item skin colours (colour-blind friendly hues; shape and rarity icon still carry the information). */
export const SKIN_COLORS = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#38d9a9', '#4dabf7', '#9775fa', '#f783ac'];
export const templateOf = (item) => TEMPLATES.get(item.tpl);
export const typeOf = (item) => templateOf(item)?.type || 'dropper';
export const isWeapon = (item) => typeOf(item) === 'weapon';
export const mainStat = (type) => TYPES[type]?.main || 'value';

function variantFactor(vs, key) {
  return 0.8 + new Rng(hash32(`vf|${vs}|${key}`)).next() * 0.5;
}

/** Computes (and caches) the final stats of an item. */
export function itemStats(item) {
  const key = `${item.tier}|${item.vs || 0}|${item.hy || ''}|${(item.mut || []).map((m) => m[0] + m[1]).join(',')}`;
  if (item._c && item._c.key === key) return item._c.stats;
  const stats = computeStats(item);
  Object.defineProperty(item, '_c', { value: { key, stats }, enumerable: false, writable: true, configurable: true });
  return stats;
}

function computeStats(item) {
  const tpl = templateOf(item);
  if (!tpl) return {};
  const V = valueOf(item.tier);
  const logV = logValue(item.tier);
  const mm = mutationMultipliers(item.mut);
  const main = mainStat(tpl.type);
  const raw = {}; // stat -> Big (extra form for EXTRA_STATS)
  const base = { ...tpl.base };
  if (item.hy && HYBRID_BASE[item.hy] && !(item.hy in base) && !(item.hy === 'sell' && tpl.type === 'seller')) {
    base[item.hy] = HYBRID_BASE[item.hy] * HYBRID_FACTOR;
    if (item.hy === 'refine') base.rcap = 3;
    if (item.hy === 'sell') base.scap = 4;
  }
  for (const [k, b] of Object.entries(base)) {
    if (k === 'range' || k === 'rof') continue;
    const e = SCALE_EXP[k];
    let v = EXTRA_STATS.has(k) ? Big.fromNumber(b * polylogScale(logV)) : e == null ? Big.fromNumber(b) : V.pow(e).mul(b);
    if (item.vs) v = v.mul(variantFactor(item.vs, k));
    raw[k] = v;
  }
  // mutations: 'main' maps to the principal stat; others by name
  const applyMut = (k, v) => {
    let m = mm[k];
    if (k === main && mm.main) m = m ? m.mul(mm.main) : mm.main;
    return m ? v.mul(m) : v;
  };
  const stats = {};
  for (const [k, v0] of Object.entries(raw)) {
    const v = applyMut(k, v0);
    stats[k] = EXTRA_STATS.has(k) ? ONE.add(v) : v;
  }
  if (tpl.base.range != null) {
    let r = tpl.base.range * Math.min(RANGE_MAX_MULT, Math.pow(10, RANGE_LOG_FACTOR * Math.min(logV, 100)));
    r *= Number.isFinite(mm.range?.toNumber()) && mm.range ? Math.min(2, mm.range.toNumber()) : 1;
    stats.range = r;
  }
  if (tpl.base.rof != null) {
    let r = tpl.base.rof;
    if (mm.rof) r *= Math.min(10, mm.rof.toNumber());
    stats.rof = Math.min(ROF_MAX, r);
  }
  if (tpl.dtype) stats.dtype = tpl.dtype;
  if (tpl.special) {
    let amt = tpl.special.amount;
    if (tpl.special.kind === 'slow' && mm.slow) amt = Math.min(0.9, amt * mm.slow.toNumber());
    stats.special = { kind: tpl.special.kind, amount: amt };
  }
  // an 'output' mutation on a dropper is already folded into `value` via the 'value' effect
  return stats;
}

/** Human readable name: "Rare Pebble Drill «Zorvath»" (or the player's nickname). */
export function itemTitle(item) {
  if (item.nick) return item.nick; // player-chosen name
  const tpl = templateOf(item);
  const ti = tierInfo(item.tier);
  const variant = item.vs ? ` «${variantWord(item.vs)}»` : '';
  return `${ti.name} ${tpl ? tpl.name : item.tpl}${variant}`;
}

export function itemIcon(item) {
  return templateOf(item)?.icon || '❔';
}

/** Short one-line stats summary for cards/tooltips. */
export function statParts(item, fmt) {
  const s = itemStats(item);
  const out = [];
  const f = (b) => fmt(b);
  const add = (tip, label, rest) => out.push({ tip, label, rest });
  if (s.rate) add('rate', 'Rate', ` ${f(s.rate)}/s`);
  if (s.value) add('value', 'Value', ` ${f(s.value)}/unit`);
  if (s.cap) add('cap', 'Throughput', ` ${f(s.cap)}/s`);
  if (s.add) add('add', `+${f(s.add)}`, ' per unit');
  if (s.mult) add('mult', `×${f(s.mult)}`, ' value');
  if (s.refine) add('refine', 'Refine', ` ×${f(s.refine)} (≤${f(s.rcap)}/s)`);
  if (s.sell) add('sell', 'Sell', ` ×${f(s.sell)} (≤${f(s.scap)}/s)`);
  if (s.aura) add('aura', 'Neighbours', ` ×${f(s.aura)} speed`);
  if (s.luck) add('luckStat', 'Luck', ` ×${f(s.luck)}`);
  if (s.xp) add('xpStat', 'XP', ` ×${f(s.xp)}`);
  if (s.dmg) {
    add('dmg', 'Damage', ` ${f(s.dmg)}`);
    if (s.dtype) add('dtype', s.dtype, '');
  }
  if (s.rof) add('rof', `${Number(s.rof.toFixed(2))} shots/s`, ` · range ${Number((s.range || 0).toFixed(1))}`);
  if (s.special) add('special', s.special.kind, ` ${s.special.amount}`);
  return out;
}

/** One-line plain text per stat (also used where no markup is possible). */
export function statLines(item, fmt) {
  return statParts(item, fmt).map((p) => `${p.label}${p.rest}`.trim());
}

export const mutationList = (item) => (item.mut || []).map((m) => getMutation(m[0])).filter(Boolean);

