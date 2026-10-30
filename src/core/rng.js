// Seeded, serialisable PRNG (sfc32 seeded through a hash). Every random decision in
// the simulation goes through an Rng so rolls, fusions and fights are reproducible.

/** 32-bit string hash (cyrb53-style, folded). Stable across platforms. */
export function hash32(str) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

function splitmix32(a) {
  return function () {
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t = t ^ (t >>> 15);
    t = Math.imul(t, 0x735a2d97);
    return ((t = t ^ (t >>> 15)) >>> 0);
  };
}

export class Rng {
  /** @param {number|string|number[]} seed number/string seed, or a 4-word saved state */
  constructor(seed = 1) {
    if (Array.isArray(seed) && seed.length === 4) {
      this.s = seed.map((x) => x >>> 0); // restored state: no warm-up, continue exactly
    } else {
      const base = typeof seed === 'string' ? hash32(seed) : seed >>> 0;
      const sm = splitmix32(base);
      this.s = [sm(), sm(), sm(), sm()];
      for (let i = 0; i < 12; i++) this.u32(); // warm up fresh seeds only
    }
  }

  u32() {
    let [a, b, c, d] = this.s;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    this.s = [a >>> 0, b >>> 0, c >>> 0, d >>> 0];
    return t >>> 0;
  }

  /** Uniform float in [0,1). */
  next() {
    return this.u32() / 4294967296;
  }

  /** Uniform float in (0,1] (never 0), used for log/ratio based sampling. */
  open() {
    return (this.u32() + 1) / 4294967296;
  }

  /** Integer in [0,n). */
  int(n) {
    if (n <= 1) return 0;
    return Math.floor(this.next() * n);
  }

  range(lo, hi) {
    return lo + this.next() * (hi - lo);
  }

  chance(p) {
    if (!(p > 0)) return false;
    if (p >= 1) return true;
    return this.next() < p;
  }

  pick(arr) {
    return arr[this.int(arr.length)];
  }

  /** weights: array of non-negative numbers. Returns an index. */
  weighted(weights) {
    let total = 0;
    for (const w of weights) total += w > 0 ? w : 0;
    if (!(total > 0)) return 0;
    let r = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      const w = weights[i] > 0 ? weights[i] : 0;
      if (r < w) return i;
      r -= w;
    }
    return weights.length - 1;
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** Independent child stream; the parent advances by one step. */
  fork(label = '') {
    return new Rng(hash32(label + ':' + this.u32()) ^ this.u32());
  }

  getState() {
    return this.s.slice();
  }
  setState(s) {
    this.s = s.map((x) => x >>> 0);
  }
}

/** Build a one-off Rng from any parts, e.g. rngFrom(seed, 'shop', '2026-01-02'). */
export function rngFrom(...parts) {
  return new Rng(hash32(parts.join('|')));
}
