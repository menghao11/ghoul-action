// 血绫：弹簧链驱动的程序化发光触手（固定顶点数，原地更新，无 GC）+ 尖端拖尾
import * as THREE from 'three';

let veinTex;
function veinTexture() {
  if (veinTex) return veinTex;
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 32; const g = cv.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 128, 0); gr.addColorStop(0, '#300008'); gr.addColorStop(0.5, '#a0102a'); gr.addColorStop(1, '#ff5070');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 32);
  g.strokeStyle = 'rgba(255,200,210,0.9)'; g.lineWidth = 1.5;
  for (let i = 0; i < 9; i++) { g.beginPath(); let y = Math.random() * 32; g.moveTo(0, y); for (let x = 0; x <= 128; x += 8) { y += (Math.random() - 0.5) * 6; g.lineTo(x, y); } g.stroke(); }
  for (let x = 6; x < 128; x += 11) { g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(x, 0, 2, 32); }
  veinTex = new THREE.CanvasTexture(cv); veinTex.wrapS = THREE.RepeatWrapping; veinTex.wrapT = THREE.RepeatWrapping; veinTex.colorSpace = THREE.SRGBColorSpace;
  return veinTex;
}
const REG = []; const GLOW = {}; // 画图王的发光贴图（可选）：kind -> texture；'*' 为通用
export function tendrilMaterial(color = 0xff2040, intensity = 1.6, kind = '*') {
  const m = new THREE.MeshStandardMaterial({ color: 0x1a0306, roughness: 0.32, metalness: 0.25, emissive: color, emissiveIntensity: intensity, emissiveMap: GLOW[kind] || GLOW['*'] || veinTexture() });
  if (ALBEDO) { m.map = ALBEDO; m.color.setHex(0x8a2a34); }
  m.userData.kind = kind; REG.push(m); return m;
}
let ALBEDO = null;
export function setAlbedoTexture(tex) { ALBEDO = tex; for (const m of REG) { m.map = tex; m.color.setHex(0x8a2a34); m.needsUpdate = true; } }
export function setGlowTexture(kind, tex) {
  tex.colorSpace = THREE.SRGBColorSpace; if (!tex.isCanvasTexture) tex.wrapS = tex.wrapT = THREE.RepeatWrapping; GLOW[kind] = tex;
  for (const m of REG) if (kind === '*' ? !GLOW[m.userData.kind] || m.userData.kind === '*' : m.userData.kind === kind) { m.emissiveMap = tex; m.needsUpdate = true; }
}
// 读取 art/manifest.json 里列出的血绫发光贴图；tendrilGlow 按形态指定，files 里文件名含类型关键词则只用于该形态
const KIND_KEYS = { ranged: ['ranged', '星屑', 'shard', 'crystal'], heavy: ['heavy', '磐盾', 'shield'], burst: ['burst', '狂澜'], balanced: ['balanced', '游龙', 'tail'], awaken: ['awaken', '绯魇', 'wrap'] };
export async function loadArtGlow(base = 'art/') {
  const found = []; const forced = {};
  // 只读入库的运行时清单 art/manifest.json（GitHub Pages 没有目录列表）。
  // 格式：{ "tendrilGlow": { "heavy": "fx/xxx.png", ... } } 或 { "files": ["textures/tendril_glow_ranged.png", ...] }
  try { const r = await fetch(base + 'manifest.json', { cache: 'no-cache' });
    if (r.ok) { const j = await r.json();
      for (const [k, f] of Object.entries(j.tendrilGlow || {})) { found.push(f); forced[f] = k; }
      for (const f of j.files || []) if (/glow/i.test(f)) found.push(f);
    }
  } catch (e) { /* 没有清单时静默使用程序贴图 */ }
  const loader = new THREE.TextureLoader(); const done = [];
  for (const rel of [...new Set(found)]) {
    const url = /^https?:/.test(rel) ? rel : base + rel.replace(/^\//, "").replace(/^(\.\/)?(art\/)?/, '');
    const low = rel.toLowerCase(); let kind = forced[rel] || '*';
    if (!forced[rel] && !/tendril|血绫/.test(low) && !Object.values(KIND_KEYS).flat().some((w) => low.includes(w))) continue; // 只要血绫用的发光贴图（通用辉光精灵等交给 artfx.js）
    if (!forced[rel]) for (const [k, keys] of Object.entries(KIND_KEYS)) if (keys.some((w) => low.includes(w))) kind = k;
    try { const tex = await loader.loadAsync(url); setGlowTexture(kind, tex); done.push({ url, kind }); } catch (e) { console.warn('glow texture failed', url); }
  }
  return done;
}
const _v = new THREE.Vector3(), _t = new THREE.Vector3(), _n = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Vector3(), _N = new THREE.Vector3();
export class Tendril {
  constructor(scene, opt) {
    this.o = Object.assign({ nodes: 14, radial: 7, length: 2.4, radius: 0.1, tipRadius: 0.012, flat: 1, k0: 420, k1: 140, damp: 0.75, plates: 0, spikes: 0, color: 0xff2040 }, opt);
    const { nodes, radial } = this.o;
    this.P = []; this.V = []; this.G = [];
    for (let i = 0; i < nodes; i++) { this.P.push(new THREE.Vector3()); this.V.push(new THREE.Vector3()); this.G.push(new THREE.Vector3()); }
    const vc = nodes * (radial + 1) + 1; // + 尖端顶点
    const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), uv = new Float32Array(vc * 2);
    const idx = [];
    for (let i = 0; i < nodes; i++) for (let r = 0; r <= radial; r++) { const k = i * (radial + 1) + r; uv[k * 2] = i / (nodes - 1); uv[k * 2 + 1] = r / radial; }
    for (let i = 0; i < nodes - 1; i++) for (let r = 0; r < radial; r++) {
      const a = i * (radial + 1) + r, b = a + radial + 1; idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const tip = vc - 1; uv[tip * 2] = 1; const last = (nodes - 1) * (radial + 1);
    for (let r = 0; r < radial; r++) idx.push(last + r, tip, last + r + 1);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.geo.setIndex(idx);
    this.mat = tendrilMaterial(this.o.color, 1.6, this.o.kind || '*');
    this.mesh = new THREE.Mesh(this.geo, this.mat); this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.radScale = 1; this.lenScale = 0; this.visible = true; this.init = false;
    this.refN = new THREE.Vector3(1, 0, 0); // 起始参考法线（每帧由角色右向量设定，稳定不扭转）
    this.tipPrev = new THREE.Vector3(); this.tipSpeed = 0;
  }
  setGoals(fn) { for (let i = 0; i < this.G.length; i++) fn(i / (this.G.length - 1), this.G[i]); }
  snap() { for (let i = 0; i < this.P.length; i++) { this.P[i].copy(this.G[i]); this.V[i].set(0, 0, 0); } this.init = true; }
  step(dt) {
    if (!this.init) this.snap();
    const n = this.P.length, { k0, k1, damp } = this.o;
    const sub = Math.max(1, Math.ceil(dt / (1 / 120))); const h = dt / sub;
    for (let s = 0; s < sub; s++) {
      this.P[0].copy(this.G[0]); this.V[0].set(0, 0, 0);
      for (let i = 1; i < n; i++) {
        const f = i / (n - 1), k = k0 + (k1 - k0) * f, c = 2 * Math.sqrt(k) * damp;
        const P = this.P[i], V = this.V[i];
        _v.subVectors(this.G[i], P).multiplyScalar(k); _v.addScaledVector(V, -c);
        V.addScaledVector(_v, h); P.addScaledVector(V, h);
      }
      // 长度约束：允许拉伸至 1.8 倍（突刺），保持连续
      const seg = this.o.length * Math.max(0.05, this.lenScale) / (n - 1);
      for (let i = 1; i < n; i++) {
        _v.subVectors(this.P[i], this.P[i - 1]); const d = _v.length(), mx = seg * 1.9;
        if (d > mx) this.P[i].copy(this.P[i - 1]).addScaledVector(_v, mx / d);
      }
    }
    const tip = this.P[n - 1]; this.tipSpeed = tip.distanceTo(this.tipPrev) / Math.max(dt, 1e-4); this.tipPrev.copy(tip);
  }
  build() {
    const { nodes, radial, radius, tipRadius, flat, plates, spikes } = this.o;
    const pos = this.geo.attributes.position.array, nor = this.geo.attributes.normal.array;
    const vis = this.visible && this.lenScale > 0.02;
    this.mesh.visible = vis; if (!vis) return;
    const N = _N.copy(this.refN);
    for (let i = 0; i < nodes; i++) {
      const a = this.P[Math.max(0, i - 1)], b = this.P[Math.min(nodes - 1, i + 1)];
      _t.subVectors(b, a); if (_t.lengthSq() < 1e-10) _t.set(0, 1, 0); _t.normalize();
      // 平行移动标架
      _n.copy(N).addScaledVector(_t, -N.dot(_t)); if (_n.lengthSq() < 1e-6) { _n.set(0, 1, 0).cross(_t); if (_n.lengthSq() < 1e-6) _n.set(1, 0, 0); } _n.normalize(); N.copy(_n);
      _b.crossVectors(_t, _n);
      const f = i / (nodes - 1);
      let r = (radius * Math.pow(1 - f, 0.75) + tipRadius) * this.radScale;
      if (plates) r *= 1 + 0.35 * Math.max(0, Math.sin(f * Math.PI * plates));
      if (i === 0) r *= 0.6;
      const P = this.P[i];
      for (let k = 0; k <= radial; k++) {
        const th = k / radial * Math.PI * 2; const cs = Math.cos(th), sn = Math.sin(th);
        let rr = r; if (spikes && k % 2 === 0 && i % 3 === 1) rr *= 1.6;
        const vi = (i * (radial + 1) + k) * 3;
        _q.copy(_n).multiplyScalar(cs * flat).addScaledVector(_b, sn);
        pos[vi] = P.x + _q.x * rr; pos[vi + 1] = P.y + _q.y * rr; pos[vi + 2] = P.z + _q.z * rr;
        _q.copy(_n).multiplyScalar(cs / flat).addScaledVector(_b, sn).normalize();
        nor[vi] = _q.x; nor[vi + 1] = _q.y; nor[vi + 2] = _q.z;
      }
    }
    // 尖端
    const tp = this.P[nodes - 1], ti = (nodes * (radial + 1)) * 3;
    pos[ti] = tp.x + _t.x * 0.12 * this.radScale; pos[ti + 1] = tp.y + _t.y * 0.12 * this.radScale; pos[ti + 2] = tp.z + _t.z * 0.12 * this.radScale;
    nor[ti] = _t.x; nor[ti + 1] = _t.y; nor[ti + 2] = _t.z;
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.normal.needsUpdate = true;
  }
  tip() { return this.P[this.P.length - 1]; }
  dispose() { this.mesh.parent?.remove(this.mesh); this.geo.dispose(); this.mat.dispose(); }
}

// 尖端拖尾：两条轨迹点构成带状，加色混合、按时间淡出
const trailVS = `attribute float a; varying float va; void main(){ va=a; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `;
const trailFS = `uniform vec3 col; uniform float gain; varying float va; void main(){ gl_FragColor=vec4(col*va*1.6*gain, va); }`;
export class Trail {
  constructor(scene, len = 18, color = 0xff2a4a) {
    this.len = len; this.A = []; this.B = []; this.age = [];
    const pos = new Float32Array(len * 2 * 3), a = new Float32Array(len * 2); const idx = [];
    for (let i = 0; i < len - 1; i++) { const p = i * 2; idx.push(p, p + 1, p + 2, p + 1, p + 3, p + 2); }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('a', new THREE.BufferAttribute(a, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({ vertexShader: trailVS, fragmentShader: trailFS, uniforms: { col: { value: new THREE.Color(color) }, gain: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(this.geo, this.mat); this.mesh.frustumCulled = false; scene.add(this.mesh);
    for (let i = 0; i < len; i++) { this.A.push(new THREE.Vector3()); this.B.push(new THREE.Vector3()); this.age.push(9); }
    this.head = 0; this.intensity = 0;
  }
  push(a, b, strength) {
    this.head = (this.head + 1) % this.len; this.A[this.head].copy(a); this.B[this.head].copy(b); this.age[this.head] = 0; this.str = strength;
  }
  update(dt, life = 0.16) {
    this.mat.uniforms.gain.value = this.gain || 1;
    const pos = this.geo.attributes.position.array, al = this.geo.attributes.a.array;
    for (let i = 0; i < this.len; i++) {
      const j = (this.head - i + this.len) % this.len; this.age[j] += dt;
      const A = this.A[j], B = this.B[j]; const o = i * 6;
      pos[o] = A.x; pos[o + 1] = A.y; pos[o + 2] = A.z; pos[o + 3] = B.x; pos[o + 4] = B.y; pos[o + 5] = B.z;
      const f = Math.max(0, 1 - this.age[j] / life) * (1 - i / this.len);
      al[i * 2] = f * (this.str || 0); al[i * 2 + 1] = f * (this.str || 0) * 0.15;
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.a.needsUpdate = true;
  }
  reset(p) { for (let i = 0; i < this.len; i++) { this.A[i].copy(p); this.B[i].copy(p); this.age[i] = 9; } }
}
