// 背景音乐管理：按游戏状态交叉淡入淡出（探索→战斗→Boss→三阶段→胜利），绯魇 15s 叠加层，
// 读取 audio/MANIFEST.md（或 manifest.json）里的循环点 / BPM，三阶段在节拍上切换；
// iOS 首次手势解锁；音乐/音效音量可调并保存；没有音频文件时静默降级（不报错、不影响游戏）。
export const SLOTS = ['explore', 'battle', 'boss', 'phase3', 'awaken', 'awakenBoss', 'victory'];
const KEYS = {
  phase3: ['phase3', 'phase_3', 'p3', '三阶段', '狂猎', 'final'],
  awaken: ['awaken', '绯魇', 'overlay', 'layer', 'ult'],
  victory: ['victory', 'win', '胜利', 'clear', '通关'],
  boss: ['boss', '铁衡', '首席'],
  battle: ['battle', 'grunt', 'combat', 'fight', '战斗', '杂兵'],
  explore: ['explore', 'title', 'menu', 'ambient', '探索', '标题', '主题'],
};
const VOL_KEY = 'ghoul_volume';

// 解析清单：优先 JSON（独立 json 或 md 里的 ```json 代码块），否则逐行从 Markdown 里抽文件名与循环点
// 声音王交付的曲目（audio/MANIFEST.md）。循环 = 整个文件，loopEnd 必须用母带采样数 ÷ 44100 显式设置（M4A 尾部有补零）。
export const DELIVERED = {
  explore: { base: 'bgm_title_explore', loopEndSamples: 2352000, bpm: 72 },
  battle: { base: 'bgm_battle', loopEndSamples: 2116800, bpm: 160 },
  boss: { base: 'bgm_boss_tieheng_a', loopEndSamples: 2257920, bpm: 150 },
  phase3: { base: 'bgm_boss_tieheng_b', loopEndSamples: 2257920, bpm: 150, sections: [0, 12.8, 25.6, 38.4] },
  awaken: { base: 'layer_feiyan', loopEndSamples: 661500, bpm: 160, layerFor: 'battle' },
  awakenBoss: { base: 'layer_feiyan_boss', loopEndSamples: 705600, bpm: 150, layerFor: 'boss' }, // Boss 战版绯魇层（150 BPM / C）
  victory: { base: 'victory_sting', oneShot: true },
};
const SRC_RATE = 44100;
export function parseManifest(txt) {
  const out = {};
  // 1) 认出声音王的清单：按文件基名匹配，并从同一行读"(N samples)"覆盖循环长度
  for (const [slot, d] of Object.entries(DELIVERED)) {
    const line = txt.split(/\r?\n/).find((l) => l.includes('`' + d.base + '`') || l.includes(d.base + '.ogg') || l.includes(d.base + '.m4a'));
    if (!line) continue;
    const t = { files: [d.base + '.ogg', d.base + '.m4a'], loopStart: 0, bpm: d.bpm, beatsPerBar: 4 };
    const m = line.match(/\((\d{4,})\s*samples\)/); const smp = m ? +m[1] : d.loopEndSamples;
    if (d.oneShot) t.oneShot = true; else { t.loopEndSamples = smp; t.loopEnd = smp / SRC_RATE; }
    if (d.sections) t.sections = d.sections; if (d.layerFor) t.layerFor = d.layerFor;
    out[slot] = t;
  }
  if (Object.keys(out).length) return out;
  const tryJson = (s) => { try { return JSON.parse(s); } catch (e) { return null; } };
  let j = tryJson(txt); if (!j) { const m = txt.match(/```json\s*([\s\S]*?)```/i); if (m) j = tryJson(m[1]); }
  const norm = (o, slot) => {
    if (!o || !slot) return; const t = out[slot] || (out[slot] = { files: [] });
    const fs = [].concat(o.files || [], o.ogg || [], o.m4a || [], o.file || [], o.src || [], o.url || []).filter(Boolean); t.files.push(...fs);
    const num = (...k) => { for (const x of k) if (o[x] !== undefined && o[x] !== null && !isNaN(+o[x])) return +o[x]; };
    const sr = num('sampleRate', 'sample_rate') || 0;
    let ls = num('loopStart', 'loop_start', 'loopStartSec', 'loop_start_sec'), le = num('loopEnd', 'loop_end', 'loopEndSec', 'loop_end_sec');
    const lss = num('loopStartSamples', 'loop_start_samples'), les = num('loopEndSamples', 'loop_end_samples');
    if (ls === undefined && lss !== undefined) t.loopStartSamples = lss; if (le === undefined && les !== undefined) t.loopEndSamples = les;
    if (sr) { if (lss !== undefined) ls = lss / sr; if (les !== undefined) le = les / sr; }
    if (Array.isArray(o.loop)) { ls = +o.loop[0]; le = +o.loop[1]; }
    if (ls !== undefined) t.loopStart = ls; if (le !== undefined) t.loopEnd = le;
    const bpm = num('bpm', 'BPM', 'tempo'); if (bpm) t.bpm = bpm; const beats = num('beatsPerBar', 'beats_per_bar'); if (beats) t.beatsPerBar = beats;
    const off = num('beatOffset', 'beat_offset', 'downbeat', 'offset'); if (off !== undefined) t.beatOffset = off;
    const vol = num('volume', 'gain'); if (vol !== undefined) t.gain = vol;
  };
  if (j) {
    const tr = j.tracks || j;
    if (Array.isArray(tr)) for (const o of tr) norm(o, slotOf([o.id, o.slot, o.name, o.title, o.key, o.file, o.ogg, o.m4a].filter(Boolean).join(' ')));
    else for (const [k, o] of Object.entries(tr)) if (o && typeof o === 'object') norm(o, slotOf(k + ' ' + (o.slot || '')));
  }
  if (!Object.keys(out).length) {
    // Markdown：每行（表格行或列表）可能含文件名、loop 起止、BPM
    let section = null;
    for (const line of txt.split(/\r?\n/)) {
      if (/^#{1,6}\s/.test(line)) { const s = slotOf(line); if (s) section = s; }
      const files = line.match(/[\w\-./\u4e00-\u9fa5]+\.(?:ogg|m4a|mp3|aac|wav)/gi); const slot = (files && slotOf(files.join(' '))) || slotOf(line) || section;
      if (!slot) continue; const t = out[slot] || (out[slot] = { files: [] });
      if (files) t.files.push(...files);
      const l = line.toLowerCase();
      let m = l.match(/loop[ _-]?start[^\d]{0,12}([\d.]+)/); if (m) t.loopStart = +m[1];
      m = l.match(/loop[ _-]?end[^\d]{0,12}([\d.]+)/); if (m) t.loopEnd = +m[1];
      m = l.match(/(?:loop|循环)[^\d\n]{0,16}([\d.]+)\s*s?\s*(?:-|–|—|~|→|to|至)\s*([\d.]+)/); if (m) { t.loopStart = +m[1]; t.loopEnd = +m[2]; }
      m = l.match(/([\d.]+)\s*bpm/) || l.match(/bpm[^\d]{0,6}([\d.]+)/); if (m) t.bpm = +m[1];
    }
  }
  for (const k of Object.keys(out)) { out[k].files = [...new Set(out[k].files)]; if (!out[k].files.length) delete out[k]; }
  return out;
}
function slotOf(s) { s = String(s).toLowerCase(); for (const k of ['phase3', 'awaken', 'victory', 'boss', 'battle', 'explore']) if (KEYS[k].some((w) => s.includes(w))) return k; return null; }

export class Music {
  constructor(sfx, base = 'audio/') {
    this.sfx = sfx; this.base = base; this.tracks = {}; this.buf = {}; this.status = 'idle'; this.cur = null; this.want = 'explore';
    this.layerOn = false; this.voices = {}; this.history = []; this.lastBattle = -99; this.errors = [];
    this.vol = { music: 0.7, sfx: 0.8 }; try { Object.assign(this.vol, JSON.parse(localStorage.getItem(VOL_KEY) || '{}')); } catch (e) {}
    this.manifestP = this.loadManifest();
  }
  async loadManifest() {
    for (const f of ['MANIFEST.md', 'manifest.json']) {
      try { const r = await fetch(this.base + f, { cache: 'no-cache' }); if (!r.ok) continue; this.tracks = parseManifest(await r.text()); break; } catch (e) { /* 无音乐文件：静默 */ }
    }
    this.status = Object.keys(this.tracks).length ? 'manifest' : 'absent';
    return this.tracks;
  }
  // 在用户手势里调用（iOS）。共用音效的 AudioContext。
  unlock() {
    this.sfx.unlock(); const c = this.sfx.ctx; if (!c || this.bus) { this.applyVolume(); return; }
    this.ctx = c; this.lp = c.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 20000; this.lp.Q.value = 0.7;
    this.bus = c.createGain(); this.bus.connect(this.lp); this.lp.connect(c.destination);
    this.layerBus = c.createGain(); this.layerBus.gain.value = 0; this.layerBus.connect(this.bus);
    this.applyVolume();
    this.manifestP.then(() => { if (this.status === 'manifest') this.preload(); });
  }
  setVolume(kind, v) { this.vol[kind] = Math.max(0, Math.min(1, v)); try { localStorage.setItem(VOL_KEY, JSON.stringify(this.vol)); } catch (e) {} this.applyVolume(); }
  applyVolume() {
    if (this.sfx.master) this.sfx.master.gain.value = 0.62 * this.vol.sfx;
    if (this.bus) this.bus.gain.setTargetAtTime(this.vol.music * 0.8, this.ctx.currentTime, 0.05);
  }
  ext() { const a = document.createElement('audio'); const ogg = a.canPlayType('audio/ogg; codecs="vorbis"') || a.canPlayType('audio/ogg; codecs="opus"'); const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent); return ogg && !isSafari ? ['ogg', 'm4a'] : ['m4a', 'aac', 'mp3', 'ogg']; }
  async preload() {
    // 先解码当前需要的曲目，再按游戏顺序解码其余（避免一次性占用内存/CPU）
    const order = [this.want, 'explore', 'battle', 'boss', 'awaken', 'phase3', 'awakenBoss', 'victory'];
    for (const s of [...new Set(order)]) await this.decode(s);
    this.status = Object.keys(this.buf).length ? 'ready' : 'absent';
  }
  async decode(slot) {
    if (this.buf[slot] || !this.tracks[slot] || !this.ctx) return this.buf[slot];
    const t = this.tracks[slot]; const prefs = this.ext();
    const files = t.files.slice().sort((a, b) => prefs.indexOf(a.split('.').pop().toLowerCase()) - prefs.indexOf(b.split('.').pop().toLowerCase()));
    for (const f of files) {
      const url = /^(https?:)?\/\//.test(f) ? f : this.base + f.replace(/^(\.\/)?(audio\/)?/, '');
      try { const r = await fetch(url); if (!r.ok) continue; const ab = await r.arrayBuffer();
        const b = await new Promise((res, rej) => { const p = this.ctx.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); });
        this.buf[slot] = b; t.url = url;
        if (t.loopStartSamples !== undefined && t.loopStart === undefined) t.loopStart = t.loopStartSamples / b.sampleRate;
        if (t.loopEndSamples !== undefined && t.loopEnd === undefined) t.loopEnd = t.loopEndSamples / b.sampleRate;
        return b;
      } catch (e) { this.errors.push(url); }
    }
    return null;
  }
  // 由游戏每帧调用：根据局势决定想要的曲目
  update(w) {
    const now = w.realTime; const boss = w.enemies.find((e) => e.isBoss && e.alive);
    const fighting = w.enemies.some((e) => e.alive && !e.isBoss); if (fighting || boss) this.lastBattle = now;
    let want = 'explore';
    if (w.over) want = w.player.alive ? 'victory' : 'defeat'; // 战败：当前曲目闷声淡出到静音
    else if (boss) want = boss.phase >= 3 ? 'phase3' : 'boss';
    else if (fighting || now - this.lastBattle < 3) want = 'battle';
    if (want !== this.want) { this.want = want; this.history.push(want); }
    const layer = w.player.awake > 0 && !w.over; if (layer !== this.layerOn) { this.layerOn = layer; this.history.push(layer ? '+awaken' : '-awaken'); }
    // 子弹时间：音乐整体低通（"水下"感），平滑过渡，不做音量抖动
    this.btLP = w.btT > 0 || w.enemyTimeScale < 0.6 || want === 'defeat';
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this.lp.frequency.setTargetAtTime(this.btLP ? 650 : 20000, t, this.btLP ? 0.06 : 0.25);
    if (this.cur !== this.want) this.switchTo(this.want);
    if (this.layerOn !== this._layerPlaying) this.setLayer(this.layerOn);
  }
  _start(slot, offset, when, dest) {
    const b = this.buf[slot]; if (!b) return null; const t = this.tracks[slot] || {}; const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = b; const loops = !t.oneShot && (slot !== 'victory' || t.loopEnd !== undefined);
    src.loop = loops; if (loops) { src.loopStart = Math.max(0, t.loopStart || 0); src.loopEnd = t.loopEnd && t.loopEnd > src.loopStart ? Math.min(t.loopEnd, b.duration) : b.duration; }
    const g = c.createGain(); g.gain.value = 0; src.connect(g); g.connect(dest || this.bus);
    src.start(when, Math.max(0, offset || 0) % b.duration);
    const v = { slot, src, g, t0: when - (offset || 0), gain: t.gain ?? 1 }; return v;
  }
  // 歌曲内播放位置（考虑循环段）
  pos(v) { const t = this.tracks[v.slot] || {}; const b = this.buf[v.slot]; let p = this.ctx.currentTime - v.t0; const ls = t.loopStart || 0, le = t.loopEnd || b.duration; if (p > le) p = ls + ((p - ls) % (le - ls)); return p; }
  // 下一个小节线（boss a/b：1.6s 一小节），返回切换时刻与 b 的起始偏移
  nextBar(v, minAhead = 0.05) {
    const t = this.tracks[v.slot] || {}; const b = this.buf[v.slot]; if (!t.bpm) return { when: this.ctx.currentTime + minAhead, pos: null };
    const bar = 60 / t.bpm * (t.beatsPerBar || 4), p = this.pos(v), le = t.loopEnd || b.duration;
    let next = Math.ceil((p + minAhead) / bar - 1e-6) * bar; const when = this.ctx.currentTime + (next - p); if (next >= le - 1e-6) next = 0;
    return { when, pos: +next.toFixed(6), bar };
  }
  nextBeat(v, minAhead = 0.05) {
    const t = this.tracks[v.slot] || {}; if (!t.bpm) return { when: this.ctx.currentTime + minAhead, pos: null };
    const beat = 60 / t.bpm, p = this.pos(v), off = t.beatOffset || 0; let n = Math.ceil((p - off + minAhead) / beat); const np = off + n * beat;
    return { when: this.ctx.currentTime + (np - p), pos: np };
  }
  resolve(slot) { const fb = { phase3: 'boss', boss: 'battle', battle: 'explore', victory: null, explore: null }; let s = slot; while (s && !this.tracks[s]) s = fb[s]; return s; }
  async switchTo(want) {
    this.cur = want; const c = this.ctx; if (!c) return;
    await this.manifestP; if (this.cur !== want) return; // 清单还没读完时先等它，避免误判"没有这首"
    if (want === 'defeat') { const old = this.voices.main, now = c.currentTime; if (old) this._fade(old, 0, 2.8, now); this.voices.main = null; this.lastSwitch = { slot: 'defeat', from: old ? old.slot : null, at: now, decidedAt: now, offset: 0 }; return; }
    const slot = this.resolve(want); // 缺某首时退回相近的曲目（三阶段→Boss→战斗→探索）
    if (slot && this.voices.main && this.voices.main.slot === slot) return;
    const b = slot ? await this.decode(slot) : null; if (this.cur !== want) return;
    const old = this.voices.main; const now = c.currentTime;
    if (!b) { if (old) this._fade(old, 0, 1.2, now); this.voices.main = null; return; } // 没有这首：淡出到静音
    let when = now + 0.02, offset = 0, fade = { explore: 2.0, battle: 1.0, boss: 1.5, phase3: 0.3, victory: 0.8 }[slot] || 1.2;
    if (old && ((old.slot === 'boss' && slot === 'phase3') || (old.slot === 'phase3' && slot === 'boss'))) {
      // 三阶段变奏：在下一拍上切换，并从同一小节位置接入（两版同速同结构时无缝）
      const nb = this.nextBar(old); when = nb.when; offset = nb.pos ?? this.pos(old); fade = 0.4;
    }
    const v = this._start(slot, offset, when); this.voices.main = v;
    if (this.tracks[slot]?.oneShot) { v.g.gain.setValueAtTime(v.gain, when); if (old) this._fade(old, 0, 0.8, now); } // 胜利短曲：直接进，旧曲淡出
    else { this._fade(v, v.gain * this.mainDuck(), fade, when); if (old) this._fade(old, 0, fade, when); }
    this.lastSwitch = { slot, from: old ? old.slot : null, at: when, decidedAt: now, offset, fromPos: old && this.buf[old.slot] ? +this.pos(old).toFixed(4) : null };
    if (this.voices.layer) { const bossy = slot === 'boss' || slot === 'phase3'; const wantL = bossy && this.tracks.awakenBoss ? 'awakenBoss' : 'awaken';
      if (wantL !== this.layerSlot && slot !== 'victory') { this._layerPlaying = false; this.setLayer(true); } else this.applyLayerGain(when); }
  }
  _fade(v, to, dur, at) {
    const g = v.g.gain, t = Math.max(at, this.ctx.currentTime); g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(to, t + dur);
    if (to === 0) { try { v.src.stop(t + dur + 0.05); } catch (e) {} }
  }
  async setLayer(on) {
    this._layerPlaying = on; const c = this.ctx; if (!c) return; await this.manifestP; if (this._layerPlaying !== on) return; const now = c.currentTime;
    if (on) {
      const main0 = this.voices.main; const bossy = main0 && (main0.slot === 'boss' || main0.slot === 'phase3');
      const lslot = bossy && this.tracks.awakenBoss ? 'awakenBoss' : 'awaken'; this.layerSlot = lslot;
      const b = await this.decode(lslot); if (!b || !this._layerPlaying) return;
      const main = this.voices.main; let when = now + 0.02, offset = 0;
      if (main && this.tracks[main.slot]?.bpm === this.tracks[lslot]?.bpm) { const nb = this.nextBar(main); when = nb.when; } // 在同速主曲的小节线上进入（心跳对齐重拍）
      const v = this._start(lslot, offset, when, this.layerBus); this.layerStart = { slot: lslot, main: main ? main.slot : null, when, mainPosAtStart: main ? +(this.pos(main) + (when - now)).toFixed(4) : null }; if (this.voices.layer) this._fade(this.voices.layer, 0, 0.3, now); this.voices.layer = v;
      v.g.gain.setValueAtTime(v.gain, when); this.layerWhen = when; this.applyLayerGain(when, 1.5);
      if (main) { main.g.gain.cancelScheduledValues(when); main.g.gain.setValueAtTime(main.g.gain.value, when); main.g.gain.linearRampToValueAtTime(main.gain * this.mainDuck(), when + 1.5); }
    } else {
      this.layerBus.gain.cancelScheduledValues(now); this.layerBus.gain.setValueAtTime(this.layerBus.gain.value, now); this.layerBus.gain.linearRampToValueAtTime(0, now + 1.2);
      const l = this.voices.layer; if (l) { try { l.src.stop(now + 1.3); } catch (e) {} this.voices.layer = null; }
      const main = this.voices.main; if (main) { main.g.gain.cancelScheduledValues(now); main.g.gain.setValueAtTime(main.g.gain.value, now); main.g.gain.linearRampToValueAtTime(main.gain, now + 1.2); }
    }
  }
  // 绯魇层：盖在战斗曲上全量；盖在 Boss 曲（150 BPM / C 小调）上会冲突 → 大幅压低成氛围
  layerTarget() { const m = this.voices.main?.slot; if (!this.layerOn || m === 'victory') return 0; const bossy = m === 'boss' || m === 'phase3';
    return bossy && this.layerSlot !== 'awakenBoss' ? 0.22 : 1; } // 没有 Boss 版时才压低普通版
  mainDuck() { return this.layerOn && this.voices.main?.slot === 'battle' ? 0.8 : 1; }
  applyLayerGain(at, dur = 0.8) { if (!this.layerBus) return; const g = this.layerBus.gain, t = Math.max(at, this.ctx.currentTime); g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(this.layerTarget(), t + dur); this.layerGoal = this.layerTarget(); }
  // 节拍相位（0..1，拍内位置）与小节内拍号，供 VFX 轻微同步（不做闪烁，只做柔和起伏）
  beatInfo() {
    const v = this.voices.main; if (!v || !this.ctx || !this.buf[v.slot]) return null; const t = this.tracks[v.slot]; if (!t?.bpm || t.oneShot) return null;
    if (this.ctx.currentTime < v.t0) return null; const beat = 60 / t.bpm, p = this.pos(v); const b = p / beat;
    return { phase: b - Math.floor(b), beat: Math.floor(b) % (t.beatsPerBar || 4), bpm: t.bpm, beatLen: beat };
  }
  get musicBeatPhase() { const b = this.beatInfo(); return b ? b.phase : null; }
  debug() {
    return { status: this.status, want: this.want, cur: this.cur, playing: this.voices.main?.slot || null, layer: !!this.voices.layer, layerOn: this.layerOn, lowpass: !!this.btLP,
      slots: Object.keys(this.tracks), decoded: Object.keys(this.buf), loops: Object.fromEntries(Object.entries(this.tracks).map(([k, t]) => [k, [t.loopStart ?? null, t.loopEnd ?? null, t.bpm ?? null]])),
      beat: this.beatInfo(), layerSlot: this.layerSlot || null, layerStart: this.layerStart || null,
      history: this.history.slice(-20), layerGoal: this.layerGoal ?? null, layerWhen: this.layerWhen ?? null,
      voice: this.voices.main ? { slot: this.voices.main.slot, loop: this.voices.main.src.loop, loopStart: this.voices.main.src.loopStart, loopEnd: this.voices.main.src.loopEnd, bufDur: this.buf[this.voices.main.slot]?.duration, url: this.tracks[this.voices.main.slot]?.url } : null, lastSwitch: this.lastSwitch || null, vol: this.vol, ctx: this.ctx ? this.ctx.state : 'none', errors: this.errors };
  }
}
