// The 3D base: instanced floor tiles (unlocked + one dimmed locked ring), a
// procedural pixel-art floor texture, and theme props arranged around the edge.
// Everything is built from primitives and canvas textures; nothing is loaded.

import * as THREE from 'three';

export const MAX_SIDE = 32;
export const cellToWorld = (x, y, side) => ({ x: x - (side - 1) / 2, z: y - (side - 1) / 2 });
export const worldToCell = (wx, wz, side) => ({ x: Math.floor(wx + side / 2), y: Math.floor(wz + side / 2) });

/** Grayscale 16x16 pattern, tinted per instance. Nearest filtered => crisp pixel look. */
function floorTexture(kind) {
  const n = 16;
  const cv = document.createElement('canvas');
  cv.width = cv.height = n;
  const g = cv.getContext('2d');
  g.fillStyle = '#e8e8e8';
  g.fillRect(0, 0, n, n);
  g.fillStyle = '#c4c4c4';
  g.strokeStyle = '#c4c4c4';
  if (kind === 'plates') {
    g.fillRect(0, 0, n, 1);
    g.fillRect(0, 0, 1, n);
    g.fillStyle = '#9a9a9a';
    for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) g.fillRect(x, y, 1, 1);
  } else if (kind === 'rivets') {
    g.fillRect(0, 7, n, 2);
    g.fillStyle = '#8c8c8c';
    for (let x = 1; x < n; x += 4) {
      g.fillRect(x, 3, 1, 1);
      g.fillRect(x, 12, 1, 1);
    }
  } else if (kind === 'hex') {
    for (let i = 0; i < n; i++) {
      g.fillRect(i, (i % 8) + 4, 1, 1);
      g.fillRect(n - 1 - i, (i % 8) + 4, 1, 1);
    }
  } else if (kind === 'circuit') {
    g.fillStyle = '#b8b8b8';
    g.fillRect(2, 7, 12, 1);
    g.fillRect(7, 2, 1, 12);
    g.fillStyle = '#f4f4f4';
    g.fillRect(6, 6, 3, 3);
  } else {
    g.fillStyle = '#d6d6d6';
    g.fillRect(0, 0, n / 2, n / 2);
    g.fillRect(n / 2, n / 2, n / 2, n / 2);
  }
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const lambert = (res, hex, extra = {}) =>
  res.get(`mat:l:${hex}:${extra.emissive || ''}`, () => new THREE.MeshLambertMaterial({ color: hex, flatShading: true, ...extra }));

