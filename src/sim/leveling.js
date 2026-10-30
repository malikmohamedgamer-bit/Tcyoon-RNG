// Endless levels. xpForLevel(L) = base * growth^(L-1) * (1 + L / levelLinear).
import ECON from '../data/economy.json' with { type: 'json' };
import { Big, ZERO } from '../core/bignum.js';
import { emit } from '../core/events.js';
import { modifiers } from './economy.js';

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
    .mul(1 + x.tierBonus * Math.min(tier, 1000));
}

export function sellXp(level) {
  return Big.fromNumber(ECON.xp.sellXp).mul(Big.fromNumber(ECON.xp.growth).pow(Math.max(0, level - 1)));
}

const MAX_LEVELS_PER_CALL = 100000;

/**
 * Add XP (scaled by the XP modifier). Loops level-ups; every level gained emits an event
 * and is passed to `onLevel(level)` so reward code can grant that level's reward once.
 * @returns {number} levels gained
 */
export function addXp(state, amount, onLevel) {
  amount = Big.from(amount).nonNeg().mul(modifiers(state).xp);
  if (amount.isZero()) return 0;
  state.xp = state.xp.add(amount);
  let gained = 0;
  while (gained < MAX_LEVELS_PER_CALL) {
    const need = xpForLevel(state.level);
    if (state.xp.lt(need)) break;
    state.xp = state.xp.sub(need).nonNeg();
    state.level += 1;
    gained++;
    emit(state, 'level', { level: state.level });
    if (onLevel) onLevel(state.level);
  }
  if (gained === MAX_LEVELS_PER_CALL) state.xp = ZERO; // absurd amounts: drop the remainder rather than loop forever
  return gained;
}

export function levelProgress(state) {
  const need = xpForLevel(state.level);
  const p = state.xp.div(need).toNumber();
  return Math.max(0, Math.min(1, Number.isFinite(p) ? p : 0));
}
