// Accessibility: throttled screen-reader announcements and application of display settings
// (contrast, reduced motion, text scale, accent colour, colour-blind rarity cues).
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

/** Black or white text for a background colour (WCAG relative luminance). */
export function readableOn(hex) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const L = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  // black text beats white text exactly when L > ~0.179 (equal contrast at that luminance); 0.4 was wrong for mid-bright accents
  return L > 0.179 ? '#000000' : '#ffffff';
}

/** Does the player (or the OS) want reduced motion? */
export function prefersReducedMotion(settings) {
  if (settings.motion === 'reduced') return true;
  if (settings.motion === 'full') return false;
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

/** Apply display-related accessibility settings to the document. */
export function applyA11y(settings) {
  const root = document.documentElement;
  root.dataset.contrast = settings.contrast;
  root.dataset.motion = prefersReducedMotion(settings) ? 'reduced' : 'full';
  root.dataset.cb = settings.colorblind ? '1' : '0';
  root.style.setProperty('--ui-scale', String(settings.uiScale));
  if (settings.accent && settings.contrast !== 'high') {
    root.style.setProperty('--accent', settings.accent);
    root.style.setProperty('--accent-text', readableOn(settings.accent));
  } else {
    root.style.removeProperty('--accent');
    root.style.removeProperty('--accent-text');
  }
}
