// Difficulty modes (data/difficulty.json). All knobs are plain multipliers read through `diffMods(state)`,
// so "standard" is exactly the pre-existing behaviour and the simulators can compare the two.
import DIFF from '../data/difficulty.json' with { type: 'json' };

export const MODES = DIFF.modes;
export const DEFAULT_MODE = DIFF.default;
export const isMode = (id) => typeof id === 'string' && id in MODES;

/** state.difficulty is null until the player picks one on the first run (then it behaves as the default). */
export const modeId = (state) => (isMode(state.difficulty) ? state.difficulty : DEFAULT_MODE);
export const diffMods = (state) => MODES[modeId(state)].mods;

export function setDifficulty(state, id) {
  if (!isMode(id)) return false;
  state.difficulty = id;
  return true;
}

/** Modifier hook (installed by sim/state.js): income and free-roll pace feed the economy modifiers. */
export function applyDifficultyMods(state, m) {
  const d = diffMods(state);
  m.income = m.income.mul(d.income);
  m.freeIntervalMult *= d.freeRollInterval;
}
