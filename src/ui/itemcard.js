// Item card markup shared by the backpack, shop and arena UIs. Rarity is communicated by
// icon + name + border width/style as well as colour (colour-blind safe).
import { ico } from './icons.js';
import { esc, term } from './dom.js';
import { itemTitle, itemIcon, statParts, templateOf, TYPES } from '../sim/items.js';
import { tierInfo } from '../gen/tiers.js';
import { mutationLabel } from '../sim/mutations.js';
import { getMutation } from '../gen/mutations.js';

export function rarityBadge(tier) {
  const ti = tierInfo(tier);
  return `<span class="rar" style="--tc:${ti.color}" data-tip="rarity:${tier}" tabindex="0">${ico(ti.icon)} ${esc(ti.label)}</span>`;
}

/** tips: 'badges' (default: rarity, type, mutations are Tab-reachable) or 'all' (every stat label too, used by the inspector). */
export function itemCard(item, fmt, { actions = '', selected = false, extra = '', tips = 'badges' } = {}) {
  const ti = tierInfo(item.tier);
  const tpl = templateOf(item);
  const type = TYPES[tpl?.type]?.label || '';
  const muts = (item.mut || []).map((m) => `<span class="badge" data-tip="mutation:${esc(m[0])}" tabindex="0">${ico(getMutation(m[0])?.icon || 'sparkle')} ${esc(mutationLabel(m))}</span>`).join('');
  const hy = item.hy ? `<span class="badge" data-tip="hybrid" tabindex="0">${ico('helix')} Hybrid: ${esc(item.hy)}</span>` : '';
  const pr = item.practice ? `<span class="badge" data-tip="practice" tabindex="0">Practice</span>` : '';
  const lines = statParts(item, fmt).map((p) => `<li>${term(p.tip, esc(p.label), { focus: tips === 'all' })}${esc(p.rest)}</li>`).join('');
  const band = Math.min(6, 1 + Math.floor(Math.log2(item.tier + 1)));
  return `<article class="card item${selected ? ' selected' : ''}" data-uid="${item.uid}" data-band="${band}" style="--tc:${ti.color};--bw:${band}px" aria-label="${esc(ti.label)} ${esc(itemTitle(item))}">
    <header><span class="ico" aria-hidden="true">${ico(itemIcon(item))}</span><div><b>${esc(itemTitle(item))}</b><br><small class="muted">${term('type:' + (tpl?.type || 'dropper'), esc(type))}</small></div>${rarityBadge(item.tier)}</header>
    ${muts || hy || pr ? `<div class="badges">${muts}${hy}${pr}</div>` : ''}
    <ul class="stats">${lines}</ul>${extra}
    <div class="row2">${actions}</div>
  </article>`;
}
