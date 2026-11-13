// 生成只含运行时文件的 dist/（给 GitHub Pages 用）：node tools/build_dist.mjs [输出目录，默认 dist]
// 不包含 tests/、tools/、shots/、review/、README、美术/音频源文件和说明文档。
// 只用相对路径，可部署在子路径（如 https://<user>.github.io/ghoul-action/）下。
import fs from 'fs'; import path from 'path'; import { execFileSync } from 'child_process';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.resolve(root, process.argv[2] || 'dist');
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const copy = (rel) => { const s = path.join(root, rel); if (!fs.existsSync(s)) throw new Error('缺少运行时文件: ' + rel); fs.mkdirSync(path.dirname(path.join(out, rel)), { recursive: true }); fs.cpSync(s, path.join(out, rel), { recursive: true }); };
const list = (dir, re) => fs.readdirSync(path.join(root, dir)).filter((f) => re.test(f)).map((f) => dir + '/' + f);
const files = [
  'index.html', 'style.css', '.nojekyll',
  'src', 'vendor', 'art/lib', 'art/manifest.json',
  ...list('art/models', /\.glb$/).filter((f) => !/_rig\.glb$/.test(f)),
  ...list('art/fx', /^(?!_).*\.png$/),
  'audio/MANIFEST.md', ...list('audio', /\.(ogg|m4a)$/),
];
// art/models 里只带游戏实际加载的模型（与 src/models.js 一致）
const used = fs.readFileSync(path.join(root, 'src/models.js'), 'utf8');
const runtime = files.filter((f) => !f.startsWith('art/models/') || used.includes(path.basename(f)));
for (const f of runtime) copy(f);
execFileSync(process.execPath, [path.join(root, 'tools/stamp.mjs'), out], { stdio: 'inherit' });
// 自检：不应带进本地路径或原作 IP 相关文件名
const bad = []; const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else { const rel = path.relative(out, p);
  if (/ghoul|kagune|kakugan|quinque|rinkaku/i.test(rel)) bad.push('文件名: ' + rel);
  if (/\.(js|html|css|md|json)$/.test(f) && /\/workspace\/|127\.0\.0\.1/.test(fs.readFileSync(p, 'utf8'))) bad.push('本地路径: ' + rel); } } };
walk(out);
if (bad.length) { console.error('dist 自检失败:\n' + bad.join('\n')); process.exit(1); }
let n = 0, bytes = 0; const count = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const st = fs.statSync(p); if (st.isDirectory()) count(p); else { n++; bytes += st.size; } } }; count(out);
console.log(`dist 完成：${path.relative(root, out) || out}，${n} 个文件，${(bytes / 1048576).toFixed(1)} MB`);