// prop part tables: [geometry, args, colorKey, [x,y,z], [rx,ry,rz], [sx,sy,sz]]
const PARTS = {
  gear: [['cyl', [0.7, 0.7, 0.3, 8], 'prop1', [0, 0.25, 0]], ['box', [1.6, 0.25, 0.3], 'prop3', [0, 0.25, 0]], ['box', [0.3, 0.25, 1.6], 'prop3', [0, 0.25, 0]]],
  pipe: [['cyl', [0.22, 0.22, 2, 8], 'prop1', [0, 1, 0]], ['cyl', [0.22, 0.22, 1.4, 8], 'prop2', [0.7, 1.9, 0], [0, 0, Math.PI / 2]]],
  chimney: [['cyl', [0.4, 0.55, 3, 6], 'prop3', [0, 1.5, 0]], ['cyl', [0.45, 0.45, 0.2, 6], 'prop2', [0, 3.05, 0]]],
  crate: [['box', [0.95, 0.95, 0.95], 'prop2', [0, 0.48, 0]], ['box', [1, 0.15, 1], 'prop3', [0, 0.48, 0]]],
  boiler: [['cyl', [0.75, 0.75, 1.8, 8], 'prop1', [0, 0.85, 0], [0, 0, Math.PI / 2]], ['cone', [0.35, 0.6, 6], 'prop2', [0, 1.6, 0]]],
  tank: [['cyl', [0.8, 0.8, 1.6, 8], 'prop2', [0, 0.8, 0]], ['cone', [0.8, 0.7, 8], 'prop1', [0, 1.95, 0]]],
  planet: [['ico', [0.9, 0], 'prop2', [0, 1.4, 0]], ['torus', [1.3, 0.08, 4, 14], 'prop3', [0, 1.4, 0], [Math.PI / 2.3, 0, 0.3]]],
  crystal: [['oct', [0.6, 0], 'prop2', [0, 1.1, 0], [0, 0, 0], [1, 1.9, 1]]],
  antenna: [['cyl', [0.06, 0.1, 2.6, 5], 'prop1', [0, 1.3, 0]], ['sph', [0.2, 6, 4], 'prop3', [0, 2.7, 0]], ['box', [1, 0.06, 0.06], 'prop1', [0, 2.0, 0]]],
  ring: [['torus', [0.9, 0.12, 4, 14], 'prop1', [0, 1.1, 0], [Math.PI / 2, 0, 0]], ['sph', [0.3, 6, 4], 'prop3', [0, 1.1, 0]]],
  pylon: [['cone', [0.45, 3, 4], 'prop2', [0, 1.5, 0]], ['sph', [0.18, 6, 4], 'prop1', [0, 3.1, 0]]],
  hologram: [['cyl', [0.6, 0.7, 0.15, 8], 'prop2', [0, 0.1, 0]], ['oct', [0.45, 0], 'prop1', [0, 1.1, 0]]],
  server: [['box', [0.8, 1.9, 0.8], 'prop2', [0, 0.95, 0]], ['box', [0.7, 0.08, 0.04], 'prop1', [0, 1.5, 0.41]], ['box', [0.7, 0.08, 0.04], 'prop1', [0, 1.1, 0.41]], ['box', [0.7, 0.08, 0.04], 'prop1', [0, 0.7, 0.41]]],
  cube: [['box', [1, 1, 1], 'prop1', [0, 0.5, 0]], ['box', [0.5, 0.5, 0.5], 'prop2', [0.6, 1.25, 0.2]]],
  tree: [['box', [0.35, 1, 0.35], 'prop2', [0, 0.5, 0]], ['box', [1.3, 1.1, 1.3], 'prop1', [0, 1.5, 0]], ['box', [0.8, 0.8, 0.8], 'prop1', [0, 2.3, 0]]],
  stair: [['box', [1.6, 0.4, 1], 'prop3', [0, 0.2, 0]], ['box', [1.2, 0.4, 1], 'prop3', [0.2, 0.6, 0]], ['box', [0.8, 0.4, 1], 'prop3', [0.4, 1.0, 0]]],
  heart: [['box', [0.5, 0.5, 0.5], 'prop2', [-0.3, 1.2, 0]], ['box', [0.5, 0.5, 0.5], 'prop2', [0.3, 1.2, 0]], ['box', [1.1, 0.5, 0.5], 'prop2', [0, 0.8, 0]], ['box', [0.5, 0.4, 0.5], 'prop2', [0, 0.45, 0]]],
};

function geoFor(res, kind, args) {
  return res.get(`geo:${kind}:${args.join(',')}`, () => {
    switch (kind) {
      case 'box': return new THREE.BoxGeometry(...args);
      case 'cyl': return new THREE.CylinderGeometry(args[0], args[1], args[2], args[3]);
      case 'cone': return new THREE.ConeGeometry(...args);
      case 'sph': return new THREE.SphereGeometry(...args);
      case 'ico': return new THREE.IcosahedronGeometry(...args);
      case 'oct': return new THREE.OctahedronGeometry(...args);
      case 'torus': return new THREE.TorusGeometry(...args);
      default: return new THREE.BoxGeometry(1, 1, 1);
    }
  });
}

export function buildProp(res, kind, palette) {
  const g = new THREE.Group();
  for (const [geo, args, ck, pos, rot, scl] of PARTS[kind] || PARTS.cube) {
    const m = new THREE.Mesh(geoFor(res, geo, args), lambert(res, palette[ck] || '#888888'));
    m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    if (scl) m.scale.set(...scl);
    g.add(m);
  }
  g.userData.kind = kind;
  return g;
}

