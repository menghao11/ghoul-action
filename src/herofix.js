// 主角「凌夜」的运行时修正（不改 GLB 文件，加载后一次性处理，之后零开销）：
//   1) reshapeHero：原模型四肢是很细的圆管、躯干是薄板、胯部很小，远看像火柴人。
//      这里沿各骨骼做"径向放大"（按蒙皮权重混合，接缝不会裂开），把大腿/小腿/手臂加粗、躯干加厚、胯部加宽。
//   2) buildHeroClips：重做 idle / run / jog / jump 四个动作。
//      原 run 的步幅只有 ±0.33 m，而移动速度是 7.2 m/s，着地脚每帧都在地上滑 8 cm（滑步）。
//      新的跑步循环用两骨 IK 生成：着地期间脚踝相对身体以"恒定速度"向后走，
//      循环时长按「着地位移 = 速度 × 着地时间」反推，所以按速度播放时脚是钉在地面上的。
// 姿势用"方向"描述（大腿朝哪、前臂朝哪），由 aim() 换算成骨骼局部旋转，不依赖骨骼局部轴向。
import * as THREE from 'three';

const TAU = Math.PI * 2;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);
const qAxis = (ax, ang) => new THREE.Quaternion().setFromAxisAngle(ax, ang);
// 身体坐标：+Z 前、+Y 上、+X 左。pitch>0 前倾，yaw>0 向左转，roll>0 向右歪
const qBody = (pitch = 0, yaw = 0, roll = 0) => qAxis(Y, yaw).multiply(qAxis(X, pitch)).multiply(qAxis(Z, roll));

// ---------- 1) 体型 ----------
// 每根骨骼的截面放大系数：数字 = 绕骨骼轴各向同性；{x,z} = 躯干（竖直骨骼）左右/前后分别放大
const SHAPE = {
  Hips: { x: 1.24, z: 1.5 }, Spine: { x: 1.1, z: 1.4 }, Spine1: { x: 1.13, z: 1.44 }, Spine2: { x: 1.17, z: 1.46 }, Neck: 1.14,
  LeftShoulder: 1.18, RightShoulder: 1.18, LeftArm: 1.34, RightArm: 1.34, LeftForeArm: 1.3, RightForeArm: 1.3, LeftHand: 1.14, RightHand: 1.14,
  LeftUpLeg: 1.32, RightUpLeg: 1.32, LeftLeg: 1.26, RightLeg: 1.26,
};
export function reshapeHero(tpl) {
  const mesh = tpl.meshes.find((m) => m.isSkinnedMesh && !m.userData.outline); if (!mesh || mesh.geometry.userData.reshaped) return false;
  tpl.root.updateMatrixWorld(true);
  const geo = mesh.geometry, pos = geo.attributes.position, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, bones = mesh.skeleton.bones;
  const inv = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
  const info = bones.map((b) => {
    const k = SHAPE[b.name.replace('mixamorig', '')]; if (!k) return null;
    const a = b.getWorldPosition(V()).applyMatrix4(inv); const ch = b.children.find((c) => c.isBone);
    const d = ch ? ch.getWorldPosition(V()).applyMatrix4(inv).sub(a).normalize() : V(0, 1, 0);
    return { a, d, k };
  });
  const p = V(), o = V(), acc = V();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i); acc.set(0, 0, 0);
    for (let c = 0; c < 4; c++) {
      const w = sw.getComponent(i, c); if (w <= 0) continue; const I = info[si.getComponent(i, c)]; if (!I) continue;
      o.subVectors(p, I.a); o.addScaledVector(I.d, -o.dot(I.d)); // 垂直于骨骼轴的偏移
      if (typeof I.k === 'number') acc.addScaledVector(o, w * (I.k - 1)); else { acc.x += o.x * w * (I.k.x - 1); acc.z += o.z * w * (I.k.z - 1); }
    }
    pos.setXYZ(i, p.x + acc.x, p.y + acc.y, p.z + acc.z);
  }
  pos.needsUpdate = true; geo.computeBoundingBox(); geo.computeBoundingSphere(); geo.userData.reshaped = true; return true;
}

