// The Index (collection book): what the player has discovered. Pure and endless-safe:
//   * discovery is recorded where things enter the game (items in the backpack, mutations, monsters at the
//     start of a wave, bosses), never by scanning;
//   * lists are built as light descriptors and described lazily (`describeEntry`), so the UI can virtualise them;
//   * endless sections (rarities, generated mutations, bosses) list what is found plus a few locked silhouettes;
//   * completion rewards are claimed through a ledger, exactly once each.
import IDX from '../data/index.json' with { type: 'json' };
import ITEMS from '../data/items.json' with { type: 'json' };
import WEAPONS from '../data/weapons.json' with { type: 'json' };
import MUT from '../data/mutations.json' with { type: 'json' };
import EN from '../data/enemies.json' with { type: 'json' };
import { emit } from '../core/events.js';
import { TYPES, TEMPLATES, typeOf, isWeapon } from './items.js';
import { getMutation } from '../gen/mutations.js';
import { tierInfo, HAND_TIER_COUNT, MAX_TIER } from '../gen/tiers.js';
import { bossDef } from '../gen/bosses.js';
import { grantSpec, describeReward } from './rewards.js';
import { describeMutationEffects, TYPE_TERMS } from './glossary.js';
import { regionTheme } from '../gen/themes.js';

export const SECTIONS = Object.keys(IDX.sections);
export const SECTION_INFO = IDX.sections;
export const STEPS = IDX.steps;
export const REWARDS = IDX.rewards;
const MAX_ENTRIES = 50_000; // per section when loading a save

const HAND_TEMPLATES = ITEMS.templates;
const WEAPON_LIST = WEAPONS.templates;
const MONSTERS = EN.templates;
const HAND_MUTATIONS = MUT.mutations;

export const createIndexState = () => ({ items: {}, rarities: {}, mutations: {}, weapons: {}, monsters: {}, bosses: {}, claimed: {} });

const isRec = (v) => v && typeof v === 'object' && Number.isFinite(Number(v.n));
const cleanRec = (v) => ({ n: Math.max(1, Math.floor(Number(v.n))), first: Number.isFinite(Number(v.first)) ? Number(v.first) : 0, th: typeof v.th === 'string' ? v.th.slice(0, 12) : '', ...(Number.isFinite(Number(v.best)) ? { best: Math.max(0, Math.floor(Number(v.best))) } : {}), ...(Number.isFinite(Number(v.won)) ? { won: Math.max(0, Math.floor(Number(v.won))) } : {}) });

export function sanitizeIndex(raw) {
  const out = createIndexState();
  if (!raw || typeof raw !== 'object') return out;
  const okId = {
    items: (k) => HAND_TEMPLATES.some((t) => t.id === k),
    weapons: (k) => WEAPON_LIST.some((t) => t.id === k),
    monsters: (k) => MONSTERS.some((t) => t.id === k),
    mutations: (k) => !!getMutation(k),
    rarities: (k) => Number.isInteger(Number(k)) && Number(k) >= 0 && Number(k) <= MAX_TIER,
    bosses: (k) => Number.isInteger(Number(k)) && Number(k) >= 0 && Number(k) < 1e9,
  };
  for (const s of SECTIONS) {
    let n = 0;
    for (const [k, v] of Object.entries(raw[s] || {})) {
      if (n >= MAX_ENTRIES) break;
      if (isRec(v) && okId[s](k)) {
        out[s][k] = cleanRec(v);
        n++;
      }
    }
  }
  for (const [k, v] of Object.entries(raw.claimed || {})) if (v === true && typeof k === 'string' && k.length < 40) out.claimed[k] = true;
  return out;
}

// ------------------------------------------------------------------ recording
const themeOf = (state) => regionTheme(state.region || 0, state.seed || 1).base || 'factory';

function record(state, section, id, name, extra = {}) {
  const sec = state.index[section];
  const key = String(id);
  const cur = sec[key];
  if (cur) {
    cur.n += extra.n ?? 1;
    if (extra.best != null) cur.best = Math.max(cur.best ?? 0, extra.best);
    if (extra.won) cur.won = (cur.won || 0) + extra.won;
    return false;
  }
  sec[key] = { n: extra.n ?? 1, first: Date.now(), th: themeOf(state), ...(extra.best != null ? { best: extra.best } : {}), ...(extra.won ? { won: extra.won } : {}) };
  emit(state, 'discover', { section, id: key, name, tier: extra.best ?? null });
  return true;
}

