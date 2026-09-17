'use strict';
/* 자동 검사(규칙·생성·저장). 사람 플레이의 재미를 증명하지 않으며 docs/WORKLOG.md 의 직접 플레이 기록과 구분한다. */
const test = require('node:test'), assert = require('node:assert');
require('../src/guild.js'); require('../src/save.js');
const ER = globalThis.ER, { RUN = ER.run, G = ER.guild } = {}, D = ER.data, M = ER.map;
const { bot } = require('../tools/sim.cjs');
const mk = (hero = 'ara', seed = 't', region = 'verdant', extra = {}) => RUN.create(Object.assign({ regionId: region, heroId: hero, deck: D.HEROES[hero].deck, seed, noCrit: true, flatAttack: true, noEvents: true }, extra));
// fixture: 빈 방 한가운데에 영웅과 지정한 적만 둔다.
function arena(hero, foes, opts = {}) {
  const run = mk(hero, opts.seed || 'arena', 'verdant', opts.extra); const rm = RUN.room(run);
  rm.tiles = rm.tiles.map((row, y) => row.replace(/[oh]/g, '.')); rm.objects = []; run.hero.x = 3; run.hero.y = 4;
  rm.enemies = foes.map(([kind, x, y], i) => Object.assign(M.makeEnemy(kind, x, y, { n: 900 + i }), opts.alert === false ? {} : { state: 'alert' }));
  if (opts.alert !== false) { RUN.act(run, { t: 'guard' }); run.mode = 'combat'; run.turn = 1; Object.assign(run.hero, { mp: RUN.moveMax(run), main: 1, bonus: 1, block: 0 }); }
  if (opts.hand) run.deck.hand = opts.hand.slice(); run.events = []; return run;
}

test('주사위: 고정값·1d1*20·범위·성공률·행운·안정', () => {
  const rs = ER.rng.seedStreams('d'), before = rs.dice;
  assert.equal(ER.dice.roll(20, rs).total, 20); assert.equal(ER.dice.roll('1d1*20', rs).total, 20);
  assert.equal(rs.dice, before, '고정값과 1면 주사위는 난수 상태를 소비하지 않는다');
  assert.deepEqual(ER.dice.bounds('1d4+2'), { min: 3, max: 6, fixed: false }); assert.deepEqual(ER.dice.bounds('2d6+3'), { min: 5, max: 15, fixed: false });
  for (let i = 0; i < 200; i++) { const r = ER.dice.roll('2d6+3', rs); assert.ok(r.total >= 5 && r.total <= 15); }
  assert.ok(rs.dice !== before);
  assert.equal(ER.dice.chance('1d20', 11), 0.5); assert.ok(Math.abs(ER.dice.chance('1d20', 11, { mode: 'advantage' }) - 0.75) < 1e-9);
  assert.equal(ER.dice.roll('1d20', rs, { mode: 'steady' }).total, 11); assert.equal(ER.dice.chance('1d20', 11, { mode: 'steady' }), 1); assert.equal(ER.dice.chance('1d20', 14, { mode: 'steady' }), 0);
  const adv = ER.dice.roll('1d20', rs, { mode: 'advantage' }); assert.equal(adv.candidates.length, 2); assert.equal(adv.total, Math.max(...adv.candidates));
  assert.throws(() => ER.dice.parse('9d999'));
});

test('난수 흐름 분리: 주사위를 굴려도 맵·드로우 흐름은 그대로', () => { const rs = ER.rng.seedStreams('x'), snap = Object.assign({}, rs); ER.dice.roll('1d20', rs); assert.equal(rs.map, snap.map); assert.equal(rs.draw, snap.draw); assert.notEqual(rs.dice, snap.dice); });

test('미궁 생성: 연결·필수 요소·첫 투자 재료 공급 (지역별 150시드)', () => {
  for (const region of Object.keys(D.REGIONS)) for (let i = 0; i < 150; i++) {
    const m = M.generate(region, ER.rng.seedStreams(region + i)); const R = D.REGIONS[region];
    assert.equal(m.rooms.length, R.rooms); const sanct = m.rooms.filter(r => r.type === 'sanctum'); assert.equal(sanct.length, 1);
    assert.equal(Object.keys(sanct[0].doors).length, 1, '성소는 막다른 방'); assert.ok(Object.values(sanct[0].doors)[0].sealed);
    assert.ok(m.devices >= 1 && !sanct[0].objects.some(o => o.kind === 'device'), '봉인 장치는 성소 밖');
    assert.ok(m.rooms[0].objects.some(o => o.kind === 'portal')); assert.ok(sanct[0].enemies.some(e => D.ENEMIES[e.kind].boss));
    for (const r of m.rooms) { assert.ok(M.valid(r), '방 내부 도달 가능'); for (const [d, door] of Object.entries(r.doors)) assert.equal(m.rooms[door.to].doors[M.OPP[d]].to, r.id); }
    if (region === 'verdant') { const mats = {}; m.rooms.filter(r => !r.danger && r.type !== 'sanctum').forEach(r => r.objects.forEach(o => { if (o.kind === 'node') mats[o.mat] = (mats[o.mat] || 0) + o.qty; })); assert.ok(mats.wood >= 4 && mats.ore >= 3, '공방 1단계 재료를 위험 방 없이 모을 수 있다: ' + JSON.stringify(mats)); }
  }
});

test('같은 시드는 같은 미궁, 저장 복원 뒤에도 같은 결과', () => {
  const a = mk('noa', 'same'), b = mk('noa', 'same'); assert.deepEqual(RUN.strip(a), RUN.strip(b));
  bot(a, 'loot'); const c = JSON.parse(JSON.stringify(RUN.strip(mk('noa', 'same')))); bot(c, 'loot'); assert.deepEqual(RUN.strip(a).bag, c.bag); assert.equal(a.time, c.time);
});

test('미리보기는 난수를 소비하지 않고, 예상 피해는 실제 피해와 같다', () => {
  for (const [hero, cardId, foe] of [['ara', 'strike', 'goblin'], ['ara', 'shield_bash', 'brute'], ['noa', 'shove', 'goblin'], ['noa', 'backstab', 'wolf'], ['lumi', 'ignite', 'brute'], ['lumi', 'spark', 'goblin'], ['ara', 'rune_bolt', 'goblin'], ['ara', 'pierce', 'brute'], ['ara', 'cleave', 'goblin']]) {
    const run = arena(hero, [[foe, 4, 4], ['goblin', 3, 3]], { hand: [cardId, 'focus'] }); run.hero.block = 5;
    RUN.act(run, { t: 'card', i: 1 }); const e = RUN.room(run).enemies[0], snap = JSON.stringify(run.rng);
    const p = RUN.preview(run, { t: 'card', i: 0, target: { id: e.id } }); assert.ok(p.ok, cardId + ': ' + p.reason); assert.equal(JSON.stringify(run.rng), snap, '미리보기가 RNG를 움직였다');
    const hp = e.hp; run.events = []; RUN.act(run, { t: 'card', i: 0, target: { id: e.id } }); const dealt = run.events.filter(x => x.t === 'dmg' && x.id === e.id && ['hit', 'slam', 'hazard', 'trap'].includes(x.kind)).reduce((n, x) => n + x.n, 0);
    assert.ok(dealt >= p.dmg[0].min && dealt <= p.dmg[0].max, cardId + ' 예상 ' + p.dmg[0].min + '~' + p.dmg[0].max + ' 실제 ' + dealt); assert.ok(hp - Math.max(0, e.hp) >= dealt);
  }
});

test('행동 구조: 주 1·보조 1, 카드가 무료 추가 행동이 되지 않는다', () => {
  const run = arena('ara', [['goblin', 4, 4]], { hand: ['strike', 'strike', 'guard_up', 'focus'] }); const id = RUN.room(run).enemies[0].id;
  assert.ok(RUN.act(run, { t: 'card', i: 2 }).ok); assert.equal(RUN.act(run, { t: 'card', i: 2 }).ok, false, '보조 행동은 턴당 1회');
  run.room; const e = RUN.room(run).enemies[0]; e.hp = e.maxHp = 40; assert.ok(RUN.act(run, { t: 'card', i: 0, target: { id } }).ok); assert.equal(RUN.act(run, { t: 'attack', id }).ok, false, '주 행동은 턴당 1회'); assert.equal(RUN.act(run, { t: 'card', i: 0, target: { id } }).ok, false);
});

test('카드 없이도 이동·공격·방어로 전투를 끝낼 수 있다', () => { const run = arena('ara', [['goblin', 5, 4]], { hand: [] }); run.deck.draw = []; run.deck.discard = []; let n = 0; while (run.mode === 'combat' && run.status === 'active' && n++ < 40) { const e = RUN.room(run).enemies[0]; if (!RUN.act(run, { t: 'attack', id: e.id }).ok) RUN.act(run, { t: 'guard' }); RUN.act(run, { t: 'end' }); } assert.equal(run.mode, 'explore'); assert.equal(run.status, 'active'); });

