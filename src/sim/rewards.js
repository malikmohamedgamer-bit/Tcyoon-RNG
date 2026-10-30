// Rewards. Level rewards: hand-written for the early levels (data/rewards.json), then a
// documented generation formula for every level forever. Every reward is granted exactly
// once: the ledger `state.rewards.levelClaimed` only moves forward.
//
// Generation formula for a level L without a hand-written entry:
//   rollPrices = 30 + 2L                       (money = that many roll prices at level L)
//   freeRolls  = 1 if L even, +2 if L % 10 == 0
//   backpack   = 2 slots if L % 5 == 0
//   luckPct    = 3 if L % 7 == 0               (multiplicative, permanent)
//   expansion  = 1 if L % 15 == 0              (free base expansion)
//   gear       = 1 if L % 25 == 0
//   freeCap    = 1 if L % 20 == 0
//   items      = one tier floor(L/5) item if L % 10 == 0, else one tier floor(L/8) if L % 4 == 0
import RW from '../data/rewards.json' with { type: 'json' };
import { ONE } from '../core/bignum.js';
import { Rng } from '../core/rng.js';
import { emit } from '../core/events.js';
import { generateItem } from '../gen/items.js';
import { addToBag, bagFull } from './inventory.js';
import { addMoney, rollCost, luckOf, backpackCapacity } from './economy.js';
import { grantExpansion } from './placement.js';
import { itemTitle } from './items.js';

export const HAND_LEVELS = RW.levels;

/** Pure: the reward spec for level L (L >= 2). */
export function levelReward(L) {
  L = Number.isFinite(L) ? Math.max(2, Math.floor(L)) : 2;
  const hand = RW.levels[String(L)];
  if (hand) return { level: L, hand: true, ...hand };
  const r = { level: L, hand: false, rollPrices: 30 + 2 * L };
  if (L % 2 === 0) r.freeRolls = 1;
  if (L % 10 === 0) r.freeRolls = (r.freeRolls || 0) + 2;
  if (L % 5 === 0) r.backpack = 2;
  if (L % 7 === 0) r.luckPct = 3;
  if (L % 15 === 0) r.expansion = 1;
  if (L % 25 === 0) r.gear = 1;
  if (L % 20 === 0) r.freeCap = 1;
  if (L % 10 === 0) r.items = [{ tier: Math.floor(L / 5) }];
  else if (L % 4 === 0) r.items = [{ tier: Math.floor(L / 8) }];
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
  if (r.items) parts.push(`${r.items.length} item${r.items.length > 1 ? 's' : ''} (tier ${r.items.map((i) => i.tier).join(', ')})`);
  if (r.unlock) parts.push(`unlocks ${r.unlock.join(', ')}`);
  void fmt;
  return parts.join(' · ');
}

export function createRewardState() {
  return { levelClaimed: 1 };
}

export function createBonus() {
  return { backpack: 0, luck: ONE, gear: 0, freeCap: 0 };
}

const MAX_ITEMS_OVER_CAP = 40;

/** Grant one level's reward. Idempotent per level through the ledger. */
export function grantLevelReward(state, L) {
  if (L <= state.rewards.levelClaimed) return null; // already granted: never twice
  state.rewards.levelClaimed = L;
  const r = levelReward(L);
  const given = { level: L, items: [] };
  if (r.rollPrices) {
    const money = rollCost(state).mul(r.rollPrices);
    addMoney(state, money);
    given.money = money;
  }
  if (r.freeRolls) state.freeRoll.count += r.freeRolls;
  if (r.backpack) state.bonus.backpack += r.backpack;
  if (r.luckPct) state.bonus.luck = state.bonus.luck.mul(1 + r.luckPct / 100);
  if (r.gear) state.bonus.gear += r.gear;
  if (r.freeCap) state.bonus.freeCap += r.freeCap;
  if (r.expansion) grantExpansion(state);
  if (r.items) {
    const rng = new Rng(`${state.seed}|level|${L}`);
    const logLuck = luckOf(state).log10Num();
    for (const spec of r.items) {
      const data = generateItem(rng, { tier: spec.tier, level: Math.max(L, 4), logLuck, tpl: spec.tpl });
      if (state.bag.length >= backpackCapacity(state) + MAX_ITEMS_OVER_CAP) {
        // absurdly many level-ups at once: convert surplus items to money instead of hoarding
        addMoney(state, rollCost(state).mul(0.5));
        continue;
      }
      const it = addToBag(state, data, { force: true });
      given.items.push(itemTitle(it));
    }
  }
  given.text = describeReward(r);
  given.note = r.note || '';
  given.bagOver = bagFull(state);
  emit(state, 'levelReward', { level: L, text: given.text, note: given.note, items: given.items.map((t) => t) });
  return given;
}

/** Install the level-up hook on a state (not serialised). */
export function installRewardHooks(state) {
  state._onLevel = (level) => grantLevelReward(state, level);
}
