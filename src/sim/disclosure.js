// Progressive disclosure (data/disclosure.json). Pure: `visiblePanels` / `visibleChips` say what the UI may
// show; `checkUnlocks` records new unlocks once (state.ui.unlocked) and emits an 'unlock' event for each.
import D from '../data/disclosure.json' with { type: 'json' };
import { requirementMet, describeReq } from './unlock.js';
import { emit } from '../core/events.js';
import { STEPS } from './tutorial.js';
import { unlockedSpeeds } from './speed.js';

export const PANEL_RULES = D.panels;
export const CHIP_RULES = D.chips;

export const createUiState = () => ({ unlocked: {}, opened: {} });

export function sanitizeUiState(raw) {
  const u = createUiState();
  for (const k of Object.keys(D.panels)) {
    if (raw?.unlocked?.[k] === true) u.unlocked[k] = true;
    if (raw?.opened?.[k] === true) u.opened[k] = true;
  }
  return u;
}

const met = (state, rule) => rule === null || (rule && rule !== 'advanced' && requirementMet(state, rule));

/** Panels the current tutorial step needs on screen (so the tutorial can never point at a hidden button). */
export function tutorialPanels(state) {
  if (state.tutorial.status !== 'active') return [];
  const step = STEPS[state.tutorial.step];
  const out = [];
  if (step.panel) out.push(step.panel);
  if (step.target.startsWith('dock:')) out.push(step.target.slice(5));
  return out;
}

export function visiblePanels(state) {
  const adv = state.settings.advancedUI;
  const need = new Set(tutorialPanels(state));
  return new Set(Object.keys(D.panels).filter((id) => adv || state.ui.unlocked[id] || met(state, D.panels[id]) || need.has(id)));
}

export function visibleChips(state) {
  const adv = state.settings.advancedUI;
  const out = new Set(Object.keys(D.chips).filter((id) => adv || (D.chips[id] !== 'advanced' && met(state, D.chips[id]))));
  if (adv || unlockedSpeeds(state).some((s) => s > 1)) out.add('speed'); // the speed control appears with the first faster speed
  return out;
}

export const unlockHint = (id) => (D.panels[id] && D.panels[id] !== 'advanced' ? describeReq(D.panels[id]) : '');

/** Record newly unlocked panels. `silent` (loading an old save) records without announcing. */
export function checkUnlocks(state, { silent = false } = {}) {
  const fresh = [];
  for (const id of tutorialPanels(state)) if (id in D.panels) state.ui.unlocked[id] = true; // a panel the tutorial pointed at stays visible
  for (const [id, rule] of Object.entries(D.panels)) {
    if (state.ui.unlocked[id]) continue;
    if (met(state, rule)) {
      state.ui.unlocked[id] = true;
      if (rule !== null && !silent) fresh.push(id);
    }
  }
  for (const id of fresh) emit(state, 'unlock', { id });
  return fresh;
}
