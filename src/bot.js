/* 대원별 전투 스타일을 아는 전투 봇. 난이도의 방향을 보기 위한 근사치이며 사람의 승률이 아니다.
   - ara : 예고 칸만 피하고 적 곁에 남아 방어·반격으로 받아낸다.
   - noa : 움직여서 때리고(뒤잡기 조건), 남은 이동력으로 적에게서 떨어진다.
   - lumi: 사거리 끝에서 쏘고 거리를 벌린다.
   tools/smart-bot.cjs 와 editor.html(몬스터 작업대)이 함께 쓴다. */
(function (g) {
  'use strict';
  const ER = g.ER = g.ER || {};
  if (typeof require === 'function' && !ER.run) require('./run.js');
  const RUN = ER.run, M = ER.map, D = ER.data;
  const md = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

  function dangerSet(run) { const s = new Set(); for (const e of RUN.alive(RUN.room(run))) (e.intent?.tiles || []).forEach(([x, y]) => s.add(x + ',' + y)); return s; }
  function tiles(run) { const h = run.hero; return [[h.x, h.y, 0], ...RUN.reachableTiles(run)]; }
  function bestAttack(run) { // 지금 자리에서 가능한 최고의 주 행동 공격
    let best = null; const foes = RUN.alive(RUN.room(run));
    run.deck.hand.forEach((id, i) => { const c = RUN.card(run, id); if (c.type !== 'attack' || c.slot !== 'main') return; for (const e of foes) { const p = RUN.preview(run, { t: 'card', i, target: c.target === 'self' ? undefined : { id: e.id } }); if (!p.ok) continue; const score = p.dmg.reduce((n, d) => n + d.min + (d.kill ? 4 : 0), 0) + (c.burn || 0) * 1.5 + (c.poison || 0) * 1.5 + (c.root ? 1 : 0); if (!best || score > best.score) best = { a: { t: 'card', i, target: { id: e.id } }, score }; } });
    for (const e of foes) { const p = RUN.preview(run, { t: 'attack', id: e.id }); if (p.ok) { const score = p.dmg[0].min + (p.dmg[0].kill ? 4 : 0); if (!best || score > best.score) best = { a: { t: 'attack', id: e.id }, score }; } }
    return best;
  }
  function playBonus(run, names) { for (const n of names) { const i = run.deck.hand.indexOf(n); if (i >= 0 && run.hero.bonus > 0 && RUN.act(run, { t: 'card', i }).ok) return true; } return false; }

  function turn(run, style) {
    const h = run.hero, rm = () => RUN.room(run), foes = () => RUN.alive(rm()).filter(e => e.state === 'alert');
    if (!foes().length) return;
    // 1) 공격할 수 있는 자리 찾기: 지금 자리 → 가까운 자리 순으로 시험한다(상태를 바꾸지 않도록 미리보기만 쓴다).
    let plan = bestAttack(run);
    if (!plan && h.main > 0) {
      const danger = dangerSet(run), cand = tiles(run).filter(t => t[2] > 0).sort((a, b) => (danger.has(a[0] + ',' + a[1]) - danger.has(b[0] + ',' + b[1])) || a[2] - b[2]);
      const range = style === 'lumi' ? 4 : 1, want = cand.filter(([x, y]) => foes().some(e => { const d = Math.abs(e.x - x) + Math.abs(e.y - y); return d <= range && d >= (style === 'lumi' ? 2 : 1) && RUN.los(rm(), { x, y }, e); }));
      const go = (style === 'lumi' ? want.sort((a, b) => Math.min(...foes().map(e => md(e, { x: b[0], y: b[1] }))) - Math.min(...foes().map(e => md(e, { x: a[0], y: a[1] }))))[0] : want[0]) || cand.sort((a, b) => Math.min(...foes().map(e => md(e, { x: a[0], y: a[1] }))) - Math.min(...foes().map(e => md(e, { x: b[0], y: b[1] }))))[0];
      if (go) RUN.act(run, { t: 'move', x: go[0], y: go[1] });
      if (run.mode !== 'combat' || run.status !== 'active') return;
      plan = bestAttack(run);
    }
    // 아라: 곁의 근접 적이 나를 칠 상황이면 반격 태세가 기본 공격보다 낫다(방어 4 + 반격).
    if (style === 'ara' && plan && h.main > 0) { const i = run.deck.hand.indexOf('riposte'), adj = foes().filter(e => md(e, h) === 1 && !ER.data.ENEMIES[e.kind].range && !e.st.stun); if (i >= 0 && adj.length && plan.score < 6 * adj.length + 2) { playBonus(run, ['guard_up']); RUN.act(run, { t: 'card', i }); plan = null; } }
    if (plan) { playBonus(run, ['focus']); plan = bestAttack(run) || plan; RUN.act(run, plan.a); }
    if (run.mode !== 'combat' || run.status !== 'active') return;
    // 2) 자리 정리
    const danger = dangerSet(run), here = h.x + ',' + h.y, melee = foes().filter(e => !ER.data.ENEMIES[e.kind].range);
    if (style === 'ara') { if (danger.has(here)) { const safe = tiles(run).filter(t => !danger.has(t[0] + ',' + t[1])).sort((a, b) => a[2] - b[2])[0]; if (safe && safe[2] > 0) RUN.act(run, { t: 'move', x: safe[0], y: safe[1] }); } }
    else { if (style === 'noa') playBonus(run, ['dash']); const far = tiles(run).filter(t => !danger.has(t[0] + ',' + t[1])).sort((a, b) => Math.min(...foes().map(e => md(e, { x: b[0], y: b[1] }))) - Math.min(...foes().map(e => md(e, { x: a[0], y: a[1] }))) || a[2] - b[2])[0]; if (far && far[2] > 0) RUN.act(run, { t: 'move', x: far[0], y: far[1] }); }
    if (run.mode !== 'combat' || run.status !== 'active') return;
    // 3) 남은 행동: 위협받는 자리라면 방어
    const threatened = foes().some(e => md(e, h) <= (ER.data.ENEMIES[e.kind].speed || 2) + 1 || e.intent?.type === 'aim');
    if (threatened) { playBonus(run, ['guard_up', 'sidestep']); if (h.main > 0) { const i = ['riposte', 'bulwark'].map(n => run.deck.hand.indexOf(n)).find(x => x >= 0); if (i != null && i >= 0) RUN.act(run, { t: 'card', i }); else RUN.act(run, { t: 'guard' }); } }
    else if (h.hp <= h.maxHp - 5 && h.main > 0) { const i = run.deck.hand.indexOf('mend'); if (i >= 0) RUN.act(run, { t: 'card', i }); }
  }
  function fight(run, style, maxTurns = 40) { let n = 0; while (run.status === 'active' && run.mode === 'combat' && n++ < maxTurns) { turn(run, style); if (run.status === 'active' && run.mode === 'combat') RUN.act(run, { t: 'end' }); } return n; }

  function arena(hero, foes, seed, region = 'verdant', extra = {}) {
    const run = RUN.create(Object.assign({ regionId: region, heroId: hero, deck: D.HEROES[hero].deck, seed, noEvents: true }, extra)), rm = RUN.room(run);
    rm.objects = []; run.hero.x = 2; run.hero.y = 4; rm.tiles = rm.tiles.map(r => r.replace(/D/g, '#'));
    rm.enemies = foes.map(([k, x, y], i) => Object.assign(M.makeEnemy(k, x, y, { n: 900 + i }), { state: 'alert' }));
    run.mode = 'combat'; run.turn = 1; Object.assign(run.hero, { mp: RUN.moveMax(run), main: 1, bonus: 1 }); return run;
  }

  const GROWN = { ara: { perks: ['ara_guard', 'ara_counter'], gear: ['coat', 'strap'] }, noa: { perks: ['noa_feet', 'noa_ambush'], gear: ['coat', 'spikes'] }, lumi: { perks: ['lumi_ember', 'lumi_chain'], gear: ['coat', 'ring'] } };
  // 모의전: foes = [[kind,x,y],...]. 대원별 승률·승리 시 잔여 체력·평균 턴·평균 받은 피해.
  function duel(foes, o = {}) {
    const n = o.n || 100, out = {};
    for (const hero of o.heroes || Object.keys(D.HEROES)) { let win = 0, hp = 0, t = 0, lost = 0;
      for (let i = 0; i < n; i++) { const run = arena(hero, foes, (o.seed || 'duel') + i, o.region || 'verdant', o.grown ? Object.assign({ mods: { hpBonus: 4 } }, GROWN[hero]) : {}); t += fight(run, hero); lost += run.hero.maxHp - run.hero.hp; if (run.status === 'active' && run.mode === 'explore') { win++; hp += run.hero.hp / run.hero.maxHp; } }
      out[hero] = { win: win / n, hpLeft: win ? hp / win : 0, turns: t / n, lost: lost / n }; }
    return out;
  }
  ER.bot = { turn, fight, arena, duel, GROWN };
  if (typeof module === 'object') module.exports = ER;
})(typeof globalThis !== 'undefined' ? globalThis : this);
