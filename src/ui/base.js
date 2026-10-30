// Base panel: income overview, inspector for the selected item, auto-place, expansion, presets.
import { esc } from './dom.js';
import { itemCard } from './itemcard.js';
import { sellValue } from '../sim/economy.js';
import { expandCost, MAX_SIDE, PRESET_LIMIT } from '../sim/placement.js';
import { DIR_NAMES, megaBonus } from '../sim/production.js';
import { itemTitle, itemIcon, typeOf, SKIN_COLORS } from '../sim/items.js';

export function createBasePanel(ctx) {
  const { game, fmt, ui } = ctx;
  return {
    id: 'base',
    label: 'Base',
    icon: '🏗️',
    view() {
      const s = game.state;
      const p = s._p;
      const sel = ctx.placement.state.selected != null ? s.items[ctx.placement.state.selected] : null;
      if (ui.nickFor !== (sel ? sel.uid : null)) { ui.nickDraft = undefined; ui.nickFor = sel ? sel.uid : null; }
      const placed = Object.values(s.items).filter((it) => it.loc === 'placed');
      const rows = placed
        .map((it) => ({ it, p: p.perItem.get(it.uid) }))
        .sort((a, b) => b.p.out.cmp(a.p.out) || a.it.uid - b.it.uid)
        .map(({ it, p: pi }) => {
          const t = typeOf(it);
          const val = t === 'dropper' ? `$${fmt(pi.out)}/s` : t === 'seller' ? `cashes $${fmt(pi.flowW)}/s flow` : pi.flowU.isZero() ? 'idle' : `${fmt(pi.flowU)} units/s`;
          return `<li><button class="link" data-act="select" data-uid="${it.uid}" aria-label="Select ${esc(itemTitle(it))}">${itemIcon(it)} ${esc(itemTitle(it))}</button> <span class="${pi.blocked ? 'bad' : 'muted'}">${pi.blocked ? '⚠ blocked — ' : ''}${val}</span>${pi.blocked ? ` <button class="link" data-act="rotate" data-uid="${it.uid}" aria-label="Rotate ${esc(itemTitle(it))} to try another direction">Rotate it</button>` : ''}</li>`;
        })
        .join('');
      const inspector = sel
        ? `<h3>Selected</h3>${itemCard(sel, fmt, {
            extra: `<small class="muted">Facing ${DIR_NAMES[sel.dir || 0]} at column ${sel.x + 1}, row ${sel.y + 1}${p.perItem.get(sel.uid)?.blocked ? ' — <b class="bad">⚠ blocked: nothing accepts its output</b>' : ''}</small>`,
            actions: `<button data-act="rotate" data-uid="${sel.uid}">Rotate (R)</button>
              <button data-act="pickup" data-uid="${sel.uid}">Pick up</button>
              <button data-act="sellp" data-uid="${sel.uid}">Sell $${fmt(sellValue(s, sel))} (X)</button>`,
          })}`
        : '';
      const nameSkin = sel
        ? `<details><summary>Name &amp; skin</summary>
            <label>Nickname (max 24) <input type="text" maxlength="24" data-act="nick-draft" data-fid="nick" value="${esc(ui.nickDraft ?? sel.nick ?? '')}" aria-label="Item nickname"></label>
            <div class="swatches" role="radiogroup" aria-label="Item skin colour">${SKIN_COLORS.map((c, i) => `<label class="sw" style="background:${c}" title="Skin ${i + 1}"><input type="radio" name="skin" data-act="skin" data-id="${i}" ${sel.skin === i ? 'checked' : ''} aria-label="Skin ${i + 1}"></label>`).join('')}</div>
            <div class="row2"><button data-act="save-name" data-uid="${sel.uid}">Save name</button><button data-act="clear-skin" data-uid="${sel.uid}">Default skin</button></div></details>`
        : '';
      const presets = s.presets
        .map(
          (pr, i) =>
            `<li>${esc(pr.name)} <small class="muted">(${pr.layout.length} items)</small> <button data-act="load-preset" data-id="${i}">Load</button> <button data-act="del-preset" data-id="${i}" aria-label="Delete preset ${esc(pr.name)}">✕</button></li>`,
        )
        .join('');
      const maxed = s.base.side >= MAX_SIDE;
      return `
      <h2>🏗️ Base <span class="muted" style="font-size:.85rem">${s.base.side}×${s.base.side}</span></h2>
      ${ui.base ? `<p class="msg ${ui.base.kind || ''}" role="status">${esc(ui.base.text)}</p>` : ''}
      <p><b>Income: $${fmt(p.income)}/s</b> <span class="muted">· ${p.droppers} droppers · ${p.sellers} sellers${p.blocked.length ? ` · <b class="bad">${p.blocked.length} blocked</b>` : ''}</span></p>
      <div class="row2">
        <button data-act="autoplace">Auto-place</button>
        <button data-act="expand" ${s.money.lt(expandCost(s)) ? 'disabled' : ''}>${maxed ? 'Mega tile' : 'Expand base'} $${fmt(expandCost(s))}</button>
      </div>
      ${s.base.mega ? `<p class="muted">Mega tiles: ${s.base.mega} → income ×${megaBonus(s.base.mega).toFixed(3)} (soft-capped at ×2.5)</p>` : maxed ? '<p class="muted">Base is at max size: further expansions give mega-tile income bonuses.</p>' : ''}
      <details><summary>How flow works</summary><p class="muted">Droppers produce units and send them the way they face. Each item passes units to the next cell it faces and applies its effect in order: throughput cap → flat bonus → refine → multiply. A seller cashes out. Facing an empty cell, a wall or a turret blocks the flow (⚠).</p></details>
      ${inspector}${nameSkin}
      <h3>Layout presets (${s.presets.length}/${PRESET_LIMIT})</h3>
      <div class="row2"><input type="text" data-fid="preset-name" data-act="preset-name" maxlength="40" placeholder="Preset name" aria-label="Preset name" value="${esc(ui.presetName || '')}"><button data-act="save-preset">Save layout</button></div>
      <ul class="plain">${presets || '<li class="muted">No presets yet.</li>'}</ul>
      <h3>Placed items (${placed.length})</h3>
      <ul class="plain">${rows || '<li class="muted">Nothing placed. Open the backpack and press Place.</li>'}</ul>`;
    },
    act(name, el) {
      const uid = Number(el.dataset.uid);
      const id = Number(el.dataset.id);
      const note = (text, kind) => (ui.base = { text, kind });
      switch (name) {
        case 'select':
          ui.nickDraft = undefined;
          ctx.placement.select(uid);
          break;
        case 'rotate':
          game.rotate(uid);
          break;
        case 'pickup': {
          const r = game.pickUp(uid);
          note(r.ok ? 'Item returned to the backpack.' : r.reason, r.ok ? 'ok' : '');
          break;
        }
        case 'sellp': {
          const r = game.sellPlaced(uid);
          note(r.ok ? `Sold for $${fmt(r.value)}` : r.reason, r.ok ? 'ok' : '');
          break;
        }
        case 'autoplace': {
          const r = game.autoPlace();
          note(`Auto-placed ${r.placed} items.`, 'ok');
          break;
        }
        case 'expand': {
          const r = game.expand();
          note(r.ok ? `Base is now ${r.side}×${r.side}${r.mega ? ` (+${r.mega} mega)` : ''}.` : r.reason, r.ok ? 'ok' : '');
          break;
        }
        case 'nick-draft':
          ui.nickDraft = el.value;
          break;
        case 'save-name': {
          const sel2 = ctx.placement.state.selected;
          if (sel2 != null) game.nameItem(sel2, ui.nickDraft ?? game.state.items[sel2]?.nick ?? '', undefined);
          ui.nickDraft = undefined;
          note('Name saved.', 'ok');
          break;
        }
        case 'skin':
          if (ctx.placement.state.selected != null) game.nameItem(ctx.placement.state.selected, game.state.items[ctx.placement.state.selected]?.nick ?? '', id);
          break;
        case 'clear-skin':
          game.nameItem(uid, game.state.items[uid]?.nick ?? '', null);
          break;
        case 'preset-name':
          ui.presetName = el.value;
          break;
        case 'save-preset': {
          const r = game.savePreset(ui.presetName);
          note(r.ok ? 'Layout saved.' : r.reason, r.ok ? 'ok' : '');
          ui.presetName = '';
          break;
        }
        case 'load-preset': {
          const r = game.loadPreset(id);
          note(r.ok ? `Loaded: ${r.placed} placed${r.skipped ? `, ${r.skipped} skipped (missing)` : ''}.` : r.reason, r.ok ? 'ok' : '');
          break;
        }
        case 'del-preset':
          game.deletePreset(id);
          break;
        default:
      }
    },
  };
}
