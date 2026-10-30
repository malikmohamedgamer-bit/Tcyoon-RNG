// 3D items on the base: one InstancedMesh per shape (merged primitives with vertex
// shading), plus instanced direction arrows, rarity gems, mutation halos, "blocked"
// markers and flow dots. Re-synced only when the simulation revision changes.
import * as THREE from 'three';
import { TEMPLATES, SKIN_COLORS } from '../sim/items.js';
import { tierInfo } from '../gen/tiers.js';
import { getMutation } from '../gen/mutations.js';
import { hash32 } from '../core/rng.js';
import { cellToWorld } from './base.js';
import { DIRS, FLOW_TYPES } from '../sim/production.js';

export const TYPE_COLORS = { dropper: '#e69f00', conveyor: '#8fa3bd', multiplier: '#cc79a7', refiner: '#d55e00', seller: '#2fbf8f', upgrader: '#56b4e9', generator: '#f0e442', turret: '#c4475a', weapon: '#c4475a' };

const P = (g, args, pos, shade = 1, rot, scl) => ({ g, args, pos, shade, rot, scl });
const SHAPES = {
  drill: [P('box', [0.8, 0.2, 0.8], [0, 0.1, 0], 0.6), P('cyl', [0.14, 0.14, 0.9, 6], [0, 0.65, 0], 1), P('cone', [0.2, 0.35, 6], [0, 0.35, 0], 0.8, [Math.PI, 0, 0])],
  pump: [P('box', [0.8, 0.2, 0.8], [0, 0.1, 0], 0.6), P('cyl', [0.18, 0.18, 0.8, 6], [0, 0.55, 0], 1), P('box', [0.7, 0.12, 0.12], [0.1, 0.9, 0], 0.8)],
  forge: [P('box', [0.8, 0.45, 0.8], [0, 0.22, 0], 0.7), P('cone', [0.5, 0.4, 4], [0, 0.65, 0], 1, [0, Math.PI / 4, 0])],
  vat: [P('cyl', [0.38, 0.38, 0.6, 8], [0, 0.3, 0], 0.8), P('sph', [0.3, 7, 5], [0, 0.7, 0], 1)],
  mine: [P('cyl', [0.42, 0.45, 0.2, 8], [0, 0.1, 0], 0.6), P('ico', [0.38, 0], [0, 0.6, 0], 1)],
  belt: [P('box', [0.96, 0.1, 0.66], [0, 0.05, 0], 0.7), P('box', [0.96, 0.12, 0.08], [0, 0.12, 0.3], 1), P('box', [0.96, 0.12, 0.08], [0, 0.12, -0.3], 1)],
  ring: [P('cyl', [0.3, 0.38, 0.2, 8], [0, 0.1, 0], 0.6), P('torus', [0.3, 0.08, 5, 10], [0, 0.6, 0], 1, [Math.PI / 2, 0, 0])],
  prism: [P('cyl', [0.3, 0.38, 0.2, 5], [0, 0.1, 0], 0.6), P('oct', [0.34, 0], [0, 0.6, 0], 1, null, [1, 1.4, 1])],
  furnace: [P('box', [0.8, 0.5, 0.7], [0, 0.25, 0], 0.7), P('cyl', [0.12, 0.16, 0.5, 6], [0.22, 0.75, 0], 1)],
  stall: [P('box', [0.7, 0.4, 0.6], [0, 0.2, 0], 0.7), P('cone', [0.62, 0.3, 4], [0, 0.55, 0], 1, [0, Math.PI / 4, 0])],
  tuner: [P('box', [0.8, 0.25, 0.6], [0, 0.12, 0], 0.7), P('cyl', [0.1, 0.1, 0.5, 6], [-0.2, 0.45, 0], 1), P('cyl', [0.1, 0.1, 0.35, 6], [0.2, 0.38, 0], 1)],
  dynamo: [P('cyl', [0.4, 0.42, 0.25, 8], [0, 0.12, 0], 0.6), P('torus', [0.28, 0.07, 5, 10], [0, 0.5, 0], 1, [Math.PI / 2, 0, 0]), P('cyl', [0.06, 0.06, 0.5, 5], [0, 0.4, 0], 0.9)],
  shrine: [P('cone', [0.4, 0.5, 5], [0, 0.25, 0], 0.7), P('sph', [0.2, 7, 5], [0, 0.7, 0], 1)],
  turret: [P('cyl', [0.35, 0.4, 0.3, 8], [0, 0.15, 0], 0.6), P('sph', [0.25, 7, 5], [0, 0.45, 0], 0.9), P('box', [0.55, 0.12, 0.12], [0.3, 0.45, 0], 1)],
  tower: [P('cone', [0.35, 1.0, 6], [0, 0.5, 0], 0.8), P('sph', [0.16, 6, 4], [0, 1.05, 0], 1)],
  weapon: [P('box', [0.5, 0.2, 0.2], [0, 0.2, 0], 1)],
};

