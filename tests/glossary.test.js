import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { tipFor, glossaryEntries, termForStat, TERMS, TYPE_TERMS } from '../src/sim/glossary.js';
import { statParts, TYPES, ITEM_TEMPLATES, WEAPON_TEMPLATES } from '../src/sim/items.js';
import { generateItem } from '../src/gen/items.js';
import { Rng } from '../src/core/rng.js';
import MUT from '../src/data/mutations.json' with { type: 'json' };
import { articles, searchHelp, helpIndex } from '../src/sim/help.js';
import { layerGainFor, layerDef } from '../src/gen/layers.js';
import { big } from '../src/core/bignum.js';

test('every static data-tip / term() id used by the UI resolves to a tooltip', () => {
  const dir = new URL('../src/ui/', import.meta.url);
  const ids = new Set();
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.js') && n !== 'dom.js' && n !== 'tooltips.js')) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    for (const m of src.matchAll(/data-tip=\\?"([a-zA-Z:]+)\\?"/g)) ids.add(m[1]);
    for (const m of src.matchAll(/term\('([a-zA-Z:]+)'/g)) ids.add(m[1]);
  }
  assert.ok(ids.size >= 8, [...ids].join());
  for (const id of ids) if (!id.endsWith(':')) assert.ok(tipFor(id), `no tooltip for ${id}`);
});

test('every item type, every mutation, the first rarity tiers and endless tiers have a tooltip', () => {
  for (const t of Object.keys(TYPES)) assert.ok(tipFor('type:' + t), t);
  for (const id of Object.keys(TYPE_TERMS)) assert.ok(TYPE_TERMS[id].short);
  for (const m of MUT.mutations) assert.ok(tipFor('mutation:' + m.id).text.includes('Effect'), m.id);
  for (const t of [0, 1, 5, 12, 40, 1000, 1e9]) {
    const tip = tipFor('rarity:' + t);
    assert.ok(tip && tip.text.length > 20 && !/NaN|Infinity/.test(tip.text), String(t));
  }
  assert.ok(tipFor('mutation:g:7'), 'generated mutations too');
  assert.equal(tipFor('nonsense'), null);
});

test('every stat shown on any item card is explained (all templates, many tiers, with mutations and hybrids)', () => {
  const rng = new Rng(5);
  const fmt = (b) => b.format();
  for (const tpl of [...ITEM_TEMPLATES, ...WEAPON_TEMPLATES]) {
    for (const tier of [0, 3, 9, 40]) {
      const data = generateItem(rng, { tier, level: 30, logLuck: 2, tpl: tpl.id });
      for (const p of statParts({ uid: 1, loc: 'bag', lv: 1, ...data }, fmt)) assert.ok(tipFor(p.tip), `${tpl.id}: ${p.tip}`);
    }
  }
  assert.equal(termForStat('Rate 2/s'), 'rate');
});

test('glossary entries are readable: unique names, one-sentence short text, no placeholders', () => {
  const seen = new Set();
  for (const g of glossaryEntries()) {
    assert.ok(g.name && g.text.length > 8, g.id);
    assert.ok(!seen.has(g.id));
    seen.add(g.id);
    assert.ok(!/TODO|undefined|\{\{/.test(g.text + g.long), g.id);
  }
  for (const t of Object.values(TERMS)) assert.ok(t.short.length < 200);
});

test('help: articles have text, search finds by word and by keyword, multi-word is AND, empty returns everything', () => {
  const arts = articles();
  assert.ok(arts.length >= 10);
  for (const a of arts) assert.ok(a.paras.length > 0, a.id);
  const idx = helpIndex();
  assert.equal(searchHelp('', idx).length, idx.length);
  assert.ok(searchHelp('luck', idx).some((e) => e.id === 'rolling'));
  assert.ok(searchHelp('pity guaranteed', idx).some((e) => e.id === 'rolling'));
  assert.deepEqual(searchHelp('zzzzqq', idx), []);
  assert.ok(searchHelp('mutation', idx).some((e) => e.kind === 'term'));
});

test('help: the rebirth example and the rarity table are computed from the real formulas and data', () => {
  const a = articles();
  const ex = a.find((x) => x.id === 'rebirth').paras.join(' ');
  const gain = layerGainFor(layerDef(0), big(4_000_000)).toNumber();
  assert.match(ex, new RegExp(`= ${gain} Rebirth Points`));
  const t = a.find((x) => x.id === 'rolling').table;
  assert.equal(t.rows.length, 12);
  assert.match(t.rows[0][1], /^1 in /);
  const f = a.find((x) => x.id === 'formulas').paras.join(' ');
  assert.match(f, /\$10/);
});
