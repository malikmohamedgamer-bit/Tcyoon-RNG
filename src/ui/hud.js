// Always-visible status chips. Numbers use [data-bind] elements that are updated in
// place so screen readers and focus are not disturbed by frequent re-rendering.
import { Big } from '../core/bignum.js';

export function fmt(b, settings) {
  const mode = (settings && settings.numberFormat) || 'suffix';
  return Big.from(b).format({ mode, digits: 2 });
}

export function createHud(root, getState) {
  root.innerHTML = `
    <div class="chip money"><small>Money</small><b data-bind="money">0</b></div>
    <div class="chip"><small>Playtime</small><b data-bind="playtime">0s</b></div>
    <div class="chip"><small>Region</small><b data-bind="region">1</b></div>
    <div class="chip"><small>Frame</small><b data-bind="fps">--</b></div>`;
  const el = (k) => root.querySelector(`[data-bind="${k}"]`);
  const refs = { money: el('money'), playtime: el('playtime'), region: el('region'), fps: el('fps') };
  let frames = 0;
  let last = performance.now();
  return {
    frame() {
      frames++;
      const t = performance.now();
      if (t - last >= 1000) {
        refs.fps.textContent = `${Math.round((frames * 1000) / (t - last))} fps`;
        frames = 0;
        last = t;
      }
    },
    update() {
      const s = getState();
      refs.money.textContent = '$' + fmt(s.money, s.settings);
      refs.playtime.textContent = `${Math.floor(s.playtime)}s`;
      refs.region.textContent = String(s.region + 1);
    },
  };
}
