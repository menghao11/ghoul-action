// 赤骸夜行 3D 角色加载助手（Three.js r170）
// 用法：
//   import { loadCharacter } from './art/lib/ghoul3d_loader.js';
//   const ch = await loadCharacter('./art/models/lingye.glb', { toon: true, outline: 0.012 });
//   scene.add(ch.root); ch.play('idle'); 每帧 ch.update(dt);
//   ch.sockets.tendril_root  → 血绫根节点（Object3D，随 Spine 骨骼运动）
//   ch.bones.mixamorigRightHand → 骨骼（注意：GLTFLoader 会把 "mixamorig:Hips" 净化成 "mixamorigHips"）
import * as THREE from 'three';
import { GLTFLoader } from './loaders/GLTFLoader.js';

let _grad;
function gradientMap() {
  if (_grad) return _grad;
  const d = new Uint8Array([40, 40, 40, 255, 120, 120, 120, 255, 200, 200, 200, 255, 255, 255, 255, 255]);
  _grad = new THREE.DataTexture(d, 4, 1, THREE.RGBAFormat); _grad.minFilter = _grad.magFilter = THREE.NearestFilter; _grad.needsUpdate = true; return _grad;
}
// 蒙皮网格可用的描边（反向外壳，顶点沿蒙皮后法线外推）
export function makeOutline(skinned, thickness = 0.012, color = 0x050002) {
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uOutline = { value: thickness };
    sh.vertexShader = 'uniform float uOutline;\n' + sh.vertexShader.replace('#include <skinning_vertex>', '#include <skinning_vertex>\n transformed += normalize(objectNormal) * uOutline;');
  };
  const o = new THREE.SkinnedMesh(skinned.geometry, mat);
  o.bind(skinned.skeleton, skinned.bindMatrix); o.userData.outline = true; o.frustumCulled = false;
  o.position.copy(skinned.position); o.quaternion.copy(skinned.quaternion); o.scale.copy(skinned.scale);
  skinned.parent.add(o); return o;
}
export async function loadCharacter(url, opt = {}) {
  const o = Object.assign({ toon: true, outline: 0.012, emissiveIntensity: 1.6, castShadow: false }, opt);
  const gltf = await new GLTFLoader().loadAsync(url);
  const root = gltf.scene; const bones = {}, sockets = {}, meshes = [];
  root.traverse((n) => {
    if (n.isBone) bones[n.name] = n;
    else if (!n.isMesh && n.type === 'Object3D' && n.name && n.children.length === 0) sockets[n.name] = n; // 挂点空节点
    if (n.isMesh) meshes.push(n);
  });
  for (const m of meshes) {
    if (o.toon && m.material) {
      const src = m.material;
      m.material = new THREE.MeshToonMaterial({ map: src.map, emissiveMap: src.emissiveMap, emissive: src.emissiveMap ? 0xffffff : 0x000000,
        emissiveIntensity: o.emissiveIntensity, gradientMap: gradientMap(), side: src.side, transparent: src.transparent, alphaTest: src.alphaTest });
      if (m.material.map) m.material.map.colorSpace = THREE.SRGBColorSpace;
    }
    m.frustumCulled = false; m.castShadow = o.castShadow;
  }
  if (o.outline > 0) for (const m of meshes.slice()) if (m.isSkinnedMesh) makeOutline(m, o.outline);
  const mixer = new THREE.AnimationMixer(root); const actions = {};
  for (const c of gltf.animations) actions[c.name] = mixer.clipAction(c);
  let cur = null;
  function play(name, { fade = 0.12, loop = null, timeScale = 1 } = {}) {
    const a = actions[name]; if (!a) return null;
    const once = loop === false || (loop === null && !/^(idle|run|guard)$/.test(name));
    a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once; a.timeScale = timeScale;
    if (cur && cur !== a) a.crossFadeFrom(cur, fade, false); a.play(); cur = a; return a;
  }
  return { root, gltf, bones, sockets, meshes, mixer, actions, clips: gltf.animations, play, update: (dt) => mixer.update(dt) };
}
