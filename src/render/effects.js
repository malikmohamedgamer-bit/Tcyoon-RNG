// Capped combat effects: tracer lines (one LineSegments buffer used as a ring), hit/kill pops
// (one InstancedMesh) and nova rings. The total number of live effects never exceeds `cap`
// (quality setting), extra events are dropped. With reduced motion there are no flashing pops.
import * as THREE from 'three';

export const EFFECT_CAP = { low: 40, medium: 120, high: 300 };
const DTYPE_COLOR = { physical: '#ffffff', fire: '#ff8a3d', ice: '#9fd8ff', electric: '#ffe45e', void: '#c58bff' };
const TRACER_LIFE = 0.14;
const POP_LIFE = 0.35;

export function createEffects({ scene, res, quality = 'medium', reducedMotion = false }) {
  const cap = EFFECT_CAP[quality] || EFFECT_CAP.medium;
  let reduced = reducedMotion;
  // tracers
  const tPos = new Float32Array(cap * 6);
  const tCol = new Float32Array(cap * 6);
  const tGeo = res.own(new THREE.BufferGeometry());
  tGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3));
  tGeo.setAttribute('color', new THREE.BufferAttribute(tCol, 3));
  tGeo.setDrawRange(0, 0);
  const tMat = res.own(new THREE.LineBasicMaterial({ vertexColors: true, toneMapped: false }));
  const lines = new THREE.LineSegments(tGeo, tMat);
  lines.frustumCulled = false;
  scene.add(lines);
  const tLife = new Float32Array(cap);
  let tHead = 0;
  // pops
  const popGeo = res.get('geo:fx-pop', () => new THREE.OctahedronGeometry(0.25, 0));
  const popMat = res.get('mat:fx-pop', () => new THREE.MeshBasicMaterial({ toneMapped: false }));
  const pops = new THREE.InstancedMesh(popGeo, popMat, cap);
  pops.frustumCulled = false;
  pops.count = 0;
  scene.add(pops);
  const popData = [];
  // nova rings
  const ringGeo = res.get('geo:fx-ring', () => new THREE.TorusGeometry(1, 0.05, 4, 24));
  const ringMat = res.get('mat:fx-ring', () => new THREE.MeshBasicMaterial({ color: '#c58bff', toneMapped: false, transparent: true, opacity: 0.7 }));
  const rings = [];
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  let live = 0;

  const api = {
    setReducedMotion(on) {
      reduced = on;
    },
    cap,
    get live() {
      return live;
    },
    /** Feed simulation events ({k:'shot'|'kill'|'nova'|'pulse'}). Excess events are dropped (cap). */
    push(events) {
      for (const e of events) {
        if (e.k === 'shot') {
          const i = tHead++ % cap;
          tPos.set([e.x1, 0.9, e.z1, e.x2, 0.7, e.z2], i * 6);
          col.set(DTYPE_COLOR[e.d] || '#ffffff');
          tCol.set([col.r, col.g, col.b, col.r, col.g, col.b], i * 6);
          tLife[i] = TRACER_LIFE;
        } else if (e.k === 'kill' && !reduced && popData.length < cap) {
          popData.push({ x: e.x, z: e.z, life: POP_LIFE, big: e.boss });
        } else if (e.k === 'nova' && !reduced && rings.length < 4) {
          const m = new THREE.Mesh(ringGeo, ringMat);
          m.rotation.x = Math.PI / 2;
          m.position.set(e.x, 0.3, e.z);
          scene.add(m);
          rings.push({ m, life: 0.5, r: e.r });
        }
      }
    },
    update(dt) {
      let n = 0;
      for (let i = 0; i < cap; i++) {
        if (tLife[i] > 0) {
          tLife[i] -= dt;
          n++;
          if (tLife[i] <= 0) tPos.fill(0, i * 6, i * 6 + 6);
        }
      }
      tGeo.attributes.position.needsUpdate = true;
      tGeo.attributes.color.needsUpdate = true;
      tGeo.setDrawRange(0, cap * 2);
      let k = 0;
      for (let i = popData.length - 1; i >= 0; i--) {
        const p = popData[i];
        p.life -= dt;
        if (p.life <= 0) popData.splice(i, 1);
      }
      for (const p of popData) {
        const f = p.life / POP_LIFE;
        dummy.position.set(p.x, 0.5 + (1 - f) * 0.8, p.z);
        dummy.rotation.set(0, (1 - f) * 6, 0);
        dummy.scale.setScalar((p.big ? 3 : 1) * (0.4 + (1 - f) * 1.2) * f + 0.05);
        dummy.updateMatrix();
        pops.setMatrixAt(k, dummy.matrix);
        col.set(p.big ? '#ffd95e' : '#ffffff');
        pops.setColorAt(k, col);
        k++;
      }
      pops.count = k;
      pops.instanceMatrix.needsUpdate = true;
      if (pops.instanceColor) pops.instanceColor.needsUpdate = true;
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i];
        r.life -= dt;
        const f = 1 - r.life / 0.5;
        r.m.scale.setScalar(Math.max(0.01, r.r * f));
        if (r.life <= 0) {
          scene.remove(r.m);
          rings.splice(i, 1);
        }
      }
      live = n + k + rings.length;
    },
    clear() {
      tLife.fill(0);
      tPos.fill(0);
      popData.length = 0;
      pops.count = 0;
      for (const r of rings) scene.remove(r.m);
      rings.length = 0;
      live = 0;
    },
    dispose() {
      api.clear();
      scene.remove(lines, pops);
      pops.dispose();
      res.release(tGeo);
      res.release(tMat);
    },
  };
  return api;
}
