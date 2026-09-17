/* assets/town/*.webp (이미지 생성으로 받은 마을 에셋, tools/process-generated.py 가 만든다)를 매니페스트에 'town.<이름>' 으로 등록한다.
   참조 프로젝트 없이도 돌릴 수 있게 import-assets 와 따로 둔다. 사용법: node tools/town-assets.cjs */
'use strict';
const fs = require('fs'),
  path = require('path');
const ROOT = path.resolve(__dirname, '..'),
  DIR = path.join(ROOT, 'assets', 'town');

// WebP 헤더에서 크기를 읽는다(VP8X / VP8L / VP8).
function webpSize(buf) {
  const tag = buf.toString('ascii', 12, 16);
  if (tag === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
  if (tag === 'VP8L') {
    const b = buf.readUInt32LE(21);
    return [1 + (b & 0x3fff), 1 + ((b >> 14) & 0x3fff)];
  }
  return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
}

function merge(assets) {
  if (!fs.existsSync(DIR)) return 0;
  let n = 0;
  for (const k of Object.keys(assets)) if (k.startsWith('town.')) delete assets[k];
  for (const f of fs.readdirSync(DIR).sort()) {
    if (!f.endsWith('.webp')) continue;
    const [w, h] = webpSize(fs.readFileSync(path.join(DIR, f)));
    assets['town.' + f.slice(0, -5)] = { kind: 'image', src: 'assets/town/' + f, w, h };
    n++;
  }
  return n;
}

function write(manifest) {
  fs.writeFileSync(path.join(ROOT, 'assets', 'manifest.json'), JSON.stringify(manifest, null, 1));
  fs.writeFileSync(
    path.join(ROOT, 'src', 'asset-manifest.js'),
    '/* tools/import-assets.cjs · tools/town-assets.cjs 가 생성. 직접 수정하지 말고 assets/manifest.json 과 도구를 고친다. */\n(function(g){g.ER=g.ER||{};g.ER.ASSETS=' +
      JSON.stringify(manifest) +
      ';if(typeof module==="object")module.exports=g.ER.ASSETS;})(typeof globalThis!=="undefined"?globalThis:this);\n'
  );
}

if (require.main === module) {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'manifest.json'), 'utf8'));
  const n = merge(manifest.assets);
  write(manifest);
  console.log('마을 에셋', n, '개 등록 · 전체 ID', Object.keys(manifest.assets).length);
}
module.exports = { merge, write };
