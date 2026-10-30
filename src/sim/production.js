// Production flow solver (steady state, closed form).
//
// FLOW RULE (also in README): droppers emit units in the direction they face; every flow
// item passes units to the cell it faces; each item on the path applies its effect in
// this order — throughput cap -> flat add -> refine -> multiply — and a seller cashes out.
// Items that do not accept units (generators, turrets), empty cells, edges and loops
// block the flow (the units are lost and the item is flagged "blocked").
//
// The graph is a functional graph (each cell has one outgoing cell) so it is solved in a
// single pass in topological order. Income is exact for the steady state, which is what
// makes offline progress closed-form: income/s is constant while nothing changes.
import { ONE, ZERO } from '../core/bignum.js';
import { itemStats, typeOf } from './items.js';
import { modifiers } from './economy.js';

export const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
export const DIR_NAMES = ['east →', 'south ↓', 'west ←', 'north ↑'];
export const FLOW_TYPES = new Set(['dropper', 'conveyor', 'multiplier', 'refiner', 'seller', 'upgrader']);
const key = (x, y) => `${x},${y}`;

/** Placed items of a state as an array. */
export function placedItems(state) {
  return Object.values(state.items).filter((it) => it.loc === 'placed');
}

/** Mega-tile bonus past the maximum grid size: 1 + 1.5*(1 - 0.97^mega) (asymptote 2.5x). */
export const megaBonus = (mega) => 1 + 1.5 * (1 - Math.pow(0.97, Math.max(0, mega || 0)));

export function computeProduction(state) {
  const mods = modifiers(state);
  const cells = new Map();
  const nodes = [];
  for (const it of placedItems(state)) {
    const n = { uid: it.uid, item: it, x: it.x, y: it.y, type: typeOf(it), stats: itemStats(it), dir: it.dir || 0, uIn: ZERO, wIn: ZERO, indeg: 0, next: null, done: false, blocked: false };
    cells.set(key(it.x, it.y), n);
    nodes.push(n);
  }
  // global generator effects
  let luck = ONE;
  let xp = ONE;
  const aura = new Map(); // dropper uid -> rate multiplier from adjacent dynamos
  for (const n of nodes) {
    if (n.type !== 'generator') continue;
    // additive stacking: luck -> better tiers -> stronger shrines is a feedback loop, so N shrines must give
    // 1 + sum(bonus) (linear in N, bounded by the grid), never a product (exponential in N)
    if (n.stats.luck) luck = luck.add(n.stats.luck.sub(1));
    if (n.stats.xp) xp = xp.add(n.stats.xp.sub(1));
    if (n.stats.aura) {
      for (const [dx, dy] of DIRS) {
        const nb = cells.get(key(n.x + dx, n.y + dy));
        if (nb && nb.type === 'dropper') aura.set(nb.uid, (aura.get(nb.uid) || ONE).mul(n.stats.aura));
      }
    }
  }
  // edges
  const flow = nodes.filter((n) => FLOW_TYPES.has(n.type));
  for (const n of flow) {
    if (n.type === 'seller') continue;
    const [dx, dy] = DIRS[n.dir];
    const nx = cells.get(key(n.x + dx, n.y + dy));
    if (nx && FLOW_TYPES.has(nx.type)) {
      n.next = nx;
      nx.indeg++;
    } else n.blocked = true; // dead end: units lost
  }
  // topological order (Kahn)
  const queue = flow.filter((n) => n.indeg === 0);
  const order = [];
  while (queue.length) {
    const n = queue.pop();
    order.push(n);
    n.done = true;
    if (n.next && --n.next.indeg === 0) queue.push(n.next);
  }
  const looped = flow.filter((n) => !n.done);
  for (const n of looped) n.blocked = true;

  let income = ZERO;
  let sold = ZERO;
  const globalMult = mods.income.mul(megaBonus(state.base?.mega));
  const sources = [];
  for (const n of order) {
    let u = n.uIn;
    let w = n.wIn;
    const s = n.stats;
    if (n.type === 'dropper') {
      const rate = s.rate.mul(aura.get(n.uid) || ONE).mul(mods.rate);
      const value = s.value.mul(mods.value);
      n.emitU = rate;
      n.emitW = rate.mul(value);
      u = u.add(n.emitU);
      w = w.add(n.emitW);
      sources.push(n);
    }
    n.capScale = ONE;
    if (s.cap && u.gt(s.cap)) {
      n.capScale = s.cap.div(u);
      u = s.cap;
      w = w.mul(n.capScale);
    }
    n.addPer = s.add || ZERO;
    if (s.add) w = w.add(u.mul(s.add));
    n.refFactor = ONE;
    if (s.refine) {
      const portion = u.isZero() ? ONE : ONE.min(s.rcap.div(u));
      n.refFactor = ONE.add(s.refine.sub(1).mul(portion));
      w = w.mul(n.refFactor);
    }
    n.multF = s.mult || ONE;
    if (s.mult) w = w.mul(s.mult);
    n.flowU = u;
    n.flowW = w;
    if (n.type === 'seller') {
      const cap = s.scap || u;
      const usold = u.min(cap);
      n.sellFrac = u.isZero() ? ONE : usold.div(u);
      n.sellMult = (s.sell || ONE).mul(mods.sellMult);
      n.money = w.mul(n.sellFrac).mul(n.sellMult).mul(globalMult);
      income = income.add(n.money);
      sold = sold.add(usold);
    } else if (n.next) {
      n.next.uIn = n.next.uIn.add(u);
      n.next.wIn = n.next.wIn.add(w);
    }
  }
  // exact per-dropper attribution: walk each dropper's own path with the node factors
  const perItem = new Map();
  for (const n of nodes) perItem.set(n.uid, { uid: n.uid, out: ZERO, flowU: n.flowU || ZERO, flowW: n.flowW || ZERO, blocked: n.blocked, type: n.type });
  for (const src of sources) {
    let u = src.emitU;
    let w = src.emitW;
    let cur = src;
    let guard = 0;
    while (cur && guard++ < 5000) {
      if (!cur.done) break;
      u = u.mul(cur.capScale);
      w = w.mul(cur.capScale);
      w = w.add(u.mul(cur.addPer));
      w = w.mul(cur.refFactor).mul(cur.multF);
      if (cur.type === 'seller') {
        perItem.get(src.uid).out = w.mul(cur.sellFrac).mul(cur.sellMult).mul(globalMult);
        break;
      }
      cur = cur.next;
    }
  }
  const blocked = nodes.filter((n) => n.blocked).map((n) => n.uid);
  return { income, perItem, blocked, luck, xp, unitsSold: sold, sellers: flow.filter((n) => n.type === 'seller').length, droppers: sources.length };
}

/** Recompute and cache production (call after any change to items, layout or modifiers). */
export function refreshProduction(state) {
  const p = computeProduction(state);
  state._p = p;
  state._d = { luck: p.luck, xp: p.xp };
  state._rev = (state._rev || 0) + 1;
  return p;
}

export const incomeRate = (state) => (state._p ? state._p.income : refreshProduction(state).income);

/** Advance production by dt seconds. */
export function stepProduction(state, dt, add) {
  if (!state._p) refreshProduction(state);
  const gain = state._p.income.mul(dt);
  if (!gain.isZero()) add(state, gain);
  return gain;
}
