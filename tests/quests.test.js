import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, serializeState, deserializeState } from '../src/sim/state.js';
import { QUESTS, ACHIEVEMENTS, allTasks, taskProgress, claimTask, genQuest, claimDaily, dailyStatus, playtimeList, claimPlaytime, milestoneList, claimMilestone, chestSlots, openChest, claimableTasks } from '../src/sim/quests.js';
import { grantSpec } from '../src/sim/rewards.js';
import { drain } from '../src/core/events.js';

const mk = () => createState(31, 0);
const D1 = Date.UTC(2026, 2, 10, 15, 0, 0);
const DAY = 86400 * 1000;

test('there are 30+ quests and every task id is unique with a valid reward', () => {
  assert.ok(QUESTS.length >= 30, `${QUESTS.length} quests`);
  assert.ok(ACHIEVEMENTS.length >= 10);
  const ids = new Set();
  for (const t of [...QUESTS, ...ACHIEVEMENTS]) {
    assert.ok(!ids.has(t.id), 'duplicate ' + t.id);
    ids.add(t.id);
    assert.ok(t.name && t.stat && t.target > 0, t.id);
    for (const k of Object.keys(t.reward)) assert.ok(['rollPrices', 'freeRolls', 'items', 'luckPct', 'backpack'].includes(k), `${t.id}: ${k}`);
  }
});

test('a quest cannot be claimed early, and can be claimed exactly once', () => {
  const s = mk();
  assert.equal(claimTask(s, 'roll10').reason, 'Not finished yet');
  s.stats.rolls = 10;
  const m0 = s.money;
  const r = claimTask(s, 'roll10');
  assert.ok(r.ok);
  assert.ok(s.money.gt(m0));
  const m1 = s.money;
  const again = claimTask(s, 'roll10');
  assert.equal(again.ok, false);
  assert.equal(again.reason, 'Already claimed');
  assert.ok(s.money.eq(m1)); // nothing extra granted
  assert.equal(claimTask(s, 'nope').ok, false);
  assert.ok(taskProgress(s, QUESTS[0]).claimed);
  assert.equal(drain(s).filter((e) => e.type === 'questDone').length, 1);
});

test('progress reads level, playtime(minutes) and counters; claimable list reflects it', () => {
  const s = mk();
  s.level = 12;
  s.playtime = 31 * 60;
  s.stats.rolls = 60;
  s.stats.bestTier = 3;
  const ready = claimableTasks(s).map((t) => t.id);
  for (const id of ['roll10', 'roll50', 'lvl5', 'lvl10', 'play30', 'rare', 'epic', 'a-first']) assert.ok(ready.includes(id), id);
  assert.ok(!ready.includes('roll200') && !ready.includes('lvl25'));
});

test('claims persist through save/load: a reload cannot grant a reward twice', () => {
  const s = mk();
  s.stats.rolls = 100;
  claimTask(s, 'roll10');
  claimDaily(s, D1);
  const t = deserializeState(JSON.parse(JSON.stringify(serializeState(s, 1))));
  const m = t.money;
  assert.equal(claimTask(t, 'roll10').ok, false);
  assert.equal(claimDaily(t, D1).ok, false);
  assert.ok(t.money.eq(m));
  assert.ok(claimTask(t, 'roll50').ok); // other claims still work
});

test('endless generated quests: deterministic, escalating targets, next ones appear as you claim', () => {
  assert.deepEqual(genQuest(7), genQuest(7));
  assert.ok(genQuest(60).target > genQuest(6).target);
  assert.ok(Number.isFinite(genQuest(5000).target));
  const s = mk();
  const first = allTasks(s).filter((t) => t.gen).map((t) => t.id);
  assert.deepEqual(first, ['q:0', 'q:1', 'q:2']);
  s.stats.rolls = 1e9;
  assert.ok(claimTask(s, 'q:0').ok);
  assert.deepEqual(allTasks(s).filter((t) => t.gen).map((t) => t.id), ['q:1', 'q:2', 'q:3']);
  assert.equal(claimTask(s, 'q:0').ok, false);
});

