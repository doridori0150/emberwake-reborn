'use strict';
/* 자동 검사(규칙·생성·저장). 사람 플레이의 재미를 증명하지 않으며 docs/WORKLOG.md 의 직접 플레이 기록과 구분한다. */
const test = require('node:test'), assert = require('node:assert');
require('../src/guild.js'); require('../src/save.js');
const ER = globalThis.ER, { RUN = ER.run, G = ER.guild } = {}, D = ER.data, M = ER.map;
const { bot } = require('../tools/sim.cjs');
const mk = (hero = 'ara', seed = 't', region = 'verdant', extra = {}) => RUN.create(Object.assign({ regionId: region, heroId: hero, deck: D.HEROES[hero].deck, seed, noCrit: true }, extra));
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
  assert.equal(run.hero.maxHp, 30 + 4); assert.equal(RUN.bagSlots(run), 6 + 1 + 1); assert.equal(run.items.bandage, 1); assert.equal(run.limit, 70 + 8); assert.equal(RUN.card(run, 'strike').dmg, 8);
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
