// Big: immutable big-number type for an endless game.
//
//   layer 0:  value = s * m * 10^e      m in [1,10), e an integer-valued double, |e| <= 1e15
//   layer 1:  value = s * 10^e          e a double in [1e15, 1e300]
//   layer L:  value = s * 10^(10^(... 10^e))   (L tens), e a double
//
// The exponent of a layer-0 number is itself a double, and when it grows beyond
// 1e15 the number moves up a layer, so the representable range is a power tower.
// Everything is normalised to a canonical form after every operation so that
// comparison is a simple (sign, layer, e, m) lexicographic compare.
//
// Safety rules (the game relies on them):
//   * NaN input becomes 0. +/-Infinity or overflow saturates to +/-MAX (never Infinity).
//   * x / 0 returns 0 ("safe divide"), pow with an undefined result returns 0.
//   * Underflow (below 10^-1e15) becomes 0.
//   * Instances are frozen; operations never mutate.

const LAYER0_LIMIT = 1e15; // largest |e| in layer 0
const PROMOTE = 1e300; // layer >=1 promotes to the next layer above this e
const DEMOTE_HIGH = 300; // layer >=2 demotes below this e
const MAX_LAYER = 5;
const MAX_E = 1e300;
const NUM_MAX = Number.MAX_VALUE;
const ADD_CUTOFF = 17; // exponent distance beyond which the smaller addend vanishes

export class Big {
  constructor(s, l, m, e) {
    this.s = s;
    this.l = l;
    this.m = m;
    this.e = e;
    Object.freeze(this);
  }

  // ---------------------------------------------------------------- creation
  static fromNumber(n) {
    if (typeof n !== 'number' || Number.isNaN(n)) return ZERO;
    if (n === 0) return ZERO;
    if (n === Infinity) return MAX;
    if (n === -Infinity) return MIN;
    const s = n < 0 ? -1 : 1;
    const a = Math.abs(n);
    const e = Math.floor(Math.log10(a));
    let m = a / Math.pow(10, e);
    if (!Number.isFinite(m)) {
      // denormals: 10^e underflows
      m = a / Math.pow(10, e + 20) / Math.pow(10, -20);
    }
    return norm(s, 0, m, e);
  }

  /** Accepts Big, number, numeric string ("1.5e10", "e1e20"), or the JSON form. */
  static from(v) {
    if (v instanceof Big) return v;
    if (typeof v === 'number') return Big.fromNumber(v);
    if (typeof v === 'string') return Big.parse(v);
    if (v && typeof v === 'object' && 's' in v && 'e' in v) {
      return norm(v.s < 0 ? -1 : v.s > 0 ? 1 : 0, v.l | 0, +v.m || 1, +v.e || 0);
    }
    return ZERO;
  }

  static parse(str) {
    const t = String(str).trim();
    if (t.startsWith('b')) {
      // JSON form: b<s>,<l>,<m>,<e>
      const p = t.slice(1).split(',').map(Number);
      if (p.length === 4 && p.every(Number.isFinite)) {
        return norm(p[0] < 0 ? -1 : p[0] > 0 ? 1 : 0, Math.max(0, p[1] | 0), p[2], p[3]);
      }
      return ZERO;
    }
    let neg = false;
    let u = t;
    if (u.startsWith('-')) {
      neg = true;
      u = u.slice(1);
    }
    // tower notation: leading e's, e.g. "e1.5e20" or "ee3e5"
    const lead = /^(e+)/.exec(u);
    if (lead && u.length > lead[1].length) {
      const k = lead[1].length;
      const rest = Big.parse(u.slice(k));
      let x = rest;
      for (let i = 0; i < k; i++) x = pow10(x);
      return neg ? x.neg() : x;
    }
    const n = Number(u);
    if (Number.isFinite(n)) {
      const b = Big.fromNumber(n);
      return neg ? b.neg() : b;
    }
    // very long exponent forms such as "1.5e1e10" are handled via split on first 'e'
    const idx = u.indexOf('e');
    if (idx > 0) {
      const mant = Number(u.slice(0, idx));
      const ex = Big.parse(u.slice(idx + 1));
      if (Number.isFinite(mant) && mant > 0) {
        const r = pow10(add(ex, Big.fromNumber(Math.log10(mant))));
        return neg ? r.neg() : r;
      }
    }
    return u === 'Infinity' ? (neg ? MIN : MAX) : ZERO;
  }

  // ---------------------------------------------------------------- queries
  isZero() {
    return this.s === 0;
  }
  isPositive() {
    return this.s > 0;
  }
  isNegative() {
    return this.s < 0;
  }
  /** Always true: a Big can never hold NaN/Infinity. */
  isFinite() {
    return Number.isFinite(this.e) && Number.isFinite(this.m);
  }

