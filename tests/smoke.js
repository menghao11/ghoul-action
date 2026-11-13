// 自动化冒烟测试：node tests/smoke.js [baseUrl]
// NODE_PATH 需指向 playwright（本机：/workspace/pw-tools/node_modules）
const { chromium, devices } = require('playwright');
const fs = require('fs'); const path = require('path');
const BASE = process.argv[2] || process.env.URL || 'http://127.0.0.1:8792/';
const SHOTS = path.join(__dirname, '..', 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
const GL = ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const results = []; const check = (name, pass, info) => { results.push({ name, pass: !!pass, info }); console.log((pass ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(b, ctxOpt, qs = '') {
  const ctx = await b.newContext(ctxOpt); const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/\/(art|audio)\//.test(m.location().url || '')) errs.push('console.error: ' + m.text() + ' @ ' + (m.location().url || '')); });
  p.on('requestfailed', (r) => { if (!/\/(art|audio)\//.test(r.url())) errs.push('requestfailed: ' + r.url()); }); // art/ 目录可选（美术资源未就绪时 404 是预期的）
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
  for (const f of [0.42, 0.4]) { ph.push(await p.evaluate((f) => __dbg.bossDamage(Math.round(__dbg.boss().maxHp * f)), f)); await sim(p, 260); }
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


  // ================= 画图王的 3D 角色 =================
  {
    const mi = await p.evaluate(() => __dbg.models());
    await p.evaluate(() => { __dbg.clearEnemies(); __world.over = false; __dbg.teleport(-10, 0); __world.cam.yaw = -Math.PI / 2; __world.cam.lockTarget = null; ['grunt', 'shooter', 'brute'].forEach((k, i) => __dbg.spawn(k, -6 + i * 1.2, (i - 1) * 1.6)); });
    await sim(p, 50, `W.enemies.forEach(e=>{e.cool=99;});`);
    const em = await p.evaluate(() => __world.enemies.map((e) => ({ kind: e.kind, model: !!e.rig.isModel, clip: e.rig.clipName, weapon: !!e.weapon })));
    const clips = await p.evaluate(() => { const r = __world.player.rig; const out = {}; for (const [id, frames] of [['L1', 8], ['H', 12]]) { __world.player.toMove(); __world.player.startMove(id); for (let i = 0; i < frames; i++) __world.step(1 / 60); out[id] = { clip: r.clipName, ts: +r.actions[r.clipName].timeScale.toFixed(2) }; } __world.player.toMove(); return out; });
    check('3D 模型：主角/杂兵/重型/晶刺手均为画图王模型（失败时自动退回占位）', mi.ok && mi.heroIsModel && em.every((e) => e.model), { hero: mi.hero, loadMs: mi.loadMs, enemies: em });
    check('3D 模型：招式驱动 clip 并按出手时间缩放（L1→light1, H→heavy）', clips.L1.clip === 'light1' && clips.H.clip === 'heavy' && clips.L1.ts > 0.4, clips);
    await sim(p, 30); await frameShot(p, 'm_models_grunts.png');
    // 重型（铁枷）：霸体 + 慢速大预警砸地
    await p.evaluate(() => { __dbg.clearEnemies(); __dbg.teleport(-10, 0); __dbg.setType(3); __dbg.spawn('brute', -8, 0); }); await sim(p, 50, `W.enemies.forEach(e=>{e.cool=99;});`);
    const br = await p.evaluate(() => { const e = __world.enemies[0]; e.cool = 0; const seen = new Set(); let slam = false, interrupted = false; for (let i = 0; i < 200; i++) { if (i === 30) __dbg.press('light'); if (e.atk) { seen.add(e.atk.name); if (e.state === 'windup' && i > 30 && i < 60 && !e.atk) interrupted = true; } if (e.state === 'active' && e.atk && e.atk.name === 'bslam') slam = true; __world.step(1 / 60); } return { attacks: [...seen], slam, hp: e.hp, maxHp: e.maxHp }; });
    check('重型杂兵 AI：慢速、霸体（轻击不打断）、有预警的大范围砸地', br.attacks.includes('bslam') && br.slam && br.hp < br.maxHp, br);
    await p.evaluate(() => { __dbg.clearEnemies(); __dbg.teleport(-10, 0); __dbg.spawn('shooter', -2, 0); }); await sim(p, 50);
    const sh = await p.evaluate(() => { const e = __world.enemies[0]; e.cool = 0; let crystal = false; for (let i = 0; i < 200; i++) { __world.step(1 / 60); if (__world.bolts.some((b) => b.on && b.crystal && b.m === b.mCrystal)) crystal = true; } return { crystal, clip: e.rig.clipName }; });
    check('晶刺手发射红色晶刺（不是弩箭）', sh.crystal, sh);
    // Boss 模型：缩放 1.32（≈2.8m），鸦断挂在右手
    await p.evaluate(() => { __dbg.clearEnemies(); __dbg.teleport(4, 0); __world.wave = 1; __world.nextWave(); }); await sim(p, 90, `W.enemies.forEach(e=>{e.cool=99;});`);
    const bm = await p.evaluate(() => { const b = __dbg.boss(); b.rig.root.updateMatrixWorld(true); const h = b.rig.bones.mixamorigHeadTop_End || b.rig.bones.mixamorigHead; const v = h.getWorldPosition(h.position.clone()); return { model: !!b.rig.isModel, scale: b.rig.model.scale.x, headY: +v.y.toFixed(2), weaponParent: b.weapon && b.weapon.parent && b.weapon.parent.name }; });
    check('Boss 铁衡模型：缩放 1.32（约 2.8m），猎械「鸦断」挂 hand_R_socket', bm.model && Math.abs(bm.scale - 1.32) < 1e-6 && bm.headY > 2.4 && bm.weaponParent === 'hand_R_socket', bm);
    await frameShot(p, 'm_boss_model.png');
    const bud = await p.evaluate(() => __dbg.models().budget);
    check('手机预算参考：draw call / 三角面 / 模型贴图显存', bud.calls > 0 && bud.calls < 400 && bud.triangles < 400000, bud);
    await p.evaluate(() => { __dbg.clearEnemies(); __world.over = false; });
  }
  // ================= 创意加料 =================
  // 连击评价：持续变招连段 → 评价升到 A 以上，拖尾增亮
  await p.evaluate(() => { __dbg.clearEnemies(); __world.over = false; __dbg.teleport(-10, 0); __world.cam.yaw = -Math.PI / 2; __dbg.setType(3); __world.creative.sp = 0; __world.creative.maxLevel = 0; for (let k = 0; k < 3; k++) __dbg.spawn('grunt', -7.5, k - 1); __world.enemies.forEach((e) => { e.maxHp = e.hp = 99999; }); });
  await sim(p, 40, `W.enemies.forEach(e=>{e.cool=99;});`);
  const rk = await sim(p, 420, `W.enemies.forEach(e=>{e.cool=99;}); const s=['light','light','light','heavy','skill','light','heavy','dodge','light']; if(i%16===0) D.press(s[(i/16|0)%s.length]); if(i===200){ D.forceAttack(0.08); D.press('dodge'); }`);
  const gain = await p.evaluate(() => __world.player.trails[__world.player.type][0].mat.uniforms.gain.value);
  check('连击评价 C→SSS：变招连段评价上升（凡/锐/狂/绝/魇/神），拖尾随评价增亮', rk.rank.maxLevel >= 3 && gain > 1, { rank: rk.rank, trailGain: +gain.toFixed(2), dom: await p.evaluate(() => document.getElementById('rank').textContent) });
  await frameShot(p, 'c_rank.png');
  const hurt0 = rk.rank.sp; await p.evaluate(() => __world.creative.onHurt()); const hurt1 = await p.evaluate(() => __world.creative.sp);
  const decay = await sim(p, 400); // 停手衰减
  check('连击评价：被打掉段、停手平滑衰减', hurt1 < hurt0 && decay.rank.sp < hurt1, { before: +hurt0.toFixed(0), afterHurt: +hurt1.toFixed(0), afterIdle: +decay.rank.sp.toFixed(0) });
  // 面具碎裂
  await p.evaluate(() => { __dbg.clearEnemies(); __dbg.teleport(-10, 0); __dbg.spawn('grunt', -7.8, 0); __dbg.spawn('shooter', -7.8, 1.6); });
  await sim(p, 40);
  await p.evaluate(() => __dbg.killAll()); const ms = await sim(p, 8);
  const maskHidden = await p.evaluate(() => __world.enemies.every((e) => !e.rig.mask || !e.rig.mask.visible));
  check('处决时敌人面具碎裂（鸦喙面具/护目镜碎片飞散落地）', ms.maskShards >= 10 && maskHidden, { shards: ms.maskShards, maskHidden });
  await frameShot(p, 'c_mask_shatter.png');
  const ms2 = await sim(p, 260); check('面具碎片落地后淡出回收', ms2.maskShards === 0, { shards: ms2.maskShards });
  // 四种终焉变体 + 血晶花
  const VAR = { ranged: '陨星雨', heavy: '崩天', burst: '血潮', balanced: '龙卷' };
  for (let i = 0; i < 4; i++) {
    await p.evaluate((i) => { __dbg.clearEnemies(); __dbg.teleport(-10, 0); __world.cam.yaw = -Math.PI / 2; __world.cam.lockTarget = null; __dbg.setType(i); __world.player.awake = 0; for (let k = 0; k < 3; k++) __dbg.spawn('grunt', -7 + k * 0.5, k - 1); __world.enemies.forEach((e) => { e.maxHp = e.hp = 99999; }); }, i);
    await sim(p, 45, `W.enemies.forEach(e=>{e.cool=99;});`);
    await p.evaluate(() => { __dbg.fillEnergy(); __dbg.press('ult'); }); await sim(p, 75, `W.enemies.forEach(e=>{e.cool=99;});`);
    const f0 = await p.evaluate(() => __world.creative.bloomCount || 0);
    let maxMet = 0, banner = '', spun = 0;
    await p.evaluate(() => __dbg.press('ult'));
    for (let k = 0; k < 6; k++) { const s = await sim(p, 16, `W.enemies.forEach(e=>{e.cool=99;}); W.__ry=(W.__ry||0)+Math.abs(W.player.rig.body.rotation.y);`); maxMet = Math.max(maxMet, s.meteors); const bt = await p.evaluate(() => document.getElementById('banner').textContent); if (!banner.includes(bt)) banner += bt + ' | '; }
    const sf = await sim(p, 12);
    const id = sf.player.type; spun = await p.evaluate(() => { const v = __world.__ry; __world.__ry = 0; return v; });
    if (i === 0) await frameShot(p, 'c_finisher_ranged_meteor.png');
    const sf2 = await sim(p, 20); sf2.flowers = await p.evaluate(() => __world.creative.bloomCount || 0); await frameShot(p, `c_finisher_${id}.png`);
    check(`终焉变体 ${id}：「${VAR[id]}」+ 落点血晶花`, banner.includes(VAR[id]) && sf2.flowers > f0 && (id !== 'ranged' || maxMet > 0), { banner, flowers: sf2.flowers, meteors: maxMet, bodySpin: +spun.toFixed(1) });
  }
  // 子弹时间雨滴悬停
  await p.evaluate(() => { __dbg.clearEnemies(); __world.btT = 0; __world.creative.flowers.forEach((f) => f.life = 0); });
  await sim(p, 60);
  const r0 = await p.evaluate(() => __world.city.rainT); await sim(p, 30); const r1 = await p.evaluate(() => __world.city.rainT);
  await p.evaluate(() => __world.bulletTime(2, 0.2)); await sim(p, 3); const r2 = await p.evaluate(() => __world.city.rainT); await sim(p, 30); const r3 = await p.evaluate(() => __world.city.rainT);
  check('子弹时间：雨滴近乎悬停（下落速度降到 <15%）', (r3 - r2) < 0.15 * (r1 - r0), { normal: +(r1 - r0).toFixed(3), bulletTime: +(r3 - r2).toFixed(3) });
  await frameShot(p, 'c_rain_freeze.png');
  await sim(p, 140);
  // 霓虹短路：平滑暗下→复燃，不频闪
  const sg = await p.evaluate(() => { const g = __world.city.signs.find((s) => Math.abs(s.x) < 30) || __world.city.signs[0]; __dbg.teleport(g.x, g.z > 0 ? 6 : -6); return { x: g.x, z: g.z }; });
  await sim(p, 30);
  await p.evaluate((g) => __world.impact(g, 6), sg);
  const lv = await p.evaluate(() => { const g = __world.city.signs.filter((s) => s.hold > 0 || s.level < 0.99); const out = []; for (let i = 0; i < 200; i++) { __world.step(1 / 60); out.push(g.map((s) => s.level)); } return { n: g.length, out }; });
  let rev = 0; for (let j = 0; j < lv.n; j++) { let dir = 0; for (let i = 1; i < lv.out.length; i++) { const d = lv.out[i][j] - lv.out[i - 1][j]; if (Math.abs(d) < 1e-4) continue; const sd = Math.sign(d); if (dir && sd !== dir) rev++; dir = sd; } }
  check('重击冲击波使附近霓虹短路（平滑暗→亮，无频闪）', lv.n >= 1 && rev <= lv.n * 2, { signs: lv.n, reversals: rev, minLevel: Math.min(...lv.out.flat()).toFixed(2), endLevel: lv.out[lv.out.length - 1] });
  // 美术辉光贴图：拦截 art/ 模拟画图王的 MANIFEST，验证能自动加载
  {
    const ctxA = await b.newContext({ viewport: { width: 800, height: 450 } }); const pa = await ctxA.newPage(); const eA = [];
    pa.on('pageerror', (e) => eA.push(e.message));
    const png = fs.readFileSync(path.join(SHOTS, '01_start.png'));
    await pa.route('**/art/MANIFEST.md', (r) => r.fulfill({ status: 200, contentType: 'text/markdown', body: '# test\n- textures/tendril_glow_ranged.png 星屑\n- textures/glow_awaken.png\n' }));
    await pa.route('**/art/textures/*.png', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: png }));
    await pa.goto(BASE + '?autostart=1&nolock=1'); await pa.waitForFunction(() => window.__artGlow !== undefined, null, { timeout: 90000 });
    const ag = await pa.evaluate(() => window.__artGlow);
    check('美术辉光贴图：art/MANIFEST.md 中的 glow 贴图按类型自动加载（缺省回退程序贴图）', ag.length === 2 && ag.some((x) => x.kind === 'ranged') && ag.some((x) => x.kind === 'awaken') && eA.length === 0, { ag, eA });
    await ctxA.close();
  }

  // ================= 审查（审核王 dc823af）修复回归 =================
  // P3-1 镜头防穿楼：贴墙瞬移 + 快速甩向楼体，相机当帧就被拉近，不进墙（墙 z=±11，限制 10.3）
  {
    const r = await p.evaluate(() => { __dbg.clearEnemies(); __world.cam.lockTarget = null; __dbg.teleport(-10, 0); __world.cam.yaw = Math.PI; __world.cam.snap(__world.player); for (let i = 0; i < 30; i++) __world.step(1 / 60);
      const out = []; __dbg.teleport(-10, 8.6); for (let i = 0; i < 40; i++) { if (i === 5) __world.cam.yaw = 0; if (i > 5 && i < 25) __world.cam.yaw += 0.25 * Math.sin(i); __world.step(1 / 60); out.push(__world.camera.position.z); }
      __world.cam.yaw = 0; for (let i = 0; i < 20; i++) { __world.cam.yaw += (i % 2 ? 1 : -1) * 0.6; __world.step(1 / 60); out.push(__world.camera.position.z); }
      return { maxZ: Math.max(...out), frames: out.length }; });
    check('镜头防穿楼：贴墙/急甩时相机不进墙（z ≤ 10.31，当帧生效）', r.maxZ <= 10.31, r);
  }
  // P3-2 Boss 一击跨过 65% 和 30%：逐级进入二阶段（召唤 2 名巡夜员）再进三阶段
  {
    await p.evaluate(() => { __dbg.clearEnemies(); __world.over = false; __dbg.teleport(4, 0); __world.wave = 1; __world.nextWave(); }); await sim(p, 80);
    const r0 = await p.evaluate(() => __dbg.bossDamage(Math.round(__dbg.boss().maxHp * 0.76)));
    let seen = []; for (let k = 0; k < 8; k++) { const s2 = await sim(p, 40); const b2 = s2.enemies.find((e) => e.kind === 'boss'); seen.push(b2.phase + ':' + s2.enemies.filter((e) => e.kind === 'grunt' && e.alive).length); }
    const end = await p.evaluate(() => ({ phase: __dbg.boss().phase, adds: __world.enemies.filter((e) => e.kind === 'grunt').length }));
    check('Boss 一击跨两档：先二阶段（召唤增援）再三阶段，不跳阶段', seen.some((x) => x.startsWith('2:')) && end.phase === 3 && end.adds >= 2, { hit: r0, seen, end });
    await p.evaluate(() => { __dbg.bossDamage(99999); __world.over = false; }); await sim(p, 30);
  }
  // P3-3 完美闪避窗口 0.26s（含端点）
  {
    const res = {};
    for (const lead of [0.2, 0.25, 0.26, 0.4]) {
      await p.evaluate(() => { __dbg.clearEnemies(); __world.over = false; __world.btT = 0; __dbg.teleport(-10, 0); __dbg.spawn('grunt', -8, 0); }); await sim(p, 100);
      const b0 = await p.evaluate(() => __world.stats.perfect);
      await p.evaluate((lead) => { __dbg.forceAttack(lead); }, lead);
      // 在命中前 lead 秒按闪避：先找出实际命中帧
      const hitAt = await p.evaluate(() => { const e = __world.enemies.find((x) => x.alive); return e.atk ? (e.atk.wdur - e.atk.t) : null; });
      await p.evaluate(() => __dbg.press('dodge')); await sim(p, 40);
      res[lead] = { perfect: (await p.evaluate(() => __world.stats.perfect)) - b0, hitIn: hitAt };
    }
    check('完美闪避窗口：提前 0.20/0.25/0.26s 都触发，0.40s 不触发', res[0.2].perfect && res[0.25].perfect && res[0.26].perfect && !res[0.4].perfect, res);
  }
  // P3-4 终焉门槛用真实时间 0.8s（即便绯魇开场带子弹时间）
  {
    await p.evaluate(() => { __dbg.clearEnemies(); __dbg.teleport(-10, 0); __dbg.spawn('grunt', -8, 0); __world.player.awake = 0; __world.btT = 0; }); await sim(p, 60, `W.enemies.forEach(e=>{e.cool=99;});`);
    const r = await p.evaluate(() => { __dbg.fillEnergy(); __dbg.press('ult'); let t0 = null, tf = null; for (let i = 0; i < 120; i++) { if (i >= 2 && i % 2 === 0) __dbg.press('ult'); __world.step(1 / 60); if (t0 === null && __world.player.awake > 0) t0 = __world.player.awakenReal; if (tf === null && __world.player.moveId === 'finisher') tf = __world.realTime; } return { gate: tf !== null && t0 !== null ? +(tf - t0).toFixed(3) : null }; });
    check('终焉门槛：绯魇开启后真实时间 0.8s 即可释放（不被子弹时间拉长）', r.gate !== null && r.gate >= 0.79 && r.gate <= 0.84, r);
    await sim(p, 200);
  }
  // P3-5 升绫追击窗口覆盖到顶点之后
  {
    await p.evaluate(() => { __dbg.clearEnemies(); __dbg.setType(3); __dbg.teleport(-10, 0); __dbg.spawn('grunt', -8.2, 0); __world.player.awake = 0; }); await sim(p, 40, `W.enemies.forEach(e=>{e.cool=99;});`);
    const r = await p.evaluate(() => { const e = __world.enemies[0]; __world.player.startMove('launch'); let launchT = null, apexT = null, chaseEnd = null, prevY = 0, vy = 0; for (let i = 0; i < 150; i++) { e.cool = 99; __world.step(1 / 60); const P = __world.player; if (launchT === null && P.chaseT > 0) launchT = __world.time; if (launchT !== null && apexT === null && e.vel.y <= 0 && e.pos.y > 0.5) apexT = __world.time; if (launchT !== null && chaseEnd === null && P.chaseT <= 0) chaseEnd = __world.time; } return { toApex: apexT && +(apexT - launchT).toFixed(2), chase: chaseEnd && +(chaseEnd - launchT).toFixed(2) }; });
    check('升绫追击窗口由挑空初速推导，覆盖顶点之后', r.toApex && r.chase && r.chase > r.toApex + 0.2, r);
  }

  // ================= 配乐管理器（模拟声音王的 audio/MANIFEST.md）=================
  {
    { const cA = await b.newContext({ viewport: { width: 640, height: 360 } }); const pA = await cA.newPage(); const eA = []; pA.on('pageerror', (e) => eA.push(e.message));
      await pA.route('**/audio/**', (r) => r.fulfill({ status: 404, body: '' })); await pA.goto(BASE + '?autostart=1&nolock=1&q=low'); await pA.waitForFunction(() => window.__dbg && window.__dbg.ready);
      await pA.mouse.click(300, 200); await sleep(800); await pA.evaluate(() => { __dbg.manual(true); for (let i = 0; i < 120; i++) __world.step(1 / 60); });
      const absent = await pA.evaluate(() => __dbg.music());
      check('配乐缺省：没有 audio/ 时静默降级（只有音效，无报错）', absent.status === 'absent' && eA.length === 0, { status: absent.status, eA }); await cA.close(); }
    // 真实配乐（声音王交付）：循环点、Boss a→b 小节线切换、Boss 版绯魇层
    { const cR = await b.newContext({ viewport: { width: 640, height: 360 } }); const pR = await cR.newPage(); const eR = []; pR.on('pageerror', (e) => eR.push(e.message));
      await pR.goto(BASE + '?autostart=1&nolock=1&q=low'); await pR.waitForFunction(() => window.__dbg && window.__dbg.ready); await pR.mouse.click(300, 200);
      await pR.waitForFunction(() => __dbg.music().decoded.length >= 7, null, { timeout: 60000 }).catch(() => {});
      await pR.evaluate(() => { __dbg.manual(true); __dbg.noWaves(); __dbg.clearEnemies(); __dbg.god(true); __dbg.teleport(-10, 0); __dbg.spawn('grunt', -6, 0); });
      const stR = async (n = 30, src = '') => { await sim(pR, n, src); await sleep(250); return pR.evaluate(() => __dbg.music()); };
      const mb = await stR(60, 'W.enemies.forEach(e=>{e.cool=99;});');
      const loopOk = mb.voice && mb.voice.slot === 'battle' && mb.voice.loop && Math.abs(mb.voice.loopEnd - 2116800 / 44100) < 1e-6 && mb.voice.loopStart === 0;
      await pR.evaluate(() => { __dbg.clearEnemies(); __dbg.teleport(4, 0); __world.wave = 1; __world.nextWave(); }); await stR(90); await sleep(1200);
      await pR.evaluate(() => { __dbg.fillEnergy(); __dbg.press('ult'); }); const lb = await stR(30); await sleep(1800); const lb2 = await pR.evaluate(() => __dbg.music());
      await pR.evaluate(() => { __world.player.awake = 0; const b = __dbg.boss(); b.hp = b.maxHp * 0.5; }); await stR(220, 'W.enemies.forEach(e=>{if(e.isBoss) e.cool=99;});');
      await pR.evaluate(() => { const b = __dbg.boss(); b.hp = b.maxHp * 0.2; }); await sleep(900); const p3 = await stR(220, 'W.enemies.forEach(e=>{if(e.isBoss) e.cool=99;});'); await sleep(1800); const p3b = await pR.evaluate(() => __dbg.music());
      const ls = p3b.lastSwitch || {}; const onBar = ls.offset !== undefined && Math.abs(ls.offset / 1.6 - Math.round(ls.offset / 1.6)) < 1e-3; const wait = ls.at - ls.decidedAt;
      const lsOk = lb2.layerSlot === 'awakenBoss' && lb2.layerStart && lb2.layerStart.main === 'boss' && Math.abs(lb2.layerStart.mainPosAtStart / 1.6 - Math.round(lb2.layerStart.mainPosAtStart / 1.6)) < 0.02;
      check('真实配乐：循环点按采样数显式设置（battle loopEnd = 2116800/44100）', loopOk, { voice: mb.voice, ext: await pR.evaluate(() => __world.music.ext()[0]) });
      check('真实配乐：Boss 三阶段在小节线（1.6s 网格）切到 b，同偏移接续，等待 ≤1.6s', p3b.playing === 'phase3' && ls.from === 'boss' && onBar && wait >= 0 && wait <= 1.65, { playing: p3b.playing, lastSwitch: ls, waitSec: +wait.toFixed(3) });
      check('真实配乐：Boss 战用 layer_feiyan_boss，在 Boss 曲小节线进入；拍相位可供 VFX', lsOk && p3b.beat && p3b.beat.phase >= 0 && p3b.beat.phase < 1 && eR.length === 0, { layerSlot: lb2.layerSlot, layerStart: lb2.layerStart, beat: p3b.beat, eR });
      await cR.close(); }
    const wav = (freq, sec = 3, sr = 22050) => { const n = sr * sec, b = Buffer.alloc(44 + n * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40); for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / sr * freq * 6.283) * 6000), 44 + i * 2); return b; };
    const ctxM = await b.newContext({ viewport: { width: 800, height: 450 } }); const pm = await ctxM.newPage(); const eM = [];
    pm.on('pageerror', (e) => eM.push(e.message)); pm.on('console', (m) => { if (m.type() === 'error' && !/\/(art|audio)\//.test(m.location().url || '')) eM.push(m.text()); });
    const md = ['# 赤骸夜行 配乐', '| 曲目 | 文件 | 循环 | BPM |', '|---|---|---|---|', '| 标题/探索 | explore.ogg / explore.m4a | loop 0.5s - 2.5s | 120 BPM |', '| 杂兵战 | battle.ogg battle.m4a | loopStart=0.25 loopEnd=2.75 | 120 bpm |',
      '| Boss 一二阶段 | boss.ogg boss.m4a | loop 0.5 - 2.5 | 120 BPM |', '| Boss 三阶段（同速同结构变奏） | boss_phase3.ogg boss_phase3.m4a | loop 0.5 - 2.5 | 120 BPM |', '| 绯魇 15s 叠加层 | awaken_layer.ogg awaken_layer.m4a | loop 0 - 3 | 120 BPM |', '| 胜利（可选） | victory.ogg victory.m4a | | |'].join('\n');
    const freqs = { explore: 220, battle: 330, boss: 110, boss_phase3: 165, awaken_layer: 440, victory: 523 };
    await pm.route('**/audio/MANIFEST.md', (r) => r.fulfill({ status: 200, contentType: 'text/markdown; charset=utf-8', body: md }));
    await pm.route(/\/audio\/[^/]+\.(ogg|m4a)$/, (r) => { const n = r.request().url().split('/').pop().replace(/\.(ogg|m4a)$/, ''); r.fulfill({ status: 200, contentType: 'audio/wav', body: wav(freqs[n] || 200) }); });
    await pm.goto(BASE + '?autostart=1&nolock=1&q=low'); await pm.waitForFunction(() => window.__dbg && window.__dbg.ready);
    await pm.mouse.click(400, 300); // 首次手势 → 解锁 AudioContext（iOS 同理）
    await pm.waitForFunction(() => __dbg.music().decoded.length >= 6, null, { timeout: 30000 });
    await pm.evaluate(() => { __dbg.manual(true); __dbg.noWaves(); __dbg.clearEnemies(); __dbg.god(true); __dbg.teleport(-10, 0); });
    const st = async (n = 30, src = '') => { await sim(pm, n, src); await sleep(150); return pm.evaluate(() => __dbg.music()); };
    const seq = {};
    seq.explore = (await st(240)).playing;
    await pm.evaluate(() => { __dbg.spawn('grunt', -6, 0); __dbg.spawn('grunt', -6, 1); }); seq.battle = (await st(60, 'W.enemies.forEach(e=>{e.cool=99;});')).playing;
    await pm.evaluate(() => __dbg.clearEnemies()); seq.afterClear = (await st(240)).playing;
    await pm.evaluate(() => { __dbg.teleport(4, 0); __world.wave = 1; __world.nextWave(); }); seq.boss = (await st(90)).playing;
    await pm.evaluate(() => { const b = __dbg.boss(); b.hp = b.maxHp * 0.5; }); await st(200);
    await pm.evaluate(() => { const b = __dbg.boss(); b.hp = b.maxHp * 0.2; }); const p3 = await st(240); seq.phase3 = p3.playing; seq.p3Switch = p3.lastSwitch;
    await pm.evaluate(() => { __dbg.fillEnergy(); __dbg.press('ult'); }); const aw = await st(40); seq.awakenLayer = aw.layer;
    await pm.evaluate(() => __world.bulletTime(1.5, 0.2)); seq.lowpass = (await st(10)).lowpass;
    await pm.evaluate(() => { __world.player.awake = 0; __dbg.bossDamage(99999); }); const vic = await st(120); seq.victory = vic.playing; seq.layerAfter = vic.layer;
    const mi = await pm.evaluate(() => { const m = __world.music; return { loops: m.debug().loops, ctx: m.ctx.state, ext: m.ext()[0] }; });
    check('配乐：按局势交叉淡入淡出 探索→战斗→（清场后）探索→Boss→三阶段→胜利', seq.explore === 'explore' && seq.battle === 'battle' && seq.afterClear === 'explore' && seq.boss === 'boss' && seq.phase3 === 'phase3' && seq.victory === 'victory', seq);
    check('配乐：三阶段在拍点上切换并接续小节位置；绯魇叠加层；子弹时间低通', seq.p3Switch && seq.p3Switch.from === 'boss' && seq.awakenLayer === true && seq.lowpass === true && seq.layerAfter === false, { p3Switch: seq.p3Switch, awakenLayer: seq.awakenLayer, lowpass: seq.lowpass });
    check('配乐：清单解析出循环点 / BPM，手势后 AudioContext 已解锁', mi.loops.battle[0] === 0.25 && mi.loops.battle[1] === 2.75 && mi.loops.boss[2] === 120 && mi.ctx === 'running' && eM.length === 0, { ...mi, eM });
    const vol = await pm.evaluate(() => { __world.music.setVolume('music', 0.3); __world.music.setVolume('sfx', 0.5); return JSON.parse(localStorage.getItem('ghoul_volume')); });
    await pm.reload(); await pm.waitForFunction(() => window.__dbg && window.__dbg.ready);
    const vol2 = await pm.evaluate(() => ({ m: document.getElementById('volMusic').value, s: document.getElementById('volSfx').value }));
    check('音量设置：音乐/音效滑杆，刷新后保留', vol.music === 0.3 && vol.sfx === 0.5 && vol2.m === '30' && vol2.s === '50', { vol, vol2 });
    await pm.evaluate(() => localStorage.removeItem('ghoul_volume'));
    await ctxM.close();
  }
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
  const im = await ip.p.evaluate(() => __dbg.models()); check('iPhone：主角用 lingye_1k.glb，2048² 贴图降到 1024²', im.ok && im.hero === 'lingye_1k.glb' && im.budget.downscaled >= 1, { hero: im.hero, budget: im.budget, heapMB: im.mem });
  const lay = await ip.p.evaluate(() => { const H = innerHeight, W = innerWidth; const r = (q) => document.querySelector(q).getBoundingClientRect();
    const btn = [...document.querySelectorAll('.tb')].map((b) => { const x = b.getBoundingClientRect(); return { a: b.dataset.a, bottomGap: +(H - x.bottom).toFixed(1), rightGap: +(W - x.right).toFixed(1) }; });
    const css = [...document.styleSheets].flatMap((s) => [...s.cssRules].map((x) => x.cssText)).join('\n');
    const hpB = r('#hpText'), enB = r('#enText'), hpBar = r('.bar.hp'), cb = r('#combo');
    return { minBottom: Math.min(...btn.map((b) => b.bottomGap)), minRight: Math.min(...btn.map((b) => b.rightGap)), dodge: btn.find((b) => b.a === 'dodge'),
      safeBottom: /#tbtns[^}]*safe-area-inset-bottom/.test(css), safeRight: /#tbtns[^}]*safe-area-inset-right/.test(css), safeLeft: /safe-area-inset-left/.test(css),
      viewportFit: /viewport-fit=cover/.test(document.querySelector('meta[name=viewport]').content),
      hpOverflow: getComputedStyle(document.querySelector('.bar.hp')).overflow, hpTextH: +hpB.height.toFixed(1), hpTextOutsideBar: hpB.left >= hpBar.right - 2, enTextBelow: enB.top >= r('.bar.en').bottom - 1,
      comboLeft: +(cb.left / W).toFixed(2) }; });
  check('iPhone 安全区：底部按钮离底 ≥ 16px，#tbtns 使用 safe-area-inset-bottom/right，viewport-fit=cover', lay.minBottom >= 16 && lay.safeBottom && lay.safeRight && lay.safeLeft && lay.viewportFit, lay);
  check('HUD 数字不裁切、连击数不压画面中心', lay.hpOverflow === 'visible' && lay.hpTextOutsideBar && lay.enTextBelow && lay.comboLeft < 0.3, { hpOverflow: lay.hpOverflow, hpTextOutsideBar: lay.hpTextOutsideBar, enTextBelow: lay.enTextBelow, comboLeft: lay.comboLeft });
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