// ---------- 2) 动作 ----------
class Poser {
  constructor(tpl) {
    this.root = tpl.root; this.bones = []; this.root.traverse((n) => { if (n.isBone) this.bones.push(n); });
    this.b = (n) => tpl.bones['mixamorig' + n];
    this.rest = this.bones.map((b) => ({ q: b.quaternion.clone(), p: b.position.clone() }));
    this.reset();
    const wp = (n) => this.b(n).getWorldPosition(V());
    this.L1 = wp('LeftUpLeg').distanceTo(wp('LeftLeg')); this.L2 = wp('LeftLeg').distanceTo(wp('LeftFoot'));
    this.ankleH = wp('LeftFoot').y; this.hipH = wp('Hips').y;
    this.footRest = wp('LeftToeBase').sub(wp('LeftFoot')).normalize();
    this.chestRest = this.b('Spine2').getWorldQuaternion(new THREE.Quaternion());
  }
  reset() { this.bones.forEach((b, i) => { b.quaternion.copy(this.rest[i].q); b.position.copy(this.rest[i].p); }); this.root.updateMatrixWorld(true); }
  // 给骨骼叠加一个"世界空间"的旋转
  rotW(bone, dq) {
    const w = bone.getWorldQuaternion(new THREE.Quaternion()), pw = bone.parent.getWorldQuaternion(new THREE.Quaternion());
    bone.quaternion.copy(pw.invert().multiply(dq.clone().multiply(w))); bone.updateWorldMatrix(false, true);
  }
  // 让 bone→child 这一段指向 dir（最小旋转，保留原有的轴向扭转）
  aim(bone, child, dir) {
    const cur = child.getWorldPosition(V()).sub(bone.getWorldPosition(V())).normalize();
    this.rotW(bone, new THREE.Quaternion().setFromUnitVectors(cur, dir.clone().normalize()));
  }
  hips(pos, q) { const h = this.b('Hips'); h.position.copy(pos); h.updateWorldMatrix(false, true); this.rotW(h, q); }
  // 两骨 IK：脚踝放到 ankle（模型空间），膝盖朝 hint 方向弯；pitch = 脚尖下压角
  leg(S, ankle, pitch = 0, toeOut = 0, hint = null) {
    const side = S === 'Left' ? 1 : -1, up = this.b(S + 'UpLeg'), lo = this.b(S + 'Leg'), ft = this.b(S + 'Foot'), toe = this.b(S + 'ToeBase');
    const h = up.getWorldPosition(V()); const n = ankle.clone().sub(h); const max = (this.L1 + this.L2) * 0.998; let d = n.length(); n.normalize(); if (d > max) d = max;
    const cosA = Math.min(1, Math.max(-1, (this.L1 * this.L1 + d * d - this.L2 * this.L2) / (2 * this.L1 * d))), sinA = Math.sqrt(1 - cosA * cosA);
    const bend = (hint || V(side * 0.1, 0, 1)).clone(); bend.addScaledVector(n, -bend.dot(n)).normalize();
    const knee = h.clone().addScaledVector(n, this.L1 * cosA).addScaledVector(bend, this.L1 * sinA);
    const a = h.clone().addScaledVector(n, d);
    this.aim(up, lo, knee.clone().sub(h)); this.aim(lo, ft, a.clone().sub(knee));
    this.aim(ft, toe, this.footRest.clone().applyAxisAngle(X, pitch).applyAxisAngle(Y, side * toeOut));
  }
  arm(S, upper, fore) { this.aim(this.b(S + 'Arm'), this.b(S + 'ForeArm'), upper); this.aim(this.b(S + 'ForeArm'), this.b(S + 'Hand'), fore); }
  // 胸腔相对静止姿势的世界旋转（手臂方向跟着躯干转）
  chestQ() { return this.b('Spine2').getWorldQuaternion(new THREE.Quaternion()).multiply(this.chestRest.clone().invert()); }
  sample() { return { hips: this.b('Hips').position.clone(), q: this.bones.map((b) => b.quaternion.clone()) }; }
  clip(name, times, frames) {
    const tracks = [];
    this.bones.forEach((b, i) => {
      const v = new Float32Array(times.length * 4); let prev = null;
      frames.forEach((f, k) => { const q = f.q[i]; if (prev && prev.dot(q) < 0) q.set(-q.x, -q.y, -q.z, -q.w); prev = q; v.set([q.x, q.y, q.z, q.w], k * 4); });
      tracks.push(new THREE.QuaternionKeyframeTrack(b.name + '.quaternion', times, v));
    });
    const hv = new Float32Array(times.length * 3); frames.forEach((f, k) => hv.set([f.hips.x, f.hips.y, f.hips.z], k * 3));
    tracks.push(new THREE.VectorKeyframeTrack(this.b('Hips').name + '.position', times, hv));
    return new THREE.AnimationClip(name, times[times.length - 1], tracks);
  }
}

