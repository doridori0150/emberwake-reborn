/* 봇 원정 시뮬레이션: 규칙 엔진의 충돌·교착·대략적인 난이도를 본다.
   봇 승률은 사람의 재미나 플레이타임을 증명하지 않는다(자동/fixture 검사로 분류).
   사용법: node tools/sim.cjs [지역] [대원] [횟수] [목표: boss|loot] */
'use strict';
require('../src/guild.js');
require('../src/bot.js');
const ER = globalThis.ER,
  RUN = ER.run,
  M = ER.map,
  D = ER.data;

function bot(run, goal, trace, opts = {}) {
  let guard = 0;
  const stuck = () => {
    throw new Error('교착: ' + JSON.stringify({ room: run.roomId, mode: run.mode, hero: run.hero, time: run.time }));
  };
  const act = a => {
    const r = RUN.act(run, a);
    if (trace) console.log(JSON.stringify(a), r.ok ? '' : r.reason);
    return r;
  };
  const roomPath = toId => {
    const prev = new Map([[run.roomId, null]]),
      q = [run.roomId];
    while (q.length) {
      const id = q.shift();
      if (id === toId) break;
      for (const [d, door] of Object.entries(run.rooms[id].doors)) {
        if (prev.has(door.to)) continue;
        if (door.sealed && run.devicesOn < run.devicesNeed) continue;
        prev.set(door.to, [id, d]);
        q.push(door.to);
      }
    }
    if (!prev.has(toId)) return null;
    const out = [];
    let c = toId;
    while (prev.get(c)) {
      out.unshift(prev.get(c)[1]);
      c = prev.get(c)[0];
    }
    return out;
  };
  const goDoor = d => {
    const [x, y] = M.DOOR[d];
    const r = act({ t: 'move', x, y });
    if (r.ok) return r;
    // 위험 지형에 둘러싸여 길이 없으면 사람처럼 한 칸 밟고 나간다(목적지로 찍으면 밟을 수 있다)
    const rm = RUN.room(run),
      h = run.hero,
      step = [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0]
      ]
        .map(([dx, dy]) => [h.x + dx, h.y + dy])
        .find(([sx, sy]) => rm.tiles[sy]?.[sx] === 'h' && RUN.pathTo(run, sx, sy));
    if (step && act({ t: 'move', x: step[0], y: step[1] }).ok) return act({ t: 'move', x, y });
    return r;
  };
  const moveNear = (x, y) => {
    let best = null;
    for (const [dx, dy] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0]
    ]) {
      const p = RUN.pathTo(run, x + dx, y + dy),
        hz = RUN.room(run).tiles[y + dy]?.[x + dx] === 'h'; // 위험 지형 칸은 마지막 수단
      if (x + dx === run.hero.x && y + dy === run.hero.y) return 'there';
      if (p && (!best || p.cost + (hz ? 50 : 0) < best.cost)) best = { x: x + dx, y: y + dy, cost: p.cost + (hz ? 50 : 0), path: p.path };
    }
    if (!best) return null;
    if (run.mode === 'combat') {
      let cost = 0,
        last = null;
      for (const [px, py] of best.path) {
        const c = RUN.pathTo(run, px, py)?.cost ?? 99;
        if (c <= run.hero.mp) last = [px, py];
      }
      if (!last) return null;
      return act({ t: 'move', x: last[0], y: last[1] }).ok ? 'moved' : null;
    }
    return act({ t: 'move', x: best.x, y: best.y }).ok ? 'moved' : null;
  };

  while (run.status === 'active') {
    if (++guard > 3000) stuck();
    if (run.pendingDraft) {
      act({ t: 'draft', pick: 0 });
      continue;
    }
    if (run.pendingEvent) {
      // 고를 수 있는 첫 선택지(조건이 모자란 것은 건너뛴다)
      let k = 0;
      while (k < 8 && !act({ t: 'event', choice: k }).ok) k++;
      if (k >= 8) stuck();
      continue;
    }
    if (opts.smart && run.mode === 'combat') {
      // 목표를 이뤘거나 추적자가 왔으면 곁의 귀환문으로 빠져나간다
      const portal = RUN.nearbyObjects(run).find(o => o.kind === 'portal');
      if (
        portal &&
        (run.flags.objective || run.stalker?.state === 'here' || run.time > run.limit) &&
        run.hero.main > 0 &&
        act({ t: 'interact', id: portal.id, method: 'extract' }).ok
      )
        continue;
      if (run.stats.rounds > 400) stuck();
      // 대원별 전투 봇(src/bot.js)에게 전투를 맡긴다
      ER.bot.fight(run, run.heroId, 60);
      if (run.status === 'active' && run.mode === 'combat') act({ t: 'end' });
      continue;
    }
    const rm = RUN.room(run),
      h = run.hero;
    if (run.mode === 'combat') {
      const foes = RUN.alive(rm).filter(e => e.state === 'alert');
      // 예고 칸에서 벗어나기
      const danger = new Set();
      foes.forEach(e => e.intent?.tiles?.forEach(([x, y]) => danger.add(x + ',' + y)));
      if (danger.has(h.x + ',' + h.y)) {
        const safe = RUN.reachableTiles(run)
          .filter(([x, y]) => !danger.has(x + ',' + y))
          .sort((a, b) => a[2] - b[2])[0];
        if (safe) act({ t: 'move', x: safe[0], y: safe[1] });
      }
      let did = true;
      while (did && run.status === 'active' && run.mode === 'combat') {
        did = false;
        const foes2 = RUN.alive(RUN.room(run));
        // 가장 큰 피해를 주는 카드/기본 공격
        let best = null;
        run.deck.hand.forEach((id, i) => {
          const c = RUN.card(run, id);
          if (c.target === 'self') {
            if (['guard_up', 'focus', 'riposte', 'bulwark', 'thorns', 'regroup'].includes(id) || (id === 'mend' && h.hp < h.maxHp - 6)) {
              const p = RUN.preview(run, { t: 'card', i });
              if (
                p.ok &&
                (c.slot === 'bonus' || foes2.every(e => Math.abs(e.x - h.x) + Math.abs(e.y - h.y) > 1 === false)) &&
                (!best || best.score < 1)
              )
                best = best || { a: { t: 'card', i }, score: c.slot === 'bonus' ? 0.5 : 0.2 };
            }
            return;
          }
          if (c.target !== 'enemy') return;
          for (const e of foes2) {
            const p = RUN.preview(run, { t: 'card', i, target: { id: e.id } });
            if (p.ok) {
              const score =
                p.dmg.reduce((n, d) => n + d.min + (d.kill ? 3 : 0), 0) +
                (c.burn || 0) +
                (c.poison || 0) +
                (c.root ? 1 : 0) +
                (c.push ? 2 : 0);
              if (!best || score > best.score) best = { a: { t: 'card', i, target: { id: e.id } }, score };
            }
          }
        });
        for (const e of foes2) {
          const p = RUN.preview(run, { t: 'attack', id: e.id });
          if (p.ok) {
            const score = p.dmg[0].min + (p.dmg[0].kill ? 3 : 0);
            if (!best || score > best.score) best = { a: { t: 'attack', id: e.id }, score };
          }
        }
        if (best && act(best.a).ok) {
          did = true;
          continue;
        }
        if (h.main > 0 && h.mp > 0 && foes2.length) {
          const t = foes2
            .slice()
            .sort((a, b) => Math.abs(a.x - h.x) + Math.abs(a.y - h.y) - (Math.abs(b.x - h.x) + Math.abs(b.y - h.y)))[0];
          const before = h.x + ',' + h.y;
          if (moveNear(t.x, t.y) === 'moved' && before !== h.x + ',' + h.y) {
            did = true;
            continue;
          }
        }
      }
      if (run.status === 'active' && run.mode === 'combat') {
        if (run.hero.main > 0) act({ t: 'guard' });
        act({ t: 'end' });
      }
      continue;
    }
    // 탐사
    const near = RUN.nearbyObjects(run).filter(o => o.kind !== 'portal' && o.kind !== 'camp' && o.kind !== 'altar');
    let handled = false;
    for (const o of near) {
      const opts = RUN.interactions(run, o).filter(i => !i.full && !i.blocked);
      const pick =
        opts.find(i => i.method === 'check' && i.check.chance >= 0.5) ||
        opts.find(i => ['gather', 'open', 'safe', 'take', 'device', 'objective', 'pile'].includes(i.method));
      if (pick) {
        const before = JSON.stringify(run.bag) + run.time;
        if (
          act({ t: 'interact', id: o.id, method: pick.method }).ok &&
          before !== JSON.stringify(run.bag) + run.time + (o.kind === 'objective' ? 'x' : '')
        ) {
          handled = true;
          break;
        }
      }
    }
    if (handled) continue;
    const camp = RUN.nearbyObjects(run).find(o => o.kind === 'camp');
    if (camp && h.hp < h.maxHp * 0.6 && act({ t: 'interact', id: camp.id, method: 'rest' }).ok) continue;
    const bagFull = run.bag.length >= RUN.bagSlots(run),
      done = goal === 'boss' ? run.flags.objective : bagFull;
    // 성소가 열렸으면(장치 완료) 시간이 빠듯해도 수호자에게 간다: 사람도 이 판단을 한다. 체력이 낮으면 물러난다.
    const pushBoss = goal === 'boss' && run.devicesOn >= run.devicesNeed && !run.flags.bossDead && h.hp >= h.maxHp * 0.6,
      retreat =
        done || h.hp < h.maxHp * 0.35 || (run.time > run.limit * 0.85 && !pushBoss) || (goal === 'loot' && run.time > run.limit * 0.5);
    if (retreat) {
      if (run.roomId === 0) {
        const portal = rm.objects.find(o => o.kind === 'portal');
        const r = moveNear(portal.x, portal.y);
        if (r === 'there') act({ t: 'interact', id: portal.id, method: 'extract' });
        else if (!r) stuck();
      } else {
        const p = roomPath(0);
        if (!p || !goDoor(p[0]).ok) stuck();
      }
      continue;
    }
    // 방 안의 남은 볼일
    const todo = rm.objects
      .filter(
        o =>
          (o.kind === 'node' && o.qty > 0 && RUN.bagRoom(run, o.mat) > 0) ||
          (o.kind === 'chest' && !o.opened) ||
          (o.kind === 'device' && !o.on) ||
          o.kind === 'objective' ||
          (o.kind === 'camp' && !o.used && h.hp < h.maxHp * 0.6)
      )
      .filter(o => !o.skip);
    if (todo.length) {
      const o = todo[0];
      const g = RUN.guardsNear(run, o)[0];
      if (g) {
        const r = moveNear(g.x, g.y);
        if (r === 'there') act({ t: 'attack', id: g.id });
        else if (!r) o.skip = true;
        continue;
      }
      const r = moveNear(o.x, o.y);
      if (!r || r === 'there') o.skip = true;
      continue;
    }
    const idle = RUN.alive(rm).filter(e => e.state === 'idle');
    if (idle.length && goal === 'boss') {
      const e = idle[0];
      const r = moveNear(e.x, e.y);
      if (r === 'there') {
        act({ t: 'attack', id: e.id });
      } else if (!r) e.state = 'alert';
      continue;
    }
    // 다음 방: 안 가본 방 우선(성소는 마지막)
    const unvisited = run.rooms
      .filter(r => !r.visited && roomPath(r.id))
      .sort(
        (a, b) =>
          (a.type === 'sanctum') - (b.type === 'sanctum') ||
          (goal === 'loot' && a.danger) - (goal === 'loot' && b.danger) ||
          roomPath(a.id).length - roomPath(b.id).length
      );
    const next = unvisited[0];
    if (!next || (goal === 'loot' && next.type === 'sanctum')) {
      if (run.roomId === 0) {
        const portal = rm.objects.find(o => o.kind === 'portal');
        if (moveNear(portal.x, portal.y) === 'there') act({ t: 'interact', id: portal.id, method: 'extract' });
      } else goDoor(roomPath(0)[0]);
      continue;
    }
    if (!goDoor(roomPath(next.id)[0]).ok) stuck();
  }
  return run;
}

