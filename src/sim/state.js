// Game state creation, (de)serialisation and schema migrations.
// State is plain data (Big in memory, strings in the save) so the simulation runs in
// Node with no DOM and no Three.js. Transient fields start with "_" and are never saved.
//
// Save schema history:
//   v1  (milestone 2) items: array of every owned item (all in the backpack), no placement.

import { Big, ZERO } from '../core/bignum.js';
import { Rng, hash32 } from '../core/rng.js';
import ECON from '../data/economy.json' with { type: 'json' };
import { addToBag } from './inventory.js';

export const SAVE_VERSION = 1;

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

const slimItem = (it) => ({ uid: it.uid, tpl: it.tpl, tier: it.tier, vs: it.vs || 0, hy: it.hy || null, mut: it.mut || [] });

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
      items: state.bag.map((u) => slimItem(state.items[u])),
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
  for (const it of Array.isArray(data.items) ? data.items : []) {
    if (!it || typeof it.tpl !== 'string') continue;
    const uid = Number.isFinite(Number(it.uid)) ? Number(it.uid) : s.nextUid++;
    const item = { uid, loc: 'bag', tpl: it.tpl, tier: Math.max(0, Math.floor(num(it.tier))), vs: num(it.vs), hy: it.hy || null, mut: Array.isArray(it.mut) ? it.mut : [] };
    s.items[item.uid] = item;
    s.bag.push(item.uid);
    s.nextUid = Math.max(s.nextUid, item.uid + 1);
  }
  return s;
}

export const MIGRATIONS = {};
