/* 단일 HTML 포터블 빌드. 스크립트·스타일·에셋(base64)을 모두 내장한다. 네트워크·서버가 필요 없다.
   사용법: npm run build → dist/EmberwakeReborn-Portable.html */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const pkg = JSON.parse(read('package.json'));
let html = read('index.html');
const manifest = JSON.parse(read('assets/manifest.json')), cache = new Map(); let bytes = 0;
for (const a of Object.values(manifest.assets)) {
  if (!cache.has(a.src)) { const buf = fs.readFileSync(path.join(ROOT, a.src)); bytes += buf.length; cache.set(a.src, 'data:image/' + path.extname(a.src).slice(1) + ';base64,' + buf.toString('base64')); }
  a.src = cache.get(a.src);
}
const safe = s => s.replace(/<\/script/gi, '<\\/script'); // 내장 스크립트 안의 </script 가 태그를 닫지 못하게 한다
html = html.replace('<link rel="stylesheet" href="styles.css">', '<style>\n' + read('styles.css') + '\n</style>');
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => src === 'src/asset-manifest.js'
  ? '<script>(function(g){g.ER=g.ER||{};g.ER.ASSETS=' + safe(JSON.stringify(manifest)) + ';})(globalThis);</script>'
  : '<script>\n' + safe(src === 'src/content.js' ? read(src).replace(/"src": "(assets\/portraits\/[a-z0-9_]+\.(png|jpg|webp))"/g, (m, f, ext) => { const buf = fs.readFileSync(path.join(ROOT, f)); bytes += buf.length; return '"src": "data:image/' + (ext === 'jpg' ? 'jpeg' : ext) + ';base64,' + buf.toString('base64') + '"'; }) : read(src)) + '\n</script>');
html = html.replace('<title>', '<!-- Emberwake Reborn v' + pkg.version + ' portable build ' + new Date().toISOString() + ' -->\n<title>');
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
const out = path.join(ROOT, 'dist', 'EmberwakeReborn-Portable.html'); fs.writeFileSync(out, html);
if (/src="(src|assets)\//.test(html) || html.includes('href="styles.css"')) throw new Error('내장되지 않은 외부 참조가 남아 있다');
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>')), style = html.slice(html.indexOf('<style>'), html.indexOf('</style>') + 8);
fs.writeFileSync(path.join(ROOT, 'dist', 'EmberwakeReborn-Artifact.html'), ['<title>Emberwake Reborn</title>', style, '<style>html,body{height:100%;background:#0e1113}</style>', body].join(String.fromCharCode(10))); // claude.ai Artifact 게시용
console.log('빌드 완료:', path.relative(ROOT, out), (fs.statSync(out).size / 1048576).toFixed(2) + ' MB', '(에셋 원본', (bytes / 1048576).toFixed(2) + ' MB, 파일', cache.size + '개)');