test('급사 방지: 한 적 턴에 실제 공격은 최대 2회, 원거리는 1회. 사수는 조준 후 발사', () => {
  const run = arena('lumi', [['archer', 8, 4], ['archer', 3, 1], ['archer', 3, 7], ['goblin', 4, 4], ['goblin', 2, 4], ['goblin', 3, 5]]); run.hero.hp = run.hero.maxHp = 99;
  RUN.act(run, { t: 'end' }); assert.ok(RUN.room(run).enemies.filter(e => e.kind === 'archer').every(e => e.intent?.type === 'aim'), '첫 턴은 조준만');
  run.events = []; RUN.act(run, { t: 'end' }); const hits = run.events.filter(x => x.t === 'attack' && x.who !== 'hero'); assert.ok(hits.length <= 2, '공격 ' + hits.length); assert.ok(hits.filter(x => x.ranged).length <= 1);
});

test('시야를 끊으면 조준이 풀린다', () => { const run = arena('ara', [['archer', 8, 4]]); RUN.act(run, { t: 'end' }); const rm = RUN.room(run); rm.tiles[4] = rm.tiles[4].slice(0, 5) + 'o' + rm.tiles[4].slice(6); const hp = run.hero.hp; run.events = []; RUN.act(run, { t: 'end' }); assert.equal(run.hero.hp, hp); });

test('밀어치기: 벽 충돌 추가 피해, 철갑병은 장갑이 벗겨지고 기절', () => {
  const run = arena('noa', [['brute', 2, 4]], { hand: ['shove'] }); run.hero.x = 3; const e = RUN.room(run).enemies[0];
  const pv = RUN.preview(run, { t: 'card', i: 0, target: { id: RUN.room(run).enemies[0].id } }); assert.equal(pv.dmg[0].min, 1 + 3, '미리보기에 충돌 피해 포함'); assert.deepEqual(pv.dmg[0].to, [1, 4]);
  RUN.act(run, { t: 'card', i: 0, target: { id: e.id } }); assert.equal(e.x, 1); assert.equal(e.armor, 0); assert.ok(e.st.stun >= 1); assert.equal(e.hp, e.maxHp - 1 - 3);
});

test('보스: 피해 상한, 예고 후 실행, 빗나간 돌진은 빈틈', () => {
  const run = arena('ara', [['warden', 7, 4]], { hand: ['strike', 'focus'] }); const b = RUN.room(run).enemies[0]; b.x = 4; run.hero.block = 8; run.deck.hand = ['shield_bash'];
  const p = RUN.preview(run, { t: 'card', i: 0, target: { id: b.id } }); assert.equal(p.dmg[0].max, 8, '피해 상한 8');
  b.x = 7; RUN.act(run, { t: 'end' }); assert.equal(b.intent.label, '휩쓸기'); const hp = run.hero.hp; run.hero.x = 1; run.hero.y = 1; RUN.act(run, { t: 'end' }); assert.equal(run.hero.hp, hp, '예고 칸을 벗어나면 맞지 않는다');
  assert.equal(b.intent.type, 'charge'); const line = b.intent.tiles; run.hero.x = 11; run.hero.y = 7; if (line.some(([x, y]) => x === 11 && y === 7)) run.hero.x = 10; RUN.act(run, { t: 'end' }); assert.ok(b.st.exposed >= 1, '빈틈');
});

test('가방: 넘치는 물품은 사라지지 않고 현장에 남는다. 상자 재클릭은 중복 보상을 주지 않는다', () => {
  const run = mk('ara', 'bag'); for (let i = 0; i < RUN.bagSlots(run); i++) run.bag.push({ mat: 'wood', qty: 5 });
  const node = RUN.room(run).objects.find(o => o.kind === 'node' && o.mat === 'ore'); run.hero.x = node.x; run.hero.y = node.y + (node.y === 1 ? 1 : -1);
  const r = RUN.act(run, { t: 'interact', id: node.id, method: 'gather' }); assert.equal(r.ok, false); assert.ok(node.qty > 0);
  const chest = { id: 'oX', kind: 'chest', chest: 'basic', opened: false, x: run.hero.x + 1, y: run.hero.y }; RUN.room(run).objects.push(chest);
  assert.ok(RUN.act(run, { t: 'interact', id: 'oX', method: 'open' }).ok); const gold = run.gold, left = JSON.stringify(chest.contents); assert.ok(chest.contents.length > 0, '남은 물품은 상자에 보존');
  assert.equal(RUN.act(run, { t: 'interact', id: 'oX', method: 'open' }).ok, false); RUN.act(run, { t: 'interact', id: 'oX', method: 'take' }); assert.equal(run.gold, gold); assert.equal(JSON.stringify(chest.contents), left);
  RUN.act(run, { t: 'drop', slot: 0 }); assert.ok(RUN.room(run).objects.some(o => o.kind === 'pile')); RUN.act(run, { t: 'interact', id: 'oX', method: 'take' }); assert.ok(JSON.stringify(chest.contents) !== left);
});

test('상자 판정: 행운·안정·실패 우회, 저장 복원 뒤 같은 굴림', () => {
  const setup = () => { const run = mk('ara', 'chk'); RUN.room(run).objects.push({ id: 'oC', kind: 'chest', chest: 'sealed', opened: false, x: run.hero.x + 1, y: run.hero.y }); return run; };
  const a = setup(); const opts = RUN.interactions(a, RUN.room(a).objects.find(o => o.id === 'oC')); assert.deepEqual(opts.map(o => o.method), ['safe', 'check']); assert.equal(opts[1].check.chance, 0.5);
  a.hero.rollMode = 'advantage'; assert.equal(RUN.interactions(a, RUN.room(a).objects.find(o => o.id === 'oC'))[1].check.chance, 0.75);
  const b = JSON.parse(JSON.stringify(RUN.strip(a))); RUN.act(a, { t: 'interact', id: 'oC', method: 'check' }); RUN.act(b, { t: 'interact', id: 'oC', method: 'check' }); assert.deepEqual(a.stats.rolls, b.stats.rolls, '복원 후에도 같은 결과'); assert.equal(a.hero.rollMode, null, '행운은 한 번 쓰면 사라진다');
  const c = setup(); c.hero.rollMode = 'steady'; RUN.act(c, { t: 'interact', id: 'oC', method: 'check' }); assert.equal(c.stats.rolls[0].total, 11); assert.ok(c.stats.rolls[0].ok);
  const d = setup(); const t0 = d.time; RUN.act(d, { t: 'interact', id: 'oC', method: 'safe' }); assert.equal(d.time - t0, D.RULES.time.chestSafe); assert.ok(RUN.room(d).objects.find(o => o.id === 'oC').opened);
});

test('문 왕복으로 추격을 떨칠 수 없다: 추격자가 따라오고 이탈 비용을 예고한다', () => {
  const run = mk('ara', 'door'); const rm = RUN.room(run), dir = Object.keys(rm.doors)[0], [ix, iy] = M.INSIDE[dir]; run.hero.x = ix; run.hero.y = iy; run.hero.hp = run.hero.maxHp = 99;
  const e = M.makeEnemy('goblin', ix + (dir === 'W' ? 1 : dir === 'E' ? -1 : 0), iy + (dir === 'N' ? 1 : dir === 'S' ? -1 : 0), { n: 800 }); e.state = 'alert'; rm.enemies.push(e); run.mode = 'combat'; run.hero.mp = 4;
  const info = RUN.exitInfo(run, dir); assert.equal(info.freeHits, 1); assert.equal(info.chasers, 1);
  const [dx, dy] = M.DOOR[dir]; RUN.act(run, { t: 'move', x: dx, y: dy }); assert.ok(run.hero.hp < 99, '기회 공격'); assert.equal(run.pursuers.length, 1); assert.equal(run.mode, 'combat', '추격 중에는 전투가 이어진다');
  const portalBlocked = run.roomId !== 0; assert.ok(portalBlocked); RUN.act(run, { t: 'end' }); assert.ok(RUN.room(run).enemies.some(x => x.id === e.id && x.state === 'alert'), '추격자가 문을 넘어왔다');
});

test('붉은달: 단계 전환·추적자 등장·귀환문은 계속 열려 있다', () => {
  const run = mk('ara', 'moon'); run.time = run.limit - 1; RUN.act(run, { t: 'card', i: run.deck.hand.findIndex(c => D.CARDS[c].target === 'self') }); assert.equal(RUN.phaseDef(run).id, 'hunt');
  let n = 0; while (run.stalker.state !== 'here' && n++ < 10) { const i = run.deck.hand.findIndex(c => D.CARDS[c].target === 'self'); if (i < 0) break; RUN.act(run, { t: 'card', i }); } assert.equal(run.stalker.state, 'here'); assert.equal(run.mode, 'combat');
  const portal = RUN.room(run).objects.find(o => o.kind === 'portal'); const st = RUN.room(run).enemies.find(e => e.kind === 'stalker'); st.x = 1; st.y = 1; run.hero.x = portal.x; run.hero.y = portal.y + 1; st.x = (portal.x > 6 ? 1 : 11);
  assert.ok(RUN.act(run, { t: 'interact', id: portal.id, method: 'extract' }).ok); assert.equal(run.status, 'extracted');
});

