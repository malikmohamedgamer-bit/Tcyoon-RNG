// Roll reveals: slot-machine reels, multi-roll summaries and rare-item cutscenes as PURE state machines.
// The roll's outcome is decided (and stored) by the seeded game BEFORE any of this exists; these machines only
// choose how to show it, using their own seeded RNG for the fillers, so an animation can never change a result.
// Everything advances by `step(dt)` (driven by the fixed-step loop) and can be skipped or fast-forwarded,
// so Node tests and the e2e hooks are deterministic.
import CUT from '../data/cutscenes.json' with { type: 'json' };
import { Rng } from '../core/rng.js';
import { logOdds } from '../gen/tiers.js';

export const LEVELS = CUT.levels;
export const REEL = CUT.reel;
export const MAX_FLASHES_PER_SECOND = CUT.maxFlashesPerSecond;
const levelIndex = (id) => LEVELS.findIndex((l) => l.id === id);

// ------------------------------------------------------------------ how special is a result?
/** log10 of "one in N" for this player: odds of the tier divided by their luck. Pure formula, endless. */
export const surprise = (tier, logLuck) => logOdds(Math.max(0, tier)) - (Number.isFinite(logLuck) ? logLuck : 0);

/** The cutscene level for a result. `cap` is the player's Cutscenes setting ('full' | 'short' | 'off'). */
export function cutsceneLevel(tier, logLuck, { firstTime = false, cap = 'full' } = {}) {
  const s = surprise(tier, logLuck);
  let idx = 0;
  for (let i = 0; i < LEVELS.length; i++) if (s >= LEVELS[i].minSurprise) idx = i;
  if (firstTime) idx = Math.max(idx, levelIndex(CUT.firstFlourishLevel));
  const allowed = CUT.lengthCaps[cap] || CUT.lengthCaps.full;
  while (idx > 0 && !allowed.includes(LEVELS[idx].id)) idx--;
  return { ...LEVELS[idx], index: idx, surprise: s };
}

// ------------------------------------------------------------------ a single slot-machine reel
const hash = (n) => (Math.imul(n | 0, 2654435761) ^ 0x9e3779b9) >>> 0;

/**
 * @param result {{tier:number, icon:string, label:string, title?:string}} what the reel must land on
 * @param opts {{mode?:'normal'|'quick'|'static', seed?:number, fillers?:{tier:number,icon:string,label:string}[]}}
 */
export function createReel(result, { mode = 'normal', seed = 1, fillers = [] } = {}) {
  const p = REEL[mode] || REEL.normal;
  const rng = new Rng(hash(seed));
  const sps = p.sps;
  const spinDist = sps * p.spin;
  const target = mode === 'static' ? 2 : Math.ceil(spinDist + (sps * p.decel) / 2) + 1; // integer symbol index the reel stops on
  const pool = fillers.length ? fillers : [result];
  const strip = Array.from({ length: target + 3 }, (_, i) => {
    if (i === target) return result;
    const f = pool[rng.int(pool.length)];
    // fillers near the result's rarity make the final slow-down feel like a near miss; they never matter for the outcome
    return { ...f, tier: Math.max(0, (f.tier | 0) + (rng.int(3) - 1)) };
  });
  return { kind: 'reel', mode, t: 0, p, strip, target, spinDist, phase: p.spin + p.decel > 0 ? 'spin' : 'hold', pos: mode === 'static' ? target : 0, lastIdx: 0, landed: mode === 'static', done: false, result };
}

/** Advance a reel by dt seconds. Returns {ticks, landed} (ticks = symbols that passed the marker; landed true once, on the step it stops). */
export function stepReel(r, dt) {
  if (r.done) return { ticks: 0, landed: false };
  r.t += dt;
  const { spin, decel, hold } = r.p;
  let landedNow = false;
  if (r.t < spin) {
    r.phase = 'spin';
    r.pos = r.p.sps * r.t;
  } else if (r.t < spin + decel) {
    r.phase = 'decel';
    const u = (r.t - spin) / decel;
    r.pos = r.spinDist + (r.target - r.spinDist) * (1 - (1 - u) * (1 - u)); // starts at ~full speed, ends at rest exactly on the target
  } else {
    if (!r.landed) {
      r.landed = true;
      landedNow = true;
    }
    r.phase = 'hold';
    r.pos = r.target;
    if (r.t >= spin + decel + hold) r.done = true;
  }
  const idx = Math.floor(r.pos + 0.5);
  const ticks = Math.max(0, idx - r.lastIdx);
  r.lastIdx = idx;
  return { ticks, landed: landedNow };
}

