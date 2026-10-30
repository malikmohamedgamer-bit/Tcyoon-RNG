// HUD chips, dock buttons and the open-panel manager. Frequently changing numbers use
// [data-bind] elements updated in place; panels re-render through patchHtml (focus-safe).
import { Big } from '../core/bignum.js';
import { esc, patchHtml, delegate, textInput } from './dom.js';
import { levelProgress } from '../sim/leveling.js';
import { luckOf } from '../sim/economy.js';

export function createShell({ game, fmt, panels, onOpen }) {
  const hudEl = document.getElementById('hud');
  const dock = document.getElementById('dock');
  const host = document.getElementById('panels');
  let openId = null;
  let panelEl = null;
  let bodyEl = null;

  hudEl.innerHTML = `
    <div class="chip money" data-chip="money"><small>Money</small><b data-bind="money">0</b></div>
    <div class="chip" data-chip="income"><small>Income</small><b data-bind="income">$0/s</b></div>
    <div class="chip" data-chip="level"><small>Level <span data-bind="level">1</span></small><b data-bind="xp">0%</b><div class="xpbar"><i data-bind="xpbar" style="width:0"></i></div></div>
    <div class="chip" data-chip="luck"><small>Luck</small><b data-bind="luck">×1</b></div>
    <div class="chip" data-chip="region"><small>Region</small><b data-bind="region">1</b></div>
    <div class="chip" data-chip="fps"><small>FPS</small><b data-bind="fps">--</b></div>`;
  const refs = {};
  hudEl.querySelectorAll('[data-bind]').forEach((n) => (refs[n.dataset.bind] = n));

  dock.innerHTML = panels
    .map((p) => `<button type="button" data-panel="${p.id}" aria-pressed="false" aria-controls="panels"><span aria-hidden="true">${p.icon}</span> ${esc(p.label)}<span class="badge-n" data-badge="${p.id}" hidden></span></button>`)
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
      panelEl.innerHTML = '<button type="button" class="close" data-close aria-label="Close panel" style="float:right">✕</button>';
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
    applyLayout(settings) {
      dock.querySelectorAll('[data-panel]').forEach((b) => {
        b.hidden = settings.hiddenPanels.includes(b.dataset.panel) && b.dataset.panel !== 'settings';
      });
      hudEl.querySelectorAll('[data-chip]').forEach((c) => {
        const k = c.dataset.chip;
        c.hidden = k in settings.hud ? !settings.hud[k] : false;
      });
      if (openId && settings.hiddenPanels.includes(openId) && openId !== 'settings') open(null);
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
      refs.money.textContent = '$' + fmt(s.money);
      refs.income.textContent = '$' + fmt(income || Big.fromNumber(0)) + '/s';
      refs.level.textContent = String(s.level);
      const p = levelProgress(s);
      refs.xp.textContent = Math.floor(p * 100) + '%';
      refs.xpbar.style.width = p * 100 + '%';
      refs.luck.textContent = '×' + fmt(luckOf(s));
      refs.region.textContent = String(s.region + 1);
    },
  };
}
