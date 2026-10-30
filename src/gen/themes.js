// Seeded theme generation. Region N (one region per prestige) always has a theme:
// the five hand-made themes cycle, and every full cycle "remixes" them with a
// deterministic hue shift, prop order and sound transposition, forever.

import THEMES from '../data/themes.json' with { type: 'json' };
import { Rng, hash32 } from '../core/rng.js';

export const BASE_THEMES = THEMES.themes;

function hexToHsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  let h = 0;
  let s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}

function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return '#' + to(r) + to(g) + to(b);
}

export function shiftHue(hex, deg) {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h + deg, s, l);
}

/**
 * Theme for a region index (0, 1, 2, ...). Pure and deterministic.
 * @returns {{id:string,name:string,icon:string,base:string,cycle:number,region:number,palette:object,floor:string,props:string[],sfx:object}}
 */
export function regionTheme(region, worldSeed = 0) {
  region = Math.max(0, Math.floor(Number(region) || 0));
  const n = BASE_THEMES.length;
  const base = BASE_THEMES[region % n];
  const cycle = Math.floor(region / n);
  if (cycle === 0) {
    return { ...base, base: base.id, cycle: 0, region, palette: { ...base.palette }, props: base.props.slice(), sfx: { ...base.sfx } };
  }
  const rng = new Rng(hash32(`theme|${worldSeed}|${region}`));
  const hue = (cycle * 47 + rng.int(30)) % 360;
  const palette = {};
  for (const [k, v] of Object.entries(base.palette)) palette[k] = shiftHue(v, hue);
  const props = rng.shuffle(base.props.slice());
  const sfx = { ...base.sfx, base: base.sfx.base * Math.pow(2, ((cycle * 5) % 12) / 12), scale: base.sfx.scale.slice() };
  if (rng.chance(0.5)) sfx.scale = sfx.scale.map((x) => (x * 7) % 12);
  return {
    ...base,
    id: `${base.id}-r${cycle}`,
    name: `${base.name} ${romanize(cycle + 1)}`,
    base: base.id,
    cycle,
    region,
    palette,
    props,
    sfx,
  };
}

/** Base theme by id ('factory' ... 'pixel'), cycle 0 — used for the "theme override" setting. */
export function themeById(id, worldSeed = 0) {
  const i = BASE_THEMES.findIndex((t) => t.id === id);
  return i < 0 ? null : regionTheme(i, worldSeed);
}

export function romanize(num) {
  if (num <= 0) return String(num);
  if (num > 3999) return String(num);
  const map = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, s] of map) {
    while (num >= v) {
      out += s;
      num -= v;
    }
  }
  return out;
}
