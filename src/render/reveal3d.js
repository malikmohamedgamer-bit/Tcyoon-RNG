// The 3D part of a rare-item cutscene: a gentle camera push, a light tint and a burst of particles.
// Everything temporary is created in begin() and disposed in end() (Resources.release), so a thousand
// cutscenes leave the GPU exactly as they found it (a test and the soak check this). Reduced motion:
// no camera movement and no particles (the curves from sim/reveal.js are already 0), only a slow light tint.
import * as THREE from 'three';
import { Rng } from '../core/rng.js';

const CAP = { low: 40, medium: 96, high: 140 };

export function createReveal3D({ scene, cam, hemi, sun, res, quality = 'medium' }) {
  let active = null;
  let serial = 0;
  const api = {
    get active() {
      return !!active;
    },
    setQuality(q) {
      quality = q;
    },
    /** Start a cutscene: remembers the camera and lights so end() can restore them exactly. */
    begin({ color = '#ffffff', reduced = false } = {}) {
      api.end();
      const n = reduced ? 0 : CAP[quality] || CAP.medium;
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(Math.max(1, n) * 3);
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setDrawRange(0, 0);
      const mat = new THREE.PointsMaterial({ color: new THREE.Color(color), size: 0.35, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false });
      const points = new THREE.Points(geo, mat);
      points.frustumCulled = false;
      scene.add(points);
      res.own(geo);
      res.own(mat);
      active = {
        geo, mat, points, pos, n, color: new THREE.Color(color), reduced,
        vel: new Float32Array(Math.max(1, n) * 3), life: new Float32Array(Math.max(1, n)), alive: 0,
        rng: new Rng(++serial * 40503),
        orig: { dist: cam.dist, yaw: cam.yaw, hemiColor: hemi.color.clone(), hemiI: hemi.intensity, sunI: sun.intensity },
      };
    },
    /** Spawn `count` particles from the middle of the base (ignored when reduced or over the cap). */
    burst(count) {
      const a = active;
      if (!a || a.reduced) return;
      const k = Math.min(count, a.n);
      for (let i = 0; i < k; i++) {
        const ang = a.rng.next() * Math.PI * 2;
        const sp = 2 + a.rng.next() * 5;
        a.pos.set([0, 0.8, 0], i * 3);
        a.vel.set([Math.cos(ang) * sp, 3 + a.rng.next() * 5, Math.sin(ang) * sp], i * 3);
        a.life[i] = 1.1 + a.rng.next() * 0.6;
      }
      a.alive = k;
      a.geo.setDrawRange(0, k);
    },
    /** Per frame: params from cutscene curves (camera 0..1 zoom, tint 0..1, glow 0..1, spin radians). */
    update(p, dt) {
      const a = active;
      if (!a) return;
      cam.dist = a.orig.dist * (1 - p.camera);
      cam.yaw = a.orig.yaw + p.spin;
      hemi.color.copy(a.orig.hemiColor).lerp(a.color, 0.55 * p.tint);
      hemi.intensity = a.orig.hemiI * (1 + 0.5 * p.glow);
      sun.intensity = a.orig.sunI * (1 + 0.25 * p.glow);
      if (a.alive) {
        let live = 0;
        for (let i = 0; i < a.alive; i++) {
          if (a.life[i] <= 0) continue;
          a.life[i] -= dt;
          a.vel[i * 3 + 1] -= 9 * dt; // gravity
          for (let k = 0; k < 3; k++) a.pos[i * 3 + k] += a.vel[i * 3 + k] * dt;
          if (a.life[i] > 0) live++;
          else a.pos.set([0, -50, 0], i * 3); // parked below the floor
        }
        a.geo.attributes.position.needsUpdate = true;
        a.mat.opacity = live ? 0.9 : 0;
      }
    },
    /** Restore camera and lights and dispose everything this cutscene created. Safe to call twice. */
    end() {
      const a = active;
      if (!a) return;
      active = null;
      cam.dist = a.orig.dist;
      cam.yaw = a.orig.yaw;
      hemi.color.copy(a.orig.hemiColor);
      hemi.intensity = a.orig.hemiI;
      sun.intensity = a.orig.sunI;
      scene.remove(a.points);
      res.release(a.geo);
      res.release(a.mat);
    },
    dispose() {
      api.end();
    },
  };
  return api;
}
