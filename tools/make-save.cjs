/* 시험용 저장 파일 생성: 캠페인 봇으로 진행한 상태를 저장 파일(JSON)로 남긴다.
   테스터가 후반(2·3지역)을 바로 볼 때 "저장 관리 → 파일에서 가져오기"로 쓴다.
   사용법: node tools/make-save.cjs [원정 수=30] [시드=7] → dist/test-saves/late-<원정 수>.json */
'use strict';
const fs = require('fs'),
  path = require('path');
const { campaign } = require('./campaign.cjs');
const ER = globalThis.ER;
const [runs = '30', seed = '7'] = process.argv.slice(2);
const out = campaign(seed, +runs, false, { keepState: true }),
  state = out.state;
state.run = null;
state.meta = Object.assign({}, state.meta, { note: '캠페인 봇 ' + runs + '회 진행(시드 ' + seed + ')' });
const rec = ER.save.pack(state),
  dir = path.join(__dirname, '..', 'dist', 'test-saves');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, 'late-' + runs + '.json');
fs.writeFileSync(file, JSON.stringify(rec));
console.log(
  file,
  '· 원정',
  out.runs,
  '회 · 지역',
  Object.entries(out.regions)
    .map(([k, v]) => k + (v.boss ? '✓' : v.unlocked ? '○' : '✗'))
    .join(' '),
  '· 금화',
  out.gold
);
