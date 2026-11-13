// 打击特效：血雾/火花粒子、红色残影、地面预警圈、冲击环。全部对象池，零屏幕晃动。
import * as THREE from 'three';

const pVS = `attribute float size; attribute float alpha; attribute vec3 col; varying float va; varying vec3 vc; uniform float uScale;
void main(){ va=alpha; vc=col; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=size*uScale/max(0.1,-mv.z); gl_Position=projectionMatrix*mv; }`;
const pFS = `varying float va; varying vec3 vc; void main(){ vec2 d=gl_PointCoord-0.5; float r=dot(d,d)*4.0; if(r>1.0) discard; float a=va*(1.0-r)*(1.0-r); gl_FragColor=vec4(vc*a, a); }`;
export class Particles {
  constructor(scene, max, additive) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max); this.alpha = new Float32Array(max); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.grow = new Float32Array(max); this.drag = new Float32Array(max); this.grav = new Float32Array(max); this.a0 = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('col', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({ vertexShader: pVS, fragmentShader: pFS, uniforms: { uScale: { value: 400 } }, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.CustomBlending });
    if (!additive) { this.mat.blendSrc = THREE.OneFactor; this.mat.blendDst = THREE.OneMinusSrcAlphaFactor; }
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; scene.add(this.points); this.geo = g;
  }
  emit(x, y, z, vx, vy, vz, o) {
    let i = this.n; if (i >= this.max) { i = (Math.random() * this.max) | 0; } else this.n++;
    const i3 = i * 3; this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z; this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.col[i3] = o.r; this.col[i3 + 1] = o.g; this.col[i3 + 2] = o.b; this.size[i] = o.size; this.life[i] = this.maxLife[i] = o.life;
    this.grow[i] = o.grow || 0; this.drag[i] = o.drag ?? 2; this.grav[i] = o.grav ?? 0; this.a0[i] = o.alpha ?? 1; this.alpha[i] = this.a0[i];
  }
  update(dt) {
    let n = this.n;
    for (let i = 0; i < n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { // 与末尾交换
        n--; this._copy(n, i); i--; continue;
      }
      const i3 = i * 3, dr = Math.exp(-this.drag[i] * dt);
      this.vel[i3] *= dr; this.vel[i3 + 1] = this.vel[i3 + 1] * dr - this.grav[i] * dt; this.vel[i3 + 2] *= dr;
      this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.pos[i3 + 1] < 0.02) { this.pos[i3 + 1] = 0.02; this.vel[i3 + 1] *= -0.2; }
      this.size[i] += this.grow[i] * dt; const f = this.life[i] / this.maxLife[i]; this.alpha[i] = this.a0[i] * Math.min(1, f * 1.6);
    }
    this.n = n; const g = this.geo; g.setDrawRange(0, n);
    g.attributes.position.needsUpdate = g.attributes.col.needsUpdate = g.attributes.size.needsUpdate = g.attributes.alpha.needsUpdate = true;
  }
  _copy(src, dst) {
    const s3 = src * 3, d3 = dst * 3;
    for (let k = 0; k < 3; k++) { this.pos[d3 + k] = this.pos[s3 + k]; this.vel[d3 + k] = this.vel[s3 + k]; this.col[d3 + k] = this.col[s3 + k]; }
    this.size[dst] = this.size[src]; this.alpha[dst] = this.alpha[src]; this.life[dst] = this.life[src]; this.maxLife[dst] = this.maxLife[src];
    this.grow[dst] = this.grow[src]; this.drag[dst] = this.drag[src]; this.grav[dst] = this.grav[src]; this.a0[dst] = this.a0[src];
  }
  clear() { this.n = 0; }
}

