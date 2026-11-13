// Boss 击杀时长基准：node tests/boss_ttk.js [runs]（神模式 bot 与非神模式 bot，各跑 N 次，单位：游戏秒）
const { chromium } = require('playwright');
const BASE = process.env.URL || 'http://127.0.0.1:8792/'; const RUNS = +(process.argv[2] || 3);
const GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const BOT = `window.__bot = (i) => { const W = __world, P = W.player, I = W.input; const es = W.enemies.filter((e) => e.alive && e.state !== 'spawn'); if (!es.length) { __dbg.move(0,0); return; }
  es.sort((a, b) => a.pos.distanceTo(P.pos) - b.pos.distanceTo(P.pos)); const e = es.find((x) => x.isBoss) && Math.random() < 0.5 ? es.find((x) => x.isBoss) : es[0];
  if (!W.cam.lockTarget) I.press('lock');
  const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z, d = Math.hypot(dx, dz); const f = W.cam.forward(), r = W.cam.right();
  if (d > 2.6) __dbg.move((dx * r.x + dz * r.z) / d, (dx * f.x + dz * f.z) / d); else __dbg.move(0, 0);
  const threat = W.enemies.some((x) => x.alive && x.atk && x.state === 'windup' && x.atk.wdur - x.atk.t < 0.12 && x.pos.distanceTo(P.pos) < 6);
  if (threat && i % 3 === 0) I.press('dodge');
  if (d < 4 && i % 11 === 0) I.press('light'); if (d < 4 && i % 53 === 0) I.press('heavy'); if (i % 97 === 0) I.press('skill'); if (i % 300 === 0) I.press('type' + ((i / 300 | 0) % 4));
  if (P.energy >= 100) I.press('ult'); if (P.awake > 0 && P.awake < 10) I.press('ult'); };`;
(async () => {
  const b = await chromium.launch({ args: GL }); const out = { god: [], normal: [] };
  for (const mode of ['god', 'normal']) for (let r = 0; r < RUNS; r++) {
    const p = await (await b.newContext({ viewport: { width: 640, height: 360 } })).newPage();
    await p.goto(BASE + '?autostart=1&nolock=1&q=low'); await p.waitForFunction(() => window.__dbg && window.__dbg.ready);
    await p.evaluate(([god, bot]) => { __dbg.manual(true); __dbg.god(god); eval(bot); __dbg.clearEnemies(); __dbg.teleport(4, 0); __world.wave = 1; __world.nextWave(); }, [mode === 'god', BOT]);
    const t0 = await p.evaluate(() => __world.realTime); let res = null;
    for (let k = 0; k < 30; k++) { res = await p.evaluate((k) => { for (let i = 0; i < 600; i++) { window.__bot(i + k * 600); __world.step(1 / 60); const bs = __world.enemies.find((e) => e.isBoss); if ((bs && !bs.alive) || !__world.player.alive) break; }
      const bs = __world.enemies.find((e) => e.isBoss); return { dead: bs ? !bs.alive : true, alive: __world.player.alive, t: __world.realTime, hp: __world.player.hp, dmgTaken: __world.stats.dmgTaken }; }, k); if (res.dead || !res.alive) break; }
    out[mode].push({ sec: +(res.t - t0).toFixed(1), bossDead: res.dead, playerAlive: res.alive, dmgTaken: Math.round(res.dmgTaken || 0) });
    await p.context().close();
  }
  await b.close(); console.log(JSON.stringify(out));
})();