/** An item entered the game (backpack): records its template, rarity and mutations. Practice items never count. */
export function noteItem(state, item) {
  if (!item || item.practice || !state.index) return;
  const tpl = TEMPLATES.get(item.tpl);
  if (!tpl) return;
  if (isWeapon(item)) record(state, 'weapons', item.tpl, tpl.name, { best: item.tier });
  else record(state, 'items', item.tpl, tpl.name, { best: item.tier });
  record(state, 'rarities', item.tier, tierInfo(item.tier).label);
  for (const m of item.mut || []) {
    const def = getMutation(m[0]);
    if (def) record(state, 'mutations', m[0], def.name);
  }
}

/** A wave or boss encounter starts: every monster kind in it is now known (counted per monster). */
export function noteEncounter(state, kind, queue, bossN) {
  if (!state.index) return;
  if (kind === 'boss') {
    record(state, 'bosses', bossN, bossDef(bossN).name);
    return;
  }
  const counts = new Map();
  for (const q of queue) if (q.e && q.e.tpl) counts.set(q.e.tpl, (counts.get(q.e.tpl) || 0) + 1);
  for (const [tpl, n] of counts) {
    const t = MONSTERS.find((m) => m.id === tpl);
    if (t) record(state, 'monsters', tpl, t.name, { n });
  }
}

export function noteBossWin(state, bossN) {
  const rec = state.index?.bosses[String(bossN)];
  if (rec) rec.won = (rec.won || 0) + 1;
}

/** Fill the Index of a save that predates it from what the save proves (items owned, bosses beaten, waves reached). */
export function backfillIndex(state) {
  for (const it of Object.values(state.items)) noteItem(state, it);
  for (let n = 0; n < Math.min(state.combat.bossIndex, 1000); n++) {
    record(state, 'bosses', n, bossDef(n).name);
    noteBossWin(state, n);
  }
  for (const m of MONSTERS) if (m.minWave <= state.combat.bestWave && state.combat.bestWave > 1) record(state, 'monsters', m.id, m.name);
  // a backfill is not a discovery fanfare
  state._ev = (state._ev || []).filter((e) => e.type !== 'discover');
}

// ------------------------------------------------------------------ listing
/** Reference entries (what counts toward 100%) per section, as ids in display order. */
function referenceIds(section) {
  switch (section) {
    case 'items': return HAND_TEMPLATES.map((t) => t.id);
    case 'weapons': return WEAPON_LIST.map((t) => t.id);
    case 'monsters': return MONSTERS.map((t) => t.id);
    case 'mutations': return HAND_MUTATIONS.map((m) => m.id);
    case 'rarities': return Array.from({ length: IDX.sections.rarities.reference }, (_, i) => String(i));
    case 'bosses': return Array.from({ length: IDX.sections.bosses.reference }, (_, i) => String(i));
    default: return [];
  }
}

export function sectionStats(state, section) {
  const ref = referenceIds(section);
  const found = state.index[section];
  const inRef = ref.filter((id) => found[id]).length;
  const total = Object.keys(found).length;
  return { found: inRef, reference: ref.length, pct: ref.length ? Math.floor((inRef / ref.length) * 100) : 0, bonus: Math.max(0, total - inRef), total };
}

export function overallStats(state) {
  let f = 0;
  let r = 0;
  for (const s of SECTIONS) {
    const st = sectionStats(state, s);
    f += st.found;
    r += st.reference;
  }
  return { found: f, reference: r, pct: r ? Math.floor((f / r) * 100) : 0 };
}

const numericSort = (a, b) => Number(a) - Number(b);

/**
 * Light descriptors for a section: [{id, found}], found ones first in reference order, bonus (endless) found entries after
 * the reference, then a few locked silhouettes. `opts`: q (search), theme, type (items), minTier, status ('found'|'missing').
 * The list is cheap to build even with tens of thousands of found entries (no per-entry description here).
 */
