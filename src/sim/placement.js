// Placement rules on the grid base: place, move, swap, rotate, pick up, sell, expand,
// layout presets and an auto-layout used by the "Auto-place" button and by the scripted
// strategy in the economy simulator.
import { Big } from '../core/bignum.js';
import { typeOf, isWeapon, itemStats } from './items.js';
import { refreshProduction, megaBonus } from './production.js';
import { bagFull, bagFree } from './inventory.js';
import { trySpend, addMoney, sellValue } from './economy.js';
import { emit } from '../core/events.js';
import { addXp, sellXp } from './leveling.js';

export const START_SIDE = 6;
export const MAX_SIDE = 32;
export const PRESET_LIMIT = 12;

export const baseSide = (state) => state.base.side;
/** World position (x, z) of a grid cell centre; the base is centred on the origin. */
export const cellCenter = (x, y, side) => ({ x: x - (side - 1) / 2, z: y - (side - 1) / 2 });
export const inBounds = (state, x, y) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < state.base.side && y < state.base.side;

/** Item uid at cell, or null. */
export function itemAt(state, x, y) {
  for (const it of Object.values(state.items)) if (it.loc === 'placed' && it.x === x && it.y === y) return it;
  return null;
}

/** Index of placed items by "x,y" (built per call; bases are small). */
export function cellMap(state) {
  const m = new Map();
  for (const it of Object.values(state.items)) if (it.loc === 'placed') m.set(`${it.x},${it.y}`, it);
  return m;
}

/**
 * Can item `uid` go to (x,y)? Items may come from the backpack or already be placed (a move).
 * An occupied target is allowed when `swap` is true (moving a placed item onto another placed item).
 */
export function canPlace(state, uid, x, y, { swap = false } = {}) {
  const it = state.items[uid];
  if (!it) return { ok: false, reason: 'Unknown item' };
  if (it.loc === 'gear') return { ok: false, reason: 'Unequip the weapon first' };
  if (isWeapon(it)) return { ok: false, reason: 'Weapons are equipped, not placed' };
  if (!inBounds(state, x, y)) return { ok: false, reason: 'Outside your base' };
  const occ = itemAt(state, x, y);
  if (occ && occ.uid !== uid) {
    if (swap && it.loc === 'placed') return { ok: true, swap: occ.uid };
    return { ok: false, reason: 'Cell is occupied' };
  }
  return { ok: true };
}

const bagRemove = (state, uid) => {
  const i = state.bag.indexOf(uid);
  if (i >= 0) state.bag.splice(i, 1);
};

/** Place from the backpack, or move/swap a placed item. */
export function place(state, uid, x, y, dir, opts = {}) {
  const chk = canPlace(state, uid, x, y, { swap: opts.swap !== false });
  if (!chk.ok) return chk;
  const it = state.items[uid];
  if (chk.swap) {
    const other = state.items[chk.swap];
    other.x = it.x;
    other.y = it.y;
  } else if (it.loc === 'bag') bagRemove(state, uid);
  it.loc = 'placed';
  it.x = x;
  it.y = y;
  it.dir = dir != null ? ((dir % 4) + 4) % 4 : it.dir || 0;
  state.stats.placed = (state.stats.placed || 0) + 1;
  const typ = typeOf(it);
  state.stats['placed_' + typ] = (state.stats['placed_' + typ] || 0) + 1;
  refreshProduction(state);
  emit(state, 'placed', { swapped: !!chk.swap });
  return { ok: true, swapped: !!chk.swap };
}

export function rotate(state, uid, by = 1) {
  const it = state.items[uid];
  if (!it || it.loc !== 'placed') return { ok: false, reason: 'Item is not on the base' };
  it.dir = (((it.dir || 0) + by) % 4 + 4) % 4;
  refreshProduction(state);
  return { ok: true, dir: it.dir };
}

/** Return a placed item to the backpack (blocked when the backpack is full). */
export function pickUp(state, uid, { force = false } = {}) {
  const it = state.items[uid];
  if (!it || it.loc !== 'placed') return { ok: false, reason: 'Item is not on the base' };
  if (!force && bagFull(state)) return { ok: false, reason: 'Backpack is full' };
  it.loc = 'bag';
  delete it.x;
  delete it.y;
  state.bag.push(uid);
  refreshProduction(state);
  return { ok: true };
}

