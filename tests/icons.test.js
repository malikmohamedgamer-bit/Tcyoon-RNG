import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { ico, hasIcon, ICON_IDS } from '../src/ui/icons.js';
import ITEMS from '../src/data/items.json' with { type: 'json' };
import WEAPONS from '../src/data/weapons.json' with { type: 'json' };
import MUT from '../src/data/mutations.json' with { type: 'json' };
import SHOP from '../src/data/shop.json' with { type: 'json' };
import REBIRTH from '../src/data/rebirth.json' with { type: 'json' };
import TIERS from '../src/data/tiers.json' with { type: 'json' };
import ENEMIES from '../src/data/enemies.json' with { type: 'json' };
import THEMES from '../src/data/themes.json' with { type: 'json' };
import { tierInfo } from '../src/gen/tiers.js';
import { getMutation } from '../src/gen/mutations.js';
import { bossDef } from '../src/gen/bosses.js';
import { layerDef } from '../src/gen/layers.js';
import { itemIcon } from '../src/sim/items.js';

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2B06}\u{2B07}]/u;

test('every icon named anywhere in the data resolves to a drawn SVG (no raw emoji ever reaches the page)', () => {
  const names = [];
  for (const t of [...ITEMS.templates, ...WEAPONS.templates]) names.push(['template ' + t.id, t.shape], ['template icon ' + t.id, t.icon]);
  for (const [id, t] of Object.entries(ITEMS.types)) names.push(['type ' + id, t.icon]);
  for (const m of MUT.mutations) names.push(['mutation ' + m.id, m.icon]);
  for (const u of SHOP.upgrades) names.push(['upgrade ' + u.id, u.icon]);
  for (const b of SHOP.boosters) names.push(['booster ' + b.id, b.icon]);
  for (const l of REBIRTH.layers) names.push(['layer ' + l.k, l.currency.icon]);
  for (const a of REBIRTH.treeArchetypes) names.push(['archetype ' + a.id, a.icon]);
  for (const t of TIERS.tiers) names.push(['tier ' + t.name, t.icon]);
  for (const i of TIERS.generated.icons) names.push(['generated tier icon', i]);
  for (const e of ENEMIES.templates) names.push(['enemy ' + e.id, e.icon]);
  for (const t of THEMES.themes) names.push(['theme ' + t.id, t.icon]);
  let checked = 0;
  for (const [what, id] of names) {
    if (!id) continue;
    checked++;
    assert.ok(hasIcon(id), `${what}: no icon for ${JSON.stringify(id)}`);
    assert.ok(!EMOJI.test(ico(id)), `${what}: emoji leaked into the markup`);
    assert.match(ico(id), /^<svg /);
  }
  assert.ok(checked > 100, String(checked));
});

test('endlessly generated content has icons too: tiers, mutations, bosses, layers, item templates', () => {
  for (const t of [0, 5, 11, 12, 13, 40, 999, 1e9]) assert.ok(hasIcon(tierInfo(t).icon), `tier ${t}`);
  for (let n = 0; n < 60; n++) {
    assert.ok(hasIcon(getMutation('g:' + n).icon), `mutation g:${n}`);
    assert.ok(hasIcon(bossDef(n).icon), `boss ${n}`);
  }
  for (let k = 0; k < 40; k++) assert.ok(hasIcon(layerDef(k).currency.icon), `layer ${k} currency`);
  for (const t of [...ITEMS.templates, ...WEAPONS.templates]) assert.ok(hasIcon(itemIcon({ tpl: t.id })), t.id);
});

test('unknown symbols fall back to a drawn spark, never to raw text; labelled icons are images', () => {
  const s = ico('🦄');
  assert.match(s, /ico-sparkle/);
  assert.ok(!EMOJI.test(s));
  assert.match(ico('coin', { label: 'Money' }), /role="img" aria-label="Money"/);
  assert.match(ico('coin'), /aria-hidden="true"/);
  assert.ok(ICON_IDS.length >= 80);
});

test('UI source code does not contain emoji (icons are drawn, labels are words)', () => {
  const dir = new URL('../src/ui/', import.meta.url);
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.js') && n !== 'icons.js')) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    assert.ok(!EMOJI.test(src), `${f} contains an emoji/dingbat`);
  }
});
