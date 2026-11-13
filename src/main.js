// 赤骸夜行 · 战斗原型 —— 主循环、战斗结算、波次、调试钩子
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Input } from './input.js';
import { CameraRig, angDiff } from './camera.js';
import { buildCity, BOUNDS } from './city.js';
import { Player } from './player.js';
import { Enemy } from './enemy.js';
import { HitFX, Ghosts, Decals, Rings } from './fx.js';
import { Sfx } from './audio.js';
import { Hud } from './hud.js';
import { N, TYPES } from './names.js';

const Q_LABEL = { high: '高', mid: '中', low: '低' };
const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
const params = new URLSearchParams(location.search);
const isTouch = params.get('touch') === '1' || (params.get('touch') !== '0' && (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

class World {
  constructor() {
    this.quality = params.get('q') || store.get('ghoul_quality') || (isTouch ? 'mid' : 'high');
    if (!Q_LABEL[this.quality]) this.quality = 'mid';
    const canvas = document.getElementById('c');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.15;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 160);
    this.input = new Input(canvas); if (isTouch) { this.input.bindTouch(document.getElementById('touch')); this.input.noPointerLock = true; }
    if (params.get('nolock') === '1') this.input.noPointerLock = true;
    this.cam = new CameraRig(this.camera);
    // 角色补光：跟随相机方向的柔光 + 主角头顶冷色轮廓光（只是照明，与相机抖动无关）
    this.fill = new THREE.DirectionalLight(0xffe0e8, 1.3); this.scene.add(this.fill); this.scene.add(this.fill.target);
    this.rim = new THREE.PointLight(0xff4060, 3, 5, 1.6); this.scene.add(this.rim);
    this.sfx = new Sfx();
    this.city = buildCity(this.scene, this.quality);
    this.fx = new HitFX(this.scene, this.quality); this.ghosts = new Ghosts(this.scene, 10); this.decals = new Decals(this.scene, 18); this.rings = new Rings(this.scene, 12);
    this.enemies = []; this.tokens = new Set(); this.maxTokens = 2;
    this.time = 0; this.realTime = 0; this.hitstopT = 0; this.btT = 0; this.btScale = 0.2; this.btBlend = 0; this.enemyTimeScale = 1; this.playerTimeScale = 1;
    this.stats = { hits: 0, kills: 0, perfect: 0, dodges: 0, switches: 0, moves: {}, damageTaken: 0, shards: 0, maxCombo: 0, parries: 0, awakens: 0, finishers: 0 };
    this.hud = new Hud(this);
    this.player = new Player(this); this.hud.flashType(this.player.typeIdx);
    this.playerBlob = this.makeBlob(0.8);
    this.cam.snap(this.player); this.cam.yaw = Math.PI / 2 + Math.PI; this.cam.yaw = -Math.PI / 2;
    this._initProjectiles();
    this._initRender();
    this.wave = -1; this.waveT = 1.0; this.paused = true; this.over = false;
    this.camLog = null; this.fpsHist = []; this._fpsAcc = 0; this._fpsN = 0; this.fps = 0;
    this.input.onPress((a) => this.onAction(a));
    addEventListener('resize', () => this.resize()); this.resize();
    this._ui();
    this.last = performance.now();
    this.renderer.setAnimationLoop((t) => this.frame(t));
  }
  _initRender() {
    const q = this.quality; const r = this.renderer;
    const dpr = q === 'high' ? Math.min(devicePixelRatio, 2) : q === 'mid' ? Math.min(devicePixelRatio, 1.5) : 1;
    r.setPixelRatio(dpr);
    if (this.composer) { this.composer.dispose?.(); this.composer = null; }
    if (q !== 'low') {
      const rt = new THREE.WebGLRenderTarget(innerWidth * dpr, innerHeight * dpr, { type: THREE.HalfFloatType, samples: q === 'high' ? 4 : 0 });
      this.composer = new EffectComposer(r, rt); this.composer.setPixelRatio(dpr);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth * (q === 'high' ? 1 : 0.5), innerHeight * (q === 'high' ? 1 : 0.5)), 0.85, 0.55, 0.62);
      this.composer.addPass(this.bloom); this.composer.addPass(new OutputPass());
    }
    document.getElementById('btnQuality').textContent = '画质：' + Q_LABEL[q];
    this.resize();
  }
  setQuality(q) { this.quality = q; store.set('ghoul_quality', q); this._initRender(); }
  resize() {
    const w = innerWidth, h = innerHeight; this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false); if (this.composer) this.composer.setSize(w, h);
    this.fx.setScale(h * this.renderer.getPixelRatio() * 0.9);
  }
  makeBlob(r) {
    if (!this._blobTex) { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,0.9)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); this._blobTex = new THREE.CanvasTexture(cv); }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: this._blobTex, transparent: true, depthWrite: false, opacity: 0.55 }));
    m.rotation.x = -Math.PI / 2; this.scene.add(m); return m;
  }
  _ui() {
    const ov = document.getElementById('overlay');
    const start = () => { if (this.over) { location.reload(); return; } ov.classList.add('hidden'); this.paused = false; this.sfx.unlock(); if (!isTouch && !this.input.noPointerLock) this.renderer.domElement.requestPointerLock?.(); };
    document.getElementById('btnStart').addEventListener('click', start);
    document.getElementById('btnHelp').addEventListener('pointerdown', (e) => { e.stopPropagation(); ov.classList.remove('hidden'); this.paused = true; document.exitPointerLock?.(); document.getElementById('btnStart').textContent = this.started ? '继续' : '开始'; });
    document.getElementById('btnPause').addEventListener('pointerdown', (e) => { e.stopPropagation(); this.paused = !this.paused; e.target.textContent = this.paused ? '继续' : '暂停'; });
    document.getElementById('btnQuality').addEventListener('pointerdown', (e) => { e.stopPropagation(); const order = ['high', 'mid', 'low']; this.setQuality(order[(order.indexOf(this.quality) + 1) % 3]); });
    addEventListener('pointerdown', () => this.sfx.unlock(), { once: false, passive: true });
    addEventListener('keydown', (e) => { this.sfx.unlock(); if (e.code === 'KeyP') { this.paused = !this.paused; } if (e.code === 'Backquote') document.getElementById('fps').classList.toggle('hidden'); });
    if (params.get('autostart') === '1') { ov.classList.add('hidden'); this.paused = false; }
    document.addEventListener('gesturestart', (e) => e.preventDefault());
  }
  onAction(a) {
    if (this.paused) return;
    if (a === 'lock') { if (this.cam.lockTarget) this.cam.lockTarget = null; else this.cam.lockTarget = this.bestLock(); }
    if (a === 'cycle') this.cycleLock();
  }
  bestLock(exclude) {
    const f = this.cam.forward(); const p = this.player.pos; let best = null, bs = 1e9;
    for (const e of this.enemies) { if (!e.alive || e === exclude) continue; const dx = e.pos.x - p.x, dz = e.pos.z - p.z, d = Math.hypot(dx, dz); if (d > 28) continue; const ang = Math.acos(clamp((dx * f.x + dz * f.z) / (d + 1e-5), -1, 1)); const s = d * 0.15 + ang * 2 - (e.isBoss ? 0.6 : 0); if (s < bs) { bs = s; best = e; } }
    return best;
  }
  cycleLock() {
    const p = this.player.pos; const list = this.enemies.filter((e) => e.alive && e.pos.distanceTo(p) < 28);
    if (!list.length) { this.cam.lockTarget = null; return; }
    const base = this.cam.yaw; list.sort((a, b) => angDiff(base, Math.atan2(-(a.pos.x - p.x), -(a.pos.z - p.z))) - angDiff(base, Math.atan2(-(b.pos.x - p.x), -(b.pos.z - p.z))));
    const i = list.indexOf(this.cam.lockTarget); this.cam.lockTarget = list[(i + 1) % list.length];
  }
  // ---------- 投射物 ----------
  _initProjectiles() {
    const sg = new THREE.OctahedronGeometry(0.12, 0); sg.scale(0.7, 0.7, 3.2);
    const smat = new THREE.MeshStandardMaterial({ color: 0x400010, emissive: 0xff3a6a, emissiveIntensity: 3, roughness: 0.2, metalness: 0.4 });
    this.shards = Array.from({ length: 48 }, () => { const m = new THREE.Mesh(sg, smat); m.visible = false; this.scene.add(m); return { m, on: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, dmg: 0, homing: 0, target: null }; });
    const bg = new THREE.CylinderGeometry(0.06, 0.06, 1.1, 5); bg.rotateX(Math.PI / 2);
    const bmat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 1.6, 2.4), toneMapped: false });
    this.bolts = Array.from({ length: 24 }, () => { const m = new THREE.Mesh(bg, bmat); m.visible = false; this.scene.add(m); return { m, on: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, dmg: 0, owner: null, grazed: false }; });
  }
  fireShards(pl, pd) {
    const tgt = pl.target && pl.target.alive ? pl.target : pl.pickTarget(18);
    let baseYaw = pl.yaw; let pitch = 0;
    const src = new THREE.Vector3(); const tips = pl.tendrils.ranged.map((t) => t.tip());
    if (tgt) { const dx = tgt.pos.x - pl.pos.x, dz = tgt.pos.z - pl.pos.z; baseYaw = Math.atan2(dx, dz); pitch = Math.atan2((tgt.pos.y + tgt.height * 0.5) - (pl.pos.y + 1.6), Math.hypot(dx, dz)); }
    for (let i = 0; i < pd.n; i++) {
      const s = this.shards.find((x) => !x.on); if (!s) return;
      const yaw = pd.spread >= 360 ? baseYaw + i / pd.n * Math.PI * 2 : baseYaw + (pd.n > 1 ? (i / (pd.n - 1) - 0.5) * pd.spread * Math.PI / 180 : 0);
      const sp = pd.speed || 26;
      if (pl.type === 'ranged' && tips.length) src.copy(tips[(this.stats.shards + i) % tips.length]); else src.copy(pl.pos).setY(pl.pos.y + 1.5);
      s.pos.copy(src); s.vel.set(Math.sin(yaw) * Math.cos(pitch) * sp, Math.sin(pitch) * sp, Math.cos(yaw) * Math.cos(pitch) * sp);
      s.life = 1.1; s.dmg = pd.dmg * pl.dmgMul; s.homing = pd.homing ? 9 : 2.5; s.target = tgt; s.on = true; s.m.visible = true; this.stats.shards++;
    }
    this.sfx.shard();
  }
  enemyShoot(e, pr) {
    const P = this.player; const o = new THREE.Vector3(e.pos.x, 1.3 * e.K.scale, e.pos.z); const yaw0 = e.yaw;
    for (let i = 0; i < pr.n; i++) {
      const b = this.bolts.find((x) => !x.on); if (!b) return;
      const yaw = yaw0 + (pr.n > 1 ? (i / (pr.n - 1) - 0.5) * pr.spread * Math.PI / 180 : 0);
      b.pos.copy(o); b.vel.set(Math.sin(yaw) * pr.speed, 0, Math.cos(yaw) * pr.speed); b.vel.y = ((P.pos.y + 1.0) - o.y) / Math.max(1, e.pos.distanceTo(P.pos)) * pr.speed;
      b.life = 1.6; b.dmg = pr.dmg; b.owner = e; b.on = true; b.m.visible = true;
    }
  }
  updateProjectiles(pdt, edt) {
    for (const s of this.shards) {
      if (!s.on) continue; s.life -= pdt;
      if (s.target && s.target.alive && s.homing) { const want = new THREE.Vector3(s.target.pos.x, s.target.pos.y + s.target.height * 0.5, s.target.pos.z).sub(s.pos).normalize().multiplyScalar(s.vel.length()); s.vel.lerp(want, 1 - Math.exp(-s.homing * pdt)); }
      s.pos.addScaledVector(s.vel, pdt); s.m.position.copy(s.pos); s.m.lookAt(s.pos.x + s.vel.x, s.pos.y + s.vel.y, s.pos.z + s.vel.z);
      let hit = null;
      for (const e of this.enemies) { if (!e.alive) continue; const dy = s.pos.y - (e.pos.y + e.height * 0.5); const dx = s.pos.x - e.pos.x, dz = s.pos.z - e.pos.z; if (dx * dx + dz * dz < (e.radius + 0.35) ** 2 && Math.abs(dy) < e.height * 0.6) { hit = e; break; } }
      if (hit) { this.applyHit(hit, { dmg: s.dmg, kb: 1.2, stun: 0.22, hs: 0.018, poise: 0.6 }, s.dmg, s.vel.clone().setY(0).normalize(), 0.5); this.fx.burst(s.pos, [1, 0.3, 0.5], 10, 4, 0.07); s.on = false; s.m.visible = false; continue; }
      if (s.life <= 0 || s.pos.y < 0) { if (s.pos.y < 0) this.fx.burst(s.pos, [1, 0.3, 0.5], 6, 3, 0.06); s.on = false; s.m.visible = false; }
    }
    const P = this.player;
    for (const b of this.bolts) {
      if (!b.on) continue; b.life -= edt; b.pos.addScaledVector(b.vel, edt); b.m.position.copy(b.pos); b.m.lookAt(b.pos.x + b.vel.x, b.pos.y + b.vel.y, b.pos.z + b.vel.z);
      const dx = b.pos.x - P.pos.x, dz = b.pos.z - P.pos.z, dy = b.pos.y - (P.pos.y + 0.9);
      const early = P.state === 'dodge' && P.dodgeT <= 0.26; const rr = 0.5 + (early ? 1.1 : 0);
      if (dx * dx + dz * dz < rr * rr && Math.abs(dy) < 1.1) {
        const r = P.receive(b.dmg, b.owner, { kb: 3 });
        if (r === 'hit') this.playerHitFX(b.pos); if (r === 'block' || r === 'parry') this.fx.burst(b.pos, [0.6, 0.9, 1], 14, 5, 0.06);
        if (r !== 'evade' && r !== 'perfect') { b.on = false; b.m.visible = false; continue; }
      }
      if (b.life <= 0) { b.on = false; b.m.visible = false; }
    }
  }
  // ---------- 战斗结算 ----------
  playerStrike(pl, hd, move) {
    const yaw = pl.yaw; let any = false, maxHs = 0, first = null;
    const mul = pl.awake > 0 ? 1.6 : 1;
    for (const e of this.enemies) {
      if (!e.alive || e.state === 'spawn') continue;
      const rx = e.pos.x - pl.pos.x, rz = e.pos.z - pl.pos.z; const d = Math.hypot(rx, rz);
      if (d - e.radius > hd.range) continue;
      if (!hd.homingAll && d > 0.4) { const ang = Math.abs(angDiff(yaw, Math.atan2(rx, rz))); if (ang > hd.arc + Math.atan2(e.radius, d)) continue; }
      const dy = e.pos.y - pl.pos.y; if (dy > hd.y1 || dy + e.height < hd.y0) continue;
      const dir = d > 0.01 ? new THREE.Vector3(rx / d, 0, rz / d) : pl.forward(new THREE.Vector3()).clone();
      const dmg = hd.dmg * mul * (0.92 + Math.random() * 0.16);
      this.applyHit(e, hd, dmg, dir, (hd.hs || 0.05) * 14);
      if (move.heal) { const h = dmg * move.heal; pl.hp = Math.min(pl.maxHp, pl.hp + h); if (h >= 1) this.hud.dmg(new THREE.Vector3(pl.pos.x, pl.pos.y + 2.1, pl.pos.z), h, 'heal'); }
      any = true; maxHs = Math.max(maxHs, hd.hs || 0.05); if (!first) first = e;
    }
    if (hd.ring) { this.rings.spawn(pl.pos, hd.ring, 0.35); this.fx.burst(new THREE.Vector3(pl.pos.x, 0.2, pl.pos.z), [1, 0.1, 0.15], 24, 7, 0.09); }
    if (hd.boom) this.fx.burst(pl.forward(new THREE.Vector3()).clone().multiplyScalar(2).add(pl.pos).setY(pl.pos.y + 1), [1, 0.3, 0.2], 40, 9, 0.12);
    if (any) {
      this.hitstop(maxHs * (pl.awake > 0 ? 1.15 : 1));
      if (hd.launch && first) { pl.chaseT = 0.9; pl.target = first; }
      if (move.finisher) this.stats.finishers++;
    }
    return any;
  }
  applyHit(e, hd, dmg, dir, power) {
    if (!e.takeHit(hd, dir, dmg)) return;
    const p = new THREE.Vector3(e.pos.x, e.pos.y + e.height * 0.55, e.pos.z);
    this.fx.blood(p, dir, Math.min(2, 0.5 + power * 0.6));
    this.hud.dmg(p.clone().setY(p.y + 0.4), dmg, dmg > 45 ? 'big' : '');
    this.hud.addCombo(); this.stats.hits++; this.stats.maxCombo = Math.max(this.stats.maxCombo, this.hud.combo);
    this.player.addEnergy(2 + dmg * 0.07);
    this.sfx.hit(Math.min(1.6, 0.5 + dmg / 40));
  }
  hitstop(s) { this.hitstopT = Math.max(this.hitstopT, Math.min(0.35, s)); }
  bulletTime(dur, scale = 0.2) {
    this.btT = Math.max(this.btT, dur); this.btScale = scale; this.stats.bulletTimes = (this.stats.bulletTimes || 0) + 1; this.btStarted = this.realTime;
    this.sfx.slow(); const f = document.getElementById('btflash'); f.style.transition = 'none'; f.style.opacity = 1; requestAnimationFrame(() => { f.style.transition = 'opacity .5s'; f.style.opacity = 0; });
    if (scale >= 0.2) this.hud.banner('瞬影', '子弹时间 · 立刻攻击反击', 0.9);
    this.rings.spawn(this.player.pos, 3.5, 0.5, 0xff6080, 1.0);
  }
  enemyStrike(e, s, origin, yaw) {
    const P = this.player; if (!P.alive) return false;
    const early = P.state === 'dodge' && P.dodgeT <= 0.26 && !P.perfectUsed; const pr = P.radius + (early ? 1.3 : 0);
    if (P.pos.y > (s.shape === 'circle' && s.r > 4 ? 1.6 : 2.4)) return false;
    const rx = P.pos.x - origin.x, rz = P.pos.z - origin.z, d = Math.hypot(rx, rz);
    let inside = false;
    if (s.shape === 'sector') inside = d <= s.r + pr && (d < 0.5 || Math.abs(angDiff(yaw, Math.atan2(rx, rz))) <= s.arc + Math.atan2(pr, d));
    else if (s.shape === 'circle') inside = d <= s.r + pr;
    else { const fx = Math.sin(yaw), fz = Math.cos(yaw); const al = rx * fx + rz * fz, lat = Math.abs(rx * fz - rz * fx); inside = al >= -pr && al <= s.len + pr && lat <= s.width / 2 + pr; }
    if (!inside) return false;
    const r = P.receive(s.dmg, e, { kb: s.kb || 5 });
    if (r === 'hit') this.playerHitFX(new THREE.Vector3(P.pos.x, P.pos.y + 1.1, P.pos.z));
    if (r === 'block') { this.fx.burst(new THREE.Vector3(P.pos.x, P.pos.y + 1.1, P.pos.z), [1, 0.7, 0.4], 18, 6, 0.07); }
    return r === 'hit' || r === 'block' || r === 'parry';
  }
  playerHitFX(p) { this.fx.blood(p, new THREE.Vector3(0, 0.3, 0), 0.8); this.hitstop(0.06); }
  onPlayerHurt(d) { this.sfx.hurt(); const v = document.getElementById('vignette'); v.classList.add('on'); clearTimeout(this._vt); this._vt = setTimeout(() => { if (!(this.btT > 0 || this.player.awake > 0)) v.classList.remove('on'); }, 220); }
  onParry(e) { this.stats.parries++; this.sfx.block(); this.hitstop(0.14); this.player.addEnergy(12); this.fx.burst(new THREE.Vector3(this.player.pos.x, 1.2, this.player.pos.z), [1, 0.8, 0.5], 30, 8, 0.08); this.hud.banner('完美格挡', '磐盾 · 反震', 0.8);
    if (e.isBoss) { e.poise -= 160; if (e.poise <= 0) { e.poise = e.maxPoise; e.interrupt(); e.state = 'stagger'; e.st = 0; e.stunT = 2.4; } } else { e.interrupt(); e.state = 'stagger'; e.st = 0; e.stunT = 1.2; } }
  onBlock(e) { this.sfx.block(); this.hitstop(0.05); }
  onPlayerDead() { this.hud.banner('凌夜 倒下了', '', 2.5); this.over = true; setTimeout(() => this.showEnd('凌夜 倒下了'), 1800); }
  showEnd(t) { const ov = document.getElementById('overlay'); ov.classList.remove('hidden'); document.querySelector('#helpPanel h1').textContent = t; document.getElementById('btnStart').textContent = '再来一局'; this.paused = true; document.exitPointerLock?.(); }
  onEnemyDead(e) { this.stats.kills++; this.tokens.delete(e); this.fx.blood(new THREE.Vector3(e.pos.x, e.pos.y + 1, e.pos.z), new THREE.Vector3(0, 1, 0), 2); if (this.cam.lockTarget === e) this.cam.lockTarget = this.bestLock(e); if (e.isBoss) this.onVictory(); }
  onBossPhase(b, ph) { this.hud.banner(ph === 2 ? '猎械解放' : '狂猎', N.bossShort + ' · 第' + (ph === 2 ? '二' : '三') + '阶段', 1.4); this.rings.spawn(b.pos, 7, 0.6, 0xa0d0ff); this.sfx.awaken();
    if (ph === 2) { this.spawn('grunt', b.pos.x + 4, -5); this.spawn('grunt', b.pos.x + 4, 5); }
    const P = this.player; const dx = P.pos.x - b.pos.x, dz = P.pos.z - b.pos.z, d = Math.hypot(dx, dz); if (d < 6 && d > 0.01) { P.vel.x += dx / d * 12; P.vel.z += dz / d * 12; } }
  onBossBreak(b) { this.hud.banner('破防', '尽情连击！', 0.9); this.hitstop(0.16); this.rings.spawn(b.pos, 3, 0.4, 0xffc040, 1.2); }
  onAwaken() {
    this.stats.awakens++; this.sfx.awaken(); this.hud.banner(N.awaken, '血绫覆体 · 伤害提升 · 再按释放「终焉」', 1.6); this.bulletTime(0.6, 0.12);
    this.rings.spawn(this.player.pos, 7, 0.6, 0xff1040); this.fx.burst(new THREE.Vector3(this.player.pos.x, 1.2, this.player.pos.z), [1, 0.05, 0.2], 60, 10, 0.12);
    for (const e of this.enemies) { if (!e.alive) continue; const d = e.pos.distanceTo(this.player.pos); if (d < 7) { const dir = e.pos.clone().sub(this.player.pos).setY(0).normalize(); this.applyHit(e, { kb: 10, stun: 0.8, up: e.isBoss ? 0 : 4 }, 25, dir, 1); } }
    document.getElementById('vignette').classList.add('on');
  }
  onAwakenEnd() { document.getElementById('vignette').classList.remove('on'); }
  onVictory() { this.over = true; this.hud.objective('夜幕已清'); setTimeout(() => this.hud.banner('夜幕已清', N.bossShort + ' 已被击败 · 本局最高连击 ' + this.stats.maxCombo, 4), 900); if (!params.has('autostart')) setTimeout(() => this.showEnd('夜幕已清'), 5200); this.bulletTime(1.2, 0.15); }
  takeToken(e) { if (this.tokens.has(e)) return true; for (const t of this.tokens) if (!t.alive) this.tokens.delete(t); if (this.tokens.size >= this.maxTokens) return false; this.tokens.add(e); return true; }
  releaseToken(e) { this.tokens.delete(e); }
  collideWorld(p, r) {
    p.x = clamp(p.x, BOUNDS.x0 - 4, BOUNDS.x1 + 4); p.z = clamp(p.z, BOUNDS.z0, BOUNDS.z1);
    for (const o of this.city.props) { const dx = p.x - o.x, dz = p.z - o.z; const ox = o.hw + r - Math.abs(dx), oz = o.hd + r - Math.abs(dz); if (ox > 0 && oz > 0 && p.y < 1.4) { if (ox < oz) p.x += Math.sign(dx) * ox; else p.z += Math.sign(dz) * oz; } }
  }
  spawn(kind, x, z) { const e = new Enemy(this, kind, x, z); this.enemies.push(e); return e; }
  // ---------- 波次 ----------
  updateWaves(dt) {
    if (this.over) return;
    const alive = this.enemies.filter((e) => e.alive);
    if (this.wave >= 0 && alive.length === 0 && this.waveT <= 0) this.waveT = 1.6;
    if (this.waveT > 0) { this.waveT -= dt; if (this.waveT <= 0) this.nextWave(); }
  }
  nextWave() {
    this.wave++; const px = this.player.pos.x;
    if (this.wave === 0) { this.hud.objective('目标：击退白鸦局巡夜员（1/3）'); for (const [x, z] of [[-18, -3], [-16, 3], [-14, 0]]) this.spawn('grunt', x, z); this.hud.banner(N.district, N.org + ' 的猎人出现了', 1.6); }
    else if (this.wave === 1) { this.hud.objective('目标：清除增援（2/3）'); for (const [x, z] of [[px + 9, -4], [px + 10, 4], [px + 12, 0]]) this.spawn('grunt', x, z); this.spawn('shooter', px + 17, -6); this.spawn('shooter', px + 17, 6); this.maxTokens = 2; this.hud.banner('增援', '弩手会从远处射击 · 看地面红线闪避', 1.6); }
    else if (this.wave === 2) { this.hud.objective('目标：击败 ' + N.boss + '（3/3）'); const b = this.spawn('boss', Math.min(30, px + 14), 0); this.hud.banner(N.bossShort, N.boss, 2.0); }
  }
  // ---------- 主循环 ----------
  frame(now) {
    let realDt = (now - this.last) / 1000; this.last = now; if (realDt > 0.1) realDt = 0.1; if (realDt <= 0) realDt = 0.001;
    this._fpsAcc += realDt; this._fpsN++; if (this._fpsAcc >= 0.5) { this.fps = this._fpsN / this._fpsAcc; this.fpsHist.push(this.fps); if (this.fpsHist.length > 240) this.fpsHist.shift(); this._fpsAcc = 0; this._fpsN = 0; document.getElementById('fps').textContent = this.fps.toFixed(0) + ' fps · ' + Q_LABEL[this.quality]; }
    if (!this.paused && !this.manual) this.step(Math.min(realDt, 0.05));
    this.render();
  }
  step(realDt) {
    this.realTime += realDt; this.input.update(this.realTime);
    let hs = 1; if (this.hitstopT > 0) { this.hitstopT -= realDt; hs = 0.04; }
    if (this.btT > 0) this.btT -= realDt;
    const btOn = this.btT > 0; this.btBlend += ((btOn ? 1 : 0) - this.btBlend) * (1 - Math.exp(-(btOn ? 30 : 8) * realDt));
    this.enemyTimeScale = 1 + (this.btScale - 1) * this.btBlend; this.playerTimeScale = 1 + (0.8 - 1) * this.btBlend * (this.btScale < 0.2 ? 0.5 : 1);
    const v = document.getElementById('vignette'); if (btOn) v.classList.add('on'); else if (this.player.awake <= 0 && this._btWasOn) v.classList.remove('on'); this._btWasOn = btOn;
    const pdt = realDt * hs * this.playerTimeScale, edt = realDt * hs * this.enemyTimeScale, fxdt = realDt * (hs < 1 ? 0.3 : 1) * (0.5 + 0.5 * this.enemyTimeScale);
    this.time += pdt;
    const look = this.input.takeLook(); this.cam.input(look.dx, look.dy, isTouch);
    this.player.update(pdt, realDt);
    for (const e of this.enemies) e.update(edt);
    this.enemies = this.enemies.filter((e) => !e.removed);
    if (this.cam.lockTarget && !this.cam.lockTarget.alive) this.cam.lockTarget = this.bestLock();
    this.updateProjectiles(pdt, edt);
    this.fx.update(fxdt); this.ghosts.update(realDt); this.decals.update(edt); this.rings.update(fxdt);
    if (this.player.awake > 0) this.fx.aura(this.player.pos, 1);
    this.playerBlob.position.set(this.player.pos.x, 0.03, this.player.pos.z);
    this.cam.update(realDt, this.player);
    this.fill.position.copy(this.camera.position).add(new THREE.Vector3(0, 3, 0)); this.fill.target.position.copy(this.cam.focus);
    this.rim.position.set(this.player.pos.x, this.player.pos.y + 2.6, this.player.pos.z); this.rim.intensity = this.player.awake > 0 ? 8 : 3;
    this.city.update(realDt, this.realTime, this.cam.focus);
    this.updateWaves(realDt);
    this.hud.update(realDt);
    if (this.camLog) { const c = this.camera; this.camLog.push([c.position.x, c.position.y, c.position.z, c.quaternion.x, c.quaternion.y, c.quaternion.z, c.quaternion.w, c.fov, c.up.x, c.up.y, c.up.z, realDt, this.hitstopT > 0 ? 1 : 0]); }
    this.started = true;
  }
  render() { if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera); }
}