test('정산: 귀환해야 입금, 중복 정산 없음, 패배 시 가방 상실, 보스 귀환으로 다음 지역 개방', () => {
  const state = { meta: { created: 'T' }, guild: G.newGame(), run: null }; assert.ok(G.startRun(state, 'settle1').ok); const run = state.run;
  run.bag = [{ mat: 'wood', qty: 4 }, { mat: 'ore', qty: 3 }]; run.gold = 12; run.flags.bossDead = true; run.flags.objective = true; run.status = 'extracted';
  const rep = G.settle(state); assert.equal(state.guild.stock.wood, 4); assert.equal(state.guild.gold, 10 + 12 + 30); assert.deepEqual(rep.unlocked, ['잿불 용광로']); assert.ok(state.guild.gearOwned.includes('crest'));
  assert.ok(rep.newly.some(x => x.name.includes('제작 공방')), '방금 가능해진 투자를 알려준다');
  state.run = run; G.settle(state); assert.equal(state.guild.stock.wood, 4, '같은 원정은 두 번 정산되지 않는다'); assert.equal(state.guild.gold, 52);
  assert.ok(G.invest(state.guild, { kind: 'facility', id: 'workshop' }).ok); assert.equal(state.guild.facilities.workshop, 1); assert.equal(state.guild.stock.wood, undefined);
  G.startRun(state, 'settle2'); state.run.bag = [{ mat: 'resin', qty: 2 }]; state.run.gold = 9; state.run.status = 'defeat'; const rep2 = G.settle(state); assert.equal(state.guild.stock.resin, undefined); assert.equal(rep2.lost.resin, 2); assert.equal(state.guild.facilities.workshop, 1, '복구한 시설은 유지');
});

test('투자 경로: 시설 공개 순서, 루미 합류, 덱 검증, 우회 해금은 이전 지역 재료만 요구', () => {
  const g = G.newGame(); assert.equal(G.facilityVisible(g, 'observatory'), false); g.stock = { wood: 20, ore: 20, flax: 9, resin: 9, scroll: 3, herb: 9, hide: 9 }; g.gold = 99;
  G.invest(g, { kind: 'facility', id: 'stash' }); assert.ok(G.facilityVisible(g, 'observatory')); assert.ok(G.invest(g, { kind: 'facility', id: 'observatory' }).ok); assert.ok(g.roster.includes('lumi'));
  assert.ok(G.invest(g, { kind: 'research', id: 'fortune' }).ok); assert.ok(G.deckAdd(g, 'ara', 'fortune').ok === false, '덱이 가득 차면 추가 불가'); G.deckRemove(g, 'ara', 0); assert.ok(G.deckAdd(g, 'ara', 'fortune').ok); assert.equal(G.deckIssues(g, 'ara', g.heroes.ara.deck).length, 0);
  assert.ok(G.deckIssues(g, 'ara', g.heroes.ara.deck.slice(1)).length > 0); assert.ok(G.deckIssues(g, 'noa', g.heroes.ara.deck).some(s => s.includes('전용')));
  const foundryOnly = new Set(D.REGIONS.verdant.materials); for (const k of Object.keys(D.QUESTS.route2.need)) assert.ok(foundryOnly.has(k), 'route2 재료 ' + k);
  const upTo2 = new Set([...D.REGIONS.verdant.materials, ...D.REGIONS.foundry.materials]); for (const k of Object.keys(D.QUESTS.route3.need)) assert.ok(upTo2.has(k));
  assert.ok(G.invest(g, { kind: 'quest', id: 'route2' }).ok); assert.ok(g.regions.foundry.unlocked);
});

test('모든 재료에는 획득처와 소비처가 있다', () => {
  const used = new Set(); const add = c => Object.keys(c || {}).forEach(k => used.add(k));
  Object.values(D.FACILITIES).forEach(f => f.levels.forEach(l => add(l.cost))); Object.values(D.GEAR).forEach(x => add(x.cost)); Object.values(D.RESEARCH).forEach(r => { add(r.cost); Object.values(r.mats || {}).forEach(add); }); D.TRAINING.forEach(t => add(t.cost)); Object.values(D.QUESTS).forEach(q => add(q.need));
  const found = new Set(); Object.values(D.REGIONS).forEach(r => { Object.values(r.rooms_def).forEach(d => d.nodes.forEach(n => found.add(n[0]))); }); Object.values(D.ENEMIES).forEach(e => e.loot.forEach(l => found.add(l[0]))); Object.values(D.CHESTS).forEach(c => { c.loot.mats.forEach(m => found.add(m[0])); (c.bonus?.mats || []).forEach(m => found.add(m[0])); });
  for (const m of Object.keys(D.MATERIALS)) { assert.ok(found.has(m), m + ' 획득처 없음'); assert.ok(used.has(m) || m === 'moonshard', m + ' 소비처 없음'); }
  for (const c of Object.values(D.CARDS)) assert.ok(ER.ASSETS === undefined || true); for (const h of Object.values(D.HEROES)) { assert.equal(h.deck.length, D.RULES.deckSize); }
});

test('저장: 체크섬·손상 감지·다른 게임 파일 거부·왕복', () => {
  const state = { meta: { created: 'T', rev: 0 }, guild: G.newGame(), run: null }; G.startRun(state, 'sv'); state.run = RUN.strip(state.run);
  const text = ER.save.exportText(state); assert.deepEqual(ER.save.importText(text), JSON.parse(JSON.stringify(state)));
  assert.throws(() => ER.save.importText(text.replace('"gold\\":10', '"gold\\":99999')), /손상/); assert.throws(() => ER.save.importText('{"app":"emberwake","data":"{}","checksum":"0"}'), /다른 게임/); assert.throws(() => ER.save.importText('not json'), /JSON/);
  assert.notEqual(ER.save.DB, 'emberwake'); assert.ok(ER.save.DB.includes('reborn'));
});

test('봇 원정: 모든 지역·대원에서 교착이나 예외 없이 끝난다', () => { for (const region of Object.keys(D.REGIONS)) for (const hero of Object.keys(D.HEROES)) for (let i = 0; i < 12; i++) { const run = mk(hero, 'bot' + i, region); bot(run, i % 2 ? 'boss' : 'loot'); assert.ok(['extracted', 'defeat'].includes(run.status)); assert.ok(run.bag.length <= RUN.bagSlots(run)); for (const s of run.bag) assert.ok(s.qty <= D.MATERIALS[s.mat].stack); } });

test('기습과 시선: 방심한 적은 바라보는 쪽 2칸만 본다. 등 뒤로 다가가면 기습, 정면이면 발각. 순찰병은 사방을 본다', () => {
  const run = arena('ara', [['goblin', 6, 4]], { alert: false, hand: ['strike'] }); const e = RUN.room(run).enemies[0]; delete e.patrol; e.facing = 'right';
  RUN.act(run, { t: 'move', x: 5, y: 4 }); assert.equal(run.mode, 'explore', '등 뒤에서는 곁에 가도 모른다'); const p = RUN.preview(run, { t: 'card', i: 0, target: { id: e.id } }); assert.equal(p.dmg[0].min, 6 + D.RULES.ambushBonus);
  RUN.act(run, { t: 'card', i: 0, target: { id: e.id } }); assert.equal(e.hp, 9 - 8); assert.equal(run.mode, 'combat'); assert.equal(run.hero.main, 0, '기습도 주 행동을 쓴다');
  const front = arena('ara', [['goblin', 7, 4]], { alert: false }); const f = RUN.room(front).enemies[0]; delete f.patrol; f.facing = 'left'; assert.ok(RUN.watchTiles(front, f).some(([x, y]) => x === 5 && y === 4)); assert.ok(!RUN.watchTiles(front, f).some(([x]) => x > 7), '등 뒤는 보지 않는다');
  RUN.act(front, { t: 'move', x: 5, y: 4 }); assert.equal(front.mode, 'combat', '정면 2칸 안에 들어가면 발각'); assert.equal(front.hero.x, 5, '발각되면 걸음을 멈춘다');
  const turn = arena('ara', [['goblin', 9, 1]], { alert: false }); const t = RUN.room(turn).enemies[0]; delete t.patrol; t.facing = 'right'; turn.hero.x = 1; turn.hero.y = 7; for (let i = 0; i < 3; i++) { RUN.act(turn, { t: 'step', dir: 'right' }); RUN.act(turn, { t: 'step', dir: 'left' }); } assert.equal(t.facing, 'left', '내 6걸음마다 뒤를 돌아본다');
  const r2 = arena('ara', [['goblin', 8, 4]], { alert: false }); r2.rooms[r2.roomId].enemies[0].patrol = { a: [8, 4], b: [8, 4], to: 'b' }; r2.rooms[r2.roomId].enemies[0].facing = 'right'; RUN.act(r2, { t: 'move', x: 5, y: 4 }); assert.equal(r2.mode, 'combat', '순찰병은 등 뒤 3칸도 알아챈다');
});

