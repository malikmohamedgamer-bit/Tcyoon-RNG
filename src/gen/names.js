// Seeded name generation. Same input => same name, always.
import { Rng, hash32 } from '../core/rng.js';
import { romanize } from './themes.js';

const ONSET = ['b', 'br', 'd', 'dr', 'f', 'g', 'gl', 'k', 'kr', 'l', 'm', 'n', 'p', 'r', 's', 'sh', 't', 'th', 'v', 'vr', 'z', 'zh'];
const VOWEL = ['a', 'e', 'i', 'o', 'u', 'ae', 'ia', 'ou', 'y'];
const CODA = ['', '', 'n', 'r', 'th', 'x', 'l', 's', 'k', 'm'];

export function word(key, syllables = 2) {
  const r = new Rng(hash32('word|' + key));
  let out = '';
  for (let i = 0; i < syllables; i++) out += r.pick(ONSET) + r.pick(VOWEL) + (i === syllables - 1 ? r.pick(CODA) : r.pick(['', '', 'n', 'r']));
  return out.charAt(0).toUpperCase() + out.slice(1);
}

export const tierWord = (t) => word('tier' + t, 2 + (t > 1e6 ? 1 : 0));
export const mutationWord = (n) => word('mut' + n, 2);
export const variantWord = (vs) => word('var' + vs, 2);

const LAYER_HAND = ['Rebirth', 'Ascension', 'Transcendence', 'Apotheosis', 'Singularity'];
/** Name of prestige layer k (0 = rebirth). Beyond the hand-written ones: "<Word> Ascent". */
export function layerName(k) {
  if (k < LAYER_HAND.length) return LAYER_HAND[k];
  const nouns = ['Ascent', 'Genesis', 'Reckoning', 'Dominion', 'Eclipse', 'Covenant'];
  const r = new Rng(hash32('layer' + k));
  return `${word('layer' + k, 2)} ${r.pick(nouns)}`;
}

const MON_PRE = ['Feral', 'Rotten', 'Spiked', 'Gloom', 'Rabid', 'Hollow', 'Ashen', 'Frenzied', 'Armored', 'Venomous', 'Spectral', 'Colossal'];
export const MON_SPECIES = ['Slime', 'Imp', 'Goblin', 'Wraith', 'Crawler', 'Golem', 'Bat', 'Wisp', 'Brute', 'Drone'];
export function monsterName(species, seed) {
  const r = new Rng(hash32('mon|' + species + '|' + seed));
  return `${r.pick(MON_PRE)} ${species}`;
}
const BOSS_TITLE = ['the Devourer', 'of Ash', 'the Unbroken', 'Worldbreaker', 'the Patient', 'of Teeth', 'the Hollow King', 'Stormcaller', 'the Last Light'];
export function bossName(n) {
  const r = new Rng(hash32('boss' + n));
  return `${word('boss' + n, 3)} ${r.pick(BOSS_TITLE)}`;
}

export { romanize };
