// Endless boss generation. Boss n is a pure function of (n): equivalent wave, hp, mechanics, name, drops.
import BS from '../data/bosses.json' with { type: 'json' };
import { rngFrom } from '../core/rng.js';
import { bossName } from './names.js';
import { waveHp } from './monsters.js';
import { WEAPON_TEMPLATES } from '../sim/items.js';

export const BOSS_CFG = BS;
export const MECHANICS = BS.mechanics;
const MECH = new Map(BS.mechanics.map((m) => [m.id, m]));
export const mechanic = (id) => MECH.get(id);
const ICONS = ['👾', '🐉', '🦑', '👹', '🧟', '🦂', '🕷️', '🐙'];

/** Equivalent wave of boss n. */
export const bossWave = (n) => BS.firstWave + BS.stepWaves * n;

/** Definition of boss n (n >= 0). Pure. */
export function bossDef(n) {
  n = Math.max(0, Math.floor(Number(n) || 0));
  const rng = rngFrom('boss', n);
  const wave = bossWave(n);
  const count = Math.min(BS.mechanics.length, 2 + Math.floor(n / 5));
  const mechs = rng.shuffle(BS.mechanics.map((m) => m.id)).slice(0, count);
  const weapon = WEAPON_TEMPLATES[rng.weighted(WEAPON_TEMPLATES.map((t) => t.weight))];
  return {
    n,
    name: bossName(n),
    icon: ICONS[n % ICONS.length],
    wave,
    hp: waveHp(wave).mul(BS.hpMult),
    speed: mechs.includes('swift') ? 1.6 * 1.6 : 1.6,
    range: 3,
    dpsFrac: BS.dpsFrac,
    mechanics: mechs,
    timeLimit: BS.timeLimit,
    dropWeapon: weapon.id,
    mutationId: `boss:${n}`,
    res: mechs.includes('armor') ? BS.mechanics.find((m) => m.id === 'armor').res : {},
  };
}
