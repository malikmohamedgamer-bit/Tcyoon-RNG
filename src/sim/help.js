// Help content: articles from data/help.json with generated blocks (rarity table, rebirth example, formulas)
// so every number shown matches the real data and formulas. Pure; search is a plain word match.
import HELP from '../data/help.json' with { type: 'json' };
import ECON from '../data/economy.json' with { type: 'json' };
import { tierInfo, PITY } from '../gen/tiers.js';
import { Big } from '../core/bignum.js';
import { layerDef, layerGainFor, currencyMultiplier } from '../gen/layers.js';
import { glossaryEntries } from './glossary.js';
import { rollCostAtLevel } from './economy.js';
import { createState } from './state.js';

const f = (b, d = 3) => Big.from(b).format({ digits: d });

function rarityRows(count = 12) {
  const rows = [];
  for (let t = 1; t <= count; t++) {
    const ti = tierInfo(t);
    rows.push({ icon: ti.icon, name: ti.name, odds: `1 in ${f(ti.odds)}`, value: `×${f(ti.value)}` });
  }
  return rows;
}

function prestigeExample() {
  const def = layerDef(0);
  const runMoney = Big.fromNumber(4_000_000);
  const gain = layerGainFor(def, runMoney);
  const mult = currencyMultiplier(def, gain);
  const next = layerGainFor(def, Big.fromNumber(16_000_000));
  return [
    `Layer 1 is called ${def.name} and needs ${f(def.threshold, 0)} money earned in one run.`,
    `Example: you finish a run with $${f(runMoney, 0)}. You earn floor(($${f(runMoney, 0)} ÷ $${f(def.threshold, 0)}) ^ ${def.exponent}) = ${f(gain, 0)} ${def.currency.name}.`,
    `Those give a permanent income bonus of 1 + ${def.a} × ${f(gain, 0)} ^ ${def.b} = ×${f(mult)} to everything, forever, even after the next rebirth.`,
    `Earning four times as much in a run ($${f(16_000_000, 0)}) would give ${f(next, 0)} — only twice as many, because the gain grows with the square root. That is why waiting a bit longer helps, but not forever.`,
  ];
}

function formulas() {
  const s = createState(1, 0);
  const c = ECON;
  return [
    `Roll price at level L: ${c.roll.baseCost} × (1 + (L − 1) ÷ ${c.roll.levelDivisor})³. At level 1 it is $${f(rollCostAtLevel(s, 1), 0)}, at level 10 it is $${f(rollCostAtLevel(s, 10), 0)}.`,
    `Luck: 1 + ${c.luck.perLevel} for every level above 1, multiplied by upgrades, boosters, clover shrines and prestige bonuses.`,
    `Chance of a tier: your luck divided by that tier's odds (capped at 100%). Pity: ${PITY.map((p) => `after ${p.every} rolls you get at least a 1-in-${p.x} result`).join('; ')}.`,
    `XP for the next level: ${c.xp.base} × ${c.xp.growth}^(L − 1) × (1 + L ÷ ${c.xp.levelLinear}). Every level costs ${Math.round((c.xp.growth - 1) * 100)}% more than the one before, plus a little.`,
    `Sell value: at most ${Math.round(c.sell.maxFraction * 100)}% of the roll price at the level the item was found; ${Math.round(c.sell.perTier * 100)}% per tier and ${Math.round(c.sell.perMutation * 100)}% per mutation up to that cap.`,
    `Fuse chance: ${Math.round(c.fuse.baseChance * 100)}% for ${c.fuse.min} items, +${Math.round(c.fuse.perExtra * 100)}% for each extra item, +${Math.round(c.fuse.identicalBonus * 100)}% if they are all the same item, up to ${Math.round(c.fuse.maxChance * 100)}%.`,
    'Income: for each dropper, units per second × value per unit, then the cap, add, refine and multiply steps of every item on its line, then the seller bonus, then your income multipliers. Click the Income number to see your own.',
    'Backpack space: 20 slots, plus more with every backpack upgrade, plus rewards.',
    'Wave strength grows without limit; a build with items of tier t usually beats waves up to about 3t.'
  ];
}

export function articles() {
  return HELP.articles.map((a) => {
    const out = { id: a.id, title: a.title, keywords: a.keywords || '', paras: [...a.paras] };
    if (a.block === 'rarityTable') out.table = { head: ['Rarity', 'Odds at luck ×1', 'Worth'], rows: rarityRows().map((r) => [r.name, r.odds, r.value]) };
    if (a.block === 'prestigeExample') out.paras.push(...prestigeExample());
    if (a.block === 'formulas') out.paras.push(...formulas());
    return out;
  });
}

const norm = (s) => String(s).toLowerCase();
const words = (q) => norm(q).split(/[^a-z0-9×+]+/).filter(Boolean);

/** All searchable entries: articles and glossary terms. */
export function helpIndex() {
  const arts = articles().map((a) => ({ kind: 'article', id: a.id, title: a.title, text: [a.title, a.keywords, ...a.paras, ...(a.table ? a.table.rows.flat() : [])].join(' ') }));
  const terms = glossaryEntries().map((g) => ({ kind: 'term', id: g.id, title: g.name, text: [g.name, g.text, g.long].join(' ') }));
  return [...arts, ...terms];
}

/** Entries matching every word of the query (empty query = everything). */
export function searchHelp(q, index = helpIndex()) {
  const ws = words(q);
  if (!ws.length) return index;
  return index.filter((e) => ws.every((w) => norm(e.text).includes(w)));
}