export function skipReel(r) {
  r.pos = r.target;
  r.lastIdx = r.target;
  r.t = r.p.spin + r.p.decel;
  if (!r.landed) r.landed = true;
  r.phase = 'hold';
  r.done = true;
}

/** What to draw: five symbols around the marker, the fractional offset, and whether to blur. */
export function reelView(r) {
  const c = Math.floor(r.pos + 0.5);
  const at = (i) => r.strip[Math.max(0, Math.min(r.strip.length - 1, i))];
  const speed = r.phase === 'spin' ? r.p.sps : r.phase === 'decel' ? Math.max(0, r.p.sps * (1 - (r.t - r.p.spin) / r.p.decel)) : 0;
  return { center: at(c), symbols: [-2, -1, 0, 1, 2].map((d) => at(c + d)), offset: r.pos - c, speed, blur: r.mode !== 'static' && speed > r.p.sps * 0.5, landed: r.landed, phase: r.phase };
}

// ------------------------------------------------------------------ x10 / x100: fast multi-reel + summary
export function summarise(results) {
  const byTier = new Map();
  let best = null;
  for (const r of results) {
    byTier.set(r.tier, (byTier.get(r.tier) || 0) + 1);
    if (!best || r.tier > best.tier) best = r;
  }
  return { total: results.length, best, byTier: [...byTier.entries()].sort((a, b) => b[0] - a[0]).map(([tier, count]) => ({ tier, count })), newCount: results.filter((r) => r.isNew).length };
}

export function createBatch(results, { mode = 'quick', seed = 1, fillers = [] } = {}) {
  const n = results.length;
  const reelsN = mode === 'static' ? 0 : n <= 10 ? Math.min(REEL.batchReels, n) : 0;
  // the reels land on the best results, so the highest rarity is always on screen
  const shown = [...results].sort((a, b) => b.tier - a.tier).slice(0, reelsN);
  const reels = shown.map((res, i) => ({ delay: i * REEL.batchStagger, reel: createReel(res, { mode: 'quick', seed: seed + i, fillers }) }));
  const counter = reelsN === 0 && mode !== 'static' ? REEL.counterSeconds : 0;
  return { kind: 'batch', mode, t: 0, n, reels, counter, summary: summarise(results), phase: reels.length || counter ? 'run' : 'summary', hold: mode === 'static' ? 1.2 : REEL.summaryHold, landed: false, done: false, shownCount: 0 };
}

export function stepBatch(b, dt) {
  if (b.done) return { ticks: 0, landed: false };
  b.t += dt;
  let ticks = 0;
  let landedNow = false;
  if (b.phase === 'run') {
    let all = true;
    for (const x of b.reels) {
      if (b.t < x.delay) { all = false; continue; }
      const r = stepReel(x.reel, dt);
      ticks += r.ticks;
      if (!x.reel.landed) all = false;
    }
    if (b.counter) {
      const u = Math.min(1, b.t / b.counter);
      b.shownCount = Math.round(b.n * (1 - Math.pow(1 - u, 3)));
      ticks += b.shownCount > 0 && u < 1 ? 1 : 0;
      if (u < 1) all = false;
    }
    if (all) {
      b.phase = 'summary';
      b.landed = true;
      landedNow = true;
      b.t = 0;
    }
  } else if (b.t >= b.hold) b.done = true;
  return { ticks, landed: landedNow };
}

/** First skip: jump to the summary. Second skip: close. */
export function skipBatch(b) {
  if (b.phase === 'run') {
    for (const x of b.reels) skipReel(x.reel);
    b.shownCount = b.n;
    b.phase = 'summary';
    b.landed = true;
    b.t = 0;
    b.hold = Math.min(b.hold, 0.9);
  } else b.done = true;
}

// ------------------------------------------------------------------ the rare-item cutscene
/**
 * @param spec {{level:{id,seconds,camera,burst,flashes,index}, rarityLabel:string, title:string, theme:string, first:boolean, reduced:boolean}}
 */
