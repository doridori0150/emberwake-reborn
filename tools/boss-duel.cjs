/* 보스 1:1 자동 결투(fixture). 사람 난이도의 근사치일 뿐이다. 사용법: node tools/boss-duel.cjs [횟수] */
'use strict';
const { bot } = require('./sim.cjs');
const ER = globalThis.ER,
  RUN = ER.run,
  M = ER.map,
  D = ER.data;
const n = +(process.argv[2] || 100);
for (const [region, boss] of [
  ['verdant', 'warden'],
  ['foundry', 'overseer'],
  ['archive', 'hierophant']
])
  for (const hero of Object.keys(D.HEROES)) {
    let win = 0,
      hp = 0,
      rounds = 0;
    for (let i = 0; i < n; i++) {
      const run = RUN.create({ regionId: region, heroId: hero, deck: D.HEROES[hero].deck, seed: 'duel' + i, noEvents: true });
      const rm = RUN.room(run);
      rm.objects = rm.objects.filter(o => o.kind === 'portal');
      rm.enemies = [Object.assign(M.makeEnemy(boss, 9, 4, { n: 999 }), { state: 'alert' })];
      run.hero.x = 2;
      run.hero.y = 4;
      run.mode = 'explore';
      RUN.act(run, { t: 'step', dir: 'right' });
      if (run.mode !== 'combat') {
        run.mode = 'combat';
        run.turn = 1;
        Object.assign(run.hero, { mp: RUN.moveMax(run), main: 1, bonus: 1 });
      }
      const orig = run.flags;
      let guard = 0;
      while (run.status === 'active' && !run.flags.bossDead && guard++ < 60) {
        bot.step ? bot.step(run) : null;
        break;
      }
      // sim 봇은 보스를 잡으면 목표를 줍고 귀환한다.
      bot(run, 'boss');
      if (run.flags.bossDead) {
        win++;
        hp += run.hero.hp / run.hero.maxHp;
      }
      rounds += run.stats.rounds;
    }
    console.log(
      region,
      boss,
      hero,
      '승',
      win + '/' + n,
      '승리 시 잔여HP',
      win ? (hp / win).toFixed(2) : '-',
      '평균 라운드',
      (rounds / n).toFixed(1)
    );
  }
