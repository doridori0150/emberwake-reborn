/* 로컬 정적 서버. 원본 Emberwake(8791)와 겹치지 않도록 8812를 쓴다. 사용법: npm start [-- --port 8813] */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), i = process.argv.indexOf('--port'), PORT = Number(i > 0 ? process.argv[i + 1] : process.env.PORT || 8812);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png' };
/* 개발용 저장 API(editor.html 전용). 이 서버는 127.0.0.1 에만 묶이고, 같은 출처의 요청만 받으며, 쓰는 파일은 src/content.js 하나뿐이다.
   본문은 JSON 이고 파일 내용은 서버가 직접 만든다(요청이 보낸 글자를 그대로 쓰지 않는다). 직전 파일은 dist/content.prev.js 로 남긴다. */
function dev(req, res, p) {
  const json = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(o)); };
  const host = String(req.headers.host || ''), origin = req.headers.origin;
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host) || (origin && origin !== 'http://' + host)) return json(403, { ok: false, reason: '로컬 요청만 받는다' });
  if (p === '/__dev/ping') return json(200, { ok: true });
  if (p !== '/__dev/content' || req.method !== 'POST') return json(404, { ok: false, reason: '없는 API' });
  let body = '', big = false; req.on('data', c => { body += c; if (body.length > 2e6) { big = true; req.destroy(); } });
  req.on('end', () => { if (big) return; try {
    const content = JSON.parse(body), fmt = require('../src/contentfmt.js').contentfmt, why = fmt.check(content); if (why) return json(400, { ok: false, reason: why });
    const out = path.join(ROOT, 'src', 'content.js'); fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true }); if (fs.existsSync(out)) fs.copyFileSync(out, path.join(ROOT, 'dist', 'content.prev.js'));
    fs.writeFileSync(out, fmt.text(content)); json(200, { ok: true, enemies: Object.keys(content.enemies).length, spawns: content.spawns.length, rooms: content.rooms.length });
  } catch (e) { json(400, { ok: false, reason: String(e.message || e) }); } });
}
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html';
  if (p.startsWith('/__dev/')) return dev(req, res, p);
  const file = path.join(ROOT, p); if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => { if (err) { res.writeHead(404); return res.end('not found'); } res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(buf); });
});
// --open <page>: 서버가 뜨면(또는 이미 떠 있으면) 기본 브라우저로 그 페이지를 연다. 실행용 .bat 이 쓴다.
const oi = process.argv.indexOf('--open'), page = oi > 0 ? String(process.argv[oi + 1] || '').replace(/[^\w.\-#?=]/g, '') : null;
const openPage = () => { if (!page) return; const url = 'http://127.0.0.1:' + PORT + '/' + page; require('child_process').exec(process.platform === 'win32' ? 'start "" "' + url + '"' : process.platform === 'darwin' ? 'open "' + url + '"' : 'xdg-open "' + url + '"'); };
server.on('error', e => { if (e.code === 'EADDRINUSE') { console.log('이미 실행 중입니다 → http://127.0.0.1:' + PORT + '/'); openPage(); setTimeout(() => process.exit(0), 500); } else throw e; });
server.listen(PORT, '127.0.0.1', () => { console.log('Emberwake Reborn → http://127.0.0.1:' + PORT + '/  (콘텐츠 도구: /editor.html)  이 창을 닫으면 서버가 꺼집니다.'); openPage(); });
