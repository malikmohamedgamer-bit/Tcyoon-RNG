// "Why is my income this?": a plain-language breakdown of the production solver's result.
// Pure: it recomputes production and walks each dropper's own path, so the numbers it lists are the
// numbers the game uses (a test checks that the listed chains add up to the income exactly).
import { Big } from '../core/bignum.js';
import { computeProduction, megaBonus } from './production.js';
import { modifierSteps } from './economy.js';
import { itemTitle } from './items.js';

const isOne = (b) => Big.from(b).sub(1).abs().lt(1e-12);

/**
 * @returns {{
 *   total: Big,
 *   chains: {dropper:{uid:number,title:string}, units:Big, perUnit:Big, steps:{uid:number,title:string,kind:string,text:string}[], seller:({uid:number,title:string}|null), money:Big}[],
 *   multipliers: {label:string, factor:Big, text:string}[],
 *   blocked: {uid:number,title:string,why:string}[],
 *   idle: {uid:number,title:string,why:string}[]
 * }}
 */
export function explainIncome(state, p = computeProduction(state)) {
  const title = (uid) => itemTitle(state.items[uid]);
  const chains = [];
  for (const src of p.sources) {
    const steps = [];
    let cur = src;
    let guard = 0;
    let seller = null;
    let money = Big.fromNumber(0);
    while (cur && cur.done && guard++ < 5000) {
      const t = { uid: cur.uid, title: title(cur.uid) };
      if (cur !== src) {
        if (!isOne(cur.capScale)) steps.push({ ...t, kind: 'cap', text: `${t.title} can only carry part of the flow: ×${cur.capScale.format({ digits: 3 })}` });
        if (!cur.addPer.isZero()) steps.push({ ...t, kind: 'add', text: `${t.title} adds ${cur.addPer.format()} to every unit` });
        if (!isOne(cur.refFactor)) steps.push({ ...t, kind: 'refine', text: `${t.title} refines: ×${cur.refFactor.format({ digits: 3 })}` });
        if (!isOne(cur.multF)) steps.push({ ...t, kind: 'mult', text: `${t.title} multiplies value: ×${cur.multF.format({ digits: 3 })}` });
      }
      if (cur.type === 'seller') {
        seller = t;
        money = p.perItem.get(src.uid).out;
        break;
      }
      cur = cur.next;
    }
    chains.push({
      dropper: { uid: src.uid, title: title(src.uid) },
      units: src.emitU,
      perUnit: src.emitU.isZero() ? Big.fromNumber(0) : src.emitW.div(src.emitU),
      steps,
      seller,
      money,
    });
  }
  chains.sort((a, b) => b.money.cmp(a.money));

  // the global multipliers in the order the solver applies them
  const multipliers = [];
  const push = (label, factor, text) => {
    if (!isOne(factor)) multipliers.push({ label, factor: Big.from(factor), text });
  };
  const steps = modifierSteps(state, ['rate', 'value', 'sellMult', 'income']);
  const fromSteps = (key, label) => {
    for (const st of steps) for (const f of st.factors) if (f.key === key) push(`${label}: ${st.label}`, f.factor, `×${f.factor.format({ digits: 3 })}`);
  };
  fromSteps('rate', 'Dropper speed');
  fromSteps('value', 'Unit value');
  let auraSeen = false;
  for (const src of p.sources) if (p.aura.get(src.uid)) auraSeen = true;
  if (auraSeen) multipliers.push({ label: 'Dynamo auras next to droppers', factor: Big.fromNumber(1), text: 'speeds up the droppers beside them (counted in each line below)' });
  fromSteps('sellMult', 'Seller bonus');
  fromSteps('income', 'Income multiplier');
  push('Extra mega tiles on a full-size base', megaBonus(state.base?.mega), `×${megaBonus(state.base?.mega).toFixed(3)}`);

  const blocked = [];
  const idle = [];
  for (const [uid, n] of p.nodes) {
    if (n.blocked) blocked.push({ uid, title: title(uid), why: n.type === 'seller' ? 'is part of a loop' : 'has nothing in front of it that accepts units (an empty tile, the edge, or a loop)' });
    else if (n.type === 'dropper' && !chains.find((c) => c.dropper.uid === uid && c.seller)) idle.push({ uid, title: title(uid), why: 'does not reach a seller' });
  }
  const sellersUsed = new Set(chains.filter((c) => c.seller).map((c) => c.seller.uid));
  for (const [uid, n] of p.nodes) if (n.type === 'seller' && !sellersUsed.has(uid)) idle.push({ uid, title: title(uid), why: 'sells nothing yet: no dropper line ends here' });

  return { total: p.income, chains, multipliers, blocked, idle, unitsSold: p.unitsSold };
}
