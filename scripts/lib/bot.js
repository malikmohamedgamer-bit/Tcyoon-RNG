// Scripted "reasonable player" used by the economy simulator (and re-usable by soak tools).
// It only calls public simulation functions, exactly like the UI does.
import { Big, ZERO } from '../../src/core/bignum.js';
import ECON from '../../src/data/economy.json' with { type: 'json' };
import { createState } from '../../src/sim/state.js';
import { doRoll, maxBatch, accrueFreeRolls, stepAutoRoll } from '../../src/sim/rolling.js';
import { sellItem } from '../../src/sim/inventory.js';
import { autoLayout, expand, expandCost, MAX_SIDE } from '../../src/sim/placement.js';
import { refreshProduction, stepProduction } from '../../src/sim/production.js';
import { addMoney, rollCost, backpackCost, trySpend, backpackCapacity } from '../../src/sim/economy.js';
import { isWeapon, itemStats } from '../../src/sim/items.js';
import { gainFor, buyNode, layerState, visibleLayers } from '../../src/sim/rebirth.js';
import { layerDef } from '../../src/gen/layers.js';
import { prestige } from '../../src/sim/rebirth.js';

export function newBotState(seed = 1) {
  const s = createState(seed, 0);
  refreshProduction(s);
  return s;
}

const worth = (it) => {
  const st = itemStats(it);
  const v = st.dmg || st.value || st.mult || st.refine || st.sell || st.add || st.cap || st.aura || st.luck || st.xp;
  return v ? v.log10Num() : 0;
};

/** Sell every unplaced non-weapon item, keep the two best weapons (combat milestone). */
export function sellSurplus(state) {
  const weapons = state.bag.filter((u) => isWeapon(state.items[u])).sort((a, b) => worth(state.items[b]) - worth(state.items[a]));
  const keep = new Set(weapons.slice(0, 2));
  let n = 0;
  for (const u of [...state.bag]) {
    if (keep.has(u)) continue;
    if (sellItem(state, u).ok) n++;
  }
  return n;
}

/**
 * Spend currency of layer k on the cheapest affordable upgrades (cheap first keeps the
 * tree broad; endless nodes absorb the rest).
 */
export function spendTree(state, k) {
  const def = layerDef(k);
  let bought = 0;
  for (let guard = 0; guard < 200; guard++) {
    const ls = layerState(state, k);
    let best = null;
    for (const node of def.tree) {
      if (node.max > 0 && (ls.tree[node.id] || 0) >= node.max) continue;
      const lv = ls.tree[node.id] || 0;
      const cost = node.cost.mul(Big.fromNumber(node.growth).pow(lv));
      if (cost.gt(ls.currency)) continue;
      // value order: income/luck first, then the rest by cost
      const pri = node.kind === 'income' || node.kind === 'luck' ? 0 : 1;
      const key = pri * 1e6 + cost.log10Num();
      if (!best || key < best.key) best = { node, key };
    }
    if (!best) break;
    if (!buyNode(state, k, best.node.id).ok) break;
    bought++;
  }
  return bought;
}

/**
 * One decision of the bot. `opts.rebirthFactor`: prestige layer k when its gain is at least
 * factor x the lifetime currency of that layer (i.e. roughly doubles it) and at least minGain.
 */
export function decide(state, opts = {}) {
  const rebirthFactor = opts.rebirthFactor ?? 1.0;
  const minGain = opts.minGain ?? 1;
  const minRun = opts.minRunSeconds ?? 600; // do not thrash: a run lasts at least 10 simulated minutes
  const runAge = state.playtime - (state._runStart || 0);
  const log = { rolls: 0, prestiged: [] };
  // layers: highest first
  for (let k = Math.min(visibleLayers(state), 50) - 1; k >= 0; k--) {
    if (opts.noPrestige || runAge < minRun) break;
    const gain = gainFor(state, k);
    if (gain.lt(minGain)) continue;
    const total = layerState(state, k).total;
    if (total.isZero() || gain.gte(total.mul(rebirthFactor))) {
      const r = prestige(state, k);
      if (r.ok) {
        log.prestiged.push(k);
        state._runStart = state.playtime;
        for (let j = 0; j <= k; j++) spendTree(state, j);
        break;
      }
    }
  }
  for (let k = 0; k < Math.min(visibleLayers(state), 50); k++) spendTree(state, k);
  // spend: rolls first (keep nothing in reserve: the sink is bounded by the backpack)
  let rolled = false;
  // a player (or auto-roll) can roll once per autoInterval, plus banked free rolls: the bot gets the same budget
  let budget = Math.ceil((opts.dt ?? 5) / ECON.roll.autoInterval) + state.freeRoll.count;
  for (let guard = 0; guard < 400 && budget > 0; guard++) {
    const free = state.freeRoll.count;
    if (free === 0 && (opts.noRoll || state.money.lt(rollCost(state)))) break; // noRoll: only free rolls (A/B baseline)
    if (free === 0 && state.money.lt(rollCost(state))) break;
    const batch = Math.min(maxBatch(state), 100, budget);
    const r = doRoll(state, batch);
    budget -= Math.max(1, r.rolled.length);
    log.rolls += r.rolled.length;
    if (r.rolled.length) rolled = true;
    if (r.blocked === 'full') {
      sellSurplus(state);
      autoLayout(state);
      if (state.bag.length >= backpackCapacity(state)) break;
    } else if (r.blocked) break;
  }
  if (rolled || state._needLayout) {
    autoLayout(state);
    sellSurplus(state);
    state._needLayout = false;
  }
  // growth purchases: only when they cost < ~10% of money (so rolling stays the main sink)
  for (let g = 0; g < 20; g++) {
    const ec = expandCost(state);
    if (ec.mul(10).lte(state.money) && (state.base.side < Math.min(MAX_SIDE, opts.maxSide ?? 14))) {
      if (expand(state).ok) state._needLayout = true;
      else break;
    } else break;
  }
  if (backpackCost(state).mul(10).lte(state.money) && state.backpackTier < 40) {
    if (trySpend(state, backpackCost(state))) state.backpackTier += 1;
  }
  return log;
}

/** Advance the world by dt seconds with no decisions (production + free rolls + auto-roll). */
export function advance(state, dt) {
  state.playtime += dt;
  accrueFreeRolls(state, dt);
  stepProduction(state, dt, addMoney);
  stepAutoRoll(state, 0);
}

export { ZERO };