export function listEntries(state, section, opts = {}) {
  const found = state.index[section];
  const ref = referenceIds(section);
  const inRef = new Set(ref);
  const out = ref.map((id) => ({ id, found: !!found[id] }));
  const bonus = Object.keys(found).filter((id) => !inRef.has(id));
  if (section === 'rarities' || section === 'bosses') bonus.sort(numericSort);
  for (const id of bonus) out.push({ id, found: true, bonus: true });
  const preview = IDX.sections[section].lockedPreview || 0;
  if (preview) {
    const nums = Object.keys(found).filter((k) => /^\d+$/.test(k)).map(Number);
    let next = nums.length ? Math.max(...nums, ref.length - 1) + 1 : ref.length;
    if (section === 'mutations') {
      const gen = Object.keys(found).filter((k) => k.startsWith('g:')).map((k) => Number(k.slice(2)));
      next = gen.length ? Math.max(...gen) + 1 : 0;
    }
    for (let i = 0; i < preview; i++) out.push({ id: section === 'mutations' ? `g:${next + i}` : String(next + i), found: false, preview: true });
  }
  return filterEntries(state, section, out, opts);
}

function filterEntries(state, section, list, opts) {
  const { q = '', theme = '', type = '', minTier = 0, status = '' } = opts;
  if (!q && !theme && !type && !minTier && !status) return list;
  const words = String(q).toLowerCase().split(/\s+/).filter(Boolean);
  const found = state.index[section];
  return list.filter((e) => {
    if (status === 'found' && !e.found) return false;
    if (status === 'missing' && e.found) return false;
    const rec = found[e.id];
    if (theme && (!rec || rec.th !== theme)) return false;
    if (type && section === 'items' && typeOf({ tpl: e.id }) !== type) return false;
    if (minTier && (!rec || (rec.best ?? Number(e.id)) < minTier)) return false;
    if (words.length) {
      if (!e.found) return false; // undiscovered entries have no name to search: the silhouette hides it
      const name = describeEntry(state, section, e.id).name.toLowerCase();
      return words.every((w) => name.includes(w));
    }
    return true;
  });
}

// ------------------------------------------------------------------ describing one entry
const pctText = (p) => (p >= 1 ? `${Number(p.toFixed(1))}%` : `${Number(p.toPrecision(2))}%`);
const typeShare = (type) => TYPES[type].weight / Object.values(ITEMS.types).reduce((a, t) => a + t.weight, 0);

/**
 * Full details of one entry. Locked entries return only a hint (silhouette). Pure; call it only for visible rows.
 * @returns {{id,section,name,icon,found,n,first,theme,tier,tierLabel,desc,odds,hint,won}}
 */
