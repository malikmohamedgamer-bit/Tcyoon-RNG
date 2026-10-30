// Rebirth and endless prestige layers.
//
// Layer k's requirement resource R_k: layer 0 = money earned this run; layer k>=1 = currency
// of layer k-1 earned since the last layer-k prestige. Gain = floor((R/threshold)^exponent)
// * (1 + a*total_{k+1}^0.6). Prestiging layer k resets money, items, base, upgrades and
// every layer j < k (currency, total, run, tree) but never levels, XP, achievements or the
// prestige counts. Each prestige moves you to the next region (theme).
import ECON from '../data/economy.json' with { type: 'json' };
import { Big, ONE, ZERO } from '../core/bignum.js';
import { emit } from '../core/events.js';
import { layerDef, layerGainFor, currencyMultiplier, lowerLayerBoost, nodeCost } from '../gen/layers.js';
import { addToBag } from './inventory.js';
import { START_SIDE, MAX_SIDE } from './placement.js';
import { refreshProduction } from './production.js';
import { modifiers } from './economy.js';

export const freshLayer = (count = 0) => ({ count, currency: ZERO, total: ZERO, run: ZERO, tree: {} });

export function layerState(state, k) {
  while (state.layers.length <= k) state.layers.push(freshLayer());
  return state.layers[k];
}

/** How many layers are visible: layer 0 always, layer k once layer k-1 has been prestiged once (or earned something). */
export function visibleLayers(state) {
  let n = 1;
  while (n < 1000 && state.layers[n - 1] && (state.layers[n - 1].count > 0 || !state.layers[n - 1].total.isZero())) n++;
  return n;
}

export function requirement(state, k) {
  return k === 0 ? state.runMoney : layerState(state, k - 1).run;
}

export function gainFor(state, k) {
  const def = layerDef(k);
  const base = layerGainFor(def, requirement(state, k));
  if (base.isZero()) return ZERO;
  const above = state.layers[k + 1];
  const boost = above ? lowerLayerBoost(above.total) : ONE;
  return base.mul(boost).floor();
}

export const canPrestige = (state, k) => gainFor(state, k).gte(1);

/** Progress toward the threshold (0..1+) for UI. */
export function progressToThreshold(state, k) {
  const r = requirement(state, k).div(layerDef(k).threshold).toNumber();
  return Number.isFinite(r) ? r : 1;
}

export function nodeLevel(state, k, id) {
  return (state.layers[k] && state.layers[k].tree[id]) || 0;
}

export function nodeInfo(state, k, node) {
  const ls = layerState(state, k);
  const level = ls.tree[node.id] || 0;
  const maxed = node.max > 0 && level >= node.max;
  const cost = nodeCost(node, level);
  return { level, maxed, cost, affordable: !maxed && ls.currency.gte(cost) };
}

export function buyNode(state, k, id) {
  const def = layerDef(k);
  const node = def.tree.find((n) => n.id === id);
  if (!node) return { ok: false, reason: 'Unknown upgrade' };
  const ls = layerState(state, k);
  const info = nodeInfo(state, k, node);
  if (info.maxed) return { ok: false, reason: 'Already at max level' };
  if (ls.currency.lt(info.cost)) return { ok: false, reason: 'Not enough ' + def.currency.name };
  ls.currency = ls.currency.sub(info.cost).nonNeg();
  ls.tree[id] = info.level + 1;
  refreshProduction(state);
  return { ok: true, level: info.level + 1, cost: info.cost };
}

// ---------------------------------------------------------------- modifiers
function applyKind(m, kind, amount, mulFactor) {
  switch (kind) {
    case 'income': m.income = m.income.mul(mulFactor); break;
    case 'luck': m.luck = m.luck.mul(mulFactor); break;
    case 'xp': m.xp = m.xp.mul(mulFactor); break;
    case 'dmg': m.dmg = m.dmg.mul(mulFactor); break;
    case 'baseHp': m.baseHp = m.baseHp.mul(mulFactor); break;
    case 'dropRate': m.rate = m.rate.mul(mulFactor); break;
    case 'sellMult': m.sellMult = m.sellMult.mul(mulFactor); break;
    case 'rollCost': m.rollCostMult *= Math.max(0.05, 1 - amount); break;
    case 'freeInterval': m.freeIntervalMult *= Math.max(0.1, 1 - amount); break;
    case 'startMoney': m.startMoney = m.startMoney.add(amount); break;
    case 'startSide': m.startSide += amount; break;
    case 'startTier': m.startTier += amount; break;
    case 'freeCap': m.freeCap += amount; break;
    case 'backpack': m.backpackBonus += amount; break;
    default:
  }
}

