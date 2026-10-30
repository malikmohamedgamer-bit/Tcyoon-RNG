// Mutation definitions (hand-written + endlessly generated) and mutation rolling.
import MUT from '../data/mutations.json' with { type: 'json' };
import { Big } from '../core/bignum.js';
import { Rng, hash32 } from '../core/rng.js';
import { mutationWord } from './names.js';

export const RULES = MUT.rules;
const HAND = new Map(MUT.mutations.map((m) => [m.id, m]));
export const HAND_MUTATIONS = MUT.mutations;

const ICONS = ['🔮', '🧬', '🪐', '⚛️', '🌀', '🔱', '🧿', '⚜️'];
const SECONDARY = ['rate', 'cap', 'range', 'rof'];

/** Generated mutation for stage n (n >= 0). Pure function of n. */
export function generatedMutation(n) {
  const r = new Rng(hash32('genmut|' + n));
  const g = RULES.generated;
  const mainLog = g.mulLog10Base + g.mulLog10PerStage * n;
  const effects = [{ stat: 'main', mul: Big.fromNumber(10).pow(Big.fromNumber(mainLog)) }];
  const stat = r.pick(SECONDARY);
  if (r.chance(0.5)) effects.push({ stat, mul: Big.fromNumber(1 + 0.25 * (1 + n * 0.1)) });
  else effects.push({ stat, mul: Big.fromNumber(0.6) }); // trade-off flavour
  return {
    id: `g:${n}`,
    name: mutationWord(n),
    icon: ICONS[n % ICONS.length],
    group: 'gen' + (n % 4),
    generated: true,
    stage: n,
    effects,
  };
}

/** Look up a mutation by id ('shiny', 'g:12', ...). Unknown ids return null. */
export function getMutation(id) {
  if (HAND.has(id)) return normalize(HAND.get(id));
  if (typeof id === 'string' && id.startsWith('g:')) {
    const n = Number(id.slice(2));
    if (Number.isInteger(n) && n >= 0) return generatedMutation(n);
  }
  return null;
}

const normCache = new Map();
function normalize(def) {
  let d = normCache.get(def.id);
  if (!d) {
    d = { ...def, effects: def.effects.map((e) => ({ stat: e.stat, mul: Big.from(e.mul) })) };
    normCache.set(def.id, d);
  }
  return d;
}

/** Max mutations on an item of this tier. */
export const mutationSlots = (tier) => RULES.baseMax + Math.floor(Math.max(0, tier) / RULES.tiersPerExtraSlot);

/** Mutation chance multiplier from luck (log10 luck given as a number). */
export function luckChanceFactor(logLuck) {
  return Math.min(RULES.luckChanceCap, 1 + RULES.luckChanceBonus * Math.max(0, logLuck));
}

function applicable(def, type) {
  return !def.applies || def.applies.includes(type);
}

/**
 * Roll mutations for a new item. Returns [[id, level], ...].
 * Each eligible mutation is tried independently with p = min(ceiling, chance * luckFactor);
 * one mutation per exclusive group; capped by the tier's slot count. Then one chance
 * at a generated mutation whose stage grows with tier.
 */
export function rollMutations(rng, { tier, type, logLuck = 0, boost = 1 }) {
  const slots = mutationSlots(tier);
  const f = luckChanceFactor(logLuck) * boost;
  const out = [];
  const groups = new Set();
  const cands = HAND_MUTATIONS.filter((m) => m.chance > 0 && (m.minTier || 0) <= tier && applicable(m, type));
  rng.shuffle(cands);
  for (const m of cands) {
    if (out.length >= slots) break;
    if (groups.has(m.group)) continue;
    if (rng.chance(Math.min(RULES.chanceCeiling, m.chance * f))) {
      out.push([m.id, 1]);
      groups.add(m.group);
    }
  }
  const g = RULES.generated;
  if (out.length < slots && rng.chance(Math.min(RULES.chanceCeiling, (g.baseChance + 0.002 * tier) * f))) {
    const stage = Math.floor((tier * g.perTier) / 1) + rng.int(g.stageSpread);
    out.push([`g:${Math.min(stage, 1e9)}`, 1]);
  }
  return out;
}
