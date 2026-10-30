// Quests, achievements, daily reward, playtime rewards, level-milestone chests and rotating
// chests. Every claim is recorded in the ledger `state.rewards.claimed[id]` so a reward can
// never be granted twice (reload, double click, import and replay all see the same ledger).
import Q from '../data/quests.json' with { type: 'json' };
import { rngFrom } from '../core/rng.js';
import { emit } from '../core/events.js';
import { dateKey, daysBetween, blockIndex } from '../core/time.js';
import { word } from '../gen/names.js';
import { grantSpec } from './rewards.js';
import { luckOf } from './economy.js';
import { typicalTier } from './rolling.js';

export const QUESTS = Q.quests;
export const ACHIEVEMENTS = Q.achievements;
const GEN_STATS = ['rolls', 'sold', 'placed', 'fused', 'bought', 'rebirths'];
const GEN_BASE = { rolls: 50000, sold: 2000, placed: 500, fused: 100, bought: 100, rebirths: 50 };

export function statValue(state, stat) {
  switch (stat) {
    case 'level': return state.level;
    case 'playtime': return state.playtime / 60;
    default: return state.stats[stat] || 0;
  }
}

const claimed = (state, id) => !!state.rewards.claimed[id];

function markClaimed(state, id) {
  state.rewards.claimed[id] = true;
}

/** Endless generated quest n (n >= 0). Pure. */
export function genQuest(n) {
  const stat = GEN_STATS[n % GEN_STATS.length];
  const round = Math.floor(n / GEN_STATS.length);
  const target = Math.ceil(GEN_BASE[stat] * Math.pow(1.8, round));
  return {
    id: `q:${n}`,
    name: `${word('quest' + n, 2)}'s Trial`,
    desc: `${stat === 'bought' ? 'Buy things' : stat === 'rebirths' ? 'Rebirth' : stat === 'sold' ? 'Sell items' : stat === 'placed' ? 'Place items' : stat === 'fused' ? 'Fuse items' : 'Roll items'}: ${target.toLocaleString('en-US')} in total`,
    stat,
    target,
    gen: true,
    reward: { rollPrices: 5 + round, freeRolls: 1, ...(n % 3 === 0 ? { items: [{ tierPlus: 1 }] } : {}), ...(n % 4 === 1 ? { luckPct: 1 } : {}) },
  };
}

/** All tasks currently visible: hand-written quests, achievements, and the next 3 unclaimed generated quests. */
export function allTasks(state) {
  const tasks = [...QUESTS.map((t) => ({ ...t, kind: 'quest' })), ...ACHIEVEMENTS.map((t) => ({ ...t, kind: 'achievement' }))];
  let n = 0;
  while (claimed(state, `q:${n}`)) n++;
  for (let i = 0; i < 3; i++) tasks.push({ ...genQuest(n + i), kind: 'quest' });
  return tasks;
}

export function taskProgress(state, t) {
  const value = statValue(state, t.stat);
  return { value, target: t.target, done: value >= t.target, claimed: claimed(state, t.id), ratio: Math.min(1, value / t.target) };
}

export function claimTask(state, id) {
  const t = allTasks(state).find((x) => x.id === id);
  if (!t) return { ok: false, reason: 'Unknown quest' };
  if (claimed(state, id)) return { ok: false, reason: 'Already claimed' };
  if (!taskProgress(state, t).done) return { ok: false, reason: 'Not finished yet' };
  markClaimed(state, id);
  const given = grantSpec(state, t.reward, { key: `task|${id}` });
  emit(state, 'questDone', { id, name: t.name, text: given.text });
  return { ok: true, given };
}

export const claimableTasks = (state) => allTasks(state).filter((t) => taskProgress(state, t).done && !claimed(state, t.id));

// ------------------------------------------------------------------ daily reward
export function dailyStatus(state, nowMs) {
  const today = dateKey(nowMs);
  const d = state.rewards.daily;
  const available = d.last !== today;
  let streak = d.streak;
  if (available) streak = d.last && daysBetween(d.last, today) === 1 ? d.streak + 1 : 1;
  return { today, available, nextStreak: streak, lastDate: d.last };
}

