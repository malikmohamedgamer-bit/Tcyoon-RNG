// Screen-reader announcements (throttled) and accessibility settings application.
let lastAt = 0;
let queued = null;
let timer = null;
const MIN_GAP_MS = 1500;

function write(text, assertive) {
  const el = document.getElementById(assertive ? 'sr-alert' : 'sr-live');
  if (!el) return;
  el.textContent = '';
  // a tick later so repeated identical messages are announced again
  setTimeout(() => {
    el.textContent = text;
  }, 30);
}

/**
 * Announce to screen readers. Calls closer than 1.5 s are merged (the latest wins)
 * so a burst of rolls or events does not flood the live region. `urgent` bypasses the throttle.
 */
export function announce(text, { urgent = false } = {}) {
  const t = performance.now();
  if (urgent) {
    write(text, true);
    lastAt = t;
    return;
  }
  if (t - lastAt >= MIN_GAP_MS) {
    write(text, false);
    lastAt = t;
    return;
  }
  queued = text;
  if (!timer) {
    timer = setTimeout(() => {
      timer = null;
      if (queued) write(queued, false);
      queued = null;
      lastAt = performance.now();
    }, MIN_GAP_MS - (t - lastAt));
  }
}
