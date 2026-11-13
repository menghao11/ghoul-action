// 程序化低多边形人形骨架 + 姿势混合（无骨骼蒙皮，层级 Group 关节）
import * as THREE from 'three';
import { toon, addOutline } from './toon.js';

const JOINTS = ['pelvis', 'spine', 'chest', 'head', 'shL', 'elL', 'shR', 'elR', 'hipL', 'knL', 'hipR', 'knR'];
export function makeRig(o = {}) {
  const c = Object.assign({ coat: 0x16121a, skin: 0xe8d8d0, hair: 0xe8e8ee, pants: 0x0d0b10, accent: 0xff2040, scale: 1, outline: true, mask: true, coatTail: true }, o);
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body); body.scale.setScalar(c.scale);
  const J = {}; const meshes = [];
  const mk = (geo, mat, parent, pos, name) => {
    const m = new THREE.Mesh(geo, mat); if (pos) m.position.set(...pos); parent.add(m); meshes.push(m);
    if (c.outline) addOutline(m, 1.07); m.name = name || ''; return m;
  };
  const joint = (name, parent, pos) => { const g = new THREE.Group(); g.position.set(...pos); parent.add(g); J[name] = g; return g; };
  const tg = c.tag ? { name: c.tag } : {}; const coat = toon(c.coat, tg), skin = toon(c.skin), hair = toon(c.hair), pants = toon(c.pants);
  const accent = new THREE.MeshBasicMaterial({ color: c.accent });
  J.pelvis = joint('pelvis', body, [0, 0.95, 0]);
  mk(new THREE.BoxGeometry(0.36, 0.2, 0.22), pants, J.pelvis, [0, 0, 0]);
  joint('spine', J.pelvis, [0, 0.1, 0]);
  joint('chest', J.spine, [0, 0.22, 0]);
  const torso = new THREE.CylinderGeometry(0.22, 0.17, 0.5, 6); torso.translate(0, 0.1, 0);
  mk(torso, coat, J.chest, [0, 0, 0], 'torso');
  if (c.coatTail) { const tail = new THREE.CylinderGeometry(0.2, 0.3, 0.55, 6, 1, true); tail.translate(0, -0.42, 0); const tm = mk(tail, toon(c.coat, { side: THREE.DoubleSide, ...tg }), J.spine, [0, 0, -0.01], 'coattail'); }
  joint('head', J.chest, [0, 0.42, 0]);
  mk(new THREE.IcosahedronGeometry(0.17, 1), skin, J.head, [0, 0.12, 0], 'head');
  const hairG = new THREE.ConeGeometry(0.2, 0.26, 7); hairG.rotateX(-0.5); hairG.translate(0, 0.2, -0.05);
  mk(hairG, hair, J.head, [0, 0.05, 0], 'hair');
  if (c.mask) {
    const mask = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.09, 0.05), toon(0x111014)); mask.position.set(0, 0.06, 0.15); J.head.add(mask); meshes.push(mask);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 4), accent); eye.position.set(-0.06, 0.15, 0.155); J.head.add(eye);
  }
  const limb = (r0, r1, len) => { const g = new THREE.CylinderGeometry(r0, r1, len, 6); g.translate(0, -len / 2, 0); return g; };
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R';
    const sh = joint('sh' + L, J.chest, [0.27 * s, 0.3, 0]);
    mk(limb(0.075, 0.06, 0.34), coat, sh, null, 'arm');
    const el = joint('el' + L, sh, [0, -0.34, 0]);
    mk(limb(0.06, 0.05, 0.3), coat, el, null, 'fore');
    mk(new THREE.BoxGeometry(0.08, 0.1, 0.08), skin, el, [0, -0.34, 0], 'hand');
    const hp = joint('hip' + L, J.pelvis, [0.11 * s, -0.06, 0]);
    mk(limb(0.09, 0.07, 0.44), pants, hp, null, 'thigh');
    const kn = joint('kn' + L, hp, [0, -0.44, 0]);
    mk(limb(0.07, 0.055, 0.42), pants, kn, null, 'shin');
    mk(new THREE.BoxGeometry(0.1, 0.07, 0.22), toon(0x1a1a1a), kn, [0, -0.44, 0.05], 'foot');
  }
  // 背部挂点（血绫根部）
  const back = new THREE.Group(); back.position.set(0, -0.02, -0.14); J.spine.add(back);
  const upperBack = new THREE.Group(); upperBack.position.set(0, 0.3, -0.16); J.chest.add(upperBack);
  const rig = { root, body, J, meshes, back, upperBack, cfg: c, pose: {}, height: 1.75 * c.scale };
  for (const j of JOINTS) rig.pose[j] = [0, 0, 0];
  rig.pelvisY = 0.95; rig.lean = 0;
  return rig;
}
// 姿势：{joint:[x,y,z]} 弧度；平滑混合到目标
export function applyPose(rig, target, k) {
  for (const j of JOINTS) {
    const cur = rig.pose[j], t = target[j] || ZERO;
    cur[0] += (t[0] - cur[0]) * k; cur[1] += (t[1] - cur[1]) * k; cur[2] += (t[2] - cur[2]) * k;
    rig.J[j].rotation.set(cur[0], cur[1], cur[2]);
  }
  const py = target.py !== undefined ? target.py : 0.95;
  rig.pelvisY += (py - rig.pelvisY) * k; rig.J.pelvis.position.y = rig.pelvisY;
}
const ZERO = [0, 0, 0];
const S = Math.sin, C = Math.cos;
// 程序化姿势库（返回新对象，开销很小）
export const Poses = {
  idle(t, combat = 1) { const b = S(t * 2.2) * 0.03; return { pelvis: [0, 0.25 * combat, 0], spine: [0.08 + b, 0, 0], chest: [0.05, -0.15 * combat, 0], head: [-0.08, 0.1 * combat, 0], shL: [0.25, 0, 0.35], elL: [-0.9, 0, 0], shR: [-0.15, 0, -0.3], elR: [-1.1, 0, 0], hipL: [-0.25, 0, 0.08], knL: [0.35, 0, 0], hipR: [0.2, 0, -0.08], knR: [0.3, 0, 0], py: 0.9 + b * 0.5 }; },
  run(ph, sp = 1) {
    const s = S(ph), c = C(ph), a = Math.min(1, sp);
    return { pelvis: [0, s * 0.12 * a, 0], spine: [0.35 * a, 0, 0], chest: [0.05, -s * 0.25 * a, 0], head: [-0.3 * a, s * 0.15, 0],
      shL: [-s * 1.0 * a + 0.2, 0, 0.25], elL: [-1.2, 0, 0], shR: [s * 1.0 * a + 0.2, 0, -0.25], elR: [-1.2, 0, 0],
      hipL: [s * 1.0 * a - 0.15, 0, 0], knL: [Math.max(0, -c) * 1.6 * a + 0.2, 0, 0], hipR: [-s * 1.0 * a - 0.15, 0, 0], knR: [Math.max(0, c) * 1.6 * a + 0.2, 0, 0],
      py: 0.92 - Math.abs(c) * 0.06 * a };
  },
  air(vy) { const u = Math.max(-1, Math.min(1, vy / 8)); return { spine: [0.2 - u * 0.2, 0, 0], chest: [0, 0, 0], head: [-0.15, 0, 0], shL: [-0.6, 0, 0.7], elL: [-1.0, 0, 0], shR: [-0.6, 0, -0.7], elR: [-1.0, 0, 0], hipL: [-1.1 + u * 0.5, 0, 0.1], knL: [1.5 - u * 0.4, 0, 0], hipR: [-0.4, 0, -0.1], knR: [0.9, 0, 0], py: 0.95 }; },
  dodge(p) { return { spine: [0.9, 0, 0], chest: [0.2, 0, 0], head: [-0.6, 0, 0], shL: [0.9, 0, 0.5], elL: [-0.6, 0, 0], shR: [0.9, 0, -0.5], elR: [-0.6, 0, 0], hipL: [-0.9, 0, 0], knL: [1.4, 0, 0], hipR: [0.4, 0, 0], knR: [0.6, 0, 0], py: 0.62 }; },
  // 攻击姿势：side=1 右挥 / -1 左挥 ; p=0 蓄 1 出手
  slash(p, side = 1) { const w = 1 - p; return { pelvis: [0, side * (0.6 * w - 0.7 * p), 0], spine: [0.3, 0, 0], chest: [0.1, side * (0.7 * w - 0.9 * p), 0], head: [-0.2, -side * 0.2, 0],
    shR: side > 0 ? [-1.4 * w - 0.2, 0, -1.4 * p - 0.2] : [-0.3, 0, -0.4], elR: [-0.4 * w - 0.1, 0, 0], shL: side < 0 ? [-1.4 * w - 0.2, 0, 1.4 * p + 0.2] : [0.3, 0, 0.4], elL: [-0.4 * w - 0.1, 0, 0],
    hipL: [-0.7, 0, 0.1], knL: [0.6, 0, 0], hipR: [0.4, 0, -0.1], knR: [0.3, 0, 0], py: 0.8 }; },
  thrust(p) { return { pelvis: [0, -0.4 * p, 0], spine: [0.4 + 0.2 * p, 0, 0], chest: [0, -0.3 * p, 0], head: [-0.4, 0.3 * p, 0], shR: [-1.5 * p, 0, -0.1], elR: [-0.2 * (1 - p), 0, 0], shL: [0.5, 0, 0.5], elL: [-1, 0, 0], hipL: [-1.0 * p, 0, 0], knL: [0.9 * p, 0, 0], hipR: [0.6 * p, 0, 0], knR: [0.2, 0, 0], py: 0.92 - 0.2 * p }; },
  uppercut(p) { return { spine: [0.5 - 0.9 * p, 0, 0], chest: [0, 0, 0], head: [-0.2 * p, 0, 0], shR: [-0.2 - 2.6 * p, 0, -0.2], elR: [-1.2 * (1 - p), 0, 0], shL: [0.4, 0, 0.6], elL: [-0.8, 0, 0], hipL: [-0.4, 0, 0], knL: [0.8 - 0.6 * p, 0, 0], hipR: [0.2, 0, 0], knR: [0.4, 0, 0], py: 0.75 + 0.2 * p }; },
  slam(p) { return { spine: [-0.4 + 1.3 * p, 0, 0], chest: [0.2 * p, 0, 0], head: [-0.3, 0, 0], shR: [-2.8 + 2.2 * p, 0, -0.2], elR: [-0.3, 0, 0], shL: [-2.8 + 2.2 * p, 0, 0.2], elL: [-0.3, 0, 0], hipL: [-0.9, 0, 0.1], knL: [1.0, 0, 0], hipR: [0.5, 0, -0.1], knR: [0.7, 0, 0], py: 0.95 - 0.3 * p }; },
  spin(p) { return { pelvis: [0, 0, 0], spine: [0.25, 0, 0], chest: [0, 0, 0], head: [-0.2, 0, 0], shL: [0, 0, 1.4], elL: [-0.2, 0, 0], shR: [0, 0, -1.4], elR: [-0.2, 0, 0], hipL: [-0.5, 0, 0.3], knL: [0.6, 0, 0], hipR: [0.3, 0, -0.3], knR: [0.4, 0, 0], py: 0.82 }; },
  guard() { return { spine: [0.3, 0, 0], chest: [0.1, -0.3, 0], head: [-0.15, 0.2, 0], shL: [-1.3, 0.5, 0.3], elL: [-1.6, 0, 0], shR: [-1.2, -0.5, -0.3], elR: [-1.7, 0, 0], hipL: [-0.6, 0, 0.2], knL: [0.7, 0, 0], hipR: [0.4, 0, -0.2], knR: [0.5, 0, 0], py: 0.78 }; },
  cast(p) { return { spine: [0.1, 0, 0], chest: [-0.2 * p, 0, 0], head: [-0.2, 0, 0], shL: [-1.4, 0, 0.6 * p], elL: [-0.2, 0, 0], shR: [-1.4, 0, -0.6 * p], elR: [-0.2, 0, 0], hipL: [-0.3, 0, 0.1], knL: [0.4, 0, 0], hipR: [0.2, 0, -0.1], knR: [0.3, 0, 0], py: 0.9 }; },
  hurt(p) { return { spine: [-0.5, 0, 0.1], chest: [-0.3, 0, 0], head: [0.4, 0, 0], shL: [0.6, 0, 0.9], elL: [-0.5, 0, 0], shR: [0.6, 0, -0.9], elR: [-0.5, 0, 0], hipL: [0.2, 0, 0], knL: [0.3, 0, 0], hipR: [-0.3, 0, 0], knR: [0.5, 0, 0], py: 0.88 }; },
  launched(p) { return { spine: [-0.9, 0, 0], chest: [-0.4, 0, 0], head: [0.5, 0, 0], shL: [-0.5, 0, 1.3], elL: [-0.3, 0, 0], shR: [-0.5, 0, -1.3], elR: [-0.3, 0, 0], hipL: [-0.6, 0, 0.1], knL: [0.8, 0, 0], hipR: [0.3, 0, -0.1], knR: [0.4, 0, 0], py: 0.95 }; },
  down() { return { pelvis: [-1.45, 0, 0], spine: [-0.1, 0, 0], head: [0.3, 0.5, 0], shL: [-0.3, 0, 1.2], elL: [-0.2, 0, 0], shR: [0.2, 0, -1.0], elR: [-0.4, 0, 0], hipL: [-0.1, 0, 0.1], knL: [0.2, 0, 0], hipR: [0.2, 0, -0.1], knR: [0.5, 0, 0], py: 0.18 }; },
  windup(p) { return { spine: [0.1, 0, 0], chest: [-0.15 * p, 0.7 * p, 0], head: [-0.1, -0.5 * p, 0], shR: [-2.4 * p, 0, -0.5], elR: [-0.6, 0, 0], shL: [0.3, 0, 0.5], elL: [-0.8, 0, 0], hipL: [-0.6, 0, 0.1], knL: [0.6, 0, 0], hipR: [0.4, 0, -0.1], knR: [0.4, 0, 0], py: 0.84 }; },
  ult(p) { return { spine: [-0.5 * p, 0, 0], chest: [-0.3 * p, 0, 0], head: [-0.5 * p, 0, 0], shL: [-0.4, 0, 1.6 * p], elL: [-0.4, 0, 0], shR: [-0.4, 0, -1.6 * p], elR: [-0.4, 0, 0], hipL: [-0.2, 0, 0.3], knL: [0.2, 0, 0], hipR: [0.2, 0, -0.3], knR: [0.2, 0, 0], py: 0.92 }; },
};
