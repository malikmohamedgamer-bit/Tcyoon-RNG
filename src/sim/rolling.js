// Rolling: odds, luck, pity, free rolls, single/multi rolls. All randomness comes from
// state.rng, so a given seed + action list reproduces exactly.
import ECON from '../data/economy.json' with { type: 'json' };
import { ONE, ZERO } from '../core/bignum.js';
import { emit } from '../core/events.js';
import { tierFromLog, oddsOf, tierInfo, PITY } from '../gen/tiers.js';
import { generateItem } from '../gen/items.js';
import { itemTitle, typeOf } from './items.js';
import { addToBag, bagFull } from './inventory.js';
import { luckOf, rollCost, trySpend, freeRollCap, freeRollInterval, modifiers } from './economy.js';
import { addXp, rollXp } from './leveling.js';

/** Tier draw: tier = highest t with odds_t <= luck / u, u uniform in (0,1]. So P(tier >= t) = min(1, luck/odds_t). */
export function drawTier(rng, logLuck, pity, pityMult = 1) {
  const u = rng.open();
  let logX = logLuck - Math.log10(u);
  let forced = null;
  if (pity) {
    for (const p of PITY) {
      const target = logLuck + Math.log10(p.x);
      if ((pity[p.id] || 0) >= Math.max(3, p.every * pityMult) && logX < target) {
        logX = target + rng.next() * 0.5; // guaranteed at least a "1 in x" result
        forced = p.id;
      }
    }
  }
  return { tier: tierFromLog(logX), logX, forced };
}

/** Update pity counters after a draw: a draw at or above a pity target resets that counter. */
export function updatePity(pity, logLuck, logX) {
  for (const p of PITY) {
    if (logX >= logLuck + Math.log10(p.x)) pity[p.id] = 0;
    else pity[p.id] = (pity[p.id] || 0) + 1;
  }
}

/** Odds table shown in the UI. P(tier>=t)=min(1,L/odds_t); exact = difference. */
export function oddsTable(luck, fromTier = 0, count = 12) {
  const rows = [];
  const ge = (t) => ONE.min(luck.div(oddsOf(t)));
  for (let t = fromTier; t < fromTier + count; t++) {
    const p = ge(t);
    const exact = p.sub(ge(t + 1)).nonNeg();
    rows.push({ tier: t, info: tierInfo(t), atLeast: p, exact, oneIn: exact.isZero() ? ZERO : ONE.div(exact) });
  }
  return rows;
}

/** Highest tier whose chance per roll is at least ~1% at this luck: used to center the odds table. */
export function typicalTier(luck) {
  return tierFromLog(luck.log10Num() + 2);
}

export function rollOne(state, rng = state.rng) {
  const luck = luckOf(state);
  const logLuck = luck.log10Num();
  const { tier, logX, forced } = drawTier(rng, logLuck, state.pity, modifiers(state).pityMult);
  updatePity(state.pity, logLuck, logX);
  const data = generateItem(rng, { tier, level: state.level, logLuck });
  return { data, forced };
}

/** Closed-form free roll accrual (also used by offline progress). */
export function accrueFreeRolls(state, seconds) {
  const cap = freeRollCap(state);
  const fr = state.freeRoll;
  if (!(seconds > 0)) return 0;
  if (fr.count >= cap) {
    fr.progress = 0;
    return 0;
  }
  const interval = freeRollInterval(state);
  const total = fr.progress + seconds;
  const n = Math.floor(total / interval);
  const gained = Math.min(cap - fr.count, n);
  fr.count += gained;
  fr.progress = fr.count >= cap ? 0 : total - n * interval;
  return gained;
}

export function maxBatch(state) {
  const r = ECON.roll;
  if (state.level >= r.x100Level) return 100;
  if (state.level >= r.x10Level) return 10;
  return 1;
}
export const autoRollUnlocked = (state) => state.level >= ECON.roll.autoLevel;

/**
 * Perform up to `count` rolls. Free rolls are used first. Stops (and says why) when the
 * backpack is full or the money runs out; only rolls actually performed are charged.
 * @returns {{rolled:object[], blocked:null|'full'|'money'|'locked', spent:Big, freeUsed:number}}
 */
export function doRoll(state, count = 1, opts = {}) {
  const res = { rolled: [], blocked: null, spent: ZERO, freeUsed: 0 };
  if (count > maxBatch(state)) {
    res.blocked = 'locked';
    return res;
  }
  for (let i = 0; i < count; i++) {
    if (bagFull(state)) {
      res.blocked = 'full';
      break;
    }
    const cost = rollCost(state);
    if (state.freeRoll.count > 0) {
      state.freeRoll.count -= 1;
      res.freeUsed++;
      state.stats.freeRolls = (state.stats.freeRolls || 0) + 1;
    } else if (trySpend(state, cost)) {
      res.spent = res.spent.add(cost);
    } else {
      res.blocked = 'money';
      break;
    }
    const { data, forced } = rollOne(state);
    const item = addToBag(state, data);
    res.rolled.push(item);
    state.stats.rolls = (state.stats.rolls || 0) + 1;
    state.stats.bestTier = Math.max(state.stats.bestTier || 0, item.tier);
    addXp(state, rollXp(state.level, item.tier), state._onLevel);
    emit(state, 'roll', { auto: !!opts.auto, uid: item.uid, tpl: item.tpl, itemType: typeOf(item), tier: item.tier, title: itemTitle(item), forced, mutations: item.mut.length, big: item.tier >= 4 });
  }
  if (res.blocked === 'full') emit(state, 'blocked', { reason: 'full' });
  return res;
}

/** Auto-roll: roll one item every autoInterval seconds while affordable and there is room. */
export function stepAutoRoll(state, dt) {
  if (!state.autoRoll || !autoRollUnlocked(state)) return 0;
  state._autoT = (state._autoT || 0) + dt;
  let n = 0;
  const every = ECON.roll.autoInterval * modifiers(state).autoIntervalMult;
  while (state._autoT >= every && n < 20) {
    state._autoT -= every;
    if (bagFull(state) || (state.freeRoll.count === 0 && state.money.lt(rollCost(state)))) {
      state._autoT = 0;
      break;
    }
    const r = doRoll(state, 1, { auto: true });
    if (r.blocked) break;
    n++;
  }
  return n;
}

