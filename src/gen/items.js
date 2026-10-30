// Item generation: template choice, variants, hybrids and the full roll of one item.
import { TYPES, ITEM_TEMPLATES, WEAPON_TEMPLATES, HYBRID_TYPES, HYBRID_BASE } from '../sim/items.js';
import { rollMutations } from './mutations.js';

export const WEAPON_CHANCE = 0.09;
export const WEAPON_MIN_LEVEL = 4;
export const HYBRID_CHANCE = 0.06;

/** Pick a template given the player's level (turrets and weapons unlock at level 4). */
export function pickTemplate(rng, level) {
  if (level >= WEAPON_MIN_LEVEL && rng.chance(WEAPON_CHANCE)) {
    return WEAPON_TEMPLATES[rng.weighted(WEAPON_TEMPLATES.map((t) => t.weight))];
  }
  const types = Object.entries(TYPES).filter(([k, t]) => t.weight > 0 && (t.minLevel || 0) <= level && k !== 'weapon');
  const [typeId] = types[rng.weighted(types.map(([, t]) => t.weight))];
  const list = ITEM_TEMPLATES.filter((t) => t.type === typeId);
  return list[rng.weighted(list.map((t) => t.weight))];
}

/** Variant seed: 0 means "plain". Non-zero seeds jitter stats and give the item a name. */
export function rollVariant(rng, tier) {
  const p = Math.min(0.5, 0.15 + tier * 0.02);
  return rng.chance(p) ? 1 + rng.int(0x7ffffffe) : 0;
}

export function rollHybrid(rng, tpl) {
  if (!HYBRID_TYPES.includes(tpl.type) || !rng.chance(HYBRID_CHANCE)) return null;
  const options = Object.keys(HYBRID_BASE).filter((k) => !(k in tpl.base) && !(k === 'sell' && tpl.type === 'seller'));
  return options.length ? rng.pick(options) : null;
}

/**
 * Generate one item (without a uid/location; inventory assigns those).
 * @param {Rng} rng
 * @param {{tier:number, level:number, logLuck?:number, mutationBoost?:number, tpl?:string}} o
 */
export function generateItem(rng, { tier, level, logLuck = 0, mutationBoost = 1, tpl: forced }) {
  const tpl = forced ? [...ITEM_TEMPLATES, ...WEAPON_TEMPLATES].find((t) => t.id === forced) : pickTemplate(rng, level);
  const vs = rollVariant(rng, tier);
  const hy = rollHybrid(rng, tpl);
  const mut = rollMutations(rng, { tier, type: tpl.type, logLuck, boost: mutationBoost });
  return { tpl: tpl.id, tier, vs, hy, mut };
}