const MUL_KINDS = new Set(['income', 'luck', 'xp', 'dmg', 'baseHp', 'dropRate', 'sellMult']);

/** Adds every layer's contribution (currency multiplier, tree, rule) into modifiers `m`. */
export function applyLayerMods(state, m) {
  m.startMoney = ZERO;
  m.startSide = 0;
  m.startTier = 0;
  for (let k = 0; k < state.layers.length; k++) {
    const ls = state.layers[k];
    if (!ls) continue;
    const def = layerDef(k);
    if (!ls.total.isZero() && MUL_KINDS.has(def.kind)) applyKind(m, def.kind, 0, currencyMultiplier(def, ls.total));
    for (const node of def.tree) {
      const lv = ls.tree[node.id] || 0;
      if (!lv) continue;
      if (MUL_KINDS.has(node.kind)) applyKind(m, node.kind, 0, Big.fromNumber(1 + node.per).pow(lv));
      else if (node.kind === 'rollCost' || node.kind === 'freeInterval') for (let i = 0; i < lv; i++) applyKind(m, node.kind, node.per);
      else if (node.kind === 'startMoney') applyKind(m, node.kind, Big.from(node.per).mul(lv));
      else applyKind(m, node.kind, node.per * lv);
    }
    if (ls.count > 0) {
      const r = def.rule;
      if (MUL_KINDS.has(r.kind)) applyKind(m, r.kind, 0, Big.fromNumber(1 + r.per * ls.count));
      else if (r.kind === 'startMoney') applyKind(m, r.kind, Big.from(r.per).mul(ls.count));
      else applyKind(m, r.kind, r.per * ls.count);
    }
  }
  m.startSide = Math.min(m.startSide, MAX_SIDE - START_SIDE);
}

// ---------------------------------------------------------------- prestige
/** What a prestige will do (shown in the confirmation dialog). */
export function prestigePreview(state, k) {
  const placed = Object.values(state.items).filter((i) => i.loc === 'placed').length;
  return {
    gain: gainFor(state, k),
    loses: { money: state.money, items: Object.keys(state.items).length, placed, baseSide: state.base.side, lowerLayers: k },
    keeps: ['level and XP', 'achievements and rewards already claimed', `${layerDef(k).currency.name} and its upgrades`, 'prestige counts'],
  };
}

function resetRun(state) {
  const mods = modifiers(state);
  state.money = Big.fromNumber(ECON.start.money).add(mods.startMoney);
  state.runMoney = ZERO;
  state.items = {};
  state.bag = [];
  state.presets = [];
  state.base = { side: Math.min(MAX_SIDE, START_SIDE + mods.startSide), expansions: 0, mega: 0 };
  state.backpackTier = 0;
  state.upgrades = {};
  state.shop = { ...(state.shop || {}), bought: {} };
  state.freeRoll = { progress: 0, count: 1 };
  state.fusePity = 0;
  state._autoT = 0;
  state._p = null;
  const tier = Math.max(0, Math.floor(modifiers(state).startTier));
  addToBag(state, { tpl: 'pebble_drill', tier, vs: 0, hy: null, mut: [] }, { force: true });
  addToBag(state, { tpl: 'stall', tier, vs: 0, hy: null, mut: [] }, { force: true });
  if (state.combat) {
    state.combat.wave = 1; // a new run starts at wave 1 (best wave and defeated bosses are kept)
    state.combat.timer = 60;
    state._enc = null;
  }
}

/**
 * Prestige layer k. Requires gain >= 1. Resets run + lower layers as documented.
 * @returns {{ok:boolean, gain?:Big, reason?:string, region?:number}}
 */
export function prestige(state, k) {
  const gain = gainFor(state, k);
  if (gain.lt(1)) return { ok: false, reason: 'Not enough progress yet' };
  layerState(state, k);
  for (let j = 0; j < k; j++) {
    const keep = state.layers[j].count;
    state.layers[j] = freshLayer(keep);
  }
  const ls = state.layers[k];
  ls.currency = ls.currency.add(gain);
  ls.total = ls.total.add(gain);
  ls.run = ls.run.add(gain);
  ls.count += 1;
  state.stats.rebirths = (state.stats.rebirths || 0) + 1;
  state.stats['prestige' + k] = (state.stats['prestige' + k] || 0) + 1;
  state.region += 1;
  resetRun(state);
  refreshProduction(state);
  emit(state, 'prestige', { layer: k, gain, region: state.region });
  return { ok: true, gain, region: state.region };
}
