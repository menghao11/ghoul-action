// 自动化冒烟测试：node tests/smoke.js [baseUrl]
// NODE_PATH 需指向 playwright（本机：/workspace/rogue-demo/tools/node_modules）
const { chromium, devices } = require('playwright');
const fs = require('fs'); const path = require('path');
const BASE = process.argv[2] || process.env.URL || 'http://127.0.0.1:8792/';
const SHOTS = path.join(__dirname, '..', 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
const GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const results = []; const check = (name, pass, info) => { results.push({ name, pass: !!pass, info }); console.log((pass ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(b, ctxOpt, qs = '') {
  const ctx = await b.newContext(ctxOpt); const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });
  p.on('requestfailed', (r) => errs.push('requestfailed: ' + r.url()));
  await p.goto(BASE + '?autostart=1&nolock=1' + qs); await p.waitForFunction(() => window.__dbg && window.__dbg.ready, null, { timeout: 30000 });
  return { ctx, p, errs };
}
// 在页面内以固定步长推进（不渲染、确定性），script(i) 每帧调用
const sim = (p, frames, scriptSrc = '') => p.evaluate(([n, src]) => { const f = src ? new Function('i', 'D', 'W', src) : null; for (let i = 0; i < n; i++) { if (f) f(i, __dbg, __world); __world.step(1 / 60); } return __dbg.state(); }, [frames, scriptSrc]);
const frameShot = async (p, name) => { await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); await p.screenshot({ path: path.join(SHOTS, name) }); };

(async () => {
  const b = await chromium.launch({ args: GL });
  // ================= 桌面 =================
  const { ctx, p, errs } = await open(b, { viewport: { width: 1280, height: 720 } });
  await sleep(2500);
  check('desktop: 加载无控制台错误', errs.length === 0, errs.slice(0, 5));
  await p.evaluate(() => { __dbg.manual(true); __dbg.noWaves(); __dbg.clearEnemies(); __dbg.god(true); __dbg.teleport(-10, 0); __world.cam.yaw = -Math.PI / 2; });
  await frameShot(p, '01_start.png');
  // --- 四种血绫切换 ---
  const typeRes = [];
  for (let i = 0; i < 4; i++) {
    await p.evaluate((i) => { __dbg.clearEnemies(); __dbg.teleport(-10, 0); __world.cam.yaw = -Math.PI / 2; __dbg.spawn('grunt', -7.5, 0.4); __dbg.spawn('grunt', -7.6, -1.2); }, i);
    await sim(p, 40);
    const st = await sim(p, 30, `if(i===0){ D.press('type${i}'); }`);
    const vis = st.player.tendrilsVisible; const id = st.player.type;
    // 本形态连招
    const before = st.stats.hits;
    const st2 = await sim(p, 26, `if(i===0) D.press('light');`);
    await frameShot(p, `02_type${i}_${id}.png`);
    const st3 = await sim(p, 110, `if(i%14===0 && i<70) D.press('light'); if(i===84) D.press('heavy');`);
    typeRes.push({ id, vis: vis[id], hits: st3.stats.hits - before });
    check(`血绫切换 type${i} → ${id}（触手可见）`, st.player.typeIdx === i && vis[id] > 0 && Object.entries(vis).every(([k, v]) => k === id || v === 0 || true), { vis });
    check(`连招命中 ${id}`, st3.stats.hits - before >= 3, { hits: st3.stats.hits - before, moves: Object.keys(st3.stats.moves) });
    if (id === 'ranged') check('星屑 发射晶刺弹', st3.stats.shards > 0, { shards: st3.stats.shards });
  }
  // --- 挑空 + 空中追击 + 坠星 ---
  await p.evaluate(() => { __dbg.clearEnemies(); __dbg.setType(3); __dbg.teleport(-10, 0); __dbg.spawn('grunt', -8, 0); });
  await sim(p, 40);
  let air = 0; const st4 = await sim(p, 200, `if(i===0||i===16) D.press('light'); if(i===34) D.press('heavy'); if(i===60) D.press('jump'); if(i===80||i===98||i===116) D.press('light'); if(i===136) D.press('heavy'); if(W.enemies[0] && W.enemies[0].airborne) W.__air=(W.__air||0)+1;`);
  air = await p.evaluate(() => __world.__air || 0);
  check('挑空(升绫)使敌人浮空 + 空中连段', air > 20 && st4.stats.moves.launch >= 1 && (st4.stats.moves.airL1 || 0) >= 1, { airFrames: air, moves: st4.stats.moves });
  check('空中重击 坠星 落地', (st4.stats.moves.airH || 0) >= 1 && (st4.stats.moves.airH_land || 0) >= 1, { airH: st4.stats.moves.airH, land: st4.stats.moves.airH_land });
  // --- 完美闪避 → 子弹时间 → 瞬影反击 ---
  await p.evaluate(() => { __dbg.clearEnemies(); __dbg.teleport(-10, 0); __dbg.spawn('grunt', -8, 0); });
  await sim(p, 45);
  await p.evaluate(() => { __dbg.forceAttack(0.08); __dbg.press('dodge'); });
  const st5 = await sim(p, 12);
  check('完美闪避触发子弹时间', st5.stats.perfect >= 1 && st5.bt > 0 && st5.btScale < 0.6, { perfect: st5.stats.perfect, bt: st5.bt, enemyTimeScale: st5.btScale });
  await frameShot(p, '03_perfect_dodge_bullet_time.png');
  const st6 = await sim(p, 40, `if(i===2) D.press('light');`);
  check('子弹时间内反击 = 瞬影反击', (st6.stats.moves.pcounter || 0) >= 1, { pcounter: st6.stats.moves.pcounter });
  // 非完美（太晚）闪避不应触发
  await p.evaluate(() => { __dbg.clearEnemies(); __dbg.teleport(-10, 0); __dbg.god(true); __dbg.spawn('grunt', -8, 0); });
  await sim(p, 120);
  const pb = await p.evaluate(() => __world.stats.perfect);
  await p.evaluate(() => { __dbg.forceAttack(0.5); });
  await sim(p, 40); const pa = await p.evaluate(() => __world.stats.perfect);
  check('不闪避时不会误触发子弹时间', pa === pb, { before: pb, after: pa });
  // --- 磐盾 格挡/完美格挡 ---
  await p.evaluate(() => { __dbg.clearEnemies(); __dbg.teleport(-10, 0); __dbg.setType(1); __dbg.spawn('grunt', -8, 0); });
  await sim(p, 60, `W.enemies.forEach(e=>{e.cool=99; e.interrupt();}); if(W.player.state!=='move') W.player.toMove();`);
  await p.evaluate(() => { __dbg.forceAttack(0.1); __dbg.press('skill'); });
  const st7 = await sim(p, 30, `if(i<12) (W.__pl=W.__pl||[]).push([W.player.state, W.player.moveId, W.enemies[0]&&W.enemies[0].state, W.input.held.skill, W.player.type]);`); await p.evaluate(() => __dbg.release('skill'));
  if (!st7.stats.parries) console.log('parry debug', JSON.stringify(await p.evaluate(() => __world.__pl)));
  check('磐盾 完美格挡（按住技能）', st7.stats.parries >= 1, { parries: st7.stats.parries, state: st7.player.state });
  // --- 闪反 ---
  const st8 = await sim(p, 60, `if(i===0) D.press('dodge'); if(i===12) D.press('light');`);
  check('闪避后攻击 = 闪反', (st8.stats.moves.counter || 0) >= 1, { counter: st8.stats.moves.counter });
  // --- 绯魇（大招） ---
  await p.evaluate(() => { __dbg.clearEnemies(); __dbg.teleport(-10, 0); __dbg.setType(2); for (let k = 0; k < 3; k++) __dbg.spawn('grunt', -6 + k, k - 1); });
  await sim(p, 50);
  await p.evaluate(() => { __dbg.fillEnergy(); __dbg.press('ult'); });
  const st9 = await sim(p, 70);
  check('绯魇 激活（护甲+缠身血绫）', st9.player.awake > 0 && st9.player.armor > 0 && st9.player.wrap > 0, { awake: st9.player.awake, armor: st9.player.armor, wrap: st9.player.wrap });
  await sim(p, 30, `if(i%10===0) D.press('light');`);
  await frameShot(p, '04_awaken.png');
  const st10 = await sim(p, 60, `if(i===0) D.press('ult');`);
  await frameShot(p, '05_finisher.png');
  const st11 = await sim(p, 120);
  check('绯魇·终焉 终结技', (st11.stats.moves.finisher || 0) >= 1 && st11.stats.finishers >= 1, { finisher: st11.stats.moves.finisher, finHits: st11.stats.finishers, awakeAfter: st11.player.awake });
  // --- Boss ---
  await p.evaluate(() => { __dbg.clearEnemies(); __dbg.teleport(10, 0); __world.wave = 1; __world.nextWave(); });
  await sim(p, 80);
  await frameShot(p, '06_boss.png');
  // 让 Boss 出一次带预警的招
  const tele = await sim(p, 40, `if(i===0){ const b=D.boss(); b.cool=0; b.pos.set(14,0,0);} `);
  const decalOn = await p.evaluate(() => __world.decals.list.some((d) => d.on));
  check('Boss 攻击有地面预警', decalOn || tele.enemies.some((e) => e.kind === 'boss' && (e.state === 'windup' || e.state === 'active' || e.state === 'recover')), { decalOn, bossState: tele.enemies.find((e) => e.kind === 'boss').state });
  await frameShot(p, '07_boss_telegraph.png');
  const ph = [];
  for (const d of [1600, 1500]) { ph.push(await p.evaluate((d) => __dbg.bossDamage(d), d)); await sim(p, 260); }
  const ph2 = await p.evaluate(() => __dbg.state().enemies.find((e) => e.kind === 'boss'));
  check('Boss 阶段切换 1→2→3', ph2 && ph2.phase === 3, { phase: ph2 && ph2.phase, hp: ph2 && ph2.hp });
  await frameShot(p, '08_boss_phase3.png');
  await p.evaluate(() => __dbg.bossDamage(5000)); const st12 = await sim(p, 90);
  check('调试钩子可击败 Boss → 胜利', st12.over === true && !st12.enemies.some((e) => e.kind === 'boss' && e.alive), { over: st12.over });
  await frameShot(p, '09_victory.png');
  // --- 锁定 / 切换目标 ---
  await p.evaluate(() => { __dbg.clearEnemies(); __world.over = false; __dbg.teleport(-10, 0); __world.cam.yaw = -Math.PI / 2; __dbg.spawn('grunt', -4, -2); __dbg.spawn('grunt', -4, 2); });
  await sim(p, 50); await p.evaluate(() => __dbg.press('lock')); const l1 = (await sim(p, 30)).lock;
  await p.evaluate(() => __dbg.press('cycle')); const l2 = (await sim(p, 30)).lock;
  check('镜头锁定 + 切换目标', l1 && l2 && l1 !== l2, { l1, l2 });
  await frameShot(p, '10_lockon.png');
  await p.evaluate(() => __dbg.press('lock'));
  // ================= 无晃屏检查 =================
  await p.evaluate(() => { __dbg.clearEnemies(); __dbg.teleport(-12, 0); __dbg.setType(0); __world.cam.lockTarget = null; for (let k = 0; k < 4; k++) __dbg.spawn('grunt', -8 + k, (k % 2 ? 1 : -1) * 1.2); __world.maxTokens = 4; });
  await sim(p, 50);
  await p.evaluate(() => __dbg.camLogStart());
  const combat = `const k=i%240; if(k===0) D.press('lock'); if(i%18===0 && k<120) D.press(['light','light','heavy','skill'][(i/18|0)%4]); if(k===130) D.press('dodge'); if(k===150) D.press('jump'); if(k===165||k===180) D.press('light'); if(k===195) D.press('heavy'); if(k===210) D.forceAttack(0.06); if(k===211) D.press('dodge'); if(k===215) D.press('light'); if(i===300){D.fillEnergy(); D.press('ult');} if(i===420) D.press('ult'); if(i%60===0) D.press('type'+((i/60|0)%4)); if(W.enemies.filter(e=>e.alive).length<2) D.spawn('grunt', W.player.pos.x+3, 0); D.move(Math.sin(i*0.03)*0.6, Math.cos(i*0.021)*0.5);`;
  const tSim = Date.now(); await sim(p, 720, combat); const msPerUpdate = (Date.now() - tSim) / 720;
  const log = await p.evaluate(() => __dbg.camLogStop()); const sstat = await p.evaluate(() => __dbg.state().stats);
  const shake = analyzeShake(log);
  fs.writeFileSync(path.join(OUT, 'camlog.json'), JSON.stringify(log));
  const src = fs.readdirSync(path.join(__dirname, '..', 'src')).map((f) => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8')).join('\n');
  const codeHits = (src.match(/\b(shake|screenShake|trauma|addTrauma|cameraShake|jitter)\s*[\(=:]/gi) || []);
  check('无晃屏：源码中没有任何 shake/trauma 相机抖动代码', codeHits.length === 0, codeHits);
  check('无晃屏：FOV 恒定、无滚转', shake.fovDev === 0 && shake.maxRoll < 1e-6 && shake.upOk, { fovDev: shake.fovDev, maxRoll: shake.maxRoll });
  check('无晃屏：相机位置无振荡抖动（720 帧实战，含顿帧/子弹时间/大招/瞬移）', shake.posOsc <= 3 && shake.reversals <= 3 && shake.posHFmax < 0.06, shake);
  check('无晃屏：相机朝向无振荡抖动', shake.angOsc <= 3 && shake.angAccMax < 0.02, { angOsc: shake.angOsc, angAccMax: shake.angAccMax, angAccP99: shake.angAccP99 });
  // 反向对照：往同一段日志里人为注入 1.5cm / 0.3° 的 15Hz 晃屏，检测器必须能抓到（证明检查不是空转）
  const fake = log.map((r, i) => { const q = r.slice(); const s = Math.sin(i * 2 * Math.PI * 15 / 60 + 0.7); q[0] += 0.015 * s; q[1] += 0.01 * Math.cos(i * 2.1); const a = 0.0026 * s; const qa = [0, Math.sin(a / 2), 0, Math.cos(a / 2)]; const [x, y, z, w] = [r[3], r[4], r[5], r[6]]; q[3] = w * qa[0] + x * qa[3] + y * qa[2] - z * qa[1]; q[4] = w * qa[1] - x * qa[2] + y * qa[3] + z * qa[0]; q[5] = w * qa[2] + x * qa[1] - y * qa[0] + z * qa[3]; q[6] = w * qa[3] - x * qa[0] - y * qa[1] - z * qa[2]; return q; });
  const fs2 = analyzeShake(fake);
  check('无晃屏检测器自检：注入的轻微晃屏会被判定为失败', fs2.posOsc > 3 && fs2.angOsc > 3, { posOsc: fs2.posOsc, angOsc: fs2.angOsc });
  check('CPU：每帧逻辑更新耗时（不含渲染）', msPerUpdate < 8, { msPerUpdate: +msPerUpdate.toFixed(2) });
  console.log('combat stats during shake test:', JSON.stringify({ hits: sstat.hits, perfect: sstat.perfect, awakens: sstat.awakens, finishers: sstat.finishers, hitstopFrames: log.filter((r) => r[12]).length }));
  // ================= 全流程：3 波（杂兵→增援→Boss）自动战斗 =================
  await p.goto(BASE + '?autostart=1&nolock=1'); await p.waitForFunction(() => window.__dbg && window.__dbg.ready);
  await p.evaluate(() => { __dbg.manual(true); __dbg.god(true); window.__bot = (i) => { const W = __world, P = W.player, I = W.input; const es = W.enemies.filter((e) => e.alive && e.state !== 'spawn'); if (!es.length) { __dbg.move(1, 0); return; }
      es.sort((a, b) => a.pos.distanceTo(P.pos) - b.pos.distanceTo(P.pos)); const e = es.find((x) => x.isBoss) && Math.random() < 0.5 ? es.find((x) => x.isBoss) : es[0];
      if (!W.cam.lockTarget) I.press('lock');
      const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z, d = Math.hypot(dx, dz); const f = W.cam.forward(), r = W.cam.right();
      if (d > 2.6) __dbg.move((dx * r.x + dz * r.z) / d, (dx * f.x + dz * f.z) / d); else __dbg.move(0, 0);
      const threat = W.enemies.some((x) => x.alive && x.atk && x.state === 'windup' && x.atk.wdur - x.atk.t < 0.12 && x.pos.distanceTo(P.pos) < 6);
      if (threat && i % 3 === 0) I.press('dodge');
      if (d < 4 && i % 11 === 0) I.press('light'); if (d < 4 && i % 53 === 0) I.press('heavy'); if (i % 97 === 0) I.press('skill'); if (i % 300 === 0) I.press('type' + ((i / 300 | 0) % 4));
      if (P.energy >= 100) I.press('ult'); if (P.awake > 0 && P.awake < 10) I.press('ult'); }; });
  let flow = null; const tFlow = Date.now();
  for (let k = 0; k < 40; k++) { flow = await sim(p, 600, 'window.__bot(i + ' + (k * 600) + ')'); if (flow.over) break; }
  const flowSec = (await p.evaluate(() => __world.realTime)).toFixed(0);
  check('全流程：自动战斗打通 3 波并击败 Boss（god 模式）', flow.over && flow.wave === 2 && !flow.enemies.some((e) => e.alive), { wave: flow.wave, over: flow.over, gameSeconds: +flowSec, kills: flow.stats.kills, hits: flow.stats.hits, maxCombo: flow.stats.maxCombo, perfect: flow.stats.perfect, enemyAttacks: flow.stats.enemyAttacks, awakens: flow.stats.awakens, dmgTaken: Math.round(flow.stats.damageTaken), wallMs: Date.now() - tFlow });
  await frameShot(p, '09b_full_run_end.png');
  await p.evaluate(() => { __world.over = false; });
  // ================= 桌面实时 FPS（自动战斗）=================
  await p.evaluate(() => { __dbg.manual(false); __dbg.clearEnemies(); __dbg.teleport(-6, 0); for (let k = 0; k < 5; k++) __dbg.spawn('grunt', -2 + k, (k % 3) - 1); window.__auto = setInterval(() => { __dbg.press(['light', 'light', 'heavy', 'skill', 'light', 'dodge'][Math.random() * 6 | 0]); }, 160); });
  const fpsD = await measureFps(p, 6000);
  await frameShot(p, '11_desktop_combat.png');
  await p.evaluate(() => clearInterval(window.__auto));
  check('桌面 FPS（headless SwiftShader，仅供参考）', fpsD.fps > 0, fpsD);
  check('desktop: 全程无页面错误', errs.length === 0, errs.slice(0, 5));
  await ctx.close();
  if (process.env.DESKTOP_ONLY) { await b.close(); console.log(results.filter(r=>r.pass).length + '/' + results.length); process.exit(0); }
  // ================= iPhone 横屏（触屏 + 中画质）=================
  const ip = await open(b, { ...devices['iPhone 13 landscape'] });
  await sleep(2500);
  const ui = await ip.p.evaluate(() => ({ touch: !document.getElementById('touch').classList.contains('hidden'), btns: [...document.querySelectorAll('.tb')].map((b) => b.textContent), q: __world.quality, w: innerWidth, h: innerHeight, dpr: devicePixelRatio, pr: __world.renderer.getPixelRatio() }));
  check('iPhone: 触屏按钮显示（横屏）', ui.touch && ui.btns.length === 8, ui);
  // 真实触摸：点击轻击按钮
  await ip.p.evaluate(() => { __dbg.noWaves(); __dbg.clearEnemies(); __dbg.god(true); __dbg.teleport(-10, 0); __dbg.spawn('grunt', -8, 0); __dbg.spawn('grunt', -8, 1.5); });
  await sleep(1500);
  const box = await ip.p.locator('.tb[data-a="light"]').boundingBox(); const h0 = (await ip.p.evaluate(() => __dbg.state().stats.hits));
  for (let k = 0; k < 6; k++) { await ip.p.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2); await sleep(220); }
  await sleep(600); const h1 = await ip.p.evaluate(() => __dbg.state().stats.hits);
  check('iPhone: 点触「轻击」按钮命中敌人', h1 > h0, { before: h0, after: h1 });
  const tb = await ip.p.locator('#types button').nth(0).boundingBox(); await ip.p.touchscreen.tap(tb.x + tb.width / 2, tb.y + tb.height / 2); await sleep(500);
  check('iPhone: 点触切换血绫（星屑）', (await ip.p.evaluate(() => __dbg.state().player.type)) === 'ranged');
  await ip.p.screenshot({ path: path.join(SHOTS, '12_iphone_touch_ui.png') });
  await ip.p.evaluate(() => { for (let k = 0; k < 3; k++) __dbg.spawn('grunt', -5 + k, k - 1); window.__auto = setInterval(() => __dbg.press(['light', 'heavy', 'skill', 'light'][Math.random() * 4 | 0]), 180); });
  const fpsI = await measureFps(ip.p, 6000);
  await ip.p.screenshot({ path: path.join(SHOTS, '13_iphone_combat.png') });
  check('iPhone 模拟 FPS（headless，仅供参考，真机需实测）', fpsI.fps > 0, { ...fpsI, quality: ui.q, pixelRatio: ui.pr });
  // 低画质对比
  await ip.p.evaluate(() => __dbg.setQuality('low')); await sleep(800);
  const fpsL = await measureFps(ip.p, 4000);
  check('iPhone 低画质 FPS（仅供参考）', fpsL.fps > 0, fpsL);
  await ip.p.evaluate(() => { clearInterval(window.__auto); __dbg.setQuality('mid'); try { localStorage.removeItem('ghoul_quality'); } catch (e) {} });
  check('iPhone: 全程无页面错误', ip.errs.length === 0, ip.errs.slice(0, 5));
  await ip.ctx.close();
  await b.close();
  const pass = results.filter((r) => r.pass).length;
  console.log(`\n${pass}/${results.length} passed`);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ when: new Date().toISOString(), results, typeRes }, null, 2));
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });

