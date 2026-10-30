// Draws the reveal state machines (sim/reveal.js): the slot-machine reel above the Roll button, the x10/x100
// summary, and the full-screen rare-item cutscene. The machines own all timing; this file only maps their state
// to the DOM, so skipping and fast-forwarding behave exactly like the real thing. The visual strip is aria-hidden;
// the result is announced once through the live region (main.js) when it lands.
import { esc } from './dom.js';
import { ico } from './icons.js';
import { reelView } from '../sim/reveal.js';
import { tierInfo } from '../gen/tiers.js';

export function createRevealUI({ root, manager, getReduced }) {
  root.innerHTML = `
    <section class="rv-reel" hidden aria-label="Roll result"></section>
    <section class="rv-cut" hidden aria-label="Rare find"></section>
    <div class="rv-flash" hidden></div>`;
  const reelEl = root.querySelector('.rv-reel');
  const cutEl = root.querySelector('.rv-cut');
  const flashEl = root.querySelector('.rv-flash');
  let shown = null; // which machine the DOM was built for
  let shownCut = null;
  let flashTimer = 0;

  const skipBtn = `<button type="button" class="rv-skip" data-rv-skip aria-label="Skip the animation (Escape or Enter)">Skip</button>`;

  function buildReel(m) {
    const strip = [-2, -1, 0, 1, 2].map((d) => `<span class="rv-sym" data-d="${d}"></span>`).join('');
    reelEl.innerHTML = `<div class="rv-card"><div class="rv-window" aria-hidden="true">${strip}</div><div class="rv-name" aria-hidden="true"></div>${skipBtn}</div>`;
    reelEl.dataset.mode = m.mode;
  }
  function buildBatch(b) {
    const reels = b.reels.map((_, i) => `<div class="rv-window mini" data-i="${i}" aria-hidden="true">${[-2, -1, 0, 1, 2].map((d) => `<span class="rv-sym" data-d="${d}"></span>`).join('')}</div>`).join('');
    reelEl.innerHTML = `<div class="rv-card batch"><div class="rv-reels">${reels}</div><div class="rv-counter" aria-hidden="true"></div><div class="rv-summary" aria-hidden="true"></div>${skipBtn}</div>`;
    reelEl.dataset.mode = 'batch';
  }
  function paintSymbols(win, view) {
    for (const el of win.querySelectorAll('.rv-sym')) {
      const d = Number(el.dataset.d);
      const s = view.symbols[d + 2];
      el.style.setProperty('--y', String(d - view.offset + 1));
      const key = `${s.icon}|${s.tier}`;
      if (el._k !== key) {
        el._k = key;
        el.style.setProperty('--tc', tierInfo(s.tier).color);
        el.innerHTML = ico(s.icon);
      }
    }
    win.classList.toggle('blur', view.blur);
    win.classList.toggle('landed', view.landed);
  }

  function updateReel() {
    const cur = manager.current;
    if (!cur) {
      if (shown) {
        shown = null;
        reelEl.hidden = true;
        reelEl.innerHTML = '';
      }
      return;
    }
    if (shown !== cur) {
      shown = cur;
      cur.kind === 'reel' ? buildReel(cur) : buildBatch(cur);
      reelEl.hidden = false;
    }
    if (cur.kind === 'reel') {
      const v = reelView(cur);
      paintSymbols(reelEl.querySelector('.rv-window'), v);
      const name = reelEl.querySelector('.rv-name');
      const r = cur.result;
      const text = v.landed ? `${r.label}${r.title && r.title !== r.label ? ' · ' + r.title : ''}` : '';
      if (name._t !== text) {
        name._t = text;
        name.textContent = text;
        name.style.setProperty('--tc', r.color || tierInfo(r.tier).color);
      }
      reelEl.classList.toggle('flash-hit', v.landed && !!manager.flashOn);
    } else {
      cur.reels.forEach((x, i) => paintSymbols(reelEl.querySelector(`.rv-window[data-i="${i}"]`), reelView(x.reel)));
      const counter = reelEl.querySelector('.rv-counter');
      counter.hidden = !cur.counter || cur.phase !== 'run';
      if (!counter.hidden) counter.textContent = `${cur.shownCount} / ${cur.n}`;
      const sm = reelEl.querySelector('.rv-summary');
      sm.hidden = cur.phase !== 'summary';
      if (!sm.hidden && !sm._built) {
        sm._built = true;
        const b = cur.summary.best;
        sm.innerHTML = `<div class="rv-best" style="--tc:${tierInfo(b.tier).color}">${ico(b.icon)}<span><b>Best: ${esc(b.label)}</b><small>${esc(b.title || '')}</small></span></div>
          <ul class="rv-tiers">${cur.summary.byTier.slice(0, 6).map((t) => `<li style="--tc:${tierInfo(t.tier).color}">${t.count}× ${esc(tierInfo(t.tier).label)}</li>`).join('')}</ul>
          ${cur.summary.newCount ? `<p class="rv-new">${cur.summary.newCount} new in your Index</p>` : ''}`;
      }
    }
  }

  function updateCut() {
    const c = manager.cutscene;
    if (!c) {
      if (shownCut) {
        shownCut = null;
        cutEl.hidden = true;
        cutEl.innerHTML = '';
        cutEl.removeAttribute('style');
      }
      return;
    }
    if (shownCut !== c) {
      shownCut = c;
      const s = c.spec;
      cutEl.innerHTML = `<div class="rv-stage"><div class="rv-orb" aria-hidden="true">${ico(s.icon || 'gem')}</div>
        <div class="rv-lines" aria-hidden="true"><p class="rv-l theme"></p><p class="rv-l rarity"></p><p class="rv-l title"></p><p class="rv-l first"></p><p class="rv-l tag"></p></div>${skipBtn}</div>`;
      cutEl.style.setProperty('--tc', s.color || '#ffffff');
      cutEl.dataset.level = c.level.id;
      cutEl.dataset.reduced = s.reduced ? '1' : '0';
      cutEl.hidden = false;
    }
    cutEl.style.setProperty('--u', c.u.toFixed(3));
    cutEl.style.setProperty('--glow', (Math.sin(Math.PI * c.u)).toFixed(3));
  }

  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-rv-skip]') || e.target.closest('.rv-cut') || e.target.closest('.rv-card')) manager.skip();
  });

  return {
    update() {
      updateReel();
      updateCut();
    },
    /** Engine events -> visuals that are not part of the strip: text lines and the (rare, gentle, <= 3 per second) flash. */
    handle(events) {
      for (const e of events) {
        if (e.kind === 'text') {
          const el = cutEl.querySelector(`.rv-l.${e.slot}`);
          if (el) {
            el.textContent = e.text;
            el.classList.add('show');
          }
        } else if (e.kind === 'flash' && !getReduced()) {
          flashEl.hidden = false;
          clearTimeout(flashTimer);
          flashTimer = setTimeout(() => { flashEl.hidden = true; }, 110);
        }
      }
    },
    clear() {
      shown = shownCut = null;
      reelEl.hidden = cutEl.hidden = flashEl.hidden = true;
    },
  };
}
