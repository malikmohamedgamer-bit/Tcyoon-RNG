// Prestige layer definitions. Layers 0..2 come from data/rebirth.json; every layer
// k >= 3 is generated here by the same rules, endlessly: its own name, currency, effect
// kind, threshold, multiplier curve, tree, rule and (through region) theme.
import REB from '../data/rebirth.json' with { type: 'json' };
import { Big } from '../core/bignum.js';
import { Rng, hash32 } from '../core/rng.js';
import { layerName, word } from './names.js';
import { romanize } from './themes.js';

const G = REB.gen;
const cache = new Map();
export const EFFECT_KINDS = ['income', 'luck', 'xp', 'rollCost', 'startMoney', 'startSide', 'startTier', 'freeCap', 'freeInterval', 'backpack', 'dmg', 'baseHp', 'dropRate', 'sellMult'];
export const HAND_LAYER_COUNT = REB.layers.length;

function normNode(n, k) {
  return {
    id: n.id,
    name: n.name,
    icon: n.icon || '✦',
    cost: Big.from(n.cost),
    growth: n.growth,
    max: n.max || 0,
    kind: n.kind,
    per: n.per,
    layer: k,
    requires: n.requires || [],
  };
}

function generateTree(k) {
  const scale = Big.fromNumber(G.treeCostLayerGrowth).pow(k); // Big: 3^k overflows doubles past k ~ 640
  const perScale = 1 + 0.2 * k;
  return REB.treeArchetypes.map((a) => {
    const mulKind = !['startMoney', 'startSide', 'startTier', 'freeCap', 'backpack'].includes(a.kind);
    return normNode(
      {
        id: `L${k}-${a.id}`,
        name: k === 0 ? a.name : `${a.name} ${romanize(k + 1)}`,
        icon: a.icon,
        cost: scale.mul(a.cost),
        growth: a.growth,
        max: a.max,
        kind: a.kind,
        per: mulKind && a.kind !== 'rollCost' && a.kind !== 'freeInterval' ? a.per * perScale : a.kind === 'startMoney' ? Big.fromNumber(a.per).mul(Big.fromNumber(10).pow(k)) : a.per,
      },
      k,
    );
  });
}

/** Definition of prestige layer k (k >= 0). Pure and cached. */
export function layerDef(k) {
  k = Math.max(0, Math.floor(Number(k) || 0));
  if (cache.has(k)) return cache.get(k);
  const hand = REB.layers.find((l) => l.k === k);
  const r = new Rng(hash32('layerdef|' + k));
  const name = hand ? hand.name : layerName(k);
  const def = {
    k,
    name,
    currency: hand ? hand.currency : { name: `${word('cur' + k, 2)} ${r.pick(G.currencyNouns)}`, icon: ['💠', '🔶', '🌀', '🧿', '🪙', '☄️'][k % 6] },
    kind: hand ? hand.kind : G.effectKinds[k % G.effectKinds.length],
    a: hand ? hand.a : Math.max(0.05, G.multiplier.a0 * Math.pow(G.multiplier.aDecay, k)),
    b: hand ? hand.b : G.multiplier.b,
    threshold: hand ? Big.from(hand.threshold) : Big.fromNumber(G.threshold.base).mul(Big.fromNumber(G.threshold.growth).pow(k - 1)),
    exponent: hand ? hand.exponent : G.exponent,
    rule: hand
      ? { ...hand.rule, per: hand.rule.kind === 'startMoney' ? Big.from(hand.rule.per) : hand.rule.per }
      : (() => {
          const kind = ['startMoney', 'luck', 'income', 'xp', 'dropRate'][k % 5];
          const per = kind === 'startMoney' ? Big.fromNumber(250).mul(Big.fromNumber(10).pow(k)) : G.ruleBonusPerPrestige;
          return { kind, per, text: kind === 'startMoney' ? `+$${per.format()} starting money per prestige` : `+${Math.round(per * 100)}% ${kind} per prestige` };
        })(),
    tree: generateTree(k),
  };
  cache.set(k, def);
  return def;
}

/** Gain of layer k for requirement resource R: floor((R / threshold)^exponent), 0 below the threshold. */
export function layerGainFor(def, R) {
  R = Big.from(R);
  if (R.lt(def.threshold)) return Big.fromNumber(0);
  return R.div(def.threshold).pow(def.exponent).floor();
}

/** Permanent multiplier from lifetime currency: 1 + a * total^b (soft power curve, diminishing returns). */
export function currencyMultiplier(def, total) {
  total = Big.from(total);
  if (total.isZero()) return Big.fromNumber(1);
  return Big.fromNumber(1).add(total.pow(def.b).mul(def.a));
}

/** Cross-layer boost: layer k+1 currency multiplies layer k gains by 1 + a*total^b. */
export function lowerLayerBoost(totalAbove) {
  totalAbove = Big.from(totalAbove);
  if (totalAbove.isZero()) return Big.fromNumber(1);
  return Big.fromNumber(1).add(totalAbove.pow(G.lowerLayerBoost.b).mul(G.lowerLayerBoost.a));
}

export const nodeCost = (node, level) => node.cost.mul(Big.fromNumber(node.growth).pow(level));

export const GEN = G;
