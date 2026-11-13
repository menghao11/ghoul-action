// 主角「凌夜」：状态机 + 输入缓冲 + 取消窗口 + 程序化动画 + 血绫
import * as THREE from 'three';
import { makeRig, applyPose, Poses } from './rig.js';
import { Tendril, Trail } from './tendril.js';
import { buildMoves } from './moves.js';
import { TYPES, MOVE_NAMES } from './names.js';
import { angDiff } from './camera.js';
import { toon } from './toon.js';

const D2R = Math.PI / 180;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - Math.pow(1 - t, 3), easeIn = (t) => t * t * t, easeIO = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const TENDRIL_DEFS = {
  ranged: [{ anchor: 'upper', off: [0.12, 0, 0], len: 2.3, radius: 0.15, flat: 0.32, rest: [1.5, 2.0, -0.8], color: 0xff3a6a, spikes: 1 }, { anchor: 'upper', off: [-0.12, 0, 0], len: 2.3, radius: 0.15, flat: 0.32, rest: [-1.5, 2.0, -0.8], color: 0xff3a6a, spikes: 1 }],
  heavy: [{ anchor: 'back', off: [0.06, 0, 0], len: 2.6, radius: 0.26, plates: 7, rest: [0.9, 1.9, -0.5], k0: 320, k1: 100, color: 0xff2a18 }],
  burst: [[0.8, 1.4, -1.2], [-0.8, 1.4, -1.2], [1.5, 0.6, -0.9], [-1.5, 0.6, -0.9]].map((r, i) => ({ anchor: 'back', off: [(i % 2 ? -1 : 1) * 0.07, i < 2 ? 0.05 : -0.05, 0], len: 2.3, radius: 0.075, rest: r, spikes: 1, k0: 520, k1: 200, color: 0xff1048 })),
  balanced: [{ anchor: 'back', off: [0, -0.12, 0], len: 3.4, radius: 0.13, rest: [0.7, 2.3, -1.6], k0: 380, k1: 110, color: 0xff2030 }],
};
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _t = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Vector3();

