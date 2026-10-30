// Game controller: the single DOM-free facade over the simulation. The UI, the debug
// hook (window.__game) and Node tests all drive the game through this object, so a
// user action and a test action take exactly the same code path.
import { SaveManager } from './core/save.js';
import { now } from './core/time.js';
import { createState, serializeState, deserializeState, SAVE_VERSION, MIGRATIONS } from './sim/state.js';
import { doRoll, stepAutoRoll, accrueFreeRolls, autoRollUnlocked } from './sim/rolling.js';
import { sellItem, sellDuplicates, fuse as fuseItems } from './sim/inventory.js';
import { backpackCost, trySpend } from './sim/economy.js';
import { emit } from './core/events.js';
import { Big } from './core/bignum.js';
import { addToBag, bagFull } from './sim/inventory.js';
import { addMoney } from './sim/economy.js';
import { addXp } from './sim/leveling.js';

export function createGame({ storage, seed } = {}) {
  const save = new SaveManager({ version: SAVE_VERSION, migrations: MIGRATIONS, ...(storage ? { storage } : {}) });
  const loaded = save.load();
  let state = loaded.data ? deserializeState(loaded.data) : createState(seed);
  const game = {
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
    },

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
      const cost = backpackCost(state);
      if (!trySpend(state, cost)) {
        emit(state, 'toast', { text: 'Not enough money for a bigger backpack' });
        return { ok: false, cost };
      }
      state.backpackTier += 1;
      emit(state, 'toast', { text: `Backpack upgraded to tier ${state.backpackTier}` });
      return { ok: true, cost };
    },

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
      game.saveNow();
    },
  };
  return game;
}
