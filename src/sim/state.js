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
import { applyLayerMods } from './rebirth.js';
import { applyShopMods } from './shop.js';
import { createCombatState } from './combat.js';
import { createRewardState, createBonus, installRewardHooks } from './rewards.js';
import { START_SIDE, MAX_SIDE } from './placement.js';
import { applyDifficultyMods, isMode } from './difficulty.js';
import { createTipState, sanitizeTips, observe as observeTip } from './tips.js';
import { createTutorialState, legacyTutorialState, sanitizeTutorial } from './tutorial.js';

export const SAVE_VERSION = 2;
const TIPS_FOR_LEGACY = ['bagFull', 'firstMutation', 'firstRefiner', 'firstWave', 'firstBoss', 'firstRebirth'];

export function defaultSettings() {
  return {
    pixelSize: 4, // render-target downscale (1 = native resolution)
    quality: 'medium', // low | medium | high
    numberFormat: 'suffix', // suffix | scientific | engineering
    accent: null, // custom accent colour (#rrggbb) or null
    themeOverride: null, // null = theme follows the region; otherwise a base theme id
    floorSkin: null, // null = theme floor; plates | rivets | hex | circuit | checker
    camera: { invertY: false, speed: 1, sway: true },
    uiScale: 1,
    contrast: 'normal', // normal | high
    motion: 'auto', // auto (follow the OS) | reduced | full
    colorblind: false, // extra non-colour rarity cues (border styles)
    gameSpeed: 1, // faster speeds are unlocked by progress (sim/speed.js); slower ones are always allowed
    tips: true, // one-time contextual tips
    captions: false,
    muted: false,
    music: false,
    volume: { master: 0.7, sfx: 1, music: 0.35 },
    hiddenPanels: [],
    hud: { level: true, income: true, luck: true, region: true, fps: true },
    bindings: null, // null = defaults; otherwise { action: [codes] }
  };
}

const clampNum = (v, lo, hi, d) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d);
const oneOf = (v, list, d) => (list.includes(v) ? v : d);

/** Validate/repair settings from a save or an import: unknown keys dropped, numbers clamped, enums checked. */
export function sanitizeSettings(raw) {
  const d = defaultSettings();
  const r = raw && typeof raw === 'object' ? raw : {};
  const out = {
    pixelSize: Math.round(clampNum(r.pixelSize, 1, 16, d.pixelSize)),
    quality: oneOf(r.quality, ['low', 'medium', 'high'], d.quality),
    numberFormat: oneOf(r.numberFormat, ['suffix', 'scientific', 'engineering'], d.numberFormat),
    accent: typeof r.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(r.accent) ? r.accent.toLowerCase() : null,
    themeOverride: oneOf(r.themeOverride, ['factory', 'steampunk', 'space', 'scifi', 'pixel'], null),
    floorSkin: oneOf(r.floorSkin, ['plates', 'rivets', 'hex', 'circuit', 'checker'], null),
    camera: { invertY: !!r.camera?.invertY, speed: clampNum(r.camera?.speed, 0.25, 3, 1), sway: r.camera?.sway !== false },
    uiScale: clampNum(r.uiScale, 0.8, 1.6, 1),
    contrast: oneOf(r.contrast, ['normal', 'high'], 'normal'),
    motion: oneOf(r.motion, ['auto', 'reduced', 'full'], 'auto'),
    colorblind: !!r.colorblind,
    gameSpeed: clampNum(r.gameSpeed, 0.25, 1e12, 1),
    tips: r.tips !== false,
    captions: !!r.captions,
    muted: !!r.muted,
    music: !!r.music,
    volume: { master: clampNum(r.volume?.master, 0, 1, d.volume.master), sfx: clampNum(r.volume?.sfx, 0, 1, d.volume.sfx), music: clampNum(r.volume?.music, 0, 1, d.volume.music) },
    hiddenPanels: Array.isArray(r.hiddenPanels) ? r.hiddenPanels.filter((x) => typeof x === 'string').slice(0, 20) : [],
    hud: { ...d.hud, ...Object.fromEntries(Object.entries(r.hud || {}).filter(([k]) => k in d.hud).map(([k, v]) => [k, !!v])) },
    bindings: null,
  };
  if (r.bindings && typeof r.bindings === 'object') {
    const b = {};
    for (const [a, keys] of Object.entries(r.bindings)) if (Array.isArray(keys) && keys.every((k) => typeof k === 'string' && k.length < 30)) b[a] = keys.slice(0, 4);
    out.bindings = Object.keys(b).length ? b : null;
  }
  return out;
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
    layers: [],
    combat: createCombatState(),
    upgrades: {},
    boosts: [],
    shop: { rot: {} },
    rewards: createRewardState(),
    bonus: createBonus(),
    nextUid: 1,
    backpackTier: 0,
    autoRoll: false,
    pity: { soft: 0, hard: 0 },
    freeRoll: { progress: 0, count: 1 },
    fusePity: 0,
    stats: { rolls: 0, sold: 0, fused: 0, bestTier: 0 },
    settings: defaultSettings(),
    tutorial: createTutorialState(),
    difficulty: null, // null until chosen on the first run
    tips: createTipState(),
  };
  // starter kit: one dropper and one seller so the first income needs no luck
  installRewardHooks(state);
  installModHooks(state);
  addToBag(state, { tpl: 'pebble_drill', tier: 0, vs: 0, hy: null, mut: [] }, { force: true });
  addToBag(state, { tpl: 'stall', tier: 0, vs: 0, hy: null, mut: [] }, { force: true });
  return state;
}

