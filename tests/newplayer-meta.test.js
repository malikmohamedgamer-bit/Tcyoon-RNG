import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the new-player e2e uses no internal hooks: it never touches window.__game or the debug object', () => {
  const src = readFileSync(new URL('../e2e/f9-new-player.spec.js', import.meta.url), 'utf8');
  const code = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.ok(!/__game|debug\.|window\.\w*[Gg]ame/.test(code), 'internal hook found');
  assert.ok(!/from '\.\/helpers\.js'/.test(code), 'it must not use the helper that skips the tutorial and enables the Advanced UI');
});
