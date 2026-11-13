// 程序化东京风夜街：楼群（合并几何）、霓虹招牌（原创虚构店名）、路灯、湿润路面假反射、雨丝
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { NEON } from './names.js';

export const BOUNDS = { x0: -38, x1: 38, z0: -9.2, z1: 9.2 };
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

function windowTexture() {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256; const g = cv.getContext('2d');
  g.fillStyle = '#100d15'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 4; y++) { g.fillStyle = '#1c1824'; g.fillRect(0, y * 64 + 56, 256, 8); } // 楼层分隔
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const r = rnd(); let c = 'rgba(18,22,36,1)';
    if (r < 0.26) c = `rgba(255,${190 + rnd() * 40 | 0},${120 + rnd() * 40 | 0},${0.45 + rnd() * 0.45})`;
    else if (r < 0.31) c = 'rgba(170,210,255,0.55)';
    else if (r < 0.33) c = 'rgba(255,60,90,0.6)';
    g.fillStyle = '#07060a'; g.fillRect(x * 64 + 8, y * 64 + 10, 48, 40);
    g.fillStyle = c; g.fillRect(x * 64 + 11, y * 64 + 13, 42, 34);
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x * 64 + 31, y * 64 + 13, 2, 34); // 窗框
    if (rnd() < 0.3) { g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(x * 64 + 11, y * 64 + 13, 42, 10 + rnd() * 20); } // 窗帘
  }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function roadTexture() {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256; const g = cv.getContext('2d');
  g.fillStyle = '#121016'; g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${rnd() * 60 | 0},${rnd() * 50 | 0},${rnd() * 70 | 0},0.25)`; g.fillRect(rnd() * 512, rnd() * 256, 2, 2); }
  for (let i = 0; i < 14; i++) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(rnd() * 512, rnd() * 256, 20 + rnd() * 50, 8 + rnd() * 20, 0, 0, 7); g.fill(); }
  g.fillStyle = 'rgba(230,230,230,0.75)'; for (let x = 0; x < 512; x += 64) g.fillRect(x, 126, 36, 4);
  g.fillStyle = 'rgba(220,200,120,0.6)'; g.fillRect(0, 8, 512, 3); g.fillRect(0, 245, 512, 3);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function glowTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(cv);
}
function streakTexture() {
  const cv = document.createElement('canvas'); cv.width = 32; cv.height = 128; const g = cv.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 128);
  const g2 = g.createLinearGradient(0, 0, 32, 0); g.globalCompositeOperation = 'destination-in'; g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(0.5, 'rgba(0,0,0,1)'); g2.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = g2; g.fillRect(0, 0, 32, 128);
  return new THREE.CanvasTexture(cv);
}
function signTexture(text, color, vertical) {
  const cv = document.createElement('canvas'); const n = [...text].length;
  if (vertical) { cv.width = 96; cv.height = 80 * n + 30; } else { cv.width = 70 * n + 40; cv.height = 110; }
  const g = cv.getContext('2d'); g.fillStyle = 'rgba(10,4,8,0.92)'; g.fillRect(0, 0, cv.width, cv.height);
  g.strokeStyle = color; g.lineWidth = 6; g.shadowColor = color; g.shadowBlur = 14; g.strokeRect(6, 6, cv.width - 12, cv.height - 12);
  g.fillStyle = '#fff'; g.font = 'bold 64px "PingFang SC","Noto Sans CJK SC","Hiragino Sans",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowBlur = 18;
  if (vertical) [...text].forEach((ch, i) => g.fillText(ch, 48, 55 + i * 80)); else g.fillText(text, cv.width / 2, 58);
  g.globalCompositeOperation = 'source-atop'; g.fillStyle = color; g.globalAlpha = 0.55; g.fillRect(0, 0, cv.width, cv.height);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return { t, w: cv.width, h: cv.height };
}

export function buildCity(scene, quality) {
  seed = 7;
  const group = new THREE.Group(); scene.add(group);
  scene.background = new THREE.Color(0x07030a);
  scene.fog = new THREE.FogExp2(0x0b0410, 0.022);
  scene.add(new THREE.HemisphereLight(0x8060a0, 0x200a10, 1.5));
  const moon = new THREE.DirectionalLight(0x8090ff, 0.7); moon.position.set(-10, 30, 12); scene.add(moon);
  // 路面
  const road = new THREE.Mesh(new THREE.PlaneGeometry(120, 14), new THREE.MeshStandardMaterial({ map: (() => { const t = roadTexture(); t.repeat.set(12, 1); return t; })(), roughness: 0.28, metalness: 0.55, color: 0x9a90a8 }));
  road.rotation.x = -Math.PI / 2; group.add(road);
  const walkMat = new THREE.MeshStandardMaterial({ color: 0x2a2530, roughness: 0.5, metalness: 0.3 });
  for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(120, 0.16, 4), walkMat); w.position.set(0, 0.08, s * 9); group.add(w);
    const curb = new THREE.Mesh(new THREE.BoxGeometry(120, 0.2, 0.2), new THREE.MeshStandardMaterial({ color: 0x555060 })); curb.position.set(0, 0.1, s * 7.05); group.add(curb); }
  // 楼群：合并为一个网格
  const geos = []; const signs = [];
  for (const side of [-1, 1]) {
    let x = -60;
    while (x < 60) {
      const w = 5 + rnd() * 7, d = 8 + rnd() * 8, h = 7 + rnd() * (Math.abs(x) < 30 ? 22 : 14);
      const g = new THREE.BoxGeometry(w - 0.3, h, d); const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 6, uv.getY(i) * h / 6);
      const off = Math.floor(rnd() * 4) / 4; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) + off);
      g.translate(x + w / 2, h / 2, side * (11 + d / 2)); geos.push(g);
      if (rnd() < 0.75 && Math.abs(x) < 50) signs.push({ x: x + w / 2 + (rnd() - 0.5) * (w - 2), z: side * 10.9, side, h });
      // 屋顶小结构
      if (rnd() < 0.5) { const r = new THREE.BoxGeometry(1.5 + rnd() * 2, 1.2 + rnd() * 2, 1.5 + rnd() * 2); r.translate(x + w / 2, h + 0.8, side * (11 + d / 2)); geos.push(r); }
      x += w;
    }
  }
  for (const ex of [-1, 1]) { // 街道两端封闭的楼
    for (let z = -10; z < 10; z += 6.7) { const h = 10 + rnd() * 16; const g = new THREE.BoxGeometry(8, h, 6.5); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1.2, uv.getY(i) * h / 6); g.translate(ex * 46, h / 2, z + 3.3); geos.push(g); }
  }
  const win = windowTexture();
  const bmat = new THREE.MeshLambertMaterial({ color: 0x1b1622, emissive: 0xffffff, emissiveMap: win, emissiveIntensity: 1.0 });
  const city = new THREE.Mesh(mergeGeometries(geos), bmat); group.add(city);
  // 霓虹招牌 + 地面倒影
  const glow = glowTexture(), streak = streakTexture();
  const palette = ['#ff2a55', '#ff6a2a', '#ff2ad4', '#2ad4ff', '#ff3040', '#ffd02a'];
  let si = 0; const neonMeshes = [];
  for (const s of signs) {
    const text = NEON[si % NEON.length]; const col = palette[si % palette.length]; si++;
    const latin = /^[A-Z ]+$/.test(text); const vertical = !latin && rnd() < 0.7;
    const { t, w, h } = signTexture(text, col, vertical);
    const sc = vertical ? 0.9 / 96 : 1.0 / 110; const W = w * sc, H = h * sc;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: t, toneMapped: false, color: new THREE.Color(1.6, 1.6, 1.6) }));
    const y = Math.min(s.h - H / 2 - 0.3, 3.5 + rnd() * 5);
    if (vertical) { m.position.set(s.x, y, s.z - s.side * 0.9); m.rotation.y = s.side > 0 ? -Math.PI / 2 : Math.PI / 2; // 竖招牌垂直于墙
      const m2 = m.clone(); m2.rotation.y += Math.PI; group.add(m2); }
    else { m.position.set(s.x, y, s.z - s.side * 0.05); m.rotation.y = s.side > 0 ? Math.PI : 0; }
    group.add(m); neonMeshes.push(m);
    const c = new THREE.Color(col);
    const refl = new THREE.Mesh(new THREE.PlaneGeometry(vertical ? 1.2 : W, 6), new THREE.MeshBasicMaterial({ map: streak, color: c, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
    refl.rotation.x = -Math.PI / 2; refl.rotation.z = s.side > 0 ? Math.PI : 0; refl.position.set(s.x, 0.02, s.side * 7.8 - s.side * 3); group.add(refl);
  }
  // 路灯：灯头发光 + 地面光池；只有少量真实点光源（性能）
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x222028, roughness: 0.6, metalness: 0.6 });
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.6, 1.1), toneMapped: false });
  const poolMat = new THREE.MeshBasicMaterial({ map: glow, color: 0xffb070, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false });
  const poleG = new THREE.CylinderGeometry(0.07, 0.09, 5.5, 6), armG = new THREE.BoxGeometry(0.08, 0.08, 1.4), headG = new THREE.BoxGeometry(0.3, 0.12, 0.6);
  const lights = []; const nReal = quality === 'low' ? 2 : 3;
  let li = 0;
  for (let x = -36; x <= 36; x += 12) for (const side of [-1, 1]) {
    const px = x + (side > 0 ? 6 : 0); const z = side * 7.6;
    const pole = new THREE.Mesh(poleG, poleMat); pole.position.set(px, 2.75, z); group.add(pole);
    const arm = new THREE.Mesh(armG, poleMat); arm.position.set(px, 5.4, z - side * 0.7); group.add(arm);
    const head = new THREE.Mesh(headG, lampMat); head.position.set(px, 5.3, z - side * 1.3); group.add(head);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), poolMat); pool.rotation.x = -Math.PI / 2; pool.position.set(px, 0.025, z - side * 1.6); group.add(pool);
    li++;
  }
  for (let i = 0; i < nReal; i++) { const L = new THREE.PointLight(0xffa060, 14, 18, 1.6); L.position.set(-24 + i * 24, 5, (i % 2 ? 1 : -1) * 6); scene.add(L); lights.push(L); }
  const neonL = new THREE.PointLight(0xff2050, 10, 16, 1.6); neonL.position.set(0, 4, -8); scene.add(neonL); lights.push(neonL);
  // 灯笼串
  const lanternMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.18, 0.1), toneMapped: false });
  const lg = new THREE.SphereGeometry(0.13, 8, 6); lg.scale(1, 1.25, 1);
  const lanterns = [];
  for (let x = -30; x <= 30; x += 2.2) { const z = 9.8 * (x % 4.4 < 2.2 ? 1 : -1) * 0 + 9.6; for (const s of [-1, 1]) { const l = lg.clone(); l.translate(x, 3.2 + Math.sin(x * 0.7) * 0.15, s * 9.9); lanterns.push(l); } }
  group.add(new THREE.Mesh(mergeGeometries(lanterns), lanternMat));
  // 道具：自动售货机、路障、停放车辆（低多边形）
  const props = [];
  const vend = new THREE.MeshStandardMaterial({ color: 0x2a3a60, emissive: 0x4060c0, emissiveIntensity: 0.35, roughness: 0.4 });
  for (const [x, s] of [[-20, 1], [-6, -1], [14, 1], [27, -1]]) { const v = new THREE.Mesh(new THREE.BoxGeometry(1, 1.9, 0.8), vend); v.position.set(x, 1.1, s * 10.4); group.add(v); }
  const carMat = new THREE.MeshStandardMaterial({ color: 0x18161c, roughness: 0.25, metalness: 0.8 });
  const tailMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 0.1, 0.15), toneMapped: false });
  for (const [x, s] of [[-31, -1], [-12, 1], [21, -1], [33, 1]]) {
    const car = new THREE.Group(); const b = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.7, 1.8), carMat); b.position.y = 0.55; car.add(b);
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.55, 1.6), carMat); top.position.set(-0.2, 1.15, 0); car.add(top);
    for (const z of [-0.65, 0.65]) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.3), tailMat); t.position.set(-2.12, 0.65, z); car.add(t); }
    car.position.set(x, 0, s * 6.0); group.add(car); props.push({ x, z: s * 6.0, hw: 2.2, hd: 1.0 });
  }
  // 电线
  const wireG = new THREE.BufferGeometry(); const wp = [];
  for (let x = -48; x < 48; x += 12) for (let k = 0; k < 3; k++) { for (let i = 0; i < 10; i++) { const a = i / 10, b = (i + 1) / 10, sag = (t) => -Math.sin(t * Math.PI) * 0.8; wp.push(x + a * 12, 8 + k * 0.5 + sag(a), -10.5 + k * 0.3, x + b * 12, 8 + k * 0.5 + sag(b), -10.5 + k * 0.3); } }
  wireG.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3)); group.add(new THREE.LineSegments(wireG, new THREE.LineBasicMaterial({ color: 0x050307 })));
  // 雨丝
  let rain = null;
  if (quality !== 'low') {
    const N = quality === 'high' ? 1400 : 700; const rp = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) { const x = (rnd() - 0.5) * 60, y = rnd() * 18, z = (rnd() - 0.5) * 30; rp.set([x, y, z, x + 0.05, y + 0.5, z], i * 6); }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0x8a7090, transparent: true, opacity: 0.35, depthWrite: false })); rain.frustumCulled = false; scene.add(rain);
  }
  return {
    group, props, lights, neonMeshes,
    update(dt, t, focus) {
      if (rain) { rain.position.y = -((t * 22) % 18); rain.position.x = focus.x; rain.position.z = focus.z * 0.3; }
      neonL.intensity = 9 + Math.sin(t * 13) * 0.6 + (Math.sin(t * 2.1) > 0.97 ? -4 : 0);
    },
  };
}
