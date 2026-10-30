import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game.js';
import { MemoryStorage } from '../src/core/save.js';
import { createState, serializeState, deserializeState } from '../src/sim/state.js';
import { drain } from '../src/core/events.js';
import { addToBag } from '../src/sim/inventory.js';
import ITEMS from '../src/data/items.json' with { type: 'json' };

const N = ITEMS.templates.length; // every hand-made item template counts toward the Items section
import { startEncounter } from '../src/sim/combat.js';
import {
  SECTIONS, sectionStats, overallStats, listEntries, describeEntry, rewardSteps, claimIndexReward, claimableCount, sanitizeIndex, noteItem, createIndexState,
} from '../src/sim/index.js';

const newGame = () => createGame({ storage: new MemoryStorage(), seed: 77 });
const give = (s, tpl, tier = 0, mut = []) => addToBag(s, { tpl, tier, vs: 0, hy: null, mut }, { force: true });

test('a new game knows only the starter kit; the starter kit is not a discovery event', () => {
  const s = createState(1, 0);
  assert.deepEqual(Object.keys(s.index.items).sort(), ['pebble_drill', 'stall']);
  assert.deepEqual(Object.keys(s.index.rarities), ['0']);
  assert.equal(drain(s).filter((e) => e.type === 'discover').length, 0);
  assert.equal(sectionStats(s, 'items').pct, Math.floor((2 / N) * 100));
});

test('items entering the game are recorded: template, rarity, mutations, count, first-found time; weapons go to weapons; practice items never count', () => {
  const s = createState(1, 0);
  drain(s);
  give(s, 'gem_forge', 4, [['golden', 1], ['lucky', 1]]);
  give(s, 'gem_forge', 6);
  give(s, 'bolt_rifle', 2);
  addToBag(s, { tpl: 'star_mine', tier: 9, vs: 0, hy: null, mut: [['voidborn', 1]], practice: true }, { force: true });
  const rec = s.index.items.gem_forge;
  assert.equal(rec.n, 2);
  assert.equal(rec.best, 6);
  assert.ok(rec.first > 0);
  assert.ok(s.index.rarities['4'] && s.index.rarities['6']);
  assert.ok(s.index.mutations.golden && s.index.mutations.lucky);
  assert.ok(s.index.weapons.bolt_rifle);
  assert.equal(s.index.items.star_mine, undefined, 'practice item ignored');
  assert.equal(s.index.mutations.voidborn, undefined);
  const ev = drain(s).filter((e) => e.type === 'discover');
  assert.deepEqual(ev.map((e) => e.section).sort(), ['items', 'mutations', 'mutations', 'rarities', 'rarities', 'rarities', 'weapons']); // rarities 4, 6 and 2 (the weapon)
  give(s, 'gem_forge', 4);
  assert.equal(drain(s).filter((e) => e.type === 'discover').length, 0, 'only the first time is a discovery');
});

test('refinery changes record new mutations', () => {
  const g = newGame();
  const it = g.debug.giveItem('gem_forge', 3);
  g.debug.grantMoney(1e9);
  for (let i = 0; i < 40; i++) g.reroll(it.uid);
  assert.ok(Object.keys(g.state.index.mutations).length >= 2);
});

test('monsters are recorded (with counts) when a wave starts, bosses when the fight starts and when won', () => {
  const g = newGame();
  const s = g.state;
  s.level = 10;
  s.combat.wave = 20;
  assert.ok(startEncounter(s, 'wave').ok);
  const kinds = Object.keys(s.index.monsters);
  assert.ok(kinds.includes('grunt'));
  assert.ok(s.index.monsters.grunt.n >= 2);
  s._enc = null;
  assert.ok(startEncounter(s, 'boss').ok);
  assert.ok(s.index.bosses['0']);
  assert.equal(describeEntry(s, 'bosses', 0).won, 0);
});

test('listing: reference entries in order, endless sections add found bonus entries and a few locked silhouettes; locked entries reveal only a hint', () => {
  const s = createState(1, 0);
  const items = listEntries(s, 'items');
  assert.equal(items.length, N);
  const lockedItem = describeEntry(s, 'items', items.find((e) => !e.found).id);
  assert.equal(lockedItem.name, '???');
  assert.ok(lockedItem.hint.length > 5 && lockedItem.found === false);
  const rar = listEntries(s, 'rarities');
  assert.equal(rar.length, 12 + 3, '12 hand tiers + 3 silhouettes');
  give(s, 'belt', 15);
  give(s, 'belt', 40);
  const rar2 = listEntries(s, 'rarities');
  assert.ok(rar2.filter((e) => e.bonus).map((e) => e.id).join() === '15,40', 'generated rarities appear after the reference');
  assert.equal(rar2.filter((e) => e.preview).length, 3);
  assert.equal(rar2.filter((e) => e.preview)[0].id, '41');
  assert.equal(sectionStats(s, 'rarities').bonus, 2);
  const d = describeEntry(s, 'rarities', 40);
  assert.ok(d.found && d.name && !/NaN|Infinity/.test(d.desc + d.odds));
});