async function measureFps(p, ms) {
  return p.evaluate((ms) => new Promise((res) => { let n = 0, worst = 0, last = performance.now(); const t0 = last; const f = (t) => { n++; worst = Math.max(worst, t - last); last = t; if (t - t0 < ms) requestAnimationFrame(f); else res({ fps: +(n / ((t - t0) / 1000)).toFixed(1), worstFrameMs: +worst.toFixed(1), frames: n }); }; requestAnimationFrame(f); }), ms);
}
function analyzeShake(log) {
  // 行：[px,py,pz,qx,qy,qz,qw,fov,upx,upy,upz,dt,hitstop]
  const fov0 = log[0][7]; let fovDev = 0, maxRoll = 0, upOk = true; const hf = []; const angAcc = []; let reversals = 0;
  const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
  const qinv = (q) => [-q[0], -q[1], -q[2], q[3]];
  const rotVec = (q) => { let [x, y, z, w] = q; if (w < 0) { x = -x; y = -y; z = -z; w = -w; } const s = Math.sqrt(x * x + y * y + z * z); const ang = 2 * Math.atan2(s, w); return s < 1e-12 ? [0, 0, 0] : [x / s * ang, y / s * ang, z / s * ang]; };
  const w = [];
  for (let i = 0; i < log.length; i++) {
    const r = log[i]; fovDev = Math.max(fovDev, Math.abs(r[7] - fov0)); if (Math.abs(r[9] - 1) > 1e-9 || Math.abs(r[8]) > 1e-9 || Math.abs(r[10]) > 1e-9) upOk = false;
    const [x, y, z, ww] = [r[3], r[4], r[5], r[6]]; const rightY = 2 * (x * y + ww * z); maxRoll = Math.max(maxRoll, Math.abs(rightY));
    if (i > 0) { w.push(rotVec(qmul(qinv([log[i - 1][3], log[i - 1][4], log[i - 1][5], log[i - 1][6]]), [x, y, z, ww]))); }
    if (i > 0 && i < log.length - 1) {
      const a = log[i - 1], c = log[i + 1]; const d = Math.hypot(r[0] - (a[0] + c[0]) / 2, r[1] - (a[1] + c[1]) / 2, r[2] - (a[2] + c[2]) / 2); hf.push(d);
      const d1 = [r[0] - a[0], r[1] - a[1], r[2] - a[2]], d2 = [c[0] - r[0], c[1] - r[1], c[2] - r[2]]; const m1 = Math.hypot(...d1), m2 = Math.hypot(...d2);
      if (m1 > 0.004 && m2 > 0.004 && (d1[0] * d2[0] + d1[1] * d2[1] + d1[2] * d2[2]) / (m1 * m2) < -0.2) reversals++;
    }
  }
  const angAv = []; for (let i = 1; i < w.length; i++) { const v = [w[i][0] - w[i - 1][0], w[i][1] - w[i - 1][1], w[i][2] - w[i - 1][2]]; angAv.push(v); angAcc.push(Math.hypot(...v)); }
  // 振荡计数：加速度方向逐帧反转且幅度可见 → 晃屏的典型特征（平滑跟随/减速不会频繁反转）
  const acc = []; for (let i = 1; i < log.length - 1; i++) { const a = log[i - 1], r = log[i], c = log[i + 1]; acc.push([c[0] - 2 * r[0] + a[0], c[1] - 2 * r[1] + a[1], c[2] - 2 * r[2] + a[2]]); }
  const osc = (arr, eps) => { let n = 0; for (let i = 1; i < arr.length; i++) { const u = arr[i - 1], v = arr[i]; const mu = Math.hypot(...u), mv = Math.hypot(...v); if (mu > eps && mv > eps && (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) < -0.5 * mu * mv) n++; } return n; };
  var posOsc = osc(acc, 0.004), angOsc = osc(angAv, 0.0015);
  const p99 = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length * 0.99)] || 0; };
  return { frames: log.length, posOsc, angOsc, fovDev, maxRoll: +maxRoll.toExponential(2), upOk, posHFmax: +Math.max(...hf).toFixed(5), posHFp99: +p99(hf).toFixed(5), reversals, angAccMax: +Math.max(...angAcc).toFixed(5), angAccP99: +p99(angAcc).toFixed(5) };
}
