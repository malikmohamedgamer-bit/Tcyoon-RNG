// Shared e2e helpers. The game exposes `window.__game` (see src/main.js) so tests can
// drive time and read state deterministically instead of sleeping.
import { expect } from '@playwright/test';

export async function openGame(page, { clearSave = true, init, tutorial = false, pace = 'standard', simpleUI = false } = {}) {
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console.error: ' + m.text());
  });
  if (clearSave) await page.addInitScript(() => { if (!sessionStorage.getItem('__e2e_started')) { localStorage.clear(); sessionStorage.setItem('__e2e_started', '1'); } });
  if (init) await page.addInitScript(init);
  await page.goto('/');
  await page.waitForFunction(() => window.__game && window.__game.loop && window.__game.loop.frames > 2);
  // first run: choose the pace (Relaxed/Standard dialog); a returning save has no dialog
  await page.waitForFunction(() => document.querySelector('.modal [data-choice]') || window.__game.state.difficulty !== null || window.__game.state.tutorial.status !== 'new');
  const choice = page.locator(`.modal [data-choice="${pace}"]`);
  if (await choice.count()) {
    await choice.click();
    await page.waitForFunction(() => window.__game.state.difficulty !== null);
  }
  // older tests are about other features: skip the first-run tutorial unless a test asks for it
  if (!tutorial) await page.evaluate(() => window.__game.game.tutorial.skip({ forever: true }));
  // older tests click every panel from level 1: they use the Advanced UI (the default UI is covered by the new-player tests)
  if (!simpleUI) await page.evaluate(() => window.__game.set('advancedUI', true));
  return errors;
}

export const game = (page, fn, arg) => page.evaluate(fn, arg);

export async function expectNoErrors(errors) {
  expect(errors, errors.join('\n')).toEqual([]);
}
