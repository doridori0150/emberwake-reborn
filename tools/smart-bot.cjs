/* 전투 봇으로 장면별 난이도를 본다(봇 본체는 src/bot.js). 사용법: node tools/smart-bot.cjs [횟수] [grown] */
'use strict';
require('../src/guild.js'); require('../src/bot.js');
const ER = globalThis.ER, D = ER.data, { turn, fight, arena, duel } = ER.bot;
const SCENES = {
  '회랑 일반(약탈자+늑대)': ['verdant', [['goblin', 8, 4], ['wolf', 9, 2]]], '회랑 사수전(사수+약탈자)': ['verdant', [['archer', 10, 4], ['goblin', 7, 5]]],
  '회랑 정예(철갑병+사수)': ['verdant', [['brute', 8, 4], ['archer', 10, 2]]], '수문장': ['verdant', [['warden', 9, 4]]],
  '용광로 일반(사냥개2)': ['foundry', [['hound', 8, 3], ['hound', 9, 5]]], '집행자': ['foundry', [['overseer', 9, 4]]], '사제': ['archive', [['hierophant', 9, 4]]]
};
if (require.main === module) {
  const n = +(process.argv[2] || 100), grown = process.argv[3] === 'grown'; if (grown) console.log('[성장 조건: 훈련 2단계 + 장비 2개 + 회복실 3단계]'); console.log('장면 | 대원: 승률 · 승리 시 평균 잔여 HP% · 평균 턴');
  for (const [name, [region, foes]] of Object.entries(SCENES)) { const r = duel(foes, { n, region, grown, seed: 'sb' }); console.log(name.padEnd(18), '|', Object.entries(r).map(([h, v]) => h + ' ' + Math.round(v.win * 100) + '%·' + Math.round(v.hpLeft * 100) + '%·' + v.turns.toFixed(1)).join('  ')); }
}
module.exports = { turn, fight, arena, SCENES };
