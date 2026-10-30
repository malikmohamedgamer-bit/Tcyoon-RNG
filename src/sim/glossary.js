// Tooltip and glossary lookups (data/glossary.json). Pure: returns plain objects, the UI decides how to show them.
import G from '../data/glossary.json' with { type: 'json' };
import MUT from '../data/mutations.json' with { type: 'json' };
import { tierInfo } from '../gen/tiers.js';
import { getMutation } from '../gen/mutations.js';

export const TERMS = G.terms;
export const TYPE_TERMS = G.types;

const pct = (mul) => {
  const m = typeof mul === 'number' ? mul : mul.toNumber(); // generated mutations carry Big multipliers
  return m >= 1 ? `×${Number(m.toFixed(2))}` : `×${Number(m.toFixed(2))} (a trade-off)`;
};
const STAT_NAME = { main: 'its main stat', rate: 'speed', value: 'unit value', cap: 'throughput', rcap: 'refine limit', scap: 'selling speed', luck: 'luck', dmg: 'damage', rof: 'shots per second', slow: 'slowing' };

/** Plain sentence for a mutation's effects ("Golden: ×3 its main stat"). */
export function describeMutationEffects(def) {
  return (def.effects || []).map((e) => `${pct(e.mul)} ${STAT_NAME[e.stat] || e.stat}`).join(', ');
}

/** Resolve a data-tip id to {title, text} or null. ids: a term, type:<id>, rarity:<tier>, mutation:<id>. */
export function tipFor(id) {
  if (!id) return null;
  if (id.startsWith('type:')) {
    const t = TYPE_TERMS[id.slice(5)];
    return t ? { title: t.name, text: t.short } : null;
  }
  if (id.startsWith('rarity:')) {
    const tier = Math.max(0, Math.floor(Number(id.slice(7))) || 0);
    const ti = tierInfo(tier);
    return { title: `${ti.label} (tier ${tier})`, text: `About 1 in ${ti.odds.format({ digits: 3 })} rolls at luck ×1, and worth about ×${ti.value.format({ digits: 3 })} a Common. ${TERMS.rarity.short}` };
  }
  if (id.startsWith('mutation:')) {
    const def = getMutation(id.slice(9));
    if (!def) return null;
    return { title: `${def.icon || ''} ${def.name}`.trim(), text: `${TERMS.mutation.short} Effect: ${describeMutationEffects(def) || 'a bonus'}.` };
  }
  const t = TERMS[id];
  return t ? { title: t.name, text: t.short } : null;
}

/** Everything that appears in the Help glossary (name + short + long). */
export function glossaryEntries() {
  const out = Object.entries(TERMS).filter(([, t]) => t.name).map(([id, t]) => ({ id, name: t.name, text: t.short, long: t.long }));
  for (const [id, t] of Object.entries(TYPE_TERMS)) out.push({ id: 'type:' + id, name: t.name + ' (item type)', text: t.short, long: '' });
  for (const m of MUT.mutations) out.push({ id: 'mutation:' + m.id, name: m.name + ' (mutation)', text: `Effect: ${describeMutationEffects(m)}.`, long: '' });
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Map a stat line prefix ("Rate 1.2/s") to a term id for tooltips. */
export function termForStat(label) {
  for (const [prefix, id] of Object.entries(G.statTerms)) if (label.startsWith(prefix)) return id;
  return null;
}