export function claimDaily(state, nowMs) {
  const st = dailyStatus(state, nowMs);
  if (!st.available) return { ok: false, reason: 'Already claimed today' };
  const c = Q.daily;
  const spec = { rollPrices: c.rollPrices * (1 + c.streakBonus * Math.min(st.nextStreak - 1, c.streakCap)), freeRolls: c.freeRolls };
  if (st.nextStreak % c.itemEvery === 0) spec.items = [{ tier: typicalTier(luckOf(state)) + 1 }];
  state.rewards.daily = { last: st.today, streak: st.nextStreak };
  markClaimed(state, `daily:${st.today}`);
  const given = grantSpec(state, spec, { key: `daily|${st.today}` });
  emit(state, 'daily', { streak: st.nextStreak, text: given.text });
  return { ok: true, streak: st.nextStreak, given };
}

// ------------------------------------------------------------------ playtime rewards
export function playtimeList(state) {
  const th = Q.playtime.thresholds.slice();
  const every = Q.playtime.everyAfter;
  const last = th[th.length - 1];
  const done = Math.max(0, Math.floor((state.playtime - last) / every));
  for (let k = 1; k <= done + 1; k++) th.push(last + every * k); // endless: one more every day of play
  return th.map((sec) => ({ id: `pt:${sec}`, seconds: sec, ready: state.playtime >= sec, claimed: claimed(state, `pt:${sec}`), reward: Q.playtime.reward }));
}

export function claimPlaytime(state, id) {
  const e = playtimeList(state).find((x) => x.id === id);
  if (!e) return { ok: false, reason: 'Unknown reward' };
  if (e.claimed) return { ok: false, reason: 'Already claimed' };
  if (!e.ready) return { ok: false, reason: 'Keep playing' };
  markClaimed(state, id);
  return { ok: true, given: grantSpec(state, e.reward, { key: `pt|${id}` }) };
}

// ------------------------------------------------------------------ level milestones
export function milestoneLevels(state) {
  const l = Q.milestones.levels.slice();
  let next = l[l.length - 1] * 2;
  while (l.length < 60 && l[l.length - 1] < state.level * 2) {
    l.push(next);
    next *= 2;
  }
  return l;
}

export function milestoneReward() {
  return { rollPrices: 3, backpack: 2, items: [{ tierPlus: 2 }, { tierPlus: 1 }] };
}

export function milestoneList(state) {
  return milestoneLevels(state).map((L) => ({ id: `lm:${L}`, level: L, ready: state.level >= L, claimed: claimed(state, `lm:${L}`), reward: milestoneReward() }));
}

export function claimMilestone(state, id) {
  const e = milestoneList(state).find((x) => x.id === id);
  if (!e) return { ok: false, reason: 'Unknown milestone' };
  if (e.claimed) return { ok: false, reason: 'Already claimed' };
  if (!e.ready) return { ok: false, reason: `Reach level ${e.level}` };
  markClaimed(state, id);
  return { ok: true, given: grantSpec(state, e.reward, { key: `lm|${id}` }) };
}

// ------------------------------------------------------------------ rotating chests
const CHESTS = [
  { name: 'Wooden chest', icon: 'box', weight: 6, reward: { rollPrices: 3 }, tierAdd: -1 },
  { name: 'Silver chest', icon: 'chest', weight: 3, reward: { rollPrices: 8, freeRolls: 1 }, tierAdd: 0 },
  { name: 'Golden chest', icon: 'crown', weight: 1, reward: { rollPrices: 20, freeRolls: 2 }, tierAdd: 1 },
];

/** The chests of the current 6-hour block (same for everyone with the same seed; rotate by time). */
export function chestSlots(state, nowMs) {
  const block = blockIndex(nowMs, Q.chests.hours);
  const rng = rngFrom(state.seed, 'chests', block);
  const base = typicalTier(luckOf(state));
  const out = [];
  for (let i = 0; i < Q.chests.slots; i++) {
    const def = CHESTS[rng.weighted(CHESTS.map((c) => c.weight))];
    const id = `chest:${block}:${i}`;
    out.push({ id, slot: i, block, name: def.name, icon: def.icon, claimed: claimed(state, id), reward: { ...def.reward, items: [{ tier: Math.max(0, base + def.tierAdd) }] } });
  }
  return out;
}

export function openChest(state, slot, nowMs) {
  const c = chestSlots(state, nowMs)[slot];
  if (!c) return { ok: false, reason: 'No such chest' };
  if (c.claimed) return { ok: false, reason: 'Already opened' };
  markClaimed(state, c.id);
  // keep the ledger small: forget chest blocks older than 8 blocks
  for (const k of Object.keys(state.rewards.claimed)) {
    if (k.startsWith('chest:') && Number(k.split(':')[1]) < c.block - 8) delete state.rewards.claimed[k];
  }
  return { ok: true, given: grantSpec(state, c.reward, { key: c.id }) };
}

