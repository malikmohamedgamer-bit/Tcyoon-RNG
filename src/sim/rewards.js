// Rewards. Level rewards: hand-written for the early levels (data/rewards.json), then a
// documented generation formula for every level forever. Every reward is granted exactly
// once: the ledger `state.rewards.levelClaimed` only moves forward.
//
// Generation formula for a level L without a hand-written entry:
//   rollPrices = 0.5 + L/50                    (money = that many roll prices at level L)
//   freeRolls  = 1 if L % 4 == 0, +2 if L % 10 == 0
//   backpack   = 2 slots if L % 5 == 0
//   luckPct    = 3 if L % 7 == 0               (additive percentage points, permanent: luck x (1 + sum/100))
//   expansion  = 1 if L % 15 == 0              (free base expansion)
//   gear       = 1 if L % 25 == 0
//   freeCap    = 1 if L % 20 == 0
//   items      = one item at (typical tier of your luck + 2) if L % 10 == 0, else (+1) if L % 4 == 0
//                (reward tiers are RELATIVE to your luck: a fixed tier like floor(L/5) handed out tier-200 items
//                 at level 1000, ~10^1600 x anything rollable, and made single runs explode: BUGS.md #15)
//
// Anti-exploit rule: money, free rolls and items are "consumable" rewards. They are scaled by
// 1 / max(1, XP multiplier): faster levelling (lamps, rebirth tree) therefore never pays more
// than it costs. Levelling costs at least ~1.4 roll prices per level at the base XP rate, and
// a level pays at most 0.5 + L/50 roll prices, so rolling for levels cannot print money.
import RW from '../data/rewards.json' with { type: 'json' };
import { Rng } from '../core/rng.js';
import { emit } from '../core/events.js';
import { generateItem } from '../gen/items.js';
import { addToBag, bagFull } from './inventory.js';
import { addMoney, rollCost, luckOf, backpackCapacity, modifiers } from './economy.js';
import { grantExpansion, grantExpansions } from './placement.js';
import { typicalTier } from './rolling.js';
import { itemTitle } from './items.js';

export const HAND_LEVELS = RW.levels;

/** Pure: the reward spec for level L (L >= 2). */
export function levelReward(L) {
  L = Number.isFinite(L) ? Math.max(2, Math.floor(L)) : 2;
  const hand = RW.levels[String(L)];
  if (hand) return { level: L, hand: true, ...hand };
  const r = { level: L, hand: false, rollPrices: Math.round((0.5 + L / 50) * 100) / 100 };
  if (L % 4 === 0) r.freeRolls = 1;
  if (L % 10 === 0) r.freeRolls = (r.freeRolls || 0) + 2;
  if (L % 5 === 0) r.backpack = 2;
  if (L % 7 === 0) r.luckPct = 3;
  if (L % 15 === 0) r.expansion = 1;
  if (L % 25 === 0) r.gear = 1;
  if (L % 20 === 0) r.freeCap = 1;
  if (L % 10 === 0) r.items = [{ tierPlus: 2 }];
  else if (L % 4 === 0) r.items = [{ tierPlus: 1 }];
  return r;
}

export function describeReward(r, fmt = (b) => b.format()) {
  const parts = [];
  if (r.rollPrices) parts.push(`${r.rollPrices} roll prices of money`);
  if (r.freeRolls) parts.push(`+${r.freeRolls} free roll${r.freeRolls > 1 ? 's' : ''}`);
  if (r.backpack) parts.push(`+${r.backpack} backpack slots`);
  if (r.luckPct) parts.push(`+${r.luckPct}% luck`);
  if (r.expansion) parts.push('free base expansion');
  if (r.gear) parts.push('+1 gear slot');
  if (r.freeCap) parts.push('free-roll cap +1');
  if (r.items) parts.push(`${r.items.length} item${r.items.length > 1 ? 's' : ''} (${r.items.map((i) => (i.tierPlus != null ? `luck tier +${i.tierPlus}` : `tier ${i.tier}`)).join(', ')})`);
  if (r.unlock) parts.push(`unlocks ${r.unlock.join(', ')}`);
  void fmt;
  return parts.join(' · ');
}

export function createRewardState() {
  return { levelClaimed: 1, freeAcc: 0, claimed: {}, daily: { last: null, streak: 0 } };
}

export function createBonus() {
  return { backpack: 0, luckPct: 0, gear: 0, freeCap: 0 };
}

const MAX_ITEMS_OVER_CAP = 40;

/**
 * Grant a reward spec to the player (shared by level rewards, quests, daily rewards, chests...).
 * `scale` (0..1) shrinks consumable rewards (money, free rolls, items): level rewards pass
 * 1 / xpMultiplier. `priceRef` caps the roll price used to value money rewards.
 * @returns {{money?:Big, items:string[], text:string}}
 */