/** Sell a placed item directly from the base. */
export function sellPlaced(state, uid) {
  const it = state.items[uid];
  if (!it || it.loc !== 'placed') return { ok: false, reason: 'Item is not on the base' };
  const value = sellValue(state, it);
  delete state.items[uid];
  addMoney(state, value);
  state.stats.sold = (state.stats.sold || 0) + 1;
  addXp(state, sellXp(state.level), state._onLevel);
  refreshProduction(state);
  emit(state, 'sold', { value });
  return { ok: true, value };
}

// --------------------------------------------------------------------- expansion
/** Price of the next expansion: 150 * 1.9^expansions. */
export const expandCost = (state) => Big.fromNumber(150).mul(Big.fromNumber(1.9).pow(state.base.expansions));

/**
 * Expand the base: +1 side length up to MAX_SIDE; after that each purchase adds a "mega tile"
 * (income bonus with a soft cap, see megaBonus) so expansion stays purchasable forever.
 */
export function expand(state) {
  if (!trySpend(state, expandCost(state))) return { ok: false, reason: 'Not enough money' };
  state.base.expansions += 1;
  state.stats.expansions = (state.stats.expansions || 0) + 1;
  if (state.base.side < MAX_SIDE) state.base.side += 1;
  else state.base.mega = (state.base.mega || 0) + 1;
  refreshProduction(state);
  return { ok: true, side: state.base.side, mega: state.base.mega || 0, bonus: megaBonus(state.base.mega) };
}

/** Free expansion (level rewards): same effect as buying one. */
export function grantExpansion(state) {
  state.base.expansions += 1;
  if (state.base.side < MAX_SIDE) state.base.side += 1;
  else state.base.mega = (state.base.mega || 0) + 1;
  refreshProduction(state);
}

/** n free expansions at once (closed form): grow the side up to MAX_SIDE, the rest become mega tiles. */
export function grantExpansions(state, n) {
  if (n <= 0) return;
  const toSide = Math.min(n, MAX_SIDE - state.base.side);
  state.base.expansions += n;
  state.base.side += Math.max(0, toSide);
  state.base.mega = (state.base.mega || 0) + (n - Math.max(0, toSide));
  refreshProduction(state);
}

// --------------------------------------------------------------------- presets
export function savePreset(state, name) {
  const layout = Object.values(state.items)
    .filter((it) => it.loc === 'placed')
    .map((it) => ({ uid: it.uid, x: it.x, y: it.y, dir: it.dir || 0 }));
  const preset = { name: String(name || `Layout ${state.presets.length + 1}`).slice(0, 40), side: state.base.side, layout };
  if (state.presets.length >= PRESET_LIMIT) return { ok: false, reason: `At most ${PRESET_LIMIT} presets` };
  state.presets.push(preset);
  return { ok: true, index: state.presets.length - 1 };
}

export function deletePreset(state, index) {
  if (index < 0 || index >= state.presets.length) return { ok: false };
  state.presets.splice(index, 1);
  return { ok: true };
}

/**
 * Load a layout preset. Items that no longer exist are skipped; positions outside the
 * current base are skipped. Items currently placed but not in the preset go back to the
 * backpack, which must have room; otherwise nothing changes and the shortfall is reported.
 */
export function loadPreset(state, index) {
  const p = state.presets[index];
  if (!p) return { ok: false, reason: 'No such preset' };
  const want = p.layout.filter((e) => {
    const it = state.items[e.uid];
    return it && it.loc !== 'gear' && !isWeapon(it) && inBounds(state, e.x, e.y);
  });
  // a cell may only hold one item; first wins
  const used = new Set();
  const plan = want.filter((e) => {
    const k = `${e.x},${e.y}`;
    if (used.has(k)) return false;
    used.add(k);
    return true;
  });
  const keep = new Set(plan.map((e) => e.uid));
  const evict = Object.values(state.items).filter((it) => it.loc === 'placed' && !keep.has(it.uid));
  const free = bagFree(state) + plan.filter((e) => state.items[e.uid].loc === 'bag').length;
  if (evict.length > free) return { ok: false, reason: `Need ${evict.length - free} more backpack slot(s) to load this layout` };
  for (const it of evict) {
    it.loc = 'bag';
    delete it.x;
    delete it.y;
    state.bag.push(it.uid);
  }
  // detach all planned items first so moves never collide, then place
  for (const e of plan) {
    const it = state.items[e.uid];
    if (it.loc === 'placed') {
      it.loc = 'bag';
      state.bag.push(it.uid);
    }
  }
  for (const e of plan) {
    const it = state.items[e.uid];
    bagRemove(state, e.uid);
    it.loc = 'placed';
    it.x = e.x;
    it.y = e.y;
    it.dir = e.dir;
  }
  refreshProduction(state);
  return { ok: true, placed: plan.length, skipped: p.layout.length - plan.length };
}

