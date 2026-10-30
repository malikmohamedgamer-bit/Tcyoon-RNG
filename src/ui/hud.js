// HUD chips, dock buttons and the open-panel manager. Frequently changing numbers use
// [data-bind] elements updated in place; panels re-render through patchHtml (focus-safe).
import { ico } from './icons.js';
import { Big } from '../core/bignum.js';
import { esc, patchHtml, delegate, textInput, term } from './dom.js';
import { levelProgress } from '../sim/leveling.js';
import { luckOf } from '../sim/economy.js';
import { PANEL_RULES } from '../sim/disclosure.js';
import { effectiveSpeed } from '../sim/speed.js';

export function createShell({ game, fmt, panels, onOpen, onSpeed }) {
  const hudEl = document.getElementById('hud');
  const dock = document.getElementById('dock');
  const host = document.getElementById('panels');
  let openId = null;
  let panelEl = null;
  let bodyEl = null;

  hudEl.innerHTML = `
    <div class="chip money" data-chip="money"><small>${ico('coin')}${term('money', 'Money')}</small><b data-bind="money">0</b></div>
    <button type="button" class="chip" data-chip="income" data-act-income aria-label="Income per second. Open the income breakdown"><small>${ico('bolt')}${term('income', 'Income', { focus: false })}</small><b data-bind="income">$0/s</b></button>
    <div class="chip" data-chip="level"><small>${ico('star')}${term('level', 'Level')} <span data-bind="level">1</span></small><b data-bind="xp">0%</b><div class="xpbar"><i data-bind="xpbar" style="width:0"></i></div></div>
    <div class="chip" data-chip="luck"><small>${ico('clover')}${term('luck', 'Luck')}</small><b data-bind="luck">×1</b></div>
    <div class="chip" data-chip="region"><small>${ico('globe')}${term('region', 'Region')}</small><b data-bind="region">1</b></div>
    <button type="button" class="chip" data-chip="speed" data-act-speed aria-label="Game speed. Press to switch to the next unlocked speed" hidden><small>${ico('gauge')}${term('speed', 'Speed', { focus: false })}</small><b data-bind="speed">1×</b></button>
    <div class="chip" data-chip="fps"><small>${ico('pulse')}${term('fps', 'FPS')}</small><b data-bind="fps">--</b></div>`;
  hudEl.querySelector('[data-act-income]').addEventListener('click', () => toggle('income'));
  hudEl.querySelector('[data-act-speed]').addEventListener('click', () => onSpeed && onSpeed());
  const refs = {};
  hudEl.querySelectorAll('[data-bind]').forEach((n) => (refs[n.dataset.bind] = n));

  dock.innerHTML = panels
    .filter((p) => !p.hidden)
    .map((p) => `<button type="button" data-panel="${p.id}" aria-pressed="false" aria-controls="panels">${ico(p.icon)}<span class="lbl">${esc(p.label)}</span><span class="badge-n" data-badge="${p.id}" hidden></span></button>`)
    .join('');
  dock.addEventListener('click', (e) => {
    const b = e.target.closest('[data-panel]');
    if (b) toggle(b.dataset.panel);
  });

  function toggle(id) {
    open(openId === id ? null : id);
  }
  function open(id) {
    openId = id;
    if (id && game.state.ui) game.state.ui.opened[id] = true;
    dock.querySelectorAll('[data-panel]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.panel === id)));
    host.textContent = '';
    panelEl = bodyEl = null;
    if (id) {
      const p = panels.find((x) => x.id === id);
      panelEl = document.createElement('section');
      panelEl.className = 'panel';
      panelEl.setAttribute('aria-label', p.label);
      panelEl.tabIndex = -1;
      bodyEl = document.createElement('div');
      panelEl.innerHTML = `<button type="button" class="close" data-close aria-label="Close panel">${ico('cross')}</button>`;
      panelEl.appendChild(bodyEl);
      host.appendChild(panelEl);
      panelEl.querySelector('[data-close]').addEventListener('click', () => open(null));
      delegate(bodyEl, (name, el, ev) => {
        p.act(name, el, ev);
        refresh();
      });
      textInput(bodyEl, (name, el, ev) => p.act(name, el, ev));
      refresh();
      panelEl.focus({ preventScroll: true });
    }
    if (onOpen) onOpen(id);
  }
  function refresh() {
    if (!openId) return;
    const p = panels.find((x) => x.id === openId);
    patchHtml(bodyEl, p.view());
  }

  let frames = 0;
  let last = performance.now();
  return {
    /** Show/hide dock buttons and HUD chips from the player's layout settings. */
    /** `vis` = {panels:Set, chips:Set} from sim/disclosure.js (progressive disclosure); settings can hide more. */
    applyLayout(settings, vis = null) {
      const shown = (id) => !vis || vis.panels.has(id);
      dock.querySelectorAll('[data-panel]').forEach((b) => {
        const id = b.dataset.panel;
        b.hidden = (settings.hiddenPanels.includes(id) && id !== 'settings') || !shown(id);
      });
      hudEl.querySelectorAll('[data-chip]').forEach((c) => {
        const k = c.dataset.chip;
        c.hidden = (k in settings.hud ? !settings.hud[k] : false) || (vis ? !vis.chips.has(k) : false);
      });
      if (openId && ((settings.hiddenPanels.includes(openId) && openId !== 'settings') || (vis && !vis.panels.has(openId) && openId !== 'income'))) open(null);
    },
    open,
    toggle,
    get openId() {
      return openId;
    },
    refresh,
    frame() {
      frames++;
      const t = performance.now();
      if (t - last >= 1000) {
        refs.fps.textContent = String(Math.round((frames * 1000) / (t - last)));
        frames = 0;
        last = t;
      }
    },
    update(income) {
      const s = game.state;
      for (const p of panels) {
        if (!p.badge) continue;
        const b = dock.querySelector(`[data-badge="${p.id}"]`);
        const n = p.badge();
        b.hidden = !n;
        b.textContent = String(n);
      }
      for (const b of dock.querySelectorAll('[data-panel]')) b.classList.toggle('is-new', !!(s.ui.unlocked[b.dataset.panel] && s.ui.opened[b.dataset.panel] !== true && PANEL_RULES[b.dataset.panel] !== null));
      refs.money.textContent = '$' + fmt(s.money);
      refs.income.textContent = '$' + fmt(income || Big.fromNumber(0)) + '/s';
      refs.level.textContent = String(s.level);
      const p = levelProgress(s);
      refs.xp.textContent = Math.floor(p * 100) + '%';
      refs.xpbar.style.width = p * 100 + '%';
      refs.luck.textContent = '×' + fmt(luckOf(s));
      refs.region.textContent = String(s.region + 1);
      refs.speed.textContent = `${effectiveSpeed(s)}×`;
    },
  };
}
