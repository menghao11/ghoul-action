import * as THREE from 'three';
import { TYPES, N } from './names.js';
const $ = (id) => document.getElementById(id);
export class Hud {
  constructor(world) {
    this.w = world; this.combo = 0; this.comboT = 0; this.moveT = 0;
    const types = $('types');
    TYPES.forEach((t, i) => { const b = document.createElement('button'); b.innerHTML = `<small>${i + 1}</small>${t.name}`; b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); world.input.press('type' + i); }); types.appendChild(b); });
    this.typeBtns = [...types.children];
    this.dmgPool = []; const layer = $('dmgLayer');
    for (let i = 0; i < 28; i++) { const d = document.createElement('div'); d.style.display = 'none'; layer.appendChild(d); this.dmgPool.push({ el: d, t: 0, pos: new THREE.Vector3() }); }
    this.barPool = []; for (let i = 0; i < 10; i++) { const d = document.createElement('div'); d.style.cssText = 'position:absolute;width:46px;height:4px;margin-left:-23px;background:rgba(0,0,0,.6);display:none'; const f = document.createElement('i'); f.style.cssText = 'display:block;height:100%;background:#e8e8f0'; d.appendChild(f); layer.appendChild(d); this.barPool.push({ el: d, fill: f }); }
    this._v = new THREE.Vector3(); this.bannerT = 0;
    $('heroName').textContent = N.hero;
  }
  flashType(i) { this.typeBtns.forEach((b, k) => b.classList.toggle('on', k === i)); $('typeName').textContent = TYPES[i].full + ' · ' + TYPES[i].desc; }
  moveName(n) { $('moveName').textContent = n; this.moveT = 0.9; }
  addCombo() { this.combo++; this.comboT = 2.2; }
  dmg(pos, v, cls = '') {
    const d = this.dmgPool.find((x) => x.t <= 0) || this.dmgPool[0];
    d.t = 0.7; d.pos.copy(pos); d.pos.x += (Math.random() - 0.5) * 0.6; d.el.textContent = cls === 'heal' ? '+' + Math.round(v) : Math.round(v); d.el.className = cls; d.el.style.display = 'block';
  }
  banner(text, sub = '', dur = 1.6) { const b = $('banner'); b.innerHTML = text + (sub ? `<small>${sub}</small>` : ''); b.classList.add('on'); this.bannerT = dur; }
  objective(t) { $('objective').textContent = t; }
  project(pos, out) { const v = this._v.copy(pos).project(this.w.camera); if (v.z > 1) return false; out.x = (v.x * 0.5 + 0.5) * innerWidth; out.y = (-v.y * 0.5 + 0.5) * innerHeight; return true; }
  update(dt) {
    const w = this.w, P = w.player;
    $('hpFill').style.width = (P.hp / P.maxHp * 100) + '%'; $('hpText').textContent = Math.ceil(P.hp);
    const en = $('enFill'); en.style.width = (P.awake > 0 ? 100 : P.energy) + '%'; en.parentElement.classList.toggle('full', P.energy >= 100 && P.awake <= 0);
    $('enText').textContent = P.awake > 0 ? '绯魇中 · 再按释放终焉' : P.energy >= 100 ? '绯魇 就绪（F）' : '血绫能量';
    const ub = document.querySelector('.tb.ult'); if (ub) { ub.classList.toggle('ready', P.energy >= 100 || P.awake > 0); ub.textContent = P.awake > 0 ? '终焉' : '绯魇'; }
    $('awakenTimer').classList.toggle('hidden', !(P.awake > 0)); $('awFill').style.width = (P.awake / P.awakeMax * 100) + '%';
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }
    $('combo').classList.toggle('hidden', this.combo < 2); $('comboNum').textContent = this.combo;
    if (this.moveT > 0) { this.moveT -= dt; if (this.moveT <= 0) $('moveName').textContent = ''; }
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) $('banner').classList.remove('on'); }
    const boss = w.enemies.find((e) => e.isBoss && e.alive);
    $('bossbar').classList.toggle('hidden', !boss);
    if (boss) { $('bossName').textContent = boss.name; $('bossFill').style.width = (boss.hp / boss.maxHp * 100) + '%'; $('bossPoise').style.width = (boss.poise / boss.maxPoise * 100) + '%'; $('bossPhase').textContent = ['', '第一阶段', '第二阶段 · 猎械解放', '第三阶段 · 狂猎'][boss.phase] + (boss.state === 'stagger' ? ' · 破防！' : ''); }
    // 锁定标记
    const lt = w.cam.lockTarget; const lm = $('lockmark'); const o = {};
    if (lt && lt.alive && this.project(this._v.copy(lt.pos).setY(lt.pos.y + lt.height * 0.6), o)) { lm.classList.remove('hidden'); lm.style.transform = `translate(${o.x}px,${o.y}px) rotate(45deg)`; } else lm.classList.add('hidden');
    // 伤害数字
    for (const d of this.dmgPool) { if (d.t <= 0) continue; d.t -= dt; if (d.t <= 0) { d.el.style.display = 'none'; continue; } d.pos.y += dt * 1.4; if (this.project(d.pos, o)) { d.el.style.transform = `translate(${o.x}px,${o.y}px) translate(-50%,-50%) scale(${1 + Math.max(0, d.t - 0.55) * 3})`; d.el.style.opacity = Math.min(1, d.t * 3); } }
    // 杂兵血条
    let bi = 0;
    for (const e of w.enemies) { if (!e.alive || e.isBoss || bi >= this.barPool.length) continue; const b = this.barPool[bi]; if (e.hp < e.maxHp && this.project(this._v.copy(e.pos).setY(e.pos.y + e.height + 0.35), o)) { b.el.style.display = 'block'; b.el.style.left = o.x + 'px'; b.el.style.top = o.y + 'px'; b.fill.style.width = (e.hp / e.maxHp * 100) + '%'; bi++; } }
    for (; bi < this.barPool.length; bi++) this.barPool[bi].el.style.display = 'none';
  }
}
