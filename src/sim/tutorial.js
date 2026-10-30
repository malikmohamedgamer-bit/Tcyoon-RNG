// Interactive tutorial: a pure state machine (no DOM, no clock). The UI only reads it
// (`currentStep`) and tells it things (`setTutorialFlag`, `ackTutorial`); the game loop calls
// `tickTutorial(state, dt)` so a step advances by itself when its condition is true.
//
// Steps are data (data/tutorial.json). Rewards and assists are granted exactly once per save
// (ledger `tutorial.claimed`), also when the tutorial is replayed, so replaying never farms anything.
import TUT from '../data/tutorial.json' with { type: 'json' };
import { Big, ZERO } from '../core/bignum.js';
import { emit } from '../core/events.js';
import { grantSpec, describeReward } from './rewards.js';
import { addToBag } from './inventory.js';
import { rollCost, addMoney } from './economy.js';
import { typeOf } from './items.js';

export const STEPS = TUT.steps;
export const MIN_SHOW_SECONDS = TUT.minShowSeconds;
export const STUCK_SECONDS = TUT.stuckSeconds;

/** status: new (never started) | active | paused ("skip for now") | skipped (don't ask again) | done */
export function createTutorialState() {
  return { status: 'new', step: 0, t: 0, base: {}, mark: '0', flags: {}, claimed: {}, completed: 0, replays: 0 };
}

/** A save made before the tutorial existed, or an experienced player, does not get a surprise tutorial. */
export function legacyTutorialState() {
  return { ...createTutorialState(), status: 'done', completed: 0 };
}

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

export function sanitizeTutorial(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const t = createTutorialState();
  t.status = ['new', 'active', 'paused', 'skipped', 'done'].includes(raw.status) ? raw.status : 'new';
  t.step = Math.min(STEPS.length - 1, Math.max(0, Math.floor(num(raw.step))));
  t.t = Math.max(0, num(raw.t));
  t.base = Object.fromEntries(Object.entries(raw.base || {}).filter(([, v]) => Number.isFinite(Number(v))).map(([k, v]) => [k, Number(v)]));
  t.mark = typeof raw.mark === 'string' ? raw.mark : '0';
  t.flags = Object.fromEntries(Object.entries(raw.flags || {}).filter(([, v]) => v === true));
  t.claimed = Object.fromEntries(Object.entries(raw.claimed || {}).filter(([, v]) => v === true));
  t.completed = Math.max(0, Math.floor(num(raw.completed)));
  t.replays = Math.max(0, Math.floor(num(raw.replays)));
  return t;
}

export const currentStep = (state) => (state.tutorial.status === 'active' ? STEPS[state.tutorial.step] : null);
export const isActive = (state) => state.tutorial.status === 'active';

// ------------------------------------------------------------------ conditions
export function stepDone(state, step) {
  const tut = state.tutorial;
  const d = step.done;
  switch (d.kind) {
    case 'statSince':
      return (state.stats[d.stat] || 0) - (tut.base[d.stat] || 0) >= d.gte;
    case 'earnedSince':
      return state.totalMoney.sub(Big.from(tut.mark)).gte(d.gte);
    case 'flag':
      return !!tut.flags[d.name];
    case 'ack':
      return !!tut.flags.ack;
    default:
      return false;
  }
}

// ------------------------------------------------------------------ assists and rewards
function bagCount(state, spec) {
  return state.bag.filter((u) => {
    const it = state.items[u];
    if (spec.tier != null && it.tier !== spec.tier) return false; // fuse needs same-tier items
    return spec.tpl ? it.tpl === spec.tpl : typeOf(it) === spec.type;
  }).length;
}

const PRACTICE_TPL = { dropper: 'pebble_drill', seller: 'stall', turret: 'gun_turret' };

function runAssist(state, step) {
  const a = step.assist;
  if (!a) return;
  const tut = state.tutorial;
  const once = (key, fn) => {
    const k = `assist:${step.id}:${key}`;
    if (tut.claimed[k]) return;
    tut.claimed[k] = true;
    fn();
  };
  if (a.freeRolls) once('freeRolls', () => (state.freeRoll.count += a.freeRolls));
  if (a.rollMoney) {
    once('rollMoney', () => {
      const want = rollCost(state).mul(a.rollMoney);
      if (state.money.lt(want)) addMoney(state, want.sub(state.money));
    });
  }
  if (a.ensureItem) {
    // practice items are worth $0, so this may run on every replay without farming anything
    const spec = a.ensureItem;
    const missing = Math.max(0, (spec.n || 1) - bagCount(state, spec));
    for (let i = 0; i < missing; i++) {
      const tpl = spec.tpl || PRACTICE_TPL[spec.type];
      addToBag(state, { tpl, tier: spec.tier || 0, vs: 0, hy: null, mut: [], practice: true }, { force: true });
    }
    if (missing) emit(state, 'tutorialAssist', { text: `Here ${missing === 1 ? 'is a practice item' : `are ${missing} practice items`} (worth $0).` });
  }
  if (a.demoWave && state._tutorialHooks && state._tutorialHooks.demoWave) state._tutorialHooks.demoWave();
}

