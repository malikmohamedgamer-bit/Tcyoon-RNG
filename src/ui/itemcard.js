// Item card markup shared by the backpack, shop and arena UIs. Rarity is communicated by
// icon + name + border width/style as well as colour (colour-blind safe).
import { esc } from './dom.js';
import { itemTitle, itemIcon, statLines, templateOf, TYPES } from '../sim/items.js';
import { tierInfo } from '../gen/tiers.js';
import { mutationLabel } from '../sim/mutations.js';

export function rarityBadge(tier) {
  const ti = tierInfo(tier);
  return `<span class="rar" style="--tc:${ti.color}" title="Rarity: ${esc(ti.label)} (tier ${tier})"><span aria-hidden="true">${ti.icon}</span> ${esc(ti.label)}</span>`;
}

export function itemCard(item, fmt, { actions = '', selected = false, extra = '' } = {}) {
  const ti = tierInfo(item.tier);
  const tpl = templateOf(item);
  const type = TYPES[tpl?.type]?.label || '';
  const muts = (item.mut || []).map((m) => `<span class="badge">${esc(mutationLabel(m))}</span>`).join('');
  const hy = item.hy ? `<span class="badge">🧩 Hybrid: ${esc(item.hy)}</span>` : '';
  const lines = statLines(item, fmt).map((l) => `<li>${esc(l)}</li>`).join('');
  const band = Math.min(6, 1 + Math.floor(Math.log2(item.tier + 1)));
  return `<article class="card item${selected ? ' selected' : ''}" data-uid="${item.uid}" style="--tc:${ti.color};--bw:${band}px" aria-label="${esc(ti.label)} ${esc(itemTitle(item))}">
    <header><span class="ico" aria-hidden="true">${itemIcon(item)}</span><div><b>${esc(itemTitle(item))}</b><br><small class="muted">${esc(type)}</small></div>${rarityBadge(item.tier)}</header>
    ${muts || hy ? `<div class="badges">${muts}${hy}</div>` : ''}
    <ul class="stats">${lines}</ul>${extra}
    <div class="row2">${actions}</div>
  </article>`;
}