  // ---------------------------------------------------------------- arithmetic
  neg() {
    return this.s === 0 ? this : new Big(-this.s, this.l, this.m, this.e);
  }
  abs() {
    return this.s < 0 ? this.neg() : this;
  }
  add(o) {
    return add(this, Big.from(o));
  }
  sub(o) {
    return add(this, Big.from(o).neg());
  }
  mul(o) {
    return mul(this, Big.from(o));
  }
  div(o) {
    return div(this, Big.from(o));
  }
  recip() {
    return recip(this);
  }
  pow(o) {
    return pow(this, Big.from(o));
  }
  sqrt() {
    return pow(this, HALF);
  }
  cbrt() {
    return pow(this, Big.fromNumber(1 / 3));
  }
  /** log10 as a Big (may be negative for values < 1). log of 0 is 0 (safe). */
  log10() {
    return log10Big(this);
  }
  /** log10 as a plain double (saturated). */
  log10Num() {
    return log10Big(this).toNumber();
  }
  ln() {
    return log10Big(this).mul(LN10);
  }
  log(base) {
    return log10Big(this).div(log10Big(Big.from(base)));
  }
  exp10() {
    return pow10(this);
  }

  // ---------------------------------------------------------------- compare
  cmp(o) {
    return cmp(this, Big.from(o));
  }
  eq(o) {
    return cmp(this, Big.from(o)) === 0;
  }
  lt(o) {
    return cmp(this, Big.from(o)) < 0;
  }
  lte(o) {
    return cmp(this, Big.from(o)) <= 0;
  }
  gt(o) {
    return cmp(this, Big.from(o)) > 0;
  }
  gte(o) {
    return cmp(this, Big.from(o)) >= 0;
  }
  min(o) {
    const b = Big.from(o);
    return cmp(this, b) <= 0 ? this : b;
  }
  max(o) {
    const b = Big.from(o);
    return cmp(this, b) >= 0 ? this : b;
  }
  /** Clamp negatives to zero. Used wherever a quantity must never go negative. */
  nonNeg() {
    return this.s < 0 ? ZERO : this;
  }
  clamp(lo, hi) {
    return this.max(lo).min(hi);
  }

  // ---------------------------------------------------------------- rounding
  floor() {
    if (this.s === 0 || this.l > 0 || this.e >= 15) return this;
    if (this.e < 0) return this.s > 0 ? ZERO : MINUS_ONE;
    return Big.fromNumber(Math.floor(this.toNumber()));
  }
  ceil() {
    if (this.s === 0 || this.l > 0 || this.e >= 15) return this;
    if (this.e < 0) return this.s > 0 ? ONE : ZERO;
    return Big.fromNumber(Math.ceil(this.toNumber()));
  }
  round() {
    return this.add(0.5).floor();
  }

  // ---------------------------------------------------------------- conversion
  /** Saturates to +/-Number.MAX_VALUE; never returns Infinity or NaN. */
  toNumber() {
    if (this.s === 0) return 0;
    if (this.l > 0) return this.s * NUM_MAX;
    if (this.e > 308) return this.s * NUM_MAX;
    if (this.e < -323) return 0;
    const v = this.m * Math.pow(10, this.e);
    if (!Number.isFinite(v)) return this.s * NUM_MAX;
    return this.s * v;
  }

  toJSON() {
    return `b${this.s},${this.l},${this.m},${this.e}`;
  }

  toString() {
    return this.format({ mode: 'scientific', digits: 3 });
  }

  /**
   * Format for display.
   * mode: 'suffix' (K, M, B, ... then letters, then scientific), 'scientific', 'engineering'.
   * digits: significant digits after the point for the mantissa (default 2).
   */
  format(opts = {}) {
    const mode = opts.mode || 'suffix';
    const digits = opts.digits == null ? 2 : opts.digits;
    if (this.s === 0) return '0';
    const sign = this.s < 0 ? '-' : '';
    if (this.l > 0) return sign + 'e'.repeat(this.l) + fmtPlain(this.e, 2);
    const e = this.e;
    if (e < -6 && mode === 'suffix') return sign + sci(this.m, e, digits);
    if (e < 0) {
      // small numbers: show as decimals
      const v = this.m * Math.pow(10, e);
      if (e >= -6) return sign + trimZeros(v.toFixed(Math.min(8, Math.max(0, digits - e))));
      return sign + sci(this.m, e, digits);
    }
    if (mode === 'scientific') return sign + sci(this.m, e, digits);
    if (mode === 'engineering') {
      const g = e - (((e % 3) + 3) % 3);
      const mm = this.m * Math.pow(10, e - g);
      return sign + trimZeros(mm.toFixed(digits)) + (g ? 'e' + g : '');
    }
    // suffix
    if (e < 3) {
      const v = this.m * Math.pow(10, e);
      return sign + trimZeros(v.toFixed(e === 0 ? Math.min(digits, 2) : e === 1 ? 1 : 0));
    }
    const grp = Math.floor(e / 3);
    const suffix = suffixFor(grp);
    if (suffix === null) return sign + sci(this.m, e, digits);
    const mm = this.m * Math.pow(10, e - grp * 3);
    let txt = mm.toFixed(digits);
    if (parseFloat(txt) >= 1000) {
      // rounding pushed 999.99x to 1000.0; fall to the next suffix group
      const s2 = suffixFor(grp + 1);
      if (s2 !== null) return sign + trimZeros((mm / 1000).toFixed(digits)) + s2;
      txt = '999.99';
    }
    return sign + trimZeros(txt) + suffix;
  }
}

