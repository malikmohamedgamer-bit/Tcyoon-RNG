// Endless levels. xpForLevel(L) = base * growth^(L-1) * (1 + L / levelLinear).
import ECON from '../data/economy.json' with { type: 'json' };
import { Big, ZERO, ONE } from '../core/bignum.js';
import { emit } from '../core/events.js';
import { modifiers, rollCost } from './economy.js';

export function xpForLevel(level) {
  const x = ECON.xp;
  return Big.fromNumber(x.base)
    .mul(Big.fromNumber(x.growth).pow(Math.max(0, level - 1)))
    .mul(1 + level / x.levelLinear);
}

/** XP granted for a roll of `tier` at `level` (scaled like the roll price so levels stay paced). */
export function rollXp(level, tier) {
  const x = ECON.xp;
  return Big.fromNumber(x.rollXp)
    .mul(Big.fromNumber(x.growth).pow(Math.max(0, level - 1)))
    .mul(1 + x.tierBonus * Math.min(tier, x.tierBonusMaxTier));
}

export function sellXp(level) {
  return Big.fromNumber(ECON.xp.sellXp).mul(Big.fromNumber(ECON.xp.growth).pow(Math.max(0, level - 1)));
}

const PER_LEVEL_STEPS = 64; // level-ups beyond this in one call are resolved in closed form

/** Sum of xpForLevel(l) for l in [L, M): geometric-series closed form (a*g^(l-1)*(1+l/k)). */
export function xpBetween(L, M) {
  if (M <= L) return ZERO;
  const x = ECON.xp;
  const g = Big.fromNumber(x.growth);
  const gm1 = Big.fromNumber(x.growth - 1);
  const pw = (n) => g.pow(n);
  // S0 = sum_{l=L}^{M-1} g^(l-1) ;  T(n) = sum_{l=1}^{n} l g^(l-1) = (1 - (n+1) g^n + n g^(n+1)) / (1-g)^2
  const S0 = pw(L - 1).mul(pw(M - L).sub(1)).div(gm1);
  const T = (n) => ONE.sub(pw(n).mul(n + 1)).add(pw(n + 1).mul(n)).div(gm1.mul(gm1));
  const S1 = T(M - 1).sub(T(L - 1));
  return Big.fromNumber(x.base).mul(S0.add(S1.div(x.levelLinear)));
}

/** Highest level M >= L reachable with `xp` starting at level L (binary search over the closed form). */
export function levelReachable(L, xp) {
  let lo = L;
  const growth = Math.log(ECON.xp.growth);
  const rough = Math.max(1, Math.ceil(xp.div(xpForLevel(L)).log10Num() * Math.LN10 / growth) + 2);
  let hi = L + rough + 4;
  while (xpBetween(L, hi).lte(xp)) hi = L + (hi - L) * 2; // safety: widen if the estimate was low
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (xpBetween(L, mid).lte(xp)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * Add XP (scaled by the XP modifier). Up to 64 level-ups are processed one by one (each grants its
 * reward through `onLevel`); a bigger jump is resolved in closed form (levelReachable + the bulk reward
 * hook `state._onLevelBulk(from, to)`), so even 10^100 XP costs a few milliseconds.
 * @returns {number} levels gained
 */
export function addXp(state, amount, onLevel = state._onLevel) {
  amount = Big.from(amount).nonNeg().mul(modifiers(state).xp);
  if (amount.isZero()) return 0;
  state.xp = state.xp.add(amount);
  let gained = 0;
  // Rewards for levels gained by this XP are priced at the roll price from BEFORE the jump,
  // otherwise a huge XP multiplier would pay level-264 prices for a level-1 roll (arbitrage).
  state._refPrice = rollCost(state);
  while (gained < PER_LEVEL_STEPS) {
    const need = xpForLevel(state.level);
    if (state.xp.lt(need)) break;
    state.xp = state.xp.sub(need).nonNeg();
    state.level += 1;
    gained++;
    emit(state, 'level', { level: state.level });
    if (onLevel) onLevel(state.level);
  }
  if (gained === PER_LEVEL_STEPS && state.xp.gte(xpForLevel(state.level))) {
    const from = state.level + 1;
    const M = levelReachable(state.level, state.xp);
    if (M > state.level) {
      state.xp = state.xp.sub(xpBetween(state.level, M)).nonNeg();
      state.level = M;
      gained += M - from + 1;
      emit(state, 'level', { level: M, bulk: true });
      if (state._onLevelBulk) state._onLevelBulk(from, M);
    }
  }
  state._refPrice = null;
  return gained;
}

export function levelProgress(state) {
  const need = xpForLevel(state.level);
  const p = state.xp.div(need).toNumber();
  return Math.max(0, Math.min(1, Number.isFinite(p) ? p : 0));
}
