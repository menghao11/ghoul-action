// 截图集：node tests/gallery.js —— 生成 shots/g_*.png 用于目视检查
const { chromium, devices } = require('playwright'); const path = require('path');
const BASE = process.argv[2] || 'http://127.0.0.1:8792/';
(async () => { const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage(); p.on('pageerror', (e) => console.log('PE', e.message));
  await p.goto(BASE + '?autostart=1&nolock=1'); await p.waitForFunction(() => window.__dbg && __dbg.ready); await p.waitForTimeout(1500);
  const sim = (n, src = '') => p.evaluate(([n, src]) => { const f = src ? new Function('i', 'D', 'W', src) : null; for (let i = 0; i < n; i++) { f && f(i, __dbg, __world); __world.step(1 / 60); } }, [n, src]);
  const shot = async (name) => { await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); await p.screenshot({ path: path.join(__dirname, '..', 'shots', name) }); };
  const setup = async (type, n = 3) => { await p.evaluate(([type, n]) => { __dbg.manual(true); __dbg.noWaves(); __dbg.clearEnemies(); __dbg.god(true); __dbg.teleport(-10, 0.5); __world.player.yaw = Math.PI / 2; __dbg.setType(type); __world.cam.yaw = -Math.PI / 2 - 0.5; __world.cam.snap(__world.player); for (let k = 0; k < n; k++) __dbg.spawn('grunt', -7 + k * 0.6, -1 + k); }, [type, n]); await sim(50, 'W.enemies.forEach(e=>e.cool=9)'); };
  await setup(3); await sim(8, `if(i===0) D.press('dodge');`); await shot('g_dodge_afterimage.png');
  await setup(3); await sim(26, `if(i===0) D.press('heavy');`); await shot('g_balanced_thrust.png');
  await setup(3); await sim(30, `if(i===0) D.press('skill');`); await shot('g_balanced_spin.png');
  await setup(2); await sim(22, `if(i===0) D.press('skill');`); await shot('g_burst_frenzy.png');
  await setup(1); await sim(28, `if(i===0) D.press('heavy');`); await shot('g_heavy_smash.png');
  await setup(1); await sim(20, `if(i===0) D.press('skill');`); await shot('g_heavy_guard.png'); await p.evaluate(() => __dbg.release('skill'));
  await setup(0); await sim(40, `if(i===0) D.press('skill');`); await shot('g_ranged_rain.png');
  await setup(3, 1); await sim(120, `if(i===0||i===16) D.press('light'); if(i===34) D.press('heavy'); if(i===62) D.press('jump'); if(i===84||i===100) D.press('light');`); await shot('g_air_juggle.png');
  await b.close(); })();
