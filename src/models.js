// 画图王的 3D 角色接入：预加载 GLB（卡通材质 + 蒙皮描边，用 art/lib/ghoul3d_loader.js），
// 按实例克隆（共享几何/贴图），给 Player/Enemy 提供和程序化骨架相同的接口（root/body/back/upperBack/meshes）。
// 动画 clip 原地播放，位移仍由游戏代码驱动；按招式出手时间缩放 clip，状态间交叉淡化。
// 资源缺失或 ?models=0 时返回 null → 游戏自动退回程序化占位模型。
import * as THREE from 'three';
import { loadCharacter } from '../art/lib/ghoul3d_loader.js';
import { GLTFLoader } from '../art/lib/loaders/GLTFLoader.js';
import { clone as skClone } from '../art/lib/utils/SkeletonUtils.js';

const BASE = 'art/models/';
export const Models = { ok: false, t: {}, props: {}, stats: null, error: null };

export async function preloadModels({ mobile = false, quality = 'mid' } = {}) {
  const qs = new URLSearchParams(location.search);
  if (qs.get('models') === '0') { Models.error = 'disabled'; return Models; }
  const outline = quality === 'low' ? 0 : 0.012;
  const hero = mobile || quality !== 'high' ? 'lingye_1k.glb' : 'lingye.glb';
  const t0 = performance.now();
  try {
    const [h, boss, melee, ranged, brute, cleaver, blade] = await Promise.all([
      loadCharacter(BASE + hero, { outline, emissiveIntensity: 1.4 }),
      loadCharacter(BASE + 'tieheng.glb', { outline: outline ? 0.016 : 0 }),
      loadCharacter(BASE + 'ghoul_melee.glb', { outline, emissiveIntensity: 1.8 }),
      loadCharacter(BASE + 'ghoul_ranged.glb', { outline, emissiveIntensity: 1.8 }),
      loadCharacter(BASE + 'ghoul_brute.glb', { outline: outline ? 0.014 : 0, emissiveIntensity: 1.8 }),
      new GLTFLoader().loadAsync(BASE + 'quinque_crowcleaver.glb'),
      new GLTFLoader().loadAsync(BASE + 'blade_ghoul.glb'),
    ]);
    Object.assign(Models.t, { hero: h, boss, grunt: melee, shooter: ranged, brute });
    Models.props.cleaver = toonProps(cleaver.scene); Models.props.blade = toonProps(blade.scene);
    if (mobile) downscaleTextures(Object.values(Models.t).map((x) => x.root), 1024); // 手机：Boss 等 2048² 贴图降到 1024²，省显存
    Models.heroFile = hero; Models.ok = true; Models.loadMs = Math.round(performance.now() - t0);
  } catch (e) { Models.error = String(e && e.message || e); console.warn('3D 模型加载失败，使用占位模型：', Models.error); }
  return Models;
}
function downscaleTextures(roots, max) {
  const done = new Set();
  for (const r of roots) r.traverse((n) => { if (!n.material) return; for (const k of ['map', 'emissiveMap']) { const t = n.material[k]; const img = t && t.image; if (!img || done.has(t) || !(img.width > max)) continue; done.add(t);
    const cv = document.createElement('canvas'); cv.width = cv.height = max; cv.getContext('2d').drawImage(img, 0, 0, max, max); t.image = cv; t.needsUpdate = true; Models.downscaled = (Models.downscaled || 0) + 1; } });
}
function toonProps(scene) {
  scene.traverse((n) => { if (n.isMesh) { const s = n.material; n.material = new THREE.MeshToonMaterial({ map: s.map, emissiveMap: s.emissiveMap, emissive: s.emissiveMap ? 0xffffff : 0, emissiveIntensity: 1.6 }); if (s.map) s.map.colorSpace = THREE.SRGBColorSpace; n.frustumCulled = false; } });
  return scene;
}
const ARMOR_BONES = { shL: 'LeftArm', elL: 'LeftForeArm', shR: 'RightArm', elR: 'RightForeArm', head: 'Head', chest: 'Spine2', spine: 'Spine1', pelvis: 'Hips', hipL: 'LeftUpLeg', knL: 'LeftLeg', hipR: 'RightUpLeg', knR: 'RightLeg' };