// 残影：复制角色各部件的世界矩阵，用红色加色材质淡出
export class Ghosts {
  constructor(scene, max = 10) {
    this.scene = scene; this.pool = []; this.max = max;
  }
  spawn(rig, color = 0xff1030, life = 0.32, alpha = 0.45) {
    let g = this.pool.find((x) => x.t <= 0 && x.rig === rig);
    if (!g) {
      if (this.pool.filter((x) => x.rig === rig).length >= this.max) g = this.pool.filter((x) => x.rig === rig).sort((a, b) => a.t - b.t)[0];
      else {
        const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false });
        const grp = new THREE.Group(); const parts = rig.meshes.map((m) => { const c = new THREE.Mesh(m.geometry, mat); c.matrixAutoUpdate = false; grp.add(c); return c; });
        g = { rig, grp, parts, mat, t: 0, life }; this.scene.add(grp); this.pool.push(g);
      }
    }
    rig.root.updateMatrixWorld(true);
    g.parts.forEach((c, i) => { c.matrix.copy(rig.meshes[i].matrixWorld); });
    g.mat.color.setHex(color); g.t = life; g.life = life; g.alpha = alpha; g.grp.visible = true;
  }
  update(dt) { for (const g of this.pool) { if (g.t <= 0) { g.grp.visible = false; continue; } g.t -= dt; g.mat.opacity = Math.max(0, g.t / g.life) * g.alpha; } }
}

