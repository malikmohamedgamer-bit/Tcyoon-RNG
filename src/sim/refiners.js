// Mutation refinery: re-roll, transfer and combine mutations (money sinks).
import REF from '../data/refiners.json' with { type: 'json' };
import { emit } from '../core/events.js';
import { rollMutations, RULES } from '../gen/mutations.js';
import { templateOf, itemTitle } from './items.js';
import { rollCost, luckOf, trySpend, modifiers } from './economy.js';
import { canAddMutation, addMutation, removeMutation, mutationCount } from './mutations.js';
import { refreshProduction } from './production.js';

export const REFINER_OPS = REF.ops;

export function refineCost(state, op, item) {
  return rollCost(state)
    .mul(REF.ops[op].costMult)
    .mul(1 + 0.5 * mutationCount(item))
    .mul(modifiers(state).refineCostMult || 1);
}

const usable = (it) => it && (it.loc === 'bag' || it.loc === 'placed');

export function reroll(state, uid, rng = state.rng) {
  const it = state.items[uid];
  if (!usable(it)) return { ok: false, reason: 'Item not available' };
  const cost = refineCost(state, 'reroll', it);
  if (!trySpend(state, cost)) return { ok: false, reason: 'Not enough money', cost };
  const logLuck = luckOf(state).log10Num();
  it.mut = rollMutations(rng, { tier: it.tier, type: templateOf(it).type, logLuck, boost: REF.ops.reroll.luckBoost });
  refreshProduction(state);
  state.stats.refined = (state.stats.refined || 0) + 1;
  emit(state, 'refine', { op: 'reroll', title: itemTitle(it) });
  return { ok: true, mut: it.mut, cost };
}

export function transfer(state, fromUid, toUid, mutId) {
  const a = state.items[fromUid];
  const b = state.items[toUid];
  if (!usable(a) || !usable(b) || a === b) return { ok: false, reason: 'Pick two different items' };
  const m = (a.mut || []).find((x) => x[0] === mutId);
  if (!m) return { ok: false, reason: 'Donor does not have that mutation' };
  const chk = canAddMutation(b, templateOf(b).type, mutId);
  if (!chk.ok) return { ok: false, reason: chk.reason };
  const cost = refineCost(state, 'transfer', b);
  if (!trySpend(state, cost)) return { ok: false, reason: 'Not enough money', cost };
  removeMutation(a, mutId);
  addMutation(b, mutId, m[1]);
  refreshProduction(state);
  state.stats.refined = (state.stats.refined || 0) + 1;
  emit(state, 'refine', { op: 'transfer', title: itemTitle(b) });
  return { ok: true, cost };
}

/** Success chance for raising a mutation that is currently at `level`. */
export const combineChance = (level) => {
  const c = REF.ops.combine;
  return Math.max(c.chanceMin, c.chanceBase - c.chancePerLevel * (level - 1));
};

export function combine(state, targetUid, donorUid, mutId, rng = state.rng) {
  const t = state.items[targetUid];
  const d = state.items[donorUid];
  if (!usable(t) || !usable(d) || t === d) return { ok: false, reason: 'Pick two different items' };
  const tm = (t.mut || []).find((x) => x[0] === mutId);
  const dm = (d.mut || []).find((x) => x[0] === mutId);
  if (!tm || !dm) return { ok: false, reason: 'Both items need that mutation' };
  if (tm[1] >= RULES.maxLevel) return { ok: false, reason: 'Already at the maximum level' };
  const cost = refineCost(state, 'combine', t);
  if (!trySpend(state, cost)) return { ok: false, reason: 'Not enough money', cost };
  const chance = combineChance(tm[1]);
  const success = rng.chance(chance);
  removeMutation(d, mutId);
  if (success) tm[1] += 1;
  refreshProduction(state);
  state.stats.refined = (state.stats.refined || 0) + 1;
  emit(state, 'refine', { op: 'combine', success, title: itemTitle(t) });
  return { ok: true, success, chance, cost };
}
