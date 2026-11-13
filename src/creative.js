// 创意层：连击评价（凡→神）、面具碎裂、血晶花、四种终焉变体、霓虹短路火花。全部平滑过渡，无晃屏、无频闪。
import * as THREE from 'three';

export const RANKS = [
  { min: 0, l: '', n: '' }, { min: 30, l: 'C', n: '凡' }, { min: 80, l: 'B', n: '锐' }, { min: 160, l: 'A', n: '狂' },
  { min: 280, l: 'S', n: '绝' }, { min: 430, l: 'SS', n: '魇' }, { min: 620, l: 'SSS', n: '神' },
];
export const FINISHER_VARIANTS = {
  ranged: { name: '星屑·终焉「陨星雨」', color: 0xff4a7a },
  heavy: { name: '磐盾·终焉「崩天」', color: 0xff3018 },
  burst: { name: '狂澜·终焉「血潮」', color: 0xff1048 },
  balanced: { name: '游龙·终焉「龙卷」', color: 0xff2030 },
};
const $ = (id) => document.getElementById(id);
const rnd = (a, b) => a + Math.random() * (b - a);

export class Creative {
  constructor(w) {
    this.w = w; this.sp = 0; this.level = 0; this.lastHitT = -9; this.recent = []; this.maxLevel = 0;
    this.rankEl = $('rank');
    // 面具碎片池
    const tet = new THREE.TetrahedronGeometry(0.07, 0);
    this.shards = Array.from({ length: 48 }, () => { const m = new THREE.Mesh(tet, new THREE.MeshToonMaterial({ color: 0xf0f0f4, transparent: true })); m.visible = false; w.scene.add(m); return { m, on: false, v: new THREE.Vector3(), spin: new THREE.Vector3(), t: 0 }; });
    // 血晶花
    this.petalGeo = new THREE.OctahedronGeometry(0.16, 0); this.petalGeo.scale(0.55, 2.6, 0.55); this.petalGeo.translate(0, 0.38, 0);
    this.flowers = [];
    // 陨星（纯视觉）
    const mg = new THREE.OctahedronGeometry(0.14, 0); mg.scale(0.6, 0.6, 4);
    this.metMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.35, 0.6), toneMapped: false });
    this.meteors = Array.from({ length: 30 }, () => { const m = new THREE.Mesh(mg, this.metMat); m.visible = false; w.scene.add(m); return { m, on: false, from: new THREE.Vector3(), to: new THREE.Vector3(), t: 0, dur: 0.14 }; });
    this.finisherHits = 0;
  }
  // ---------- 连击评价 ----------
  onHit(dmg, moveId, air) {
    const fresh = moveId && !this.recent.includes(moveId); this.recent.push(moveId); if (this.recent.length > 3) this.recent.shift();
    this.sp += (4 + dmg * 0.08) * (fresh ? 1.6 : 1) * (air ? 1.3 : 1); this.lastHitT = this.w.realTime; this._clamp();
  }
  bonus(v) { this.sp += v; this.lastHitT = this.w.realTime; this._clamp(); }
  onHurt() { this.sp *= 0.4; this._clamp(); }
  _clamp() { this.sp = Math.min(800, Math.max(0, this.sp)); }
  get trailBoost() { return 1 + this.level * 0.28; }
  update(dt) {
    if (this.w.realTime - this.lastHitT > 1.3) this.sp = Math.max(0, this.sp - (10 + this.sp * 0.14) * dt);
    let lv = 0; for (let i = 0; i < RANKS.length; i++) if (this.sp >= RANKS[i].min) lv = i;
    if (lv !== this.level) { const up = lv > this.level; this.level = lv; this.maxLevel = Math.max(this.maxLevel, lv); this._showRank(up); }
    if (this.rankEl && lv > 0) { const r = RANKS[lv], nx = RANKS[lv + 1]; const f = nx ? (this.sp - r.min) / (nx.min - r.min) : 1; $('rankFill').style.width = (f * 100).toFixed(0) + '%'; }
    this._updShards(dt); this._updFlowers(dt); this._updMeteors(dt);
  }
  _showRank(up) {
    const el = this.rankEl; if (!el) return; const r = RANKS[this.level];
    el.classList.toggle('hidden', this.level === 0); el.dataset.lv = this.level;
    $('rankL').textContent = r.l; $('rankN').textContent = r.n;
    if (up) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
  }
  // ---------- 面具碎裂 ----------
  shatterMask(e) {
    const w = this.w; const p = new THREE.Vector3(); let mk = null, col = null;
    if (e.rig.isModel) { // 模型：面具画在贴图上 → 在头部位置迸出对应颜色的碎片（瓷白骷髅/红鸦喙/铁枷）；Boss 没有面具
      if (e.isBoss || e._maskBroken) return; e._maskBroken = true; const head = e.rig.bones.mixamorigHead; if (!head) return;
      head.getWorldPosition(p); p.y += 0.08; col = { grunt: [0xf0ece4, 0xd8d0c4], shooter: [0xc01830, 0x2a1015], brute: [0x50505a, 0x2a2a30] }[e.kind] || [0xf0f0f4, 0xd0d0d8];
    } else { mk = e.rig.mask; if (!mk || !mk.visible) return; mk.updateWorldMatrix(true, true); mk.getWorldPosition(p); }
    const dark = e.kind === 'shooter'; const n = e.isBoss ? 10 : 7;
    const away = new THREE.Vector3(p.x - w.player.pos.x, 0, p.z - w.player.pos.z).normalize();
    for (let i = 0; i < n; i++) {
      const s = this.shards.find((x) => !x.on) || this.shards[(Math.random() * this.shards.length) | 0];
      s.on = true; s.t = 0; s.m.visible = true; s.m.position.copy(p).add(new THREE.Vector3(rnd(-0.1, 0.1), rnd(-0.08, 0.08), rnd(-0.1, 0.1)));
      s.m.scale.setScalar(rnd(0.6, 1.5) * (e.isBoss ? 1.6 : 1)); s.m.material.color.setHex(col ? col[i % 2] : dark && i % 2 ? 0x22242c : 0xf0f0f4); s.m.material.opacity = 1;
      s.v.set(away.x * rnd(1.5, 4) + rnd(-1.5, 1.5), rnd(2.5, 5), away.z * rnd(1.5, 4) + rnd(-1.5, 1.5)); s.spin.set(rnd(-14, 14), rnd(-14, 14), rnd(-14, 14));
    }
    if (mk) mk.visible = false; w.fx.burst(p, [1, 1, 1], 14, 4, 0.05); w.sfx.block();
  }
  _updShards(dt) {
    for (const s of this.shards) { if (!s.on) continue; s.t += dt; const m = s.m;
      if (m.position.y > 0.04) { s.v.y -= 16 * dt; m.position.addScaledVector(s.v, dt); m.rotation.x += s.spin.x * dt; m.rotation.y += s.spin.y * dt; m.rotation.z += s.spin.z * dt; if (m.position.y <= 0.04) { m.position.y = 0.04; s.v.multiplyScalar(0.35); s.v.y = Math.abs(s.v.y) * 0.4; if (s.v.y < 0.6) s.v.y = 0; s.spin.multiplyScalar(0.3); } }
      if (s.t > 2.6) m.material.opacity = Math.max(0, 1 - (s.t - 2.6) / 0.8); if (s.t > 3.4) { s.on = false; m.visible = false; } }
  }
  // ---------- 血晶花 ----------
  bloom(pos, scale = 1, color = 0xff1a40) {
    this.bloomCount = (this.bloomCount || 0) + 1;
    if (this.flowers.length >= 14) this._killFlower(this.flowers.shift());
    const g = new THREE.Group(); g.position.set(pos.x, 0.02, pos.z); g.rotation.y = Math.random() * 6.28;
    const mat = new THREE.MeshStandardMaterial({ color: 0x2a0008, emissive: color, emissiveIntensity: 1.8, roughness: 0.15, metalness: 0.5, transparent: true, opacity: 0.95 });
    const n = 7 + ((Math.random() * 3) | 0);
    for (let i = 0; i < n; i++) { const p = new THREE.Mesh(this.petalGeo, mat); const a = i / n * Math.PI * 2; p.rotation.set(0, a, 0); p.rotateZ(rnd(0.5, 0.95)); const s = rnd(0.7, 1.2); p.scale.set(s, s * rnd(0.8, 1.3), s); g.add(p); }
    const core = new THREE.Mesh(this.petalGeo, mat); core.scale.set(1.3, 1.6, 1.3); g.add(core);
    g.scale.setScalar(0.001); this.w.scene.add(g);
    this.flowers.push({ g, mat, t: 0, s: scale, life: 6 + Math.random() });
    this.w.fx.burst(new THREE.Vector3(pos.x, 0.4, pos.z), [1, 0.15, 0.3], 18, 5, 0.08);
  }
  _killFlower(f) { this.w.scene.remove(f.g); f.mat.dispose(); }
  _updFlowers(dt) {
    for (let i = this.flowers.length - 1; i >= 0; i--) { const f = this.flowers[i]; f.t += dt;
      const grow = Math.min(1, f.t / 0.38); const back = 1 + 2.2 * Math.pow(grow - 1, 3) + 1.2 * Math.pow(grow - 1, 2); // easeOutBack
      let s = f.s * back; f.mat.emissiveIntensity = 1.2 + 1.4 * Math.exp(-f.t * 2) + 0.15 * Math.sin(f.t * 2);
      if (f.t > f.life) { const k = Math.min(1, (f.t - f.life) / 0.9); s *= 1 - k * 0.6; f.mat.opacity = 0.95 * (1 - k); if (k >= 1) { this._killFlower(f); this.flowers.splice(i, 1); continue; } }
      f.g.scale.set(s, s * (f.t > f.life ? 1 - Math.min(1, (f.t - f.life) / 0.9) * 0.5 : 1), s); }
  }
  // ---------- 终焉变体 ----------
  finisherHit(type, hits, last, pl) {
    const w = this.w, V = FINISHER_VARIANTS[type]; this.finisherHits++;
    for (const e of hits) {
      const p = new THREE.Vector3(e.pos.x, e.pos.y + e.height * 0.5, e.pos.z);
      if (type === 'ranged') for (let k = 0; k < (last ? 5 : 2); k++) this.meteor(p);
      else if (type === 'heavy') { w.rings.spawn(e.pos, last ? 5 : 2.4, 0.4, V.color); }
      else if (type === 'burst') { w.fx.blood(p, new THREE.Vector3(rnd(-1, 1), 1, rnd(-1, 1)).normalize(), last ? 2 : 1.2); const h = pl.maxHp * 0.03; pl.hp = Math.min(pl.maxHp, pl.hp + h); }
      else w.rings.spawn(pl.pos, 3 + this.finisherHits % 3, 0.35, V.color, 1.2);
      if (last) this.bloom(e.pos, e.isBoss ? 2.2 : 1.4, V.color);
    }
    if (last) {
      if (type === 'heavy') { for (let k = 0; k < 3; k++) setTimeout(() => w.rings.spawn(pl.pos, 6 + k * 3, 0.6, V.color), k * 120); for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; this.bloom({ x: pl.pos.x + Math.cos(a) * 3.2, z: pl.pos.z + Math.sin(a) * 3.2 }, 0.8, V.color); } }
      if (type === 'burst') w.fx.burst(new THREE.Vector3(pl.pos.x, 1.2, pl.pos.z), [1, 0.05, 0.15], 80, 12, 0.14);
      if (!hits.length) this.bloom(pl.pos, 1.6, V.color);
      w.impact(pl.pos, 12); w.artfx.flash('star', new THREE.Vector3(pl.pos.x, pl.pos.y + 1.4, pl.pos.z), 6, V.color, 0.6, 0);
    }
  }
  meteor(to) {
    const m = this.meteors.find((x) => !x.on); if (!m) return;
    m.on = true; m.t = 0; m.dur = rnd(0.12, 0.22); m.to.copy(to).add(new THREE.Vector3(rnd(-0.5, 0.5), rnd(-0.3, 0.3), rnd(-0.5, 0.5)));
    m.from.copy(m.to).add(new THREE.Vector3(rnd(-3, 3), rnd(7, 10), rnd(-3, 3))); m.m.visible = true; m.m.position.copy(m.from); m.m.lookAt(m.to);
  }
  _updMeteors(dt) {
    for (const m of this.meteors) { if (!m.on) continue; m.t += dt; const u = Math.min(1, m.t / m.dur); m.m.position.lerpVectors(m.from, m.to, u * u);
      if (u >= 1) { m.on = false; m.m.visible = false; this.w.fx.burst(m.to, [1, 0.3, 0.55], 10, 5, 0.07); } }
  }
}