export class Player {
  constructor(world) {
    this.w = world; const scene = world.scene;
    this.rig = makeRig({ coat: 0x2a2232, pants: 0x1a1620, hair: 0xf4f4fa, accent: 0xff1a3a, outline: world.quality !== 'low' });
    scene.add(this.rig.root);
    this.pos = new THREE.Vector3(-30, 0, 0); this.vel = new THREE.Vector3(); this.yaw = Math.PI / 2; this.radius = 0.45; this.height = 1.8;
    this.maxHp = 100; this.hp = 100; this.energy = 0; this.alive = true;
    this.state = 'move'; this.st = 0; this.grounded = true; this.airJumps = 1; this.airDodges = 1;
    this.typeIdx = 3; this.type = TYPES[3].id; this.moves = {}; for (const t of TYPES) this.moves[t.id] = buildMoves(t.id);
    this.move = null; this.mt = 0; this.moveId = ''; this.hitDone = new Set(); this.projDone = new Set(); this.comboStep = 0; this.airStep = 0;
    this.dodgeT = 0; this.dodgeDir = new THREE.Vector3(); this.lastDodge = -9; this.perfectReady = 0; this.iframe = 0;
    this.awake = 0; this.awakeMax = 15; this.dmgMul = 1; this.god = false; this.guardT = 0;
    this.runPhase = 0; this.time = 0; this.ghostT = 0; this.target = null; this.hurtT = 0; this.landT = 0;
    // 血绫
    this.tendrils = {}; this.trails = {};
    for (const t of TYPES) {
      this.tendrils[t.id] = TENDRIL_DEFS[t.id].map((d) => { const td = new Tendril(scene, { length: d.len, radius: d.radius, flat: d.flat || 1, plates: d.plates || 0, spikes: d.spikes || 0, k0: d.k0 || 420, k1: d.k1 || 140, color: d.color }); td.def = d; td.lenScale = 0; return td; });
      this.trails[t.id] = this.tendrils[t.id].map(() => new Trail(scene, 16, 0xff2448));
    }
    this.wrap = Array.from({ length: 6 }, (_, i) => { const td = new Tendril(scene, { length: 2.2, radius: 0.05, k0: 600, k1: 260, spikes: 1, color: 0xff0838 }); td.lenScale = 0; td.def = { anchor: 'back', off: [0, 0, 0] }; return td; });
    this.wrapTrails = this.wrap.map(() => new Trail(scene, 14, 0xff1040));
    this.tendrils[this.type].forEach((t) => (t.targetLen = 1));
    this._buildArmor();
    this.rig.root.position.copy(this.pos);
  }
  _buildArmor() {
    const g = new THREE.Group(); const mat = toon(0x200206, { emissive: 0xff0830, emissiveIntensity: 0.55 });
    const spike = (len, r) => { const c = new THREE.ConeGeometry(r, len, 5); c.translate(0, len / 2, 0); return c; };
    const add = (parent, geo, pos, rot) => { const m = new THREE.Mesh(geo, mat); m.position.set(...pos); m.rotation.set(...rot); parent.add(m); this.armorParts.push(m); return m; };
    this.armorParts = [];
    const J = this.rig.J;
    for (const s of [1, -1]) {
      add(J[s > 0 ? 'shL' : 'shR'], spike(0.38, 0.11), [0.03 * s, 0.05, 0], [0, 0, -0.7 * s]);
      add(J[s > 0 ? 'shL' : 'shR'], spike(0.26, 0.08), [0.05 * s, -0.08, -0.05], [-0.6, 0, -1.1 * s]);
      add(J[s > 0 ? 'elL' : 'elR'], spike(0.3, 0.07), [0.04 * s, -0.15, -0.04], [-2.3, 0, -0.5 * s]);
      add(J.head, spike(0.32, 0.05), [0.09 * s, 0.24, 0.0], [-0.4, 0, -0.5 * s]);
      add(J.chest, spike(0.5, 0.09), [0.1 * s, 0.3, -0.18], [-2.2, 0, -0.3 * s]);
    }
    add(J.chest, new THREE.BoxGeometry(0.46, 0.34, 0.06), [0, 0.18, 0.18], [0.1, 0, 0]);
    add(J.head, new THREE.BoxGeometry(0.24, 0.16, 0.06), [0, 0.1, 0.17], [0, 0, 0]);
    this.armorParts.forEach((m) => { m.scale.setScalar(0.001); m.visible = false; });
  }
  get curMoves() { return this.moves[this.type]; }
  setType(i, silent) {
    i = ((i % 4) + 4) % 4; if (i === this.typeIdx) return false;
    this.tendrils[this.type].forEach((t) => (t.targetLen = 0));
    this.typeIdx = i; this.type = TYPES[i].id;
    this.tendrils[this.type].forEach((t) => { t.targetLen = 1; t.lenScale = Math.max(t.lenScale, 0.05); t.init = false; });
    this.trails[this.type].forEach((tr) => tr.reset(this.pos));
    if (!silent) { this.w.fx.burst(_a.copy(this.pos).setY(this.pos.y + 1.1), [1, 0.1, 0.25], 26, 5); this.w.sfx.whoosh(0.7); this.w.hud.flashType(this.typeIdx); }
    if (this.state === 'guard' && this.type !== 'heavy') this.toMove();
    this.w.stats.switches++;
    return true;
  }
  forward(out = _q) { return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  // 选目标：锁定优先；否则按输入方向/朝向找最近
  pickTarget(range = 7) {
    const lt = this.w.cam.lockTarget; if (lt && lt.alive) return lt;
    const dir = this.inputDir.lengthSq() > 0.01 ? this.inputDir : this.forward(_c).clone();
    let best = null, bs = 1e9;
    for (const e of this.w.enemies) {
      if (!e.alive) continue; const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z; const d = Math.hypot(dx, dz); if (d > range) continue;
      const ang = Math.acos(clamp((dx * dir.x + dz * dir.z) / (d + 1e-5), -1, 1));
      const s = d + ang * 2.2; if (ang < 1.4 && s < bs) { bs = s; best = e; }
    }
    if (!best) { let nd = 3.6; for (const e of this.w.enemies) { if (!e.alive) continue; const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z); if (d < nd) { nd = d; best = e; } } } // 贴身时自动转向
    return best;
  }
  faceTarget(t, instant) {
    if (!t) { if (this.inputDir.lengthSq() > 0.01) this.yaw = Math.atan2(this.inputDir.x, this.inputDir.z); return; }
    this.yaw = Math.atan2(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
  }
  startMove(id) {
    const m = this.curMoves[id]; if (!m) return false;
    this.move = m; this.moveId = id; this.mt = 0; this.hitDone.clear(); this.projDone.clear(); this.state = 'attack';
    this.target = this.pickTarget(m.air ? 8 : 7.5); this.faceTarget(this.target);
    if (m.teleport && this.target) { // 瞬影：闪到目标身后
      this.w.ghosts.spawn(this.rig, 0xff1030, 0.5, 0.6);
      const t = this.target; _a.subVectors(t.pos, this.pos).setY(0).normalize();
      this.pos.x = t.pos.x + _a.x * (t.radius + 1.0); this.pos.z = t.pos.z + _a.z * (t.radius + 1.0); this.faceTarget(t);
    }
    if (m.guard) { this.state = 'guard'; this.guardT = 0; }
    if (!m.air && !m.hang) { this.vel.x *= 0.2; this.vel.z *= 0.2; }
    if (m.slam) { this.vel.set(0, -4, 0); }
    if (m.finisher) { this.vel.set(0, 6, 0); this.w.bulletTime(1.8, 0.15); }
    const nm = MOVE_NAMES[m.name] || (id.startsWith('L') ? MOVE_NAMES.L : id.startsWith('air') ? MOVE_NAMES.airL : '');
    if (nm) this.w.hud.moveName(nm);
    this.w.sfx.whoosh(m.dur < 0.35 ? 1.3 : 0.9);
    this.w.stats.moves[id] = (this.w.stats.moves[id] || 0) + 1;
    return true;
  }
  toMove() { this.state = 'move'; this.move = null; this.moveId = ''; }
  // 根据当前状态与缓冲输入选下一招
  tryAttack(canChain) {
    const I = this.w.input, buf = 0.3;
    if (this.awake > 0 && I.consume('ult', buf) && this.awake < this.awakeMax - 0.8) { this.startMove('finisher'); this.awake = this.curMoves.finisher.dur + 0.15; return true; }
    const sinceDodge = this.w.time - this.lastDodge;
    if (I.peek('skill', buf)) {
      I.consume('skill', buf); this.comboStep = 0;
      if (this.type === 'heavy') return this.startMove('S');
      return this.startMove('S');
    }
    if (I.peek('heavy', buf)) {
      I.consume('heavy', buf);
      if (!this.grounded) { this.airStep = 0; return this.startMove('airH'); }
      if (this.state === 'guard') { this.comboStep = 0; return this.startMove('bash'); }
      if (this.perfectReady > 0) { this.perfectReady = 0; this.comboStep = 0; return this.startMove('pcounter'); }
      if (sinceDodge < 0.5) { this.comboStep = 0; return this.startMove('counter'); }
      if (this.comboStep >= 2) { this.comboStep = 0; return this.startMove('launch'); }
      this.comboStep = 0; return this.startMove('H');
    }
    if (I.peek('light', buf)) {
      I.consume('light', buf);
      if (this.state === 'guard') { this.comboStep = 0; return this.startMove('bash'); }
      if (this.perfectReady > 0) { this.perfectReady = 0; this.comboStep = 0; return this.startMove('pcounter'); }
      if (sinceDodge < 0.45 && this.grounded) { this.comboStep = 0; return this.startMove('counter'); }
      if (!this.grounded) { if (this.airStep >= 3) return false; this.airStep++; return this.startMove('airL' + this.airStep); }
      const chain = canChain ? this.comboStep : 0; const next = (chain % 4) + 1; this.comboStep = next; return this.startMove('L' + next);
    }
    return false;
  }
  tryDodge() {
    const I = this.w.input;
    if (!I.peek('dodge', 0.2)) return false;
    if (!this.grounded && this.airDodges <= 0) return false;
    I.consume('dodge', 0.2); if (!this.grounded) this.airDodges--;
    this.state = 'dodge'; this.dodgeT = 0; this.move = null; this.comboStep = 0; this.lastDodge = this.w.time; this.perfectUsed = false;
    if (this.inputDir.lengthSq() > 0.01) this.dodgeDir.copy(this.inputDir).normalize(); else this.dodgeDir.copy(this.forward(_c)).multiplyScalar(-1);
    this.yaw = Math.atan2(this.dodgeDir.x, this.dodgeDir.z) + (this.inputDir.lengthSq() > 0.01 ? 0 : Math.PI);
    this.vel.y = this.grounded ? 0 : 1.5;
    this.w.sfx.whoosh(1.5); this.w.stats.dodges++;
    return true;
  }
  tryJump() {
    const I = this.w.input;
    if (!I.peek('jump', 0.15)) return false;
    if (!this.grounded && this.airJumps <= 0) return false;
    I.consume('jump', 0.15);
    if (!this.grounded) { this.airJumps--; this.w.fx.burst(this.pos.clone().setY(this.pos.y + 0.2), [1, 0.1, 0.2], 12, 3, 0.08); }
    this.vel.y = this.grounded ? 10.5 : 9.5; this.grounded = false; this.state = 'move'; this.move = null;
    // 追击跳：刚挑空的目标在附近时，朝它跳
    const t = this.chaseT > 0 ? this.target : null;
    if (t && t.alive && t.airborne) { _a.subVectors(t.pos, this.pos).setY(0); const d = _a.length(); if (d > 0.5) { _a.normalize(); this.vel.x = _a.x * Math.min(12, d * 3); this.vel.z = _a.z * Math.min(12, d * 3); } this.vel.y = 12.5; this.yaw = Math.atan2(_a.x, _a.z); }
    this.airStep = 0;
    return true;
  }
  // 敌人攻击打到玩家时调用；返回 'hit' | 'evade' | 'perfect' | 'block' | 'parry'
  receive(dmg, from, opts = {}) {
    if (!this.alive) return 'evade';
    if (this.state === 'dodge') {
      if (this.dodgeT <= 0.26 && !this.perfectUsed) { this.perfectUsed = true; this.onPerfect(from); return 'perfect'; }
      if (this.iframe > 0) return 'evade';
    }
    if (this.iframe > 0) return 'evade';
    if (this.state === 'guard' && from) {
      const ang = Math.abs(angDiff(this.yaw, Math.atan2(from.pos.x - this.pos.x, from.pos.z - this.pos.z)));
      if (ang < 1.9) {
        if (this.guardT < 0.22) { this.w.onParry(from); return 'parry'; }
        dmg *= 0.15; this.hp -= this.god ? 0 : dmg; this.w.onBlock(from); this.addEnergy(3); return 'block';
      }
    }
    if (this.awake > 0) dmg *= 0.45;
    if (this.state === 'attack' && this.move && this.move.finisher) return 'evade';
    if (!this.god) this.hp -= dmg;
    this.w.stats.damageTaken += dmg;
    if (this.hp <= 0) { this.hp = 0; this.alive = false; this.state = 'dead'; this.w.onPlayerDead(); return 'hit'; }
    if (this.awake <= 0 && !(this.state === 'attack' && this.move && (this.move.dur > 0.9))) {
      this.state = 'hurt'; this.hurtT = 0.32; this.move = null; this.comboStep = 0;
      if (from) { _a.subVectors(this.pos, from.pos).setY(0).normalize(); this.vel.x = _a.x * (opts.kb || 5); this.vel.z = _a.z * (opts.kb || 5); }
    }
    this.w.onPlayerHurt(dmg); return 'hit';
  }
  onPerfect(from) {
    this.perfectReady = 1.4; this.iframe = Math.max(this.iframe, 0.5); this.addEnergy(18);
    this.w.bulletTime(1.4); this.w.stats.perfect++;
  }
  addEnergy(v) { if (this.awake > 0) return; this.energy = clamp(this.energy + v, 0, 100); }
  activateAwaken() {
    if (this.energy < 100 || this.awake > 0) return false;
    this.energy = 0; this.awake = this.awakeMax; this.state = 'ult'; this.st = 0; this.move = null; this.iframe = 0.9;
    this.armorParts.forEach((m) => (m.visible = true)); this.wrap.forEach((t) => { t.targetLen = 1; t.init = false; });
    this.w.onAwaken(); return true;
  }
  update(dt, realDt) {
    const w = this.w, I = w.input; this.time += dt;
    // 输入方向（相机相对）
    const f = w.cam.forward(), r = w.cam.right();
    this.inputDir = (this.inputDir || new THREE.Vector3()).set(r.x * I.move.x + f.x * I.move.y, 0, r.z * I.move.x + f.z * I.move.y);
    const inMag = Math.min(1, this.inputDir.length());
    if (this.iframe > 0) this.iframe -= dt; if (this.perfectReady > 0) this.perfectReady -= realDt; if (this.chaseT > 0) this.chaseT -= dt;
    if (this.awake > 0) { this.awake -= dt; if (this.awake <= 0) this.endAwaken(); }
    // 离散指令（任何状态可用）
    for (let i = 0; i < 4; i++) if (I.consume('type' + i, 0.3)) this.setType(i);
    if (I.consume('switch', 0.3)) this.setType(this.typeIdx + 1);
    if (I.peek('ult', 0.3) && this.awake <= 0 && this.energy >= 100 && this.state !== 'dead') { I.consume('ult', 0.3); this.activateAwaken(); }
    const spd = 7.2 * (this.awake > 0 ? 1.15 : 1);
    let grav = 30;
    switch (this.state) {
      case 'move': {
        const want = _a.copy(this.inputDir).multiplyScalar(spd);
        const k = 1 - Math.exp(-(this.grounded ? 16 : 5) * dt);
        this.vel.x += (want.x - this.vel.x) * k; this.vel.z += (want.z - this.vel.z) * k;
        if (inMag > 0.05) { const ty = Math.atan2(this.inputDir.x, this.inputDir.z); this.yaw += angDiff(this.yaw, ty) * (1 - Math.exp(-16 * dt)); }
        else if (w.cam.lockTarget && w.cam.lockTarget.alive && this.grounded) { const t = w.cam.lockTarget; this.yaw += angDiff(this.yaw, Math.atan2(t.pos.x - this.pos.x, t.pos.z - this.pos.z)) * (1 - Math.exp(-8 * dt)); }
        if (this.tryDodge() || this.tryJump()) break;
        this.tryAttack(this.time - this.lastAttackEnd < 0.5);
        break;
      }
      case 'attack': this.updateAttack(dt); break;
      case 'guard': {
        this.guardT += dt; this.vel.x *= Math.exp(-10 * dt); this.vel.z *= Math.exp(-10 * dt);
        const t = this.pickTarget(10); if (t) this.yaw += angDiff(this.yaw, Math.atan2(t.pos.x - this.pos.x, t.pos.z - this.pos.z)) * (1 - Math.exp(-10 * dt));
        else if (inMag > 0.05) this.yaw += angDiff(this.yaw, Math.atan2(this.inputDir.x, this.inputDir.z)) * (1 - Math.exp(-10 * dt));
        if (this.tryDodge()) break;
        if (I.peek('light', 0.3) || I.peek('heavy', 0.3)) { this.tryAttack(false); break; }
        if (!I.held.skill || this.type !== 'heavy') this.toMove();
        break;
      }
      case 'dodge': {
        this.dodgeT += dt; const D = 0.3, p = clamp(this.dodgeT / D, 0, 1);
        const v = 22 * Math.pow(1 - p, 1.6) + 2;
        this.vel.x = this.dodgeDir.x * v; this.vel.z = this.dodgeDir.z * v; grav = this.grounded ? 30 : 4;
        this.iframe = Math.max(this.iframe, this.dodgeT < 0.26 ? 0.02 : 0);
        this.ghostT -= dt; if (this.ghostT <= 0) { this.ghostT = 0.035; w.ghosts.spawn(this.rig, 0xff1838, 0.3, 0.42); }
        if (this.dodgeT > 0.12 && (I.peek('light', 0.3) || I.peek('heavy', 0.3) || I.peek('skill', 0.3))) { if (this.tryAttack(false)) break; }
        if (this.dodgeT > 0.2 && this.tryDodge()) break;
        if (this.dodgeT > 0.2 && this.tryJump()) break;
        if (this.dodgeT >= D) { this.toMove(); this.vel.multiplyScalar(0.4); }
        break;
      }
      case 'hurt': { this.hurtT -= dt; this.vel.x *= Math.exp(-6 * dt); this.vel.z *= Math.exp(-6 * dt); if (this.hurtT <= 0) this.toMove(); else if (this.hurtT < 0.16) this.tryDodge(); break; }
      case 'ult': { this.st += dt; this.vel.set(0, 0, 0); grav = 0; if (this.st > 0.75) this.toMove(); break; }
      case 'dead': { this.vel.x *= 0.9; this.vel.z *= 0.9; break; }
    }
    // 物理
    if (this.state === 'attack' && this.move && this.move.hang && !this.grounded) grav = 4;
    if (this.state === 'attack' && this.move && this.move.slam) grav = 0;
    if (this.vel.y < 0 && grav > 20) grav *= 1.25;
    this.vel.y -= grav * dt;
    this.pos.addScaledVector(this.vel, dt);
    if (this.pos.y <= 0) {
      if (!this.grounded) { this.onLand(); }
      this.pos.y = 0; if (this.vel.y < 0) this.vel.y = 0; this.grounded = true; this.airJumps = 1; this.airDodges = 1; this.airStep = 0;
    } else if (this.pos.y > 0.05) this.grounded = false;
    w.collideWorld(this.pos, this.radius);
    this.animate(dt, inMag);
  }
  onLand() {
    this.landT = 0.12;
    if (this.state === 'attack' && this.move && this.move.slam) { this.startMove('airH_land'); this.w.rings.spawn(this.pos, 4, 0.35); }
    else if (this.state === 'attack' && this.move && this.move.air) { this.toMove(); }
  }
  updateAttack(dt) {
    const m = this.move, w = this.w, I = w.input; this.mt += dt; const t = this.mt;
    // 突进/吸附
    if (m.lunge && t >= m.lunge[0] && t <= m.lunge[1] + dt) {
      const span = Math.max(0.01, m.lunge[1] - m.lunge[0]); let dist = m.lunge[2] * (this.awake > 0 ? 1.15 : 1);
      const tg = this.target && this.target.alive ? this.target : null;
      const dir = this.forward(_a).clone();
      if (tg) { _b.subVectors(tg.pos, this.pos); const hd = Math.hypot(_b.x, _b.z); dist = Math.min(dist, Math.max(0, hd - tg.radius - 0.9)); this.yaw += angDiff(this.yaw, Math.atan2(_b.x, _b.z)) * 0.5; }
      const sp = dist / span;
      this.vel.x = dir.x * sp; this.vel.z = dir.z * sp;
      if (m.air && tg) { const dy = (tg.pos.y + 0.2) - this.pos.y; this.vel.y = clamp(dy * 8, -6, 6); }
    } else if (!m.air) { this.vel.x *= Math.exp(-14 * dt); this.vel.z *= Math.exp(-14 * dt); }
    else { this.vel.x *= Math.exp(-6 * dt); this.vel.z *= Math.exp(-6 * dt); }
    if (m.hang && !this.grounded && !(m.lunge && t <= m.lunge[1])) this.vel.y = Math.max(this.vel.y, -1.5) * Math.exp(-4 * dt);
    if (m.slam) { this.vel.y = t < 0.12 ? 2 : -26; }
    if (m.finisher) { this.vel.y = t < 0.4 ? 4 : 0; this.vel.x = this.vel.z = 0; }
    if (m.ghost || this.awake > 0) { this.ghostT -= dt; if (this.ghostT <= 0) { this.ghostT = 0.05; w.ghosts.spawn(this.rig, 0xff1030, 0.28, 0.35); } }
    // 判定
    m.hits.forEach((hd, i) => { if (t >= hd.t && !this.hitDone.has(i)) { this.hitDone.add(i); w.playerStrike(this, hd, m); } });
    if (m.proj) m.proj.forEach((pd, i) => { if (t >= pd.t && !this.projDone.has(i)) { this.projDone.add(i); w.fireShards(this, pd); } });
    // 取消窗口：闪避随时可取消（出手后）；攻击/跳跃在 cancel 之后接
    if (t >= m.dodgeCancel && !m.finisher && this.tryDodge()) return;
    if (t >= m.cancel) {
      if (this.tryAttack(true)) return;
      if (this.tryJump()) return;
      if (this.moveId === 'launch' && I.peek('light', 0.3) && this.chaseT > 0) { /* 落空：继续 */ }
    }
    if (t >= m.dur) { this.lastAttackEnd = this.time; if (m.slam && !this.grounded) return; this.toMove(); }
  }
  endAwaken() { this.awake = 0; this.armorParts.forEach((m) => (m.visible = false)); this.wrap.forEach((t) => (t.targetLen = 0)); this.w.onAwakenEnd(); }
  // ----- 动画 -----
  animate(dt, inMag) {
    const rig = this.rig, root = rig.root; root.position.copy(this.pos); root.rotation.y = this.yaw;
    let pose, k = 1 - Math.exp(-20 * dt);
    const hs = Math.hypot(this.vel.x, this.vel.z);
    switch (this.state) {
      case 'move':
        if (!this.grounded) pose = Poses.air(this.vel.y);
        else if (hs > 0.6) { this.runPhase += dt * (6 + hs * 1.3); pose = Poses.run(this.runPhase, hs / 7.2); }
        else pose = Poses.idle(this.time, 1);
        if (this.landT > 0) { this.landT -= dt; pose.py = (pose.py || 0.95) - 0.14 * (this.landT / 0.12); }
        k = 1 - Math.exp(-14 * dt); break;
      case 'dodge': pose = Poses.dodge(this.dodgeT / 0.3); k = 1 - Math.exp(-30 * dt); break;
      case 'hurt': pose = Poses.hurt(); break;
      case 'guard': pose = Poses.guard(); break;
      case 'ult': pose = Poses.ult(Math.min(1, this.st / 0.3)); break;
      case 'dead': pose = Poses.down(); k = 1 - Math.exp(-6 * dt); break;
      case 'attack': {
        const m = this.move; const ts = m.hits.length ? m.hits[0].t : (m.proj ? m.proj[0].t : 0.15);
        const p = easeOut(clamp(this.mt / Math.max(0.04, ts), 0, 1));
        const fn = Poses[m.pose] || Poses.slash; pose = fn(p, m.side);
        if (m.pose === 'spin') { const tt = m.tendril; const sp = clamp((this.mt - (tt?.t0 || 0)) / ((tt?.t1 || 0.3) - (tt?.t0 || 0)), 0, 1); rig.body.rotation.y = easeIO(sp) * Math.PI * 2 * (tt?.turns || 1); }
        k = 1 - Math.exp(-34 * dt); break;
      }
    }
    if (!(this.state === 'attack' && this.move && this.move.pose === 'spin')) rig.body.rotation.y = rig.body.rotation.y % (Math.PI * 2) * Math.exp(-30 * dt);
    applyPose(rig, pose, k);
    // 绯魇护甲动画
    const aw = this.awake > 0;
    for (const m of this.armorParts) { const s = m.scale.x + ((aw ? 1 : 0.001) - m.scale.x) * (1 - Math.exp(-10 * dt)); m.scale.setScalar(s); if (!aw && s < 0.01) m.visible = false; }
    root.updateMatrixWorld(true);
    this.updateTendrils(dt);
  }
  updateTendrils(dt) {
    const root = this.rig.root; const t = this.time;
    const m = this.state === 'attack' ? this.move : null; const tt = m && m.tendril;
    const guard = this.state === 'guard';
    const right = _w.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    for (const type of Object.keys(this.tendrils)) {
      const list = this.tendrils[type], trails = this.trails[type]; const active = type === this.type;
      list.forEach((td, i) => {
        const tl = td.targetLen ?? 0; td.lenScale += (tl - td.lenScale) * (1 - Math.exp(-(tl > td.lenScale ? 9 : 14) * dt));
        if (td.lenScale < 0.02 && !active) { td.mesh.visible = false; trails[i].mesh.visible = false; return; }
        trails[i].mesh.visible = true;
        const anchor = (td.def.anchor === 'upper' ? this.rig.upperBack : this.rig.back);
        anchor.getWorldPosition(_a); _a.addScaledVector(right, -td.def.off[0]); _a.y += td.def.off[1];
        const A = root.worldToLocal(_a.clone());
        // 目标尖端（局部坐标）
        const tip = this.tendrilTip(td, i, list.length, tt, guard, t, _t);
        let wgt = 0;
        if (tt && active) { wgt = clamp(this.mt / 0.05, 0, 1); const end = (tt.then ? tt.then.t1 : tt.t1) + 0.1; if (this.mt > end) wgt *= clamp(1 - (this.mt - end) / Math.max(0.05, m.dur - end), 0, 1); }
        if (guard && active) wgt = 1;
        const rest = _b.set(td.def.rest[0], td.def.rest[1] + Math.sin(t * 1.7 + i) * 0.15, td.def.rest[2] + Math.cos(t * 1.3 + i * 2) * 0.12);
        if (this.state === 'move' && this.grounded) { const hs = Math.hypot(this.vel.x, this.vel.z); rest.z -= hs * 0.06; rest.y -= hs * 0.03; }
        tip.lerpVectors(rest, tip, wgt);
        const L = td.o.length * td.lenScale; const scale = L / Math.max(0.5, Math.hypot(tip.x - A.x, tip.y - A.y, tip.z - A.z)); if (scale < 1 && wgt < 0.5) tip.sub(A).multiplyScalar(Math.max(scale, 0.6)).add(A);
        const C = _c.lerpVectors(A, tip, 0.45); C.y += 0.5 + 0.3 * (1 - wgt); C.z -= 0.35 * (1 - wgt);
        if (wgt > 0.3) { const hl = Math.hypot(tip.x, tip.z) + 1e-4; C.x += tip.x / hl * 0.3; C.z += tip.z / hl * 0.3; }
        td.setGoals((f, out) => { const u = 1 - f; out.set(u * u * A.x + 2 * u * f * C.x + f * f * tip.x, u * u * A.y + 2 * u * f * C.y + f * f * tip.y, u * u * A.z + 2 * u * f * C.z + f * f * tip.z); root.localToWorld(out); });
        td.refN.copy(right);
        td.radScale = (guard && active && type === 'heavy' ? 1.35 : 1) * (this.awake > 0 ? 1.15 : 1) * Math.min(1, td.lenScale * 1.2);
        td.mat.emissiveIntensity = (this.awake > 0 ? 2.4 : 1.5) + (wgt > 0.5 ? 0.8 : 0);
        td.visible = true; td.step(dt); td.build();
        const n = td.P.length; trails[i].push(td.P[n - 1], td.P[n - 4], clamp((td.tipSpeed - 4) / 14, 0, 1) * td.lenScale); trails[i].update(dt);
      });
    }
    // 绯魇缠身血绫：螺旋包覆全身；终焉时刺向敌人
    this.wrap.forEach((td, i) => {
      const tl = td.targetLen ?? 0; td.lenScale += (tl - td.lenScale) * (1 - Math.exp(-8 * dt));
      if (td.lenScale < 0.02) { td.mesh.visible = false; this.wrapTrails[i].mesh.visible = false; return; }
      this.wrapTrails[i].mesh.visible = true;
      this.rig.back.getWorldPosition(_a); const A = root.worldToLocal(_a.clone());
      const fin = m && m.finisher && this.mt > tt.t0;
      let targetW = null;
      if (fin) { const es = this.w.enemies.filter((e) => e.alive); if (es.length) { const e = es[i % es.length]; targetW = _q.copy(e.pos); targetW.y += e.height * 0.5; } }
      td.setGoals((f, out) => {
        if (targetW) { const lt = root.worldToLocal(_t.copy(targetW)); const s = easeOut(f); out.set(lerp(A.x, lt.x, s) + Math.sin(f * Math.PI) * Math.cos(i) * 1.5, lerp(A.y, lt.y, s) + Math.sin(f * Math.PI) * 2.0, lerp(A.z, lt.z, s) + Math.sin(f * Math.PI) * Math.sin(i) * 1.5); }
        else { const ang = f * Math.PI * 2.6 + t * 2.2 + i * Math.PI / 3; const rr = 0.42 + 0.25 * f; out.set(Math.cos(ang) * rr, 0.35 + f * 1.45 + Math.sin(t * 3 + i) * 0.05, Math.sin(ang) * rr); }
        root.localToWorld(out);
      });
      td.o.length = targetW ? 14 : 2.2;
      td.refN.copy(right); td.radScale = Math.min(1, td.lenScale * 1.2) * (targetW ? 1.6 : 1); td.mat.emissiveIntensity = 2.6; td.visible = true; td.step(dt); td.build();
      const n = td.P.length; this.wrapTrails[i].push(td.P[n - 1], td.P[n - 3], clamp((td.tipSpeed - 3) / 10, 0, 1)); this.wrapTrails[i].update(dt);
    });
  }
  tendrilTip(td, i, n, tt, guard, time, out) {
    const off = (i - (n - 1) / 2);
    if (guard) { // 盾：在身前合拢成墙
      if (this.type === 'heavy') return out.set(0.15, 1.1 + Math.sin(time * 6) * 0.03, 0.9);
      return out.set(off * 0.6, 1.0 + Math.abs(off) * 0.3, 0.9);
    }
    if (!tt) return out.set(0, 0, 0);
    let k = tt; if (tt.then && this.mt >= tt.then.t0) k = tt.then;
    const u = clamp((this.mt - k.t0) / Math.max(0.01, k.t1 - k.t0), 0, 1);
    const polar = (a, d, h) => out.set(Math.sin(a * D2R) * d, h, Math.cos(a * D2R) * d);
    switch (k.kind) {
      case 'swing': { const a = lerp(k.a0, k.a1, easeIO(u)) + off * 25; return polar(a, k.d, lerp(k.h0, k.h1, u) + off * 0.25); }
      case 'thrust': { const d = u <= 0 ? 0.8 : lerp(0.9, k.d, easeOut(u)); return polar((k.a || 0) + off * (k.wide ? 30 : 12), d, k.h + off * 0.1); }
      case 'slam': { const h = lerp(k.high || 3.2, 0.05, easeIn(u)); return polar(off * 22, k.d, h); }
      case 'rise': return polar(off * 25, k.d, lerp(-0.1, 3.8, easeOut(u)));
      case 'flurry': { const ph = u * k.rate * Math.PI + i * 1.9; return polar((k.a || 0) + Math.sin(i * 2.3 + ph * 0.5) * 28 + off * 14, 0.9 + (k.d - 0.9) * Math.abs(Math.sin(ph)), k.h + 0.45 * Math.cos(ph * 1.3 + i)); }
      case 'spin': { const a = (k.a0 || 0) + easeIO(u) * 360 * k.turns + i * (360 / n); return polar(a, k.d, k.h); }
      case 'cast': { const side = n > 1 ? (i % 2 ? -1 : 1) : 1; const pul = k.pulse ? Math.sin(u * 30) * 0.2 : 0; return polar(side * (k.wide ? 75 : 55), 1.9 + pul, 2.1 + pul); }
      case 'down': return out.set(off * 0.6, -1.4, 1.1);
      case 'finisher': { const a = i * 360 / n + time * 200; return polar(a, 2.6, 2.2); }
    }
    return out.set(0, 1, -1);
  }
}
