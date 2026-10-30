import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readableOn } from '../src/ui/a11y.js';
import { BASE_THEMES, regionTheme } from '../src/gen/themes.js';

const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('text on an accent colour always has the better of black and white (>= 4.5 : 1 where either can reach it)', () => {
  for (const bg of ['#ff6b8b', '#ffb020', '#35e1ff', '#b6ff3c', '#d6a04a', '#8b5cf6', '#2e7d32', '#808080', '#777777', '#ff0000', '#0000ff']) {
    const t = readableOn(bg);
    const other = t === '#000000' ? '#ffffff' : '#000000';
    assert.ok(ratio(t, bg) >= ratio(other, bg), `${bg}`);
  }
  assert.ok(ratio(readableOn('#ff6b8b'), '#ff6b8b') >= 4.5, 'pink accent (was 2.7 with the old threshold)');
});

test('every region theme accent (endless remixes) gets readable text', () => {
  for (let region = 0; region < 60; region++) {
    const th = regionTheme(region, 7);
    const t = readableOn(th.palette.accent);
    assert.ok(ratio(t, th.palette.accent) >= 4.5, `region ${region} accent ${th.palette.accent}`);
  }
  for (const b of BASE_THEMES) assert.ok(ratio(readableOn(b.palette.accent), b.palette.accent) >= 4.5, b.id);
});
