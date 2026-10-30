// Game controller: the single DOM-free facade over the simulation. The UI, the debug
// hook (window.__game) and Node tests all drive the game through this object, so a
// user action and a test action take exactly the same code path.
import { SaveManager } from './core/save.js';
import { now, sanitizeElapsed } from './core/time.js';
import { createState, serializeState, deserializeState, SAVE_VERSION, MIGRATIONS, sanitizeSettings } from './sim/state.js';
import { doRoll, stepAutoRoll, accrueFreeRolls, autoRollUnlocked } from './sim/rolling.js';
import { sellItem, sellDuplicates, fuse as fuseItems } from './sim/inventory.js';
import { emit } from './core/events.js';
import { Big } from './core/bignum.js';
import { addToBag, bagFull } from './sim/inventory.js';
import { addMoney } from './sim/economy.js';
import { addXp } from './sim/leveling.js';
import { refreshProduction, stepProduction, incomeRate } from './sim/production.js';
import * as placement from './sim/placement.js';
import * as refiners from './sim/refiners.js';
import * as rebirth from './sim/rebirth.js';
import * as shop from './sim/shop.js';
import * as combat from './sim/combat.js';
import * as quests from './sim/quests.js';
import { applyOffline, WELCOME_MIN_SECONDS } from './sim/offline.js';

