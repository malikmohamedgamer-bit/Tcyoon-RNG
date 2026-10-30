// The persistent primary action: a big Roll button that is always on screen (not buried in a panel).
// Same wording as before ("Free roll (n)" / "Roll — $cost") so it reads the same everywhere.
import { esc } from './dom.js';
import { ico } from './icons.js';
import { rollCost } from '../sim/economy.js';
import { maxBatch, autoRollUnlocked } from '../sim/rolling.js';
import { bagFull } from '../sim/inventory.js';
import { needMore } from './feedback.js';

export function createRollDock({ root, game, fmt, rollNow, keyLabel }) {
  root.innerHTML = `<div class="roll-wrap">
    <button type="button" class="roll-main primary" data-tut="roll" data-roll="1"><span class="roll-ico">${ico('dice')}</span><span class="roll-text"><span class="roll-label"></span><small class="roll-sub"></small></span></button>
    <button type="button" class="roll-x10" data-roll="10" aria-label="Roll ten items at once" hidden>×10</button>
  </div>`;
  const main = root.querySelector('.roll-main');
  const x10 = root.querySelector('.roll-x10');
  const label = root.querySelector('.roll-label');
  const sub = root.querySelector('.roll-sub');
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-roll]');
    if (b && !b.disabled) rollNow(Number(b.dataset.roll));
  });
  let last = '';
  return {
    update() {
      const s = game.state;
      const cost = rollCost(s);
      const free = s.freeRoll.count;
      const full = bagFull(s);
      const broke = free === 0 && s.money.lt(cost);
      const text = free > 0 ? `Free roll (${free})` : `Roll — $${fmt(cost)}`;
      const note = full ? 'Backpack full: sell or fuse something' : broke ? needMore(game, fmt, cost) : `${keyLabel('roll')}${autoRollUnlocked(s) && s.autoRoll ? ' · auto-roll on' : ''}`;
      const k = `${text}|${note}|${full || broke}|${maxBatch(s) >= 10}`;
      if (k === last) return;
      last = k;
      label.textContent = text;
      sub.textContent = note;
      main.disabled = full || broke;
      main.classList.toggle('is-warn', full || broke);
      x10.hidden = maxBatch(s) < 10;
      x10.disabled = full || (free === 0 && s.money.lt(cost));
      main.setAttribute('aria-label', `${text}. ${esc(note)}`.replace(/&amp;/g, '&'));
    },
  };
}
