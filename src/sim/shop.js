// Stores: upgrade shop (roll / gear / luck categories), timed boosters, backpack tiers and the
// rotating daily shop (seeded by date). Every purchase checks the balance first (trySpend),
// so money can never go negative.
//
// Price formulas (README "Formulas"):
//   upgrade   = baseK * rollCost(level) * growth^currentLevel
//   booster   = priceRolls * rollCost
//   backpack  = 400 * 3.2^tier                (economy.js)
//   rotating item = 0.8 * rollCost * odds(tier) / luck   (80% of the expected cost of rolling that tier)
import SHOP from '../data/shop.json' with { type: 'json' };
import { Big } from '../core/bignum.js';
import { Rng, rngFrom } from '../core/rng.js';
import { emit } from '../core/events.js';
import { rollCost, trySpend, luckOf, backpackCost } from './economy.js';
import { refreshProduction } from './production.js';
import { oddsOf, tierInfo } from '../gen/tiers.js';
import { typicalTier } from './rolling.js';
import { generateItem } from '../gen/items.js';
import { addToBag } from './inventory.js';
import { itemTitle } from './items.js';
import { dateKey } from '../core/time.js';

export const UPGRADES = SHOP.upgrades;
export const BOOSTERS = SHOP.boosters;
export const ROTATING = SHOP.rotating;

export const upgradeLevel = (state, id) => (state.upgrades && state.upgrades[id]) || 0;

export function upgradeCost(state, up) {
  return rollCost(state).mul(up.baseK).mul(Big.fromNumber(up.growth).pow(upgradeLevel(state, up.id)));
}

export function buyUpgrade(state, id, { discount = 1 } = {}) {
  const up = UPGRADES.find((u) => u.id === id);
  if (!up) return { ok: false, reason: 'Unknown upgrade' };
  const lv = upgradeLevel(state, id);
  if (up.max > 0 && lv >= up.max) return { ok: false, reason: 'Already at max level' };
  const cost = upgradeCost(state, up).mul(discount);
  if (!trySpend(state, cost)) return { ok: false, reason: 'Not enough money', cost };
  state.upgrades[id] = lv + 1;
  state.stats.bought = (state.stats.bought || 0) + 1;
  refreshProduction(state);
  emit(state, 'bought', { id, level: lv + 1 });
  return { ok: true, level: lv + 1, cost };
}

// ------------------------------------------------------------------ boosters
export const boosterCost = (state, b) => rollCost(state).mul(b.priceRolls);

export function buyBooster(state, id) {
  const b = BOOSTERS.find((x) => x.id === id);
  if (!b) return { ok: false, reason: 'Unknown booster' };
  const cost = boosterCost(state, b);
  if (!trySpend(state, cost)) return { ok: false, reason: 'Not enough money', cost };
  addBooster(state, b);
  state.stats.bought = (state.stats.bought || 0) + 1;
  return { ok: true, cost };
}

function addBooster(state, b) {
  const cur = state.boosts.find((x) => x.id === b.id);
  if (cur) cur.left += b.seconds; // same booster: extends the duration, never stacks the multiplier
  else state.boosts.push({ id: b.id, left: b.seconds });
  refreshProduction(state);
}

/** Tick boosters down by dt seconds (also used by offline progress with the full elapsed time). */
export function stepBoosters(state, dt) {
  if (!state.boosts.length) return false;
  let changed = false;
  for (const b of state.boosts) b.left -= dt;
  const before = state.boosts.length;
  state.boosts = state.boosts.filter((b) => b.left > 0);
  if (state.boosts.length !== before) changed = true;
  if (changed) refreshProduction(state);
  return changed;
}

