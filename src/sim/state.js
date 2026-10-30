// Game state creation, (de)serialisation and schema migrations.
// State is plain data (Big in memory, strings in the save) so the simulation runs in
// Node with no DOM and no Three.js. Transient fields start with "_" and are never saved.
//
// Save schema history:
//   v1  (milestone 2) items: array of every owned item (all in the backpack), no placement.
//   v2  (milestone 3) items: object keyed by uid with loc/x/y/dir; `bag` order list; `base`; `presets`.

import { Big, ZERO } from '../core/bignum.js';
import { Rng, hash32 } from '../core/rng.js';
import ECON from '../data/economy.json' with { type: 'json' };
import { addToBag } from './inventory.js';
import { TEMPLATES, isWeapon } from './items.js';
import { refreshProduction } from './production.js';
import { START_SIDE, MAX_SIDE } from './placement.js';

export const SAVE_VERSION = 2;

export function defaultSettings() {
  return { pixelSize: 4, quality: 'medium' };
}

export function createState(seed = hash32(String(Date.now())), nowMs = Date.now()) {
  const state = {
    v: SAVE_VERSION,
    seed: seed >>> 0,
    rng: new Rng(seed >>> 0),
    createdAt: nowMs,
    savedAt: nowMs,
    playtime: 0,
    money: Big.fromNumber(ECON.start.money),
    runMoney: ZERO,
    totalMoney: ZERO,
    xp: ZERO,
    level: 1,
    region: 0,
    items: {},
    bag: [],
    base: { side: START_SIDE, expansions: 0, mega: 0 },
    presets: [],
    nextUid: 1,
    backpackTier: 0,
    autoRoll: false,
    pity: { soft: 0, hard: 0 },
    freeRoll: { progress: 0, count: 1 },
    fusePity: 0,
    stats: { rolls: 0, sold: 0, fused: 0, bestTier: 0 },
    settings: defaultSettings(),
  };
  // starter kit: one dropper and one seller so the first income needs no luck
  addToBag(state, { tpl: 'pebble_drill', tier: 0, vs: 0, hy: null, mut: [] }, { force: true });
  addToBag(state, { tpl: 'stall', tier: 0, vs: 0, hy: null, mut: [] }, { force: true });
  return state;
}

const slimItem = (it) => {
  const o = { uid: it.uid, tpl: it.tpl, tier: it.tier, vs: it.vs || 0, hy: it.hy || null, mut: it.mut || [], loc: it.loc };
  if (it.loc === 'placed') Object.assign(o, { x: it.x, y: it.y, dir: it.dir || 0 });
  return o;
};

export function serializeState(state, nowMs = Date.now()) {
  return JSON.parse(
    JSON.stringify({
      v: SAVE_VERSION,
      seed: state.seed,
      rngState: state.rng.getState(),
      createdAt: state.createdAt,
      savedAt: nowMs,
      playtime: state.playtime,
      money: state.money,
      runMoney: state.runMoney,
      totalMoney: state.totalMoney,
      xp: state.xp,
      level: state.level,
      region: state.region,
      items: Object.fromEntries(Object.values(state.items).map((it) => [it.uid, slimItem(it)])),
      bag: state.bag,
      base: state.base,
      presets: state.presets,
      nextUid: state.nextUid,
      backpackTier: state.backpackTier,
      autoRoll: state.autoRoll,
      pity: state.pity,
      freeRoll: state.freeRoll,
      fusePity: state.fusePity,
      stats: state.stats,
      settings: state.settings,
    }),
  );
}

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

export function deserializeState(data) {
  const s = createState(num(data.seed, 1), num(data.createdAt, Date.now()));
  s.items = {};
  s.bag = [];
  s.rng = Array.isArray(data.rngState) && data.rngState.length === 4 ? new Rng(data.rngState) : new Rng(s.seed);
  s.savedAt = num(data.savedAt, s.savedAt);
  s.playtime = Math.max(0, num(data.playtime));
  s.money = Big.from(data.money).nonNeg();
  s.runMoney = Big.from(data.runMoney).nonNeg();
  s.totalMoney = Big.from(data.totalMoney).nonNeg();
  s.xp = Big.from(data.xp).nonNeg();
  s.level = Math.max(1, Math.floor(num(data.level, 1)));
  s.region = Math.max(0, Math.floor(num(data.region)));
  s.nextUid = Math.max(1, Math.floor(num(data.nextUid, 1)));
  s.backpackTier = Math.max(0, Math.floor(num(data.backpackTier)));
  s.autoRoll = !!data.autoRoll;
  s.pity = { soft: num(data.pity?.soft), hard: num(data.pity?.hard) };
  s.freeRoll = { progress: Math.max(0, num(data.freeRoll?.progress)), count: Math.max(0, Math.floor(num(data.freeRoll?.count))) };
  s.fusePity = Math.max(0, num(data.fusePity));
  s.stats = { ...s.stats, ...(data.stats || {}) };
  s.settings = { ...defaultSettings(), ...(data.settings || {}) };
  s.base = { side: Math.min(MAX_SIDE, Math.max(START_SIDE, Math.floor(num(data.base?.side, START_SIDE)))), expansions: Math.max(0, Math.floor(num(data.base?.expansions))), mega: Math.max(0, Math.floor(num(data.base?.mega))) };
  s.presets = Array.isArray(data.presets) ? data.presets.filter((p) => p && Array.isArray(p.layout)).slice(0, 12) : [];
  const occupied = new Set();
  for (const raw of Object.values(data.items && !Array.isArray(data.items) ? data.items : {})) {
    if (!raw || typeof raw.tpl !== 'string' || !TEMPLATES.has(raw.tpl)) continue; // unknown template: drop (data removed)
    const uid = Number.isFinite(Number(raw.uid)) ? Number(raw.uid) : s.nextUid++;
    const item = { uid, loc: 'bag', tpl: raw.tpl, tier: Math.max(0, Math.floor(num(raw.tier))), vs: num(raw.vs), hy: raw.hy || null, mut: Array.isArray(raw.mut) ? raw.mut : [] };
    if (raw.loc === 'placed') {
      const x = Math.floor(num(raw.x, -1));
      const y = Math.floor(num(raw.y, -1));
      const k = `${x},${y}`;
      if (x >= 0 && y >= 0 && x < s.base.side && y < s.base.side && !occupied.has(k) && !isWeapon(item)) {
        occupied.add(k);
        Object.assign(item, { loc: 'placed', x, y, dir: ((Math.floor(num(raw.dir)) % 4) + 4) % 4 });
      }
    } else if (raw.loc === 'gear') item.loc = 'gear';
    s.items[uid] = item;
    s.nextUid = Math.max(s.nextUid, uid + 1);
  }
  const order = Array.isArray(data.bag) ? data.bag : [];
  const inBag = new Set();
  for (const u of order) if (s.items[u] && s.items[u].loc === 'bag' && !inBag.has(u)) { inBag.add(u); s.bag.push(u); }
  for (const it of Object.values(s.items)) if (it.loc === 'bag' && !inBag.has(it.uid)) s.bag.push(it.uid);
  refreshProduction(s);
  return s;
}

/** v1 -> v2: items array (all in the backpack) becomes a uid-keyed object plus a bag order list. */
export const MIGRATIONS = {
  1: (d) => {
    const items = {};
    const bag = [];
    for (const it of Array.isArray(d.items) ? d.items : []) {
      items[it.uid] = { ...it, loc: 'bag' };
      bag.push(it.uid);
    }
    return { ...d, items, bag, base: { side: START_SIDE, expansions: 0, mega: 0 }, presets: [] };
  },
};
