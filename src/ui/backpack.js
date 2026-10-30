// Backpack panel: items, per-item sell, multi-select fuse with documented odds, sell duplicates, upgrade.
import { esc } from './dom.js';
import { itemCard } from './itemcard.js';
import { sellValue, backpackCapacity, backpackCost } from '../sim/economy.js';
import { canFuse, fuseChance, sortBag } from '../sim/inventory.js';
import ECON from '../data/economy.json' with { type: 'json' };

export function createBackpackPanel(ctx) {
  const { game, fmt, ui } = ctx;
  return {
    id: 'backpack',
    label: 'Backpack',
    icon: '🎒',
    view() {
      const s = game.state;
      const cap = backpackCapacity(s);
      for (const u of [...ui.selected]) if (!s.items[u] || s.items[u].loc !== 'bag') ui.selected.delete(u);
      const sel = [...ui.selected];
      const chk = sel.length ? canFuse(s, sel) : null;
      const chance = chk && chk.ok ? fuseChance(chk.items, Math.min(ECON.fuse.pityMax, s.fusePity * ECON.fuse.pityStep)) : 0;
      const cards = s.bag
        .map((u) => {
          const it = s.items[u];
          const actions = `${ctx.placeButton ? ctx.placeButton(it) : ''}
            <button data-act="sell" data-uid="${u}">Sell $${fmt(sellValue(s, it))}</button>
            <label class="row"><input type="checkbox" data-act="select" data-uid="${u}" ${ui.selected.has(u) ? 'checked' : ''}> Fuse</label>`;
          return itemCard(it, fmt, { actions, selected: ui.selected.has(u) });
        })
        .join('');
      return `
      <h2>🎒 Backpack <span class="muted" style="font-size:.85rem">${s.bag.length}/${cap}</span></h2>
      <div class="bar" role="progressbar" aria-label="Backpack fullness" aria-valuemin="0" aria-valuemax="${cap}" aria-valuenow="${s.bag.length}"><i style="width:${Math.min(100, (s.bag.length / cap) * 100)}%"></i></div>
      ${ui.bmsg ? `<p class="msg ${ui.bmsg.kind || ''}" role="status">${esc(ui.bmsg.text)}</p>` : ''}
      <div class="row2" style="margin:.4rem 0">
        <button data-act="sell-dupes">Sell duplicates</button>
        <button data-act="sort">Sort</button>
        <button data-act="upgrade" ${s.money.lt(backpackCost(s)) ? 'disabled' : ''}>Bigger backpack $${fmt(backpackCost(s))}</button>
      </div>
      <div class="card">
        <b>Fuse</b> <span class="muted">${ECON.fuse.min}–${ECON.fuse.max} items of the same tier → one item of the next tier.
        Odds: ${Math.round(ECON.fuse.baseChance * 100)}% for ${ECON.fuse.min}, +${Math.round(ECON.fuse.perExtra * 100)}% per extra item, +${Math.round(ECON.fuse.identicalBonus * 100)}% if all the same item, max ${Math.round(ECON.fuse.maxChance * 100)}%.
        A failed fuse still gives one item of the same tier.</span>
        <div class="row2" style="margin-top:.3rem">
          <button data-act="fuse" ${chk && chk.ok ? '' : 'disabled'}>Fuse ${sel.length} selected${chk && chk.ok ? ` (${Math.round(chance * 100)}%)` : ''}</button>
          <button data-act="clear-sel" ${sel.length ? '' : 'disabled'}>Clear</button>
        </div>
        ${sel.length && chk && !chk.ok ? `<small class="bad">${esc(chk.reason)}</small>` : ''}
      </div>
      <div class="grid" style="margin-top:.5rem">${cards || '<p class="muted">Your backpack is empty. Roll for items!</p>'}</div>`;
    },
    act(name, el) {
      const uid = Number(el.dataset.uid);
      switch (name) {
        case 'sell': {
          const r = game.sell(uid);
          ui.selected.delete(uid);
          ui.bmsg = r.ok ? { text: `Sold for $${fmt(r.value)}`, kind: 'ok' } : { text: r.reason };
          break;
        }
        case 'select':
          if (el.checked) ui.selected.add(uid);
          else ui.selected.delete(uid);
          break;
        case 'clear-sel':
          ui.selected.clear();
          break;
        case 'sort':
          sortBag(game.state);
          break;
        case 'sell-dupes': {
          const r = game.sellDuplicates();
          ui.bmsg = { text: r.count ? `Sold ${r.count} duplicates for $${fmt(r.value)}.` : 'No exact duplicates to sell.', kind: 'ok' };
          break;
        }
        case 'upgrade': {
          const r = game.buyBackpack();
          ui.bmsg = r.ok ? { text: 'Backpack upgraded.', kind: 'ok' } : { text: 'Not enough money.' };
          break;
        }
        case 'fuse': {
          const r = game.fuse([...ui.selected]);
          ui.selected.clear();
          ui.bmsg = r.ok
            ? { text: r.success ? `Fusion succeeded! You got ${esc(r.item.tpl)} of the next tier.` : 'Fusion failed — you got one item of the same tier.', kind: r.success ? 'ok' : '' }
            : { text: r.reason };
          break;
        }
        default:
          if (ctx.backpackAct) ctx.backpackAct(name, el);
      }
    },
  };
}