// --------------------------------------------------------------------- auto layout
const mainValue = (it) => {
  const s = itemStats(it);
  const v = s.value || s.mult || s.refine || s.sell || s.add || s.cap || s.dmg || s.aura || s.luck || s.xp;
  return v ? v.log10Num() : 0;
};

/**
 * Rebuild the whole layout in "lanes": each row is dropper(s) -> adders -> refiners ->
 * multipliers -> seller, flowing east. Best droppers share lane 0 with the best modifiers,
 * and so on. Generators and turrets fill remaining cells (turrets toward the edge).
 * Everything not placed stays in the backpack. Returns a summary.
 */
export function autoLayout(state) {
  for (const it of Object.values(state.items)) {
    if (it.loc === 'placed') {
      it.loc = 'bag';
      delete it.x;
      delete it.y;
      state.bag.push(it.uid);
    }
  }
  const pool = state.bag.map((u) => state.items[u]).filter((it) => !isWeapon(it));
  const by = (t) => pool.filter((it) => typeOf(it) === t).sort((a, b) => mainValue(b) - mainValue(a));
  const droppers = by('dropper');
  const sellers = by('seller');
  const mults = by('multiplier');
  const refiners = by('refiner');
  const upgraders = by('upgrader');
  const convs = by('conveyor');
  const gens = by('generator');
  const turrets = by('turret');
  const n = state.base.side;
  const placed = [];
  const put = (it, x, y, dir) => {
    bagRemove(state, it.uid);
    it.loc = 'placed';
    it.x = x;
    it.y = y;
    it.dir = dir;
    placed.push(it.uid);
  };
  const taken = new Set();
  const rowCount = new Array(n).fill(0);
  const lanes = Math.min(n, sellers.length, Math.max(1, Math.ceil(droppers.length / Math.max(1, Math.floor((n - 1) / 2)))));
  const perLaneDroppers = Math.max(1, Math.ceil(droppers.length / Math.max(1, lanes)));
  for (let lane = 0; lane < lanes && droppers.length; lane++) {
    const row = lane;
    const seq = [];
    for (let i = 0; i < perLaneDroppers && droppers.length && seq.length < n - 1; i++) seq.push(droppers.shift());
    // modifiers fill remaining slots, ordered add -> refine -> multiply so multipliers act last
    const room = n - 1 - seq.length;
    const take = (arr, k) => arr.splice(0, Math.max(0, k));
    const m = take(mults, Math.ceil(room * 0.5));
    const r = take(refiners, Math.ceil((room - m.length) * 0.6));
    const u = take(upgraders, room - m.length - r.length);
    for (const it of [...seq, ...u, ...r, ...m]) {
      const x = rowCount[row];
      if (x >= n - 1) break;
      put(it, x, row, 0);
      rowCount[row]++;
      taken.add(`${x},${row}`);
    }
    // the seller sits directly after the last item so the lane has no gap (a gap would block the flow)
    put(sellers.shift(), rowCount[row], row, 0);
    taken.add(`${rowCount[row]},${row}`);
    rowCount[row]++;
  }
  // leftovers: generators near the lanes, turrets at the outer rows
  const freeCells = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!taken.has(`${x},${y}`)) freeCells.push([x, y]);
  freeCells.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  for (const it of gens) if (freeCells.length) { const [x, y] = freeCells.shift(); put(it, x, y, 0); }
  const outer = freeCells.slice().sort((a, b) => Math.hypot(b[0] - (n - 1) / 2, b[1] - (n - 1) / 2) - Math.hypot(a[0] - (n - 1) / 2, a[1] - (n - 1) / 2));
  for (const it of turrets) if (outer.length) { const [x, y] = outer.shift(); put(it, x, y, 0); }
  void convs;
  refreshProduction(state);
  return { placed: placed.length };
}

