// Game state creation, (de)serialisation and schema migrations.
// The state is plain data (Big values in memory, strings in the save) so the
// simulation can run in Node with no DOM and no Three.js.

import { Big, ZERO } from '../core/bignum.js';
import { hash32 } from '../core/rng.js';

export const SAVE_VERSION = 1;

export function defaultSettings() {
  return { pixelSize: 4, quality: 'medium' };
}

export function createState(seed = hash32(String(Date.now())), nowMs = Date.now()) {
  return {
    v: SAVE_VERSION,
    seed: seed >>> 0,
    createdAt: nowMs,
    savedAt: nowMs,
    playtime: 0,
    money: ZERO,
    region: 0,
    settings: defaultSettings(),
  };
}

export function serializeState(state, nowMs = Date.now()) {
  return JSON.parse(JSON.stringify({ ...state, savedAt: nowMs, v: SAVE_VERSION }));
}

export function deserializeState(data) {
  const s = createState(data.seed, data.createdAt);
  s.savedAt = Number(data.savedAt) || s.savedAt;
  s.playtime = Math.max(0, Number(data.playtime) || 0);
  s.money = Big.from(data.money).nonNeg();
  s.region = Math.max(0, Math.floor(Number(data.region) || 0));
  s.settings = { ...defaultSettings(), ...(data.settings || {}) };
  return s;
}

export const MIGRATIONS = {};
