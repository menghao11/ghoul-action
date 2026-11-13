// 极简 WebAudio 合成音效（iOS 需首次触摸解锁）
export class Sfx {
  constructor() { this.ctx = null; this.on = true; this.last = {}; }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { const AC = window.AudioContext || window.webkitAudioContext; this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5; this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate); const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const b = this.ctx.createBufferSource(); b.buffer = this.ctx.createBuffer(1, 1, 22050); b.connect(this.master); b.start(0);
    } catch (e) { this.ctx = null; }
  }
  _ok(name, gap = 0.03) { if (!this.ctx || !this.on) return false; const t = this.ctx.currentTime; if (this.last[name] && t - this.last[name] < gap) return false; this.last[name] = t; return true; }
  _noise(dur, f0, f1, q, vol, type = 'bandpass') {
    const c = this.ctx, t = c.currentTime, s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + dur + 0.02);
  }
  _tone(dur, f0, f1, vol, type = 'sine') {
    const c = this.ctx, t = c.currentTime, o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  whoosh(p = 1) { if (this._ok('wh', 0.05)) this._noise(0.18, 600 * p, 2400 * p, 1.2, 0.25); }
  hit(power = 1) { if (!this._ok('hit', 0.025)) return; this._noise(0.12 + 0.08 * power, 2200, 300, 0.8, 0.45 * Math.min(1.5, power)); this._tone(0.15 + 0.1 * power, 160, 45, 0.5 * Math.min(1.4, power)); }
  shard() { if (this._ok('sh', 0.04)) this._tone(0.12, 1800, 700, 0.12, 'triangle'); }
  block() { if (this._ok('bl', 0.05)) { this._tone(0.25, 900, 600, 0.25, 'square'); this._noise(0.1, 3000, 1500, 2, 0.3); } }
  slow() { if (this._ok('slow', 0.3)) { this._tone(0.9, 300, 60, 0.35, 'sawtooth'); this._noise(0.6, 4000, 200, 0.6, 0.2); } }
  awaken() { if (this._ok('aw', 0.5)) { this._tone(1.2, 80, 30, 0.6, 'sawtooth'); this._noise(1.0, 200, 3000, 0.5, 0.35, 'lowpass'); } }
  hurt() { if (this._ok('hu', 0.1)) this._tone(0.2, 300, 90, 0.3, 'square'); }
  warn() { if (this._ok('warn', 0.15)) this._tone(0.12, 1200, 1100, 0.08, 'sine'); }
}