test('endless scale: 30,000 generated mutations, 5,000 bosses and 2,000 rarities list in well under a second and are described lazily', () => {
  const s = createState(1, 0);
  for (let i = 0; i < 30000; i++) s.index.mutations['g:' + i] = { n: 1, first: 1, th: 'factory' };
  for (let i = 0; i < 5000; i++) s.index.bosses[String(i)] = { n: 1, first: 1, th: 'space', won: 1 };
  for (let i = 0; i < 2000; i++) s.index.rarities[String(i * 7)] = { n: 1, first: 1, th: 'pixel' };
  const t0 = performance.now();
  const lm = listEntries(s, 'mutations');
  const lb = listEntries(s, 'bosses');
  const lr = listEntries(s, 'rarities');
  assert.ok(performance.now() - t0 < 1000, `${performance.now() - t0} ms`);
  assert.equal(lm.length, 13 + 30000 + 3);
  assert.equal(lb.filter((e) => e.preview)[0].id, '5000');
  assert.ok(lr.length > 2000);
  const t1 = performance.now();
  for (let i = 20000; i < 20020; i++) assert.ok(describeEntry(s, 'mutations', 'g:' + i).name);
  assert.ok(performance.now() - t1 < 500);
  assert.ok(overallStats(s).pct <= 100);
  // loading a hostile save with millions of ids is capped and sanitised
  const hostile = { mutations: {}, items: { nope: { n: 1 } }, rarities: { '-1': { n: 1 }, x: { n: 1 } } };
  for (let i = 0; i < 80000; i++) hostile.mutations['g:' + i] = { n: 1, first: 5 };
  const clean = sanitizeIndex(hostile);
  assert.ok(Object.keys(clean.mutations).length <= 50000);
  assert.deepEqual(Object.keys(clean.items), []);
  assert.deepEqual(Object.keys(clean.rarities), []);
});

test('search and filters: by name, by theme of first discovery, by item type, by best rarity, found/missing', () => {
  const s = createState(1, 0);
  give(s, 'gem_forge', 5);
  s.index.items.gem_forge.th = 'steampunk';
  assert.deepEqual(listEntries(s, 'items', { q: 'gem' }).map((e) => e.id), ['gem_forge']);
  assert.deepEqual(listEntries(s, 'items', { q: 'GEM forge' }).map((e) => e.id), ['gem_forge'], 'case-insensitive, every word');
  assert.deepEqual(listEntries(s, 'items', { theme: 'steampunk' }).map((e) => e.id), ['gem_forge']);
  assert.ok(listEntries(s, 'items', { type: 'seller' }).every((e) => ['stall', 'bazaar', 'auction'].includes(e.id)));
  assert.deepEqual(listEntries(s, 'items', { minTier: 4 }).map((e) => e.id), ['gem_forge']);
  assert.equal(listEntries(s, 'items', { status: 'found' }).length, 3);
  assert.equal(listEntries(s, 'items', { status: 'missing' }).length, N - 3);
  assert.deepEqual(listEntries(s, 'items', { q: 'zzz' }), []);
  assert.deepEqual(listEntries(s, 'items', { q: 'bazaar' }), [], 'undiscovered entries cannot be found by name');
});

test('completion rewards: reachable at 25/50/75/100 %, claimed exactly once each, never before reached, survive a reload', () => {
  const g = newGame();
  const s = g.state;
  assert.equal(claimableCount(s), 0);
  assert.equal(claimIndexReward(s, 'items:25').ok, false);
  assert.match(claimIndexReward(s, 'items:25').reason, /25%/);
  const need = Math.ceil(N * 0.25) - 2; // the 2 starters already count
  for (const t of ITEMS.templates.filter((x) => x.id !== 'pebble_drill' && x.id !== 'stall').slice(0, need)) give(s, t.id, 1);
  assert.ok(sectionStats(s, 'items').pct >= 25);
  assert.ok(claimableCount(s) >= 1);
  const money0 = s.money.toNumber();
  const r = g.index.claim('items:25');
  assert.ok(r.ok);
  assert.ok(s.money.toNumber() > money0);
  assert.equal(g.index.claim('items:25').ok, false);
  assert.match(g.index.claim('items:25').reason, /Already/);
  const money1 = s.money.toNumber();
  g.index.claim('items:25');
  assert.equal(s.money.toNumber(), money1, 'no second payment');
  const back = deserializeState(JSON.parse(JSON.stringify(serializeState(s))));
  assert.equal(claimIndexReward(back, 'items:25').ok, false, 'ledger persisted');
  assert.equal(rewardSteps(back, 'items').filter((x) => x.claimed).length, 1);
});

test('the all-sections reward needs every section at 100% and is also paid once', () => {
  const s = createState(1, 0);
  assert.equal(rewardSteps(s, 'all')[0].reached, false);
  for (const sec of SECTIONS) {
    const list = listEntries(s, sec).filter((e) => !e.preview);
    for (const e of list) s.index[sec][e.id] = { n: 1, first: 1, th: 'factory' };
  }
  assert.ok(SECTIONS.every((sec) => sectionStats(s, sec).pct === 100));
  assert.equal(overallStats(s).pct, 100);
  assert.equal(claimIndexReward(s, 'all:100').ok, true);
  assert.equal(claimIndexReward(s, 'all:100').ok, false);
  assert.equal(claimIndexReward(s, 'bogus:1').ok, false);
});

test('the Index survives save and load; a save from before the Index is backfilled from what it proves, silently', () => {
  const g = newGame();
  g.debug.giveItem('gem_forge', 5);
  const data = JSON.parse(JSON.stringify(serializeState(g.state)));
  assert.ok(deserializeState(data).index.items.gem_forge);
  delete data.index;
  data.combat.bossIndex = 3;
  data.combat.bestWave = 12;
  const old = deserializeState(data);
  assert.ok(old.index.items.gem_forge && old.index.rarities['5']);
  assert.deepEqual(Object.keys(old.index.bosses).sort(), ['0', '1', '2']);
  assert.equal(old.index.bosses['1'].won, 1);
  assert.ok(old.index.monsters.grunt);
  assert.equal(drain(old).filter((e) => e.type === 'discover').length, 0);
  void noteItem; void createIndexState;
});
