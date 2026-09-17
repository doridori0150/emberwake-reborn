/* 로컬 정적 서버. 원본 Emberwake(8791)와 겹치지 않도록 8812를 쓴다. 사용법: npm start [-- --port 8813] */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), i = process.argv.indexOf('--port'), PORT = Number(i > 0 ? process.argv[i + 1] : process.env.PORT || 8812);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png' };
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p); if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => { if (err) { res.writeHead(404); return res.end('not found'); } res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(buf); });
}).listen(PORT, '127.0.0.1', () => console.log('Emberwake Reborn → http://127.0.0.1:' + PORT + '/'));
