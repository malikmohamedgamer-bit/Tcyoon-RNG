// Low-resolution render target + nearest-neighbour upscale. pixelSize 1 renders
// straight to the canvas. Only this module knows about the offscreen pass, so the
// rest of the renderer (and ray casting) always works in full-canvas coordinates.

import * as THREE from 'three';

export function createPixelPipeline(renderer, res) {
  const quadScene = new THREE.Scene();
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadGeo = res.own(new THREE.PlaneGeometry(2, 2));
  const quadMat = res.own(new THREE.MeshBasicMaterial({ toneMapped: false, depthTest: false, depthWrite: false }));
  quadScene.add(new THREE.Mesh(quadGeo, quadMat));

  let target = null;
  let pixelSize = 4;
  let w = 1;
  let h = 1;

  function makeTarget() {
    if (target) {
      target.dispose();
      res.owned.delete(target);
      target = null;
    }
    if (pixelSize <= 1) {
      quadMat.map = null;
      return;
    }
    const tw = Math.max(1, Math.ceil(w / pixelSize));
    const th = Math.max(1, Math.ceil(h / pixelSize));
    target = res.own(
      new THREE.WebGLRenderTarget(tw, th, {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        depthBuffer: true,
        samples: 0,
      }),
    );
    quadMat.map = target.texture;
    quadMat.needsUpdate = true;
  }

  return {
    get pixelSize() {
      return pixelSize;
    },
    get targetSize() {
      return target ? [target.width, target.height] : [w, h];
    },
    setPixelSize(n) {
      n = Math.max(1, Math.min(16, Math.round(n) || 1));
      if (n === pixelSize && (target || n === 1)) return;
      pixelSize = n;
      makeTarget();
    },
    resize(width, height) {
      w = Math.max(1, width);
      h = Math.max(1, height);
      makeTarget();
    },
    render(scene, camera) {
      if (!target) {
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
        return;
      }
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(quadScene, quadCam);
    },
    dispose() {
      if (target) {
        target.dispose();
        res.owned.delete(target);
        target = null;
      }
    },
  };
}
