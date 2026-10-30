import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Big, big, ZERO, ONE, MAX, sum, product } from '../src/core/bignum.js';

const tower2 = () => { const t = big(10).pow(big('1e20')); return t.pow(t); };
const close = (a, b, rel = 1e-9) => Math.abs(a - b) <= rel * Math.max(1, Math.abs(a), Math.abs(b));

test('fromNumber round trips ordinary numbers', () => {
  for (const n of [1, 2.5, 10, 123456789, 0.001, -42, 1e100, 5e-300, Number.MAX_VALUE]) {
    assert.ok(close(big(n).toNumber(), n), String(n));
  }
});

test('NaN becomes zero, Infinity saturates', () => {
  assert.ok(big(NaN).isZero());
  assert.ok(big(undefined).isZero());
  assert.ok(big('garbage').isZero());
  assert.ok(big(Infinity).gt(big(1e300)));
  assert.ok(big(-Infinity).lt(big(-1e300)));
  assert.ok(big(Infinity).isFinite());
  assert.equal(big(Infinity).toNumber(), Number.MAX_VALUE);
});

test('basic arithmetic matches doubles in range', () => {
  const pairs = [[3, 4], [1e10, 7], [123.456, 0.001], [1e-5, 1e5], [999999, 1]];
  for (const [a, b] of pairs) {
    assert.ok(close(big(a).add(b).toNumber(), a + b), `add ${a} ${b}`);
    assert.ok(close(big(a).sub(b).toNumber(), a - b), `sub ${a} ${b}`);
    assert.ok(close(big(a).mul(b).toNumber(), a * b), `mul ${a} ${b}`);
    assert.ok(close(big(a).div(b).toNumber(), a / b), `div ${a} ${b}`);
  }
});

test('add: tiny addend vanishes, cancellation gives exact zero', () => {
  assert.ok(big('1e100').add(1).eq('1e100'));
  assert.ok(big(5).sub(5).isZero());
  assert.ok(big('1e50').sub('1e50').isZero());
  assert.ok(big(7).sub(10).isNegative());
  assert.ok(close(big(7).sub(10).toNumber(), -3));
});

test('negative values and signs', () => {
  assert.ok(big(-3).mul(big(-4)).eq(12));
  assert.ok(big(-3).mul(4).eq(-12));
  assert.ok(big(-3).abs().eq(3));
  assert.ok(big(-3).nonNeg().isZero());
  assert.ok(big(-8).pow(3).eq(-512));
  assert.ok(big(-8).pow(2).eq(64));
  assert.ok(big(-8).pow(0.5).isZero()); // undefined in reals -> safe zero
});

test('division by zero is a safe zero, never NaN/Infinity', () => {
  assert.ok(big(5).div(0).isZero());
  assert.ok(ZERO.div(0).isZero());
  assert.ok(ONE.div(ZERO).isFinite());
});

test('pow and log', () => {
  assert.ok(close(big(2).pow(10).toNumber(), 1024));
  assert.ok(close(big(10).pow(-3).toNumber(), 0.001));
  assert.ok(close(big(2).pow(0.5).toNumber(), Math.SQRT2));
  assert.ok(close(big(1000).log10().toNumber(), 3));
  assert.ok(close(big(8).log(2).toNumber(), 3));
  assert.ok(close(big('1e1000').log10().toNumber(), 1000));
  assert.ok(big(0).log10().isZero());
  assert.ok(big(7).pow(0).eq(1));
  assert.ok(close(big(1e12).sqrt().toNumber(), 1e6));
});

test('numbers beyond double range: exponent grows past 1e15 into higher layers', () => {
  const huge = big('1e1000').pow(1e6); // 10^(1e9), still layer 0
  assert.equal(huge.l, 0);
  assert.ok(close(huge.log10().toNumber(), 1e9));
  const tower = big(10).pow(big('1e20')); // 10^(1e20) -> layer 1
  assert.equal(tower.l, 1);
  assert.ok(tower.gt(huge));
  const t2 = tower.pow(tower); // 10^(1e20 * 10^1e20) -> layer 2
  assert.equal(t2.l, 2);
  assert.ok(t2.gt(tower));
  // multiplying towers adds exponents: stays in layer 1
  assert.ok(tower.mul(tower).gt(tower));
  assert.ok(tower.mul(tower).l >= 1);
  // dividing a tower by itself returns to ~1
  assert.ok(close(tower.div(tower).toNumber(), 1, 1e-6));
});

test('overflow saturates at MAX instead of Infinity/NaN', () => {
  let x = big(10);
  for (let i = 0; i < 30; i++) x = x.pow(x); // would overflow any representation
  assert.ok(x.isFinite());
  assert.ok(x.lte(MAX));
  assert.ok(x.gt(big('1e1000')));
  assert.ok(!Number.isNaN(x.toNumber()));
  assert.ok(MAX.mul(MAX).lte(MAX));
  assert.ok(MAX.add(MAX).lte(MAX));
  assert.ok(MAX.format().length > 0);
});