// ---------------------------------------------------------------- constants
export const ZERO = new Big(0, 0, 0, 0);
export const ONE = new Big(1, 0, 1, 0);
const MINUS_ONE = new Big(-1, 0, 1, 0);
const HALF = new Big(1, 0, 5, -1);
const LN10 = Big.fromNumber(Math.LN10);
export const MAX = new Big(1, MAX_LAYER, 1, MAX_E);
const MIN = new Big(-1, MAX_LAYER, 1, MAX_E);

export const big = (v) => Big.from(v);

// ---------------------------------------------------------------- normalisation
function norm(s, l, m, e) {
  if (s === 0 || !Number.isFinite(m) || !Number.isFinite(e) || m === 0) {
    if (!Number.isFinite(e) || !Number.isFinite(m)) {
      if (m === Infinity || e === Infinity) return s < 0 ? MIN : MAX;
      return ZERO;
    }
    return ZERO;
  }
  if (l === 0) {
    if (m < 1 || m >= 10) {
      const sh = Math.floor(Math.log10(m));
      m = m / Math.pow(10, sh);
      e += sh;
      if (m >= 10) {
        m /= 10;
        e += 1;
      } else if (m < 1) {
        m *= 10;
        e -= 1;
      }
    }
    if (!Number.isInteger(e)) {
      // fold the fractional part of the exponent into the mantissa
      const fl = Math.floor(e);
      m *= Math.pow(10, e - fl);
      e = fl;
      if (m >= 10) {
        m /= 10;
        e += 1;
      }
    }
    if (e > LAYER0_LIMIT) return norm(s, 1, 1, e + Math.log10(m));
    if (e < -LAYER0_LIMIT) return ZERO;
    return new Big(s, 0, m, e);
  }
  // l >= 1
  if (l > MAX_LAYER) return s < 0 ? MIN : MAX;
  if (e > PROMOTE) {
    if (l >= MAX_LAYER) return s < 0 ? MIN : MAX;
    return norm(s, l + 1, 1, Math.log10(e));
  }
  if (l === 1 && e < LAYER0_LIMIT) {
    // demote to layer 0
    const fl = Math.floor(e);
    return norm(s, 0, Math.pow(10, e - fl), fl);
  }
  if (l >= 2 && e < DEMOTE_HIGH) return norm(s, l - 1, 1, Math.pow(10, e));
  return new Big(s, l, 1, e);
}

// ---------------------------------------------------------------- core ops
function cmp(a, b) {
  if (a.s !== b.s) return a.s < b.s ? -1 : 1;
  if (a.s === 0) return 0;
  const mag = cmpMag(a, b);
  if (mag === 0) return 0;
  return a.s > 0 ? mag : -mag;
}

function cmpMag(a, b) {
  if (a.l !== b.l) return a.l < b.l ? -1 : 1;
  if (a.e !== b.e) return a.e < b.e ? -1 : 1;
  if (a.m !== b.m) return a.m < b.m ? -1 : 1;
  return 0;
}

function add(a, b) {
  if (a.s === 0) return b;
  if (b.s === 0) return a;
  // order by magnitude so |a| >= |b|
  if (cmpMag(a, b) < 0) {
    const t = a;
    a = b;
    b = t;
  }
  if (a.l > 0 || b.l > 0) {
    if (a.l === 0 || b.l === 0 || a.l !== b.l) return a; // dominated
    return a; // same layer, near-equal towers: precision exhausted, keep the larger
  }
  const d = a.e - b.e;
  if (d > ADD_CUTOFF) return a;
  if (a.s === b.s) return norm(a.s, 0, a.m + b.m * Math.pow(10, -d), a.e);
  const diff = a.m - b.m * Math.pow(10, -d);
  if (diff === 0) return ZERO;
  return norm(a.s, 0, diff, a.e);
}

function mul(a, b) {
  if (a.s === 0 || b.s === 0) return ZERO;
  const s = a.s * b.s;
  if (a.l === 0 && b.l === 0) return norm(s, 0, a.m * b.m, a.e + b.e);
  const r = pow10(add(log10Big(a.abs()), log10Big(b.abs())));
  return s < 0 ? r.neg() : r;
}