export function createCutscene(spec) {
  const lv = spec.level;
  const secs = spec.reduced ? Math.min(lv.seconds, 1.6) : lv.seconds;
  const lines = CUT.themedText[spec.theme] || CUT.themedText.factory;
  const flashes = [];
  if (!spec.reduced) for (let i = 0; i < lv.flashes; i++) flashes.push(secs * 0.3 + i * 0.4); // >= 0.4 s apart: at most 3 per second
  const texts = [
    { at: 0.08, text: lines[0], slot: 'theme' },
    { at: 0.3, text: spec.rarityLabel, slot: 'rarity' },
    { at: 0.45, text: spec.title, slot: 'title' },
    ...(spec.first ? [{ at: 0.62, text: 'NEW in your Index!', slot: 'first' }] : []),
    { at: 0.75, text: lines[1], slot: 'tag' },
  ];
  return { kind: 'cutscene', spec, level: lv, seconds: secs, t: 0, u: 0, phase: 'anticipation', done: secs <= 0, fired: new Set(), flashes, texts, burst: spec.reduced ? 0 : lv.burst, stingAt: secs * 0.25, burstAt: secs * 0.3 };
}

const smooth = (x) => x * x * (3 - 2 * x);

export function stepCutscene(c, dt) {
  const ev = [];
  if (c.done) return ev;
  c.t += dt;
  c.u = Math.min(1, c.t / c.seconds);
  c.phase = c.u < 0.25 ? 'anticipation' : c.u < 0.55 ? 'reveal' : 'afterglow';
  const once = (key, cond, e) => {
    if (cond && !c.fired.has(key)) {
      c.fired.add(key);
      ev.push(e);
    }
  };
  once('sting', c.t >= c.stingAt, { kind: 'sting', level: c.level.id });
  once('burst', c.t >= c.burstAt && c.burst > 0, { kind: 'burst', count: c.burst });
  c.flashes.forEach((ft, i) => once('flash' + i, c.t >= ft, { kind: 'flash', index: i }));
  c.texts.forEach((x, i) => once('text' + i, c.u >= x.at, { kind: 'text', slot: x.slot, text: x.text }));
  if (c.t >= c.seconds) c.done = true;
  return ev;
}

export function skipCutscene(c) {
  c.done = true;
  c.u = 1;
}

/** Curves for the renderer: camera zoom, light tint and glow, all 0..1 and exactly 0 at both ends (and always 0 with reduced motion). */
export function cutsceneParams(c) {
  if (c.done && c.u >= 1) return { u: 1, camera: 0, tint: 0, glow: 0, spin: 0 };
  const u = c.u;
  const pulse = Math.sin(Math.PI * u);
  const reduced = c.spec.reduced;
  return { u, camera: reduced ? 0 : c.level.camera * Math.pow(pulse, 1.5), tint: smooth(Math.min(1, u * 3)) * (1 - smooth(Math.max(0, (u - 0.7) / 0.3))), glow: pulse, spin: reduced ? 0 : Math.sin(Math.PI * u) * 0.12 };
}

/** The times (seconds) at which a cutscene flashes, for the safety rule "no more than 3 flashes per second". */
export const flashTimes = (c) => [...c.flashes];
export const maxFlashesInAnySecond = (times) => times.reduce((m, t0) => Math.max(m, times.filter((t) => t >= t0 && t < t0 + 1).length), 0);

// ------------------------------------------------------------------ the manager: one thing on screen at a time, sensible queueing
/**
 * results: [{uid, tier, icon, label, title, isNew}]. Settings: {cutscenes:'full'|'short'|'off', reels:'on'|'quick'|'off', reduced:boolean}.
 */
