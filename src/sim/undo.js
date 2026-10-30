// Undo for placing, moving, picking up and selling. Documented rules:
//   * only the last 10 actions, and only for 20 seconds of play after each one;
//   * undoing runs newest first (a stack);
//   * a sale can be taken back only if you can pay the money back and have not levelled up since
//     (the XP the sale gave is taken back too, so sell -> undo -> sell can never farm XP or money);
//   * it never touches anything but the items and money involved. Not saved (a reload clears it).
import { Big } from '../core/bignum.js';
import { emit } from '../core/events.js';
import * as placement from './placement.js';
import { sellItem, sellDuplicates, bagFull } from './inventory.js';
import { sellPlaced } from './placement.js';
import { refreshProduction } from './production.js';
import { itemTitle } from './items.js';

export const UNDO_WINDOW = 20;
export const UNDO_MAX = 10;

const stack = (s) => (s._undo ||= []);
function prune(state) {
  const st = stack(state);
  while (st.length && state.playtime - st[0].t > UNDO_WINDOW) st.shift();
  return st;
}
function push(state, label, fn) {
  const st = prune(state);
  st.push({ label, t: state.playtime, fn });
  while (st.length > UNDO_MAX) st.shift();
  emit(state, 'undoable', { label });
}

export function clearUndo(state) {
  state._undo = [];
}

/** The action Undo would reverse, and how many seconds are left to do it. */
export function peekUndo(state) {
  const st = prune(state);
  const top = st[st.length - 1];
  return top ? { label: top.label, left: Math.max(0, UNDO_WINDOW - (state.playtime - top.t)), count: st.length } : null;
}

export function undoLast(state) {
  const st = prune(state);
  const top = st.pop();
  if (!top) return { ok: false, reason: `Nothing to undo (undo works for ${UNDO_WINDOW} seconds after placing, moving or selling).` };
  const r = top.fn();
  if (!r.ok) st.push(top); // keep it: the player may fix the reason (e.g. free the tile) and try again until the window ends
  else emit(state, 'undone', { label: top.label });
  return r.ok ? { ok: true, label: top.label } : r;
}

const fail = (reason) => ({ ok: false, reason });
const cellFree = (state, x, y) => !placement.itemAt(state, x, y);

// ---------------------------------------------------------------- wrapped actions
export function placeU(state, uid, x, y, dir) {
  const it = state.items[uid];
  const prev = it && it.loc === 'bag' ? { loc: 'bag', index: state.bag.indexOf(uid) } : it && it.loc === 'placed' ? { loc: 'placed', x: it.x, y: it.y, dir: it.dir || 0 } : null;
  const occ = placement.itemAt(state, x, y);
  const title = it ? itemTitle(it) : '';
  const r = placement.place(state, uid, x, y, dir);
  if (!r.ok || !prev) return r;
  push(state, `${prev.loc === 'bag' ? 'Placed' : r.swapped ? 'Swapped' : 'Moved'} ${title}`, () => {
    const me = state.items[uid];
    if (!me || me.loc !== 'placed') return fail('That item is no longer on the base.');
    if (r.swapped) {
      const other = state.items[occ.uid];
      if (!other || other.loc !== 'placed') return fail('The other item is gone.');
      other.x = x;
      other.y = y;
      me.x = prev.x;
      me.y = prev.y;
      me.dir = prev.dir;
    } else if (prev.loc === 'bag') {
      const p = placement.pickUp(state, uid, { force: true });
      if (!p.ok) return p;
      const i = state.bag.indexOf(uid);
      if (i >= 0) {
        state.bag.splice(i, 1);
        state.bag.splice(Math.min(prev.index, state.bag.length), 0, uid);
      }
    } else {
      if (!cellFree(state, prev.x, prev.y)) return fail('Something else is on that tile now.');
      me.x = prev.x;
      me.y = prev.y;
      me.dir = prev.dir;
    }
    refreshProduction(state);
    return { ok: true };
  });
  return r;
}

export function pickUpU(state, uid) {
  const it = state.items[uid];
  const prev = it && it.loc === 'placed' ? { x: it.x, y: it.y, dir: it.dir || 0, title: itemTitle(it) } : null;
  const r = placement.pickUp(state, uid);
  if (!r.ok || !prev) return r;
  push(state, `Picked up ${prev.title}`, () => {
    const me = state.items[uid];
    if (!me || me.loc !== 'bag') return fail('That item is no longer in the backpack.');
    if (!cellFree(state, prev.x, prev.y)) return fail('Something else is on that tile now.');
    const i = state.bag.indexOf(uid);
    if (i >= 0) state.bag.splice(i, 1);
    Object.assign(me, { loc: 'placed', x: prev.x, y: prev.y, dir: prev.dir });
    refreshProduction(state);
    return { ok: true };
  });
  return r;
}

/** Take a sale back: the items return, the money (and the XP the sale gave) goes away. */
function restoreSale(state, snaps, value, before) {
  if (state.level !== before.level) return fail('You levelled up since selling, so the sale can no longer be undone.');
  if (state.money.lt(value)) return fail(`You need $${value.format()} to buy it back (you have $${state.money.format()}).`);
  for (const sn of snaps) {
    if (sn.loc === 'placed' && !cellFree(state, sn.x, sn.y)) return fail('Something else is on that tile now.');
    if (sn.loc === 'bag' && bagFull(state)) return fail('Your backpack is full.');
  }
  for (const sn of snaps) {
    const it = { ...sn };
    state.items[it.uid] = it;
    if (it.loc === 'bag') state.bag.splice(Math.min(sn._index, state.bag.length), 0, it.uid);
    delete it._index;
  }
  state.money = state.money.sub(value).nonNeg();
  state.runMoney = state.runMoney.sub(value).nonNeg();
  state.totalMoney = state.totalMoney.sub(value).nonNeg();
  state.xp = before.xp;
  state.stats.sold = Math.max(0, (state.stats.sold || 0) - snaps.length);
  refreshProduction(state);
  return { ok: true };
}
const snap = (state, uid) => ({ ...JSON.parse(JSON.stringify(state.items[uid])), _index: state.bag.indexOf(uid) });

export function sellU(state, uid) {
  const it = state.items[uid];
  if (!it) return sellItem(state, uid);
  const snaps = [snap(state, uid)];
  const before = { level: state.level, xp: state.xp };
  const title = itemTitle(it);
  const r = sellItem(state, uid);
  if (r.ok) push(state, `Sold ${title}`, () => restoreSale(state, snaps, r.value, before));
  return r;
}

export function sellPlacedU(state, uid) {
  const it = state.items[uid];
  if (!it) return sellPlaced(state, uid);
  const snaps = [snap(state, uid)];
  const before = { level: state.level, xp: state.xp };
  const title = itemTitle(it);
  const r = sellPlaced(state, uid);
  if (r.ok) push(state, `Sold ${title}`, () => restoreSale(state, snaps, r.value, before));
  return r;
}

export function sellDuplicatesU(state) {
  const before = { level: state.level, xp: state.xp };
  const snaps = new Map(state.bag.map((u) => [u, snap(state, u)]));
  const r = sellDuplicates(state);
  if (r.count && r.value) {
    const gone = [...snaps.values()].filter((s) => !state.items[s.uid]);
    push(state, `Sold ${r.count} duplicate${r.count === 1 ? '' : 's'}`, () => restoreSale(state, gone, Big.from(r.value), before));
  }
  return r;
}