function makeGeo(kind, args) {
  switch (kind) {
    case 'box': return new THREE.BoxGeometry(...args);
    case 'cyl': return new THREE.CylinderGeometry(...args);
    case 'cone': return new THREE.ConeGeometry(...args);
    case 'sph': return new THREE.SphereGeometry(...args);
    case 'ico': return new THREE.IcosahedronGeometry(...args);
    case 'oct': return new THREE.OctahedronGeometry(...args);
    default: return new THREE.TorusGeometry(...args);
  }
}

/** Merge shape parts into one non-indexed geometry with a per-vertex shade colour. */
export function buildShapeGeometry(parts) {
  const pos = [];
  const nor = [];
  const col = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const nm = new THREE.Matrix3();
  for (const p of parts) {
    let g = makeGeo(p.g, p.args);
    g = g.index ? g.toNonIndexed() : g;
    e.set(...(p.rot || [0, 0, 0]));
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(...p.pos), q, new THREE.Vector3(...(p.scl || [1, 1, 1])));
    nm.getNormalMatrix(m);
    const pa = g.attributes.position;
    const na = g.attributes.normal;
    const v = new THREE.Vector3();
    for (let i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i).applyMatrix4(m);
      pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(na, i).applyMatrix3(nm).normalize();
      nor.push(v.x, v.y, v.z);
      col.push(p.shade, p.shade, p.shade);
    }
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}

const haloColor = (id) => new THREE.Color().setHSL((hash32(id) % 360) / 360, 0.9, 0.6);