export function grantSpec(state, r, { key, scale = 1, priceRef = null } = {}) {
  const given = { items: [] };
  if (r.rollPrices) {
    const price = priceRef ? rollCost(state).min(priceRef) : rollCost(state);
    const money = price.mul(r.rollPrices * scale);
    addMoney(state, money);
    given.money = money;
  }
  if (r.freeRolls) {
    state.rewards.freeAcc = (state.rewards.freeAcc || 0) + r.freeRolls * scale;
    const whole = Math.floor(state.rewards.freeAcc + 1e-9);
    state.rewards.freeAcc -= whole;
    state.freeRoll.count += whole;
  }
  if (r.backpack) state.bonus.backpack += r.backpack;
  if (r.luckPct) state.bonus.luckPct += r.luckPct; // additive: compounding would explode at huge levels
  if (r.gear) state.bonus.gear += r.gear;
  if (r.freeCap) state.bonus.freeCap += r.freeCap;
  if (r.expansion) grantExpansion(state);
  if (r.items) {
    const rng = new Rng(`${state.seed}|reward|${key}`);
    const logLuck = luckOf(state).log10Num();
    for (const spec of r.items) {
      if (rng.next() >= scale) continue; // consumable: fewer items when XP is boosted
      const tier = spec.tierPlus != null ? typicalTier(luckOf(state)) + spec.tierPlus : spec.tier;
      const data = generateItem(rng, { tier, level: Math.max(state.level, 4), logLuck, tpl: spec.tpl });
      if (state.bag.length >= backpackCapacity(state) + MAX_ITEMS_OVER_CAP) {
        // absurdly many rewards at once: convert surplus items to money instead of hoarding
        addMoney(state, rollCost(state).mul(0.5));
        continue;
      }
      given.items.push(itemTitle(addToBag(state, data, { force: true })));
    }
  }
  given.text = describeReward(r);
  return given;
}

/** Grant one level's reward. Idempotent per level through the ledger. */
export function grantLevelReward(state, L) {
  if (L <= state.rewards.levelClaimed) return null; // already granted: never twice
  state.rewards.levelClaimed = L;
  const r = levelReward(L);
  const scale = 1 / Math.max(1, modifiers(state).xp.toNumber());
  const given = grantSpec(state, r, { key: `level|${L}`, scale, priceRef: state._refPrice || null });
  given.level = L;
  given.note = r.note || '';
  given.bagOver = bagFull(state);
  emit(state, 'levelReward', { level: L, text: given.text, note: given.note, items: given.items });
  return given;
}

const countMultiples = (a, b, k) => Math.max(0, Math.floor(b / k) - Math.floor((a - 1) / k));

/**
 * Closed-form rewards for a huge level jump a..b (used when more than 64 levels are gained at once).
 * Permanent bonuses are counted exactly per the generation formula; consumable rewards (money, free rolls)
 * are summed and scaled by 1/xpMultiplier as always; items are skipped (the scale is tiny in these jumps).
 */
export function grantLevelRange(state, a, b) {
  if (b <= state.rewards.levelClaimed) return null;
  a = Math.max(a, state.rewards.levelClaimed + 1);
  state.rewards.levelClaimed = b;
  const n = b - a + 1;
  const scale = 1 / Math.max(1, modifiers(state).xp.toNumber());
  const price = state._refPrice ? rollCost(state).min(state._refPrice) : rollCost(state);
  const rollPrices = n * 0.5 + ((a + b) * n) / 100;
  addMoney(state, price.mul(rollPrices * scale));
  state.rewards.freeAcc = (state.rewards.freeAcc || 0) + (countMultiples(a, b, 4) + 2 * countMultiples(a, b, 10)) * scale;
  const whole = Math.floor(state.rewards.freeAcc + 1e-9);
  state.rewards.freeAcc -= whole;
  state.freeRoll.count += whole;
  state.bonus.backpack += 2 * countMultiples(a, b, 5);
  state.bonus.luckPct += 3 * countMultiples(a, b, 7);
  state.bonus.gear += countMultiples(a, b, 25);
  state.bonus.freeCap += countMultiples(a, b, 20);
  grantExpansions(state, countMultiples(a, b, 15));
  emit(state, 'levelReward', { level: b, text: `Levels ${a}–${b}: permanent bonuses granted`, note: '', items: [] });
  return { from: a, to: b };
}

/** Install the level-up hook on a state (not serialised). */
export function installRewardHooks(state) {
  state._onLevel = (level) => grantLevelReward(state, level);
  state._onLevelBulk = (a, b) => grantLevelRange(state, a, b);
}
