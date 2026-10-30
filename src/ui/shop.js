// Shop panel: roll shop, gear & upgrade shop, luck boosters, backpack shop and the daily rotating shop.
import { ico } from './icons.js';
import { esc } from './dom.js';
import { UPGRADES, BOOSTERS, upgradeCost, upgradeLevel, boosterCost, rotatingBought } from '../sim/shop.js';
import { backpackCost, backpackCapacity } from '../sim/economy.js';
import { formatDuration } from '../core/time.js';
import { needMore } from './feedback.js';

export function createShopPanel(ctx) {
  const { game, fmt, ui } = ctx;
  const need = (cost) => {
    const t = needMore(game, fmt, cost);
    return t ? `<br><small class="bad">${esc(t)}</small>` : '';
  };
  const upBlock = (s, cat) =>
    UPGRADES.filter((u) => u.category === cat)
      .map((u) => {
        const lv = upgradeLevel(s, u.id);
        const maxed = u.max > 0 && lv >= u.max;
        const cost = upgradeCost(s, u);
        return `<li class="shop-item"><div><b>${ico(u.icon)} ${esc(u.name)}</b> <span class="muted">Lv ${lv}${u.max ? '/' + u.max : ''}</span><br><small class="muted">${esc(u.desc)}</small>${maxed ? '' : need(cost)}</div>
          <button data-act="buy-up" data-id="${u.id}" ${maxed || s.money.lt(cost) ? 'disabled' : ''}>${maxed ? 'Max' : `Buy $${fmt(cost)}`}</button></li>`;
      })
      .join('');
  return {
    id: 'shop',
    label: 'Shop',
    icon: 'cart',
    view() {
      const s = game.state;
      const rot = game.rotating();
      const boosts = s.boosts.map((b) => `${esc(BOOSTERS.find((x) => x.id === b.id)?.name || b.id)} (${formatDuration(b.left)} left)`).join(', ');
      const offers = rot.offers
        .map((o) => {
          const bought = rotatingBought(s, rot.key, o.idx);
          return `<li class="shop-item"><div><b>${esc(o.label)}</b><br><small class="muted">${o.kind === 'item' ? 'A rolled item of that tier' : o.kind === 'booster' ? 'Timed booster' : 'Permanent upgrade level'}</small>${bought ? '' : need(o.price)}</div>
            <button data-act="buy-rot" data-id="${o.idx}" ${bought || s.money.lt(o.price) ? 'disabled' : ''}>${bought ? `Bought ${ico('check')}` : `Buy $${fmt(o.price)}`}</button></li>`;
        })
        .join('');
      return `<h2>${ico('cart')} Shop</h2>
      ${ui.shopMsg ? `<p class="msg ${ui.shopMsg.kind || ''}" role="status">${esc(ui.shopMsg.text)}</p>` : ''}
      ${boosts ? `<p class="good">Active: ${boosts}</p>` : ''}
      <details open><summary>Daily rotating shop <small class="muted">(${esc(rot.key)} — refreshes by date)</small></summary><ul class="plain">${offers}</ul></details>
      <details open><summary>${ico('clover')} Luck</summary><ul class="plain">${upBlock(s, 'luck')}${BOOSTERS.filter((b) => b.kind === 'luck')
        .map((b) => `<li class="shop-item"><div><b>${ico(b.icon)} ${esc(b.name)}</b><br><small class="muted">${esc(b.desc)}</small>${need(boosterCost(s, b))}</div><button data-act="buy-boost" data-id="${b.id}" ${s.money.lt(boosterCost(s, b)) ? 'disabled' : ''}>Buy $${fmt(boosterCost(s, b))}</button></li>`)
        .join('')}</ul></details>
      <details><summary>${ico('dice')} Roll shop</summary><ul class="plain">${upBlock(s, 'roll')}</ul></details>
      <details><summary>${ico('swords')} Gear & upgrades</summary><ul class="plain">${upBlock(s, 'gear')}${BOOSTERS.filter((b) => b.kind !== 'luck')
        .map((b) => `<li class="shop-item"><div><b>${ico(b.icon)} ${esc(b.name)}</b><br><small class="muted">${esc(b.desc)}</small>${need(boosterCost(s, b))}</div><button data-act="buy-boost" data-id="${b.id}" ${s.money.lt(boosterCost(s, b)) ? 'disabled' : ''}>Buy $${fmt(boosterCost(s, b))}</button></li>`)
        .join('')}</ul></details>
      <details><summary>${ico('backpack')} Backpack shop</summary><ul class="plain"><li class="shop-item"><div><b>Backpack tier ${s.backpackTier + 1}</b><br><small class="muted">${backpackCapacity(s)} slots now · price 400 × 3.2^tier, endless</small>${need(backpackCost(s))}</div><button data-act="buy-bag" ${s.money.lt(backpackCost(s)) ? 'disabled' : ''}>Buy $${fmt(backpackCost(s))}</button></li></ul></details>
      <p class="muted">Upgrade prices = base × roll price × growth^level, so they scale with your progress. Upgrades reset on rebirth.</p>`;
    },
    act(name, el) {
      const id = el.dataset.id;
      const say = (r, ok) => (ui.shopMsg = r.ok ? { text: ok(r), kind: 'ok' } : { text: r.reason });
      switch (name) {
        case 'buy-up': say(game.buyUpgrade(id), (r) => `Upgraded to level ${r.level}.`); break;
        case 'buy-boost': say(game.buyBooster(id), () => 'Booster active.'); break;
        case 'buy-bag': say(game.buyBackpack(), () => 'Backpack upgraded.'); break;
        case 'buy-rot': say(game.buyRotating(Number(id)), (r) => `Bought: ${r.given}`); break;
        default:
      }
    },
  };
}