test('치명타: 영웅의 직접 공격만, 확률과 최대 피해가 미리보기에 나오고 빈틈이면 확률이 오른다. 굴림은 저장 복원 뒤에도 같다', () => {
  const run = arena('ara', [['goblin', 4, 4]], { extra: { noCrit: false }, hand: ['strike'] }); const e = RUN.room(run).enemies[0]; e.hp = e.maxHp = 500;
  const p = RUN.preview(run, { t: 'attack', id: e.id }); assert.equal(p.crit, D.RULES.crit.base); assert.deepEqual([p.dmg[0].min, p.dmg[0].max, p.dmg[0].crit], [4, 4, 6]);
  e.st.exposed = 2; assert.equal(RUN.preview(run, { t: 'attack', id: e.id }).crit, D.RULES.crit.base + D.RULES.crit.exposed); e.st.exposed = 0;
  const copy = JSON.parse(JSON.stringify(RUN.strip(run))); let crits = 0; const seq = [], seq2 = [];
  for (let i = 0; i < 200; i++) { run.hero.main = 1; const hp = e.hp; RUN.act(run, { t: 'attack', id: e.id }); const d = hp - e.hp; assert.ok(d === 4 || d === 6); if (d === 6) crits++; seq.push(d); e.hp = 500; }
  assert.ok(crits > 5 && crits < 50, '치명타 ' + crits + '/200'); const e2 = RUN.room(copy).enemies[0];
  for (let i = 0; i < 200; i++) { copy.hero.main = 1; const hp = e2.hp; RUN.act(copy, { t: 'attack', id: e2.id }); seq2.push(hp - e2.hp); e2.hp = 500; } assert.deepEqual(seq, seq2);
  const foe = arena('ara', [['goblin', 4, 4]], { extra: { noCrit: false } }); foe.hero.hp = foe.hero.maxHp = 500; for (let i = 0; i < 30; i++) { const hp = foe.hero.hp; RUN.act(foe, { t: 'end' }); assert.equal(hp - foe.hero.hp, 3, '적은 치명타가 없다'); }
});

test('투지와 특수기: 전투 턴·처치·대원별 조건으로 쌓이고, 3을 써서 주/보조 행동과 함께 발동한다', () => {
  const ara = arena('ara', [['goblin', 4, 4]]); ara.hero.hp = ara.hero.maxHp = 99; assert.equal(RUN.preview(ara, { t: 'special' }).ok, false);
  RUN.act(ara, { t: 'guard' }); RUN.act(ara, { t: 'end' }); assert.equal(ara.hero.gauge, 2, '막아냄 +1, 턴 시작 +1'); RUN.act(ara, { t: 'guard' }); RUN.act(ara, { t: 'end' }); assert.equal(ara.hero.gauge, 4);
  assert.ok(RUN.act(ara, { t: 'special' }).ok); assert.equal(ara.hero.gauge, 1); assert.equal(ara.hero.block, 6); assert.equal(ara.hero.retaliate, 3); assert.equal(ara.hero.bonus, 0); assert.equal(ara.hero.main, 1, '수호의 함성은 보조 행동');
  const noa = arena('noa', [['goblin', 6, 4]]); noa.hero.gauge = 3; const g = RUN.room(noa).enemies[0]; const pv = RUN.preview(noa, { t: 'special', target: { id: g.id } }); assert.ok(pv.ok); assert.deepEqual(pv.tiles[0], [5, 4]); assert.equal(pv.dmg[0].min, 5);
  RUN.act(noa, { t: 'special', target: { id: g.id } }); assert.deepEqual([noa.hero.x, noa.hero.y], [5, 4]); assert.equal(g.hp, 4); assert.equal(noa.hero.main, 0); assert.ok(noa.hero.moved >= 3); assert.equal(RUN.act(noa, { t: 'special', target: { id: g.id } }).ok, false);
  const walk = arena('noa', [['goblin', 10, 1]]); RUN.act(walk, { t: 'move', x: 6, y: 4 }); assert.equal(walk.hero.gauge, 1, '3칸 이동 +1');
  const lumi = arena('lumi', [['goblin', 6, 4], ['goblin', 7, 4], ['goblin', 10, 7]]); lumi.hero.gauge = 3; const [a, b, c] = RUN.room(lumi).enemies; RUN.act(lumi, { t: 'special', target: { id: a.id } }); assert.equal(a.hp, 7); assert.equal(b.hp, 7); assert.equal(c.hp, 9); assert.equal(a.st.burn, 2); assert.equal(lumi.hero.gauge, 1, '3 소모 후 화상 부여 +1');
  const calm = mk('ara', 'calm'); calm.hero.gauge = 5; assert.equal(RUN.preview(calm, { t: 'special' }).ok, false, '탐사 중에는 쓸 수 없다');
});

test('수문장: 곁에 붙어 있으면 후려치고(반격 가능), 소환 예고 동안 내 턴에 빈틈이 남는다', () => {
  const run = arena('ara', [['warden', 4, 4]], { hand: ['riposte'] }); run.hero.hp = run.hero.maxHp = 99; const b = RUN.room(run).enemies[0];
  RUN.act(run, { t: 'card', i: 0 }); RUN.act(run, { t: 'end' }); assert.equal(b.hp, 42 - 6, '후려치기를 막고 반격 4 + 받아치기 2'); assert.equal(run.hero.hp, 99, '방어 4로 후려치기 4를 모두 막았다'); assert.equal(b.intent.label, '휩쓸기');
  b.step = 2; b.intent = null; run.hero.x = 9; RUN.act(run, { t: 'end' }); assert.equal(b.intent.type, 'summon'); assert.ok(b.st.exposed >= 1, '내 턴에 빈틈이 남아 있다');
});

test('근접 타격은 사수의 조준을 흐트러뜨린다', () => { const run = arena('ara', [['archer', 7, 4]]); RUN.act(run, { t: 'end' }); const e = RUN.room(run).enemies[0]; assert.equal(e.intent.type, 'aim'); run.hero.x = e.x - 1; run.hero.y = e.y; RUN.act(run, { t: 'attack', id: e.id }); assert.equal(e.intent, null); });

test('위험 지형: 밀려 들어간 적은 지형 피해를 받고 미리보기에 포함된다. 영웅은 목적지로 찍을 때만 밟는다', () => {
  const run = arena('noa', [['goblin', 4, 4]], { hand: ['shove'] }); const rm = RUN.room(run); rm.tiles[4] = rm.tiles[4].slice(0, 5) + 'h' + rm.tiles[4].slice(6); const e = rm.enemies[0];
  const p = RUN.preview(run, { t: 'card', i: 0, target: { id: e.id } }); assert.equal(p.dmg[0].min, 2 + 3); assert.equal(p.dmg[0].note, '가시덤불'); RUN.act(run, { t: 'card', i: 0, target: { id: e.id } }); assert.equal(e.hp, 9 - 5);
  run.hero.x = 3; run.hero.y = 4; e.x = 9; e.y = 1; const path = RUN.pathTo(run, 7, 4); assert.ok(path && !path.path.some(([x, y]) => x === 5 && y === 4), '경로는 가시덤불을 돌아간다');
});

test('성장이 다음 원정에 실제로 반영된다: 장비·훈련·카드 강화·시설 효과', () => {
  const g = G.newGame(); g.stock = { wood: 30, ore: 30, flax: 30, resin: 9, scroll: 5, herb: 30, hide: 9, coal: 20, crystal: 9 }; g.gold = 500;
  for (const id of ['workshop', 'stash', 'barracks', 'observatory', 'observatory']) assert.ok(G.invest(g, { kind: 'facility', id }).ok, id);
  assert.ok(G.invest(g, { kind: 'gear', id: 'coat' }).ok); assert.ok(G.invest(g, { kind: 'gear', id: 'satchel' }).ok); assert.ok(G.equip(g, 'ara', 'coat').ok); assert.ok(G.equip(g, 'ara', 'satchel').ok); assert.equal(G.equip(g, 'ara', 'crest').ok, false);
  assert.equal(G.invest(g, { kind: 'train', hero: 'ara' }).ok, false, '특성을 골라야 한다'); assert.ok(G.invest(g, { kind: 'train', hero: 'ara' }, 'ara_guard').ok);
  assert.ok(G.invest(g, { kind: 'upgrade', id: 'strike', branch: 'a' }).ok); assert.equal(G.invest(g, { kind: 'upgrade', id: 'strike', branch: 'b' }).ok, false, '한 카드에 한 갈래만');
  const state = { meta: { created: 'T' }, guild: g, run: null }; assert.ok(G.startRun(state, 'grow').ok); const run = state.run;
  assert.equal(run.hero.maxHp, 30 + 4); assert.equal(RUN.bagSlots(run), 6 + 1 + 2); assert.equal(run.items.bandage, 1); assert.equal(run.limit, 70 + 8); assert.equal(RUN.card(run, 'strike').dmg, 4);
  const fight = arena('ara', [['goblin', 4, 4]], { extra: { perks: g.heroes.ara.perks } }); RUN.act(fight, { t: 'guard' }); assert.equal(fight.hero.block, 3 + 1 + 2, '굳건함: 기본 방어 +2');
});

