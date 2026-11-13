// 敌人：白鸦局 巡夜员 / 弩手 / 首席猎司·铁衡（Boss，三阶段，所有攻击都有地面预警）
import * as THREE from 'three';
import { makeRig, applyPose, Poses } from './rig.js';
import { toon } from './toon.js';
import { angDiff } from './camera.js';
import { N } from './names.js';

const D = Math.PI / 180; let UID = 0;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const KINDS = {
  grunt: { hp: 150, scale: 1.0, speed: 3.8, radius: 0.45, coat: 0xd8d8e0, hair: 0x1a1a1e, name: N.grunt },
  shooter: { hp: 110, scale: 0.97, speed: 3.4, radius: 0.45, coat: 0xa8b0c4, hair: 0x2a2a30, name: N.shooter },
  boss: { hp: 4000, scale: 1.6, speed: 4.4, radius: 0.85, coat: 0xf2f2f6, hair: 0x9a9aa4, name: N.boss },
};
const ATK = {
  slash: [{ w: 0.72, shape: 'sector', r: 2.8, arc: 50 * D, lunge: 2.0, dmg: 10, act: 0.14 }],
  shot: [{ w: 0.95, shape: 'rect', width: 0.7, len: 18, proj: { n: 1, spread: 0, speed: 20, dmg: 9 }, act: 0.1, aimLock: 0.25 }],
  sweep3: [{ w: 0.62, shape: 'sector', r: 4.4, arc: 70 * D, lunge: 1.8, dmg: 14 }, { w: 0.4, shape: 'sector', r: 4.4, arc: 70 * D, lunge: 1.5, dmg: 14 }, { w: 0.46, shape: 'sector', r: 4.8, arc: 95 * D, lunge: 2.2, dmg: 18 }],
  charge: [{ w: 0.85, shape: 'rect', width: 2.6, len: 13, dash: 26, dashT: 0.5, dmg: 20 }],
  slam: [{ w: 1.05, shape: 'circle', r: 4.4, at: 'target', jump: true, dmg: 24, ring: 4.6 }],
  fan: [{ w: 0.75, shape: 'sector', r: 16, arc: 28 * D, proj: { n: 5, spread: 50, speed: 17, dmg: 10 }, act: 0.1, aimLock: 0.2 }],
  spin: [{ w: 0.75, shape: 'circle', r: 5.2, dmg: 9, ticks: 3, tickGap: 0.22, act: 0.7, ring: 5.2 }],
};
export class Enemy {
  constructor(world, kind, x, z) {
    this.w = world; this.kind = kind; const K = KINDS[kind]; this.K = K; this.id = ++UID;
    this.isBoss = kind === 'boss'; this.name = K.name;
    this.rig = makeRig({ coat: K.coat, hair: K.hair, pants: 0x1c1c24, skin: 0xe0cfc4, accent: this.isBoss ? 0x80e0ff : 0x60c8ff, scale: K.scale, outline: world.quality !== 'low', mask: this.isBoss, tag: 'e' + this.id });
    this.coatMat = this.rig.meshes.find((m) => m.name === 'torso').material;
    world.scene.add(this.rig.root);
    this.pos = new THREE.Vector3(x, 0, z); this.vel = new THREE.Vector3(); this.yaw = -Math.PI / 2;
    this.hp = this.maxHp = K.hp; this.radius = K.radius; this.height = 1.8 * K.scale; this.alive = true;
    this.state = 'spawn'; this.st = 0; this.cool = 1 + Math.random() * 1.5; this.flash = 0; this.airborne = false; this.juggle = 0;
    this.poise = this.maxPoise = this.isBoss ? 900 : 0; this.lastHit = -9; this.phase = 1; this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.time = Math.random() * 10; this.atk = null; this.timeScale = 1;
    // 猎械（武器）
    const wmat = new THREE.MeshStandardMaterial({ color: 0x9aa0b0, metalness: 0.8, roughness: 0.3, emissive: 0x40b0ff, emissiveIntensity: 0.2 });
    this.wmat = wmat; let wg;
    if (kind === 'grunt') { wg = new THREE.BoxGeometry(0.06, 0.12, 1.25); wg.translate(0, 0, 0.55); }
    else if (kind === 'shooter') { wg = new THREE.BoxGeometry(0.5, 0.12, 0.6); wg.translate(0, 0, 0.2); }
    else { wg = new THREE.BoxGeometry(0.5, 0.55, 1.2); wg.translate(0, 0, 0.85); const h2 = new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6); h2.rotateX(Math.PI / 2); h2.translate(0, 0, 0.1); }
    const weapon = new THREE.Mesh(wg, wmat); weapon.position.set(0, -0.34, 0.04); weapon.rotation.x = -0.4; this.rig.J.elR.add(weapon); this.weapon = weapon;
    if (this.isBoss) { const cape = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.2, 6, 1, true), toon(0x1a1a24, { side: THREE.DoubleSide })); cape.position.set(0, -0.35, -0.08); this.rig.J.chest.add(cape); }
    this.rig.root.scale.setScalar(0.01);
    this.blob = world.makeBlob(this.radius * 1.6);
  }
  get dtScale() { return this.w.enemyTimeScale; }
  update(dt) {
    const w = this.w, P = w.player; this.time += dt; this.st += dt;
    if (this.flash > 0) this.flash -= dt;
    if (this.isBoss && this.time - this.lastHit > 2.5 && this.state !== 'stagger') this.poise = Math.min(this.maxPoise, this.poise + 150 * dt);
    this.coatMat.emissive.setRGB(this.flash > 0 ? 1.0 * this.flash / 0.12 : 0, 0, 0);
    if (this.state === 'dead') { this.st += 0; const s = Math.max(0, 1 - this.st / 0.9); this.rig.root.scale.setScalar(this.K.scale * 0 + Math.max(0.01, s)); if (this.st < 0.6) w.fx.aura(this.pos, 2); if (this.st > 1.0) this.remove(); this.animate(dt); return; }
    const toP = new THREE.Vector3().subVectors(P.pos, this.pos).setY(0); const dist = toP.length(); const pyaw = Math.atan2(toP.x, toP.z);
    let grav = this.juggle > 0 ? 15 : 24;
    switch (this.state) {
      case 'spawn': { const s = clamp(this.st / 0.6, 0.01, 1); this.rig.root.scale.setScalar(s); if (this.st > 0.6) this.state = 'chase'; break; }
      case 'chase': this.ai(dt, dist, pyaw, toP); break;
      case 'windup': case 'active': this.runAttack(dt, dist, pyaw); break;
      case 'recover': this.vel.x *= Math.exp(-8 * dt); this.vel.z *= Math.exp(-8 * dt); if (this.st > this.recT) { this.state = 'chase'; this.w.releaseToken(this); } break;
      case 'stagger': this.vel.x *= Math.exp(-6 * dt); this.vel.z *= Math.exp(-6 * dt); if (this.st > this.stunT) this.state = 'chase'; break;
      case 'air': this.vel.x *= Math.exp(-2 * dt); this.vel.z *= Math.exp(-2 * dt); break;
      case 'down': this.vel.x *= Math.exp(-8 * dt); this.vel.z *= Math.exp(-8 * dt); if (this.st > (this.isBoss ? 0.6 : 0.9)) { this.state = 'getup'; this.st = 0; } break;
      case 'getup': if (this.st > 0.45) { this.state = 'chase'; this.cool = Math.max(this.cool, 0.3); } break;
      case 'roar': this.vel.set(0, 0, 0); if (this.st > 1.3) { this.state = 'chase'; this.cool = 0.4; } break;
    }
    if (this.state === 'active' && this.atk && this.atk.jumping) grav = 0;
    this.vel.y -= grav * dt; this.pos.addScaledVector(this.vel, dt);
    if (this.pos.y <= 0) {
      this.pos.y = 0;
      if (this.airborne) { this.airborne = false; this.juggle = 0; if (this.vel.y < -14 && !this.isBoss) { this.vel.y = 6; this.airborne = true; this.state = 'air'; w.rings.spawn(this.pos, 2, 0.3); w.fx.blood(new THREE.Vector3(this.pos.x, 0.3, this.pos.z), new THREE.Vector3(0, 1, 0), 0.6); } else { this.vel.y = 0; if (this.state === 'air') { this.state = 'down'; this.st = 0; } } }
      else if (this.vel.y < 0) this.vel.y = 0;
    }
    if (this.juggle > 0) this.juggle -= dt;
    w.collideWorld(this.pos, this.radius);
    this.animate(dt);
  }
  ai(dt, dist, pyaw, toP) {
    const w = this.w; this.cool -= dt;
    this.yaw += angDiff(this.yaw, pyaw) * (1 - Math.exp(-6 * dt));
    let want = new THREE.Vector3();
    const P = w.player;
    if (this.isBoss) {
      const ph = this.hp / this.maxHp > 0.65 ? 1 : this.hp / this.maxHp > 0.3 ? 2 : 3;
      if (ph > this.phase) { this.phase = ph; this.state = 'roar'; this.st = 0; w.onBossPhase(this, ph); return; }
      if (dist > 3.4) want.copy(toP).normalize().multiplyScalar(this.K.speed * (ph === 3 ? 1.2 : 1));
      if (this.cool <= 0 && P.alive) {
        let a;
        if (dist < 5) a = ph === 3 && Math.random() < 0.45 ? 'spin' : 'sweep3';
        else if (dist < 11) a = ph >= 2 && Math.random() < 0.45 ? 'fan' : 'charge';
        else a = ph >= 2 ? (Math.random() < 0.6 ? 'slam' : 'fan') : 'charge';
        if (ph >= 2 && dist < 8 && Math.random() < 0.18) a = 'slam';
        this.beginAttack(a); return;
      }
    } else {
      const ranged = this.kind === 'shooter';
      const ideal = ranged ? 9 : 2.3;
      const canAtk = this.cool <= 0 && P.alive && (ranged ? dist < 15 : dist < 3.0);
      if (canAtk && w.takeToken(this)) { this.beginAttack(ranged ? 'shot' : 'slash'); return; }
      const hasTok = false;
      if (!ranged && this.cool <= 0 && dist >= 3.0) want.copy(toP).normalize().multiplyScalar(this.K.speed);
      else {
        // 环绕：保持距离并横移
        const ringD = ranged ? ideal : 4.2; const radial = (dist - ringD) * 1.2;
        const side = new THREE.Vector3(-toP.z, 0, toP.x).normalize().multiplyScalar(this.strafeDir * 1.6);
        want.copy(toP).normalize().multiplyScalar(clamp(radial, -3, 3)).add(side);
        if (Math.random() < dt * 0.3) this.strafeDir *= -1;
      }
    }
    // 互相分离
    for (const o of w.enemies) { if (o === this || !o.alive) continue; const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z, d = Math.hypot(dx, dz), m = this.radius + o.radius + 0.6; if (d < m && d > 1e-3) { want.x += dx / d * (m - d) * 6; want.z += dz / d * (m - d) * 6; } }
    const k = 1 - Math.exp(-8 * dt); this.vel.x += (want.x - this.vel.x) * k; this.vel.z += (want.z - this.vel.z) * k;
  }
  beginAttack(name) {
    const steps = ATK[name]; this.w.stats.enemyAttacks = (this.w.stats.enemyAttacks || 0) + 1; this.atk = { name, steps, i: 0, t: 0, fired: false, ticks: 0 };
    this.state = 'windup'; this.st = 0; this.startStep();
  }
  startStep() {
    const a = this.atk, s = a.steps[a.i], w = this.w; a.t = 0; a.fired = false; a.ticks = 0; a.jumping = false; this.state = 'windup';
    const P = w.player; this.yaw = Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
    a.wdur = s.w * (this.isBoss && this.phase === 3 ? 0.82 : 1) * (this.kind === 'shooter' ? 1 : 1);
    a.origin = s.at === 'target' ? P.pos.clone().setY(0) : this.pos.clone().setY(0);
    this.showDecal(s);
    w.sfx.warn();
  }
  showDecal(s) {
    const a = this.atk, w = this.w; w.decals.hide(this);
    const o = s.at === 'target' ? a.origin : this.pos;
    if (s.shape === 'sector') a.decal = w.decals.show('sector', o, this.yaw, s.r, s.arc, a.wdur, this);
    else if (s.shape === 'circle') a.decal = w.decals.show('circle', o, 0, s.r, 0, a.wdur, this);
    else a.decal = w.decals.show('rect', o, this.yaw, s.width, s.len, a.wdur, this);
  }
  runAttack(dt, dist, pyaw) {
    const a = this.atk, s = a.steps[a.i], w = this.w, P = w.player; a.t += dt;
    if (this.state === 'windup') {
      this.vel.x *= Math.exp(-10 * dt); this.vel.z *= Math.exp(-10 * dt);
      const lockAt = a.wdur - (s.aimLock ?? 0.3);
      if (a.t < lockAt && s.at !== 'target') { this.yaw += angDiff(this.yaw, pyaw) * (1 - Math.exp(-7 * dt)); if (a.decal) { a.decal.holder.rotation.y = this.yaw; a.decal.holder.position.set(this.pos.x, 0.03, this.pos.z); } }
      if (s.at === 'target' && a.t < a.wdur * 0.55) { a.origin.lerp(P.pos, 1 - Math.exp(-4 * dt)); a.origin.y = 0; a.decal.holder.position.set(a.origin.x, 0.03, a.origin.z); }
      this.wmat.emissive.setHex(0xff2030); this.wmat.emissiveIntensity = 0.3 + (this.isBoss ? 0.9 : 1.6) * (a.t / a.wdur);
      if (s.jump && a.t > a.wdur - 0.55 && !a.jumping) { a.jumping = true; const T = 0.55; this.vel.set((a.origin.x - this.pos.x) / T, 0, (a.origin.z - this.pos.z) / T); this.vel.y = 0; a.jumpT = 0; }
      if (a.jumping) { a.jumpT += dt; const T = 0.55, u = clamp(a.jumpT / T, 0, 1); this.pos.y = Math.sin(u * Math.PI) * 4.5; this.vel.y = 0; if (u >= 1) { this.vel.set(0, 0, 0); this.pos.y = 0; } }
      if (a.t >= a.wdur) {
        this.state = 'active'; a.t = 0; this.wmat.emissiveIntensity = this.isBoss ? 1.2 : 2;
        if (s.lunge) { const f = this.forward(); this.vel.x = f.x * s.lunge / 0.12; this.vel.z = f.z * s.lunge / 0.12; }
        if (s.dash) { const f = this.forward(); this.vel.x = f.x * s.dash; this.vel.z = f.z * s.dash; }
        if (s.jump) { this.pos.y = 0; this.vel.set(0, 0, 0); a.jumping = false; }
      }
      return;
    }
    // active
    const act = s.dashT || s.act || 0.12;
    if (s.dash) { const f = this.forward(); this.vel.x = f.x * s.dash; this.vel.z = f.z * s.dash; if (!a.fired && w.enemyStrike(this, { shape: 'circle', r: this.radius + 1.0, dmg: s.dmg, kb: 9 }, this.pos, this.yaw)) a.fired = true; }
    else if (s.ticks) { if (a.t >= a.ticks * s.tickGap && a.ticks < s.ticks) { a.ticks++; w.enemyStrike(this, s, this.pos, this.yaw); w.rings.spawn(this.pos, s.r, 0.25, 0xff4060); } }
    else if (!a.fired) {
      a.fired = true;
      if (s.proj) w.enemyShoot(this, s.proj);
      else { const o = s.at === 'target' ? a.origin : this.pos; w.enemyStrike(this, s, o, this.yaw); if (s.ring) w.rings.spawn(o, s.ring, 0.4, 0xff3050); }
    }
    if (s.lunge) { this.vel.x *= Math.exp(-14 * dt); this.vel.z *= Math.exp(-14 * dt); }
    if (a.t >= act) {
      this.wmat.emissive.setHex(0x40b0ff); this.wmat.emissiveIntensity = 0.2;
      if (s.dash) { this.vel.x *= 0.15; this.vel.z *= 0.15; }
      a.i++;
      if (a.i < a.steps.length) this.startStep();
      else { this.state = 'recover'; this.st = 0; this.recT = this.isBoss ? (this.phase === 3 ? 0.65 : 0.95) : 0.7; this.cool = this.isBoss ? 0.6 + Math.random() * 0.8 : 1.6 + Math.random() * 1.8; this.w.decals.hide(this); }
    }
  }
  forward() { return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  interrupt() { if (this.atk) { this.w.decals.hide(this); this.atk = null; this.wmat.emissive.setHex(0x40b0ff); this.wmat.emissiveIntensity = 0.2; this.w.releaseToken(this); } }
  // 受击
  takeHit(hit, dir, dmg) {
    if (!this.alive || this.state === 'spawn') return false;
    if (this.state === 'roar') dmg *= 0.2;
    this.hp -= dmg; this.flash = 0.12; this.lastHit = this.time;
    if (this.hp <= 0) { this.die(); return true; }
    if (this.isBoss) {
      this.poise -= dmg * (hit.poise || 1);
      const broke = this.poise <= 0 && this.state !== 'stagger';
      if (broke) { this.poise = this.maxPoise; this.interrupt(); this.state = 'stagger'; this.st = 0; this.stunT = 2.0; this.w.onBossBreak(this); }
      if (this.state === 'stagger' && hit.up) { this.vel.y = Math.min(hit.up * 0.45, 5); this.airborne = true; }
      this.vel.x += dir.x * (hit.kb || 0) * 0.15; this.vel.z += dir.z * (hit.kb || 0) * 0.15;
      return true;
    }
    this.interrupt();
    this.vel.x = dir.x * (hit.kb || 2); this.vel.z = dir.z * (hit.kb || 2);
    if (hit.slamDown && this.airborne) { this.vel.y = -22; }
    else if (hit.up) { this.vel.y = Math.max(this.airborne ? this.vel.y : 0, hit.up); this.airborne = true; this.juggle = 1.2; this.state = 'air'; this.st = 0; }
    else if (this.airborne) { this.vel.y = Math.max(this.vel.y, 2.2); this.juggle = 0.8; this.state = 'air'; }
    else { this.state = 'stagger'; this.st = 0; this.stunT = hit.stun || 0.35; }
    return true;
  }
  die() {
    this.alive = false; this.state = 'dead'; this.st = 0; this.interrupt(); this.w.onEnemyDead(this);
    this.vel.set(0, 3, 0);
  }
  remove() { this.removed = true; this.w.scene.remove(this.rig.root); this.blob.parent?.remove(this.blob); }
  animate(dt) {
    const rig = this.rig; rig.root.position.copy(this.pos); rig.root.rotation.y = this.yaw;
    this.blob.position.set(this.pos.x, 0.03, this.pos.z); this.blob.material.opacity = 0.55 * Math.max(0.2, 1 - this.pos.y / 5);
    let pose, k = 1 - Math.exp(-14 * dt);
    const hs = Math.hypot(this.vel.x, this.vel.z);
    switch (this.state) {
      case 'chase': case 'spawn': if (hs > 0.5) { this.runPh = (this.runPh || 0) + dt * (5 + hs * 1.4); pose = Poses.run(this.runPh, hs / 5); } else pose = Poses.idle(this.time, 1); break;
      case 'windup': { const a = this.atk; const p = clamp(a.t / a.wdur, 0, 1); pose = Poses.windup(p); k = 1 - Math.exp(-10 * dt); break; }
      case 'active': pose = this.atk && this.atk.steps[this.atk.i]?.ticks ? Poses.spin() : Poses.slash(1, 1); k = 1 - Math.exp(-40 * dt); if (this.atk?.steps[this.atk.i]?.ticks) rig.body.rotation.y += dt * 18; break;
      case 'recover': pose = Poses.slash(1, 1); pose.spine[0] += 0.3; k = 1 - Math.exp(-6 * dt); break;
      case 'stagger': pose = Poses.hurt(); k = 1 - Math.exp(-30 * dt); break;
      case 'air': pose = Poses.launched(); break;
      case 'down': case 'dead': pose = Poses.down(); k = 1 - Math.exp(-12 * dt); break;
      case 'getup': pose = Poses.idle(this.time, 0.5); pose.py = 0.6; k = 1 - Math.exp(-10 * dt); break;
      case 'roar': pose = Poses.ult(1); break;
      default: pose = Poses.idle(this.time, 1);
    }
    if (this.state !== 'active') rig.body.rotation.y *= Math.exp(-20 * dt);
    applyPose(rig, pose, k);
  }
}
export { KINDS };