// ------------------------------------------------------------------ modifiers
/** Adds shop upgrades and active boosters into the modifiers `m` (installed as a mod hook). */
export function applyShopMods(state, m) {
  m.autoIntervalMult = 1;
  m.pityMult = 1;
  for (const up of UPGRADES) {
    const lv = upgradeLevel(state, up.id);
    if (!lv) continue;
    const f = Big.fromNumber(1 + up.per).pow(lv);
    switch (up.kind) {
      case 'rate': m.rate = m.rate.mul(f); break;
      case 'value': m.value = m.value.mul(f); break;
      case 'sell': m.sellMult = m.sellMult.mul(f); break;
      case 'income': m.income = m.income.mul(f); break;
      case 'dmg': m.dmg = m.dmg.mul(f); break;
      case 'baseHp': m.baseHp = m.baseHp.mul(f); break;
      case 'luck': m.luck = m.luck.mul(f); break;
      case 'freeInterval': m.freeIntervalMult *= Math.max(0.1, Math.pow(1 - up.per, lv)); break;
      case 'autoInterval': m.autoIntervalMult *= Math.max(0.1, Math.pow(1 - up.per, lv)); break;
      case 'pity': m.pityMult *= Math.max(0.1, Math.pow(1 - up.per, lv)); break;
      case 'freeCap': m.freeCap += up.per * lv; break;
      case 'backpack': m.backpackBonus += up.per * lv; break;
      case 'gear': m.gearSlots += up.per * lv; break;
      default:
    }
  }
  for (const b of state.boosts) {
    const def = BOOSTERS.find((x) => x.id === b.id);
    if (!def || b.left <= 0) continue;
    if (def.kind === 'luck') m.luck = m.luck.mul(def.mult);
    else if (def.kind === 'xp') m.xp = m.xp.mul(def.mult);
    else if (def.kind === 'income') m.income = m.income.mul(def.mult);
  }
}

// ------------------------------------------------------------------ backpack tiers
export function buyBackpackTier(state) {
  const cost = backpackCost(state);
  if (!trySpend(state, cost)) return { ok: false, reason: 'Not enough money', cost };
  state.backpackTier += 1;
  state.stats.bought = (state.stats.bought || 0) + 1;
  return { ok: true, cost, tier: state.backpackTier };
}

// ------------------------------------------------------------------ rotating shop
/**
 * The daily rotating shop: deterministic from (world seed, date key). 3 items, 2 boosters, 1 upgrade level
 * at half price. Each offer can be bought once per day (ledger state.shop.rot[dateKey]).
 */
export function rotatingOffers(state, nowMs) {
  const key = dateKey(nowMs);
  const rng = rngFrom(state.seed, 'rotating', key);
  const luck = luckOf(state);
  const base = typicalTier(luck);
  const offers = [];
  for (let i = 0; i < 3; i++) {
    const tier = base + 1 + rng.int(3);
    const price = rollCost(state).mul(0.8).mul(oddsOf(tier)).div(luck);
    offers.push({ idx: offers.length, kind: 'item', tier, seed: rng.u32(), price, label: `${tierInfo(tier).label} item` });
  }
  for (let i = 0; i < 2; i++) {
    const b = rng.pick(BOOSTERS);
    offers.push({ idx: offers.length, kind: 'booster', id: b.id, price: rollCost(state).mul(b.priceRolls * 0.5), label: `${b.name} (half price)` });
  }
  const up = rng.pick(UPGRADES);
  offers.push({ idx: offers.length, kind: 'upgrade', id: up.id, price: upgradeCost(state, up).mul(ROTATING.upgradePriceFactor), label: `${up.name} +1 level (half price)` });
  return { key, offers };
}

export const rotatingBought = (state, key, idx) => !!(state.shop.rot[key] && state.shop.rot[key].includes(idx));

export function buyRotating(state, idx, nowMs) {
  const { key, offers } = rotatingOffers(state, nowMs);
  const o = offers[idx];
  if (!o) return { ok: false, reason: 'No such offer' };
  if (rotatingBought(state, key, idx)) return { ok: false, reason: 'Already bought today' };
  if (!trySpend(state, o.price)) return { ok: false, reason: 'Not enough money', cost: o.price };
  (state.shop.rot[key] ||= []).push(idx);
  // keep only the last few days of ledger
  for (const k of Object.keys(state.shop.rot).sort().slice(0, -4)) delete state.shop.rot[k];
  let given = null;
  if (o.kind === 'item') {
    const rng = new Rng(o.seed);
    const data = generateItem(rng, { tier: o.tier, level: Math.max(state.level, 4), logLuck: luckOf(state).log10Num() });
    const it = addToBag(state, data, { force: true });
    given = itemTitle(it);
  } else if (o.kind === 'booster') {
    addBooster(state, BOOSTERS.find((b) => b.id === o.id));
    given = o.label;
  } else {
    state.upgrades[o.id] = upgradeLevel(state, o.id) + 1;
    refreshProduction(state);
    given = o.label;
  }
  state.stats.bought = (state.stats.bought || 0) + 1;
  return { ok: true, given, cost: o.price };
}