const world = new World();
window.__world = world;
addEventListener('keydown', (e) => { if (e.code === 'KeyR' && world.over) location.reload(); });
// ---------- 调试钩子（自动化测试用） ----------
window.__dbg = {
  ready: true,
  state() { const P = world.player; return { player: { state: P.state, hp: P.hp, energy: P.energy, awake: P.awake, type: P.type, typeIdx: P.typeIdx, pos: P.pos.toArray(), grounded: P.grounded, move: P.moveId, tendrilsVisible: Object.fromEntries(Object.entries(P.tendrils).map(([k, v]) => [k, v.filter((t) => t.mesh.visible).length])), armor: P.armorParts.filter((m) => m.visible).length, wrap: P.wrap.filter((t) => t.mesh.visible).length },
    enemies: world.enemies.map((e) => ({ id: e.id, kind: e.kind, hp: e.hp, alive: e.alive, state: e.state, pos: e.pos.toArray(), phase: e.phase, airborne: e.airborne })), bt: world.btT, btScale: world.enemyTimeScale, hitstop: world.hitstopT, fps: world.fps, stats: world.stats, wave: world.wave, over: world.over, combo: world.hud.combo, quality: world.quality, lock: world.cam.lockTarget ? world.cam.lockTarget.id : null }; },
  press(a) { world.input.press(a); }, release(a) { world.input.release(a); },
  move(x, y) { world.input.virtual = { x, y, active: !!(x || y) }; },
  setType(i) { return world.player.setType(i); }, fillEnergy() { world.player.energy = 100; }, god(b = true) { world.player.god = b; },
  killAll(includeBoss = false) { for (const e of world.enemies) if (e.alive && (includeBoss || !e.isBoss)) { e.hp = 1; world.applyHit(e, { dmg: 1, kb: 1 }, 5, new THREE.Vector3(1, 0, 0), 1); } },
  spawn(k, x, z) { return world.spawn(k, x, z).id; },
  clearEnemies() { for (const e of world.enemies) e.remove(); world.enemies = []; world.tokens.clear(); },
  wave(n) { this.clearEnemies(); world.wave = n - 1; world.waveT = 0; world.nextWave(); },
  noWaves(b = true) { world._noWaves = b; if (b) world.updateWaves = () => {}; },
  teleport(x, z) { world.player.pos.set(x, 0, z); world.cam.snap(world.player); },
  start() { document.getElementById('overlay').classList.add('hidden'); world.paused = false; },
  boss() { return world.enemies.find((e) => e.isBoss); },
  bossDamage(d) { const b = this.boss(); if (!b) return null; world.applyHit(b, { dmg: d, kb: 0 }, d, new THREE.Vector3(1, 0, 0), 1); return { hp: b.hp, phase: b.phase, alive: b.alive }; },
  // 让最近的敌人立刻进入一次即将命中的攻击（用于完美闪避测试）
  forceAttack(lead = 0.12) { const P = world.player; let e = world.enemies.filter((x) => x.alive && !x.isBoss).sort((a, b) => a.pos.distanceTo(P.pos) - b.pos.distanceTo(P.pos))[0]; if (!e) e = world.spawn('grunt', P.pos.x + 2, P.pos.z); e.state = 'chase'; e.rig.root.scale.setScalar(1); e.pos.set(P.pos.x + 1.8, 0, P.pos.z); world.tokens.add(e); e.beginAttack('slash'); e.atk.t = e.atk.wdur - lead; return e.id; },
  camLogStart() { world.camLog = []; }, camLogStop() { const l = world.camLog; world.camLog = null; return l; },
  manual(b) { world.manual = b; },
  simulate(frames, dt = 1 / 60, script) { const out = []; for (let i = 0; i < frames; i++) { if (script) script(i); world.step(dt); } return true; },
  fpsHist() { return world.fpsHist.slice(); },
  setQuality(q) { world.setQuality(q); },
};
