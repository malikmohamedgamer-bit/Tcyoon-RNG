// Renderer facade: owns the WebGL renderer, scene, camera, lights, base, pixel
// pipeline and the Resources tracker. The renderer only *reads* simulation state;
// nothing here mutates it.

import * as THREE from 'three';
import { Resources, gpuAudit } from './resources.js';
import { createPixelPipeline } from './pixelate.js';
import { createCameraController } from './camera.js';
import { createBase, worldToCell, cellToWorld, MAX_SIDE } from './base.js';
import { createItemsRenderer } from './items.js';
import { createEnemiesRenderer } from './enemies.js';
import { createEffects } from './effects.js';

export const QUALITY = {
  low: { props: 4, effects: 40, pixelMin: 3 },
  medium: { props: 8, effects: 120, pixelMin: 1 },
  high: { props: 12, effects: 300, pixelMin: 1 },
};

export function createRenderer({ canvas, quality = 'medium', pixelSize = 4, reducedMotion = false }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const res = new Resources();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 400);
  const cam = createCameraController(camera, { sway: !reducedMotion });
  const pixel = createPixelPipeline(renderer, res);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x667788, 1.6);
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(6, 12, 4);
  scene.add(hemi, sun);

  const base = createBase({ scene, res, quality });
  const items = createItemsRenderer({ scene, res, getSide: () => base.side, quality });
  const raycaster = new THREE.Raycaster();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  const ndc = new THREE.Vector2();
  let motion = reducedMotion ? 0 : 1;
  let userPixel = pixelSize;
  let lastTheme = null;
  let reduced = reducedMotion;
  let clock = 0;
  let q = quality;

  function resize() {
    const w = canvas.clientWidth || canvas.parentElement?.clientWidth || 800;
    const h = canvas.clientHeight || canvas.parentElement?.clientHeight || 600;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    pixel.resize(w, h);
  }

  const api = {
    renderer,
    scene,
    camera,
    cam,
    res,
    base,
    items,
    enemies: createEnemiesRenderer({ scene, res, quality }),
    effects: createEffects({ scene, res, quality, reducedMotion }),
    pixel,
    setTheme(theme) {
      lastTheme = theme;
      base.setTheme(theme, q);
      scene.userData.accent = theme.palette.accent;
    },
    setBaseSide(s) {
      base.setSide(s);
      cam.setLimit(Math.min(MAX_SIDE, s) / 2 + 4);
    },
    setPixelSize(n) {
      userPixel = n;
      pixel.setPixelSize(Math.max(n, QUALITY[q].pixelMin));
    },
    /** Switch graphics quality: pools and effect caps are rebuilt (old ones disposed), props re-laid out. */
    setQuality(name) {
      if (!QUALITY[name] || name === q) return;
      q = name;
      api.enemies.dispose();
      api.effects.dispose();
      api.enemies = createEnemiesRenderer({ scene, res, quality: q });
      api.effects = createEffects({ scene, res, quality: q, reducedMotion: reduced });
      items.setQuality(q);
      if (lastTheme) base.setTheme(lastTheme, q);
      pixel.setPixelSize(Math.max(userPixel, QUALITY[q].pixelMin));
    },
    setReducedMotion(on) {
      reduced = on;
      motion = on ? 0 : 1;
      api.effects.setReducedMotion(on);
    },
    resize,
    /** Convert a pointer position (client px) to a grid cell on the y=0 plane. */
    pickCell(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -(((clientY - r.top) / r.height) * 2 - 1));
      raycaster.setFromCamera(ndc, camera);
      if (!raycaster.ray.intersectPlane(ground, hit)) return null;
      const c = worldToCell(hit.x, hit.z, base.side);
      return { ...c, wx: hit.x, wz: hit.z, inside: c.x >= 0 && c.y >= 0 && c.x < base.side && c.y < base.side };
    },
    /** Screen (client) position of a grid cell centre; used by tests and tooltips. */
    cellToScreen(cx, cy) {
      const w = cellToWorld(cx, cy, base.side);
      const v = new THREE.Vector3(w.x, 0.3, w.z).project(camera);
      const r = canvas.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    },
    render(dt, state) {
      cam.update(dt);
      base.update(dt, motion);
      clock += dt;
      if (state) {
        items.update(state, clock, motion);
        const enc = state._enc || null;
        api.enemies.update(enc, clock, motion);
        if (enc) {
          if (enc.ev.length) {
            const evs = enc.ev.splice(0);
            if (api.onFightEvents) api.onFightEvents(evs);
            api.effects.push(evs);
          }
        } else if (state._lastEnc && state._lastEnc.ev.length) api.effects.push(state._lastEnc.ev.splice(0));
      }
      api.effects.update(dt);
      pixel.render(scene, camera);
    },
    audit() {
      return gpuAudit(renderer, res);
    },
    dispose() {
      api.effects.dispose();
      api.enemies.dispose();
      items.dispose();
      base.dispose();
      pixel.dispose();
      res.disposeAll();
      renderer.dispose();
    },
  };
  resize();
  pixel.setPixelSize(pixelSize);
  return api;
}