export function describeEntry(state, section, id) {
  const rec = state.index[section][String(id)] || null;
  const base = { id: String(id), section, found: !!rec, n: rec ? rec.n : 0, first: rec ? rec.first : 0, theme: rec ? rec.th : '', tier: rec?.best ?? null, tierLabel: rec?.best != null ? tierInfo(rec.best).label : '', won: rec?.won || 0 };
  switch (section) {
    case 'items': {
      const t = HAND_TEMPLATES.find((x) => x.id === id);
      const sameType = HAND_TEMPLATES.filter((x) => x.type === t.type);
      const share = typeShare(t.type) * (t.weight / sameType.reduce((a, x) => a + x.weight, 0));
      return { ...base, name: rec ? t.name : '???', icon: t.shape, type: t.type, desc: `${TYPES[t.type].label}: ${TYPE_TERMS[t.type].short}`, odds: `${pctText(share * 100)} of rolls are this item (any rarity)`, hint: `A ${TYPES[t.type].label.toLowerCase()} you get by rolling${t.minLevel ? `, from level ${t.minLevel}` : ''}.` };
    }
    case 'weapons': {
      const t = WEAPON_LIST.find((x) => x.id === id);
      const share = t.weight / WEAPON_LIST.reduce((a, x) => a + x.weight, 0);
      return { ...base, name: rec ? t.name : '???', icon: t.shape || 'weapon', type: 'weapon', desc: `${t.dtype} damage${t.special ? `, ${t.special.kind}` : ''}. ${TYPE_TERMS.weapon.short}`, odds: `${pctText(share * 100)} of weapons are this one`, hint: 'A weapon: roll from level 4 or defeat bosses.' };
    }
    case 'mutations': {
      const def = getMutation(id);
      const hand = HAND_TEMPLATES && MUT.mutations.find((m) => m.id === id);
      return { ...base, name: rec ? def.name : '???', icon: def.icon, desc: `Effect: ${describeMutationEffects(def) || 'a bonus'}`, odds: hand ? `${pctText(hand.chance * 100)} base chance on an item${hand.minTier ? ` of tier ${hand.minTier}+` : ''}` : String(id).startsWith('boss:') ? 'Only from defeating a boss' : 'Generated: appears on very rare items', hint: hand ? `Rolled on items${hand.minTier ? ` of tier ${hand.minTier} or better` : ''}.` : 'Found on rarer and rarer items, forever.' };
    }
    case 'rarities': {
      const ti = tierInfo(Number(id));
      return { ...base, name: rec ? ti.label : '???', icon: ti.icon, tier: Number(id), tierLabel: ti.label, desc: `Tier ${Number(id)}. Worth about ×${ti.value.format({ digits: 3 })} a Common.`, odds: `About 1 in ${ti.odds.format({ digits: 3 })} rolls at luck ×1`, hint: `Roll more or raise your luck: about 1 in ${ti.odds.format({ digits: 2 })} at luck ×1.` };
    }
    case 'monsters': {
      const t = MONSTERS.find((x) => x.id === id);
      const pool = MONSTERS.filter((x) => x.minWave <= t.minWave);
      const share = t.weight / pool.reduce((a, x) => a + x.weight, 0);
      const bits = [t.range > 4 ? 'ranged' : 'melee', ...(t.traits || []), ...Object.entries(t.res || {}).map(([k, v]) => `${v > 0 ? 'resists' : 'weak to'} ${k}`)];
      return { ...base, name: rec ? t.name : '???', icon: t.icon, desc: `${bits.join(', ')}. Comes in groups of ${t.count}.`, odds: `About ${pctText(share * 100)} of wave ${t.minWave} slots`, hint: `Appears in waves from wave ${t.minWave}.` };
    }
    case 'bosses': {
      const d = bossDef(Number(id));
      return { ...base, name: rec ? d.name : '???', icon: d.icon, desc: `Boss #${Number(id) + 1}, like wave ${d.wave}. ${d.mechanics.length} special moves.${base.won ? ` Defeated ${base.won}×.` : ''}`, odds: `Challenge it in the Combat panel (unlocks at level 10)`, hint: Number(id) === 0 ? 'Challenge your first boss from level 10.' : `Defeat boss #${Number(id)} first.` };
    }
    default:
      return { ...base, name: '???', icon: 'help', desc: '', odds: '', hint: '' };
  }
}

// ------------------------------------------------------------------ completion rewards
/** Reward steps for a section (or 'all') with their state: [{id, pct, reached, claimed, reward, text}] */
export function rewardSteps(state, section) {
  if (section === 'all') {
    const o = overallStats(state);
    const done = SECTIONS.every((s) => sectionStats(state, s).pct >= 100);
    return [{ id: 'all:100', pct: 100, reached: done, claimed: !!state.index.claimed['all:100'], reward: REWARDS.all, text: describeReward(REWARDS.all), progress: o.pct }];
  }
  const st = sectionStats(state, section);
  return STEPS.map((p) => ({ id: `${section}:${p}`, pct: p, reached: st.pct >= p, claimed: !!state.index.claimed[`${section}:${p}`], reward: REWARDS.sections[String(p)], text: describeReward(REWARDS.sections[String(p)]), progress: st.pct }));
}

export function claimableCount(state) {
  let n = 0;
  for (const s of [...SECTIONS, 'all']) for (const r of rewardSteps(state, s)) if (r.reached && !r.claimed) n++;
  return n;
}

/** Claim one completion reward by its id ("items:50", "all:100"). Exactly once: the ledger is checked and set first. */
export function claimIndexReward(state, id) {
  const [section] = String(id).split(':');
  if (section !== 'all' && !SECTIONS.includes(section)) return { ok: false, reason: 'Unknown reward' };
  const step = rewardSteps(state, section).find((r) => r.id === id);
  if (!step) return { ok: false, reason: 'Unknown reward' };
  if (state.index.claimed[id]) return { ok: false, reason: 'Already claimed' };
  if (!step.reached) return { ok: false, reason: `Reach ${step.pct}% of this section first` };
  state.index.claimed[id] = true;
  const given = grantSpec(state, step.reward, { key: `index:${id}` });
  emit(state, 'toast', { text: `Index reward: ${step.text}` });
  return { ok: true, text: step.text, given };
}

/** Light summary for the dock badge and Index header. */
export const indexSummary = (state) => ({ overall: overallStats(state), claimable: claimableCount(state) });

export { HAND_TIER_COUNT };
