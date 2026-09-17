/* 원정 규칙 엔진: 순수 상태 전이. DOM·캔버스·저장소를 모른다.
   턴 구조(채택): 이동력 + 주 행동 1 + 보조 행동 1. 카드는 주/보조 중 하나를 소비한다.
   - 탐사 중에는 이동이 자유롭고, 시간은 방 이동·채집·상자·카드·휴식에만 든다.
   - 전투 중에는 내가 턴을 끝내야 적이 움직인다(실시간 타이머 없음). 한 라운드 = 시간 1.
   - 모든 피해 계산은 calcDamage 하나를 거치므로 미리보기와 실제 결과가 같다.
   - run.events 는 연출용 임시 기록이며 저장하지 않는다. */
(function (g) {
  'use strict';
  const ER = g.ER = g.ER || {};
  if (typeof require === 'function' && !ER.map) require('./mapgen.js');
  const D = ER.data, { RULES, MATERIALS, CARDS, HEROES, ENEMIES, REGIONS, CHESTS, GEAR, ALTAR } = D, R = ER.rng, M = ER.map;
  const W = M.W, H = M.H, N4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const key = (x, y) => x + ',' + y, dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const clone = o => JSON.parse(JSON.stringify(o));

  // ───────── 생성
  function create(o) {
    const region = REGIONS[o.regionId], heroDef = HEROES[o.heroId]; if (!region || !heroDef) throw new Error('원정 설정 오류');
    const mods = Object.assign({ bagSlots: 0, bandages: 0, hpBonus: 0, limitBonus: 0, mapIntel: false, knowSanctum: false, saveFirstSlot: false }, o.mods);
    const gear = (o.gear || []).filter(id => GEAR[id]), perks = o.perks || [];
    const sum = f => gear.reduce((n, id) => n + (GEAR[id][f] || 0), 0);
    const rs = R.seedStreams(String(o.seed));
    const map = M.generate(o.regionId, rs, { knowSanctum: mods.knowSanctum });
    const maxHp = heroDef.hp + sum('hp') + mods.hpBonus + (perks.includes('ara_iron') ? 6 : 0);
    const run = {
      v: 1, id: 'run-' + o.seed, seed: String(o.seed), regionId: o.regionId, heroId: o.heroId, rng: rs, status: 'active', mode: 'explore', turn: 0,
      rooms: map.rooms, nextId: map.nextId, devicesNeed: map.devices, devicesOn: 0, roomId: 0,
      hero: { x: 6, y: 5, facing: 'down', hp: maxHp, maxHp, block: 0, mp: 0, main: 1, bonus: 1, moved: 0, focus: 0, focusBonus: 0, retaliate: 0, thorns: 0, harvest: 0, rollMode: null, checkBonus: 0, statusUsed: false, smoke: false, burn: 0, gauge: 0 },
      noCrit: !!o.noCrit,
      gear, perks, upgrades: o.upgrades || {}, mods, items: { bandage: mods.bandages, flare: sum('flare') },
      deck: { draw: [], hand: [], discard: [], exhaust: [] }, bag: [], gold: 0,
      time: 0, limit: region.limit + mods.limitBonus, phase: 0, pursuers: [], stalker: { state: 'none', at: 0 },
      flags: { bossDead: false, objective: false, firstCombat: true }, stats: { kills: 0, rounds: 0, rolls: [] }, explSteps: 0,
      pinned: o.pinned || null, known: o.known || null, temp: [], pendingDraft: null, log: [], events: []
    };
    run.deck.draw = R.shuffle(rs, 'draw', o.deck.slice());
    drawCards(run, RULES.startHand);
    run.rooms[0].visited = true; enterRoomEffects(run, run.rooms[0], true);
    reveal(run); say(run, region.name + '에 들어섰다. 붉은달까지 ' + run.limit + '.');
    return run;
  }

  // ───────── 조회 도우미
  const room = run => run.rooms[run.roomId];
  const heroDef = run => HEROES[run.heroId];
  const gearSum = (run, f) => run.gear.reduce((n, id) => n + (GEAR[id][f] || 0), 0);
  const hasPerk = (run, id) => run.perks.includes(id);
  const phaseDef = run => RULES.phases[run.phase];
  const edef = e => ENEMIES[e.kind];
  const alive = rm => rm.enemies.filter(e => e.hp > 0);
  const alertIn = rm => alive(rm).filter(e => e.state === 'alert');
  const enemyAt = (rm, x, y) => alive(rm).find(e => e.x === x && e.y === y);
  const objAt = (rm, x, y) => rm.objects.find(o => o.x === x && o.y === y);
  const tile = (rm, x, y) => rm.tiles[y]?.[x] || '#';
  const solid = t => t === '#' || t === 'o';
  const bagSlots = run => RULES.bagSlots + run.mods.bagSlots + gearSum(run, 'bag');
  const moveMax = run => heroDef(run).move + (hasPerk(run, 'noa_feet') ? 1 : 0);
  const hazard = run => REGIONS[run.regionId].hazard;
  const slamBonus = run => gearSum(run, 'slam') + (hasPerk(run, 'noa_slam') ? 2 : 0);
  function vision(run) { const base = RULES.phases[0].vision, cur = phaseDef(run).vision; return (gearSum(run, 'vision') ? base : cur) + gearSum(run, 'vision'); }
  function card(run, id) { const c = CARDS[id], up = run.upgrades[id]; if (!up || !c.upgrades) return c; const u = c.upgrades.find(x => x.id === up); return u ? Object.assign({}, c, u.patch, { name: c.name + '+', text: c.text + ' [강화: ' + u.text + ']' }) : c; }
  function say(run, msg) { run.log.push(msg); if (run.log.length > 80) run.log.shift(); }
  const ev = (run, e) => run.events.push(e);

  function los(rm, a, b) { // 벽·기둥만 시야를 막는다.
    let x0 = a.x, y0 = a.y; const x1 = b.x, y1 = b.y, dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let err = dx - dy;
    while (x0 !== x1 || y0 !== y1) { const e2 = 2 * err; if (e2 > -dy) { err -= dy; x0 += sx; } if (e2 < dx) { err += dx; y0 += sy; } if ((x0 !== x1 || y0 !== y1) && solid(tile(rm, x0, y0))) return false; }
    return true;
  }
  function reveal(run) { const rm = room(run), h = run.hero, v = vision(run); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!rm.seen[y * W + x] && Math.max(Math.abs(x - h.x), Math.abs(y - h.y)) <= v) rm.seen[y * W + x] = 1; for (const e of alertIn(rm)) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (e.x + dx >= 0 && e.y + dy >= 0 && e.x + dx < W && e.y + dy < H) rm.seen[(e.y + dy) * W + e.x + dx] = 1; } // 지형 기억은 시야 반경만, 적은 visible()의 실제 시선으로 본다
  function visible(run, x, y) { const h = run.hero; return Math.max(Math.abs(x - h.x), Math.abs(y - h.y)) <= vision(run) && los(room(run), h, { x, y }); }
  function walkable(run, x, y, forEnemy) { const rm = room(run), t = tile(rm, x, y); if (solid(t) || (forEnemy && t === 'D')) return false; const o = objAt(rm, x, y); if (o && M.blocks(o)) return false; if (enemyAt(rm, x, y)) return false; if (forEnemy && run.hero.x === x && run.hero.y === y) return false; return true; }
  const adjacentAlert = (run, x, y) => alertIn(room(run)).filter(e => !e.st.stun && Math.abs(e.x - x) + Math.abs(e.y - y) === 1);

  // 영웅 이동 비용: 기본 1, 깊은 물 +1, 적 곁에서 벗어나면 +1(이탈).
  function stepCost(run, fx, fy, tx, ty) {
    let c = 1; if (hazard(run).slow && tile(room(run), tx, ty) === 'h') c += 1;
    if (run.mode === 'combat' && adjacentAlert(run, fx, fy).some(e => Math.abs(e.x - tx) + Math.abs(e.y - ty) !== 1)) c += 1;
    return c;
  }
  function heroPaths(run, destKey) { // 다익스트라. 위험 지형은 목적지일 때만 밟는다.
    const h = run.hero, rm = room(run), best = new Map([[key(h.x, h.y), { c: 0, prev: null, x: h.x, y: h.y }]]), open = [key(h.x, h.y)], harm = hazard(run).dmg > 0;
    while (open.length) {
      open.sort((a, b) => best.get(a).c - best.get(b).c); const cur = best.get(open.shift());
      if (tile(rm, cur.x, cur.y) === 'D' && (cur.x !== h.x || cur.y !== h.y)) continue;
      for (const [dx, dy] of N4) {
        const nx = cur.x + dx, ny = cur.y + dy, k = key(nx, ny); if (!walkable(run, nx, ny)) continue;
        if (harm && tile(rm, nx, ny) === 'h' && k !== destKey) continue;
        if (tile(rm, nx, ny) === 'D' && doorInfo(run, nx, ny)?.sealed) continue;
        const c = cur.c + stepCost(run, cur.x, cur.y, nx, ny), old = best.get(k);
        if (!old || c < old.c) { best.set(k, { c, prev: key(cur.x, cur.y), x: nx, y: ny }); if (!open.includes(k)) open.push(k); }
      }
    }
    return best;
  }
  function pathTo(run, x, y) { const best = heroPaths(run, key(x, y)), end = best.get(key(x, y)); if (!end || (x === run.hero.x && y === run.hero.y)) return null; const path = []; let n = end; while (n.prev) { path.unshift([n.x, n.y]); n = best.get(n.prev); } return { path, cost: end.c }; }
  function reachableTiles(run) { if (run.mode !== 'combat') return []; const out = []; for (const n of heroPaths(run, null).values()) if (n.c > 0 && n.c <= run.hero.mp) out.push([n.x, n.y, n.c]); return out; }
  function doorInfo(run, x, y) { const rm = room(run); for (const [d, p] of Object.entries(M.DOOR)) if (p[0] === x && p[1] === y && rm.doors[d]) { const door = rm.doors[d]; return { dir: d, to: door.to, sealed: !!door.sealed && run.devicesOn < run.devicesNeed, target: run.rooms[door.to] }; } return null; }

  // ───────── 덱
  function drawCards(run, n) {
    let drawn = 0;
    for (let i = 0; i < n; i++) {
      if (run.deck.hand.length >= RULES.handMax) break;
      if (!run.deck.draw.length) { if (!run.deck.discard.length) break; run.deck.draw = R.shuffle(run.rng, 'draw', run.deck.discard); run.deck.discard = []; say(run, '버린 카드를 다시 섞었다. 시간 +' + RULES.time.reshuffle + '.'); advance(run, RULES.time.reshuffle); }
      run.deck.hand.push(run.deck.draw.pop()); drawn++;
    }
    return drawn;
  }

  // ───────── 시간과 붉은달
  function advance(run, n) {
    if (!n || run.status !== 'active') return;
    run.time += n; const ratio = run.time / run.limit; let p = 0; RULES.phases.forEach((ph, i) => { if (ratio >= ph.from) p = i; });
    if (p > run.phase) { run.phase = p; const ph = RULES.phases[p]; say(run, '【' + ph.name + '】 ' + ph.text); ev(run, { t: 'phase', name: ph.name, text: ph.text }); if (ph.id === 'red') moonshards(run, room(run)); if (ph.id === 'hunt' && run.stalker.state === 'none') run.stalker = { state: 'coming', at: run.time + 2 }; }
    if (run.stalker.state === 'dead' && run.time >= run.stalker.at) run.stalker = { state: 'coming', at: run.time + 2 };
    if (run.stalker.state === 'coming' && run.time >= run.stalker.at && run.mode === 'explore') spawnStalker(run);
  }
  function spawnStalker(run) {
    const rm = room(run), dirs = Object.keys(rm.doors).sort((a, b) => dist({ x: M.INSIDE[b][0], y: M.INSIDE[b][1] }, run.hero) - dist({ x: M.INSIDE[a][0], y: M.INSIDE[a][1] }, run.hero));
    const spot = freeNear(run, M.INSIDE[dirs[0]][0], M.INSIDE[dirs[0]][1]); if (!spot) return;
    const e = M.makeEnemy('stalker', spot[0], spot[1], { n: run.nextId++ }); run.nextId++; e.state = 'alert'; rm.enemies.push(e); run.stalker = { state: 'here', at: 0 };
    ev(run, { t: 'spawn', id: e.id }); say(run, '붉은달 추적자가 문을 부수고 들어왔다!'); startCombat(run, false);
  }
  function moonshards(run, rm) { if (rm.shard || rm.type === 'entry') return; rm.shard = true; const p = randomFree(run, rm); if (p) rm.objects.push({ id: 'o' + (run.nextId++), kind: 'node', mat: 'moonshard', qty: 1, x: p[0], y: p[1] }); }
  function randomFree(run, rm) { for (let i = 0; i < 60; i++) { const x = 1 + R.int(run.rng, 'map', W - 2), y = 1 + R.int(run.rng, 'map', H - 2); if (tile(rm, x, y) === '.' && !objAt(rm, x, y) && !enemyAt(rm, x, y) && !(rm === room(run) && run.hero.x === x && run.hero.y === y) && !(Math.abs(x - 6) < 2 && (y < 3 || y > 5)) && !(Math.abs(y - 4) < 2 && (x < 3 || x > 9))) return [x, y]; } return null; }
  function freeNear(run, x, y) { const seen = new Set([key(x, y)]), q = [[x, y]]; while (q.length) { const [cx, cy] = q.shift(); if (walkable(run, cx, cy, true) && tile(room(run), cx, cy) !== 'h') return [cx, cy]; for (const [dx, dy] of N4) { const k = key(cx + dx, cy + dy); if (!seen.has(k) && !solid(tile(room(run), cx + dx, cy + dy)) && tile(room(run), cx + dx, cy + dy) !== 'D') { seen.add(k); q.push([cx + dx, cy + dy]); } } } return null; }

  // ───────── 가방
  function addBag(run, mat, qty) {
    const stack = MATERIALS[mat].stack;
    for (const s of run.bag) if (s.mat === mat && s.qty < stack && qty > 0) { const n = Math.min(stack - s.qty, qty); s.qty += n; qty -= n; }
    while (qty > 0 && run.bag.length < bagSlots(run)) { const n = Math.min(stack, qty); run.bag.push({ mat, qty: n }); qty -= n; }
    return qty; // 남은 수량(가방에 못 넣은 것)
  }
  function bagRoom(run, mat) { const stack = MATERIALS[mat].stack; return run.bag.filter(s => s.mat === mat).reduce((n, s) => n + stack - s.qty, 0) + (bagSlots(run) - run.bag.length) * stack; }
  function dropPile(run, x, y, mat, qty) { const rm = room(run); let p = rm.objects.find(o => o.kind === 'pile' && o.x === x && o.y === y); if (!p) { p = { id: 'o' + (run.nextId++), kind: 'pile', x, y, items: [] }; rm.objects.push(p); } const it = p.items.find(i => i.mat === mat); if (it) it.qty += qty; else p.items.push({ mat, qty }); }

  // ───────── 투지와 치명타
  function gainGauge(run, n, why) { const h = run.hero, before = h.gauge || 0; if (run.mode !== 'combat') return; h.gauge = Math.min(RULES.gauge.max, before + n); if (h.gauge > before) ev(run, { t: 'gauge', n: h.gauge - before, why }); }
  function critChance(run, e) { if (run.noCrit) return 0; let c = RULES.crit.base; if (e.st.exposed) c += RULES.crit.exposed; if (run.heroId === 'noa' && run.hero.moved >= 3) c += RULES.crit.noaMoved; return c; }
  const critDamage = n => n + Math.ceil(n / 2);
  function rollCrit(run, e) { const c = critChance(run, e); if (!c) return false; const hit = R.next(run.rng, 'dice') * 100 < c; if (hit) { ev(run, { t: 'crit', x: e.x, y: e.y }); say(run, '치명타!'); gainGauge(run, 1, 'crit'); } return hit; }

  // ───────── 피해
  function hasStatus(e) { return (e.st.burn || 0) + (e.st.poison || 0) + (e.st.root || 0) + (e.st.stun || 0) > 0; }
  // o: {direct, pierce, ambush, noFocus}. 미리보기와 실제 적용이 공유한다.
  function calcDamage(run, e, base, o = {}) {
    if (base <= 0) return 0; let n = base; const d = edef(e);
    if (o.direct) {
      if (!o.noFocus && run.hero.focus) n += run.hero.focus + run.hero.focusBonus;
      if (run.heroId === 'lumi' && hasStatus(e)) n += hasPerk(run, 'lumi_chain') ? 2 : 1;
      if (o.ambush) n += RULES.ambushBonus + (hasPerk(run, 'noa_ambush') ? 3 : 0);
      if (e.st.exposed && gearSum(run, 'exposedBonus')) n += gearSum(run, 'exposedBonus');
    }
    if (!o.pierce) n -= e.armor; n = Math.max(1, n);
    if (d.cap) n = Math.min(n, d.cap);
    if (e.st.exposed) n += 2;
    return n;
  }
  function hurtEnemy(run, e, n, kind) {
    if (e.hp <= 0 || n <= 0) return; e.hp -= n; ev(run, { t: 'dmg', id: e.id, x: e.x, y: e.y, n, kind: kind || 'hit' });
    if (e.state !== 'alert') { e.state = 'alert'; ev(run, { t: 'alert', id: e.id }); }
    if (e.hp <= 0) killEnemy(run, e);
  }
  function killEnemy(run, e) {
    const d = edef(e), rm = room(run); e.hp = 0; e.intent = null; run.stats.kills++; ev(run, { t: 'die', id: e.id }); gainGauge(run, 1, 'kill');
    const gold = d.gold[0] + R.int(run.rng, 'loot', d.gold[1] - d.gold[0] + 1); if (gold) { run.gold += gold; ev(run, { t: 'loot', x: e.x, y: e.y, text: '+' + gold + ' 금화' }); }
    for (const [mat, p] of d.loot) if (R.next(run.rng, 'loot') < p) { const left = addBag(run, mat, 1); if (left) { dropPile(run, e.x, e.y, mat, left); say(run, '가방이 가득 차 ' + MATERIALS[mat].name + '을(를) 바닥에 두었다.'); } else ev(run, { t: 'loot', x: e.x, y: e.y, text: '+1 ' + MATERIALS[mat].name }); }
    say(run, d.name + ' 처치.');
    if (d.stalker) { run.stalker = { state: 'dead', at: run.time + 15 }; say(run, '추적자가 흩어졌다. 하지만 붉은달은 다시 그것을 빚어낼 것이다.'); }
    else if (d.boss) { run.flags.bossDead = true; rm.objects.push({ id: 'o' + (run.nextId++), kind: 'objective', x: e.x, y: e.y }); say(run, REGIONS[run.regionId].objective.name + '이(가) 드러났다. 회수하고 귀환문으로 돌아가자.'); }
    rm.enemies = rm.enemies.filter(x => x !== e);
  }
  function hurtHero(run, n, src) { // src: {melee, enemy}
    const h = run.hero; if (run.heroId === 'noa' && src?.melee && h.moved >= 3 && !h.dodged) { h.dodged = true; n = Math.max(0, n - 2); ev(run, { t: 'text', x: h.x, y: h.y, text: '회피 -2' }); } let absorbed = Math.min(h.block, n); h.block -= absorbed; const through = n - absorbed;
    if (absorbed) { ev(run, { t: 'dmg', id: 'hero', x: h.x, y: h.y, n: absorbed, kind: 'block' }); if (run.heroId === 'ara' && !h.gaugeBlock) { h.gaugeBlock = true; gainGauge(run, 1, 'block'); } }
    if (through) { h.hp = Math.max(0, h.hp - through); ev(run, { t: 'dmg', id: 'hero', x: h.x, y: h.y, n: through, kind: 'hit' }); }
    if (src?.melee && src.enemy && src.enemy.hp > 0) {
      const bonus = hasPerk(run, 'ara_counter') ? 2 : 0; let back = 0;
      if (h.retaliate) back += h.retaliate + bonus;
      if (h.thorns) back += 2;
      if (run.heroId === 'ara' && absorbed && !through && !h.parried) { back += 2 + bonus; h.parried = true; }
      if (back) { ev(run, { t: 'attack', who: 'hero', tx: src.enemy.x, ty: src.enemy.y, anim: 'attack' }); hurtEnemy(run, src.enemy, calcDamage(run, src.enemy, back, {}), 'counter'); }
    }
    if (h.hp <= 0) { run.status = 'defeat'; say(run, '쓰러졌다. 가방의 전리품을 잃는다.'); ev(run, { t: 'defeat' }); }
    return through;
  }
  function addStatus(run, e, kind, n) {
    if (e.hp <= 0 || !n) return;
    if ((kind === 'burn' || kind === 'poison')) { if (run.heroId === 'lumi' && !run.hero.gaugeStatus) { run.hero.gaugeStatus = true; gainGauge(run, 1, 'status'); } if (kind === 'burn' && hasPerk(run, 'lumi_ember')) n += 1; if (!run.hero.statusUsed && gearSum(run, 'status')) { n += gearSum(run, 'status'); run.hero.statusUsed = true; } }
    if (edef(e).boss && kind === 'stun') { kind = 'exposed'; n = 1; }
    e.st[kind] = (e.st[kind] || 0) + n; ev(run, { t: 'status', id: e.id, kind, n });
    if ((kind === 'root' || kind === 'stun') && !edef(e).boss && e.intent) cancelIntent(run, e);
    if (kind === 'root' && e.intent?.type === 'aim') cancelIntent(run, e);
  }
  function cancelIntent(run, e) { if (e.intent) { e.intent = null; ev(run, { t: 'text', x: e.x, y: e.y, text: '예고 취소' }); } }

  // 밀기/끌기. dir: 단위 벡터. 충돌·지형·덫을 처리한다.
  function shoveEnemy(run, e, dx, dy, steps, isPull) {
    const rm = room(run), d = edef(e); if (d.boss) steps = Math.min(steps, 1); let moved = [];
    for (let i = 0; i < steps && e.hp > 0; i++) {
      const nx = e.x + dx, ny = e.y + dy; if (isPull && nx === run.hero.x && ny === run.hero.y) break;
      const t = tile(rm, nx, ny), other = enemyAt(rm, nx, ny), o = objAt(rm, nx, ny);
      if (solid(t) || t === 'D' || other || (o && M.blocks(o)) || (nx === run.hero.x && ny === run.hero.y)) {
        if (!isPull) { if (moved.length) ev(run, { t: 'move', id: e.id, path: moved }); moved = []; ev(run, { t: 'shake' }); hurtEnemy(run, e, 3 + slamBonus(run), 'slam'); if (other) hurtEnemy(run, other, 2, 'slam'); if (e.hp > 0 && !d.boss && d.ai === 'heavy') { e.armor = 0; addStatus(run, e, 'stun', 1); say(run, d.name + '의 장갑이 벗겨졌다!'); } }
        break;
      }
      e.x = nx; e.y = ny; moved.push([nx, ny]);
      if (t === 'h' && hazard(run).dmg) { ev(run, { t: 'move', id: e.id, path: moved }); moved = []; hurtEnemy(run, e, hazard(run).dmg + slamBonus(run), 'hazard'); }
      if (e.hp > 0 && trapCheck(run, e)) break;
    }
    if (moved.length && e.hp > 0) ev(run, { t: 'move', id: e.id, path: moved });
    if (e.hp > 0 && !d.boss) cancelIntent(run, e);
  }
  // 밀기/끌기 결과 예측(상태를 바꾸지 않는다). 미리보기가 충돌·지형·덫 피해까지 보여주기 위함.
  function shoveForecast(run, e, dx, dy, steps, isPull, dmgFirst) {
    const rm = room(run), d = edef(e); if (d.boss) steps = Math.min(steps, 1); let x = e.x, y = e.y, extra = 0, hp = e.hp - dmgFirst, note = '';
    for (let i = 0; i < steps && hp > 0; i++) {
      const nx = x + dx, ny = y + dy; if (isPull && nx === run.hero.x && ny === run.hero.y) break;
      const t = tile(rm, nx, ny), other = alive(rm).find(o => o !== e && o.x === nx && o.y === ny), o = objAt(rm, nx, ny);
      if (solid(t) || t === 'D' || other || (o && M.blocks(o)) || (nx === run.hero.x && ny === run.hero.y)) { if (!isPull) { extra += 3 + slamBonus(run); note = '충돌'; } break; }
      x = nx; y = ny; if (t === 'h' && hazard(run).dmg) { extra += hazard(run).dmg + slamBonus(run); hp -= hazard(run).dmg + slamBonus(run); note = hazard(run).name; }
      if (rm.objects.some(q => q.kind === 'trap' && q.x === x && q.y === y)) { extra += 3; note = '덫'; break; }
    }
    return { x, y, extra, note };
  }
  function trapCheck(run, e) { const rm = room(run), t = rm.objects.find(o => o.kind === 'trap' && o.x === e.x && o.y === e.y); if (!t) return false; rm.objects = rm.objects.filter(o => o !== t); hurtEnemy(run, e, 3, 'trap'); addStatus(run, e, 'root', 1); return true; }

  // ───────── 전투 개시/종료
  function startCombat(run, ambush) {
    if (run.mode === 'combat') return; run.mode = 'combat'; run.turn = 1; const h = run.hero;
    h.mp = moveMax(run) + (hasPerk(run, 'ara_van') ? 2 : 0); h.main = 1; h.bonus = 1; h.moved = 0; h.statusUsed = false;
    h.block = gearSum(run, 'startBlock') + (hasPerk(run, 'lumi_ward') ? 4 : 0);
    ev(run, { t: 'combat', ambush }); say(run, ambush ? '기습! 적이 눈치채기 전에 먼저 움직인다.' : '적이 나를 발견했다! 내 턴부터 시작한다.');
  }
  function checkCombatEnd(run) {
    if (run.mode !== 'combat' || run.status !== 'active') return;
    if (alertIn(room(run)).length || run.pursuers.length) return;
    run.mode = 'explore'; const h = run.hero; h.block = 0; h.retaliate = 0; h.thorns = 0; h.focus = 0; h.smoke = false; h.main = 1; h.bonus = 1;
    const need = RULES.startHand - run.deck.hand.length; if (need > 0) drawCards(run, need);
    ev(run, { t: 'combatEnd' }); say(run, '전투 종료. 손패를 ' + RULES.startHand + '장까지 채웠다.');
  }
  function detect(run) { // 영웅이 움직이거나 방에 들어온 뒤 호출
    const rm = room(run); let found = false;
    for (const e of alive(rm)) if (e.state === 'idle' && notices(run, e, run.hero.x, run.hero.y) && los(rm, e, run.hero)) { e.state = 'alert'; found = true; ev(run, { t: 'alert', id: e.id }); }
    if (found) startCombat(run, false); return found;
  }
  // 순찰 중인 적은 제 감지 거리로 본다. 방심한 적은 고요 단계에서는 건드리기 전까지 모르고, 술렁임부터는 2칸 안에서 눈치챈다(수호자는 예외).
  function detectRange(run, e) { const d = edef(e), bonus = run.phase >= 1 ? 1 : 0; return e.patrol || d.boss ? d.detect + bonus : 2 + bonus; }
  // 순찰병·수호자는 사방을 살핀다. 방심한 적은 바라보는 쪽(정면 절반)만 2칸까지 보고, 등 뒤는 술렁임부터 1칸만 느낀다.
  function notices(run, e, x, y) { const d = edef(e), dd = Math.abs(e.x - x) + Math.abs(e.y - y), bonus = run.phase >= 1 ? 1 : 0; if (e.patrol || d.boss) return dd <= d.detect + bonus; const front = e.facing === 'left' ? x <= e.x : x >= e.x; return front ? dd <= 2 + bonus : dd <= bonus; }
  function watchTiles(run, e) { const rm = room(run), out = []; for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if ((x !== e.x || y !== e.y) && !solid(tile(rm, x, y)) && notices(run, e, x, y) && los(rm, e, { x, y })) out.push([x, y]); return out; }
  function patrolTick(run) { // 탐사 중 내 2걸음마다 순찰병 1걸음
    if (++run.explSteps % 6 === 0) for (const e of alive(room(run))) if (e.state === 'idle' && !e.patrol && !edef(e).boss) { e.facing = e.facing === 'left' ? 'right' : 'left'; ev(run, { t: 'face', id: e.id, dir: e.facing }); }
    if (run.explSteps % 2) return;
    for (const e of alive(room(run))) { if (!e.patrol || e.state !== 'idle') continue; const goal = e.patrol[e.patrol.to], dx = Math.sign(goal[0] - e.x), dy = Math.sign(goal[1] - e.y), nx = e.x + dx, ny = e.y + dy; if (e.x === goal[0] && e.y === goal[1]) { e.patrol.to = e.patrol.to === 'a' ? 'b' : 'a'; continue; } if (walkable(run, nx, ny, true) && tile(room(run), nx, ny) === '.') { e.x = nx; e.y = ny; if (dx) e.facing = dx < 0 ? 'left' : 'right'; ev(run, { t: 'move', id: e.id, path: [[nx, ny]] }); } else e.patrol.to = e.patrol.to === 'a' ? 'b' : 'a'; }
  }

  // ───────── 방 이동과 추격
  function enterRoomEffects(run, rm, first) {
    if (first && run.phase >= 1 && !rm.stirred && rm.type !== 'entry' && rm.type !== 'shelter' && rm.type !== 'sanctum') { // 술렁임: 처음 들어가는 방에 적 +1
      rm.stirred = true; const pool = REGIONS[run.regionId].rooms_def[rm.type].enemies.flat().filter(k => !ENEMIES[k].elite && !ENEMIES[k].boss); const p = pool.length && randomFree(run, rm);
      if (p) { const e = M.makeEnemy(pool[R.int(run.rng, 'map', pool.length)], p[0], p[1], { n: run.nextId++ }); run.nextId++; rm.enemies.push(e); }
    }
    if (run.phase >= 2) moonshards(run, rm);
    if (run.mods.mapIntel) for (const d of Object.values(rm.doors)) run.rooms[d.to].known = true;
  }
  function exitInfo(run, dir) { // 문 앞 안내문: 이탈 비용을 미리 알린다.
    const rm = room(run), alerts = alertIn(rm), adj = adjacentAlert(run, M.INSIDE[dir][0], M.INSIDE[dir][1]).filter(e => (edef(e).range || 1) === 1);
    const chasers = alerts.filter(e => !edef(e).boss || edef(e).stalker).filter(e => !e.st.root && !e.st.stun);
    const boss = alerts.find(e => edef(e).boss && !edef(e).stalker);
    return { time: RULES.time.door, freeHits: adj.length, chasers: chasers.length, bossHeal: boss ? 6 : 0 };
  }
  function transition(run, dir) {
    const from = room(run), door = from.doors[dir], info = exitInfo(run, dir), h = run.hero;
    for (const e of adjacentAlert(run, M.INSIDE[dir][0], M.INSIDE[dir][1]).filter(e => (edef(e).range || 1) === 1)) { if (run.status !== 'active') break; ev(run, { t: 'attack', who: e.id, tx: h.x, ty: h.y, anim: 'attack' }); say(run, edef(e).name + '의 기회 공격!'); hurtHero(run, enemyDmg(run, e), { melee: true, enemy: e }); }
    if (run.status !== 'active') return;
    // 이미 쫓아오던 무리는 한 방 더 따라온다. 한계를 넘으면 제자리로 돌아간다.
    const next = [];
    for (const p of run.pursuers) { p.depth++; p.eta += 1; p.door = M.OPP[dir]; if (p.depth > RULES.chaseDepth && !ENEMIES[p.e.kind].stalker) goHome(run, p); else next.push(p); }
    for (const e of alertIn(from)) {
      const d = edef(e); e.intent = null;
      if (d.boss && !d.stalker) { e.healOnReturn = true; continue; }
      if (e.st.root || e.st.stun) continue;
      from.enemies = from.enemies.filter(x => x !== e); next.push({ e, eta: d.range ? 2 : 1, door: M.OPP[dir], depth: 1, home: e.home || { roomId: from.id, x: e.x, y: e.y } });
    }
    run.pursuers = next;
    const to = run.rooms[door.to], first = !to.visited; to.visited = true; to.known = true; run.roomId = to.id;
    const [ix, iy] = M.INSIDE[M.OPP[dir]]; h.x = -1; h.y = -1; const squat = enemyAt(to, ix, iy); if (squat) { const f = freeNear(run, ix + (ix === 1 ? 1 : ix === W - 2 ? -1 : 0), iy + (iy === 1 ? 1 : iy === H - 2 ? -1 : 0)); if (f) { squat.x = f[0]; squat.y = f[1]; } } h.x = ix; h.y = iy; h.facing = { N: 'up', S: 'down', E: 'right', W: 'left' }[dir];
    ev(run, { t: 'room', from: from.id, to: to.id, dir }); say(run, to.name + (first ? '에 처음 들어섰다.' : '(으)로 돌아왔다.') + (info.chasers ? ' 적 ' + info.chasers + '이(가) 뒤쫓는다!' : ''));
    enterRoomEffects(run, to, first); advance(run, RULES.time.door); reveal(run);
    for (const e of alive(to)) if (e.healOnReturn && e.hp < e.maxHp) { e.hp = Math.min(e.maxHp, e.hp + 6); e.healOnReturn = false; say(run, edef(e).name + '이(가) 상처를 추슬렀다(+6).'); }
    if (alertIn(to).length) startCombat(run, false); else detect(run);
    checkCombatEnd(run);
  }
  function goHome(run, p) { const rm = run.rooms[p.home.roomId]; p.e.state = 'idle'; p.e.intent = null; p.e.x = p.home.x; p.e.y = p.home.y; if (rm.enemies.some(o => o.x === p.e.x && o.y === p.e.y)) { const save = run.roomId; run.roomId = rm.id; const f = freeNear(run, p.e.x, p.e.y); run.roomId = save; if (f) { p.e.x = f[0]; p.e.y = f[1]; } } rm.enemies.push(p.e); }
  function arrivePursuers(run) {
    const rm = room(run), keep = [];
    for (const p of run.pursuers) { if (--p.eta > 0) { keep.push(p); continue; } const [ix, iy] = M.INSIDE[p.door], spot = freeNear(run, ix, iy); if (!spot) { p.eta = 1; keep.push(p); continue; } p.e.x = spot[0]; p.e.y = spot[1]; p.e.state = 'alert'; p.e.home = p.home; p.e.chased = p.depth; rm.enemies.push(p.e); ev(run, { t: 'spawn', id: p.e.id }); say(run, edef(p.e).name + '이(가) 문을 넘어 쫓아왔다!'); }
    run.pursuers = keep;
  }

  // ───────── 적 AI
  const enemyDmg = (run, e) => Math.max(1, edef(e).dmg + (run.phase >= 2 ? 1 : 0) - (e.st.poison ? 1 : 0));
  function enemyPath(run, e, goalFn) { // BFS: 위험 지형·유닛·소품 회피. goalFn(x,y) 를 만족하는 가장 가까운 칸까지의 경로.
    const rm = room(run), seen = new Map([[key(e.x, e.y), null]]), q = [[e.x, e.y]]; let bestK = null, bestD = Infinity;
    while (q.length) {
      const [x, y] = q.shift(), k = key(x, y);
      if (goalFn(x, y)) { bestK = k; break; }
      const dd = Math.abs(x - run.hero.x) + Math.abs(y - run.hero.y); if (dd < bestD) { bestD = dd; bestK = k; }
      for (const [dx, dy] of N4) { const nx = x + dx, ny = y + dy, nk = key(nx, ny); if (seen.has(nk) || !walkable(run, nx, ny, true) || (tile(rm, nx, ny) === 'h' && hazard(run).dmg)) continue; seen.set(nk, k); q.push([nx, ny]); }
    }
    const path = []; let k = bestK; while (k && seen.get(k) !== null) { const [x, y] = k.split(',').map(Number); path.unshift([x, y]); k = seen.get(k); } return path;
  }
  function moveEnemy(run, e, path, maxSteps) {
    if (e.st.root) { ev(run, { t: 'text', x: e.x, y: e.y, text: '속박' }); return; } const done = [];
    for (const [x, y] of path.slice(0, maxSteps)) { if (!walkable(run, x, y, true)) break; if (x !== e.x) e.facing = x < e.x ? 'left' : 'right'; e.x = x; e.y = y; done.push([x, y]); if (trapCheck(run, e)) break; }
    if (done.length) ev(run, { t: 'move', id: e.id, path: done });
  }
  function faceHero(run, e) { if (run.hero.x !== e.x) e.facing = run.hero.x < e.x ? 'left' : 'right'; }
  function strike(run, e, budget, ranged, mod) {
    const h = run.hero; faceHero(run, e);
    if (budget.total >= RULES.maxAttacksPerPhase || (ranged && budget.ranged >= RULES.maxRangedPerPhase)) { ev(run, { t: 'text', x: e.x, y: e.y, text: '기회를 엿본다' }); return false; }
    if (ranged && h.smoke) { ev(run, { t: 'text', x: e.x, y: e.y, text: '연막에 막힘' }); return false; }
    budget.total++; if (ranged) budget.ranged++;
    let dmg = Math.max(1, enemyDmg(run, e) + (mod || 0)); if (edef(e).ai === 'pack' && alive(room(run)).some(o => o !== e && o.kind === e.kind && dist(o, h) === 1)) dmg += 1;
    ev(run, { t: 'attack', who: e.id, tx: h.x, ty: h.y, anim: 'attack', ranged }); if (ranged) ev(run, { t: 'proj', fx: e.x, fy: e.y, tx: h.x, ty: h.y, kind: 'arrow' });
    hurtHero(run, dmg, { melee: !ranged, enemy: e }); return true;
  }
  function areaHit(run, e, tiles, dmg, label) { ev(run, { t: 'attack', who: e.id, tx: run.hero.x, ty: run.hero.y, anim: 'attack' }); ev(run, { t: 'blast', tiles, kind: label }); if (tiles.some(([x, y]) => x === run.hero.x && y === run.hero.y)) { say(run, edef(e).name + '의 ' + label + ' 적중!'); hurtHero(run, dmg, { enemy: e }); return true; } say(run, edef(e).name + '의 ' + label + '을(를) 피했다.'); return false; }
  const inRoom = (x, y) => x >= 1 && y >= 1 && x <= W - 2 && y <= H - 2;
  function lineTiles(run, e, dx, dy) { const out = []; let x = e.x + dx, y = e.y + dy; const rm = room(run); while (inRoom(x, y) && !solid(tile(rm, x, y))) { const o = objAt(rm, x, y); if (o && M.blocks(o)) break; out.push([x, y]); x += dx; y += dy; } return out; }
  function dirToHero(run, e) { const dx = run.hero.x - e.x, dy = run.hero.y - e.y; return Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx) || 1, 0] : [0, Math.sign(dy)]; }
  function plus(x, y) { return [[x, y], ...N4.map(([dx, dy]) => [x + dx, y + dy])].filter(([a, b]) => inRoom(a, b)); }

  function actEnemy(run, e, budget) {
    const d = edef(e), h = run.hero, rm = room(run);
    if (e.st.stun) { ev(run, { t: 'text', x: e.x, y: e.y, text: '기절' }); return; }
    const adj = () => dist(e, h) === 1, toHero = () => enemyPath(run, e, (x, y) => Math.abs(x - h.x) + Math.abs(y - h.y) === 1);
    if (d.ai === 'melee' || d.ai === 'pack') { if (!adj()) moveEnemy(run, e, toHero(), d.speed); if (e.hp > 0 && adj()) strike(run, e, budget, false); return; }
    if (d.ai === 'ranged') {
      const can = () => dist(e, h) <= d.range && los(rm, e, h);
      if (e.intent?.type === 'aim') { const ok = can(); e.intent = null; if (ok && strike(run, e, budget, true)) return; if (!ok) ev(run, { t: 'text', x: e.x, y: e.y, text: '조준 놓침' }); }
      if (adj()) moveEnemy(run, e, enemyPath(run, e, (x, y) => Math.abs(x - h.x) + Math.abs(y - h.y) >= 3 && los(rm, { x, y }, h)), 2);
      else if (!can()) moveEnemy(run, e, enemyPath(run, e, (x, y) => Math.abs(x - h.x) + Math.abs(y - h.y) <= d.range && Math.abs(x - h.x) + Math.abs(y - h.y) >= 2 && los(rm, { x, y }, h)), d.speed);
      if (e.hp > 0 && can()) { e.intent = { type: 'aim', dmg: enemyDmg(run, e), label: '조준' }; faceHero(run, e); ev(run, { t: 'text', x: e.x, y: e.y, text: '조준!' }); }
      return;
    }
    if (d.ai === 'caster') {
      if (e.intent?.type === 'area') { const it = e.intent; e.intent = null; areaHit(run, e, it.tiles, it.dmg, it.label); }
      if (dist(e, h) < 3) moveEnemy(run, e, enemyPath(run, e, (x, y) => Math.abs(x - h.x) + Math.abs(y - h.y) >= 3 && los(rm, { x, y }, h)), d.speed);
      else if (!los(rm, e, h) || dist(e, h) > d.range + 1) moveEnemy(run, e, enemyPath(run, e, (x, y) => Math.abs(x - h.x) + Math.abs(y - h.y) <= d.range && los(rm, { x, y }, h)), d.speed);
      if (e.hp <= 0) return; const see = los(rm, e, h) && dist(e, h) <= d.range + 1;
      if (e.step++ % 2 === 0 && see) { e.intent = { type: 'area', tiles: plus(h.x, h.y), dmg: enemyDmg(run, e), label: '저주 문양' }; faceHero(run, e); ev(run, { t: 'text', x: e.x, y: e.y, text: '문양을 새긴다' }); }
      else { const hurt = alive(rm).filter(o => o !== e && o.hp <= o.maxHp - 4).sort((a, b) => a.hp - b.hp)[0]; if (hurt) { hurt.hp = Math.min(hurt.maxHp, hurt.hp + 4); ev(run, { t: 'dmg', id: hurt.id, x: hurt.x, y: hurt.y, n: 4, kind: 'heal' }); } }
      return;
    }
    if (d.ai === 'heavy') {
      if (e.intent?.type === 'area') { const it = e.intent; e.intent = null; areaHit(run, e, it.tiles, it.dmg, it.label); return; }
      if (!adj()) moveEnemy(run, e, toHero(), d.speed);
      if (e.hp > 0 && adj()) { const [dx, dy] = [h.x - e.x, h.y - e.y]; const tiles = [[h.x, h.y], [h.x + dy, h.y + dx], [h.x - dy, h.y - dx]].filter(([x, y]) => inRoom(x, y)); e.intent = { type: 'area', tiles, dmg: enemyDmg(run, e), label: '내려찍기' }; faceHero(run, e); ev(run, { t: 'text', x: e.x, y: e.y, text: '무기를 치켜든다' }); }
      return;
    }
    if (d.ai === 'boss') return actBoss(run, e, budget);
  }
  function actBoss(run, e, budget) {
    const d = edef(e), h = run.hero, rm = room(run);
    if (e.intent) {
      const it = e.intent; e.intent = null; let rest = it.type === 'summon' || it.type === 'blink';
      if (it.type === 'area') areaHit(run, e, it.tiles, it.dmg, it.label);
      else if (it.type === 'charge') {
        const path = []; let hit = false;
        for (const [x, y] of it.tiles) { if (x === h.x && y === h.y) { hit = true; break; } if (!walkable(run, x, y, true)) break; path.push([x, y]); }
        if (path.length) { const last = path[path.length - 1]; e.x = last[0]; e.y = last[1]; ev(run, { t: 'move', id: e.id, path, fast: true }); }
        if (hit) { ev(run, { t: 'attack', who: e.id, tx: h.x, ty: h.y, anim: 'attack' }); say(run, d.name + '의 돌진 적중!'); hurtHero(run, it.dmg, { melee: true, enemy: e }); }
        else { rest = true; ev(run, { t: 'shake' }); e.st.exposed = 2; ev(run, { t: 'status', id: e.id, kind: 'exposed', n: 2 }); say(run, d.name + '의 돌진이 빗나가 벽에 처박혔다. 빈틈!'); }
      } else if (it.type === 'summon') {
        const mine = alive(rm).filter(o => o.summoned).length; if (mine < 2) { const spot = freeNear(run, e.x + (h.x < e.x ? 1 : -1), e.y); if (spot) { const s = M.makeEnemy(d.summon, spot[0], spot[1], { n: run.nextId++ }); run.nextId++; s.state = 'alert'; s.summoned = true; rm.enemies.push(s); ev(run, { t: 'spawn', id: s.id }); say(run, d.name + '이(가) ' + ENEMIES[d.summon].name + '을(를) 불러냈다.'); } }
      } else if (it.type === 'blink') { const spots = []; for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (walkable(run, x, y, true) && tile(rm, x, y) === '.') spots.push([x, y]); spots.sort((a, b) => (Math.abs(b[0] - h.x) + Math.abs(b[1] - h.y)) - (Math.abs(a[0] - h.x) + Math.abs(a[1] - h.y))); if (spots[0]) { e.x = spots[0][0]; e.y = spots[0][1]; ev(run, { t: 'move', id: e.id, path: [spots[0]], fast: true }); } }
      if (rest || run.status !== 'active' || e.hp <= 0) return;
    }
    // 곁에 붙어 있는 상대는 예고 없이 짧게 후려친다(근접 공격: 방어·반격으로 받아낼 수 있다).
    const kind = d.pattern[e.step++ % d.pattern.length], dmg = enemyDmg(run, e);
    // 멀리 달아난 상대에게는 격노 질주(이동 +2). 다가선 뒤 곁에 닿으면 예고 없이 짧게 후려친다(근접 공격: 방어·반격·회피로 받아낼 수 있다).
    if (!d.stalker && dist(e, h) > 1) { const far = dist(e, h) >= 4; if (far) ev(run, { t: 'text', x: e.x, y: e.y, text: '격노 질주' }); moveEnemy(run, e, enemyPath(run, e, (x, y) => Math.abs(x - h.x) + Math.abs(y - h.y) === 1), d.speed + (far ? 2 : 0)); }
    else if (d.stalker && dist(e, h) > 1) moveEnemy(run, e, enemyPath(run, e, (x, y) => Math.abs(x - h.x) + Math.abs(y - h.y) === 1), d.speed);
    if (dist(e, h) === 1 && !e.st.root) { strike(run, e, budget, false, -2); if (run.status !== 'active' || e.hp <= 0) return; }
    faceHero(run, e); const around = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && inRoom(e.x + dx, e.y + dy)) around.push([e.x + dx, e.y + dy]);
    if (kind === 'sweep') e.intent = { type: 'area', tiles: around, dmg, label: '휩쓸기' };
    else if (kind === 'slam') { const [dx, dy] = dirToHero(run, e), t = []; for (let i = 1; i <= 2; i++) for (let s = -1; s <= 1; s++) { const x = e.x + dx * i + dy * s, y = e.y + dy * i + dx * s; if (inRoom(x, y)) t.push([x, y]); } e.intent = { type: 'area', tiles: t, dmg: dmg + 1, label: '대형 내려찍기' }; }
    else if (kind === 'charge') { const [dx, dy] = dirToHero(run, e); e.intent = { type: 'charge', tiles: lineTiles(run, e, dx, dy), dmg: dmg + 1, label: '돌진' }; }
    else if (kind === 'summon') { e.intent = { type: 'summon', tiles: [], label: '소환 의식' }; e.st.exposed = Math.max(e.st.exposed || 0, 2) /* 적 턴 끝에 1 줄어 내 턴 동안 빈틈이 남는다 */; ev(run, { t: 'status', id: e.id, kind: 'exposed', n: 1 }); }
    else if (kind === 'vent') { const t = new Set(); for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (tile(rm, x, y) === 'h') plus(x, y).forEach(([a, b]) => t.add(key(a, b))); around.forEach(([a, b]) => t.add(key(a, b))); e.intent = { type: 'area', tiles: [...t].map(k => k.split(',').map(Number)), dmg, label: '열기 방출' }; e.st.exposed = Math.max(e.st.exposed || 0, 2) /* 적 턴 끝에 1 줄어 내 턴 동안 빈틈이 남는다 */; }
    else if (kind === 'runes') { const t = new Map(); const add = (x, y) => plus(x, y).forEach(p => t.set(key(p[0], p[1]), p)); add(h.x, h.y); for (let i = 0; i < 2; i++) { const p = randomFree(run, rm); if (p) add(p[0], p[1]); } e.intent = { type: 'area', tiles: [...t.values()], dmg, label: '별빛 문양' }; }
    else if (kind === 'beam') { const t = []; const horiz = Math.abs(h.x - e.x) >= Math.abs(h.y - e.y); for (let i = 1; i < (horiz ? W : H) - 1; i++) { const x = horiz ? i : h.x, y = horiz ? h.y : i; if (!solid(tile(rm, x, y))) t.push([x, y]); } e.intent = { type: 'area', tiles: t, dmg: dmg + 2, label: '별빛 광선' }; }
    else if (kind === 'blink') { e.intent = { type: 'blink', tiles: [], label: '점멸' }; e.st.exposed = Math.max(e.st.exposed || 0, 2) /* 적 턴 끝에 1 줄어 내 턴 동안 빈틈이 남는다 */; }
    ev(run, { t: 'text', x: e.x, y: e.y, text: e.intent.label + ' 예고' });
  }

  function enemyPhase(run) {
    const rm = room(run); run.stats.rounds++;
    for (const e of alive(rm).slice()) { // 상태이상 피해
      if (e.st.burn) { hurtEnemy(run, e, e.st.burn, 'burn'); e.st.burn = Math.max(0, e.st.burn - 1); }
      if (e.hp > 0 && e.st.poison) { hurtEnemy(run, e, 2, 'poison'); e.st.poison -= 1; }
    }
    const budget = { total: 0, ranged: 0 };
    const order = alertIn(rm).sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
    for (const e of order) { if (run.status !== 'active') return; if (e.hp > 0) actEnemy(run, e, budget); }
    for (const e of alive(rm)) { for (const k of ['root', 'stun', 'exposed']) if (e.st[k]) e.st[k] -= 1; if (e.state === 'idle' && order.length) { e.state = 'alert'; ev(run, { t: 'alert', id: e.id }); } }
    if (run.status !== 'active') return;
    arrivePursuers(run); advance(run, RULES.time.round);
    if (run.stalker.state === 'coming' && run.time >= run.stalker.at) spawnStalker(run);
  }
  function beginHeroTurn(run) {
    const h = run.hero; run.turn++; h.parried = false; h.dodged = false; h.gaugeBlock = false; h.gaugeStatus = false; h.gaugeMove = false; gainGauge(run, 1, 'turn'); h.block = 0; h.retaliate = 0; h.smoke = false; h.mp = moveMax(run); h.main = 1; h.bonus = 1; h.moved = 0; h.statusUsed = false;
    drawCards(run, RULES.drawPerTurn); ev(run, { t: 'turn', n: run.turn });
  }

  // ───────── 카드/행동 검증과 미리보기
  function targetsFor(run, c, target) { // 카드가 실제로 영향을 주는 적 목록
    const rm = room(run), h = run.hero;
    if (c.special === 'cleave') { const first = target && enemyAt(rm, target.x, target.y); const others = alive(rm).filter(e => dist(e, h) === 1 && e !== first); return (first ? [first] : []).concat(others).slice(0, 3); }
    if (c.special === 'quake') return alive(rm).filter(e => dist(e, h) === 1);
    const e = target && alive(rm).find(x => x.id === target.id); if (!e) return [];
    if (c.area) return [e].concat(alive(rm).filter(o => o !== e && Math.max(Math.abs(o.x - e.x), Math.abs(o.y - e.y)) <= c.area)).slice(0, c.maxTargets || 9);
    if (c.line && c.maxTargets > 1) { const dx = Math.sign(e.x - h.x), dy = Math.sign(e.y - h.y), out = []; let x = h.x + dx, y = h.y + dy; while (inRoom(x, y) && !solid(tile(rm, x, y)) && out.length < c.maxTargets && Math.abs(x - h.x) + Math.abs(y - h.y) <= c.range) { const o = enemyAt(rm, x, y); if (o) out.push(o); x += dx; y += dy; } return out; }
    return [e];
  }
  // 연쇄 전류가 옮겨 붙을 대상(실행과 미리보기가 함께 쓴다)
  function chainTargets(run, src) { return alive(room(run)).filter(o => o !== src && hasStatus(o) && Math.abs(o.x - src.x) + Math.abs(o.y - src.y) <= 2).slice(0, 2); }
  const chainDmg = (run, o) => calcDamage(run, o, 3 + (hazard(run).conduct && tile(room(run), o.x, o.y) === 'h' ? 2 : 0), {});
  function cardBase(run, c, e) { // 카드의 기본 피해(굴림 제외)
    let n = c.dmg || 0;
    if (c.special === 'shield_bash') n += Math.min(8, run.hero.block);
    if (c.special === 'backstab' && run.hero.moved >= 3) n += c.bonusDmg || 3;
    if (c.id === 'frost' && hasPerk(run, 'lumi_frost')) n += 2;
    if (c.special === 'detonate') n = Math.min(8, 2 * ((e.st.burn || 0) + (e.st.poison || 0)));
    return n;
  }
  function checkTarget(run, c, target) {
    const rm = room(run), h = run.hero;
    if (c.target === 'self') { if (c.special === 'quake' && !alive(rm).some(e => dist(e, h) === 1)) return '인접한 적이 없다'; return null; }
    if (c.target === 'tile') { if (!target || target.x == null) return '칸을 고르세요'; if (Math.abs(target.x - h.x) + Math.abs(target.y - h.y) > c.range || (target.x === h.x && target.y === h.y)) return '사거리 밖'; if (!walkable(run, target.x, target.y) || tile(rm, target.x, target.y) === 'D') return '빈 칸이 아니다'; if (c.special === 'vault' && tile(rm, target.x, target.y) === 'h' && hazard(run).dmg) return '위험 지형 위에는 착지할 수 없다'; if (!los(rm, h, target)) return '시야가 막혔다'; return null; }
    const e = target && alive(rm).find(x => x.id === target.id); if (!e) return '대상을 고르세요';
    if (!visible(run, e.x, e.y) && e.state !== 'alert') return '보이지 않는 대상';
    if (dist(e, h) > c.range) return '사거리 밖(' + c.range + '칸)';
    if (c.range > 1 && !los(rm, h, e)) return '시야가 막혔다';
    if (c.line && e.x !== h.x && e.y !== h.y) return '같은 가로·세로선이어야 한다';
    if (c.id === 'strike' && c.range > 1 && e.x !== h.x && e.y !== h.y) return '직선이어야 한다';
    if (c.special === 'catalyst' && !(e.st.burn || e.st.poison)) return '화상·중독에 걸린 적만';
    if (c.special === 'detonate' && !(e.st.burn || e.st.poison)) return '터뜨릴 화상·중독이 없다';
    return null;
  }
  function slotReason(run, slot) { if (run.mode !== 'combat') return null; if (slot === 'main' && run.hero.main < 1) return '주 행동을 이미 썼다'; if (slot === 'bonus' && run.hero.bonus < 1) return '보조 행동을 이미 썼다'; return null; }

  // 미리보기: RNG를 소비하지 않는다. {ok, reason, cost, dmg:[{id,min,max,kill}], tiles, text}
  function preview(run, a) {
    if (run.status !== 'active') return { ok: false, reason: '원정이 끝났다' };
    const h = run.hero, rm = room(run), ambush = run.mode === 'explore';
    if (a.t === 'move') { const p = pathTo(run, a.x, a.y); if (!p) return { ok: false, reason: '갈 수 없는 칸' }; if (run.mode === 'combat' && p.cost > h.mp) return { ok: false, reason: '이동력 부족(' + p.cost + '/' + h.mp + ')', path: p.path, cost: p.cost }; const hz = tile(rm, a.x, a.y) === 'h' && hazard(run).dmg; return { ok: true, path: p.path, cost: run.mode === 'combat' ? p.cost : 0, text: (run.mode === 'combat' ? '이동 ' + p.cost : '이동') + (hz ? ' · ' + hazard(run).name + ' 피해 ' + hazard(run).dmg : '') }; }
    if (a.t === 'attack') { const atk = heroDef(run).attack, e = alive(rm).find(x => x.id === a.id), why = slotReason(run, 'main') || checkTarget(run, { range: atk.range, target: 'enemy' }, a); if (why) return { ok: false, reason: why }; const n = calcDamage(run, e, atk.dmg, { direct: true, ambush: ambush && e.state === 'idle' }), cc = critChance(run, e); return { ok: true, cost: '주 행동', crit: cc, dmg: [{ id: e.id, min: n, max: n, crit: cc ? critDamage(n) : null, kill: n >= e.hp }], text: atk.name + ' · 피해 ' + n }; }
    if (a.t === 'special') return previewSpecial(run, a);
    if (a.t === 'card') {
      const c = card(run, h && run.deck.hand[a.i]); if (!c) return { ok: false, reason: '카드 없음' };
      const why = slotReason(run, c.slot) || checkTarget(run, c, a.target); if (why) return { ok: false, reason: why, card: c };
      const out = { ok: true, card: c, cost: run.mode === 'combat' ? (c.slot === 'main' ? '주 행동' : '보조 행동') : '시간 ' + RULES.time.card, dmg: [], tiles: [] };
      if (c.type === 'attack') {
        const list = targetsFor(run, c, a.target); const mode = h.rollMode;
        list.forEach((e, i) => {
          const amb = ambush && e.state === 'idle', opt = { direct: true, pierce: c.pierce, ambush: amb, noFocus: i > 0 };
          if (c.roll) { const b = ER.dice.bounds(c.roll, { mode: mode === 'steady' ? 'steady' : 'normal' }); out.dmg.push({ id: e.id, min: calcDamage(run, e, b.min, opt), max: calcDamage(run, e, b.max, opt) }); }
          else { const base = cardBase(run, c, e), n = base ? calcDamage(run, e, base, opt) : 0; out.dmg.push({ id: e.id, min: n, max: n }); }
        });
        if (list[0]) { out.crit = critChance(run, list[0]); if (out.crit) out.dmg.forEach(d => { if (d.max > 0) d.crit = critDamage(d.max); }); }
        if (c.special === 'chain' && list[0]) chainTargets(run, list[0]).forEach(o => { const n = chainDmg(run, o); out.dmg.push({ id: o.id, min: n, max: n, note: '전이' }); });
        if (c.special === 'detonate' && list[0]) out.marks = alive(rm).filter(o => o !== list[0] && dist(o, list[0]) === 1).map(o => ({ id: o.id, text: '화상 +1' }));
        if (c.splashBurn && list[0]) out.marks = alive(rm).filter(o => o !== list[0] && dist(o, list[0]) === 1).map(o => ({ id: o.id, text: '화상 +' + c.splashBurn }));
        if (c.push || c.pull) out.dmg.filter(d => !d.note).forEach(d => { const e = alive(rm).find(x => x.id === d.id), pull = !!c.pull, dx = c.special === 'quake' ? e.x - h.x : Math.sign(pull ? h.x - e.x : e.x - h.x), dy = c.special === 'quake' ? e.y - h.y : Math.sign(pull ? h.y - e.y : e.y - h.y), f = shoveForecast(run, e, dx, dx ? 0 : dy, c.push || c.pull, pull, d.min); d.min += f.extra; d.max += f.extra; d.note = f.note; d.to = [f.x, f.y]; out.tiles.push([f.x, f.y]); });
        out.dmg.forEach(d => { const e = alive(rm).find(x => x.id === d.id); d.kill = d.min >= e.hp; });
      }
      if (c.special === 'vault' || c.special === 'snare') out.tiles = [[a.target.x, a.target.y]];
      out.text = c.name + (out.dmg.length ? ' · 피해 ' + out.dmg.map(d => d.min === d.max ? d.min : d.min + '~' + d.max).join(', ') : ''); return out;
    }
    return { ok: true };
  }
  function cardRangeTiles(run, c) { const h = run.hero, out = []; if (c.target === 'self') return out; for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const d = Math.abs(x - h.x) + Math.abs(y - h.y); if (d && d <= c.range && !solid(tile(room(run), x, y)) && (c.range === 1 || los(room(run), h, { x, y })) && (!c.line || x === h.x || y === h.y)) out.push([x, y]); } return out; }

  // ───────── 행동 실행
  function spend(run, slot) { if (run.mode === 'combat') run.hero[slot] -= 1; else advance(run, RULES.time.card); }
  function face(run, tx, ty) { const h = run.hero, dx = tx - h.x, dy = ty - h.y; h.facing = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down'); }
  function engage(run, e) { if (run.mode === 'explore') { const amb = e.state === 'idle'; startCombat(run, amb); return amb; } return false; }

  function doMove(run, a) {
    const p = preview(run, a); if (!p.ok) return p; const h = run.hero, rm = room(run); const walked = [];
    for (const [x, y] of p.path) {
      const c = stepCost(run, h.x, h.y, x, y); if (run.mode === 'combat') { if (h.mp < c) break; h.mp -= c; h.moved++; }
      face(run, x, y); h.x = x; h.y = y; walked.push([x, y]); if (run.heroId === 'noa' && run.mode === 'combat' && h.moved >= 3 && !h.gaugeMove) { h.gaugeMove = true; gainGauge(run, 1, 'move'); }
      const di = tile(rm, x, y) === 'D' && doorInfo(run, x, y);
      if (di) { ev(run, { t: 'move', id: 'hero', path: walked }); transition(run, di.dir); return { ok: true }; }
      if (tile(rm, x, y) === 'h' && hazard(run).dmg) { ev(run, { t: 'move', id: 'hero', path: walked.splice(0) }); say(run, hazard(run).name + '에 긁혔다.'); hurtHero(run, hazard(run).dmg, {}); if (run.status !== 'active') return { ok: true }; }
      reveal(run); const was = run.mode; if (was === 'explore') patrolTick(run); detect(run);
      if (was === 'explore' && run.mode === 'combat') break; // 발각되면 걸음을 멈춘다
    }
    if (walked.length) ev(run, { t: 'move', id: 'hero', path: walked });
    const pile = rm.objects.find(o => o.kind === 'pile' && o.x === h.x && o.y === h.y); if (pile) takePile(run, pile);
    return { ok: true };
  }
  function takePile(run, pile) { for (const it of pile.items) { const left = addBag(run, it.mat, it.qty); if (left < it.qty) ev(run, { t: 'loot', x: pile.x, y: pile.y, text: '+' + (it.qty - left) + ' ' + MATERIALS[it.mat].name }); it.qty = left; } pile.items = pile.items.filter(i => i.qty > 0); if (!pile.items.length) room(run).objects = room(run).objects.filter(o => o !== pile); }

  function doAttack(run, a) {
    const p = preview(run, a); if (!p.ok) return p; const e = alive(room(run)).find(x => x.id === a.id), atk = heroDef(run).attack, h = run.hero;
    const amb = engage(run, e); let n = calcDamage(run, e, atk.dmg, { direct: true, ambush: amb }); if (rollCrit(run, e)) n = critDamage(n);
    h.main -= 1; face(run, e.x, e.y); ev(run, { t: 'attack', who: 'hero', tx: e.x, ty: e.y, anim: 'attack', ranged: atk.range > 1 }); if (atk.range > 1) ev(run, { t: 'proj', fx: h.x, fy: h.y, tx: e.x, ty: e.y, kind: 'bolt' });
    h.focus = 0; hurtEnemy(run, e, n); if (atk.range <= 1 && e.hp > 0 && e.intent?.type === 'aim') cancelIntent(run, e); if (run.heroId === 'noa') h.mp += 1;
    checkCombatEnd(run); return { ok: true };
  }

  function doCard(run, a) {
    const p = preview(run, a); if (!p.ok) return p; const c = p.card, h = run.hero, rm = room(run), id = run.deck.hand[a.i];
    let amb = false; const list = c.type === 'attack' ? targetsFor(run, c, a.target) : []; if (c.special === 'chain' && list[0]) a = Object.assign({}, a, { chainIds: chainTargets(run, list[0]).map(o => o.id) });
    if (c.type === 'attack' && list.length) amb = list.some(e => e.state === 'idle') && run.mode === 'explore', engage(run, list[0]);
    if (c.special === 'catalyst' || (c.type !== 'attack' && c.target === 'enemy')) { const e = alive(rm).find(x => x.id === a.target.id); if (e) engage(run, e); }
    spend(run, c.slot); run.deck.hand.splice(a.i, 1); (c.exhaust ? run.deck.exhaust : run.deck.discard).push(id);
    say(run, '카드: ' + c.name);
    if (a.target?.x != null || list[0]) face(run, list[0]?.x ?? a.target.x, list[0]?.y ?? a.target.y);
    ev(run, { t: 'attack', who: 'hero', tx: list[0]?.x ?? h.x, ty: list[0]?.y ?? h.y, anim: c.type === 'attack' && c.range <= 1 && !c.special ? 'attack' : 'skill', card: c.id });
    if (c.type === 'attack') {
      let rolled = null;
      if (c.roll) { const mode = h.rollMode || 'normal'; rolled = ER.dice.roll(c.roll, run.rng, { mode }); h.rollMode = null; run.stats.rolls.push({ what: c.name, formula: c.roll, total: rolled.total, cands: rolled.candidates, mode }); ev(run, { t: 'roll', label: c.name, formula: c.roll, total: rolled.total, cands: rolled.candidates, mode }); say(run, c.name + ' 굴림 ' + c.roll + ' → ' + rolled.total + (rolled.candidates.length > 1 ? ' (' + rolled.candidates.join(' / ') + ' 중 높은 값)' : mode === 'steady' ? ' (고정)' : '')); }
      const crit = list[0] && (rolled ? rolled.total : cardBase(run, c, list[0])) > 0 ? rollCrit(run, list[0]) : false;
      list.forEach((e, i) => {
        if (e.hp <= 0) return; const opt = { direct: true, pierce: c.pierce, ambush: amb, noFocus: i > 0 };
        if (c.range > 1) ev(run, { t: 'proj', fx: h.x, fy: h.y, tx: e.x, ty: e.y, kind: c.burn ? 'fire' : c.root ? 'ice' : 'bolt' });
        const base = rolled ? rolled.total : cardBase(run, c, e); let n = base ? calcDamage(run, e, base, opt) : 0; if (crit && n) n = critDamage(n);
        if (c.special === 'detonate') { const spread = alive(rm).filter(o => o !== e && dist(o, e) === 1); e.st.burn = 0; e.st.poison = 0; ev(run, { t: 'blast', tiles: plus(e.x, e.y), kind: 'fire' }); hurtEnemy(run, e, n, 'burn'); spread.forEach(o => addStatus(run, o, 'burn', 1)); }
        else if (n) hurtEnemy(run, e, n);
        if (c.range <= 1 && e.hp > 0 && e.intent?.type === 'aim') cancelIntent(run, e);
        if (e.hp > 0) { if (c.burn) addStatus(run, e, 'burn', c.burn); if (c.poison) addStatus(run, e, 'poison', c.poison); if (c.root) addStatus(run, e, 'root', c.root); }
        if (c.splashBurn) alive(rm).filter(o => o !== e && dist(o, e) === 1).forEach(o => addStatus(run, o, 'burn', c.splashBurn));
        if (e.hp > 0 && c.push) { const dx = Math.sign(e.x - h.x), dy = Math.sign(e.y - h.y); shoveEnemy(run, e, dx, dx ? 0 : dy, c.push, false); }
        if (e.hp > 0 && c.pull) { const dx = Math.sign(h.x - e.x), dy = Math.sign(h.y - e.y); shoveEnemy(run, e, dx, dx ? 0 : dy, c.pull, true); }
      });
      if (c.special === 'chain' && list[0]) { const src = list[0]; (a.chainIds ? alive(rm).filter(o => a.chainIds.includes(o.id)) : []).forEach(o => { ev(run, { t: 'proj', fx: src.x, fy: src.y, tx: o.x, ty: o.y, kind: 'bolt' }); hurtEnemy(run, o, chainDmg(run, o), 'chain'); }); }
      h.focus = 0;
    }
    if (c.block) h.block += c.block; if (c.retaliate) h.retaliate = c.retaliate; if (c.heal) { const n = Math.min(c.heal, h.maxHp - h.hp); h.hp += n; ev(run, { t: 'dmg', id: 'hero', x: h.x, y: h.y, n, kind: 'heal' }); }
    if (c.move && run.mode === 'combat') h.mp += c.move; if (c.focus) h.focus = c.focus; if (c.draw) drawCards(run, c.draw);
    if (c.special === 'thorns') h.thorns = 1; if (c.special === 'harvest') h.harvest = 2; if (c.special === 'fortune') h.rollMode = 'advantage'; if (c.special === 'steady') h.rollMode = 'steady'; if (c.special === 'lockpick') h.checkBonus = 4;
    if (c.special === 'smoke') { h.smoke = true; alive(rm).forEach(e => { if (e.intent?.type === 'aim') cancelIntent(run, e); }); }
    if (c.special === 'taunt') alive(rm).filter(e => dist(e, h) <= 4 && dist(e, h) > 1).forEach(e => { if (e.intent?.type === 'aim') cancelIntent(run, e); if (e.state !== 'alert') { e.state = 'alert'; ev(run, { t: 'alert', id: e.id }); } const path = enemyPath(run, e, (x, y) => Math.abs(x - h.x) + Math.abs(y - h.y) === 1); if (!edef(e).boss) moveEnemy(run, e, path, 1); });
    if (c.special === 'taunt' && run.mode === 'explore' && alertIn(rm).length) startCombat(run, false);
    if (c.special === 'vault') { h.x = a.target.x; h.y = a.target.y; h.moved += 3; ev(run, { t: 'move', id: 'hero', path: [[h.x, h.y]], jump: true }); reveal(run); detect(run); }
    if (c.special === 'snare') rm.objects.push({ id: 'o' + (run.nextId++), kind: 'trap', x: a.target.x, y: a.target.y });
    if (c.special === 'catalyst') { const e = alive(rm).find(x => x.id === a.target.id); if (e.st.burn) addStatus(run, e, 'burn', 2); else addStatus(run, e, 'poison', 2); }
    if (c.special === 'scout') { const near = Object.values(rm.doors).map(d => run.rooms[d.to]); near.forEach(r => { r.known = true; Object.values(r.doors).forEach(d => run.rooms[d.to].known = true); }); say(run, '주변 방의 종류를 지도에 적었다.'); }
    if (c.special === 'quake') alive(rm).filter(e => dist(e, h) === 1).forEach(e => shoveEnemy(run, e, e.x - h.x, e.y - h.y, c.push, false));
    checkCombatEnd(run); return { ok: true };
  }

  // ───────── 특수기(투지 소모). 카드와 같은 주/보조 행동을 쓰므로 무료 추가 행동이 아니다.
  function specialTargets(run, sp, e) { return sp.area ? [e].concat(alive(room(run)).filter(o => o !== e && Math.max(Math.abs(o.x - e.x), Math.abs(o.y - e.y)) <= sp.area)).slice(0, sp.maxTargets || 9) : [e]; }
  function shadowSpot(run, e) { const h = run.hero; return N4.map(([dx, dy]) => [e.x + dx, e.y + dy]).filter(([x, y]) => (x === h.x && y === h.y) || (walkable(run, x, y) && tile(room(run), x, y) === '.')).sort((a, b) => (Math.abs(a[0] - h.x) + Math.abs(a[1] - h.y)) - (Math.abs(b[0] - h.x) + Math.abs(b[1] - h.y)))[0] || null; }
  function previewSpecial(run, a) {
    const sp = heroDef(run).special, h = run.hero; if (!sp) return { ok: false, reason: '특수기가 없다' };
    if (run.mode !== 'combat') return { ok: false, reason: '전투 중에만 쓸 수 있다' };
    if ((h.gauge || 0) < RULES.gauge.cost) return { ok: false, reason: '투지 부족(' + (h.gauge || 0) + '/' + RULES.gauge.cost + ')' };
    const why = slotReason(run, sp.slot) || (sp.target === 'enemy' ? checkTarget(run, { range: sp.range, target: 'enemy' }, a.target) : null); if (why) return { ok: false, reason: why };
    const out = { ok: true, special: sp, cost: '투지 ' + RULES.gauge.cost + ' + ' + (sp.slot === 'main' ? '주 행동' : '보조 행동'), dmg: [], tiles: [] };
    if (sp.target === 'enemy') { const e = alive(room(run)).find(x => x.id === a.target.id); if (sp.id === 'shadow') { const spot = shadowSpot(run, e); if (!spot) return { ok: false, reason: '대상 곁에 설 자리가 없다' }; out.tiles = [spot]; } out.crit = critChance(run, e); specialTargets(run, sp, e).forEach((o, i) => { const n = calcDamage(run, o, sp.dmg, { direct: true, noFocus: i > 0 }); out.dmg.push({ id: o.id, min: n, max: n, crit: out.crit ? critDamage(n) : null, kill: n >= o.hp }); }); }
    out.text = sp.name; return out;
  }
  function doSpecial(run, a) {
    const p = previewSpecial(run, a); if (!p.ok) return p; const sp = p.special, h = run.hero, rm = room(run);
    h.gauge -= RULES.gauge.cost; h[sp.slot] -= 1; say(run, '특수기: ' + sp.name); ev(run, { t: 'special', name: sp.name });
    if (sp.id === 'rally') { h.block += sp.block; h.retaliate = Math.max(h.retaliate, sp.retaliate); ev(run, { t: 'attack', who: 'hero', tx: h.x, ty: h.y, anim: 'skill' }); return { ok: true }; }
    const e = alive(rm).find(x => x.id === a.target.id), list = specialTargets(run, sp, e);
    if (sp.id === 'shadow') { const [x, y] = p.tiles[0]; if (x !== h.x || y !== h.y) { h.x = x; h.y = y; ev(run, { t: 'move', id: 'hero', path: [[x, y]], jump: true }); } h.moved += 3; if (!h.gaugeMove) h.gaugeMove = true; }
    face(run, e.x, e.y); ev(run, { t: 'attack', who: 'hero', tx: e.x, ty: e.y, anim: 'skill' }); if (sp.id === 'moonburst') { ev(run, { t: 'proj', fx: h.x, fy: h.y, tx: e.x, ty: e.y, kind: 'bolt' }); ev(run, { t: 'blast', tiles: plus(e.x, e.y), kind: 'fire' }); }
    const crit = rollCrit(run, e);
    list.forEach((o, i) => { if (o.hp <= 0) return; let n = calcDamage(run, o, sp.dmg, { direct: true, noFocus: i > 0 }); if (crit) n = critDamage(n); hurtEnemy(run, o, n); if (o.hp > 0 && sp.burn) addStatus(run, o, 'burn', sp.burn); });
    h.focus = 0; if (sp.id === 'shadow') h.mp += 2; reveal(run); checkCombatEnd(run); return { ok: true };
  }

  // 상호작용: 영웅과 같은 칸이거나 상하좌우 인접한 소품.
  function nearbyObjects(run) { const h = run.hero; return room(run).objects.filter(o => o.kind !== 'trap' && Math.abs(o.x - h.x) + Math.abs(o.y - h.y) <= 1 && interactions(run, o).length); }
  function checkInfo(run, def) { const bonus = gearSum(run, 'check') + (hasPerk(run, 'noa_loot') ? 2 : 0) + run.hero.checkBonus, mode = run.hero.rollMode || 'normal'; return { formula: def.formula, dc: def.dc, bonus, mode, chance: ER.dice.chance(def.formula, def.dc, { bonus, mode }) }; }
  function interactions(run, o) { // 이 소품에 지금 할 수 있는 행동 목록(표시 비용 = 실제 비용)
    const T = RULES.time, combat = run.mode === 'combat', cost = n => (combat ? '주 행동' : '시간 ' + n), out = [];
    if (o.kind === 'node' && o.qty > 0) { const bonus = (run.hero.harvest || 0) + (['ore', 'resin', 'coal', 'crystal'].includes(o.mat) ? gearSum(run, 'gather') : 0); out.push({ method: 'gather', label: MATERIALS[o.mat].name + ' 채집 ×' + (o.fresh === false ? o.qty : o.qty + bonus), cost: cost(T.gather), full: bagRoom(run, o.mat) === 0 }); }
    if (o.kind === 'chest') { const def = CHESTS[o.chest]; if (o.opened) { if (o.contents?.length) out.push({ method: 'take', label: def.name + '의 남은 물품 챙기기', cost: '무료' }); } else if (def.check) { const ci = checkInfo(run, def.check); out.push({ method: 'safe', label: def.name + ' 안전 해체', cost: cost(T.chestSafe), note: '기본 물품만' }); out.push({ method: 'check', label: '판정 시도 ' + ci.formula + (ci.bonus ? '+' + ci.bonus : '') + ' ≥ ' + ci.dc + ' (' + Math.round(ci.chance * 100) + '%)', cost: cost(T.chest), note: '성공: 추가 보상 · 실패: 기본 물품 + ' + (def.fail.dmg ? '피해 ' + def.fail.dmg + ', ' : '') + '시간 +' + def.fail.time, check: ci }); } else out.push({ method: 'open', label: def.name + ' 열기', cost: cost(T.chest) }); }
    if (o.kind === 'device' && !o.on) out.push({ method: 'device', label: '봉인 장치 작동', cost: cost(T.device) });
    if (o.kind === 'camp' && !o.used && !combat) out.push({ method: 'rest', label: '휴식: 체력 ' + Math.ceil(run.hero.maxHp * 0.4) + ' 회복(원정당 1회)', cost: '시간 ' + T.rest });
    if (o.kind === 'altar' && !o.used && !combat) { const ci = checkInfo(run, ALTAR.check); out.push({ method: 'altar', label: ALTAR.name + ' 판정 ' + ci.formula + (ci.bonus ? '+' + ci.bonus : '') + ' ≥ ' + ci.dc + ' (' + Math.round(ci.chance * 100) + '%)', cost: '시간 1', note: '성공: ' + ALTAR.success + ' · 실패: 시간 +' + ALTAR.fail.time, check: ci }); }
    if (o.kind === 'objective') out.push({ method: 'objective', label: REGIONS[run.regionId].objective.name + ' 회수', cost: '무료' });
    if (o.kind === 'pile') out.push({ method: 'pile', label: '바닥의 물품 줍기', cost: '무료' });
    if (o.kind === 'portal') { const near = alertIn(room(run)).some(e => dist(e, run.hero) <= 2); out.push({ method: 'extract', label: '길드로 귀환', cost: combat ? '주 행동' : '무료', blocked: near ? '경계 중인 적이 2칸 안에 있다' : null }); }
    return out;
  }
  function lootTable(run, def, withBonus) { const items = []; const picks = R.shuffle(run.rng, 'loot', def.loot.mats).slice(0, def.loot.picks); for (const [m, q] of picks) items.push({ mat: m, qty: q }); let gold = def.loot.gold[0] + R.int(run.rng, 'loot', def.loot.gold[1] - def.loot.gold[0] + 1); if (withBonus) { gold += def.bonus.gold; for (const [m, q] of def.bonus.mats) { const it = items.find(i => i.mat === m); if (it) it.qty += q; else items.push({ mat: m, qty: q }); } } return { items, gold }; }
  function rollCheck(run, def, label) { const ci = checkInfo(run, def), r = ER.dice.roll(def.formula, run.rng, { mode: ci.mode, bonus: ci.bonus }), ok = r.total >= def.dc; run.hero.rollMode = null; run.hero.checkBonus = 0; run.stats.rolls.push({ what: label, formula: def.formula, total: r.total, dc: def.dc, ok, mode: ci.mode, cands: r.candidates }); ev(run, { t: 'roll', label, formula: def.formula + (ci.bonus ? '+' + ci.bonus : ''), total: r.total, dc: def.dc, ok, cands: r.candidates, mode: ci.mode }); say(run, label + ' 판정 ' + r.total + ' vs ' + def.dc + ' → ' + (ok ? '성공' : '실패')); return ok; }

  function doInteract(run, a) {
    const rm = room(run), o = rm.objects.find(x => x.id === a.id), h = run.hero; if (!o || Math.abs(o.x - h.x) + Math.abs(o.y - h.y) > 1) return { ok: false, reason: '너무 멀다' };
    const opt = interactions(run, o).find(i => i.method === a.method); if (!opt) return { ok: false, reason: '지금은 할 수 없다' }; if (opt.blocked) return { ok: false, reason: opt.blocked };
    const T = RULES.time, combat = run.mode === 'combat', pay = n => { if (combat) h.main -= 1; else advance(run, n); };
    if (opt.cost === '주 행동' && h.main < 1) return { ok: false, reason: '주 행동을 이미 썼다' };
    face(run, o.x, o.y);
    if (a.method === 'gather') { if (opt.full) return { ok: false, reason: '가방에 ' + MATERIALS[o.mat].name + ' 자리가 없다. 가방(B)에서 비우거나 그대로 두자.' }; pay(T.gather); if (o.fresh !== false) { o.qty += (h.harvest || 0) + (['ore', 'resin', 'coal', 'crystal'].includes(o.mat) ? gearSum(run, 'gather') : 0); h.harvest = 0; o.fresh = false; } const left = addBag(run, o.mat, o.qty), got = o.qty - left; o.qty = left; ev(run, { t: 'attack', who: 'hero', tx: o.x, ty: o.y, anim: 'attack' }); ev(run, { t: 'loot', x: o.x, y: o.y, text: '+' + got + ' ' + MATERIALS[o.mat].name }); say(run, MATERIALS[o.mat].name + ' ' + got + '개 채집.' + (left ? ' 가방이 차서 ' + left + '개는 남겨 두었다.' : '')); if (!o.qty) rm.objects = rm.objects.filter(x => x !== o); }
    else if (a.method === 'open' || a.method === 'safe' || a.method === 'check') {
      const def = CHESTS[o.chest]; let bonus = false; pay(a.method === 'safe' ? T.chestSafe : T.chest);
      if (a.method === 'check') { bonus = rollCheck(run, def.check, def.name); if (!bonus) { if (def.fail.dmg) hurtHero(run, def.fail.dmg, {}); if (!combat) advance(run, def.fail.time); } }
      const loot = lootTable(run, def, bonus); o.opened = true; o.contents = loot.items; run.gold += loot.gold; ev(run, { t: 'loot', x: o.x, y: o.y, text: '+' + loot.gold + ' 금화' }); say(run, def.name + ' 개봉: 금화 ' + loot.gold + (bonus ? ' (추가 보상 포함)' : '')); takeChest(run, o); if (o.chest === 'vault' || bonus) offerDraft(run, def.name);
    }
    else if (a.method === 'take') takeChest(run, o);
    else if (a.method === 'device') { pay(T.device); o.on = true; run.devicesOn++; ev(run, { t: 'shake' }); say(run, run.devicesOn >= run.devicesNeed ? '봉인이 풀렸다. 성소로 가는 문이 열렸다!' : '장치가 돌아간다. 남은 봉인 장치 ' + (run.devicesNeed - run.devicesOn) + '.'); }
    else if (a.method === 'rest') { advance(run, T.rest); o.used = true; const n = Math.min(Math.ceil(h.maxHp * 0.4), h.maxHp - h.hp); h.hp += n; ev(run, { t: 'dmg', id: 'hero', x: h.x, y: h.y, n, kind: 'heal' }); say(run, '모닥불 곁에서 쉬었다. 체력 +' + n + '.'); }
    else if (a.method === 'altar') { advance(run, 1); o.used = true; if (rollCheck(run, ALTAR.check, ALTAR.name)) { const n = Math.min(8, h.maxHp - h.hp); h.hp += n; h.focusBonus += 1; ev(run, { t: 'dmg', id: 'hero', x: h.x, y: h.y, n, kind: 'heal' }); } else advance(run, ALTAR.fail.time); }
    else if (a.method === 'objective') { run.flags.objective = true; rm.objects = rm.objects.filter(x => x !== o); ev(run, { t: 'loot', x: o.x, y: o.y, text: REGIONS[run.regionId].objective.name }); say(run, REGIONS[run.regionId].objective.name + ' 확보! 귀환해야 길드의 것이 된다.'); }
    else if (a.method === 'pile') takePile(run, o);
    else if (a.method === 'extract') { if (combat) h.main -= 1; run.status = 'extracted'; say(run, '귀환문을 통과했다.'); ev(run, { t: 'extract' }); }
    checkCombatEnd(run); return { ok: true };
  }
  // 발견 카드: 이번 원정에만 쓰는 임시 카드 3장 중 1장. 아직 연구하지 않은 카드를 먼저 보여 준다(연구하면 영구).
  function offerDraft(run, source) {
    run.temp = run.temp || []; // 이전 버전에서 시작한 원정 보정
    const usable = Object.values(CARDS).filter(c => (!c.hero || c.hero === run.heroId) && String(c.source).startsWith('research') && !run.temp.includes(c.id));
    const fresh = usable.filter(c => run.known && !run.known.includes(c.id)), rest = usable.filter(c => !fresh.includes(c));
    const options = R.shuffle(run.rng, 'loot', fresh).concat(R.shuffle(run.rng, 'loot', rest)).slice(0, 3).map(c => c.id); if (!options.length) return;
    run.pendingDraft = { options, source }; ev(run, { t: 'draft' }); say(run, source + '에서 낯선 카드 뭉치를 발견했다.');
  }
  function doDraft(run, a) {
    const d = run.pendingDraft; if (!d) return { ok: false, reason: '고를 카드가 없다' }; run.pendingDraft = null;
    run.temp = run.temp || []; const id = d.options[a.pick]; if (!id) { run.gold += 5; say(run, '카드는 두고 금화 5를 챙겼다.'); return { ok: true }; }
    run.temp.push(id); run.deck.hand.push(id); // 손패 한도를 넘더라도 바로 손에 들어온다
    say(run, '발견 카드: ' + CARDS[id].name + ' — 이번 원정 동안 덱에 들어간다.'); return { ok: true };
  }
  function takeChest(run, o) { for (const it of o.contents) { const left = addBag(run, it.mat, it.qty); if (left < it.qty) ev(run, { t: 'loot', x: o.x, y: o.y, text: '+' + (it.qty - left) + ' ' + MATERIALS[it.mat].name }); it.qty = left; } o.contents = o.contents.filter(i => i.qty > 0); if (o.contents.length) say(run, '가방이 가득 차 일부는 상자에 남겨 두었다: ' + o.contents.map(i => MATERIALS[i.mat].name + ' ' + i.qty).join(', ')); }

  function act(run, a) {
    if (run.status !== 'active') return { ok: false, reason: '원정이 끝났다' };
    const h = run.hero; let r;
    if (run.pendingDraft && a.t !== 'draft') return { ok: false, reason: '발견한 카드를 먼저 고르세요' };
    switch (a.t) {
      case 'draft': r = doDraft(run, a); break;
      case 'special': r = doSpecial(run, a); break;
      case 'move': r = doMove(run, a); break;
      case 'step': { const v = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[a.dir]; h.facing = a.dir; r = doMove(run, { t: 'move', x: h.x + v[0], y: h.y + v[1] }); break; }
      case 'attack': r = doAttack(run, a); break;
      case 'card': r = doCard(run, a); break;
      case 'interact': r = doInteract(run, a); break;
      case 'guard': { if (run.mode !== 'combat') return { ok: false, reason: '전투 중에만' }; if (h.main < 1) return { ok: false, reason: '주 행동을 이미 썼다' }; h.main -= 1; const n = RULES.guardBlock + (heroDef(run).guardBonus || 0) + (hasPerk(run, 'ara_guard') ? 2 : 0); h.block += n; ev(run, { t: 'attack', who: 'hero', tx: h.x, ty: h.y, anim: 'skill' }); say(run, '방어 태세(+' + n + ').'); r = { ok: true }; break; }
      case 'breathe': { if (run.mode !== 'combat') return { ok: false, reason: '전투 중에만' }; if (h.bonus < 1) return { ok: false, reason: '보조 행동을 이미 썼다' }; const id = run.deck.hand[a.i]; if (!id) return { ok: false, reason: '버릴 카드를 고르세요' }; h.bonus -= 1; run.deck.hand.splice(a.i, 1); run.deck.discard.push(id); drawCards(run, 1); say(run, '숨 고르기: ' + CARDS[id].name + '을(를) 버리고 1장 뽑았다.'); r = { ok: true }; break; }
      case 'item': { if (!run.items[a.id]) return { ok: false, reason: '남은 수량이 없다' }; if (run.mode === 'combat' && h.bonus < 1) return { ok: false, reason: '보조 행동을 이미 썼다' }; if (a.id === 'flare' && run.mode !== 'combat') return { ok: false, reason: '전투 중에만' }; spend(run, 'bonus'); run.items[a.id]--; if (a.id === 'bandage') { const n = Math.min(6, h.maxHp - h.hp); h.hp += n; ev(run, { t: 'dmg', id: 'hero', x: h.x, y: h.y, n, kind: 'heal' }); say(run, '붕대로 체력 +' + n + '.'); } else { ev(run, { t: 'flash' }); alive(room(run)).forEach(e => { if (edef(e).boss) { if (e.intent) { e.intent = null; } } else addStatus(run, e, 'stun', 1); }); say(run, '섬광! 적들이 눈을 가렸다.'); } r = { ok: true }; break; }
      case 'drop': { const s = run.bag[a.slot]; if (!s) return { ok: false, reason: '빈 칸' }; run.bag.splice(a.slot, 1); dropPile(run, h.x, h.y, s.mat, s.qty); say(run, MATERIALS[s.mat].name + ' ' + s.qty + '개를 발밑에 내려놓았다.'); r = { ok: true }; break; }
      case 'end': { if (run.mode !== 'combat') return { ok: false, reason: '탐사 중에는 턴이 없다' }; enemyPhase(run); if (run.status === 'active') { checkCombatEnd(run); if (run.mode === 'combat') beginHeroTurn(run); } r = { ok: true }; break; }
      default: return { ok: false, reason: '알 수 없는 행동' };
    }
    if (r.ok && run.status === 'active') reveal(run);
    return r;
  }

  // 화면용: 적이 다음 턴에 닿을 수 있는 위협 칸
  function threatTiles(run, e) {
    const d = edef(e); if (e.intent?.tiles?.length) return e.intent.tiles; if (d.range) { const out = []; for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (Math.abs(x - e.x) + Math.abs(y - e.y) <= d.range && los(room(run), e, { x, y }) && !solid(tile(room(run), x, y))) out.push([x, y]); return out; }
    const enrage = d.boss && !d.stalker ? 2 : 0, base = e.st.root || e.st.stun ? 0 : d.speed, sp = base ? base + enrage : 0; // 수호자는 4칸 넘게 떨어진 칸까지는 격노 질주로 닿는다
    const seen = new Map([[key(e.x, e.y), 0]]), q = [[e.x, e.y]], out = new Set();
    while (q.length) { const [x, y] = q.shift(), c = seen.get(key(x, y)); for (const [dx, dy] of N4) { const nx = x + dx, ny = y + dy, k = key(nx, ny); if (solid(tile(room(run), nx, ny))) continue; if (c <= base || Math.abs(nx - e.x) + Math.abs(ny - e.y) >= 4) out.add(k); if (c < sp && !seen.has(k) && (walkable(run, nx, ny, true) || (nx === run.hero.x && ny === run.hero.y)) && !(nx === run.hero.x && ny === run.hero.y)) { seen.set(k, c + 1); q.push([nx, ny]); } } }
    return [...out].map(k => k.split(',').map(Number));
  }
  function allThreat(run) { const s = new Map(); for (const e of alertIn(room(run))) { if (e.intent?.tiles?.length || e.st.stun) continue; for (const [x, y] of threatTiles(run, e)) s.set(key(x, y), [x, y]); } return [...s.values()]; }
  function intentText(run, e) { const d = edef(e); if (e.hp <= 0) return ''; if (e.st.stun) return '기절'; if (e.state !== 'alert') return (e.patrol ? '순찰 중 — 사방 ' + detectRange(run, e) + '칸을 살핀다.' : '방심 — 바라보는 쪽 ' + detectRange(run, e) + '칸만 본다. 가끔 뒤를 돌아본다.') + ' 들키기 전에 치면 기습 +' + RULES.ambushBonus; if (e.intent) return e.intent.label + (e.intent.dmg ? ' ' + e.intent.dmg : ''); if (d.ai === 'ranged') return '자리 잡고 조준'; if (d.ai === 'caster') return '문양 또는 치유'; if (d.ai === 'boss') return '곁에 있으면 후려치기 ' + Math.max(1, enemyDmg(run, e) - 2) + ' · 다음 예고: ' + ({ sweep: '휩쓸기', charge: '돌진', summon: '소환', slam: '내려찍기', vent: '열기 방출', runes: '문양', beam: '광선', blink: '점멸' }[d.pattern[e.step % d.pattern.length]]); return '접근 후 공격 ' + enemyDmg(run, e); }

  function strip(run) { const c = clone(run); c.events = []; return c; } // 저장용
  ER.run = { create, act, preview, room, card, los, visible, vision, pathTo, reachableTiles, cardRangeTiles, doorInfo, exitInfo, nearbyObjects, interactions, threatTiles, allThreat, watchTiles, critChance, intentText, bagSlots, bagRoom, moveMax, phaseDef, alive, alertIn, strip, calcDamage, addBag, edef };
  if (typeof module === 'object') module.exports = ER;
})(typeof globalThis !== 'undefined' ? globalThis : this);
