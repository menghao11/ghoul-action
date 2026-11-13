const { chromium, devices } = require('playwright');
(async () => { const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', e => errs.push('PE ' + e.message + '\n' + e.stack)); p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ' ' + m.text()); });
  await p.goto((process.env.URL || 'http://127.0.0.1:8792/') + '?autostart=1&nolock=1'); await p.waitForTimeout(4000);
  console.log(JSON.stringify(await p.evaluate(() => window.__dbg && __dbg.state()), null, 0).slice(0, 800));
  await p.screenshot({ path: 'shots/_quick.png' }); console.log(errs.join('\n')); await b.close(); })();
