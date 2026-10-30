// Orbit / pan / zoom camera for the base. State is plain numbers (yaw, pitch,
// distance, target) so it is easy to save, test and animate.

import * as THREE from 'three';

export function createCameraController(camera, opts = {}) {
  const c = {
    yaw: Math.PI / 4,
    pitch: 0.95,
    dist: 14,
    target: new THREE.Vector3(0, 0, 0),
    minDist: 4,
    maxDist: 80,
    limit: 20, // pan limit radius
    sway: opts.sway !== false, // idle camera sway (disabled by reduced motion)
    invertY: false,
    speed: 1,
    _t: 0,
    panBy,
    orbitBy,
    zoomBy,
    setLimit,
    reset,
    update,
  };
  const minPitch = 0.25;
  const maxPitch = 1.45;

  function setLimit(l) {
    c.limit = Math.max(6, l);
  }
  function panBy(dx, dz) {
    // dx/dz in camera-relative ground axes, scaled by distance so it feels constant
    const s = c.dist * 0.0018 * c.speed;
    const sin = Math.sin(c.yaw);
    const cos = Math.cos(c.yaw);
    c.target.x += (dx * cos + dz * sin) * s;
    c.target.z += (-dx * sin + dz * cos) * s;
    const r = Math.hypot(c.target.x, c.target.z);
    if (r > c.limit) {
      c.target.x *= c.limit / r;
      c.target.z *= c.limit / r;
    }
  }
  function orbitBy(dyaw, dpitch) {
    c.yaw += dyaw * 0.006 * c.speed;
    c.pitch = Math.min(maxPitch, Math.max(minPitch, c.pitch + (c.invertY ? -dpitch : dpitch) * 0.006 * c.speed));
  }
  function zoomBy(f) {
    c.dist = Math.min(c.maxDist, Math.max(c.minDist, c.dist * f));
  }
  function reset() {
    c.yaw = Math.PI / 4;
    c.pitch = 0.95;
    c.dist = 14;
    c.target.set(0, 0, 0);
  }
  function update(dt) {
    c._t += dt;
    const sway = c.sway ? Math.sin(c._t * 0.25) * 0.03 : 0;
    const yaw = c.yaw + sway;
    const cp = Math.cos(c.pitch);
    camera.position.set(
      c.target.x + Math.sin(yaw) * cp * c.dist,
      c.target.y + Math.sin(c.pitch) * c.dist,
      c.target.z + Math.cos(yaw) * cp * c.dist,
    );
    camera.lookAt(c.target);
  }
  update(0);
  return c;
}

/**
 * Pointer wiring: right-drag (or shift+left-drag) orbits, left-drag on empty ground
 * pans, wheel zooms, two-finger touch pans + pinches + twists. `shouldIgnore(ev)`
 * lets placement code claim a gesture first (e.g. dragging an item).
 */
export function attachPointerControls(el, cam, { shouldIgnore = () => false } = {}) {
  const pts = new Map();
  let mode = null;
  let lastX = 0;
  let lastY = 0;
  let pinch = null;
  let moved = 0;

  const down = (e) => {
    if (shouldIgnore(e)) return;
    el.setPointerCapture?.(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    lastX = e.clientX;
    lastY = e.clientY;
    moved = 0;
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      mode = 'pinch';
    } else if (e.button === 2 || e.shiftKey) mode = 'orbit';
    else mode = 'pan';
  };
  const move = (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (mode === 'pinch' && pts.size >= 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      if (pinch.d > 0 && d > 0) cam.zoomBy(pinch.d / d);
      cam.orbitBy(-(ang - pinch.ang) * 160, 0);
      cam.panBy(-(mx - pinch.mx), -(my - pinch.my));
      pinch = { d, ang, mx, my };
      return;
    }
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    if (mode === 'orbit') cam.orbitBy(-dx, -dy);
    else if (mode === 'pan') cam.panBy(-dx, -dy);
  };
  const up = (e) => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (pts.size === 0) mode = null;
    else if (pts.size === 1) {
      mode = 'pan';
      const p = [...pts.values()][0];
      lastX = p.x;
      lastY = p.y;
    }
  };
  const wheel = (e) => {
    e.preventDefault();
    cam.zoomBy(Math.exp(e.deltaY * 0.0012));
  };
  const ctx = (e) => e.preventDefault();

  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('wheel', wheel, { passive: false });
  el.addEventListener('contextmenu', ctx);
  return {
    get moved() {
      return moved;
    },
    detach() {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('contextmenu', ctx);
    },
  };
}