if (require.main === module) {
  const [region = 'verdant', hero = 'ara', count = '200', goal = 'boss'] = process.argv.slice(2);
  const res = { extracted: 0, defeat: 0, boss: 0, time: 0, hp: 0, rounds: 0, slots: 0, gold: 0, mats: {} };
  for (let i = 0; i < +count; i++) {
    const run = RUN.create({ regionId: region, heroId: hero, deck: D.HEROES[hero].deck, seed: 'sim' + i, noEvents: true });
    bot(run, goal, false);
    res[run.status]++;
    if (run.flags.objective && run.status === 'extracted') res.boss++;
    res.time += run.time / run.limit;
    res.hp += run.hero.hp / run.hero.maxHp;
    res.rounds += run.stats.rounds;
    res.slots += run.bag.length;
    res.gold += run.gold;
    if (run.status === 'extracted') for (const s of run.bag) res.mats[s.mat] = (res.mats[s.mat] || 0) + s.qty;
  }
  const n = +count;
  console.log(
    region,
    hero,
    goal,
    '| 귀환',
    res.extracted,
    '패배',
    res.defeat,
    '보스회수',
    res.boss,
    '| 평균 시간비',
    (res.time / n).toFixed(2),
    '잔여HP',
    (res.hp / n).toFixed(2),
    '라운드',
    (res.rounds / n).toFixed(1),
    '가방칸',
    (res.slots / n).toFixed(1),
    '금화',
    (res.gold / n).toFixed(0)
  );
  console.log(
    ' 평균 회수 재료:',
    Object.entries(res.mats)
      .map(([k, v]) => k + ' ' + (v / n).toFixed(1))
      .join(', ')
  );
}
module.exports = { bot };