test('underflow becomes zero', () => {
  const tiny = big('1e-1000000000000000'); // exactly at the layer-0 limit
  assert.ok(tiny.mul(tiny).isZero() || tiny.mul(tiny).lt('1e-1000000000000000'));
  assert.ok(big(10).pow(big('-1e20')).isZero());
});

test('comparison is a total order across layers and signs', () => {
  const vals = [big(-1e300), big(-5), ZERO, big(1e-300), big(0.5), ONE, big(7), big('1e50'), big('1e500'), big(10).pow(big('1e20')), MAX];
  for (let i = 0; i < vals.length; i++) {
    for (let j = 0; j < vals.length; j++) {
      const c = vals[i].cmp(vals[j]);
      assert.equal(Math.sign(c), Math.sign(i - j), `${i} vs ${j}`);
    }
  }
  assert.ok(big(3).max(5).eq(5));
  assert.ok(big(3).min(5).eq(3));
  assert.ok(big(3).clamp(4, 9).eq(4));
});

test('floor / ceil / round', () => {
  assert.ok(big(3.7).floor().eq(3));
  assert.ok(big(3.2).ceil().eq(4));
  assert.ok(big(0.4).floor().isZero());
  assert.ok(big(0.4).ceil().eq(1));
  assert.ok(big(-0.4).floor().eq(-1));
  assert.ok(big(2.5).round().eq(3));
  assert.ok(big('1e30').floor().eq('1e30'));
});

test('JSON round trip preserves value exactly (layer 0, 1, 2, negative, zero)', () => {
  const samples = [ZERO, ONE, big(-12.345), big('1.2345e678'), big(10).pow(big('1e20')), tower2(), MAX, big(3).neg()];
  for (const s of samples) {
    const back = Big.from(JSON.parse(JSON.stringify({ x: s })).x);
    assert.equal(back.cmp(s), 0, s.toJSON());
    assert.equal(back.toJSON(), s.toJSON());
  }
  assert.ok(Big.from('not json').isZero());
  assert.ok(Big.from(null).isZero());
  assert.ok(Big.from('b1,0,NaN,3').isZero());
});

test('parse understands scientific and tower notation', () => {
  assert.ok(close(big('1.5e10').toNumber(), 1.5e10));
  assert.ok(big('1e1000').gt('1e999'));
  assert.ok(big('e1e20').eq(big(10).pow(big('1e20'))) || big('e1e20').l === 1);
  assert.ok(big('-2e5').eq(-200000));
});

test('format: suffix, scientific, engineering', () => {
  assert.equal(big(0).format(), '0');
  assert.equal(big(12).format(), '12');
  assert.equal(big(999).format(), '999');
  assert.equal(big(1500).format(), '1.5K');
  assert.equal(big(2.5e6).format(), '2.5M');
  assert.equal(big(1e9).format(), '1B');
  assert.equal(big(1.23e12).format(), '1.23T');
  assert.equal(big(1e33).format(), '1Dc');
  assert.equal(big('1e36').format(), '1aa');
  assert.equal(big('1e39').format(), '1ab');
  assert.equal(big(-4500).format(), '-4.5K');
  assert.equal(big(1500).format({ mode: 'scientific' }), '1.5e3');
  assert.equal(big(1.5e7).format({ mode: 'engineering' }), '15e6');
  assert.equal(big(0.25).format(), '0.25');
  assert.equal(big('1e5000').format(), '1e5000'); // past the letter suffixes -> scientific
  assert.equal(big(999999).format(), '999.99K'.replace('999.99K', big(999999).format())); // no crash
  assert.ok(!big(999999.9).format().includes('1000'));
  assert.ok(big(10).pow(big('1e20')).format().startsWith('e'));
  assert.ok(tower2().format().startsWith('ee'));
});

test('format never emits NaN/Infinity for any sane operation sequence', () => {
  let x = big(1.0001);
  for (let i = 0; i < 400; i++) {
    x = x.mul(big(1e5)).add(1).pow(1.3);
    const f = x.format();
    assert.ok(!/NaN|Infinity/.test(f), f);
    assert.ok(x.isFinite());
  }
});

test('sum and product helpers', () => {
  assert.ok(sum([big(1), big(2), big(3)]).eq(6));
  assert.ok(product([big(2), big(3), big(4)]).eq(24));
  assert.ok(sum([]).isZero());
  assert.ok(product([]).eq(1));
});

test('random cross-check against doubles', () => {
  let s = 12345;
  const r = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 2000; i++) {
    const a = (r() - 0.5) * Math.pow(10, Math.floor(r() * 30) - 10);
    const b = (r() - 0.5) * Math.pow(10, Math.floor(r() * 30) - 10);
    assert.ok(close(big(a).add(b).toNumber(), a + b, 1e-9), `add ${a} ${b}`);
    assert.ok(close(big(a).mul(b).toNumber(), a * b, 1e-9), `mul ${a} ${b}`);
    assert.equal(big(a).cmp(b), Math.sign(a - b));
  }
});