export function createItemsRenderer({ scene, res, getSide, quality = 'medium' }) {
  const group = new THREE.Group();
  scene.add(group);
  const meshes = new Map(); // key -> { mesh, cap }
  let rev = -1;
  let lastSide = -1;
  const caps = { dots: quality === 'low' ? 120 : quality === 'medium' ? 300 : 600 };
  const dotsFor = (q) => (q === 'low' ? 120 : q === 'medium' ? 300 : 600);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  const bodyMat = res.get('mat:item-body', () => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  const flatMat = (name, extra = {}) => res.get('mat:items:' + name, () => new THREE.MeshLambertMaterial({ flatShading: true, ...extra }));
  const shared = {
    arrow: res.get('geo:item-arrow', () => buildShapeGeometry([P('box', [0.5, 0.05, 0.08], [0.0, 0.0, 0], 1), P('cone', [0.13, 0.28, 4], [0.34, 0.0, 0], 1, [0, 0, -Math.PI / 2])])),
    gem: res.get('geo:item-gem', () => new THREE.OctahedronGeometry(0.14, 0)),
    halo: res.get('geo:item-halo', () => new THREE.TorusGeometry(0.46, 0.035, 4, 16)),
    warn: res.get('geo:item-warn', () => new THREE.ConeGeometry(0.12, 0.3, 3)),
    dot: res.get('geo:item-dot', () => new THREE.BoxGeometry(0.1, 0.1, 0.1)),
  };

  function instanced(key, geo, mat, need) {
    let rec = meshes.get(key);
    if (!rec || rec.cap < need) {
      if (rec) {
        group.remove(rec.mesh);
        rec.mesh.dispose();
      }
      const cap = Math.max(32, Math.pow(2, Math.ceil(Math.log2(Math.max(1, need)))));
      const mesh = new THREE.InstancedMesh(geo, mat, cap);
      mesh.frustumCulled = false;
      mesh.count = 0;
      group.add(mesh);
      rec = { mesh, cap };
      meshes.set(key, rec);
    }
    return rec.mesh;
  }

  let flowNodes = [];
  let gems = null;
  let gemData = [];

  function sync(state) {
    const side = getSide();
    const placed = Object.values(state.items).filter((it) => it.loc === 'placed');
    const byShape = new Map();
    for (const it of placed) {
      const shape = TEMPLATES.get(it.tpl)?.shape || 'drill';
      if (!byShape.has(shape)) byShape.set(shape, []);
      byShape.get(shape).push(it);
    }
    for (const [key, rec] of meshes) if (key.startsWith('shape:') && !byShape.has(key.slice(6))) rec.mesh.count = 0;
    for (const [shape, list] of byShape) {
      const geo = res.get('geo:shape:' + shape, () => buildShapeGeometry(SHAPES[shape] || SHAPES.drill));
      const mesh = instanced('shape:' + shape, geo, bodyMat, list.length);
      list.forEach((it, i) => {
        const w = cellToWorld(it.x, it.y, side);
        dummy.position.set(w.x, 0, w.z);
        dummy.rotation.set(0, shape === 'turret' || shape === 'weapon' ? -(it.dir || 0) * (Math.PI / 2) : 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        col.set(it.skin != null && SKIN_COLORS[it.skin] ? SKIN_COLORS[it.skin] : TYPE_COLORS[TEMPLATES.get(it.tpl)?.type] || '#ffffff');
        mesh.setColorAt(i, col);
      });
      mesh.count = list.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    // direction arrows on flow items
    const flow = placed.filter((it) => FLOW_TYPES.has(TEMPLATES.get(it.tpl)?.type) && TEMPLATES.get(it.tpl).type !== 'seller');
    const arrows = instanced('arrows', shared.arrow, flatMat('arrow', { color: 0xffffff, emissive: 0x333333 }), flow.length);
    flow.forEach((it, i) => {
      const w = cellToWorld(it.x, it.y, side);
      dummy.position.set(w.x, 0.98, w.z);
      dummy.rotation.set(0, -(it.dir || 0) * (Math.PI / 2), 0);
      dummy.updateMatrix();
      arrows.setMatrixAt(i, dummy.matrix);
    });
    arrows.count = flow.length;
    arrows.instanceMatrix.needsUpdate = true;
    // rarity gems
    gems = instanced('gems', shared.gem, flatMat('gem', { color: 0xffffff, emissive: 0x222222 }), placed.length);
    gemData = placed.map((it) => {
      const ti = tierInfo(it.tier);
      return { it, scale: 0.8 + Math.min(1.2, Math.log2(it.tier + 2) * 0.2), color: ti.color };
    });
    gemData.forEach((d, i) => {
      col.set(d.color);
      gems.setColorAt(i, col);
    });
    gems.count = gemData.length;
    if (gems.instanceColor) gems.instanceColor.needsUpdate = true;
    // mutation halos
    const mutated = placed.filter((it) => (it.mut || []).length);
    const halos = instanced('halos', shared.halo, flatMat('halo', { color: 0xffffff, emissive: 0x888888 }), mutated.length);
    mutated.forEach((it, i) => {
      const w = cellToWorld(it.x, it.y, side);
      dummy.position.set(w.x, 0.06, w.z);
      dummy.rotation.set(Math.PI / 2, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      halos.setMatrixAt(i, dummy.matrix);
      const def = getMutation(it.mut[0][0]);
      halos.setColorAt(i, haloColor(def ? def.id : 'x'));
    });
    halos.count = mutated.length;
    halos.instanceMatrix.needsUpdate = true;
    if (halos.instanceColor) halos.instanceColor.needsUpdate = true;
    // blocked markers
    const blocked = new Set(state._p ? state._p.blocked : []);
    const warn = placed.filter((it) => blocked.has(it.uid));
    const warns = instanced('warn', shared.warn, flatMat('warn', { color: 0xff3b3b, emissive: 0xaa0000 }), warn.length);
    warn.forEach((it, i) => {
      const w = cellToWorld(it.x, it.y, side);
      dummy.position.set(w.x, 1.5, w.z);
      dummy.rotation.set(Math.PI, 0, 0);
      dummy.updateMatrix();
      warns.setMatrixAt(i, dummy.matrix);
    });
    warns.count = warn.length;
    warns.instanceMatrix.needsUpdate = true;
    // flow dots
    flowNodes = [];
    if (state._p) {
      for (const it of flow) {
        const info = state._p.perItem.get(it.uid);
        if (info && !info.flowU.isZero() && !info.blocked) flowNodes.push({ it, n: Math.min(3, 1 + Math.floor(Math.log10(info.flowU.toNumber() + 1))) });
      }
      for (const it of placed) {
        const info = state._p.perItem.get(it.uid);
        if (info && it.tpl && TEMPLATES.get(it.tpl).type === 'dropper' && !info.blocked && !flowNodes.some((f) => f.it === it)) flowNodes.push({ it, n: 1 });
      }
    }
    instanced('dots', shared.dot, flatMat('dot', { color: 0xfff3a0, emissive: 0x665500 }), caps.dots);
    rev = state._rev;
    lastSide = side;
  }

  // ghost: translucent item + validity marker (ring = valid, cross = invalid)
  const ghost = new THREE.Group();
  ghost.visible = false;
  scene.add(ghost);
  let ghostBody = null;
  let ghostShape = '';
  const markOk = new THREE.Mesh(res.get('geo:ghost-ok', () => new THREE.TorusGeometry(0.42, 0.06, 4, 16)), flatMat('ghost-ok', { color: 0x3ddc84, emissive: 0x116633 }));
  markOk.rotation.x = Math.PI / 2;
  markOk.position.y = 0.05;
  const crossGeo = res.get('geo:ghost-cross', () => new THREE.BoxGeometry(0.95, 0.08, 0.12));
  const markBad = new THREE.Group();
  const bar1 = new THREE.Mesh(crossGeo, flatMat('ghost-bad', { color: 0xff4d4d, emissive: 0x660000 }));
  const bar2 = bar1.clone();
  bar1.rotation.y = Math.PI / 4;
  bar2.rotation.y = -Math.PI / 4;
  markBad.add(bar1, bar2);
  markBad.position.y = 0.06;
  const tilePlane = new THREE.Mesh(res.get('geo:ghost-tile', () => new THREE.PlaneGeometry(0.98, 0.98)), flatMat('ghost-tile', { color: 0xffffff, transparent: true, opacity: 0.35 }));
  tilePlane.rotation.x = -Math.PI / 2;
  tilePlane.position.y = 0.02;
  const ghostArrow = new THREE.Mesh(shared.arrow, flatMat('ghost-arrow', { color: 0xffffff, emissive: 0x444444 }));
  ghostArrow.position.y = 1.0;
  ghost.add(markOk, markBad, tilePlane, ghostArrow);
  const ghostMat = res.get('mat:ghost-body', () => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0.55 }));
  const selRing = new THREE.Mesh(res.get('geo:sel-ring', () => new THREE.TorusGeometry(0.52, 0.05, 4, 20)), flatMat('sel', { color: 0xffffff, emissive: 0xaaaaaa }));
  selRing.rotation.x = Math.PI / 2;
  selRing.visible = false;
  scene.add(selRing);

  const api = {
    sync,
    setQuality(q) {
      caps.dots = dotsFor(q);
      const rec = meshes.get('dots');
      if (rec) {
        group.remove(rec.mesh);
        rec.mesh.dispose();
        meshes.delete('dots');
      }
      rev = -1; // force a re-sync so the dots mesh is rebuilt at the new capacity
    },
    /** state: simulation state. cell: {x,y}|null. valid: bool. */
    setGhost({ tpl, x, y, dir = 0, valid = true, side }) {
      if (!tpl) {
        ghost.visible = false;
        return;
      }
      const shape = TEMPLATES.get(tpl)?.shape || 'drill';
      if (shape !== ghostShape) {
        if (ghostBody) ghost.remove(ghostBody);
        ghostBody = new THREE.Mesh(res.get('geo:shape:' + shape, () => buildShapeGeometry(SHAPES[shape] || SHAPES.drill)), ghostMat);
        ghost.add(ghostBody);
        ghostShape = shape;
      }
      const w = cellToWorld(x, y, side);
      ghost.position.set(w.x, 0, w.z);
      markOk.visible = valid;
      markBad.visible = !valid;
      tilePlane.material.color.set(valid ? 0x3ddc84 : 0xff4d4d);
      ghostArrow.rotation.y = -dir * (Math.PI / 2);
      ghostBody.rotation.y = shape === 'turret' ? -dir * (Math.PI / 2) : 0;
      ghost.visible = true;
    },
    clearGhost() {
      ghost.visible = false;
    },
    setSelection(x, y, side) {
      if (x == null) {
        selRing.visible = false;
        return;
      }
      const w = cellToWorld(x, y, side);
      selRing.position.set(w.x, 0.07, w.z);
      selRing.visible = true;
    },
    update(state, t, motion = 1) {
      if (state._rev !== rev || getSide() !== lastSide) sync(state);
      // gems bob and spin (frozen when motion is reduced)
      if (gems && gemData.length) {
        const side = getSide();
        gemData.forEach((d, i) => {
          const w = cellToWorld(d.it.x, d.it.y, side);
          dummy.position.set(w.x, 1.25 + Math.sin(t * 2 + i) * 0.05 * motion, w.z);
          dummy.rotation.set(0, t * 1.5 * motion, 0);
          dummy.scale.setScalar(d.scale);
          dummy.updateMatrix();
          gems.setMatrixAt(i, dummy.matrix);
        });
        gems.instanceMatrix.needsUpdate = true;
      }
      const dots = meshes.get('dots');
      if (dots) {
        const side = getSide();
        let k = 0;
        for (const f of flowNodes) {
          const [dx, dy] = DIRS[f.it.dir || 0];
          const w = cellToWorld(f.it.x, f.it.y, side);
          for (let i = 0; i < f.n && k < caps.dots; i++) {
            const ph = motion ? (t * 0.8 + i / f.n) % 1 : i / f.n;
            dummy.position.set(w.x + dx * (ph - 0.5), 1.1, w.z + dy * (ph - 0.5));
            dummy.rotation.set(0, 0, 0);
            dummy.scale.setScalar(1);
            dummy.updateMatrix();
            dots.mesh.setMatrixAt(k++, dummy.matrix);
          }
        }
        dots.mesh.count = k;
        dots.mesh.instanceMatrix.needsUpdate = true;
      }
    },
    liveInstances() {
      let n = 0;
      for (const r of meshes.values()) n += r.mesh.count;
      return n;
    },
    dispose() {
      for (const r of meshes.values()) {
        group.remove(r.mesh);
        r.mesh.dispose();
      }
      meshes.clear();
      scene.remove(group, ghost, selRing);
    },
  };
  return api;
}

