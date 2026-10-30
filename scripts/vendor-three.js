// Re-vendors the pinned Three.js build from node_modules into vendor/three.
import { copyFileSync, mkdirSync } from 'node:fs';
mkdirSync('vendor/three', { recursive: true });
copyFileSync('node_modules/three/build/three.module.min.js', 'vendor/three/three.module.min.js');
copyFileSync('node_modules/three/LICENSE', 'vendor/three/LICENSE');
console.log('vendored three@0.170.0 -> vendor/three/');
