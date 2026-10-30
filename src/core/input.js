// Action-based keyboard input with remappable bindings and conflict detection.
// Bindings map action -> list of key codes (KeyboardEvent.code). Actions live in a
// context ('global' always active; 'base' and 'arena' only in that mode); two actions
// conflict if they share a key and their contexts can be active at the same time.

export const ACTIONS = {
  roll: { label: 'Roll once', ctx: 'global', keys: ['Space'] },
  roll10: { label: 'Roll ×10', ctx: 'global', keys: ['KeyT'] },
  panelRoll: { label: 'Open Roll', ctx: 'global', keys: ['Digit1'] },
  panelBackpack: { label: 'Open Backpack', ctx: 'global', keys: ['Digit2'] },
  panelBase: { label: 'Open Base', ctx: 'global', keys: ['Digit3'] },
  panelShop: { label: 'Open Shop', ctx: 'global', keys: ['Digit4'] },
  panelRebirth: { label: 'Open Rebirth', ctx: 'global', keys: ['Digit5'] },
  panelCombat: { label: 'Open Combat', ctx: 'global', keys: ['Digit6'] },
  panelRewards: { label: 'Open Rewards', ctx: 'global', keys: ['Digit7'] },
  panelSettings: { label: 'Open Settings', ctx: 'global', keys: ['Digit8'] },
  pause: { label: 'Pause', ctx: 'global', keys: ['KeyP'] },
  manual: { label: 'Take / release manual control in a fight', ctx: 'global', keys: ['KeyM'] },
  cancel: { label: 'Cancel / close / leave arena', ctx: 'global', keys: ['Escape'] },
  rotate: { label: 'Rotate item', ctx: 'base', keys: ['KeyR'] },
  sellSel: { label: 'Sell selected item', ctx: 'base', keys: ['KeyX'] },
  pickUp: { label: 'Pick up selected item', ctx: 'base', keys: ['Delete', 'Backspace'] },
  panLeft: { label: 'Pan left', ctx: 'base', keys: ['KeyA', 'ArrowLeft'] },
  panRight: { label: 'Pan right', ctx: 'base', keys: ['KeyD', 'ArrowRight'] },
  panUp: { label: 'Pan up', ctx: 'base', keys: ['KeyW', 'ArrowUp'] },
  panDown: { label: 'Pan down', ctx: 'base', keys: ['KeyS', 'ArrowDown'] },
  orbitLeft: { label: 'Orbit left', ctx: 'base', keys: ['KeyQ'] },
  orbitRight: { label: 'Orbit right', ctx: 'base', keys: ['KeyE'] },
  zoomIn: { label: 'Zoom in', ctx: 'base', keys: ['Equal', 'NumpadAdd'] },
  zoomOut: { label: 'Zoom out', ctx: 'base', keys: ['Minus', 'NumpadSubtract'] },
  resetCam: { label: 'Reset camera', ctx: 'base', keys: ['Home'] },
  moveLeft: { label: 'Arena: move left', ctx: 'arena', keys: ['KeyA', 'ArrowLeft'] },
  moveRight: { label: 'Arena: move right', ctx: 'arena', keys: ['KeyD', 'ArrowRight'] },
  moveUp: { label: 'Arena: move up', ctx: 'arena', keys: ['KeyW', 'ArrowUp'] },
  moveDown: { label: 'Arena: move down', ctx: 'arena', keys: ['KeyS', 'ArrowDown'] },
  fire: { label: 'Arena: fire (hold)', ctx: 'arena', keys: ['KeyF'] },
  dash: { label: 'Arena: dash', ctx: 'arena', keys: ['ShiftLeft'] },
  nova: { label: 'Arena: nova blast', ctx: 'arena', keys: ['KeyQ'] },
  shield: { label: 'Arena: shield', ctx: 'arena', keys: ['KeyE'] },
};

export function defaultBindings() {
  return Object.fromEntries(Object.entries(ACTIONS).map(([k, v]) => [k, v.keys.slice()]));
}

/** Contexts that can be active together: global overlaps with everything; base and arena are exclusive. */
const overlap = (a, b) => a === 'global' || b === 'global' || a === b;

/** @returns {{key:string, actions:string[]}[]} every key bound to two or more actions whose contexts overlap. */
export function findConflicts(bindings) {
  const byKey = new Map();
  for (const [action, keys] of Object.entries(bindings)) {
    if (!ACTIONS[action]) continue;
    for (const k of keys) {
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(action);
    }
  }
  const out = [];
  for (const [key, actions] of byKey) {
    const bad = actions.filter((a, i) => actions.some((b, j) => i !== j && overlap(ACTIONS[a].ctx, ACTIONS[b].ctx)));
    if (bad.length > 1) out.push({ key, actions: bad });
  }
  return out;
}

/** Would binding `key` to `action` conflict with something else? Returns the other actions. */
export function wouldConflict(bindings, action, key) {
  const ctx = ACTIONS[action].ctx;
  return Object.entries(bindings)
    .filter(([a, keys]) => a !== action && keys.includes(key) && overlap(ACTIONS[a].ctx, ctx))
    .map(([a]) => a);
}

/** Replace all keys of an action with a single key if there is no conflict. */
export function rebind(bindings, action, key) {
  const clash = wouldConflict(bindings, action, key);
  if (clash.length) return { ok: false, conflicts: clash, bindings };
  return { ok: true, conflicts: [], bindings: { ...bindings, [action]: [key] } };
}

export const keyLabel = (code) =>
  code.replace(/^Key/, '').replace(/^Digit/, '').replace('Arrow', '↔ ').replace('Escape', 'Esc').replace('Space', 'Space');

const isTyping = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);

export function createInput(target, { getBindings, getContext = () => 'base' }) {
  const down = new Set();
  const handlers = new Map();
  const actionsFor = (code) => {
    const b = getBindings();
    const ctx = getContext();
    return Object.entries(b)
      .filter(([a, keys]) => keys.includes(code) && ACTIONS[a] && (ACTIONS[a].ctx === 'global' || ACTIONS[a].ctx === ctx))
      .map(([a]) => a);
  };
  const onDown = (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey || isTyping(e.target)) return;
    const acts = actionsFor(e.code);
    if (!acts.length) return;
    // when a button/link is focused, Space/Enter belong to it, not to the game
    if ((e.code === 'Space' || e.code === 'Enter') && (e.target.tagName === 'BUTTON' || e.target.tagName === 'A' || e.target.tagName === 'SUMMARY')) return;
    for (const a of acts) {
      const first = !down.has(a);
      down.add(a);
      if (first || e.repeat) for (const h of handlers.get(a) || []) h(e);
    }
    e.preventDefault();
  };
  const onUp = (e) => {
    for (const a of Object.keys(ACTIONS)) if (getBindings()[a]?.includes(e.code)) down.delete(a);
  };
  const clear = () => down.clear();
  target.addEventListener('keydown', onDown);
  target.addEventListener('keyup', onUp);
  window.addEventListener('blur', clear);
  return {
    on(action, fn) {
      if (!handlers.has(action)) handlers.set(action, []);
      handlers.get(action).push(fn);
    },
    isDown: (action) => down.has(action),
    clear,
    detach() {
      target.removeEventListener('keydown', onDown);
      target.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', clear);
    },
  };
}
