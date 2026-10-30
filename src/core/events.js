// Tiny transient event queue. The simulation pushes events (roll results, level-ups,
// wave outcomes...); the shell drains them each frame for toasts, sound, screen-reader
// announcements and effects. Events are never saved and never affect simulation results.

export function emit(state, type, data = {}) {
  if (!state._ev) state._ev = [];
  const ev = { type, ...data };
  if (state._ev.length < 200) state._ev.push(ev);
  if (state._onEvent) state._onEvent(ev); // e.g. the one-time tips (sim/tips.js)
}

export function drain(state) {
  const ev = state._ev || [];
  state._ev = [];
  return ev;
}