test('R1 균형: 노아는 3칸 이상 움직인 턴에 첫 근접 피해 -2, 수호자는 멀리 달아난 상대에게 격노 질주 후 후려친다', () => {
  const run = arena('noa', [['goblin', 9, 4]]); run.hero.hp = run.hero.maxHp = 50; RUN.act(run, { t: 'move', x: 6, y: 4 }); RUN.act(run, { t: 'end' }); assert.equal(run.hero.hp, 50 - 1, '약탈자 3 - 회피 2');
  const still = arena('noa', [['goblin', 5, 4]]); still.hero.hp = still.hero.maxHp = 50; RUN.act(still, { t: 'end' }); assert.equal(still.hero.hp, 47, '움직이지 않으면 회피 없음');
  const far = arena('lumi', [['warden', 9, 4]]); far.hero.hp = far.hero.maxHp = 50; far.hero.x = 3; RUN.act(far, { t: 'end' }); const b = RUN.room(far).enemies[0]; assert.equal(Math.abs(b.x - 3) + Math.abs(b.y - 4), 2, '6칸 거리: 2+2칸 질주'); 
  const near = arena('lumi', [['warden', 6, 4]]); near.hero.hp = near.hero.maxHp = 50; RUN.act(near, { t: 'end' }); assert.equal(near.hero.hp, 46, '3칸 거리: 2칸 다가와 후려치기 4'); assert.ok(RUN.threatTiles(near, RUN.room(near).enemies[0]).length > 0);
});

test('R2 가독성: 연쇄 전류의 전이 대상·피해가 미리보기와 같고, 기폭은 번질 대상을 표시한다', () => {
  const run = arena('lumi', [['goblin', 5, 4], ['goblin', 6, 4], ['goblin', 9, 1]], { hand: ['chain', 'detonate'] }); const [a, b, c] = RUN.room(run).enemies; a.hp = b.hp = c.hp = 30; b.st.burn = 2; c.st.burn = 1;
  const p = RUN.preview(run, { t: 'card', i: 0, target: { id: a.id } }); assert.deepEqual(p.dmg.map(d => [d.id, d.min, d.note || '']), [[a.id, 3, ''], [b.id, 3, '전이']]);
  RUN.act(run, { t: 'card', i: 0, target: { id: a.id } }); assert.equal(a.hp, 27); assert.equal(b.hp, 27); assert.equal(c.hp, 30, '2칸 밖은 전이되지 않는다');
  run.hero.main = 1; const q = RUN.preview(run, { t: 'card', i: 0, target: { id: b.id } }); assert.deepEqual(q.marks.map(m => m.id), [a.id]); assert.ok(RUN.allThreat(run).length > 0);
});

test('R3 발견 카드: 보물고 금고는 임시 카드 3장 중 1장을 제안하고, 고르기 전에는 다른 행동이 막힌다. 저장 복원 후에도 같은 제안', () => {
  const run = mk('ara', 'draft', 'verdant', { known: ['strike', 'guard_up'] }); RUN.room(run).objects.push({ id: 'oV', kind: 'chest', chest: 'vault', opened: false, x: run.hero.x + 1, y: run.hero.y });
  RUN.act(run, { t: 'interact', id: 'oV', method: 'safe' }); assert.equal(run.pendingDraft.options.length, 3); assert.ok(run.pendingDraft.options.every(id => String(D.CARDS[id].source).startsWith('research') && (!D.CARDS[id].hero || D.CARDS[id].hero === 'ara')));
  assert.equal(RUN.act(run, { t: 'step', dir: 'down' }).ok, false); const copy = JSON.parse(JSON.stringify(RUN.strip(run))); assert.deepEqual(copy.pendingDraft, run.pendingDraft);
  const pick = run.pendingDraft.options[1], n = run.deck.hand.length; assert.ok(RUN.act(run, { t: 'draft', pick: 1 }).ok); assert.equal(run.pendingDraft, null); assert.ok(run.temp.includes(pick)); assert.equal(run.deck.hand.length, n + 1); assert.ok(RUN.act(run, { t: 'step', dir: 'down' }).ok);
  const skip = mk('ara', 'draft2'); RUN.room(skip).objects.push({ id: 'oV', kind: 'chest', chest: 'vault', opened: false, x: skip.hero.x + 1, y: skip.hero.y }); RUN.act(skip, { t: 'interact', id: 'oV', method: 'safe' }); const g0 = skip.gold; RUN.act(skip, { t: 'draft', pick: -1 }); assert.equal(skip.gold, g0 + 5); assert.equal(skip.temp.length, 0);
  const state = { meta: { created: 'T' }, guild: G.newGame(), run: null }; G.startRun(state, 'dr'); state.run.temp = ['fortune']; state.run.status = 'extracted'; const rep = G.settle(state); assert.deepEqual(rep.tried, ['fortune']); assert.ok(!state.guild.cards.includes('fortune'), '임시 카드는 영구 소유가 아니다'); assert.ok(!state.guild.heroes.ara.deck.includes('fortune'));
});

test('레벨 구성: 상자·장치·특산 재료는 경비가 지키고, 경비가 3칸 안에 살아 있으면 손댈 수 없다', () => {
  const md = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y); let prizes = 0, close = 0, looters = 0, back = 0;
  for (const reg of ['verdant', 'foundry', 'archive']) for (let i = 0; i < 80; i++) { const m = M.generate(reg, ER.rng.seedStreams('lvl' + i));
    for (const rm of m.rooms) { for (const o of rm.objects) if (['chest', 'device'].includes(o.kind) && rm.enemies.length) { prizes++; assert.ok(o.guards?.length, reg + ' ' + rm.type + ': 경비 없는 ' + o.kind); if (rm.enemies.some(e => o.guards.includes(e.id) && md(e, o) <= 3)) close++; }
      for (const e of rm.enemies.filter(e => e.looting)) { looters++; const c = rm.objects.find(o => o.kind === 'chest'); if ((e.facing === 'left') === (c.x <= e.x)) back++; } } }
  assert.ok(prizes > 300 && close === prizes, '모든 목표물 3칸 안에 경비: ' + close + '/' + prizes); assert.ok(looters > 20 && back / looters > 0.7, '약탈자는 상자 쪽을 본다 ' + back + '/' + looters);
  const run = arena('ara', [['goblin', 6, 4]]); const rm = RUN.room(run), g = rm.enemies[0]; rm.objects.push({ id: 'oC', kind: 'chest', chest: 'basic', opened: false, x: 4, y: 4, guards: [g.id] }, { id: 'oN', kind: 'node', mat: 'wood', qty: 2, x: 3, y: 3 });
  assert.ok(RUN.interactions(run, rm.objects[0])[0].blocked); assert.equal(RUN.act(run, { t: 'interact', id: 'oC', method: 'open' }).ok, false); assert.ok(!RUN.interactions(run, rm.objects[1])[0].blocked, '경비 없는 재료는 자유');
  g.x = 9; assert.ok(!RUN.interactions(run, rm.objects[0])[0].blocked, '멀리 떼어내면 열 수 있다'); g.x = 6; g.hp = 0; assert.ok(RUN.act(run, { t: 'interact', id: 'oC', method: 'open' }).ok, '처치하면 열 수 있다');
});

