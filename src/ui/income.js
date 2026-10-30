// "Why is my income this?": opened by clicking the Income number. A plain list: which line earns what,
// what each item on it does, then every multiplier in the order it is applied (sim/explain.js).
import { ico } from './icons.js';
import { esc, term } from './dom.js';
import { explainIncome } from '../sim/explain.js';

export function createIncomePanel(ctx) {
  const { game, fmt } = ctx;
  const sel = (uid) => `<button class="link" data-act="goto" data-uid="${uid}">show on base</button>`;
  return {
    id: 'income',
    label: 'Income',
    icon: 'coin',
    hidden: true, // opened from the Income number, not from the dock
    view() {
      const s = game.state;
      const e = explainIncome(s);
      const chains = e.chains
        .map(
          (c) => `<li><b>${esc(c.dropper.title)}</b> ${c.seller ? `→ <b>${esc(c.seller.title)}</b>` : '<span class="bad">→ nothing sells its output</span>'}
          <span class="money">$${fmt(c.money)}/s</span>
          <ul class="plain small"><li>makes ${fmt(c.units)} units/s, each worth $${fmt(c.perUnit)}</li>${c.steps.map((st) => `<li>${esc(st.text)}</li>`).join('')}</ul></li>`,
        )
        .join('');
      const mults = e.multipliers.map((m, i) => `<li><span class="muted">${i + 1}.</span> ${esc(m.label)} <b>${esc(m.text)}</b></li>`).join('');
      const problems = [...e.blocked.map((b) => ({ ...b, bad: true })), ...e.idle.map((b) => ({ ...b, bad: false }))]
        .map((b) => `<li class="${b.bad ? 'bad' : 'muted'}">${ico('warning')} ${esc(b.title)} ${esc(b.why)}. ${sel(b.uid)}</li>`)
        .join('');
      return `<h2>$ Why is my income this?</h2>
      <p>Your base earns <b class="money">$${fmt(e.total)}/s</b> (${term('income', 'income', { focus: false })}).</p>
      ${chains ? `<h3>Where it comes from</h3><ol class="plain">${chains}</ol>` : '<p class="msg">Nothing is earning yet. Place a dropper and put a seller where its arrow points. <button data-act="open-base">Open the Base panel</button></p>'}
      ${mults ? `<h3>Multipliers, in the order they are applied</h3><ul class="plain">${mults}</ul>` : '<p class="muted">No multipliers yet. Upgrades in the Shop and rebirth bonuses will show up here.</p>'}
      ${problems ? `<h3>Why it could be higher</h3><ul class="plain">${problems}</ul>` : ''}
      <p class="muted">Each line: units per second × value per unit, changed by every item it passes, then sold. Add the lines and the multipliers and you get your income.</p>`;
    },
    act(name, el) {
      if (name === 'goto') {
        ctx.placement.select(Number(el.dataset.uid));
        ctx.open('base');
      } else if (name === 'open-base') ctx.open('base');
    },
  };
}
