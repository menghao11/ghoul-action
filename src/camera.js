// 第三人称轨道相机 + 锁定。只用临界阻尼平滑（无超调），没有任何晃屏/抖动/FOV 冲击代码。
import * as THREE from 'three';
const TAU = Math.PI * 2;
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
// 临界阻尼 SmoothDamp（Unity 同款公式）
function smoothDamp(cur, target, velObj, key, smoothTime, dt, maxSpeed = Infinity) {
  const omega = 2 / smoothTime, x = omega * dt, exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const maxC = maxSpeed * smoothTime; let change = cur - target; if (change > maxC) change = maxC; else if (change < -maxC) change = -maxC; target = cur - change;
  const temp = (velObj[key] + omega * change) * dt;
  velObj[key] = (velObj[key] - omega * temp) * exp; return target + (change + temp) * exp;
}
export class CameraRig {
  constructor(camera) {
    this.cam = camera; this.yaw = Math.PI * 0.5; this.pitch = 0.32; this.dist = 6.2; this.curDist = 6.2;
    this.focus = new THREE.Vector3(0, 1.4, 0); this.pre = new THREE.Vector3(0, 1.4, 0); this.fv = { x: 0, y: 0, z: 0, d: 0 }; this.yv = { yaw: 0, pitch: 0 }; this.preD = 6.2;
    this.sens = 0.0042; this.lockTarget = null; this.FOV = camera.fov;
    this._look = new THREE.Vector3(); this._lv = { x: 0, y: 0, z: 0 }; this.lookPt = new THREE.Vector3();
    this.manualT = 0;
    this.pushS = null; this.pushK = 1; this.pushLog = null; this.baseDist = 6.2;
  }
  // 处决/刺穿推进：只改相机到焦点的距离（不动 FOV、不加任何随机偏移）。
  // 包络 = 缓入(平滑单调) → 保持 → 缓出(平滑单调)，用真实时间推进；进行中只允许延长保持，绝不反向抖动。
  push(amt, tin = 0.4, hold = 1.0, tout = 0.7) {
    const P = this.pushS;
    if (P) { // 已在推进：缓入/保持阶段只延长保持；缓出阶段不打断（避免来回）
      if (P.t < P.tin + P.hold) { P.hold = Math.max(P.hold, P.t - P.tin + hold); P.tout = Math.max(P.tout, tout); return false; }
      return false;
    }
    this.pushS = { amt: Math.min(0.45, amt), tin, hold, tout, t: 0, base: this.baseDist }; return true;
  }
  pushPhase() { const P = this.pushS; if (!P) return 'none'; return P.t < P.tin ? 'in' : P.t < P.tin + P.hold ? 'hold' : 'out'; }
  input(dx, dy, touch) {
    const s = this.sens * (touch ? 0.9 : 1);
    if (Math.abs(dx) + Math.abs(dy) > 0) this.manualT = 0.8;
    this.yaw -= dx * s; this.pitch = Math.min(1.05, Math.max(-0.12, this.pitch + dy * s * 0.8));
  }
  forward() { return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) }; }
  right() { return { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) }; }
  update(dt, player) {
    const p = player.pos; const t = this.lockTarget;
    let fx = p.x, fy = p.y * 0.6 + 1.45, fz = p.z, dist = 6.2;
    const manual = this.manualT > 0; this.manualT -= dt;
    if (manual) { this.yv.yaw = 0; this.yv.pitch = 0; this.wantYaw = this.yaw; }
    if (t && t.alive) {
      const tp = t.pos; const dx = tp.x - p.x, dz = tp.z - p.z;
      const want = Math.atan2(-dx, -dz);
      fx = p.x + dx * 0.28; fz = p.z + dz * 0.28; fy = Math.max(fy, (p.y + tp.y) * 0.5 * 0.6 + 1.45);
      dist = 6.4 + Math.min(3, Math.hypot(dx, dz) * 0.12) + (t.isBoss ? 1.2 : 0);
      if (!manual) {
        // 锁定：目标角先经一阶滤波，再临界阻尼跟随 → 角速度、角加速度都连续，不会突跳或振荡
        if (this.wantYaw === undefined) this.wantYaw = this.yaw;
        const near = Math.hypot(dx, dz); this.wantYaw += angDiff(this.wantYaw, want) * (1 - Math.exp(-(near < 2.5 ? 3 : 8) * dt));
        const goal = this.yaw + angDiff(this.yaw, this.wantYaw);
        // 目标离得很近时角度变化剧烈：限制最大转速，避免镜头甩动
        this.yaw = smoothDamp(this.yaw, goal, this.yv, 'yaw', 0.3, dt, 2.6);
        this.pitch = smoothDamp(this.pitch, 0.3, this.yv, 'pitch', 0.6, dt);
      }
    } else if (!manual) { this.wantYaw = this.yaw; this.yaw += this.yv.yaw * dt; this.yv.yaw *= Math.exp(-7 * dt); } // 解除锁定：转动惯性平滑衰减，不急停
    // 跟随点：一阶预滤波 + 临界阻尼（三阶平滑，瞬移/冲刺也不会让镜头"弹"）
    const k = 1 - Math.exp(-12 * dt);
    this.pre.x += (fx - this.pre.x) * k; this.pre.y += (fy - this.pre.y) * k; this.pre.z += (fz - this.pre.z) * k;
    this.focus.x = smoothDamp(this.focus.x, this.pre.x, this.fv, 'x', 0.12, dt);
    this.focus.y = smoothDamp(this.focus.y, this.pre.y, this.fv, 'y', 0.2, dt);
    this.focus.z = smoothDamp(this.focus.z, this.pre.z, this.fv, 'z', 0.12, dt);
    // 避免穿楼：沿视线方向限制距离（同样经过平滑）
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const dirx = Math.sin(this.yaw) * cp, diry = sp, dirz = Math.cos(this.yaw) * cp;
    let maxD = 99; // 先只算几何约束（墙/地面），再和期望距离合并
    const zLim = 10.3, xLim = 41.5;
    if (Math.abs(dirz) > 1e-4) { const dz = ((dirz > 0 ? zLim : -zLim) - this.focus.z) / dirz; if (dz > 0) maxD = Math.min(maxD, dz); }
    if (Math.abs(dirx) > 1e-4) { const dx = ((dirx > 0 ? xLim : -xLim) - this.focus.x) / dirx; if (dx > 0) maxD = Math.min(maxD, dx); }
    if (diry < 0) maxD = Math.min(maxD, (this.focus.y - 0.3) / -diry);
    const wallD = Math.max(1.6, maxD); maxD = Math.max(1.6, Math.min(dist, maxD));
    this.preD += (maxD - this.preD) * (1 - Math.exp(-(maxD < this.preD ? 20 : 6) * dt));
    const P = this.pushS;
    if (!P) this.baseDist = smoothDamp(this.baseDist, this.preD, this.fv, 'd', maxD < this.baseDist ? 0.1 : 0.35, dt);
    else { this.baseDist = Math.min(P.base, wallD); this.fv.d = 0; } // 推进期间冻结基础距离，保证每段严格单调
    // 防穿楼：拉近是"立即"的（硬约束，当帧生效，不经平滑，不会穿进墙），只有松开后的拉远才平滑
    // 只对"墙/地面"硬约束；期望距离本身的变化（解锁、换目标）仍然平滑
    if (this.baseDist > wallD) { this.baseDist = wallD; if (this.fv.d > 0) this.fv.d = 0; }
    let pk = 1;
    if (P) {
      P.t += dt; const ss = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * x * (x * (x * 6 - 15) + 10); };
      const e = P.t < P.tin ? ss(P.t / P.tin) : P.t < P.tin + P.hold ? 1 : 1 - ss((P.t - P.tin - P.hold) / P.tout);
      pk = 1 - P.amt * e;
      if (P.t >= P.tin + P.hold + P.tout) { this.pushS = null; pk = 1; this.preD = this.baseDist; }
    }
    this.pushK = pk; this.curDist = this.baseDist * pk;
    if (this.pushLog) this.pushLog.push([this.curDist, k, this.pushPhase(), this.baseDist]);
    if (this.preD > wallD) this.preD = wallD;
    this.dbg = [maxD, this.curDist, dist];
    const c = this.cam;
    c.position.set(this.focus.x + dirx * this.curDist, this.focus.y + diry * this.curDist, this.focus.z + dirz * this.curDist);
    c.lookAt(this.focus.x, this.focus.y, this.focus.z);
    c.fov = this.FOV; // 固定 FOV，绝不做 FOV 冲击
  }
  snap(player) { this.focus.set(player.pos.x, 1.45, player.pos.z); this.pre.copy(this.focus); this.fv = { x: 0, y: 0, z: 0, d: 0 }; this.yv = { yaw: 0, pitch: 0 }; this.wantYaw = undefined; this.pushS = null; this.pushK = 1; }
}
export { angDiff };
