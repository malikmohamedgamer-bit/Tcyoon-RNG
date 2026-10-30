import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isNewer, createUpdateChecker } from '../src/core/updates.js';

test('isNewer: any different published version means reload; dev builds and bad data never nag', () => {
  assert.equal(isNewer('1.0.0-abc', '1.0.0-def'), true);
  assert.equal(isNewer('1.0.0-abc', '1.0.0-abc'), false);
  assert.equal(isNewer('dev', '1.0.0'), false);
  assert.equal(isNewer('1.0.0', ''), false);
  assert.equal(isNewer('1.0.0', undefined), false);
  assert.equal(isNewer('1.0.0', 5), false);
});

test('checker notifies once, ignores network errors and bad json, and is off in dev', async () => {
  const seen = [];
  let answer = { version: 'a' };
  const c = createUpdateChecker({ current: 'a', fetchJson: async () => answer, onNewer: (v) => seen.push(v), setIntervalFn: () => 1 });
  assert.equal(await c.check(), false);
  answer = { version: 'b' };
  assert.equal(await c.check(), true);
  assert.equal(await c.check(), false, 'only once');
  assert.deepEqual(seen, ['b']);
  const bad = createUpdateChecker({ current: 'a', fetchJson: async () => { throw new Error('offline'); }, onNewer: () => assert.fail('no'), setIntervalFn: () => 1 });
  assert.equal(await bad.check(), false);
  const junk = createUpdateChecker({ current: 'a', fetchJson: async () => null, onNewer: () => assert.fail('no'), setIntervalFn: () => 1 });
  assert.equal(await junk.check(), false);
  const dev = createUpdateChecker({ current: 'dev', fetchJson: async () => ({ version: 'x' }), onNewer: () => assert.fail('no'), setIntervalFn: () => 1 });
  assert.equal(await dev.check(), false);
});
