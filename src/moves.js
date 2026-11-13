// 招式数据：时间单位秒。hits 为离散判定事件；cancel 之后可接任意招（输入缓冲），dodgeCancel 之后可闪避取消。
// tendril: 血绫动作 kind + 参数（只影响视觉）；判定由 hits 决定，二者时间轴对齐。
const D = Math.PI / 180;
const base = (o) => Object.assign({ dur: 0.5, cancel: 0.3, dodgeCancel: 0.05, hits: [], lunge: null, pose: 'slash', side: 1, tendril: null, proj: null, heal: 0, air: false }, o);
const h = (t, dmg, o = {}) => Object.assign({ t, dmg, range: 3.2, arc: 70 * D, y0: -0.6, y1: 2.6, kb: 3, up: 0, stun: 0.35, hs: 0.05 }, o);

export function buildMoves(type) {
  const M = {};
  if (type === 'balanced') { // 游龙：横扫 + 突刺，判定宽
    M.L1 = base({ dur: 0.42, cancel: 0.2, pose: 'slash', side: 1, lunge: [0, 0.14, 1.4], hits: [h(0.13, 18, { range: 3.8, arc: 85 * D })], tendril: { kind: 'swing', a0: -110, a1: 100, d: 3.0, h0: 1.2, h1: 0.8, t0: 0.06, t1: 0.2 } });
    M.L2 = base({ dur: 0.42, cancel: 0.2, pose: 'slash', side: -1, lunge: [0, 0.14, 1.4], hits: [h(0.13, 18, { range: 3.8, arc: 85 * D })], tendril: { kind: 'swing', a0: 110, a1: -100, d: 3.0, h0: 0.6, h1: 1.3, t0: 0.06, t1: 0.2 } });
    M.L3 = base({ dur: 0.46, cancel: 0.24, pose: 'thrust', lunge: [0, 0.16, 2.2], hits: [h(0.15, 24, { range: 5.0, arc: 28 * D, kb: 5 })], tendril: { kind: 'thrust', a: 0, d: 4.8, h: 1.0, t0: 0.08, t1: 0.2 } });
    M.L4 = base({ dur: 0.6, cancel: 0.34, pose: 'spin', lunge: [0, 0.2, 1.0], hits: [h(0.14, 16, { range: 3.8, arc: Math.PI }), h(0.26, 22, { range: 3.8, arc: Math.PI, kb: 6, hs: 0.08 })], tendril: { kind: 'spin', a0: 0, turns: 1.3, d: 3.0, h: 0.9, t0: 0.08, t1: 0.32 } });
    M.H = base({ name: 'balanced_H', dur: 0.72, cancel: 0.46, pose: 'thrust', lunge: [0.18, 0.32, 4.5], hits: [h(0.28, 46, { range: 7.0, arc: 22 * D, kb: 9, hs: 0.1, stun: 0.6, pierce: true })], tendril: { kind: 'thrust', a: 0, d: 6.5, h: 1.0, t0: 0.2, t1: 0.36, pre: true } });
    M.S = base({ name: 'balanced_S', dur: 1.05, cancel: 0.8, pose: 'spin', hits: [h(0.18, 20, { range: 4.4, arc: Math.PI }), h(0.36, 20, { range: 4.4, arc: Math.PI }), h(0.54, 20, { range: 4.4, arc: Math.PI }), h(0.8, 50, { range: 7.5, arc: 25 * D, kb: 10, hs: 0.12, stun: 0.7 })], lunge: [0.66, 0.82, 3.0], tendril: { kind: 'spin', a0: 0, turns: 2.2, d: 3.6, h: 0.8, t0: 0.1, t1: 0.62, then: { kind: 'thrust', a: 0, d: 6.8, h: 1.0, t0: 0.7, t1: 0.86 } } });
  } else if (type === 'heavy') { // 磐盾：慢、重、硬直大
    M.L1 = base({ dur: 0.55, cancel: 0.3, pose: 'slash', side: 1, lunge: [0.04, 0.2, 1.4], hits: [h(0.2, 30, { range: 3.4, arc: 75 * D, kb: 5, hs: 0.08, stun: 0.5 })], tendril: { kind: 'swing', a0: -80, a1: 90, d: 2.6, h0: 2.2, h1: 0.4, t0: 0.12, t1: 0.26 } });
    M.L2 = base({ dur: 0.55, cancel: 0.3, pose: 'slash', side: -1, lunge: [0.04, 0.2, 1.4], hits: [h(0.2, 30, { range: 3.4, arc: 75 * D, kb: 5, hs: 0.08, stun: 0.5 })], tendril: { kind: 'swing', a0: 80, a1: -90, d: 2.6, h0: 2.2, h1: 0.4, t0: 0.12, t1: 0.26 } });
    M.L3 = base({ dur: 0.62, cancel: 0.36, pose: 'slam', lunge: [0.06, 0.24, 1.6], hits: [h(0.26, 36, { range: 3.6, arc: 45 * D, kb: 6, hs: 0.1, stun: 0.6 })], tendril: { kind: 'slam', d: 2.8, t0: 0.12, t1: 0.3 } });
    M.L4 = base({ dur: 0.75, cancel: 0.46, pose: 'slam', lunge: [0.1, 0.3, 1.8], hits: [h(0.32, 50, { range: 4.2, arc: Math.PI, kb: 9, hs: 0.13, stun: 0.8, ring: 4.2 })], tendril: { kind: 'slam', d: 2.4, t0: 0.16, t1: 0.36 } });
    M.H = base({ name: 'heavy_H', dur: 0.95, cancel: 0.62, pose: 'slam', lunge: [0.2, 0.42, 2.2], hits: [h(0.44, 70, { range: 5.0, arc: Math.PI, kb: 11, up: 4, hs: 0.16, stun: 0.9, ring: 5.2 })], tendril: { kind: 'slam', d: 2.6, t0: 0.26, t1: 0.48, high: 4 } });
    M.S = base({ name: 'heavy_S', guard: true, dur: 9, cancel: 0, pose: 'guard', tendril: { kind: 'guard' } });
    M.bash = base({ name: 'heavy_bash', dur: 0.6, cancel: 0.36, pose: 'thrust', lunge: [0, 0.18, 2.5], hits: [h(0.16, 55, { range: 3.6, arc: 70 * D, kb: 10, hs: 0.14, stun: 1.0 })], tendril: { kind: 'thrust', a: 0, d: 3.0, h: 1.0, t0: 0.06, t1: 0.2, wide: true } });
  } else if (type === 'burst') { // 狂澜：快、多段、吸血
    const st = (side, a) => ({ kind: 'flurry', d: 2.6, h: 1.0, rate: 3, t0: 0.03, t1: 0.2, side, a });
    M.L1 = base({ dur: 0.3, cancel: 0.13, heal: 0.12, pose: 'slash', side: 1, lunge: [0, 0.1, 1.1], hits: [h(0.07, 9, { hs: 0.03, stun: 0.3 }), h(0.14, 9, { hs: 0.03 })], tendril: st(1, 20) });
    M.L2 = base({ dur: 0.3, cancel: 0.13, heal: 0.12, pose: 'slash', side: -1, lunge: [0, 0.1, 1.1], hits: [h(0.07, 9, { hs: 0.03 }), h(0.14, 9, { hs: 0.03 })], tendril: st(-1, -20) });
    M.L3 = base({ dur: 0.32, cancel: 0.14, heal: 0.12, pose: 'thrust', lunge: [0, 0.12, 1.4], hits: [h(0.06, 8, { hs: 0.03 }), h(0.12, 8, { hs: 0.03 }), h(0.18, 8, { hs: 0.03 })], tendril: st(1, 0) });
    M.L4 = base({ dur: 0.48, cancel: 0.26, heal: 0.12, pose: 'spin', lunge: [0, 0.16, 1.6], hits: [h(0.1, 10, { arc: Math.PI }), h(0.18, 10, { arc: Math.PI }), h(0.26, 18, { arc: Math.PI, kb: 6, hs: 0.07 })], tendril: { kind: 'spin', a0: 0, turns: 1.6, d: 2.6, h: 1.0, t0: 0.04, t1: 0.3 } });
    M.H = base({ name: 'burst_H', dur: 0.8, cancel: 0.5, heal: 0.15, pose: 'thrust', lunge: [0.0, 0.3, 2.0], hits: [0.08, 0.14, 0.2, 0.26, 0.32].map((t) => h(t, 8, { hs: 0.025, stun: 0.4 })).concat([h(0.46, 40, { range: 3.6, arc: Math.PI, kb: 9, hs: 0.12, stun: 0.7, ring: 3.8, boom: true })]), tendril: { kind: 'flurry', d: 2.8, h: 1.0, rate: 6, t0: 0.04, t1: 0.4, side: 1, a: 0 } });
    M.S = base({ name: 'burst_S', dur: 1.0, cancel: 0.78, heal: 0.35, pose: 'thrust', lunge: [0.02, 0.7, 7.0], ghost: true, hits: Array.from({ length: 8 }, (_, i) => h(0.08 + i * 0.08, 11, { range: 2.8, arc: 80 * D, hs: 0.02, stun: 0.45, kb: 1 })), tendril: { kind: 'flurry', d: 2.4, h: 1.0, rate: 8, t0: 0.03, t1: 0.75, side: 1, a: 0 } });
  } else { // ranged 星屑：近身翼扫 + 晶刺
    M.L1 = base({ dur: 0.38, cancel: 0.18, pose: 'cast', lunge: [0, 0.12, 0.8], hits: [h(0.12, 12, { range: 2.8, arc: 70 * D })], proj: [{ t: 0.12, n: 1, spread: 0, dmg: 10 }], tendril: { kind: 'swing', a0: -70, a1: 60, d: 2.4, h0: 1.8, h1: 1.0, t0: 0.05, t1: 0.18 } });
    M.L2 = base({ dur: 0.38, cancel: 0.18, pose: 'cast', lunge: [0, 0.12, 0.8], hits: [h(0.12, 12, { range: 2.8, arc: 70 * D })], proj: [{ t: 0.12, n: 1, spread: 0, dmg: 10 }], tendril: { kind: 'swing', a0: 70, a1: -60, d: 2.4, h0: 1.8, h1: 1.0, t0: 0.05, t1: 0.18 } });
    M.L3 = base({ dur: 0.42, cancel: 0.2, pose: 'cast', hits: [], proj: [{ t: 0.1, n: 2, spread: 10, dmg: 10 }, { t: 0.2, n: 2, spread: 14, dmg: 10 }], tendril: { kind: 'cast', t0: 0.04, t1: 0.25 } });
    M.L4 = base({ dur: 0.55, cancel: 0.3, pose: 'spin', hits: [h(0.18, 20, { range: 3.2, arc: Math.PI, kb: 6, hs: 0.07 })], proj: [{ t: 0.2, n: 6, spread: 360, dmg: 9 }], tendril: { kind: 'spin', a0: 0, turns: 1, d: 2.6, h: 1.4, t0: 0.06, t1: 0.28 } });
    M.H = base({ name: 'ranged_H', dur: 0.62, cancel: 0.4, pose: 'cast', hits: [], proj: [{ t: 0.22, n: 5, spread: 40, dmg: 16, speed: 30 }], tendril: { kind: 'cast', t0: 0.1, t1: 0.3, wide: true } });
    M.S = base({ name: 'ranged_S', dur: 1.0, cancel: 0.82, pose: 'cast', hang: true, hits: [], proj: Array.from({ length: 6 }, (_, i) => ({ t: 0.12 + i * 0.1, n: 2, spread: 30, dmg: 13, homing: 1 })), tendril: { kind: 'cast', t0: 0.05, t1: 0.8, wide: true, pulse: true } });
  }
  // 通用：升绫（挑空）、空中连段、坠星、闪反、瞬影反击、终焉
  M.launch = base({ name: 'launch', dur: 0.55, cancel: 0.26, pose: 'uppercut', lunge: [0, 0.14, 1.2], hits: [h(0.14, 22, { range: 3.2, arc: 70 * D, up: 11.5, kb: 0.5, hs: 0.08, stun: 0.8, launch: true })], tendril: { kind: 'rise', d: 1.8, t0: 0.06, t1: 0.22 } });
  const air = (side, a0, a1) => base({ air: true, hang: true, dur: 0.34, cancel: 0.16, pose: 'slash', side, lunge: [0, 0.1, 0.9], hits: [h(0.1, 16, { range: 3.2, arc: 80 * D, y0: -2.0, y1: 2.5, up: 3.6, kb: 0.6, stun: 0.6, hs: 0.05 })], tendril: { kind: 'swing', a0, a1, d: 2.6, h0: 1.4, h1: 0.4, t0: 0.03, t1: 0.16 } });
  M.airL1 = air(1, -100, 90); M.airL2 = air(-1, 100, -90); M.airL3 = air(1, -120, 120);
  M.airL3.hits[0].up = 4.2; M.airL3.hits[0].dmg = 20;
  M.airH = base({ name: 'airH', air: true, dur: 1.2, cancel: 9, pose: 'slam', slam: true, hits: [], tendril: { kind: 'down', t0: 0.0, t1: 0.2 } });
  M.airH_land = base({ dur: 0.4, cancel: 0.2, pose: 'slam', hits: [h(0.0, 36, { range: 3.8, arc: Math.PI, kb: 7, up: 5, hs: 0.12, stun: 0.8, ring: 4, slamDown: true })], tendril: { kind: 'slam', d: 2.2, t0: 0, t1: 0.08 } });
  M.counter = base({ name: 'counter', dur: 0.5, cancel: 0.24, pose: 'thrust', lunge: [0, 0.12, 4.0], ghost: true, hits: [h(0.12, 40, { range: 3.4, arc: 70 * D, kb: 6, hs: 0.11, stun: 0.8 })], tendril: { kind: 'thrust', a: 0, d: 3.4, h: 1.0, t0: 0.04, t1: 0.16 } });
  M.pcounter = base({ name: 'pcounter', dur: 0.75, cancel: 0.4, pose: 'spin', teleport: true, ghost: true, hits: [h(0.1, 30, { range: 3.6, arc: Math.PI, hs: 0.06 }), h(0.22, 30, { range: 3.6, arc: Math.PI, hs: 0.06 }), h(0.34, 50, { range: 3.8, arc: Math.PI, up: 9, launch: true, hs: 0.14, stun: 1 })], tendril: { kind: 'spin', a0: 0, turns: 1.6, d: 3.0, h: 1.0, t0: 0.04, t1: 0.36 } });
  M.finisher = base({ name: 'finisher', dur: 2.0, cancel: 1.9, pose: 'ult', finisher: true, hang: true, hits: [0.5, 0.65, 0.8, 0.95, 1.1].map((t) => h(t, 40, { range: 14, arc: Math.PI, y0: -3, y1: 6, hs: 0.04, stun: 1.0, kb: 0, homingAll: true })).concat([h(1.45, 260, { range: 14, arc: Math.PI, y0: -3, y1: 6, hs: 0.3, stun: 1.6, kb: 12, up: 6, homingAll: true, ring: 10 })]), tendril: { kind: 'finisher', t0: 0.3, t1: 1.5 } });
  return M;
}
