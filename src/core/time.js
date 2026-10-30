// Clock + date helpers. The clock is injectable so tests (and the e2e harness) can
// move time without touching the real system clock.

let clock = () => Date.now();
export const now = () => clock();
export function setClock(fn) {
  clock = typeof fn === 'function' ? fn : () => Date.now();
}

/** Offline progress is clamped to this many seconds (10 years). Documented in README. */
export const MAX_OFFLINE_SECONDS = 10 * 365 * 24 * 3600;

/**
 * Elapsed seconds between two wall-clock timestamps, made safe:
 *   negative (clock moved back) -> 0
 *   non-finite                  -> 0
 *   beyond MAX_OFFLINE_SECONDS  -> clamped
 */
export function sanitizeElapsed(fromMs, toMs) {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return { seconds: 0, negative: false, clamped: false };
  const raw = (toMs - fromMs) / 1000;
  if (raw < 0) return { seconds: 0, negative: true, clamped: false };
  if (raw > MAX_OFFLINE_SECONDS) return { seconds: MAX_OFFLINE_SECONDS, negative: false, clamped: true };
  return { seconds: raw, negative: false, clamped: false };
}

const pad = (n) => String(n).padStart(2, '0');

/** Local calendar day key, e.g. "2026-10-30". */
export function dateKey(ms = now()) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Whole days between two date keys (b - a). */
export function daysBetween(a, b) {
  const pa = a.split('-').map(Number);
  const pb = b.split('-').map(Number);
  const ta = Date.UTC(pa[0], pa[1] - 1, pa[2]);
  const tb = Date.UTC(pb[0], pb[1] - 1, pb[2]);
  return Math.round((tb - ta) / 86400000);
}

/** Index of the N-hour block containing ms (used by rotating chests). */
export function blockIndex(ms, hours) {
  return Math.floor(ms / (hours * 3600 * 1000));
}

export function formatDuration(sec) {
  sec = Math.max(0, Math.floor(sec));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (sec < 3600) return `${m}m ${sec % 60}s`;
  const h = Math.floor(sec / 3600);
  if (sec < 86400) return `${h}h ${m % 60}m`;
  const d = Math.floor(sec / 86400);
  if (d < 365) return `${d}d ${h % 24}h`;
  const y = Math.floor(d / 365);
  return `${y}y ${d % 365}d`;
}