function div(a, b) {
  if (a.s === 0 || b.s === 0) return ZERO; // safe: x/0 -> 0
  const s = a.s * b.s;
  if (a.l === 0 && b.l === 0) return norm(s, 0, a.m / b.m, a.e - b.e);
  // work in log space so tower / tower stays accurate instead of underflowing
  const r = pow10(add(log10Big(a.abs()), log10Big(b.abs()).neg()));
  return s < 0 ? r.neg() : r;
}

function recip(a) {
  if (a.s === 0) return ZERO; // safe: 1/0 -> 0
  if (a.l === 0) {
    if (a.m === 1) return norm(a.s, 0, 1, -a.e);
    return norm(a.s, 0, 10 / a.m, -a.e - 1);
  }
  const r = pow10(log10Big(a.abs()).neg());
  return a.s < 0 ? r.neg() : r;
}

/** log10 of |x| as a Big. */
function log10Big(x) {
  if (x.s === 0) return ZERO;
  if (x.l === 0) return Big.fromNumber(x.e + Math.log10(x.m));
  if (x.l === 1) return Big.fromNumber(x.e);
  return norm(1, x.l - 1, 1, x.e);
}

/** 10^y as a Big (positive). */
function pow10(y) {
  if (y.s === 0) return ONE;
  if (y.l === 0) {
    const ye = y.toNumber();
    if (y.s < 0) {
      if (ye < -LAYER0_LIMIT) return ZERO;
      const fl = Math.floor(ye);
      return norm(1, 0, Math.pow(10, ye - fl), fl);
    }
    if (ye <= LAYER0_LIMIT) {
      const fl = Math.floor(ye);
      return norm(1, 0, Math.pow(10, ye - fl), fl);
    }
    return norm(1, 1, 1, ye);
  }
  if (y.s < 0) return ZERO; // 10^(-huge) underflows
  return norm(1, y.l + 1, 1, y.e);
}

function isIntegerBig(b) {
  return b.l === 0 && b.e >= 0 && (b.e >= 16 || Number.isInteger(b.toNumber()));
}
function isOddBig(b) {
  return b.l === 0 && b.e < 16 && Number.isInteger(b.toNumber()) && Math.abs(b.toNumber()) % 2 === 1;
}

function pow(a, b) {
  if (b.s === 0) return ONE;
  if (a.s === 0) return ZERO; // 0^positive = 0, 0^negative: safe 0
  let sign = 1;
  if (a.s < 0) {
    if (!isIntegerBig(b)) return ZERO; // undefined in reals: safe 0
    if (isOddBig(b)) sign = -1;
    a = a.abs();
  }
  // exact path for small integer exponents on layer-0 values
  if (a.l === 0 && b.l === 0 && b.e <= 2 && Number.isInteger(b.toNumber())) {
    const k = b.toNumber();
    const mm = Math.pow(a.m, Math.abs(k));
    let r = norm(1, 0, mm, a.e * Math.abs(k));
    if (k < 0) r = recip(r);
    return sign < 0 ? r.neg() : r;
  }
  const r = pow10(mul(log10Big(a), b));
  return sign < 0 ? r.neg() : r;
}

export const sum = (list) => list.reduce((acc, x) => acc.add(x), ZERO);
export const product = (list) => list.reduce((acc, x) => acc.mul(x), ONE);
export const bmax = (a, b) => Big.from(a).max(b);
export const bmin = (a, b) => Big.from(a).min(b);

// ---------------------------------------------------------------- formatting helpers
const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

/** Suffix for 10^(3*grp), or null when we should fall back to scientific. */
export function suffixFor(grp) {
  if (grp < SUFFIXES.length) return SUFFIXES[grp];
  const k = grp - SUFFIXES.length; // 0 -> "aa"
  if (k >= 26 * 26) return null;
  return LETTERS[Math.floor(k / 26)] + LETTERS[k % 26];
}

function trimZeros(txt) {
  if (!txt.includes('.')) return txt;
  return txt.replace(/\.?0+$/, '');
}

function sci(m, e, digits) {
  let txt = m.toFixed(digits);
  let ee = e;
  if (parseFloat(txt) >= 10) {
    txt = (m / 10).toFixed(digits);
    ee += 1;
  }
  return trimZeros(txt) + 'e' + ee;
}

function fmtPlain(n, digits) {
  if (!Number.isFinite(n)) return '0';
  if (Math.abs(n) < 1e6) return trimZeros(n.toFixed(digits));
  const e = Math.floor(Math.log10(Math.abs(n)));
  const m = n / Math.pow(10, e);
  return sci(m, e, digits);
}

export const MAX_BIG = MAX;
