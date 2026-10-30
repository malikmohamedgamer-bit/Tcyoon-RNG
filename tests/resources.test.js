import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Resources, gpuAudit, diffAudit } from '../src/render/resources.js';
import { regionTheme, BASE_THEMES } from '../src/gen/themes.js';

test('Resources caches by key and counts by kind', () => {
  const r = new Resources();
  const g1 = r.get('geo:a', () => new THREE.BoxGeometry());
  const g2 = r.get('geo:a', () => new THREE.BoxGeometry());
  assert.equal(g1, g2);
  r.get('mat:a', () => new THREE.MeshBasicMaterial());
  r.own(new THREE.Texture());
  assert.deepEqual(r.counts(), { geometries: 1, materials: 1, textures: 1, other: 0 });
});

test('dispose frees things exactly once and empties the tracker', () => {
  const r = new Resources();
  let disposed = 0;
  const geo = r.get('geo:x', () => {
    const g = new THREE.BoxGeometry();
    g.addEventListener('dispose', () => disposed++);
    return g;
  });
  const owned = r.own(new THREE.BoxGeometry());
  owned.addEventListener('dispose', () => disposed++);
  r.release(owned);
  assert.equal(disposed, 1);
  r.release(owned); // double release is harmless
  assert.equal(disposed, 1);
  r.disposeAll();
  assert.equal(disposed, 2);
  assert.ok(geo);
  assert.deepEqual(r.counts(), { geometries: 0, materials: 0, textures: 0, other: 0 });
});

test('disposePrefix frees a whole group (e.g. a theme) and leaves the rest', () => {
  const r = new Resources();
  r.get('theme:a:geo', () => new THREE.BoxGeometry());
  r.get('theme:a:mat', () => new THREE.MeshBasicMaterial());
  r.get('theme:b:geo', () => new THREE.BoxGeometry());
  r.disposePrefix('theme:a:');
  assert.equal(r.counts().geometries, 1);
  assert.equal(r.counts().materials, 0);
});

test('GPU audit detects a leak (growth) and passes a clean rebuild cycle', () => {
  const r = new Resources();
  const before = gpuAudit(null, r);
  // clean cycle: build + dispose
  for (let i = 0; i < 5; i++) {
    r.get(`tmp:${i}`, () => new THREE.BoxGeometry());
    r.disposePrefix('tmp:');
  }
  assert.deepEqual(diffAudit(before, gpuAudit(null, r)), []);
  // leaky cycle: resources created and forgotten in the tracker's own set
  for (let i = 0; i < 5; i++) r.own(new THREE.BoxGeometry());
  const grew = diffAudit(before, gpuAudit(null, r));
  assert.equal(grew.length, 1);
  assert.equal(grew[0].name, 'tracked.geometries');
  assert.equal(grew[0].after, 5);
  // tolerance lets callers allow a small cache warm-up
  assert.deepEqual(diffAudit(before, gpuAudit(null, r), 5), []);
});

test('renderer.info shaped snapshots are diffed too', () => {
  const fake = (g, t, p) => ({ info: { memory: { geometries: g, textures: t }, programs: new Array(p), render: { calls: 1, triangles: 2 } } });
  const r = new Resources();
  const a = gpuAudit(fake(10, 4, 3), r);
  const b = gpuAudit(fake(30, 4, 3), r);
  assert.deepEqual(diffAudit(a, b).map((x) => x.name), ['renderer.geometries']);
});

test('region themes: 5 hand-made, then deterministic remixes forever', () => {
  assert.equal(BASE_THEMES.length, 5);
  assert.deepEqual(BASE_THEMES.map((t) => t.id), ['factory', 'steampunk', 'space', 'scifi', 'pixel']);
  for (let i = 0; i < 5; i++) assert.equal(regionTheme(i).base, BASE_THEMES[i].id);
  assert.equal(regionTheme(0).cycle, 0);
  const r7 = regionTheme(7, 99);
  assert.equal(r7.base, 'space');
  assert.equal(r7.cycle, 1);
  assert.deepEqual(r7, regionTheme(7, 99)); // deterministic
  assert.notEqual(r7.palette.accent, BASE_THEMES[2].palette.accent); // remixed
  assert.notDeepEqual(regionTheme(7, 99).palette, regionTheme(7, 100).palette);
  for (const region of [0, 12, 999, 123456, 1e9]) {
    const t = regionTheme(region, 1);
    for (const v of Object.values(t.palette)) assert.match(v, /^#[0-9a-f]{6}$/);
    assert.ok(t.props.length >= 4 && t.sfx.base > 0);
  }
  assert.equal(regionTheme(-5).region, 0);
  assert.equal(regionTheme(NaN).region, 0);
});
