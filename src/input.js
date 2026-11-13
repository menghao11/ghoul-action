// 动作层输入：键盘/鼠标/触屏 → 动作。离散动作带时间戳用于输入缓冲。
const KEYMAP = {
  KeyJ: 'light', KeyK: 'heavy', KeyL: 'skill', KeyE: 'skill', Space: 'jump', ShiftLeft: 'dodge', ShiftRight: 'dodge',
  KeyQ: 'lock', Tab: 'cycle', KeyF: 'ult', KeyZ: 'switch', Digit1: 'type0', Digit2: 'type1', Digit3: 'type2', Digit4: 'type3',
};
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.held = {};           // action -> bool
    this.stamp = {};          // action -> realtime of last press
    this.move = { x: 0, y: 0 };
    this.touchMove = { x: 0, y: 0, active: false };
    this.look = { dx: 0, dy: 0 };
    this.now = 0;
    this.touchMode = false;
    this.pointerLocked = false;
    this.listeners = [];
    this.virtual = { x: 0, y: 0, active: false };
    this._bindKeyboard();
    this._bindMouse();
  }
  onPress(fn) { this.listeners.push(fn); }
  press(a) {
    this.stamp[a] = this.now; this.held[a] = true;
    for (const f of this.listeners) f(a);
  }
  release(a) { this.held[a] = false; }
  // 缓冲：在 window 秒内按过即返回 true 并消费
  consume(a, win = 0.22) {
    const t = this.stamp[a];
    if (t !== undefined && this.now - t <= win) { delete this.stamp[a]; return true; }
    return false;
  }
  peek(a, win = 0.22) { const t = this.stamp[a]; return t !== undefined && this.now - t <= win; }
  clearBuffer() { this.stamp = {}; }
  _bindKeyboard() {
    addEventListener('keydown', (e) => {
      if (e.code === 'Tab') e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      const a = KEYMAP[e.code]; if (a) { this.press(a); if (e.code === 'Space') e.preventDefault(); }
    });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); const a = KEYMAP[e.code]; if (a) this.release(a); });
    addEventListener('blur', () => { this.keys.clear(); this.held = {}; });
  }
  _bindMouse() {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('mousedown', (e) => {
      if (this.touchMode) return;
      if (!this.pointerLocked && !this.noPointerLock) { c.requestPointerLock?.(); }
      if (e.button === 0) this.press('light');
      else if (e.button === 2) this.press('heavy');
      else if (e.button === 1) { e.preventDefault(); this.press('lock'); }
    });
    c.addEventListener('mouseup', (e) => { if (e.button === 0) this.release('light'); if (e.button === 2) this.release('heavy'); });
    document.addEventListener('pointerlockchange', () => { this.pointerLocked = document.pointerLockElement === c; });
    addEventListener('mousemove', (e) => {
      if (this.touchMode) return;
      if (this.pointerLocked) { this.look.dx += e.movementX; this.look.dy += e.movementY; }
      else if (e.buttons & 4) { this.look.dx += e.movementX; this.look.dy += e.movementY; }
    });
    c.addEventListener('wheel', (e) => { this.wheel = (this.wheel || 0) + Math.sign(e.deltaY); }, { passive: true });
  }
  bindTouch(root) {
    this.touchMode = true;
    root.classList.remove('hidden');
    const zone = root.querySelector('#stickZone'), base = root.querySelector('#stickBase'), knob = root.querySelector('#stickKnob');
    let stickId = null, sx = 0, sy = 0; const R = 52;
    const home = () => { base.style.left = '60px'; base.style.bottom = '40px'; base.style.top = ''; knob.style.transform = ''; base.style.opacity = .55; };
    zone.addEventListener('pointerdown', (e) => {
      if (stickId !== null) return; stickId = e.pointerId; zone.setPointerCapture(e.pointerId);
      sx = e.clientX; sy = e.clientY; base.style.left = (sx - 60) + 'px'; base.style.top = (sy - 60) + 'px'; base.style.bottom = ''; base.style.opacity = .9;
      this.touchMove.active = true; e.preventDefault();
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== stickId) return;
      let dx = e.clientX - sx, dy = e.clientY - sy; const l = Math.hypot(dx, dy);
      if (l > R) { sx += dx - dx / l * R; sy += dy - dy / l * R; dx = dx / l * R; dy = dy / l * R; base.style.left = (sx - 60) + 'px'; base.style.top = (sy - 60) + 'px'; }
      knob.style.transform = `translate(${dx}px,${dy}px)`;
      const m = Math.min(1, Math.hypot(dx, dy) / R); const dead = 0.12; const s = m < dead ? 0 : (m - dead) / (1 - dead);
      const ang = Math.atan2(dy, dx); this.touchMove.x = Math.cos(ang) * s; this.touchMove.y = -Math.sin(ang) * s;
    });
    const endStick = (e) => { if (e.pointerId !== stickId) return; stickId = null; this.touchMove.x = this.touchMove.y = 0; this.touchMove.active = false; home(); };
    zone.addEventListener('pointerup', endStick); zone.addEventListener('pointercancel', endStick);
    const cam = root.querySelector('#camZone'); const camIds = new Map();
    cam.addEventListener('pointerdown', (e) => { camIds.set(e.pointerId, [e.clientX, e.clientY]); cam.setPointerCapture(e.pointerId); });
    cam.addEventListener('pointermove', (e) => { const p = camIds.get(e.pointerId); if (!p) return; this.look.dx += (e.clientX - p[0]) * 1.6; this.look.dy += (e.clientY - p[1]) * 1.6; p[0] = e.clientX; p[1] = e.clientY; });
    const endCam = (e) => camIds.delete(e.pointerId); cam.addEventListener('pointerup', endCam); cam.addEventListener('pointercancel', endCam);
    root.querySelectorAll('.tb').forEach((b) => {
      const a = b.dataset.a;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); b.setPointerCapture(e.pointerId); b.classList.add('down'); this.press(a); });
      const up = (e) => { b.classList.remove('down'); this.release(a); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
    });
  }
  update(realNow) {
    this.now = realNow;
    let x = 0, y = 0; const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1; if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1; if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    if (this.touchMove.active) { x = this.touchMove.x; y = this.touchMove.y; }
    if (this.virtual.active) { x = this.virtual.x; y = this.virtual.y; }
    this.move.x = x; this.move.y = y;
  }
  takeLook() { const d = { dx: this.look.dx, dy: this.look.dy }; this.look.dx = this.look.dy = 0; return d; }
}