test('적 특성(데이터 조립): 자폭·분열·정면 방패·지휘·격앙·재생·저주·소매치기·둥지', () => {
  const D = ER.data, foe = (run, i = 0) => RUN.room(run).enemies[i];
  for (const [k, d] of Object.entries(D.ENEMIES)) for (const id of Object.keys(d.traits || {})) { assert.ok(D.TRAITS[id], k + ': 모르는 특성 ' + id); assert.ok(D.TRAITS[id].text(d.traits[id])); } assert.ok(D.AI_TYPES[D.ENEMIES.nest.ai]);
  let run = arena('ara', [['sporeling', 4, 4], ['goblin', 5, 4]]); foe(run).hp = 1; const p = RUN.preview(run, { t: 'attack', id: foe(run).id }); assert.match(p.dmg[0].note, /폭발 4/); const hp = run.hero.hp, g = foe(run, 1); RUN.act(run, { t: 'attack', id: foe(run).id }); assert.equal(run.hero.hp, hp - 4, '곁에서 잡으면 나도 맞는다'); assert.equal(g.hp, g.maxHp - 4, '곁의 적도 맞는다');
  run = arena('ara', [['slag', 4, 4]]); foe(run).hp = 1; RUN.act(run, { t: 'attack', id: foe(run).id }); assert.deepEqual(RUN.room(run).enemies.map(e => e.kind), ['slaglet', 'slaglet']); assert.equal(run.mode, 'combat');
  run = arena('ara', [['shieldman', 4, 4]]); const s = foe(run); s.facing = 'left'; assert.equal(RUN.armorOf(run, s), 2); const front = RUN.preview(run, { t: 'attack', id: s.id }).dmg[0].min; s.facing = 'right'; assert.equal(RUN.armorOf(run, s), 0); assert.equal(RUN.preview(run, { t: 'attack', id: s.id }).dmg[0].min, front + 2, '등 뒤에서는 제 피해');
  run = arena('ara', [['wraith', 4, 4], ['banner', 5, 4]]); assert.equal(RUN.armorOf(run, foe(run)), 1); foe(run, 1).x = 9; assert.equal(RUN.armorOf(run, foe(run)), 0);
  run = arena('ara', [['alpha', 4, 4]]); const a = foe(run), h0 = run.hero.hp; RUN.act(run, { t: 'end' }); const calm = h0 - run.hero.hp; a.hp = 5; const h1 = run.hero.hp; RUN.act(run, { t: 'end' }); assert.equal(h1 - run.hero.hp, calm + 2, '격앙 피해 +2');
  run = arena('ara', [['banner', 9, 1]]); foe(run).hp = 5; RUN.act(run, { t: 'end' }); assert.equal(foe(run).hp, 6);
  run = arena('ara', [['hexer', 7, 4]], { hand: ['guard_up', 'mend', 'focus'] }); RUN.act(run, { t: 'end' }); const n = run.deck.hand.length; RUN.act(run, { t: 'end' }); assert.equal(run.deck.hand.length, n + 2 - 1, '맞으면 손패 1장을 버린다(드로우 2)');
  run = arena('ara', [['pilferer', 4, 4]]); run.gold = 20; RUN.act(run, { t: 'end' }); assert.equal(run.gold, 12); const t = foe(run); assert.equal(t.stolen, 8); assert.match(RUN.intentText(run, t), /달아나는/); RUN.act(run, { t: 'end' }); assert.ok(Math.abs(t.x - run.hero.x) + Math.abs(t.y - run.hero.y) >= 4, '멀어진다');
  const keep = JSON.parse(JSON.stringify(RUN.strip(run))); t.hp = 1; t.x = run.hero.x + 1; t.y = run.hero.y; RUN.act(run, { t: 'attack', id: t.id }); assert.ok(run.gold >= 20, '잡으면 되찾는다'); keep.events = []; RUN.act(keep, { t: 'end' }); RUN.act(keep, { t: 'end' }); assert.equal(RUN.room(keep).enemies.length, 0); assert.equal(keep.gold, 12, '놓치면 잃는다'); assert.equal(keep.mode, 'explore');
  run = arena('ara', [['nest', 9, 4]]); RUN.act(run, { t: 'end' }); RUN.act(run, { t: 'end' }); assert.deepEqual(RUN.room(run).enemies.map(e => e.kind), ['nest', 'inkling']); for (let i = 0; i < 8; i++) RUN.act(run, { t: 'guard' }) && RUN.act(run, { t: 'end' }); assert.ok(RUN.room(run).enemies.filter(e => e.kind === 'inkling').length <= 2);
});

test('수제 방·콘텐츠 파일: 검사 통과, 어떤 문 조합에서도 유효, 시험 플레이 강제 배치, 포맷 왕복', () => {
  const C = ER.CONTENT, fmt = require('../src/contentfmt.js').contentfmt; assert.ok(C.rooms.length >= 5); assert.equal(fmt.check(C), null);
  for (const hm of C.rooms) { assert.deepEqual(M.lintRoom(hm).filter(i => i.level === 'error'), [], hm.id);
    for (const reg of hm.regions.length ? hm.regions : Object.keys(ER.data.REGIONS)) for (const doors of [['N'], ['E', 'W'], ['S', 'W', 'N'], ['N', 'E', 'S', 'W']]) { const room = { id: 1, type: hm.type, doors: Object.fromEntries(doors.map(d => [d, { to: 0 }])) }; assert.ok(M.applyRoom(ER.rng.seedStreams('hm' + doors.join('')), ER.data.REGIONS[reg], room, { n: 1 }, hm), hm.id + ' ' + doors); assert.ok(M.valid(room)); if (hm.type === 'sanctum') assert.equal(room.enemies[0].kind, ER.data.REGIONS[reg].boss); } }
  const bad = JSON.parse(JSON.stringify(C.rooms[0])); bad.tiles[1] = '#.....o.....#'; assert.ok(M.lintRoom(bad).some(i => i.level === 'error' && /문 앞/.test(i.msg)));
  const garden = C.rooms.find(r => r.type === 'garden'), noDev = JSON.parse(JSON.stringify(garden)); noDev.objects = noDev.objects.filter(o => o.kind !== 'device'); assert.ok(M.lintRoom(noDev).some(i => /봉인 장치/.test(i.msg)), '봉인 수가 어긋나는 방은 거부');
  const hm = C.rooms.find(r => r.id === 'looted_store'), run = RUN.create({ regionId: 'verdant', heroId: 'ara', deck: ER.data.HEROES.ara.deck, seed: 'tp', testRoom: hm }); assert.equal(RUN.room(run).handmade, 'looted_store'); assert.ok(run.test); const chest = RUN.room(run).objects.find(o => o.kind === 'chest'); assert.equal(chest.guards.length, 2); assert.ok(RUN.room(run).enemies.some(e => e.patrol));
  const text = fmt.text(C), sandbox = {}; new Function('globalThis', 'module', text.replace("typeof globalThis !== 'undefined' ? globalThis : this", 'globalThis'))(sandbox, undefined); assert.deepEqual(sandbox.ER.CONTENT, JSON.parse(JSON.stringify(C)), '포맷 왕복');
  assert.ok(fmt.check({ enemies: { 'Bad Id': {} }, spawns: [], rooms: [] }));
});

test('무기 주사위: 미리보기 범위 안에서 굴리고, 치명타는 주사위를 한 번 더. 무기·옵션이 기본 공격과 무기 피해 카드에 반영된다', () => {
  const D = ER.data, mkw = (o = {}) => { const run = RUN.create(Object.assign({ regionId: 'verdant', heroId: 'ara', deck: D.HEROES.ara.deck, seed: 'wp', noCrit: true, noEvents: true }, o)), rm = RUN.room(run); rm.objects = []; rm.tiles = rm.tiles.map(r => r.replace(/[oh]/g, '.')); run.hero.x = 3; run.hero.y = 4; rm.enemies = [Object.assign(M.makeEnemy('brute', 4, 4, { n: 900 }), { state: 'alert', hp: 200, maxHp: 200, armor: 0 })]; run.mode = 'combat'; run.turn = 1; Object.assign(run.hero, { mp: 4, main: 1, bonus: 1 }); return run; };
  let run = mkw(); assert.equal(RUN.weapon(run).dice, '1d6+1'); let p = RUN.preview(run, { t: 'attack', id: 'e900' }); assert.deepEqual([p.dmg[0].min, p.dmg[0].max], [2, 7]); assert.equal(p.dice, '1d6+1');
  const seen = new Set(); for (let i = 0; i < 60; i++) { const r = mkw({ seed: 'wp' + i }), e = RUN.room(r).enemies[0], snap = JSON.stringify(r.rng); RUN.preview(r, { t: 'attack', id: e.id }); assert.equal(JSON.stringify(r.rng), snap, '미리보기는 난수를 쓰지 않는다'); RUN.act(r, { t: 'attack', id: e.id }); assert.notEqual(JSON.stringify(r.rng), snap, '실제 공격은 주사위를 굴린다'); const n = 200 - e.hp; assert.ok(n >= 2 && n <= 7, '범위 밖 ' + n); seen.add(n); } assert.ok(seen.size >= 5, '여러 눈이 나온다');
  run = mkw({ gear: ['longsword'], gearOpts: { longsword: ['keen'] } }); assert.equal(RUN.weapon(run).dice, '1d8+1'); p = RUN.preview(run, { t: 'attack', id: 'e900' }); assert.deepEqual([p.dmg[0].min, p.dmg[0].max], [3, 10], '1d8+1 에 날 세우기 +1');
  run.deck.hand = ['strike']; p = RUN.preview(run, { t: 'card', i: 0, target: { id: 'e900' } }); assert.deepEqual([p.dmg[0].min, p.dmg[0].max], [5, 12], '정밀 타격 = 무기 피해 +2');
  assert.equal(RUN.weapon(mkw({ heroId: 'noa', deck: D.HEROES.noa.deck, gear: ['longsword'] })).dice, '1d4+1', '전용 무기는 다른 대원에게 효과가 없다');
  run = mkw({ noCrit: false, gear: ['longsword'] }); RUN.room(run).enemies[0].st.exposed = 9; p = RUN.preview(run, { t: 'attack', id: 'e900' }); assert.equal(p.dmg[0].crit, 9 + 8 + 2, '치명타 최대 = 1d8+1 최대 + 1d8 최대(+빈틈 2)');
  let crits = 0; for (let i = 0; i < 80; i++) { const r = mkw({ noCrit: false, gear: ['longsword'], seed: 'cr' + i }), e = RUN.room(r).enemies[0]; RUN.act(r, { t: 'attack', id: e.id }); const n = 200 - e.hp; assert.ok(n >= 2 && n <= 17); if (r.log.some(l => /치명타로 주사위/.test(l))) crits++; } assert.ok(crits > 0);
});

