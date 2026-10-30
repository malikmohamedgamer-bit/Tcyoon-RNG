// Endless rarity tiers. Tiers 0..11 are hand-written (data/tiers.json); beyond that
//   log10(odds_t)  = log10(odds_11)  + a n + b n^2
//   log10(value_t) = log10(value_11) + valueExponent (a n + b n^2),   n = t - 11
// so there is always a rarer tier, and tier lookup from a luck-scaled draw is closed
// form (a quadratic), never a loop. Tier indices are doubles up to MAX_TIER.

import TIERS from '../data/tiers.json' with { type: 'json' };
import { Big } from '../core/bignum.js';
import { tierWord, romanize } from './names.js';

const HAND = TIERS.tiers;
const T = HAND.length; // 12 hand tiers: 0..11
const LAST = T - 1;
const G = TIERS.generated;
const LOGD = HAND.map((t) => Math.log10(t.odds));
const LOGV = HAND.map((t) => Math.log10(t.value));
export const MAX_TIER = 1e15;
export const PITY = TIERS.pity;
export const HAND_TIER_COUNT = T;

const clampTier = (t) => (t === Infinity ? MAX_TIER : t < 0 || !Number.isFinite(t) ? 0 : Math.min(MAX_TIER, Math.floor(t)));

/** log10 of the "1 in N" odds of rolling tier >= t at luck 1. */
export function logOdds(t) {
  t = clampTier(t);
  if (t < T) return LOGD[t];
  const n = t - LAST;
  return LOGD[LAST] + G.a * n + G.b * n * n;
}

/** log10 of the value multiplier of tier t. */
export function logValue(t) {
  t = clampTier(t);
  if (t < T) return LOGV[t];
  const n = t - LAST;
  return LOGV[LAST] + G.valueExponent * (G.a * n + G.b * n * n);
}

/** Continuous version of logValue for fractional tiers (combat scaling interpolates). */
export function logValueReal(x) {
  if (!(x > 0)) return LOGV[0] * 0;
  if (x >= LAST) {
    const n = x - LAST;
    return LOGV[LAST] + G.valueExponent * (G.a * n + G.b * n * n);
  }
  const i = Math.floor(x);
  const f = x - i;
  return LOGV[i] + (LOGV[i + 1] - LOGV[i]) * f;
}

export const oddsOf = (t) => Big.fromNumber(10).pow(Big.fromNumber(logOdds(t)));
export const valueOf = (t) => Big.fromNumber(10).pow(Big.fromNumber(logValue(t)));

/** Highest tier whose odds are <= 10^logX (logX = log10 of the luck-scaled draw L/u). */
export function tierFromLog(logX) {
  if (!(logX > 0)) return 0;
  if (logX === Infinity) return MAX_TIER;
  if (logX < LOGD[LAST]) {
    let t = 0;
    while (t + 1 < T && LOGD[t + 1] <= logX) t++;
    return t;
  }
  const Y = logX - LOGD[LAST];
  const n = Math.floor((-G.a + Math.sqrt(G.a * G.a + 4 * G.b * Y)) / (2 * G.b));
  let t = clampTier(LAST + n);
  if (t < 1e9) {
    // fix tiny floating-point error at the boundaries
    while (t < MAX_TIER && logOdds(t + 1) <= logX) t++;
    while (t > LAST && logOdds(t) > logX) t--;
  }
  return t;
}

export function tierName(t) {
  t = clampTier(t);
  if (t < T) return HAND[t].name;
  return tierWord(t);
}
export function tierIcon(t) {
  t = clampTier(t);
  if (t < T) return HAND[t].icon;
  return G.icons[(t - T) % G.icons.length];
}
export function tierColor(t) {
  t = clampTier(t);
  if (t < T) return HAND[t].color;
  const hue = ((t - T) * 47) % 360;
  return `hsl(${hue} 85% 65%)`;
}

/** Display bundle for a tier. `short` is a compact label that never relies on colour. */
export function tierInfo(t) {
  t = clampTier(t);
  const name = tierName(t);
  const icon = tierIcon(t);
  return { t, name, icon, color: tierColor(t), short: `${icon} ${name}`, label: t < T ? name : `${name} ${romanize(((t - T) % 20) + 1)}`, odds: oddsOf(t), value: valueOf(t) };
}
