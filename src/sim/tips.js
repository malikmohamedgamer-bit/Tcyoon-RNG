// One-time contextual tips (data/tips.json). Pure: the simulation reports events through `observe`
// (installed as the emit hook in sim/state.js) and `checkTips` runs the named conditions about once a second.
// A shown tip is remembered in state.tips.seen so it never appears twice (also after a reload).
import TIPS_DATA from '../data/tips.json' with { type: 'json' };
import { emit } from '../core/events.js';
import { canPrestige } from './rebirth.js';
import { canFightBoss } from './combat.js';
import { unlockedSpeeds } from './speed.js';

export const TIPS = TIPS_DATA.tips;

export const createTipState = () => ({ seen: {} });

export function sanitizeTips(raw) {
  const t = createTipState();
  const ids = new Set(TIPS.map((x) => x.id));
  for (const [k, v] of Object.entries(raw?.seen || {})) if (ids.has(k) && Number.isFinite(Number(v))) t.seen[k] = Number(v);
  return t;
}

const matches = (ev, match = {}) =>
  Object.entries(match).every(([k, want]) => {
    const v = ev[k];
    if (want && typeof want === 'object') return typeof v === 'number' && (want.gte == null || v >= want.gte);
    return v === want;
  });

function fire(state, tip) {
  if (state.settings.tips === false || state.tips.seen[tip.id] || state.tutorial.status === 'active') return false;
  state.tips.seen[tip.id] = Math.floor(state.playtime) + 1; // seconds of play (+1 so the value is always truthy)
  emit(state, 'tip', { id: tip.id, title: tip.title, text: tip.text, action: tip.action || null });
  return true;
}

/** Called for every simulation event. */
export function observe(state, ev) {
  if (ev.type === 'tip') return;
  for (const tip of TIPS) if (tip.on.event === ev.type && matches(ev, tip.on.match)) fire(state, tip);
}

const CONDS = {
  rebirthReady: (s) => canPrestige(s, 0),
  layer1Ready: (s) => s.layers.length > 1 && canPrestige(s, 1),
  bossUnlocked: (s) => canFightBoss(s).ok,
  speedUnlocked: (s) => unlockedSpeeds(s).some((x) => x > 1),
};

/** Named-condition tips; cheap, call about once a second. */
export function checkTips(state) {
  if (state.settings.tips === false || state.tutorial.status === 'active') return;
  for (const tip of TIPS) {
    if (!tip.on.cond || state.tips.seen[tip.id]) continue;
    const fn = CONDS[tip.on.cond];
    if (fn && fn(state)) fire(state, tip);
  }
}

export const seenTips = (state) => TIPS.filter((t) => state.tips.seen[t.id]);
