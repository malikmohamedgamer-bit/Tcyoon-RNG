// Mutation refinery panel: re-roll, transfer and combine mutations on owned items.
import { ico } from './icons.js';
import { esc } from './dom.js';
import { itemTitle } from '../sim/items.js';
import { mutationLabel } from '../sim/mutations.js';
import { REFINER_OPS, refineCost, combineChance } from '../sim/refiners.js';

export function createRefineryPanel(ctx) {
  const { game, fmt, ui } = ctx;
  const sel = ui.refine || (ui.refine = { a: '', b: '', mut: '' });
  const owned = (s) => Object.values(s.items).filter((it) => it.loc === 'bag' || it.loc === 'placed');
  const opt = (it, v) => `<option value="${it.uid}" ${String(v) === String(it.uid) ? 'selected' : ''}>#${it.uid} ${esc(itemTitle(it))}${it.loc === 'placed' ? ' (placed)' : ''} ${(it.mut || []).map((m) => esc(mutationLabel(m))).join(' ')}</option>`;
  return {
    id: 'refinery',
    label: 'Refinery',
    icon: 'flask',
    view() {
      const s = game.state;
      const items = owned(s);
      const a = s.items[sel.a];
      const b = s.items[sel.b];
      const muts = a ? a.mut || [] : [];
      const costFor = (op, it) => (it ? `$${fmt(refineCost(s, op, it))}` : '—');
      return `
      <h2>${ico('flask')} Refinery</h2>
      ${ui.rmsg ? `<p class="msg ${ui.rmsg.kind || ''}" role="status">${esc(ui.rmsg.text)}</p>` : ''}
      <p class="muted">Costs scale with the roll price and the number of mutations. Items can be in the backpack or on the base.</p>
      <label>Item A (target / donor source)<br><select data-act="ref-a" data-fid="ref-a"><option value="">— choose —</option>${items.map((it) => opt(it, sel.a)).join('')}</select></label>
      <label>Item B<br><select data-act="ref-b" data-fid="ref-b"><option value="">— choose —</option>${items.map((it) => opt(it, sel.b)).join('')}</select></label>
      <label>Mutation (from A)<br><select data-act="ref-mut" data-fid="ref-mut"><option value="">— choose —</option>${muts.map((m) => `<option value="${esc(m[0])}" ${sel.mut === m[0] ? 'selected' : ''}>${esc(mutationLabel(m))}</option>`).join('')}</select></label>
      <div class="grid" style="margin-top:.5rem">
        <div class="card"><b>${esc(REFINER_OPS.reroll.name)}</b> <span class="muted">— ${esc(REFINER_OPS.reroll.desc)}</span><br><button data-act="do-reroll" ${a ? '' : 'disabled'}>Re-roll A (${costFor('reroll', a)})</button></div>
        <div class="card"><b>${esc(REFINER_OPS.transfer.name)}</b> <span class="muted">— ${esc(REFINER_OPS.transfer.desc)}</span><br><button data-act="do-transfer" ${a && b && sel.mut ? '' : 'disabled'}>Move mutation A → B (${costFor('transfer', b)})</button></div>
        <div class="card"><b>${esc(REFINER_OPS.combine.name)}</b> <span class="muted">— ${esc(REFINER_OPS.combine.desc)}</span><br><button data-act="do-combine" ${a && b && sel.mut ? '' : 'disabled'}>Combine into B (${costFor('combine', b)}${b ? `, ${Math.round(combineChance(((b.mut || []).find((m) => m[0] === sel.mut) || [0, 1])[1]) * 100)}%` : ''})</button></div>
      </div>`;
    },
    act(name, el) {
      const msg = (r, okText) => (ui.rmsg = r.ok ? { text: okText, kind: 'ok' } : { text: r.reason || 'Failed' });
      switch (name) {
        case 'ref-a': sel.a = el.value; sel.mut = ''; break;
        case 'ref-b': sel.b = el.value; break;
        case 'ref-mut': sel.mut = el.value; break;
        case 'do-reroll': msg(game.reroll(Number(sel.a)), 'Mutations re-rolled.'); break;
        case 'do-transfer': msg(game.transferMutation(Number(sel.a), Number(sel.b), sel.mut), 'Mutation transferred.'); break;
        case 'do-combine': {
          const r = game.combineMutation(Number(sel.b), Number(sel.a), sel.mut);
          ui.rmsg = r.ok ? { text: r.success ? 'Combine succeeded: level +1 on B.' : 'Combine failed: the donor lost the mutation.', kind: r.success ? 'ok' : '' } : { text: r.reason };
          break;
        }
        default:
      }
    },
  };
}
