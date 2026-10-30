import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game.js';
import { MemoryStorage } from '../src/core/save.js';
import { UNDO_WINDOW } from '../src/sim/undo.js';

const newGame = () => createGame({ storage: new MemoryStorage(), seed: 21 });
const uidOf = (g, tpl) => g.state.bag.find((u) => g.state.items[u].tpl === tpl);
const run = (g, sec) => { for (let t = 0; t < sec; t += 0.5) g.step(0.5); };

test('undo a placement: the item goes back to the same backpack slot and income returns to zero', () => {
  const g = newGame();
  const drill = uidOf(g, 'pebble_drill');
  const idx = g.state.bag.indexOf(drill);
  assert.ok(g.place(drill, 1, 1, 0).ok);
  assert.ok(g.undoInfo().label.startsWith('Placed'));
  assert.ok(g.undo().ok);
  assert.equal(g.state.items[drill].loc, 'bag');
  assert.equal(g.state.bag.indexOf(drill), idx);
  assert.equal(g.undoInfo(), null);
});

test('undo a move and a swap restores both positions', () => {
  const g = newGame();
  const drill = uidOf(g, 'pebble_drill');
  const stall = uidOf(g, 'stall');
  g.place(drill, 1, 1, 0);
  g.place(stall, 2, 1, 0);
  g.place(drill, 3, 3, 1); // move
  assert.ok(g.undo().ok);
  assert.deepEqual([g.state.items[drill].x, g.state.items[drill].y, g.state.items[drill].dir], [1, 1, 0]);
  g.place(drill, 2, 1, 0); // swap onto the stall
  assert.ok(g.state.items[stall].x === 1 && g.state.items[drill].x === 2);
  assert.ok(g.undo().ok);
  assert.deepEqual([g.state.items[drill].x, g.state.items[stall].x], [1, 2]);
});

test('undo a pick-up puts the item back; it fails (and can be retried) when the tile is taken', () => {
  const g = newGame();
  const drill = uidOf(g, 'pebble_drill');
  const stall = uidOf(g, 'stall');
  g.place(drill, 1, 1, 0);
  g.pickUp(drill);
  g.place(stall, 1, 1, 0);
  const r = g.undo(); // newest first: undoes the placement of the stall
  assert.ok(r.ok);
  const r2 = g.undo();
  assert.ok(r2.ok, 'tile is free again, so the pick-up can be undone');
  assert.equal(g.state.items[drill].loc, 'placed');
});

test('undo a sale: item, money and XP come back exactly; selling again later gives the normal XP (no farming)', () => {
  const g = newGame();
  const drill = uidOf(g, 'pebble_drill');
  g.roll(1);
  const target = g.state.bag.find((u) => u !== drill && u !== uidOf(g, 'stall'));
  const m0 = g.state.money.toNumber();
  const xp0 = g.state.xp.toNumber();
  const lvl0 = g.state.level;
  const sold = g.sell(target);
  assert.ok(sold.ok);
  assert.ok(g.undo().ok);
  assert.equal(g.state.items[target]?.loc, 'bag');
  assert.ok(Math.abs(g.state.money.toNumber() - m0) < 1e-9);
  assert.ok(Math.abs(g.state.xp.toNumber() - xp0) < 1e-9);
  assert.equal(g.state.level, lvl0);
  void drill;
});

test('a sale cannot be undone after you spent the money or levelled up', () => {
  const g = newGame();
  g.roll(1);
  const target = g.state.bag.find((u) => g.state.items[u].tpl !== 'pebble_drill' && g.state.items[u].tpl !== 'stall') ?? g.state.bag.at(-1);
  g.sell(target);
  g.state.money = g.state.money.mul(0);
  const r = g.undo();
  assert.equal(r.ok, false);
  assert.match(r.reason, /buy it back/);
  g.debug.grantXp(1e6);
  g.debug.grantMoney(1e6);
  assert.match(g.undo().reason, /levelled up/);
});

test('undo expires after the window and is limited to the last 10 actions', () => {
  const g = newGame();
  const drill = uidOf(g, 'pebble_drill');
  g.place(drill, 1, 1, 0);
  run(g, UNDO_WINDOW + 1);
  assert.equal(g.undoInfo(), null);
  assert.match(g.undo().reason, /Nothing to undo/);
  for (let i = 0; i < 14; i++) g.place(drill, i % 2 ? 1 : 2, 1, 0);
  assert.equal(g.undoInfo().count, 10);
});

test('sell duplicates can be undone as one action', () => {
  const g = newGame();
  g.debug.giveItem('belt', 0);
  g.debug.giveItem('belt', 0);
  g.debug.giveItem('belt', 0);
  const before = g.state.bag.length;
  const m0 = g.state.money.toNumber();
  const r = g.sellDuplicates();
  assert.equal(r.count, 2);
  assert.ok(g.undo().ok);
  assert.equal(g.state.bag.length, before);
  assert.ok(Math.abs(g.state.money.toNumber() - m0) < 1e-9);
});

test('rebirth clears the undo history', () => {
  const g = newGame();
  g.place(uidOf(g, 'pebble_drill'), 1, 1, 0);
  g.state.runMoney = g.state.runMoney.add(5e6);
  assert.ok(g.prestige(0, { confirmed: true }).ok);
  assert.equal(g.undoInfo(), null);
});