export function createGame({ storage, seed } = {}) {
  const save = new SaveManager({ version: SAVE_VERSION, migrations: MIGRATIONS, ...(storage ? { storage } : {}) });
  const loaded = save.load();
  const fromSave = !!loaded.data;
  const savedAt = loaded.data ? Number(loaded.data.savedAt) : 0;
  let state = loaded.data ? deserializeState(loaded.data) : createState(seed);
  refreshProduction(state);
  const offlineHooks = { waves: (st, sec) => combat.offlineWaves(st, sec) };
  const game = {
    offlineHooks,
    welcome: null,
    save,
    loadStatus: loaded.status,
    loadInfo: loaded,
    get state() {
      return state;
    },
    replaceState(s) {
      state = s;
    },

    /** Advance the simulation by dt seconds (fixed step from the loop). */
    step(dt) {
      state.playtime += dt;
      accrueFreeRolls(state, dt);
      stepAutoRoll(state, dt);
      stepProduction(state, dt, addMoney);
      shop.stepBoosters(state, dt);
      const r = combat.stepCombat(state, dt, game.manualInput);
      if (r) game.lastCombat = r;
    },
    manualInput: null,
    lastCombat: null,
    startBoss: () => combat.startEncounter(state, 'boss'),
    startRush: () => combat.startEncounter(state, 'rush'),
    startWaveNow: () => combat.startEncounter(state, 'wave'),
    setManual(on) {
      if (state._enc) combat.setManual(state._enc, on);
      return !!state._enc;
    },
    equip: (uid) => combat.equipWeapon(state, uid),
    unequip: (uid) => combat.unequipWeapon(state, uid),
    /** Change one setting (dot path, e.g. 'camera.speed'); the value is re-validated as a whole. */
    setSetting(path, value) {
      const next = JSON.parse(JSON.stringify(state.settings));
      const parts = path.split('.');
      let o = next;
      for (const p of parts.slice(0, -1)) o = o[p] ??= {};
      o[parts.at(-1)] = value;
      state.settings = sanitizeSettings(next);
      return state.settings;
    },
    nameItem(uid, nick, skin) {
      const it = state.items[uid];
      if (!it) return false;
      const n = String(nick || '').trim().slice(0, 24);
      if (n) it.nick = n;
      else delete it.nick;
      if (Number.isInteger(skin) && skin >= 0 && skin < 8) it.skin = skin;
      else if (skin === null) delete it.skin;
      state._rev = (state._rev || 0) + 1;
      return true;
    },
    leaveEncounter() {
      if (!state._enc) return false;
      if (state._enc.kind === 'wave') return false; // automatic waves cannot be skipped
      state._enc.done = 'lose';
      return true;
    },

    /**
     * Apply progress for time spent away: from the save timestamp (page load) or a stalled frame.
     * Negative elapsed time (clock moved back) is ignored; absurd elapsed time is clamped.
     */
    catchUp(fromMs, toMs = now()) {
      const el = sanitizeElapsed(fromMs, toMs);
      const sum = applyOffline(state, el.seconds, offlineHooks);
      state.savedAt = toMs;
      if (el.seconds >= WELCOME_MIN_SECONDS || el.negative || el.clamped) game.welcome = { ...sum, negative: el.negative, clamped: el.clamped };
      return game.welcome;
    },

    get income() {
      return incomeRate(state);
    },
    place: (uid, x, y, dir) => placement.place(state, uid, x, y, dir),
    rotate: (uid) => placement.rotate(state, uid),
    pickUp: (uid) => placement.pickUp(state, uid),
    sellPlaced: (uid) => placement.sellPlaced(state, uid),
    expand: () => placement.expand(state),
    autoPlace: () => placement.autoLayout(state),
    savePreset: (name) => placement.savePreset(state, name),
    loadPreset: (i) => placement.loadPreset(state, i),
    deletePreset: (i) => placement.deletePreset(state, i),
    prestige(k, { confirmed = false } = {}) {
      if (!confirmed) return { ok: false, needsConfirm: true, preview: rebirth.prestigePreview(state, k) };
      return rebirth.prestige(state, k);
    },
    buyTreeNode: (k, id) => rebirth.buyNode(state, k, id),
    reroll: (uid) => refiners.reroll(state, uid),
    transferMutation: (a, b, id) => refiners.transfer(state, a, b, id),
    combineMutation: (a, b, id) => refiners.combine(state, a, b, id),

    roll(n = 1) {
      return doRoll(state, n);
    },
    sell(uid) {
      return sellItem(state, uid);
    },
    sellDuplicates() {
      return sellDuplicates(state);
    },
    fuse(uids) {
      return fuseItems(state, uids);
    },
    toggleAuto() {
      if (!autoRollUnlocked(state)) return false;
      state.autoRoll = !state.autoRoll;
      return state.autoRoll;
    },
    buyBackpack() {
      const r = shop.buyBackpackTier(state);
      emit(state, 'toast', { text: r.ok ? `Backpack upgraded to tier ${state.backpackTier}` : 'Not enough money for a bigger backpack' });
      return r;
    },
    buyUpgrade: (id) => shop.buyUpgrade(state, id),
    buyBooster: (id) => shop.buyBooster(state, id),
    rotating: () => shop.rotatingOffers(state, now()),
    buyRotating: (idx) => shop.buyRotating(state, idx, now()),
    claimTask: (id) => quests.claimTask(state, id),
    claimDaily: () => quests.claimDaily(state, now()),
    claimPlaytime: (id) => quests.claimPlaytime(state, id),
    claimMilestone: (id) => quests.claimMilestone(state, id),
    openChest: (slot) => quests.openChest(state, slot, now()),

    saveNow() {
      return save.save(serializeState(state, now()));
    },
    exportText() {
      return save.exportText(serializeState(state, now()));
    },
    importText(text) {
      const r = save.importText(text);
      if (!r.ok) return r;
      state = deserializeState(r.data);
      refreshProduction(state);
      game.saveNow();
      return { ok: true };
    },
    /** Test/debug hooks (exposed as window.__game.game.debug). Not used by normal play. */
    debug: {
      grantMoney(n) {
        addMoney(state, Big.from(n));
      },
      grantXp(n) {
        return addXp(state, Big.from(n), state._onLevel);
      },
      setLevel(l) {
        state.level = Math.max(1, Math.floor(l));
      },
      giveItem(tpl, tier = 0, mut = []) {
        return addToBag(state, { tpl, tier, vs: 0, hy: null, mut }, { force: true });
      },
      fillBag() {
        while (!bagFull(state)) addToBag(state, { tpl: 'belt', tier: 0, vs: 0, hy: null, mut: [] });
      },
      advance(sec, dt = 0.05) {
        for (let t = 0; t < sec; t += dt) game.step(dt);
      },
    },
    hardReset() {
      save.wipe();
      state = createState();
      refreshProduction(state);
      game.saveNow();
    },
  };
  if (fromSave) game.catchUp(savedAt); // offline progress, closed form
  return game;
}
