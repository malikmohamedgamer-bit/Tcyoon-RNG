// Backpack operations: add, remove, sell, sell duplicates, fuse.
import ECON from '../data/economy.json' with { type: 'json' };
import { emit } from '../core/events.js';
import { itemTitle, templateOf, typeOf } from './items.js';
import { addMoney, backpackCapacity, sellValue, luckOf } from './economy.js';
import { addXp, sellXp } from './leveling.js';
import { rollMutations, getMutation } from '../gen/mutations.js';

export const bagCount = (state) => state.bag.length;
export const bagFree = (state) => Math.max(0, backpackCapacity(state) - state.bag.length);
export const bagFull = (state) => state.bag.length >= backpackCapacity(state);

/** Register a freshly generated item and put it in the backpack. Returns the item, or null if full. */
export function addToBag(state, item, { force = false } = {}) {
  if (!force && bagFull(state)) return null;
  const it = { uid: state.nextUid++, loc: 'bag', lv: state.level, ...item };
  state.items[it.uid] = it;
  state.bag.push(it.uid);
  return it;
}

/** Remove an item from the game entirely (sold, fused). Only legal from the backpack. */
export function destroyBagItem(state, uid) {
  const i = state.bag.indexOf(uid);
  if (i < 0) return false;
  state.bag.splice(i, 1);
  delete state.items[uid];
  return true;
}

export function sellItem(state, uid) {
  const it = state.items[uid];
  if (!it || it.loc !== 'bag') return { ok: false, reason: 'item is not in the backpack' };
  const value = sellValue(state, it);
  const title = itemTitle(it);
  destroyBagItem(state, uid);
  addMoney(state, value);
  state.stats.sold = (state.stats.sold || 0) + 1;
  addXp(state, sellXp(state.level), state._onLevel);
  emit(state, 'sold', { title, value });
  return { ok: true, value };
}

const dupKey = (it) => `${it.tpl}|${it.tier}|${it.vs}|${it.hy || ''}|${(it.mut || []).map((m) => m.join(':')).join(',')}`;

/** Sell every exact duplicate in the backpack, keeping one of each. Returns {count, value}. */
export function sellDuplicates(state) {
  const seen = new Set();
  const toSell = [];
  for (const uid of state.bag) {
    const it = state.items[uid];
    const k = dupKey(it);
    if (seen.has(k)) toSell.push(uid);
    else seen.add(k);
  }
  let total = null;
  for (const uid of toSell) {
    const r = sellItem(state, uid);
    if (r.ok) total = total ? total.add(r.value) : r.value;
  }
  return { count: toSell.length, value: total };
}

// ----------------------------------------------------------------------- fuse
/** Documented fuse success probability for a selection of items (no state needed). */
export function fuseChance(items, pityBonus = 0) {
  const f = ECON.fuse;
  const n = items.length;
  if (n < f.min) return 0;
  let p = f.baseChance + f.perExtra * (n - f.min);
  if (items.every((it) => it.tpl === items[0].tpl)) p += f.identicalBonus;
  return Math.min(f.maxChance, p + pityBonus);
}

export function canFuse(state, uids) {
  const f = ECON.fuse;
  const set = [...new Set(uids)];
  if (set.length < f.min) return { ok: false, reason: `Select at least ${f.min} items` };
  if (set.length > f.max) return { ok: false, reason: `Select at most ${f.max} items` };
  const items = set.map((u) => state.items[u]);
  if (items.some((it) => !it || it.loc !== 'bag')) return { ok: false, reason: 'All items must be in the backpack' };
  if (!items.every((it) => it.tier === items[0].tier)) return { ok: false, reason: 'Items must all be the same tier' };
  const kinds = new Set(items.map((it) => (typeOf(it) === 'weapon' ? 'weapon' : 'item')));
  if (kinds.size > 1) return { ok: false, reason: 'Do not mix weapons and items' };
  return { ok: true, items };
}

/**
 * Fuse N same-tier items into one. Success (probability fuseChance) -> tier+1.
 * Failure -> one item of the same tier with a boosted mutation re-roll. Inputs are always consumed.
 * Success inherits each input mutation with 50% chance (respecting slots/groups).
 */
export function fuse(state, uids, rng = state.rng) {
  const chk = canFuse(state, uids);
  if (!chk.ok) return chk;
  const items = chk.items;
  const f = ECON.fuse;
  const pity = Math.min(f.pityMax, (state.fusePity || 0) * f.pityStep);
  const chance = fuseChance(items, pity);
  const success = rng.chance(chance);
  const parent = rng.pick(items);
  const tier = items[0].tier + (success ? 1 : 0);
  const base = { tpl: parent.tpl, tier, vs: rng.chance(0.5) ? parent.vs : 0, hy: parent.hy || null, mut: [], lv: Math.min(...items.map((x) => x.lv ?? state.level)) };
  const logLuck = luckOf(state).log10Num();
  if (success) {
    const pool = items.flatMap((it) => it.mut || []);
    rng.shuffle(pool);
    for (const [id, lv] of pool) {
      if (!rng.chance(0.5)) continue;
      const def = getMutation(id);
      if (!def || base.mut.some((m) => getMutation(m[0])?.group === def.group)) continue;
      base.mut.push([id, lv]);
    }
    base.mut = base.mut.slice(0, 1 + Math.floor(tier / 4));
    state.fusePity = 0;
  } else {
    base.mut = rollMutations(rng, { tier, type: templateOf(parent).type, logLuck, boost: f.failMutationBoost });
    state.fusePity = (state.fusePity || 0) + 1;
  }
  for (const u of uids) destroyBagItem(state, u);
  const out = addToBag(state, base, { force: true });
  state.stats.fused = (state.stats.fused || 0) + 1;
  emit(state, 'fuse', { success, title: itemTitle(out), tier });
  return { ok: true, success, item: out, chance };
}


/** Sort the backpack: highest tier first, then template, then uid. */
export function sortBag(state) {
  state.bag.sort((a, b) => {
    const x = state.items[a];
    const y = state.items[b];
    return y.tier - x.tier || x.tpl.localeCompare(y.tpl) || a - b;
  });
}
