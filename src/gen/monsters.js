// Seeded, endless monster generation. Wave w always produces the same enemy list for a given
// world seed. Enemy hp follows the same value curve as items (every `wavesPerTier` waves the
// enemies are as tough as one tier-higher gear is strong), which is what keeps combat in step
// with the economy forever.
import EN from '../data/enemies.json' with { type: 'json' };
import { Big } from '../core/bignum.js';
import { rngFrom } from '../core/rng.js';
import { logValueReal } from './tiers.js';
import { monsterName } from './names.js';

export const ENEMY_BASE = EN.base;
export const ENEMY_TEMPLATES = EN.templates;
export const ENEMY_MODIFIERS = EN.modifiers;
const TPL = new Map(EN.templates.map((t) => [t.id, t]));
export const enemyTemplate = (id) => TPL.get(id);

/** Base enemy hp at wave w: 12 * V(w / 3) where V is the tier value curve (continuous). */
export function waveHp(w) {
  const x = Math.max(0, (w - 1) / EN.base.wavesPerTier);
  return Big.fromNumber(EN.base.hp).mul(Big.fromNumber(10).pow(Big.fromNumber(logValueReal(x))));
}

/** Number of enemy slots in wave w (capped; beyond the cap enemies just get tougher). */
export const waveSlots = (w) => Math.min(40, 4 + Math.floor(1.2 * Math.pow(Math.max(1, w), 0.6)));

/**
 * The enemies of wave w. Each entry: { tpl, name, hp (Big), speed, range, dpsFrac, res, traits, t (spawn time s), angle }.
 * `scale` multiplies slot count and hp share for rush/arena waves (more enemies, same toughness).
 */
export function buildWave(seed, w, { slotMult = 1, hpMult = 1 } = {}) {
  const rng = rngFrom(seed, 'wave', w);
  const slots = Math.min(60, Math.round(waveSlots(w) * slotMult));
  const pool = EN.templates.filter((t) => t.minWave <= w);
  const baseHp = waveHp(w).mul(hpMult);
  const out = [];
  let total = Big.fromNumber(0);
  for (let i = 0; i < slots; i++) {
    const tpl = pool[rng.weighted(pool.map((p) => p.weight))];
    const mod = rng.chance(Math.min(0.5, w * 0.01)) ? rng.pick(EN.modifiers) : null;
    const name = (mod ? mod.name + ' ' : '') + monsterName(tpl.name, `${w}|${i}`).split(' ').slice(1).join(' ');
    const hp = baseHp.mul(tpl.hp * (mod ? mod.hp : 1));
    const angle = rng.next() * Math.PI * 2;
    for (let k = 0; k < tpl.count; k++) {
      out.push({
        tpl: tpl.id,
        name,
        hp,
        speed: tpl.speed * (mod ? mod.speed : 1),
        range: tpl.range,
        dpsFrac: (tpl.dpsFrac * (mod ? mod.dpsFrac : 1)) / (tpl.count > 1 ? 1 : 1),
        res: tpl.res || {},
        traits: tpl.traits || [],
        t: i * 0.6 + k * 0.15,
        angle: angle + (k - tpl.count / 2) * 0.12,
        modifier: mod ? mod.id : null,
      });
      total = total.add(hp);
    }
  }
  return { wave: w, enemies: out, totalHp: total, count: out.length };
}
