// Offline progress, in CLOSED FORM: rate x time, never a tick loop, so it takes the same
// few microseconds for a minute, a month or ten years away.
//
//   money        += income/s x seconds   (income is constant while nothing changes; boosters that
//                                         expire mid-away split the span into at most (#boosters+1) segments)
//   free rolls   += floor((progress + seconds) / interval), capped (accrueFreeRolls, shared with online play)
//   boosters     -= seconds
//   waves        resolved by expected value (sim/combat.js offlineWaves)
//
// Time safety (core/time.js sanitizeElapsed): negative elapsed (clock moved back) is ignored; an absurd
// elapsed time is clamped to MAX_OFFLINE_SECONDS (10 years).
import { ZERO } from '../core/bignum.js';
import { addMoney } from './economy.js';
import { accrueFreeRolls } from './rolling.js';
import { refreshProduction } from './production.js';
import { stepBoosters } from './shop.js';

/** Minimum away time (s) before a welcome-back summary is shown. */
export const WELCOME_MIN_SECONDS = 20;

/**
 * Apply `seconds` of offline progress to state. Returns a summary for the welcome-back screen.
 * @param {object} state
 * @param {number} seconds already sanitised elapsed seconds (>= 0)
 * @param {{waves?: Function}} [hooks] combat hook (installed by the game shell): (state, seconds) => summary
 */
export function applyOffline(state, seconds, hooks = {}) {
  const summary = { seconds: 0, money: ZERO, freeRolls: 0, boostersExpired: 0, waves: null };
  if (!(seconds > 0) || !Number.isFinite(seconds)) return summary;
  summary.seconds = seconds;
  const money0 = state.money;
  // money: split at booster expiries so a short booster is not credited for the whole absence
  const cuts = [...new Set(state.boosts.map((b) => b.left).filter((l) => l > 0 && l < seconds))].sort((a, b) => a - b);
  let done = 0;
  for (const cut of [...cuts, seconds]) {
    const seg = cut - done;
    if (seg <= 0) continue;
    refreshProduction(state);
    const inc = state._p.income;
    if (!inc.isZero()) addMoney(state, inc.mul(seg));
    stepBoosters(state, seg); // expires the booster(s) ending at this cut
    done = cut;
  }
  summary.boostersExpired = cuts.length;
  summary.freeRolls = accrueFreeRolls(state, seconds);
  if (hooks.waves) summary.waves = hooks.waves(state, seconds);
  refreshProduction(state);
  summary.money = state.money.sub(money0).nonNeg();
  return summary;
}