export function createBase({ scene, res, quality }) {
  const group = new THREE.Group();
  scene.add(group);
  let floor = null;
  let ground = null;
  let props = [];
  let theme = null;
  let side = 6;
  let themeKey = '';

  const tileGeo = () => res.get('geo:tile', () => new THREE.BoxGeometry(0.96, 0.2, 0.96));

  function clearFloor() {
    if (floor) {
      group.remove(floor);
      floor.dispose(); // frees the instance buffers; geometry/material are shared
      floor = null;
    }
  }
  function rebuildGround() {
    if (ground) group.remove(ground);
    const gcol = new THREE.Color(theme.palette.tileB).multiplyScalar(0.75).getHex();
    const mat = res.get(`mat:ground:${gcol}`, () => new THREE.MeshLambertMaterial({ color: gcol, flatShading: true }));
    const geo = res.get('geo:ground', () => new THREE.CylinderGeometry(70, 70, 0.3, 24));
    ground = new THREE.Mesh(geo, mat);
    ground.position.y = -0.4;
    group.add(ground);
  }
  function clearProps() {
    for (const p of props) group.remove(p);
    props = [];
  }

  function rebuildFloor() {
    clearFloor();
    if (!theme) return;
    const vis = Math.min(MAX_SIDE + 2, side + 2);
    const count = vis * vis;
    const tex = res.get(`tex:floor:${theme.floor}`, () => floorTexture(theme.floor));
    const mat = res.get(`mat:floor:${theme.floor}`, () => new THREE.MeshLambertMaterial({ map: tex, flatShading: true }));
    floor = new THREE.InstancedMesh(tileGeo(), mat, count);
    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    let i = 0;
    const off = (vis - 1) / 2;
    for (let y = 0; y < vis; y++) {
      for (let x = 0; x < vis; x++) {
        const cx = x - (vis - side) / 2;
        const cy = y - (vis - side) / 2;
        const inside = cx >= 0 && cy >= 0 && cx < side && cy < side;
        m4.makeTranslation(x - off, inside ? -0.1 : -0.18, y - off);
        floor.setMatrixAt(i, m4);
        col.set(inside ? ((x + y) % 2 ? theme.palette.tileA : theme.palette.tileB) : theme.palette.locked);
        floor.setColorAt(i, col);
        i++;
      }
    }
    floor.instanceMatrix.needsUpdate = true;
    if (floor.instanceColor) floor.instanceColor.needsUpdate = true;
    floor.frustumCulled = false;
    group.add(floor);
  }

  function rebuildProps() {
    clearProps();
    if (!theme) return;
    const n = quality === 'low' ? 4 : quality === 'medium' ? 8 : 12;
    const r = Math.min(MAX_SIDE, side) / 2 + 3.2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.4;
      const kind = theme.props[i % theme.props.length];
      const p = buildProp(res, kind, theme.palette);
      p.position.set(Math.cos(a) * r * 1.05, -0.25, Math.sin(a) * r * 1.05);
      p.rotation.y = -a;
      p.userData.spin = kind === 'gear' || kind === 'planet' || kind === 'ring' || kind === 'hologram' || kind === 'crystal';
      group.add(p);
      props.push(p);
    }
  }

  return {
    group,
    get side() {
      return side;
    },
    setTheme(t, q) {
      if (q) quality = q;
      const key = `${t.id}|${quality}|${JSON.stringify(t.palette)}`;
      if (key === themeKey) return;
      themeKey = key;
      theme = t;
      scene.background = new THREE.Color(t.palette.sky);
      scene.fog = new THREE.Fog(t.palette.fog, 35, 110);
      rebuildGround();
      rebuildFloor();
      rebuildProps();
    },
    setSide(s) {
      s = Math.max(2, Math.min(MAX_SIDE, Math.floor(s)));
      if (s === side) return;
      side = s;
      rebuildFloor();
      rebuildProps();
    },
    update(t, motion = 1) {
      for (const p of props) if (p.userData.spin) p.rotation.y += 0.004 * motion;
    },
    dispose() {
      clearFloor();
      clearProps();
      if (ground) group.remove(ground);
      scene.remove(group);
    },
  };
}