// 跑步循环参数。speed = (front + back) / (stance * cycle)：着地脚相对身体后移的速度，等于角色移动速度时不滑步
export const GAITS = {
  // 冲刺：前倾、大步幅、有明显腾空
  run: { cycle: 0.46, stance: 0.25, front: 0.29, back: 0.538, hipY: 0.925, bob: 0.032, lean: 0.27, spine: 0.045, pelvisYaw: 0.16, chestYaw: 0.22, lift: 0.3, heel: 0.15, toeOff: 0.95, footX: 0.07, zc: 0.02,
    armSwing: 0.9, armBias: 0.05, armOut: 0.2, elbow: 1.5, elbowVar: 0.55, sway: 0.012 },
  // 小跑：摇杆轻推 / 起步收步时用
  jog: { cycle: 0.52, stance: 0.34, front: 0.24, back: 0.33, hipY: 0.925, bob: 0.022, lean: 0.14, spine: 0.03, pelvisYaw: 0.1, chestYaw: 0.14, lift: 0.17, heel: 0.08, toeOff: 0.6, footX: 0.085, zc: 0.02,
    armSwing: 0.55, armBias: 0.12, armOut: 0.2, elbow: 1.3, elbowVar: 0.2, sway: 0.012 },
};
for (const g of Object.values(GAITS)) g.speed = (g.front + g.back) / (g.stance * g.cycle);

function gaitPose(P, ph, g) {
  P.reset();
  const s = g.stance, cw = Math.cos(TAU * ph); // cw=1：左脚刚着地（左腿在前）
  const hy = g.hipY - g.bob * Math.cos(2 * TAU * (ph - s / 2)); // 着地中段最低，腾空中段最高
  P.hips(V(g.sway * Math.sin(TAU * (ph - s / 2 + 0.25)), hy, 0), qBody(g.lean, -g.pelvisYaw * cw, 0.03 * Math.sin(TAU * (ph - s / 2))));
  const cy = (g.pelvisYaw + g.chestYaw) * cw / 2; // 胸腔反向拧，抵消骨盆转动再多一点
  P.rotW(P.b('Spine'), qBody(g.spine, 0, 0)); P.rotW(P.b('Spine1'), qBody(g.spine, cy, 0)); P.rotW(P.b('Spine2'), qBody(g.spine, cy, 0));
  const cq = P.chestQ();
  P.rotW(P.b('Neck'), qBody(-(g.lean + g.spine * 3) * 0.45, -g.chestYaw * cw * 0.5, 0)); P.rotW(P.b('Head'), qBody(-(g.lean + g.spine * 3) * 0.4, -g.chestYaw * cw * 0.4, 0));
  for (const [S, side, off] of [['Left', 1, 0], ['Right', -1, 0.5]]) {
    const u = (ph + off) % 1; let z, y, pitch;
    if (u < s) { const t = u / s; z = g.front - (g.front + g.back) * t; y = P.ankleH + g.heel * sstep(0.5, 1, t); pitch = g.toeOff * sstep(0.45, 1, t) - 0.16 * (1 - sstep(0, 0.3, t)); }
    else { const t = (u - s) / (1 - s); z = -g.back + (g.front + g.back) * sstep(0, 1, t); y = P.ankleH + g.heel * (1 - sstep(0, 0.35, t)) + g.lift * Math.sin(Math.PI * Math.pow(t, 0.72));
      pitch = g.toeOff * (1 - sstep(0, 0.45, t)) + 0.45 * Math.sin(Math.PI * t) * (1 - t) - 0.16 * sstep(0.7, 1, t); }
    P.leg(S, V(side * g.footX, y, z + g.zc), pitch);
    const th = side * -g.armSwing * cw + g.armBias; // 左腿在前时左臂在后
    const be = g.elbow + g.elbowVar * Math.sin(th);
    P.arm(S, V(side * g.armOut, -Math.cos(th), Math.sin(th)).applyQuaternion(cq), V(side * (g.armOut - 0.28), -Math.cos(th + be), Math.sin(th + be)).applyQuaternion(cq));
  }
  return P.sample();
}
function gaitClip(P, name, g, n = 24) {
  const times = [], frames = []; for (let i = 0; i <= n; i++) { times.push(g.cycle * i / n); frames.push(gaitPose(P, (i % n) / n, g)); }
  frames[n] = { hips: frames[0].hips.clone(), q: frames[0].q.map((q) => q.clone()) };
  return P.clip(name, times, frames);
}