function grantReward(state, step) {
  if (!step.reward) return;
  const k = `reward:${step.id}`;
  if (state.tutorial.claimed[k]) return;
  state.tutorial.claimed[k] = true;
  const given = grantSpec(state, step.reward, { key: `tutorial:${step.id}` });
  emit(state, 'tutorialReward', { id: step.id, text: describeReward(step.reward), money: given.money || ZERO });
}

// ------------------------------------------------------------------ transitions
function enterStep(state) {
  const tut = state.tutorial;
  const step = STEPS[tut.step];
  tut.t = 0;
  tut.flags = {};
  tut.base = {};
  if (step.done.kind === 'statSince') tut.base[step.done.stat] = state.stats[step.done.stat] || 0;
  tut.mark = JSON.parse(JSON.stringify(state.totalMoney));
  runAssist(state, step);
  emit(state, 'tutorialStep', { id: step.id, index: tut.step, total: STEPS.length, text: step.text });
}

export function startTutorial(state, { replay = false } = {}) {
  const tut = state.tutorial;
  if (replay) tut.replays += 1;
  tut.status = 'active';
  tut.step = 0;
  enterStep(state);
  return tut;
}

export function resumeTutorial(state) {
  const tut = state.tutorial;
  if (tut.status !== 'paused' && tut.status !== 'skipped') return false;
  tut.status = 'active';
  enterStep(state);
  return true;
}

function completeStep(state) {
  const tut = state.tutorial;
  grantReward(state, STEPS[tut.step]);
  if (tut.step + 1 >= STEPS.length) {
    tut.status = 'done';
    tut.completed += 1;
    emit(state, 'tutorialDone', {});
    return;
  }
  tut.step += 1;
  enterStep(state);
}

/** Called every simulation step. A step advances at most once per call and only after it was visible for a moment. */
export function tickTutorial(state, dt) {
  const tut = state.tutorial;
  if (tut.status !== 'active') return false;
  tut.t += dt;
  const step = STEPS[tut.step];
  if (tut.t >= MIN_SHOW_SECONDS && stepDone(state, step)) {
    completeStep(state);
    return true;
  }
  return false;
}

export function setTutorialFlag(state, name) {
  const tut = state.tutorial;
  if (tut.status === 'active') tut.flags[name] = true;
}

export function ackTutorial(state) {
  setTutorialFlag(state, 'ack');
}

/** "Skip this step": always allowed when a step is stuck; never grants its reward. */
export function skipStep(state) {
  const tut = state.tutorial;
  if (tut.status !== 'active') return false;
  if (tut.step + 1 >= STEPS.length) {
    tut.status = 'done';
    emit(state, 'tutorialDone', {});
    return true;
  }
  tut.step += 1;
  enterStep(state);
  return true;
}

/** Skip the whole tutorial. forever = "don't ask again" (it can still be replayed from Settings and Help). */
export function skipTutorial(state, { forever = false } = {}) {
  const tut = state.tutorial;
  if (tut.status !== 'active' && tut.status !== 'new' && tut.status !== 'paused') return false;
  tut.status = forever ? 'skipped' : 'paused';
  return true;
}

/** What the player would miss: the remaining topics and the number of small rewards not yet granted. */
export function skipSummary(state) {
  const tut = state.tutorial;
  const rest = STEPS.slice(tut.status === 'new' ? 0 : tut.step);
  const topics = [...new Set(rest.map((s) => s.topic))];
  const rewards = rest.filter((s) => s.reward && !tut.claimed[`reward:${s.id}`]);
  return { topics, remaining: rest.length, total: STEPS.length, rewardCount: rewards.length, rewardText: rewards.map((s) => describeReward(s.reward)) };
}

/** Should the game start the tutorial by itself? Only for a brand-new save. */
export const shouldAutoStart = (state) => state.tutorial.status === 'new';
