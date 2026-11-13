// 给 index.html 打缓存版本号（GitHub Pages 静态托管用）：node tools/stamp.mjs
// - style.css / src/main.js 加 ?v=<内容哈希>
// - import map 为每个 src/*.js 建立 "./src/x.js" → "./src/x.js?v=…" 映射，模块内部的相对 import 也能被刷新
// 全部是相对路径，可以部署在子路径（如 https://<user>.github.io/ghoul-action/）下。
import fs from 'fs'; import path from 'path'; import crypto from 'crypto';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const files = fs.readdirSync(path.join(root, 'src')).filter((f) => f.endsWith('.js')).sort();
const h = crypto.createHash('sha1'); for (const f of ['style.css', ...files.map((f) => 'src/' + f)]) h.update(fs.readFileSync(path.join(root, f)));
const v = h.digest('hex').slice(0, 8);
const imports = { three: './vendor/three.module.js?v=r170', 'three/addons/': './vendor/addons/' };
for (const f of files) imports['./src/' + f] = './src/' + f + '?v=' + v;
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>/, '<script type="importmap">\n' + JSON.stringify({ imports }, null, 1) + '\n</script>');
html = html.replace(/href="style\.css(\?v=[^"]*)?"/, `href="style.css?v=${v}"`);
html = html.replace(/src="src\/main\.js(\?v=[^"]*)?"/, `src="src/main.js?v=${v}"`);
html = html.replace(/<meta name="build" content="[^"]*">\n?/, '').replace('<meta charset="utf-8">', `<meta charset="utf-8">\n<meta name="build" content="${v}">`);
fs.writeFileSync(path.join(root, 'index.html'), html);
console.log('stamped', v, files.length, 'modules');
