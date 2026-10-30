// Rebirth panel: every visible prestige layer (endless), currency, multipliers, tree, confirm dialog.
import { ico } from './icons.js';
import { esc, confirmDialog } from './dom.js';
import { layerDef, currencyMultiplier } from '../gen/layers.js';
import { gainFor, visibleLayers, layerState, nodeInfo, progressToThreshold, prestigePreview } from '../sim/rebirth.js';

const KIND_TEXT = {
  income: (n) => `+${Math.round(n.per * 100)}% income per level`,
  luck: (n) => `+${Math.round(n.per * 100)}% luck per level`,
  xp: (n) => `+${Math.round(n.per * 100)}% XP per level`,
  dmg: (n) => `+${Math.round(n.per * 100)}% damage per level`,
  baseHp: (n) => `+${Math.round(n.per * 100)}% base HP per level`,
  dropRate: (n) => `+${Math.round(n.per * 100)}% dropper speed per level`,
  sellMult: (n) => `+${Math.round(n.per * 100)}% seller bonus per level`,
  rollCost: (n) => `−${Math.round(n.per * 100)}% roll price per level`,
  freeInterval: (n) => `−${Math.round(n.per * 100)}% free-roll wait per level`,
  startMoney: (n, fmt) => `+$${fmt(n.per)} starting money per level`,
  startSide: (n) => `+${n.per} starting base size per level`,
  startTier: (n) => `+${n.per} starter-kit tier per level`,
  freeCap: (n) => `+${n.per} free-roll cap per level`,
  backpack: (n) => `+${n.per} backpack slots per level`,
};

export function createRebirthPanel(ctx) {
  const { game, fmt, ui } = ctx;
  return {
    id: 'rebirth',
    label: 'Rebirth',
    icon: 'cycle',
    view() {
      const s = game.state;
      const n = visibleLayers(s);
      const open = ui.layerOpen ?? 0;
      const cards = [];
      for (let k = 0; k < Math.min(n, 200); k++) {
        const def = layerDef(k);
        const ls = layerState(s, k);
        const gain = gainFor(s, k);
        const prog = Math.min(1, progressToThreshold(s, k));
        const mult = currencyMultiplier(def, ls.total);
        const nodes = def.tree
          .map((node) => {
            const info = nodeInfo(s, k, node);
            return `<li><b>${ico(node.icon)} ${esc(node.name)}</b> <span class="muted">Lv ${info.level}${node.max ? '/' + node.max : ' (endless)'}</span><br>
              <small class="muted">${esc((KIND_TEXT[node.kind] || (() => node.kind))(node, fmt))}</small><br>
              <button data-act="buy-node" data-id="${node.id}" data-uid="${k}" ${info.maxed || !info.affordable ? 'disabled' : ''}>${info.maxed ? 'Max' : `Buy ${fmt(info.cost)} ${ico(def.currency.icon)}`}</button></li>`;
          })
          .join('');
        cards.push(`<section class="card" aria-label="${esc(def.name)}">
          <h3 style="margin-top:0">${ico(def.currency.icon)} ${esc(def.name)} <small class="muted">layer ${k + 1} · done ${ls.count}×</small></h3>
          <p>${esc(def.currency.name)}: <b>${fmt(ls.currency)}</b> <span class="muted">(earned ${fmt(ls.total)})</span><br>
          Permanent <b>${esc(def.kind)} ×${fmt(mult)}</b> · rule: ${esc(def.rule.text)}</p>
          <div class="bar" role="progressbar" aria-label="Progress to ${esc(def.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.floor(prog * 100)}"><i style="width:${prog * 100}%"></i></div>
          <small class="muted">${k === 0 ? 'Money earned this run' : esc(layerDef(k - 1).currency.name + ' earned this run')}: ${fmt(k === 0 ? s.runMoney : layerState(s, k - 1).run)} / ${fmt(def.threshold)} needed</small>
          <div class="row2" style="margin-top:.4rem"><button class="${gain.gte(1) ? 'primary' : ''}" data-act="prestige" data-uid="${k}" ${gain.gte(1) ? '' : 'disabled'}>${esc(def.name)} for +${fmt(gain)} ${ico(def.currency.icon)}</button></div>
          <details ${open === k ? 'open' : ''}><summary data-act="toggle-layer" data-uid="${k}">${esc(def.name)} upgrades</summary><ul class="plain tree">${nodes}</ul></details>
        </section>`);
      }
      return `<h2>${ico('cycle')} Rebirth <span class="muted" style="font-size:.85rem">Region ${s.region + 1}</span></h2>
        ${ui.rb ? `<p class="msg ${ui.rb.kind || ''}" role="status">${esc(ui.rb.text)}</p>` : ''}
        <p class="muted">Each prestige resets this run (money, items, base, upgrades) for permanent multipliers, moves you to a new themed region, and unlocks the next layer. Layers never end.</p>
        <div class="grid">${cards.join('')}</div>`;
    },
    act(name, el) {
      const k = Number(el.dataset.uid);
      switch (name) {
        case 'buy-node': {
          const r = game.buyTreeNode(k, el.dataset.id);
          ui.rb = r.ok ? { text: 'Upgrade purchased.', kind: 'ok' } : { text: r.reason };
          break;
        }
        case 'toggle-layer':
          ui.layerOpen = ui.layerOpen === k ? -1 : k;
          break;
        case 'prestige':
          askPrestige(k);
          break;
        default:
      }
    },
  };

  async function askPrestige(k) {
    const def = layerDef(k);
    const pv = prestigePreview(game.state, k);
    const ok = await confirmDialog({
      title: `${def.name}?`,
      html: `<p>You will gain <b>${fmt(pv.gain)} ${esc(def.currency.name)}</b>.</p>
        <p class="bad"><b>You will lose:</b> $${fmt(pv.loses.money)}, ${pv.loses.items} items (${pv.loses.placed} placed), your ${pv.loses.baseSide}×${pv.loses.baseSide} base, shop upgrades${k > 0 ? ` and the currency and upgrades of ${k} lower layer${k > 1 ? 's' : ''}` : ''}.</p>
        <p class="good"><b>You keep:</b> ${pv.keeps.map(esc).join('; ')}.</p>`,
      confirmText: `${def.name} now`,
      danger: true,
    });
    if (!ok) return;
    const r = game.prestige(k, { confirmed: true });
    ui.rb = r.ok ? { text: `${def.name} complete! Welcome to region ${r.region + 1}.`, kind: 'ok' } : { text: r.reason };
    ctx.afterPrestige?.();
    ctx.refreshAll?.();
  }
}
