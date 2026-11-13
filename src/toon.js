import * as THREE from 'three';
let grad;
export function gradientMap() {
  if (grad) return grad;
  const data = new Uint8Array([40, 40, 40, 255, 120, 120, 120, 255, 200, 200, 200, 255, 255, 255, 255, 255]);
  grad = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.needsUpdate = true;
  return grad;
}
const cache = new Map();
export function toon(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (cache.has(key)) return cache.get(key);
  const m = new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(), ...opts });
  cache.set(key, m); return m;
}
export const outlineMat = new THREE.MeshBasicMaterial({ color: 0x050002, side: THREE.BackSide });
export function addOutline(mesh, s = 1.06) {
  const o = new THREE.Mesh(mesh.geometry, outlineMat);
  o.scale.setScalar(s); o.userData.outline = true; o.matrixAutoUpdate = true;
  mesh.add(o); return o;
}
