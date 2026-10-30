import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, defaultBindings, findConflicts, wouldConflict, rebind, keyLabel } from '../src/core/input.js';

test('default bindings have no conflicts', () => {
  assert.deepEqual(findConflicts(defaultBindings()), []);
});

test('base and arena contexts are exclusive, so they may share keys; global overlaps everything', () => {
  const b = defaultBindings();
  assert.ok(b.panLeft.includes('KeyA') && b.moveLeft.includes('KeyA')); // same key, different contexts
  assert.deepEqual(findConflicts(b), []);
  b.pause = ['KeyR']; // global vs base 'rotate'
  const c = findConflicts(b);
  assert.equal(c.length, 1);
  assert.deepEqual(c[0].actions.sort(), ['pause', 'rotate']);
});

test('rebind refuses a conflicting key and reports who owns it', () => {
  const b = defaultBindings();
  const bad = rebind(b, 'rotate', 'KeyX');
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.conflicts, ['sellSel']);
  assert.deepEqual(bad.bindings.rotate, ['KeyR']);
  const good = rebind(b, 'rotate', 'KeyJ');
  assert.ok(good.ok);
  assert.deepEqual(good.bindings.rotate, ['KeyJ']);
  assert.deepEqual(wouldConflict(b, 'roll', 'KeyP'), ['pause']);
  assert.deepEqual(wouldConflict(b, 'rotate', 'KeyR'), []);
});

test('every action has a label, a context and at least one key; labels are readable', () => {
  for (const [k, a] of Object.entries(ACTIONS)) {
    assert.ok(a.label && ['global', 'base', 'arena'].includes(a.ctx) && a.keys.length, k);
  }
  assert.equal(keyLabel('KeyR'), 'R');
  assert.equal(keyLabel('Digit3'), '3');
  assert.equal(keyLabel('Escape'), 'Esc');
});
