// Central GPU-resource bookkeeping. Every geometry/material/texture the renderer
// creates goes through a Resources instance so that
//   (a) shared things are created once (cache by key),
//   (b) a scene/theme/base change can dispose exactly what it owned, and
//   (c) the GPU audit hook can compare tracked counts to renderer.info and flag leaks.

export class Resources {
  constructor() {
    this.cache = new Map(); // key -> disposable (geometry|material|texture)
    this.owned = new Set(); // anonymous one-offs
    this.disposed = 0;
  }

  /** Get-or-create a shared resource. `make` returns an object with dispose(). */
  get(key, make) {
    let r = this.cache.get(key);
    if (!r) {
      r = make();
      this.cache.set(key, r);
    }
    return r;
  }

  /** Track a one-off resource so disposeAll() frees it. */
  own(obj) {
    if (obj && typeof obj.dispose === 'function') this.owned.add(obj);
    return obj;
  }

  /** Dispose one tracked resource now (e.g. an instanced mesh being replaced). */
  release(obj) {
    if (!obj) return;
    if (this.owned.delete(obj)) {
      obj.dispose();
      this.disposed++;
      return;
    }
    for (const [k, v] of this.cache) {
      if (v === obj) {
        this.cache.delete(k);
        obj.dispose();
        this.disposed++;
        return;
      }
    }
  }

  /** Dispose all cached resources whose key starts with prefix (a theme, a base...). */
  disposePrefix(prefix) {
    for (const [k, v] of [...this.cache]) {
      if (k.startsWith(prefix)) {
        v.dispose();
        this.cache.delete(k);
        this.disposed++;
      }
    }
  }

  disposeAll() {
    for (const v of this.cache.values()) {
      v.dispose();
      this.disposed++;
    }
    this.cache.clear();
    for (const v of this.owned) {
      v.dispose();
      this.disposed++;
    }
    this.owned.clear();
  }

  counts() {
    const c = { geometries: 0, materials: 0, textures: 0, other: 0 };
    const tally = (v) => {
      if (v.isBufferGeometry) c.geometries++;
      else if (v.isMaterial) c.materials++;
      else if (v.isTexture) c.textures++;
      else c.other++;
    };
    this.cache.forEach(tally);
    this.owned.forEach(tally);
    return c;
  }
}

/**
 * GPU audit: snapshot of what the renderer holds vs. what we track.
 * `renderer` may be null (Node tests). Compare two snapshots with diffAudit().
 */
export function gpuAudit(renderer, res) {
  const info = renderer ? renderer.info : null;
  return {
    renderer: info
      ? {
          geometries: info.memory.geometries,
          textures: info.memory.textures,
          programs: info.programs ? info.programs.length : 0,
          drawCalls: info.render.calls,
          triangles: info.render.triangles,
        }
      : null,
    tracked: res.counts(),
  };
}

/** Returns the list of resource kinds that grew by more than `tolerance` between snapshots. */
export function diffAudit(before, after, tolerance = 0) {
  const grew = [];
  const check = (name, a, b) => {
    if (b - a > tolerance) grew.push({ name, before: a, after: b });
  };
  for (const k of Object.keys(before.tracked)) check('tracked.' + k, before.tracked[k], after.tracked[k]);
  if (before.renderer && after.renderer) {
    for (const k of ['geometries', 'textures', 'programs']) check('renderer.' + k, before.renderer[k], after.renderer[k]);
  }
  return grew;
}
