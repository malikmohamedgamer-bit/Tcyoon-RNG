import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildShapeGeometry } from '../src/render/items.js';
import { ITEM_TEMPLATES, TEMPLATES } from '../src/sim/items.js';
import { cellToWorld, worldToCell } from '../src/render/base.js';

test('cell <-> world mapping round trips and is centred on the base', () => {
  for (const side of [6, 7, 12, 32]) {
    for (let x = 0; x < side; x += 3) {
      for (let y = 0; y < side; y += 2) {
        const w = cellToWorld(x, y, side);
        assert.deepEqual(worldToCell(w.x, w.z, side), { x, y });
      }
    }
    const a = cellToWorld(0, 0, side);
    const b = cellToWorld(side - 1, side - 1, side);
    assert.ok(Math.abs(a.x + b.x) < 1e-9 && Math.abs(a.z + b.z) < 1e-9);
  }
});

test('merged shape geometry is valid (finite positions, normals and shade attributes of equal length)', () => {
  const g = buildShapeGeometry([
    { g: 'box', args: [1, 1, 1], pos: [0, 0, 0], shade: 0.5 },
    { g: 'cyl', args: [0.2, 0.2, 1, 6], pos: [0, 1, 0], shade: 1, rot: [0.5, 0, 0] },
    { g: 'torus', args: [0.3, 0.1, 4, 8], pos: [0, 0, 0], shade: 1, scl: [1, 2, 1] },
  ]);
  const p = g.attributes.position;
  assert.equal(p.count, g.attributes.normal.count);
  assert.equal(p.count, g.attributes.color.count);
  assert.ok(p.count > 36);
  for (const v of p.array) assert.ok(Number.isFinite(v));
  g.dispose();
});

test('every template has a render shape key', () => {
  for (const t of ITEM_TEMPLATES) assert.ok(t.shape, t.id);
  assert.ok(TEMPLATES.get('bolt_rifle').shape);
});
