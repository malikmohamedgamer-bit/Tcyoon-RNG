// Index panel (collection book). The list is virtualised: only the rows in view (plus a few) are in the DOM,
// whatever the number of discovered entries, so endless generated sections stay light.
import { esc } from './dom.js';
import { ico } from './icons.js';
import { SECTIONS, SECTION_INFO, sectionStats, overallStats, listEntries, describeEntry, rewardSteps, claimableCount } from '../sim/index.js';
import { tierInfo, HAND_TIER_COUNT } from '../gen/tiers.js';
import { BASE_THEMES } from '../gen/themes.js';
import { TYPES } from '../sim/items.js';

const ROW_REM = 5.6; // fixed row height (CSS --row) so windowing needs no measuring
const BUFFER = 3;
const VIEW_ROWS = 6;

export function createIndexPanel(ctx) {
  const { game, ui } = ctx;
  ui.idx = { section: 'items', q: '', theme: '', type: '', minTier: 0, status: '', scroll: 0 };
  const rowPx = () => ROW_REM * parseFloat(getComputedStyle(document.documentElement).fontSize || '16');
  const fmtDate = (ms) => (ms ? new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '');
  const opt = (v, label, cur) => `<option value="${esc(v)}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(label)}</option>`;

  function row(state, section, e, i, total, px) {
    const d = describeEntry(state, section, e.id);
    const tierBadge = d.found && d.tier != null && section !== 'rarities' ? `<span class="rar" style="--tc:${tierInfo(d.tier).color}">${ico(tierInfo(d.tier).icon)} ${esc(d.tierLabel)}</span>` : '';
    const color = d.found && d.tier != null ? tierInfo(d.tier).color : 'var(--line)';
    if (!d.found) {
      return `<div class="vrow entry locked" role="listitem" aria-posinset="${i + 1}" aria-setsize="${total}" style="top:${i * px}px;height:${px}px">
        <span class="pic" aria-hidden="true">${ico(d.icon)}</span>
        <div class="txt"><b>???</b><small class="muted">${esc(d.hint)}</small></div></div>`;
    }
    return `<div class="vrow entry" role="listitem" aria-posinset="${i + 1}" aria-setsize="${total}" style="top:${i * px}px;height:${px}px;--tc:${color}">
      <span class="pic" aria-hidden="true">${ico(d.icon)}</span>
      <div class="txt"><b>${esc(d.name)}</b> ${tierBadge}${e.bonus ? '<span class="badge">generated</span>' : ''}<small class="muted">${esc(d.desc)}</small><small class="muted">${esc(d.odds)}</small>
      <small>Found ${d.n}× · first ${esc(fmtDate(d.first))}${d.theme ? ` · ${esc(d.theme)}` : ''}${d.won ? ` · beaten ${d.won}×` : ''}</small></div></div>`;
  }

  // scrolling the list re-renders the visible window (scroll events do not bubble: listen in the capture phase)
  const hostEl = document.getElementById('panels');
  let raf = 0;
  hostEl.addEventListener('scroll', (e) => {
    if (!(e.target instanceof Element) || !e.target.matches('[data-scroll="index"]')) return;
    ui.idx.scroll = e.target.scrollTop;
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; ctx.refreshAll(); });
  }, true);

  return {
    id: 'index',
    label: 'Index',
    icon: 'book',
    badge: () => claimableCount(game.state),
    view() {
      const s = game.state;
      const st = ui.idx;
      const px = rowPx();
      const list = listEntries(s, st.section, { q: st.q, theme: st.theme, type: st.type, minTier: Number(st.minTier) || 0, status: st.status });
      const total = list.length;
      const first = Math.max(0, Math.floor(st.scroll / px) - BUFFER);
      const last = Math.min(total, Math.ceil((st.scroll + VIEW_ROWS * px) / px) + BUFFER + VIEW_ROWS);
      const rows = [];
      for (let i = first; i < last; i++) rows.push(row(s, st.section, list[i], i, total, px));
      const stats = sectionStats(s, st.section);
      const all = overallStats(s);
      const steps = rewardSteps(s, st.section);
      const allStep = rewardSteps(s, 'all')[0];
      const tabs = SECTIONS.map((id) => {
        const x = sectionStats(s, id);
        return `<button class="tab" data-act="idx-section" data-id="${id}" aria-pressed="${st.section === id}">${ico(SECTION_INFO[id].icon)}<span>${esc(SECTION_INFO[id].name)}</span><small>${x.pct}%</small></button>`;
      }).join('');
      const reward = (r) => `<li class="${r.claimed ? 'muted' : ''}">${r.pct}%: ${esc(r.text)} ${r.claimed ? `${ico('check')} claimed` : r.reached ? `<button class="primary" data-act="idx-claim" data-id="${r.id}">Claim</button>` : '<span class="muted">locked</span>'}</li>`;
      const tierOpts = opt('0', 'Any rarity', st.minTier) + Array.from({ length: HAND_TIER_COUNT - 1 }, (_, i) => opt(String(i + 1), `${tierInfo(i + 1).name} or better`, st.minTier)).join('');
      return `<h2>${ico('book')} Index <span class="muted" style="font-size:.85rem">${all.pct}% complete</span></h2>
      <div class="bar" role="progressbar" aria-label="Overall completion" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${all.pct}"><i style="width:${all.pct}%"></i></div>
      <nav class="tabs" aria-label="Index sections">${tabs}</nav>
      <p class="muted">${esc(SECTION_INFO[st.section].blurb)} <b>${stats.found}/${stats.reference}</b>${stats.bonus ? ` + ${stats.bonus} more (generated, endless)` : ''} · ${stats.pct}%</p>
      <label>Search <input type="search" data-act="idx-q" data-fid="idx-q" value="${esc(st.q)}" placeholder="Name…" aria-label="Search this section"></label>
      <details ${st.status || st.theme || st.type || st.minTier ? 'open' : ''}><summary>Filters</summary>
      <div class="row2 filters">
        <label>Show <select data-act="idx-filter" data-key="status" data-fid="idx-status">${opt('', 'Everything', st.status)}${opt('found', 'Found', st.status)}${opt('missing', 'Missing', st.status)}</select></label>
        <label>Found in <select data-act="idx-filter" data-key="theme" data-fid="idx-theme">${opt('', 'Any theme', st.theme)}${BASE_THEMES.map((t) => opt(t.id, t.name, st.theme)).join('')}</select></label>
        ${st.section === 'items' ? `<label>Type <select data-act="idx-filter" data-key="type" data-fid="idx-type">${opt('', 'Any type', st.type)}${Object.entries(TYPES).filter(([k]) => k !== 'weapon').map(([k, t]) => opt(k, t.label, st.type)).join('')}</select></label>` : ''}
        ${st.section !== 'rarities' ? `<label>Best rarity <select data-act="idx-filter" data-key="minTier" data-fid="idx-tier">${tierOpts}</select></label>` : ''}
      </div></details>
      <div role="status" class="muted" aria-live="polite">${total} ${total === 1 ? 'entry' : 'entries'}${st.q || st.theme || st.type || st.minTier || st.status ? ' match your filters' : ''}</div>
      <div class="vlist" data-scroll="index" tabindex="0" role="list" aria-label="${esc(SECTION_INFO[st.section].name)} list" style="--row:${ROW_REM}rem">
        <div class="vspacer" style="height:${total * px}px">${rows.join('')}</div>
        ${total === 0 ? '<div class="empty"><b>Nothing matches.</b><span>Change the search or the filters.</span></div>' : ''}
      </div>
      <h3>Completion rewards</h3>
      <ul class="plain">${steps.map(reward).join('')}</ul>
      <ul class="plain"><li><b>Everything:</b> ${esc(allStep.text)} ${allStep.claimed ? `${ico('check')} claimed` : allStep.reached ? `<button class="primary" data-act="idx-claim" data-id="${allStep.id}">Claim</button>` : `<span class="muted">${allStep.progress}% overall — needs every section at 100%</span>`}</li></ul>
      <p class="muted">Rewards are paid once each. Locked entries show a hint; endless sections keep adding entries as you find rarer things.</p>`;
    },
    act(name, el) {
      const st = ui.idx;
      switch (name) {
        case 'idx-section':
          st.section = el.dataset.id;
          st.scroll = 0;
          st.type = '';
          break;
        case 'idx-q':
          st.q = el.value;
          st.scroll = 0;
          ctx.refreshAll();
          break;
        case 'idx-filter':
          st[el.dataset.key] = el.value;
          st.scroll = 0;
          break;
        case 'idx-claim': {
          const r = game.index.claim(el.dataset.id);
          if (!r.ok) ctx.toast(r.reason);
          break;
        }
        default:
      }
    },
  };
}
