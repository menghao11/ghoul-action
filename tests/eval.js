const { chromium, devices } = require('playwright');
(async () => { const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', e => errs.push('PE ' + e.message + '\n' + e.stack)); p.on('console', m => { errs.push(m.type() + ' ' + m.text()); });
  await p.goto((process.env.URL || 'http://127.0.0.1:8792/') + '?autostart=1&nolock=1' + (process.env.QS || '')); await p.waitForTimeout(+process.env.WAIT || 3000);
  const code = process.argv[2]; if (code) console.log(JSON.stringify(await p.evaluate(code)));
  if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT }); console.log(errs.join('\n')); await b.close(); })();