test('daily reward: once per date, streak grows on consecutive days, resets after a gap, item every 7th day', () => {
  const s = mk();
  s.level = 6;
  assert.ok(dailyStatus(s, D1).available);
  const r1 = claimDaily(s, D1);
  assert.ok(r1.ok && r1.streak === 1);
  assert.equal(claimDaily(s, D1 + 3600 * 1000).ok, false); // same date
  assert.equal(dailyStatus(s, D1).available, false);
  const r2 = claimDaily(s, D1 + DAY);
  assert.equal(r2.streak, 2);
  assert.ok(r2.given.money.gt(r1.given.money)); // streak bonus
  const gap = claimDaily(s, D1 + 5 * DAY);
  assert.equal(gap.streak, 1); // missed days reset the streak
  let last;
  for (let d = 1; d <= 6; d++) last = claimDaily(s, D1 + 5 * DAY + d * DAY);
  assert.equal(last.streak, 7);
  assert.equal(last.given.items.length, 1);
});

test('time moving backwards cannot re-claim an old date either (ledger by date key)', () => {
  const s = mk();
  claimDaily(s, D1 + DAY);
  assert.equal(claimDaily(s, D1 + DAY).ok, false);
  const back = claimDaily(s, D1); // earlier date: different key, but it is claimable at most once per date
  assert.ok(back.ok); // an unclaimed earlier date is a distinct date...
  assert.equal(claimDaily(s, D1).ok, false); // ...and still only once
});

test('playtime rewards: unlocked by online playtime, once each, endless', () => {
  const s = mk();
  assert.ok(playtimeList(s).every((e) => !e.ready));
  s.playtime = 1000;
  const ready = playtimeList(s).filter((e) => e.ready).map((e) => e.id);
  assert.deepEqual(ready, ['pt:300', 'pt:900']);
  assert.ok(claimPlaytime(s, 'pt:300').ok);
  assert.equal(claimPlaytime(s, 'pt:300').ok, false);
  assert.equal(claimPlaytime(s, 'pt:1800').reason, 'Keep playing');
  s.playtime = 86400 * 40;
  const list = playtimeList(s);
  assert.ok(list.length > 40);
  assert.ok(list.at(-1).seconds > s.playtime);
});

test('level milestone chests: once each, endless doubling list', () => {
  const s = mk();
  assert.equal(claimMilestone(s, 'lm:10').reason, 'Reach level 10');
  s.level = 30;
  assert.ok(claimMilestone(s, 'lm:10').ok && claimMilestone(s, 'lm:25').ok);
  assert.equal(claimMilestone(s, 'lm:10').ok, false);
  s.level = 1e6;
  const l = milestoneList(s);
  assert.ok(l.length >= 15 && l.at(-1).level >= 1e6);
  assert.ok(l.every((e, i) => i === 0 || e.level > l[i - 1].level));
});

test('rotating chests: same 6h block = same chests, new block = new chests, each opened once', () => {
  const s = mk();
  const a = chestSlots(s, D1);
  const b = chestSlots(s, D1 + 60 * 1000);
  assert.deepEqual(a.map((c) => c.id), b.map((c) => c.id));
  assert.equal(a.length, 3);
  const later = chestSlots(s, D1 + 6 * 3600 * 1000);
  assert.notDeepEqual(a.map((c) => c.id), later.map((c) => c.id));
  const m = s.money;
  assert.ok(openChest(s, 0, D1).ok);
  assert.ok(s.money.gt(m));
  assert.equal(openChest(s, 0, D1).reason, 'Already opened');
  assert.ok(chestSlots(s, D1)[0].claimed);
  assert.ok(openChest(s, 1, D1).ok);
  assert.equal(openChest(s, 7, D1).ok, false);
  // ledger stays small over many blocks
  for (let k = 0; k < 40; k++) openChest(s, 0, D1 + k * 6 * 3600 * 1000);
  assert.ok(Object.keys(s.rewards.claimed).filter((k) => k.startsWith('chest:')).length <= 9 * 3);
});

test('grantSpec grants each part and never produces negative money or NaN', () => {
  const s = mk();
  const bag0 = s.bag.length;
  const g = grantSpec(s, { rollPrices: 3, freeRolls: 2, backpack: 2, luckPct: 5, gear: 1, freeCap: 1, items: [{ tier: 3 }, { tier: 1, tpl: 'belt' }] }, { key: 'x' });
  assert.ok(g.money.gt(0));
  assert.equal(s.freeRoll.count, 3);
  assert.equal(s.bonus.backpack, 2);
  assert.equal(s.bonus.luckPct, 5);
  assert.equal(s.bag.length, bag0 + 2);
  assert.ok(s.money.isFinite() && !s.money.isNegative());
  assert.match(g.text, /free roll/);
});