// 地面预警：圆 / 扇形 / 长条，填充进度 = 出手时机
const dVS = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `;
const dFS = `varying vec2 vUv; uniform float prog; uniform float shape; uniform float arc; uniform vec3 col; uniform float fade;
void main(){ vec2 p=vUv*2.0-1.0; float a=0.0; float edge=0.0; float fill=0.0;
 if(shape<0.5){ float r=length(p); if(r>1.0) discard; edge=smoothstep(0.9,1.0,r); fill=step(r,prog); }
 else if(shape<1.5){ float r=length(p); float ang=abs(atan(p.x,p.y)); if(r>1.0||ang>arc) discard; edge=max(smoothstep(0.9,1.0,r),smoothstep(arc-0.06,arc,ang)); fill=step(r,prog); }
 else { if(abs(p.x)>1.0||p.y<-1.0||p.y>1.0) discard; float y=(p.y+1.0)*0.5; edge=max(smoothstep(0.85,1.0,abs(p.x)), step(0.97,y)); fill=step(y,prog); }
 a = (0.18 + 0.35*fill + 0.6*edge) * fade; gl_FragColor=vec4(col*a, a); }`;
export class Decals {
  constructor(scene, max = 16) {
    this.list = [];
    for (let i = 0; i < max; i++) {
      const mat = new THREE.ShaderMaterial({ vertexShader: dVS, fragmentShader: dFS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { prog: { value: 0 }, shape: { value: 0 }, arc: { value: 1 }, col: { value: new THREE.Color(0xff2030) }, fade: { value: 1 } } });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 2;
      const holder = new THREE.Group(); holder.add(m); scene.add(holder);
      this.list.push({ holder, m, mat, on: false, t: 0, dur: 1, owner: null });
    }
  }
  // shape: 'circle'(r) / 'sector'(r, arc半角) / 'rect'(w, len)，pos 为起点，yaw 为方向
  show(shape, pos, yaw, a, b, dur, owner, color = 0xff2030) {
    const d = this.list.find((x) => !x.on) || this.list[0];
    d.on = true; d.t = 0; d.dur = dur; d.owner = owner; d.follow = null;
    d.holder.position.set(pos.x, 0.03, pos.z); d.holder.rotation.y = yaw; d.m.visible = true;
    const u = d.mat.uniforms; u.col.value.setHex(color); u.fade.value = 1;
    if (shape === 'circle') { u.shape.value = 0; d.m.scale.set(a, a, 1); d.m.position.set(0, 0, 0); }
    else if (shape === 'sector') { u.shape.value = 1; u.arc.value = b; d.m.scale.set(a, a, 1); d.m.position.set(0, 0, 0); }
    else { u.shape.value = 2; d.m.scale.set(a / 2, b / 2, 1); d.m.position.set(0, 0, b / 2); }
    return d;
  }
  hide(owner) { for (const d of this.list) if (d.owner === owner) { d.on = false; d.m.visible = false; } }
  update(dt) {
    for (const d of this.list) { if (!d.on) continue; d.t += dt; d.mat.uniforms.prog.value = Math.min(1, d.t / d.dur);
      if (d.t > d.dur) { d.mat.uniforms.fade.value = Math.max(0, 1 - (d.t - d.dur) / 0.15); if (d.t > d.dur + 0.15) { d.on = false; d.m.visible = false; } } }
  }
}

// 冲击环（扩散的发光圆环）
export class Rings {
  constructor(scene, max = 10) {
    this.list = [];
    const geo = new THREE.RingGeometry(0.85, 1, 48); geo.rotateX(-Math.PI / 2);
    for (let i = 0; i < max; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xff2040, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const m = new THREE.Mesh(geo, mat); m.visible = false; scene.add(m); this.list.push({ m, t: 0, life: 0.4, r0: 0.5, r1: 4 });
    }
  }
  spawn(pos, r1 = 4, life = 0.4, color = 0xff2040, y = 0.08) {
    const r = this.list.find((x) => x.t <= 0) || this.list[0];
    r.t = life; r.life = life; r.r1 = r1; r.m.position.set(pos.x, (pos.y || 0) + y, pos.z); r.m.material.color.setHex(color); r.m.visible = true;
  }
  update(dt) { for (const r of this.list) { if (r.t <= 0) { r.m.visible = false; continue; } r.t -= dt; const p = 1 - r.t / r.life; const e = 1 - Math.pow(1 - p, 3); r.m.scale.setScalar(0.3 + r.r1 * e); r.m.material.opacity = (1 - p) * 0.9; } }
}

// 血雾 + 火花 组合发射器
export class HitFX {
  constructor(scene, quality) {
    const q = quality === 'low' ? 0.5 : 1;
    this.mist = new Particles(scene, Math.round(700 * q), false);
    this.spark = new Particles(scene, Math.round(500 * q), true);
    this.q = q;
  }
  blood(p, dir, power = 1) {
    const n = Math.round((10 + 14 * power) * this.q);
    for (let i = 0; i < n; i++) {
      const s = 1.5 + Math.random() * 4 * power; const sp = 0.8;
      const vx = dir.x * s + (Math.random() - 0.5) * 3 * sp, vy = 0.6 + Math.random() * 2.5, vz = dir.z * s + (Math.random() - 0.5) * 3 * sp;
      const dark = 0.25 + Math.random() * 0.4;
      this.mist.emit(p.x, p.y, p.z, vx, vy, vz, { r: 0.45 * dark + 0.08, g: 0.0, b: 0.02, size: 0.09 + Math.random() * 0.14, grow: 0.45 + Math.random() * 0.4, life: 0.45 + Math.random() * 0.5, drag: 3.5, grav: 1.2, alpha: 0.75 });
    }
    const m = Math.round((6 + 8 * power) * this.q);
    for (let i = 0; i < m; i++) {
      const s = 4 + Math.random() * 8;
      this.spark.emit(p.x, p.y, p.z, dir.x * s + (Math.random() - 0.5) * 6, (Math.random() - 0.2) * 6, dir.z * s + (Math.random() - 0.5) * 6, { r: 1, g: 0.15 + Math.random() * 0.2, b: 0.2, size: 0.06 + Math.random() * 0.06, life: 0.15 + Math.random() * 0.2, drag: 5, grav: 8 });
    }
  }
  burst(p, color = [1, 0.1, 0.2], n = 30, speed = 7, size = 0.1) {
    n = Math.round(n * this.q);
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, s = speed * (0.4 + Math.random() * 0.6), r = Math.sqrt(1 - u * u);
      this.spark.emit(p.x, p.y, p.z, Math.cos(a) * r * s, u * s, Math.sin(a) * r * s, { r: color[0], g: color[1], b: color[2], size: size * (0.6 + Math.random()), life: 0.25 + Math.random() * 0.35, drag: 3, grav: 2 }); }
  }
  aura(p, n = 2) {
    for (let i = 0; i < n * this.q + Math.random(); i++) this.mist.emit(p.x + (Math.random() - 0.5) * 0.6, p.y + Math.random() * 1.4, p.z + (Math.random() - 0.5) * 0.6, 0, 0.8 + Math.random(), 0, { r: 0.5, g: 0.0, b: 0.06, size: 0.12, grow: 0.3, life: 0.5, drag: 1, grav: -0.5, alpha: 0.45 });
  }
  update(dt) { this.mist.update(dt); this.spark.update(dt); }
  setScale(s) { this.mist.mat.uniforms.uScale.value = s; this.spark.mat.uniforms.uScale.value = s; }
}