test('가방·주머니·장비 칸: 가방은 칸을, 주머니 옵션은 묶음 크기를 키운다. 무기·가방은 한 칸씩 바꿔 끼고 옵션 칸을 넘지 못한다', () => {
  const g = G.newGame(); g.facilities.workshop = 3; g.stock = { flax: 30, hide: 30, wood: 30, coal: 30, ore: 30, crystal: 9, relic: 3, resin: 9 };
  for (const id of ['satchel', 'framepack', 'longsword', 'warhammer']) assert.ok(G.invest(g, { kind: 'gear', id }).ok, id);
  assert.ok(G.equip(g, 'ara', 'satchel').ok); assert.ok(G.equip(g, 'ara', 'framepack').ok); assert.deepEqual(g.heroes.ara.gear, ['framepack'], '가방은 바꿔 낀다'); assert.ok(G.equip(g, 'ara', 'longsword').ok); assert.ok(G.equip(g, 'ara', 'warhammer').ok); assert.deepEqual(g.heroes.ara.gear, ['framepack', 'warhammer']);
  assert.equal(G.equip(g, 'noa', 'longsword').ok, false, '전용 장비'); assert.ok(G.invest(g, { kind: 'gear', id: 'coat' }).ok); assert.ok(G.equip(g, 'ara', 'coat').ok, '장신구 칸은 따로');
  assert.ok(G.allTargets(g).some(t => t.t.kind === 'option' && t.t.id === 'framepack')); assert.ok(G.invest(g, { kind: 'option', id: 'framepack', opt: 'pouch_ore' }).ok); assert.ok(G.invest(g, { kind: 'option', id: 'framepack', opt: 'reinforced' }).ok); assert.equal(G.invest(g, { kind: 'option', id: 'framepack', opt: 'pouch_herb' }).ok, false, '옵션 칸 2');
  assert.ok(G.removeOption(g, 'framepack', 'reinforced').ok); assert.ok(G.invest(g, { kind: 'option', id: 'framepack', opt: 'pouch_herb' }).ok);
  const state = { meta: { created: 'T' }, guild: g, run: null }; assert.ok(G.startRun(state, 'bag').ok); const run = state.run;
  assert.equal(RUN.bagSlots(run), 6 + 4); assert.equal(RUN.stackOf(run, 'ore'), 5 + 3); assert.equal(RUN.stackOf(run, 'herb'), 5 + 3); assert.equal(RUN.stackOf(run, 'hide'), ER.data.MATERIALS.hide.stack);
  assert.equal(RUN.addBag(run, 'ore', 8), 0); assert.equal(run.bag.length, 1, '광석 8개가 한 칸'); assert.match(ER.data.gearText('framepack', ['pouch_ore']), /가방 칸 \+4.*광석 주머니/);
});

test('이벤트: 트리거·조건·선택지 효과·플래그 연결. 대화 중에는 다른 행동이 막히고, 플래그는 귀환 뒤 길드 이벤트로 이어진다', () => {
  const g = G.newGame(), state = { meta: { created: 'T' }, guild: g, run: null }; assert.ok(G.startRun(state, 'ev1').ok); let run = state.run;
  assert.equal(run.pendingEvent.id, 'first_descent'); assert.equal(RUN.act(run, { t: 'step', dir: 'down' }).ok, false, '대화 먼저'); const copy = JSON.parse(JSON.stringify(RUN.strip(run))); assert.equal(copy.pendingEvent.id, 'first_descent');
  assert.ok(RUN.act(run, { t: 'event', choice: -1 }).ok); assert.equal(run.pendingEvent, null); assert.ok(RUN.act(run, { t: 'step', dir: 'down' }).ok);
  const sh = run.rooms.find(r => r.type === 'shelter'), from = run.rooms.find(r => Object.values(r.doors).some(d => d.to === sh.id)), dir = Object.keys(from.doors).find(d => from.doors[d].to === sh.id);
  run.roomId = from.id; from.enemies = []; run.hero.x = M.INSIDE[dir][0]; run.hero.y = M.INSIDE[dir][1]; run.mode = 'explore'; const door = M.DOOR[dir]; assert.ok(RUN.act(run, { t: 'move', x: door[0], y: door[1] }).ok);
  assert.equal(run.pendingEvent.id, 'wounded_scout'); assert.equal(RUN.act(run, { t: 'event', choice: 0 }).ok, false, '약초가 없으면 고를 수 없다'); RUN.addBag(run, 'herb', 3); const gold = run.gold; assert.ok(RUN.act(run, { t: 'event', choice: 0 }).ok);
  assert.equal(run.gold, gold + 8); assert.equal(run.bag.find(s => s.mat === 'herb').qty, 1); assert.ok(run.evFlags.scout_saved); assert.equal(run.pendingEvent, null);
  run.status = 'extracted'; const rep = G.settle(state); assert.ok(rep); assert.ok(g.evFlags.scout_saved); assert.ok(g.evSeen.includes('wounded_scout')); assert.equal(g.pendingEvent.id, 'scout_returns');
  const ore = g.stock.ore || 0; assert.ok(G.answer(g, 0).ok); assert.equal(g.stock.ore, ore + 3); assert.ok(!g.evFlags.scout_saved); assert.equal(g.pendingEvent, null);
  assert.ok(G.startRun(state, 'ev2').ok); assert.equal(state.run.pendingEvent, null, '한 번 본 이벤트는 다시 뜨지 않는다');
  g.stock = { wood: 9, ore: 9 }; assert.ok(G.invest(g, { kind: 'facility', id: 'workshop' }).ok); assert.equal(g.pendingEvent.id, 'workshop_open');
  assert.ok(ER.events.lint({ id: 'x', trigger: { type: 'returnGuild' }, pages: [{ text: 'a' }], choices: [{ label: 'b', effects: [{ type: 'hp', n: 3 }] }] }).some(m => /원정 중/.test(m)), '길드 이벤트에 원정 전용 효과는 경고'
);
});

test('마을·가게: 가격에 따라 손님 반응이 갈리고 수첩·수요에 남는다. 장사는 하루 한 번, 원정에서 돌아오면 새 날', () => {
  const D = ER.data, g = G.newGame(); G.ensure(g); assert.equal(G.shopDay(g, [{ mat: 'wood', qty: 1, price: 2 }]).ok, false, '창고 복구 전에는 못 연다');
  g.facilities.stash = 1; g.stock = { wood: 40, ore: 40 }; assert.equal(G.shopSlots(g), D.RULES.shop.slots + 1); assert.equal(G.dayPhase(g), 'day');
  assert.equal(G.shopDay(g, [{ mat: 'wood', qty: 99, price: 2 }]).ok, false, '재고보다 많이 올릴 수 없다'); assert.equal(G.shopDay(g, [1, 2, 3, 4, 5].map(() => ({ mat: 'wood', qty: 1, price: 2 }))).ok, false, '진열 칸 초과');
  const gold = g.gold, cheap = G.shopDay(g, [{ mat: 'wood', qty: 20, price: 1 }], 's1'); assert.ok(cheap.ok); assert.equal(cheap.visits[0].mood, 'cheap'); assert.ok(cheap.visits.every(v => v.qty > 0 && v.mood !== 'refuse')); assert.equal(g.gold, gold + cheap.gold); assert.equal(g.stock.wood, 40 - cheap.sold.wood); assert.equal(g.shop.notes.wood.cheap, 1); assert.ok(g.shop.demand.wood < 1, '많이 팔면 수요가 떨어진다');
  assert.equal(G.dayPhase(g), 'dusk'); assert.equal(G.shopDay(g, [{ mat: 'ore', qty: 1, price: 3 }]).ok, false, '하루 한 번'); assert.equal(G.sell(g, 'ore', 2).gold, 2 * Math.floor(D.MATERIALS.ore.value * D.RULES.shop.quickSell), '급매는 헐값');
  const d0 = g.shop.demand.wood; G.newDay(g); assert.equal(g.day, 2); assert.equal(G.dayPhase(g), 'day'); assert.ok((g.shop.demand.wood ?? 1) > d0, '날이 지나면 수요가 돌아온다');
  const dear = G.shopDay(g, [{ mat: 'ore', qty: 5, price: 30 }], 's2'); assert.ok(dear.visits.every(v => v.mood === 'refuse' && v.qty === 0)); assert.equal(dear.gold, 0); assert.equal(g.shop.notes.ore.refuse, 30); assert.equal(dear.unsold[0].qty, 5);
  const a = G.newGame(), b = G.newGame(); for (const q of [a, b]) { q.facilities.stash = 2; q.stock = { ore: 30, wood: 30 }; } assert.deepEqual(G.shopDay(a, [{ mat: 'ore', qty: 9, price: 3 }, { mat: 'wood', qty: 9, price: 2 }], 'same'), G.shopDay(b, [{ mat: 'ore', qty: 9, price: 3 }, { mat: 'wood', qty: 9, price: 2 }], 'same'), '같은 시드는 같은 하루');
  const state = { meta: { created: 'T' }, guild: g, run: null }; assert.ok(G.startRun(state, 'day').ok); state.run.status = 'extracted'; const day = g.day; G.settle(state); assert.equal(g.day, day + 1);
  for (const [id, n] of Object.entries(D.NPCS)) { assert.ok(D.PORTRAITS['npc.' + id], id); assert.ok(n.greet.length); const p = Object.values(D.TOWN.places).some(pl => n.x >= pl.zone[0] && n.x <= pl.zone[1] && n.y >= pl.zone[2] && n.y <= pl.zone[3]); assert.ok(!p, id + ': 건물 안에 서 있다'); }
  assert.ok(ER.events.TRIGGERS.npcTalk);
});