export function createRevealManager({ getSettings, getLogLuck = () => 0, getTheme = () => 'factory', fillers = () => [] } = {}) {
  const m = { current: null, pending: [], cutscene: null, serial: 0, landedHandlers: [] };
  const cfg = () => ({ cutscenes: 'full', reels: 'on', reduced: false, ...(getSettings ? getSettings() : {}) });

  const landed = (results) => m.landedHandlers.forEach((h) => h(results));
  m.onLanded = (h) => m.landedHandlers.push(h);

  function startCutsceneFor(best, c) {
    const lv = cutsceneLevel(best.tier, getLogLuck(), { firstTime: !!best.isNew, cap: c.cutscenes });
    if (lv.seconds <= 0 || lv.id === 'flash') return lv; // 'flash' is shown as a highlight on the reel, not a full-screen scene
    m.cutscene = createCutscene({ level: lv, rarityLabel: best.label, title: best.title || best.label, theme: getTheme(), first: !!best.isNew, reduced: c.reduced, icon: best.icon, color: best.color });
    return lv;
  }

  /** Show results. source: 'manual' | 'auto' (auto-roll uses the short version and never a full-screen cutscene). */
  m.push = (results, { source = 'manual' } = {}) => {
    if (!results.length) return;
    if (m.current || m.cutscene) {
      m.pending.push(...results);
      if (m.pending.length > 500) m.pending = m.pending.slice(-500);
      return;
    }
    const c = cfg();
    const best = results.reduce((a, b) => (b.tier > a.tier ? b : a), results[0]);
    const seed = (m.serial += 1) * 7919 + (best.uid || 0);
    if (c.reels === 'off' || c.reduced) {
      // no spinning: the result is simply shown (reduced motion) or not shown at all (off)
      if (c.reels === 'off') {
        landed(results);
        if (source === 'manual') startCutsceneFor(best, c);
        return;
      }
      m.current = results.length === 1 ? createReel(results[0], { mode: 'static', seed }) : createBatch(results, { mode: 'static', seed });
      if (source === 'manual') startCutsceneFor(best, c);
      m.currentResults = results;
      if (m.current.landed) {
        landed(results);
        m.landedSent = true;
      }
      return;
    }
    const quick = source === 'auto' || c.reels === 'quick';
    const lv = source === 'manual' ? startCutsceneFor(best, c) : { id: 'none' };
    const mode = quick || m.cutscene ? 'quick' : 'normal';
    m.currentResults = results;
    m.current = results.length === 1 ? createReel(results[0], { mode, seed, fillers: fillers() }) : createBatch(results, { mode: 'quick', seed, fillers: fillers() });
    m.flashOn = lv.id === 'flash';
  };

  m.step = (dt) => {
    const out = [];
    if (m.pendingEnd) {
      m.pendingEnd = false;
      out.push({ kind: 'cutsceneDone' });
    }
    if (m.current) {
      const cur = m.current;
      const r = cur.kind === 'reel' ? stepReel(cur, dt) : stepBatch(cur, dt);
      if (r.ticks) out.push({ kind: 'tick', n: r.ticks });
      if (r.landed || (cur.landed && !m.landedSent)) {
        if (!m.landedSent) {
          m.landedSent = true;
          out.push({ kind: 'stop' });
          landed(m.currentResults);
        }
      }
      if (cur.done) {
        m.current = null;
        m.landedSent = false;
      }
    } else if (m.cutscene) {
      if (!m.cutscene.started) {
        m.cutscene.started = true;
        out.push({ kind: 'cutsceneStart', spec: m.cutscene.spec });
      }
      for (const e of stepCutscene(m.cutscene, dt)) out.push(e);
      if (m.cutscene.done) {
        m.cutscene = null;
        out.push({ kind: 'cutsceneDone' });
      }
    }
    if (!m.current && !m.cutscene && m.pending.length) {
      const batch = m.pending;
      m.pending = [];
      // many things arrived while busy: show ONE summary (the best result leads it), not a queue of scenes
      m.push(batch, { source: 'auto' });
    }
    return out;
  };

  m.skip = () => {
    if (m.current) {
      if (m.current.kind === 'reel') skipReel(m.current);
      else skipBatch(m.current);
      if (!m.landedSent) {
        m.landedSent = true;
        landed(m.currentResults);
      }
      if (m.current.done) {
        m.current = null;
        m.landedSent = false;
      }
    } else if (m.cutscene) {
      skipCutscene(m.cutscene);
      m.pendingEnd = true; // the renderer is told (and restores the camera and lights) on the next step
      m.cutscene = null;
    }
    return m.active;
  };

  /** Run the machines forward without rendering (tests, e2e hooks). */
  m.fastForward = (seconds, step = 0.05) => {
    const evs = [];
    for (let t = 0; t < seconds && m.active; t += step) evs.push(...m.step(step));
    return evs;
  };
  Object.defineProperty(m, 'active', { get: () => !!(m.current || m.cutscene) });
  Object.defineProperty(m, 'kind', { get: () => (m.current ? m.current.kind : m.cutscene ? 'cutscene' : null) });
  return m;
}
