// Applying mutations to items: effect aggregation, stacking rules, combining.
import { ONE } from '../core/bignum.js';
import { getMutation, RULES, mutationSlots } from '../gen/mutations.js';

/**
 * Multiplier per stat from an item's mutations.
 * Stacking: different mutations multiply together; a mutation at level L applies its
 * effects raised to the power L. 'main' is resolved by the caller (type -> main stat).
 */
export function mutationMultipliers(muts) {
  const out = {};
  for (const [id, lv] of muts || []) {
    const def = getMutation(id);
    if (!def) continue;
    for (const e of def.effects) {
      const f = lv === 1 ? e.mul : e.mul.pow(lv);
      out[e.stat] = (out[e.stat] || ONE).mul(f);
    }
  }
  return out;
}

export const hasMutation = (item, id) => (item.mut || []).some((m) => m[0] === id);

/** Can mutation `id` be added to this item (applicable, group free, slot free)? */
export function canAddMutation(item, type, id) {
  const def = getMutation(id);
  if (!def) return { ok: false, reason: 'unknown mutation' };
  if (def.applies && !def.applies.includes(type)) return { ok: false, reason: 'does not apply to this item type' };
  const muts = item.mut || [];
  if (muts.some((m) => m[0] === id)) return { ok: false, reason: 'already has it (combine instead)' };
  if (muts.some((m) => getMutation(m[0])?.group === def.group)) return { ok: false, reason: 'exclusive group taken' };
  if (muts.length >= mutationSlots(item.tier)) return { ok: false, reason: 'no free mutation slot' };
  return { ok: true };
}

/** Add a mutation in place (after canAddMutation). */
export function addMutation(item, id, level = 1) {
  item.mut = [...(item.mut || []), [id, Math.min(RULES.maxLevel, level)]];
}

export function removeMutation(item, id) {
  item.mut = (item.mut || []).filter((m) => m[0] !== id);
}

export const mutationLabel = (m) => {
  const def = getMutation(m[0]);
  if (!def) return m[0];
  return m[1] > 1 ? `${def.name} ${m[1]}` : def.name; // the icon is drawn by the UI (ui/icons.js)
};

/** Sum of mutation levels (used for sell value bonuses). */
export const mutationCount = (item) => (item.mut || []).reduce((s, m) => s + m[1], 0);

