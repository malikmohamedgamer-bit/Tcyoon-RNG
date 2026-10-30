// Shared e2e helpers. The game exposes `window.__game` (see src/main.js) so tests can
// drive time and read state deterministically instead of sleeping.
import { expect } from '@playwright/test';

export async function openGame(page, { clearSave = true, init } = {}) {
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console.error: ' + m.text());
  });
  if (clearSave) await page.addInitScript(() => { if (!sessionStorage.getItem('__e2e_started')) { localStorage.clear(); sessionStorage.setItem('__e2e_started', '1'); } });
  if (init) await page.addInitScript(init);
  await page.goto('/');
  await page.waitForFunction(() => window.__game && window.__game.loop && window.__game.loop.frames > 2);
  return errors;
}

export const game = (page, fn, arg) => page.evaluate(fn, arg);

export async function expectNoErrors(errors) {
  expect(errors, errors.join('\n')).toEqual([]);
}
