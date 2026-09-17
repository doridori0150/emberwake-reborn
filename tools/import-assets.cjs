/* 참조 프로젝트(EmberwakePrototype)의 실행용 에셋을 읽기 전용으로 복사하고
   새 게임의 의미 기반 ID 매니페스트(src/asset-manifest.js)를 생성한다.
   원본 폴더는 수정하지 않는다. 사용법: node tools/import-assets.cjs */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SRC = path.resolve(ROOT, '..', 'EmberwakePrototype');
const OUT = path.join(ROOT, 'assets');
global.window = {};
require(path.join(SRC, 'asset-manifest.js'));
const OLD = window.EmberAssetManifest.assets;

const files = new Map(); // 원본 상대경로 -> 새 파일명
function copy(oldSrc) {
  const name = path.basename(oldSrc);
  if (!files.has(oldSrc)) { fs.copyFileSync(path.join(SRC, oldSrc), path.join(OUT, name)); files.set(oldSrc, name); }
  return 'assets/' + name;
}
const r2 = n => Math.round(n * 100) / 100;
const out = {};

// 4방향 32프레임 캐릭터
function actor(newId, oldId, label) {
  const a = OLD[oldId], frames = {};
  for (const [k, f] of Object.entries(a.frames)) frames[k] = [r2(f.x), r2(f.y), r2(f.w), r2(f.h), r2(f.pivot.x), r2(f.pivot.y)];
  const anims = {};
  for (const [name, an] of Object.entries(a.animations)) anims[name] = { dirs: an.directions, ms: an.frameMs, loop: !!an.loop, hit: an.hitFrame ?? 0 };
  out[newId] = { kind: 'actor', label, src: copy(a.src), bodyHeight: r2(a.bodyHeight), frames, anims };
}
// 단일 시점 적(좌향 원화, 우향은 좌우 반전)
function enemy(newId, oldId, label) {
  const a = OLD[oldId], frames = {};
  for (const [k, f] of Object.entries(a.frames)) frames[k] = [r2(f.x), r2(f.y), r2(f.w), r2(f.h), r2(f.pivot.x), r2(f.pivot.y)];
  out[newId] = { kind: 'enemy', label, src: copy(a.src), bodyHeight: r2(a.bodyHeight), frames, facesLeft: true,
    anims: { idle: { frames: ['0'], ms: 600, loop: true }, walk: { frames: ['0', '3'], ms: 160, loop: true }, attack: { frames: ['1', '2', '0'], ms: 110, loop: false, hit: 1 }, hurt: { frames: ['3', '0'], ms: 110, loop: false } } };
}
function image(newId, oldId) { const a = OLD[oldId]; if (!a) throw new Error('없는 에셋: ' + oldId); out[newId] = { kind: 'image', src: copy(a.src), w: a.width, h: a.height }; }

actor('actor.ara', 'actor.warrior', '아라');
actor('actor.noa', 'actor.rogue', '노아');
actor('actor.lumi', 'actor.mage', '루미');
enemy('enemy.goblin', 'enemy.goblin', '약탈자');
enemy('enemy.wolf', 'enemy.wolf', '늑대');
enemy('enemy.brute', 'enemy.brute', '철갑병');
enemy('enemy.archer', 'enemy.archer', '사수');
enemy('enemy.shaman', 'enemy.shaman', '뼈가면 술사');
enemy('enemy.warden', 'enemy.warden', '수문장');

