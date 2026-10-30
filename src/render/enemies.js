// Pooled enemy rendering. One InstancedMesh for bodies and one for hp bars are allocated once
// (capacity by quality) and re-filled every frame: no per-enemy objects are created or disposed,
// so fights never churn the GPU. Enemies beyond the capacity are simply not drawn.
import * as THREE from 'three';

const COLORS = { grunt: '#6bdc6b', runner: '#ffd95e', archer: '#56b4e9', swarm: '#cc79a7', tank: '#b0b6c0', healer: '#7be0c4', golem: '#c58b5a', boss: '#ff4040', minion: '#9be26b' };

export const ENEMY_CAP = { low: 64, medium: 128, high: 256 };

export function createEnemiesRenderer({ scene, res, quality = 'medium' }) {
  const cap = ENEMY_CAP[quality] || ENEMY_CAP.medium;
  const bodyGeo = res.get('geo:enemy-body', () => new THREE.IcosahedronGeometry(0.42, 0));
  const barGeo = res.get('geo:enemy-bar', () => new THREE.BoxGeometry(0.9, 0.09, 0.09));
  const bodyMat = res.get('mat:enemy-body', () => new THREE.MeshLambertMaterial({ flatShading: true }));
  const barMat = res.get('mat:enemy-bar', () => new THREE.MeshBasicMaterial({ toneMapped: false }));
  const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, cap);
  const bars = new THREE.InstancedMesh(barGeo, barMat, cap);
  bodies.frustumCulled = false;
  bars.frustumCulled = false;
  bodies.count = 0;
  bars.count = 0;
  scene.add(bodies, bars);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();

  // the manual-control avatar: a cone with a shield bubble
  const av = new THREE.Group();
  const avBody = new THREE.Mesh(res.get('geo:avatar', () => new THREE.ConeGeometry(0.4, 1.1, 5)), res.get('mat:avatar', () => new THREE.MeshLambertMaterial({ color: '#7cc4ff', flatShading: true })));
  avBody.position.y = 0.55;
  const bubble = new THREE.Mesh(res.get('geo:bubble', () => new THREE.SphereGeometry(1.2, 10, 8)), res.get('mat:bubble', () => new THREE.MeshBasicMaterial({ color: '#7cc4ff', transparent: true, opacity: 0.25, depthWrite: false })));
  bubble.position.y = 0.6;
  av.add(avBody, bubble);
  av.visible = false;
  scene.add(av);

  return {
    /** Fill the pool from an encounter (or hide everything when enc is null). */
    update(enc, t, motion = 1) {
      if (!enc) {
        bodies.count = 0;
        bars.count = 0;
        av.visible = false;
        return;
      }
      let n = 0;
      for (const e of enc.enemies) {
        if (n >= cap) break;
        const boss = e.boss;
        const s = boss ? 2.6 : e.tpl === 'golem' ? 1.5 : e.tpl === 'tank' ? 1.25 : e.tpl === 'swarm' ? 0.55 : 1;
        const bob = motion ? Math.sin(t * 6 + e.id) * 0.06 : 0;
        const fly = e.traits.includes('fly') ? 0.7 : 0;
        dummy.position.set(e.x, 0.4 * s + bob + fly, e.z);
        dummy.rotation.set(0, Math.atan2(-e.x, -e.z), 0);
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        bodies.setMatrixAt(n, dummy.matrix);
        col.set(COLORS[e.tpl] || (boss ? COLORS.boss : COLORS.grunt));
        if (e.slowT > 0) col.lerp(new THREE.Color('#9fd8ff'), 0.5);
        if (e.burnT > 0) col.lerp(new THREE.Color('#ff9a3d'), 0.5);
        bodies.setColorAt(n, col);
        const frac = Math.max(0, Math.min(1, e.hp.div(e.maxHp).toNumber()));
        dummy.position.set(e.x, 1.0 * s + 0.35 + fly, e.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(Math.max(0.02, frac) * (boss ? 2.4 : 1), 1, 1);
        dummy.updateMatrix();
        bars.setMatrixAt(n, dummy.matrix);
        col.setRGB(1 - frac, frac, 0.1);
        bars.setColorAt(n, col);
        n++;
      }
      bodies.count = n;
      bars.count = n;
      bodies.instanceMatrix.needsUpdate = true;
      bars.instanceMatrix.needsUpdate = true;
      if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
      if (bars.instanceColor) bars.instanceColor.needsUpdate = true;
      if (enc.avatar && enc.manual) {
        av.visible = true;
        av.position.set(enc.avatar.x, 0, enc.avatar.z);
        bubble.visible = enc.shieldT > 0;
      } else av.visible = false;
    },
    get live() {
      return bodies.count;
    },
    cap,
    dispose() {
      scene.remove(bodies, bars, av);
      bodies.dispose();
      bars.dispose();
    },
  };
}