// 生成一个"模型骨架"实例，接口与 rig.js 的 makeRig 兼容
export function makeModelRig(kind, { scale = 1, flashable = false } = {}) {
  const tpl = Models.t[kind]; if (!tpl) return null;
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const model = skClone(tpl.root); model.scale.setScalar(scale); body.add(model);
  const bones = {}, sockets = {}, skinned = [];
  model.traverse((n) => {
    if (n.isBone) bones[n.name] = n;
    else if (!n.isMesh && n.name && /socket|root|_tip|origin/.test(n.name)) sockets[n.name] = n;
    if (n.isSkinnedMesh) { n.frustumCulled = false; if (!n.userData.outline) skinned.push(n); }
  });
  let flashMat = null;
  if (flashable) for (const m of skinned) { m.material = m.material.clone(); flashMat = m.material; flashMat.userData.baseEmissive = flashMat.emissive.clone(); }
  const mixer = new THREE.AnimationMixer(model); const actions = {};
  for (const c of tpl.clips) actions[c.name] = mixer.clipAction(c);
  const J = {}; for (const [k, b] of Object.entries(ARMOR_BONES)) J[k] = bones['mixamorig' + b] || null;
  const back = sockets.tendril_root || bones.mixamorigSpine || model;
  const upperBack = sockets.tendril_root_upper || bones.mixamorigSpine2 || back;
  const rig = {
    isModel: true, kind, root, body, model, mixer, actions, bones, sockets, skinned, meshes: skinned, J, back, upperBack, mask: null, flashMat,
    clipName: null, clipKey: null, clipDur: (n) => (actions[n] ? actions[n].getClip().duration : 0),
    // 切换 clip（同 key 不重启）；loop=false 时停在最后一帧
    play(name, { key = name, fade = 0.12, loop = null, timeScale = 1, at = 0 } = {}) {
      const a = actions[name]; if (!a) return false;
      if (rig.clipKey === key) { a.timeScale = timeScale; return true; }
      const once = loop === false || (loop === null && !/^(idle|run|guard|down|charge|sway)$/.test(name));
      const prev = rig.clipName ? actions[rig.clipName] : null;
      a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once; a.timeScale = timeScale; a.time = at; a.enabled = true; a.setEffectiveWeight(1);
      if (prev && prev !== a) a.crossFadeFrom(prev, fade, false); a.play();
      rig.clipName = name; rig.clipKey = key; return true;
    },
    update(dt) { mixer.update(dt); },
  };
  return rig;
}
// 统计：draw call / 三角面 / 纹理内存估算（给手机预算参考）
export function sceneBudget(renderer, renderFn) {
  const i = renderer.info; if (renderFn) { const ar = i.autoReset; i.autoReset = false; i.reset(); renderFn(); var calls = i.render.calls, tris = i.render.triangles; i.autoReset = ar; } let texBytes = 0; const seen = new Set();
  for (const t of Object.values(Models.t)) t.root.traverse((n) => { if (n.material) for (const k of ['map', 'emissiveMap']) { const tx = n.material[k]; if (tx && tx.image && !seen.has(tx)) { seen.add(tx); texBytes += (tx.image.width || 0) * (tx.image.height || 0) * 4 * 1.33; } } });
  return { calls: calls ?? i.render.calls, triangles: tris ?? i.render.triangles, downscaled: Models.downscaled || 0, geometries: i.memory.geometries, textures: i.memory.textures, modelTexMB: +(texBytes / 1048576).toFixed(1), heroFile: Models.heroFile };
}
