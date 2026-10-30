// Roll panel: roll buttons, free rolls, auto-roll, odds (data-driven, shown in full), pity.
import { esc } from './dom.js';
import { rollCost, luckOf, freeRollInterval, freeRollCap } from '../sim/economy.js';
import { maxBatch, autoRollUnlocked, oddsTable, typicalTier } from '../sim/rolling.js';
import { bagFull, bagFree } from '../sim/inventory.js';
import { PITY } from '../gen/tiers.js';
import { formatDuration } from '../core/time.js';
import { tierInfo } from '../gen/tiers.js';
import ECON from '../data/economy.json' with { type: 'json' };
import { rarityBadge } from './itemcard.js';
import { itemTitle } from '../sim/items.js';
import { levelReward, describeReward } from '../sim/rewards.js';
import { needMore } from './feedback.js';

export function createRollPanel(ctx) {
  const { game, fmt, ui } = ctx;
  return {
    id: 'roll',
    label: 'Roll',
    icon: '🎲',
    view() {
      const s = game.state;
      const cost = rollCost(s);
      const can = maxBatch(s);
      const free = s.freeRoll.count;
      const cap = freeRollCap(s);
      const full = bagFull(s);
      const luck = luckOf(s);
      const left = Math.max(0, freeRollInterval(s) - s.freeRoll.progress);
      const broke = free === 0 && s.money.lt(cost);
      const batchBtn = (n, lvl) =>
        n <= can
          ? `<button data-act="roll" data-id="${n}" ${full || (free === 0 && s.money.lt(cost)) ? 'disabled' : ''}>Roll ×${n}</button>`
          : `<button disabled title="Unlocks at level ${lvl}" aria-label="Roll x${n}, unlocks at level ${lvl}">Roll ×${n} 🔒 Lv ${lvl}</button>`;
      const typ = typicalTier(luck);
      const rows = oddsTable(luck, Math.max(0, typ - 2), 8)
        .map(
          (r) =>
            `<tr><td>${r.info.icon} ${esc(r.info.label)}</td><td>${fmt(r.atLeast.mul(100), 3)}%</td><td>1 in ${fmt(r.oneIn)}</td></tr>`,
        )
        .join('');
      const recent = ui.recent.map((r) => `<li>${rarityBadge(r.tier)} ${esc(r.title)}</li>`).join('');
      return `
      <h2>🎲 Roll <span class="muted" style="font-size:.8rem">Luck ×${fmt(luck)}</span></h2>
      ${ui.msg ? `<p class="msg ${ui.msg.kind || ''}" role="status">${esc(ui.msg.text)}</p>` : ''}
      <button class="primary big-btn" data-tut="roll" data-act="roll" data-id="1" ${full || broke ? 'disabled' : ''}>
        ${free > 0 ? `Free roll (${free})` : `Roll — $${fmt(cost)}`}</button>
      <div class="row2" style="margin-top:.4rem">${batchBtn(10, ECON.roll.x10Level)}${batchBtn(100, ECON.roll.x100Level)}
        ${
          autoRollUnlocked(s)
            ? `<label class="row"><input type="checkbox" data-act="auto" ${s.autoRoll ? 'checked' : ''}> Auto-roll</label>`
            : `<span class="muted">Auto-roll 🔒 Lv ${ECON.roll.autoLevel}</span>`
        }</div>
      <p class="muted">Free rolls: <b>${free}/${cap}</b> ${free < cap ? `· next in ${formatDuration(left)}` : '· full (timer paused)'}<br>
      Backpack: <b>${s.bag.length}/${s.bag.length + bagFree(s)}</b>${full ? ' <b class="bad">FULL</b>' : ''}</p>
      ${
        full
          ? `<div class="msg" role="alert">Backpack full — rolls are blocked. <div class="row2"><button data-act="sell-dupes">Sell duplicates</button><button data-act="open-backpack">Open backpack</button></div></div>`
          : broke
            ? `<div class="msg" role="status">${esc(needMore(game, fmt, cost))}. Place a dropper and a seller on your base to earn money, or sell items you do not need. <div class="row2"><button data-act="open-base">Open the Base</button><button data-act="open-backpack">Open the Backpack</button></div></div>`
            : ''
      }
      <p class="muted">🎁 Level ${s.level + 1} reward: ${esc(describeReward(levelReward(s.level + 1)))}</p>
      <h3>Pity</h3>
      ${PITY.map((p) => {
        const v = s.pity[p.id] || 0;
        return `<div>${esc(p.id)}: ${v}/${p.every} rolls <small class="muted">(guarantees at least a 1-in-${p.x} result)</small><div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${p.every}" aria-valuenow="${Math.min(v, p.every)}"><i style="width:${Math.min(100, (v / p.every) * 100)}%"></i></div></div>`;
      }).join('')}
      <details open><summary>Odds at your luck</summary>
        <table class="odds"><thead><tr><th>Tier</th><th>Chance ≥</th><th>This tier</th></tr></thead><tbody>${rows}</tbody></table>
        <p class="muted">Tiers never end: there is always a rarer one above ${esc(tierInfo(typ + 7).label)}.</p></details>
      ${recent ? `<h3>Recent rolls</h3><ul class="plain">${recent}</ul>` : ''}`;
    },
    act(name, el) {
      switch (name) {
        case 'roll': {
          const r = game.roll(Number(el.dataset.id) || 1);
          for (const it of r.rolled) {
            ui.recent.unshift({ tier: it.tier, title: itemTitle(it) });
          }
          ui.recent.length = Math.min(ui.recent.length, 6);
          if (r.blocked === 'full') ui.msg = { text: 'Backpack is full — sell or fuse something first.' };
          else if (r.blocked === 'money') ui.msg = { text: 'Not enough money for the next roll.' };
          else if (r.blocked === 'locked') ui.msg = { text: `That roll size unlocks at level ${Number(el.dataset.id) >= 100 ? ECON.roll.x100Level : ECON.roll.x10Level}.` };
          else ui.msg = r.rolled.length > 1 ? { text: `Rolled ${r.rolled.length} items.`, kind: 'ok' } : null;
          break;
        }
        case 'auto':
          game.toggleAuto();
          break;
        case 'sell-dupes': {
          const r = game.sellDuplicates();
          ui.msg = { text: r.count ? `Sold ${r.count} duplicates for $${fmt(r.value)}.` : 'No duplicates to sell.', kind: 'ok' };
          break;
        }
        case 'open-backpack':
          ctx.open('backpack');
          break;
        case 'open-base':
          ctx.open('base');
          break;
        default:
      }
    },
  };
}
