// Shared "has the player got there yet?" rules, used by game speed unlocks (data/speed.json) and by
// progressive disclosure (data/disclosure.json). A requirement is {kind, ...}; all kinds are monotone
// (once true they stay true) except `upgrade`, because shop upgrades reset on rebirth.
import { upgradeLevel } from './shop.js';
import { Big } from '../core/bignum.js';

export function requirementMet(state, req) {
  switch (req.kind) {
    case 'level':
      return state.level >= req.value;
    case 'rebirths':
      return (state.stats.rebirths || 0) >= req.value;
    case 'layerCount':
      return (state.layers[req.layer]?.count || 0) >= req.value;
    case 'tree':
      return (state.layers[req.layer]?.tree?.[req.node] || 0) >= req.level;
    case 'upgrade':
      return upgradeLevel(state, req.id) >= req.level;
    case 'totalMoney':
      return state.totalMoney.gte(Big.from(req.value));
    case 'stat':
      return (state.stats[req.stat] || 0) >= req.value;
    default:
      return false;
  }
}

export function describeReq(req) {
  switch (req.kind) {
    case 'level':
      return `Unlocks at level ${req.value}`;
    case 'rebirths':
      return `Unlocks after ${req.value} rebirth${req.value === 1 ? '' : 's'}`;
    case 'layerCount':
      return `Unlocks after ${req.value} prestige${req.value === 1 ? '' : 's'} of layer ${req.layer + 1}`;
    case 'tree':
      return `Unlocks with the rebirth-tree upgrade "${req.node}" (level ${req.level})`;
    case 'upgrade':
      return `Unlocks with the shop upgrade "${req.id}" (level ${req.level})`;
    case 'totalMoney':
      return `Unlocks after earning $${Big.from(req.value).format()} in total`;
    case 'stat':
      return `Unlocks after ${req.value} ${req.stat}`;
    default:
      return 'Locked';
  }
}

