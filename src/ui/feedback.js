// Plain explanations for "why can't I?" with a one-click fix where there is one.
import { formatDuration } from '../core/time.js';

/** "Need $X more (about N s of income)" or '' when affordable. */
export function needMore(game, fmt, cost) {
  const s = game.state;
  const miss = cost.sub(s.money);
  if (miss.lte(0)) return '';
  const inc = game.income;
  const secs = inc.gt(0) ? miss.div(inc).toNumber() : Infinity;
  return `Need $${fmt(miss)} more${Number.isFinite(secs) ? ` (about ${formatDuration(secs)} of income)` : ' (build an income first: place a dropper and a seller)'}`;
}
