// 赤骸夜行 3D 角色加载助手（Three.js r170）
// 用法：
//   import { loadCharacter } from './art/lib/toon3d_loader.js';
//   const ch = await loadCharacter('./art/models/lingye.glb', { toon: true, outline: 0.012 });
//   scene.add(ch.root); ch.play('idle'); 每帧 ch.update(dt);
//   ch.sockets.tendril_root  → 血绫根节点（Object3D，随 Spine 骨骼运动）
//   ch.bones.mixamorigRightHand → 骨骼（注意：GLTFLoader 会把 "mixamorig:Hips" 净化成 "mixamorigHips"）
import * as THREE from 'three';
import { GLTFLoader } from './loaders/GLTFLoader.js';

let _grad;
function gradientMap() {
  if (_grad) return _grad;
  // 5 级色阶：暗部不再压到接近纯黑（夜景里角色要能读出体积），亮部留一档高光
  const d = new Uint8Array([78, 78, 78, 255, 122, 122, 122, 255, 176, 176, 176, 255, 226, 226, 226, 255, 255, 255, 255, 255]);
  _grad = new THREE.DataTexture(d, 5, 1, THREE.RGBAFormat); _grad.minFilter = _grad.magFilter = THREE.NearestFilter; _grad.needsUpdate = true; return _grad;
}
// 角色卡通材质增强（都是纯着色，不加灯、不加 draw call）：
//   1) 暗部抬升：深色布料贴图接近纯黑，夜街上整个人会"糊"进背景 → 给固有色加一点带冷调的底色
//   2) 边缘光（菲涅尔 rim）：沿轮廓一圈冷色亮边，把角色从暗背景里勾出来；朝上的面更亮（像被街灯/月光扫到）
//   3) 高光带：卡通式硬边高光，主要让头发、肩膀有一条亮带
export function enhanceToon(mat, o = {}) {
  const u = {
    uLift: { value: new THREE.Color(o.lift ?? 0x2c283a) },
    uRimColor: { value: new THREE.Color(o.rim ?? 0x8fa8ff) }, uRimStrength: { value: o.rimStrength ?? 0.55 }, uRimPower: { value: o.rimPower ?? 2.6 },
    uSpecStrength: { value: o.spec ?? 0.1 },
  };
  mat.userData.toonUniforms = u;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', 'uniform vec3 uLift; uniform vec3 uRimColor; uniform float uRimStrength; uniform float uRimPower; uniform float uSpecStrength;\nvoid main() {')
      .replace('#include <color_fragment>', '#include <color_fragment>\n\tdiffuseColor.rgb = diffuseColor.rgb * (1.0 - uLift) + uLift;')
      .replace('#include <opaque_fragment>', `{
        vec3 vdir = normalize( vViewPosition );
        float ndv = saturate( dot( normal, vdir ) );
        float rim = smoothstep( 0.0, 1.0, pow( 1.0 - ndv, uRimPower ) );
        float up = 0.55 + 0.45 * saturate( dot( normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz ), normal ) + 0.35 );
        outgoingLight += uRimColor * ( step( 0.42, rim ) * 0.75 + rim * 0.25 ) * uRimStrength * up;
        vec3 hdir = normalize( vdir + normalize( vec3( 0.25, 0.9, 0.35 ) ) );
        outgoingLight += diffuseColor.rgb * step( 0.965, dot( normal, hdir ) ) * uSpecStrength * 4.0;
      }
      #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'toonplus';
  return mat;
}
// 蒙皮网格可用的描边（反向外壳，顶点沿蒙皮后法线外推）
export function makeOutline(skinned, thickness = 0.012, color = 0x07040c) {
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
      if (o.enhance !== false) enhanceToon(m.material, o.look || {});
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