// 미궁 타일/소품 아틀라스: 4x4 균등 격자
{
  const a = OLD['labyrinth.atlas']; const cell = a.width / 4;
  const names = ['floor.verdant', 'floor.foundry', 'floor.archive', 'floor.cobble', 'wall.verdant', 'wall.foundry', 'wall.archive', 'prop.pillar',
    'prop.chest', 'prop.ore', 'prop.herb', 'prop.lantern', 'prop.portal', 'prop.table', 'prop.shelf', 'prop.crate'];
  // 셀 안 실제 그림 경계(알파>40, PIL로 실측). 바닥·벽은 가장자리 번짐을 피해 4px 안쪽을 쓴다.
  const B = [[45,46,274,274],[45,48,273,274],[44,48,271,274],[41,42,272,274],[35,28,288,273],[35,19,285,277],[38,23,278,270],[98,11,214,286],[51,49,272,313],[22,51,289,260],[47,22,272,279],[85,7,226,291],[27,0,290,271],[30,23,286,251],[31,17,288,250],[48,47,262,247]];
  const frames = {}; names.forEach((n, i) => { const b = B[i], pad = i < 7 ? 4 : 0, cx = Math.floor((i % 4) * cell), cy = Math.floor(Math.floor(i / 4) * cell); frames[n] = [cx + b[0] + pad, cy + b[1] + pad, b[2] - b[0] - pad * 2, b[3] - b[1] - pad * 2]; });
  out['tiles.labyrinth'] = { kind: 'atlas', src: copy(a.src), frames };
}
for (const m of ['wood', 'ore', 'herb', 'flax', 'resin', 'hide', 'relic', 'coal', 'crystal', 'essence', 'gold', 'scroll']) image('material.' + m, 'icon.lab.' + m);
image('gear.coat', 'icon.lab.coat'); image('gear.pack', 'icon.lab.pack'); image('gear.shield', 'icon.lab.shield'); image('gear.sword', 'icon.lab.sword');
image('gear.pick', 'icon.recipe.pickaxe'); image('gear.compass', 'icon.recipe.compass'); image('gear.flash', 'icon.recipe.flash'); image('gear.bandage', 'icon.recipe.bandage');
image('gear.signal', 'icon.recipe.signal'); image('gear.tonic', 'icon.recipe.tonic');
for (let i = 0; i < 4; i++) image('facility.workshop.' + i, 'station.forge.' + i);
image('facility.stash.1', 'station.stash.0'); image('facility.stash.2', 'station.stash'); image('facility.stash.extra', 'hub.attachment.provisions');
image('facility.barracks.1', 'station.barracks.0'); image('facility.barracks.2', 'station.barracks'); image('facility.barracks.extra', 'hub.attachment.armor');
image('facility.observatory.1', 'station.survey.0'); image('facility.observatory.2', 'station.cards'); image('facility.observatory.extra', 'world.tower');
image('facility.board', 'station.desk');
for (const d of ['banner', 'bench', 'crate', 'lamp', 'plant', 'rug', 'fountain']) image('decor.' + d, 'decor.' + d);
image('prop.camp', 'world.camp'); image('prop.seal', 'world.seal'); image('prop.altar', 'world.altar'); image('prop.cache', 'world.cache'); image('prop.beacon', 'world.beacon'); image('prop.gate', 'world.portal');
for (const c of ['fire', 'heal', 'jump', 'ward', 'whirl', 'venom', 'scout', 'harvest', 'bastion', 'shieldLance', 'shadowstep', 'lure', 'finisher', 'expose', 'chainMark', 'catalyst', 'gravity', 'recycle', 'rally', 'volley', 'breach', 'bladeDance', 'purify', 'rewind', 'timeStop', 'salvo', 'bomb', 'eclipse', 'toxicRain', 'renew'])
  image('cardart.' + c, 'icon.card.' + c);

const manifest = { version: 1, generatedFrom: 'EmberwakePrototype/asset-manifest.js (v0.16.1)', assets: out };
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
fs.writeFileSync(path.join(ROOT, 'src', 'asset-manifest.js'), '/* tools/import-assets.cjs 가 생성. 직접 수정하지 말고 assets/manifest.json 과 도구를 고친다. */\n(function(g){g.ER=g.ER||{};g.ER.ASSETS=' + JSON.stringify(manifest) + ';if(typeof module==="object")module.exports=g.ER.ASSETS;})(typeof globalThis!=="undefined"?globalThis:this);\n');
let bytes = 0; for (const n of files.values()) bytes += fs.statSync(path.join(OUT, n)).size;
console.log('에셋 ID', Object.keys(out).length, '파일', files.size, '바이트', bytes);