// 待机：侧身的备战站姿（左脚在前），手臂自然垂在身侧，带呼吸起伏
function idlePose(P, ph) {
  P.reset(); const br = Math.sin(TAU * ph), br2 = Math.sin(TAU * ph - 0.9);
  P.hips(V(-0.012, 0.9 + 0.007 * br, -0.01), qBody(0.07, -0.3, 0));
  P.rotW(P.b('Spine'), qBody(0.03 + 0.008 * br, 0.08, 0)); P.rotW(P.b('Spine1'), qBody(0.03 + 0.01 * br, 0.08, 0)); P.rotW(P.b('Spine2'), qBody(0.02 + 0.012 * br, 0.06, 0));
  const cq = P.chestQ();
  P.rotW(P.b('Neck'), qBody(0.02, 0.05, 0)); P.rotW(P.b('Head'), qBody(0.03 - 0.012 * br2, 0.05, 0));
  P.leg('Left', V(0.15, P.ankleH, 0.2), 0, 0.12); P.leg('Right', V(-0.17, P.ankleH, -0.2), 0, 0.5);
  P.arm('Left', V(0.19, -1, -0.02 + 0.012 * br2).applyQuaternion(cq), V(0.1, -1, 0.26 + 0.015 * br2).applyQuaternion(cq));
  P.arm('Right', V(-0.2, -1, -0.1 + 0.012 * br2).applyQuaternion(cq), V(-0.05, -1, 0.4 + 0.02 * br2).applyQuaternion(cq));
  return P.sample();
}
// 跳跃（0.5 s，游戏里上升段从 0 播、下落段停在末尾）：蹬地 → 收腿上升 → 展开下落
function jumpPose(P, k) {
  P.reset();
  const A = [ // [hipsY, lean, 左踝, 左脚尖, 右踝, 右脚尖, 上臂(左), 前臂(左), 上臂(右), 前臂(右)]
    [0.9, 0.16, V(0.1, 0.1, 0.02), 0.5, V(-0.1, 0.1, -0.08), 0.6, V(0.22, -0.9, -0.45), V(0.12, -0.75, -0.1), V(-0.22, -0.9, -0.45), V(-0.12, -0.75, -0.1)],
    [0.95, 0.12, V(0.1, 0.34, 0.2), 0.5, V(-0.11, 0.14, -0.2), 0.9, V(0.3, -0.85, 0.25), V(0.1, -0.2, 0.75), V(-0.3, -0.8, -0.5), V(-0.25, -0.75, -0.25)],
    [0.95, 0.06, V(0.11, 0.42, 0.16), 0.4, V(-0.12, 0.2, -0.22), 0.9, V(0.45, -0.75, 0.15), V(0.3, -0.1, 0.6), V(-0.45, -0.7, -0.35), V(-0.45, -0.6, -0.1)],
    [0.95, 0.02, V(0.15, 0.22, 0.12), 0.35, V(-0.15, 0.14, -0.14), 0.6, V(0.75, -0.55, -0.05), V(0.75, -0.15, 0.25), V(-0.75, -0.55, -0.1), V(-0.75, -0.15, 0.2)],
  ][k];
  P.hips(V(0, A[0], 0), qBody(A[1], 0, 0)); P.rotW(P.b('Spine1'), qBody(A[1] * 0.4, 0, 0)); const cq = P.chestQ(); P.rotW(P.b('Head'), qBody(-A[1] * 0.8, 0, 0));
  P.leg('Left', A[2], A[3]); P.leg('Right', A[4], A[5]);
  P.arm('Left', A[6].clone().applyQuaternion(cq), A[7].clone().applyQuaternion(cq)); P.arm('Right', A[8].clone().applyQuaternion(cq), A[9].clone().applyQuaternion(cq));
  return P.sample();
}

export function buildHeroClips(tpl) {
  const P = new Poser(tpl); const out = {};
  out.run = gaitClip(P, 'run', GAITS.run); out.jog = gaitClip(P, 'jog', GAITS.jog, 20);
  { const n = 16, D = 2.8, times = [], frames = []; for (let i = 0; i <= n; i++) { times.push(D * i / n); frames.push(idlePose(P, (i % n) / n)); } out.idle = P.clip('idle', times, frames); }
  out.jump = P.clip('jump', [0, 0.1, 0.3, 0.45, 0.5], [jumpPose(P, 0), jumpPose(P, 1), jumpPose(P, 2), jumpPose(P, 3), jumpPose(P, 3)]);
  P.reset();
  return out;
}
// 入口：体型 + 动作一起升级；任何一步失败都退回原始资源（只打印警告）
export function upgradeHero(tpl) {
  const done = { shape: false, clips: [] };
  try { done.shape = reshapeHero(tpl); } catch (e) { console.warn('主角体型修正失败，使用原模型：', e); }
  try { const c = buildHeroClips(tpl); tpl.clips = tpl.clips.filter((x) => !c[x.name]).concat(Object.values(c)); done.clips = Object.keys(c); } catch (e) { console.warn('主角动作生成失败，使用原动作：', e); }
  return done;
}