/** Modifier hooks (layer tree etc.). Transient; reinstalled on create/load. */
export function installModHooks(state) {
  state._onEvent = (ev) => observeTip(state, ev);
  state._modFns = [(m) => applyLayerMods(state, m), (m) => applyShopMods(state, m), (m) => applyDifficultyMods(state, m)];
}

const slimItem = (it) => {
  const o = { uid: it.uid, tpl: it.tpl, tier: it.tier, vs: it.vs || 0, hy: it.hy || null, mut: it.mut || [], loc: it.loc, lv: it.lv };
  if (it.loc === 'placed') Object.assign(o, { x: it.x, y: it.y, dir: it.dir || 0 });
  if (it.nick) o.nick = it.nick;
  if (it.practice) o.practice = true;
  if (it.skin != null) o.skin = it.skin;
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
      layers: state.layers,
      combat: { wave: state.combat.wave, bestWave: state.combat.bestWave, bossIndex: state.combat.bossIndex },
      upgrades: state.upgrades,
      boosts: state.boosts,
      shop: state.shop,
      rewards: state.rewards,
      bonus: state.bonus,
      nextUid: state.nextUid,
      backpackTier: state.backpackTier,
      autoRoll: state.autoRoll,
      pity: state.pity,
      freeRoll: state.freeRoll,
      fusePity: state.fusePity,
      stats: state.stats,
      settings: state.settings,
      tutorial: state.tutorial,
      difficulty: state.difficulty,
      tips: state.tips,
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
  s.settings = sanitizeSettings(data.settings);
  s.difficulty = isMode(data.difficulty) ? data.difficulty : null;
  s.tips = sanitizeTips(data.tips);
  // an existing save has already seen what it has seen: do not pop old tips for things the player already did
  if (!data.tips) for (const t of TIPS_FOR_LEGACY) if (s.level > 1 || (s.stats.rolls || 0) > 2) s.tips.seen[t] = 1;
  // saves from before the tutorial existed (or experienced players) do not get a surprise tutorial
  s.tutorial = sanitizeTutorial(data.tutorial) || (s.level > 1 || (s.stats.rolls || 0) > 2 ? legacyTutorialState() : createTutorialState());
  s.base = { side: Math.min(MAX_SIDE, Math.max(START_SIDE, Math.floor(num(data.base?.side, START_SIDE)))), expansions: Math.max(0, Math.floor(num(data.base?.expansions))), mega: Math.max(0, Math.floor(num(data.base?.mega))) };
  s.layers = (Array.isArray(data.layers) ? data.layers : []).slice(0, 1000).map((l) => ({
    count: Math.max(0, Math.floor(num(l?.count))),
    currency: Big.from(l?.currency).nonNeg(),
    total: Big.from(l?.total).nonNeg(),
    run: Big.from(l?.run).nonNeg(),
    tree: Object.fromEntries(Object.entries(l?.tree || {}).filter(([, v]) => Number.isFinite(Number(v)) && Number(v) > 0).map(([k2, v]) => [k2, Math.floor(Number(v))])),
  }));
  s.rewards = { levelClaimed: Math.max(1, Math.floor(num(data.rewards?.levelClaimed, Math.max(1, num(data.level, 1))))), freeAcc: Math.max(0, num(data.rewards?.freeAcc)), claimed: Object.fromEntries(Object.entries(data.rewards?.claimed || {}).filter(([, v]) => v === true)), daily: { last: typeof data.rewards?.daily?.last === 'string' ? data.rewards.daily.last : null, streak: Math.max(0, Math.floor(num(data.rewards?.daily?.streak))) } };
  s.combat = { ...createCombatState(), wave: Math.max(1, Math.floor(num(data.combat?.wave, 1))), bestWave: Math.max(1, Math.floor(num(data.combat?.bestWave, 1))), bossIndex: Math.max(0, Math.floor(num(data.combat?.bossIndex))) };
  s.upgrades = Object.fromEntries(Object.entries(data.upgrades || {}).filter(([, v]) => Number.isFinite(Number(v)) && Number(v) > 0).map(([k2, v]) => [k2, Math.floor(Number(v))]));
  s.boosts = (Array.isArray(data.boosts) ? data.boosts : []).filter((b) => b && typeof b.id === 'string' && Number(b.left) > 0).map((b) => ({ id: b.id, left: Number(b.left) }));
  s.shop = { rot: Object.fromEntries(Object.entries(data.shop?.rot || {}).map(([k2, v]) => [k2, Array.isArray(v) ? v.filter(Number.isInteger) : []])) };
  s.bonus = { backpack: Math.max(0, Math.floor(num(data.bonus?.backpack))), luckPct: Math.max(0, num(data.bonus?.luckPct)), gear: Math.max(0, Math.floor(num(data.bonus?.gear))), freeCap: Math.max(0, Math.floor(num(data.bonus?.freeCap))) };
  s.presets = Array.isArray(data.presets) ? data.presets.filter((p) => p && Array.isArray(p.layout)).slice(0, 12) : [];
  const occupied = new Set();
  for (const raw of Object.values(data.items && !Array.isArray(data.items) ? data.items : {})) {
    if (!raw || typeof raw.tpl !== 'string' || !TEMPLATES.has(raw.tpl)) continue; // unknown template: drop (data removed)
    const uid = Number.isFinite(Number(raw.uid)) ? Number(raw.uid) : s.nextUid++;
    const item = { uid, loc: 'bag', tpl: raw.tpl, tier: Math.max(0, Math.floor(num(raw.tier))), vs: num(raw.vs), hy: raw.hy || null, mut: Array.isArray(raw.mut) ? raw.mut : [], lv: Math.max(1, Math.floor(num(raw.lv, s.level))) };
    if (typeof raw.nick === 'string' && raw.nick.trim()) item.nick = raw.nick.slice(0, 24);
    if (raw.practice === true) item.practice = true;
    if (Number.isInteger(raw.skin) && raw.skin >= 0 && raw.skin < 8) item.skin = raw.skin;
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
