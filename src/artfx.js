// 画图王 fx/ 贴图接入：血绫管体条带、冲击环、命中火花序列帧、四芒星闪、月牙斩、眼部光晕。
// 全部 AdditiveBlending + depthWrite:false，配合 Bloom；缺图时静默跳过（保留程序化特效）。
import * as THREE from 'three';
import { setGlowTexture, setAlbedoTexture } from './tendril.js';
const FX = 'art/fx/';
const load = (url) => new Promise((res) => new THREE.TextureLoader().load(url, (t) => { t.colorSpace = THREE.SRGBColorSpace; res(t); }, undefined, () => res(null)));
// 条带贴图是 v 沿长度，程序管子是 u 沿长度 → 旋转 90° 烘到画布（尖端朝右）
function rotateStrip(tex) {
  const img = tex.image; const cv = document.createElement('canvas'); cv.width = img.height; cv.height = img.width; const g = cv.getContext('2d');
  g.translate(cv.width, 0); g.rotate(Math.PI / 2); g.drawImage(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping; return t;
}
export class ArtFX {
  constructor(world) { this.w = world; this.ok = false; this.loaded = []; this.pool = []; }
  async load() {
    const names = { stripE: 'kagune_strip_emissive_256x1024.png', stripA: 'kagune_strip_albedo_256x1024.png', ring: 'impact_ring_512.png', sheet: 'hit_spark_sheet_4x4_1024.png', star: 'flare_star_512.png', arc: 'slash_arc_512.png', glint: 'kakugan_glint_256.png', glow: 'glow_red_256.png' };
    const T = {}; await Promise.all(Object.entries(names).map(async ([k, f]) => { T[k] = await load(FX + f); if (T[k]) this.loaded.push(f); }));
    this.T = T; if (!this.loaded.length) return this;
    if (T.stripE) setGlowTexture('*', rotateStrip(T.stripE));
    if (T.stripA) setAlbedoTexture(rotateStrip(T.stripA));
    if (T.ring) this.w.rings.setTexture(T.ring);
    const scene = this.w.scene;
    for (let i = 0; i < 24; i++) { const m = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, toneMapped: false })); m.visible = false; m.renderOrder = 5; scene.add(m); this.pool.push({ m, t: 0, life: 0, kind: '' }); }
    if (T.sheet) { this.sheetTex = []; } // 每个精灵各自 clone 一份 offset
    if (T.arc) { const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2); this.arcs = Array.from({ length: 4 }, () => { const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: T.arc, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, color: new THREE.Color(2.2, 0.35, 0.5), toneMapped: false })); m.visible = false; scene.add(m); return { m, t: 0, life: 0.2 }; }); }
    this.ok = true; return this;
  }
  _get() { return this.pool.find((x) => x.t <= 0) || this.pool.reduce((a, b) => (a.t < b.t ? a : b)); }
  // kind: spark（序列帧） | star | glint | glow
  flash(kind, pos, size = 1, color = 0xffffff, life = 0.35, rot = Math.random() * 6.28) {
    if (!this.ok) return; const tex = kind === 'spark' ? this.T.sheet : this.T[kind]; if (!tex) return;
    const f = this._get(); const mat = f.m.material;
    if (kind === 'spark') { if (!f.sheet) { f.sheet = tex.clone(); f.sheet.repeat.set(0.25, 0.25); f.sheet.needsUpdate = true; } mat.map = f.sheet; }
    else mat.map = tex;
    mat.color.setHex(color); mat.rotation = rot; mat.opacity = 1; mat.needsUpdate = true;
    f.m.position.copy(pos); f.size = size; f.m.scale.setScalar(size); f.t = life; f.life = life; f.kind = kind; f.m.visible = true;
    this.stats = (this.stats || 0) + 1;
  }
  slashArc(pos, yaw, side = 1, size = 3.2) {
    if (!this.arcs) return; const a = this.arcs.find((x) => x.t <= 0) || this.arcs[0];
    a.m.position.set(pos.x, pos.y + 1.05, pos.z); a.m.rotation.set(0, yaw + (side < 0 ? Math.PI : 0), 0); a.m.scale.set(size * side, 1, size); a.t = a.life = 0.2; a.m.visible = true;
  }
  update(dt) {
    if (!this.ok) return;
    for (const f of this.pool) { if (f.t <= 0) { f.m.visible = false; continue; } f.t -= dt; const p = 1 - f.t / f.life;
      if (f.kind === 'spark') { const fr = Math.min(15, Math.floor(p * 16)); f.sheet.offset.set((fr % 4) * 0.25, 0.75 - Math.floor(fr / 4) * 0.25); f.m.material.opacity = 1; }
      else if (f.kind === 'star') { f.m.scale.setScalar(f.size * (0.6 + 0.6 * Math.sin(Math.min(1, p * 1.4) * Math.PI))); f.m.material.opacity = 1 - p * p; }
      else { f.m.material.opacity = 1 - p; } }
    if (this.arcs) for (const a of this.arcs) { if (a.t <= 0) { a.m.visible = false; continue; } a.t -= dt; a.m.material.opacity = Math.max(0, a.t / a.life); }
  }
}