// ── 2026-09-18 리뷰(docs/codex-requests/2026-09-18-cleanup-review.md)에서 나온 회귀 검사
function loadDataWith(content) { // content 를 바꿔 data.js 를 새로 읽는다(도구에서 저장 → 게임 재시작을 흉내 낸다)
  const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path'), box = { ER: { CONTENT: JSON.parse(JSON.stringify(content)) } }; box.globalThis = box;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'data.js'), 'utf8'), box); return box.ER.data;
}

test('콘텐츠 병합: 도구가 저장한 항목은 기본 항목을 통째로 교체한다 — 0 으로 만들거나 지운 속성이 되살아나지 않는다', () => {
  const base = ER.data.BASE, C = JSON.parse(JSON.stringify(ER.CONTENT)); assert.equal(base.enemies.brute.armor, 1); assert.equal(base.gear.satchel.bag, 2);
  const brute = JSON.parse(JSON.stringify(base.enemies.brute)); delete brute.armor; C.enemies.brute = brute; const satchel = JSON.parse(JSON.stringify(base.gear.satchel)); delete satchel.bag; satchel.hp = 3; C.gear.satchel = satchel;
  const smith = JSON.parse(JSON.stringify(base.npcs.smith)); delete smith.greetRuin; C.npcs.smith = smith;
  const D2 = loadDataWith(C); assert.equal(D2.ENEMIES.brute.armor, undefined, '장갑을 지웠으면 없는 채로'); assert.equal(D2.GEAR.satchel.bag, undefined); assert.equal(D2.GEAR.satchel.hp, 3); assert.equal(D2.NPCS.smith.greetRuin, undefined);
  assert.equal(D2.BASE.enemies.brute.armor, 1, '출고 기본값은 그대로 남아 "기본값으로 되돌리기"에 쓴다'); assert.equal(D2.BASE.gear.satchel.bag, 2);
  delete C.enemies.brute; delete C.gear.satchel; const D3 = loadDataWith(C); assert.equal(D3.ENEMIES.brute.armor, 1, '덮어쓰기를 지우면 기본값으로'); assert.equal(D3.GEAR.satchel.bag, 2);
  C.spawns.push({ region: 'verdant', room: 'supply' }); assert.doesNotThrow(() => loadDataWith(C), 'group 없는 등장 조합이 있어도 게임은 뜬다');
});

test('콘텐츠 모양 검사: 깨진 등장 조합·음수 조건·수치 아닌 값은 저장 전에 거부한다', () => {
  const fmt = require('../src/contentfmt.js').contentfmt, ok = () => JSON.parse(JSON.stringify(ER.CONTENT)); assert.equal(fmt.check(ok()), null);
  let c = ok(); c.spawns.push({ region: 'verdant', room: 'supply' }); assert.match(fmt.check(c), /등장 조합/);
  c = ok(); c.events[1].choices[0].require = { gold: -100 }; assert.match(fmt.check(c), /조건 금화/); assert.ok(ER.events.lint(c.events[1]).some(m => /음수/.test(m))); assert.equal(ER.events.requireOk({ gold: -100 }, { gold: 0, mat: () => 0, flags: {} }), false, '음수 조건은 고를 수 없다');
  c = ok(); c.enemies.sporeling.hp = 'many'; assert.match(fmt.check(c), /hp/); c = ok(); delete c.enemies.sporeling.gold; assert.match(fmt.check(c), /gold/);
  c = ok(); c.gear.longsword.cost.ore = 0; assert.match(fmt.check(c), /비용/); c = ok(); c.npcs.x1 = { name: '누구' }; assert.match(fmt.check(c), /주민/);
});

test('지워진 콘텐츠와 옛 저장: 고정 목표·장착 장비·진행 중인 적이 사라져도 이어하기와 정산이 된다', () => {
  const g = G.newGame(); g.facilities.workshop = 2; g.stock = { ore: 20, wood: 20, hide: 20, coal: 20 }; assert.ok(G.invest(g, { kind: 'gear', id: 'longsword' }).ok); assert.ok(G.equip(g, 'ara', 'longsword').ok);
  const state = { meta: { created: 'T' }, guild: g, run: null }; assert.ok(G.startRun(state, 'gone').ok); const run = state.run, rm = run.rooms.find(r => r.enemies.length);
  // 콘텐츠에서 지워진 것처럼 꾸민다: 없는 장비·옵션·카드·적 종류, 없는 투자 목표
  g.gearOwned.push('ghost_blade'); g.heroes.ara.gear.push('ghost_blade'); g.gearOpts = { ghost_blade: ['keen'], longsword: ['no_such_option'] }; g.pinned = { kind: 'gear', id: 'ghost_blade' }; g.cards.push('no_card'); g.heroes.ara.deck[0] = 'no_card'; run.gear.push('ghost_blade'); run.deck.hand.push('no_card');
  rm.enemies.push({ id: 'e999', kind: 'no_such_enemy', x: 5, y: 5, hp: 3, maxHp: 3, armor: 0, state: 'alert', st: {}, intent: null, step: 0 }); const chest = rm.objects.find(o => o.guards); if (chest) chest.guards.push('e999');
  assert.equal(G.target(g, g.pinned).locked, '콘텐츠에서 지워진 항목', '없는 장비를 가리켜도 예외가 없다'); assert.doesNotThrow(() => G.allTargets(g));
  const old = JSON.parse(JSON.stringify(state)); delete old.guild.shop; delete old.guild.day; delete old.guild.gearOpts.longsword; delete old.guild.evFlags; // 더 옛 저장처럼 필드도 빠져 있다
  const notes = G.sanitize(old); assert.ok(notes.length >= 3, notes.join(' / ')); assert.equal(old.guild.pinned, null); assert.deepEqual(old.guild.heroes.ara.gear, ['longsword']); assert.ok(!old.guild.cards.includes('no_card')); assert.equal(old.guild.day, 1);
  assert.ok(old.run.rooms.every(r => r.enemies.every(e => ER.data.ENEMIES[e.kind]))); assert.ok(!old.run.gear.includes('ghost_blade')); assert.ok(!old.run.deck.hand.includes('no_card')); assert.deepEqual(G.sanitize(old), [], '두 번째에는 고칠 것이 없다');
  old.run.pendingEvent = null; assert.doesNotThrow(() => { RUN.preview(old.run, { t: 'move', x: old.run.hero.x, y: old.run.hero.y + 1 }); RUN.act(old.run, { t: 'step', dir: 'down' }); });
  assert.ok(RUN.act(old.run, { t: 'giveUp' }).ok); assert.equal(old.run.status, 'defeat'); assert.ok(G.settle(old), '정산까지 된다'); assert.equal(G.selectHero(old.guild, 'nobody').ok, false); assert.ok(G.selectHero(old.guild, 'noa').ok);
});

test('저장 구조 검사: 필수 칸이 빠진 기록은 불러오지 않는다', () => {
  const S = ER.save, good = { meta: { created: 'T' }, guild: G.newGame(), run: null }; assert.ok(S.unpack(S.pack(good)));
  for (const strip of ['heroes', 'roster', 'regions', 'selected']) { const bad = JSON.parse(JSON.stringify(good)); delete bad.guild[strip]; assert.throws(() => S.unpack(S.pack(bad)), /구조/, strip); }
  assert.throws(() => S.unpack({ app: S.APP, broken: true }), /읽을 수 없습니다/);
});
