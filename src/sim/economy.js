// Economy formulas (documented in README "Formulas"). Every function is pure given a
// state, returns Big where values can be endless, and never returns a negative price.
import ECON from '../data/economy.json' with { type: 'json' };
import { Big, ONE, ZERO } from '../core/bignum.js';
import { mutationCount } from './mutations.js';

export const ECONOMY = ECON;

/**
 * Aggregated modifiers from upgrades, rebirth trees, generators and gear.
 * Later milestones extend this single function; everything that needs a global
 * multiplier reads it from here so there is one place to audit.
 */
export function modifiers(state) {
  const d = state._d || {};
  const m = {
    income: ONE, // global income multiplier
    luck: d.luck || ONE, // placed Clover Shrines
    xp: d.xp || ONE,
    freeCap: 0,
    freeIntervalMult: 1,
    rollCostMult: 1,
    backpackBonus: 0,
    gearSlots: 0,
    dmg: ONE,
    baseHp: ONE,
  };
  if (state._mods) state._mods(m); // extension hook installed by shop/rebirth modules
  return m;
}

/** Roll price: baseCost * levelGrowth^(level-1), never below baseCost. */
export function rollCost(state) {
  const r = ECON.roll;
  const c = Big.fromNumber(r.baseCost).mul(Big.fromNumber(r.levelGrowth).pow(Math.max(0, state.level - 1)));
  return c.mul(modifiers(state).rollCostMult).max(r.baseCost);
}

/** Luck >= 1. level bonus is additive: 1 + perLevel*(level-1), then multiplied by modifiers. */
export function luckOf(state) {
  const lvl = 1 + ECON.luck.perLevel * Math.max(0, state.level - 1);
  return Big.fromNumber(lvl).mul(modifiers(state).luck).max(1);
}

export const freeRollInterval = (state) => Math.max(5, ECON.freeRoll.interval * modifiers(state).freeIntervalMult);
export const freeRollCap = (state) => ECON.freeRoll.baseCap + modifiers(state).freeCap;

export function backpackCapacity(state) {
  const b = ECON.backpack;
  const n = state.backpackTier;
  return b.baseSlots + b.perTier * n + Math.floor(Math.pow(n, b.tierExp)) + modifiers(state).backpackBonus;
}
/** Price of the next backpack tier: baseCost * costGrowth^tier. */
export const backpackCost = (state) => Big.fromNumber(ECON.backpack.baseCost).mul(Big.fromNumber(ECON.backpack.costGrowth).pow(state.backpackTier));

/**
 * Sell value of an item: rollCost * min(maxFraction, perTier*(1+tier) + perMutation*mutations).
 * Capped at 50% of the roll price so "roll then sell" can never print money.
 */
export function sellValue(state, item) {
  const s = ECON.sell;
  const frac = Math.min(s.maxFraction, s.perTier * (1 + Math.min(item.tier, 1000)) + s.perMutation * mutationCount(item));
  return rollCost(state).mul(frac);
}

export const MIN_MONEY = ZERO;

/** Spend money safely. Returns true and deducts only if the balance covers it. */
export function trySpend(state, cost) {
  cost = Big.from(cost);
  if (cost.isNegative() || state.money.lt(cost)) return false;
  state.money = state.money.sub(cost).nonNeg();
  return true;
}

export function addMoney(state, amount) {
  amount = Big.from(amount);
  if (amount.isNegative()) return;
  state.money = state.money.add(amount);
  state.runMoney = (state.runMoney || ZERO).add(amount);
  state.totalMoney = (state.totalMoney || ZERO).add(amount);
}
