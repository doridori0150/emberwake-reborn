/* 미궁 생성: 방 그래프(트리+선택적 고리) → 방 종류 배정 → 타일·소품·적 배치.
   생성 결과는 원정 상태에 그대로 저장되며 다시 뽑지 않는다.
   보장: 모든 문·소품·적은 위험 지형을 밟지 않고도 닿을 수 있다. 성소는 막다른 방이며 봉인 장치는 성소 밖에 있다. */
(function (g) {
  'use strict';
  const ER = g.ER = g.ER || {};
  if (typeof require === 'function' && !ER.rng) { require('./rng.js'); require('./data.js'); }
  const { RULES, REGIONS, ENEMIES, CHESTS } = ER.data, R = ER.rng;
  const W = RULES.roomW, H = RULES.roomH;
  const DIRS = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] }, OPP = { N: 'S', S: 'N', E: 'W', W: 'E' };
  const DOOR = { N: [6, 0], S: [6, H - 1], W: [0, 4], E: [W - 1, 4] };
  const INSIDE = { N: [6, 1], S: [6, H - 2], W: [1, 4], E: [W - 2, 4] };
  const TEMPLATES = [
    [], [[3, 2], [9, 2], [3, 6], [9, 6]], [[5, 4], [7, 4]], [[4, 3], [4, 5], [8, 3], [8, 5]],
    [[3, 3], [4, 3], [8, 5], [9, 5]], [[6, 4]], [[3, 4], [9, 4], [6, 3]], [[4, 2], [8, 2], [4, 6], [8, 6], [6, 4]]
  ];
  const key = (x, y) => x + ',' + y;

  function layout(rs, count, wantLeaves) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const rooms = [{ id: 0, gx: 0, gy: 0, doors: {}, depth: 0 }], at = new Map([[key(0, 0), 0]]);
      let guard = 0;
      while (rooms.length < count && guard++ < 500) {
        // 가지가 너무 뭉치지 않도록 문이 3개 미만인 방에서만 뻗는다.
        const cands = rooms.filter(r => Object.keys(r.doors).length < (r.id === 0 ? 2 : 3));
        const parent = R.pick(rs, 'map', cands), d = R.pick(rs, 'map', Object.keys(DIRS));
        const nx = parent.gx + DIRS[d][0], ny = parent.gy + DIRS[d][1];
        if (at.has(key(nx, ny))) continue;
        const room = { id: rooms.length, gx: nx, gy: ny, doors: {}, depth: parent.depth + 1 };
        parent.doors[d] = { to: room.id }; room.doors[OPP[d]] = { to: parent.id };
        rooms.push(room); at.set(key(nx, ny), room.id);
      }
      if (rooms.length < count) continue;
      const leaves = rooms.filter(r => r.id !== 0 && Object.keys(r.doors).length === 1);
      const deepest = Math.max(...leaves.map(r => r.depth));
      if (leaves.length >= wantLeaves && deepest >= (count >= 9 ? 3 : 2)) return { rooms, at };
    }
    throw new Error('방 배치 실패');
  }

  function assignTypes(rs, region, rooms) {
    const free = new Set(rooms.map(r => r.id)); const set = (r, t) => { r.type = t; free.delete(r.id); };
    set(rooms[0], 'entry');
    const leaves = rooms.filter(r => r.id !== 0 && Object.keys(r.doors).length === 1).sort((a, b) => b.depth - a.depth || a.id - b.id);
    set(leaves[0], 'sanctum');
    const want = region.types.filter(t => t !== 'entry' && t !== 'sanctum');
    const leafTypes = want.filter(t => t === 'vault' || t === 'deep');
    leafTypes.forEach((t, i) => { const r = leaves[i + 1] || rooms.find(x => free.has(x.id)); if (r) set(r, t); });
    const rest = want.filter(t => !leafTypes.includes(t));
    // 보급실은 입구 곁, 쉼터는 중간 깊이에 둔다.
    const near = rooms.filter(r => free.has(r.id)).sort((a, b) => a.depth - b.depth || a.id - b.id);
    if (rest.includes('supply') && near[0]) { set(near[0], 'supply'); rest.splice(rest.indexOf('supply'), 1); }
    const others = R.shuffle(rs, 'map', rooms.filter(r => free.has(r.id)));
    for (const r of others) set(r, rest.length ? rest.shift() : R.pick(rs, 'map', region.extra));
    const p = rooms[leaves[0].doors[Object.keys(leaves[0].doors)[0]].to];
    for (const [d, door] of Object.entries(p.doors)) if (door.to === leaves[0].id) { door.sealed = true; leaves[0].doors[OPP[d]].sealed = true; }
  }

  function reachable(room, from, avoidHazard) {
    const seen = new Set([key(from[0], from[1])]), q = [from];
    const blocked = new Set(room.objects.filter(o => ER.map.blocks(o)).map(o => key(o.x, o.y)));
    while (q.length) {
      const [x, y] = q.shift();
      for (const [dx, dy] of Object.values(DIRS)) {
        const nx = x + dx, ny = y + dy, k = key(nx, ny), t = room.tiles[ny]?.[nx];
        if (seen.has(k) || !t || t === '#' || t === 'o' || (avoidHazard && t === 'h') || blocked.has(k)) continue;
        seen.add(k); q.push([nx, ny]);
      }
    }
    return seen;
  }
  function valid(room) {
    const doors = Object.keys(room.doors).map(d => INSIDE[d]);
    const seen = reachable(room, doors[0] || [6, 4], true);
    if (doors.some(d => !seen.has(key(d[0], d[1])))) return false;
    const near = (x, y) => Object.values(DIRS).some(([dx, dy]) => seen.has(key(x + dx, y + dy)));
    return room.objects.every(o => (ER.map.blocks(o) ? near(o.x, o.y) : seen.has(key(o.x, o.y)))) && room.enemies.every(e => seen.has(key(e.x, e.y)));
  }

  /* 방 구성: 무작위로 뿌리지 않고 "목표 지점 → 지키는 적 → 밀쳐 넣을 지형 → 입구 쪽의 흔한 재료" 순으로 짠다.
     - 목표 지점(anchor): 모든 문에서 가장 먼 벽가. 상자·봉인 장치·특산/광맥 재료가 모인다.
     - 경비(guard): 근접·정예는 목표 바로 앞, 사수·술사는 그 뒤에서 엄호한다. 목표물에는 guards(적 id)가 기록되어
       경비가 2칸 안에 살아 있는 동안 손댈 수 없다(run.js). 남는 근접 적 하나는 목표 반대편 통로를 순찰한다.
     - 보급실의 약탈자는 상자를 뒤지느라 방을 등지고 있다 → 기습 기회.
     - 위험 지형은 경비의 "방 가운데 반대쪽"에 둔다 → 정면에서 밀치면 빠진다. */
  /* 수제 방(content.js 의 rooms): 도구에서 그린 방을 그대로 쓴다. 문은 실제 연결에 맞춰 뚫는다.
     적 kind '@boss' 는 그 지역의 수호자로 바뀐다. guarded 인 소품은 post 인 적 전부가 지킨다. flip 이면 좌우·상하를 무작위로 뒤집는다. */
  const LEVEL = ER.data.RULES.level;
  const BLANK = () => Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => (x === 0 || y === 0 || x === W - 1 || y === H - 1 ? '#' : '.')).join(''));
  function lintRoom(hm, regionId) { // 도구와 생성기가 함께 쓰는 검사. error 가 있으면 생성기는 이 방을 쓰지 않는다.
    const out = [], err = m => out.push({ level: 'error', msg: m }), warn = m => out.push({ level: 'warn', msg: m });
    const regions = (regionId ? [regionId] : hm.regions?.length ? hm.regions : Object.keys(REGIONS)).filter(r => REGIONS[r]);
    if (!Array.isArray(hm.tiles) || hm.tiles.length !== H || hm.tiles.some(r => r.length !== W)) { err('타일은 ' + W + '×' + H + ' 이어야 한다'); return out; }
    const objs = hm.objects || [], foes = hm.enemies || [], occ = new Map();
    for (const u of objs.concat(foes)) { const k = key(u.x, u.y); if (hm.tiles[u.y]?.[u.x] !== '.') err((u.mat || u.kind || '?') + ' (' + k + '): 빈 바닥 위에 있어야 한다'); if (occ.has(k)) err('(' + k + ') 에 둘 이상 겹쳐 있다'); occ.set(k, u); }
    for (const [d, p] of Object.entries(INSIDE)) if (hm.tiles[p[1]][p[0]] !== '.' || occ.has(key(p[0], p[1]))) err('문 앞(' + d + ') 칸은 비워 둬야 한다');
    for (const r of regions) { const def = REGIONS[r].rooms_def[hm.type]; if (!def) { err(REGIONS[r].name + '에는 방 종류 ' + hm.type + ' 이(가) 없다'); continue; }
      if (!!def.device !== objs.some(o => o.kind === 'device')) err(REGIONS[r].name + ' ' + def.name + ': 봉인 장치는 ' + (def.device ? '꼭 있어야 한다' : '둘 수 없다') + '(봉인 수가 어긋난다)');
      for (const [mat, [cmin], [amin]] of def.nodes) { const need = cmin * amin, have = objs.filter(o => o.kind === 'node' && o.mat === mat).reduce((n, o) => n + (o.qty || 0), 0); if (have < need) err(REGIONS[r].name + ' ' + def.name + ': ' + ER.data.MATERIALS[mat].name + ' 공급이 모자란다(' + have + '/' + need + ') — 길드 투자 재료가 끊긴다'); } }
    if (hm.type === 'entry') { if (!objs.some(o => o.kind === 'portal')) err('입구 방에는 귀환문이 필요하다'); if (hm.tiles[5][6] !== '.' || occ.has('6,5')) err('입구 방의 시작 칸(6,5)은 비워 둬야 한다'); if (foes.length) err('입구 방에는 적을 둘 수 없다'); }
    else if (objs.some(o => o.kind === 'portal')) err('귀환문은 입구 방에만 둔다');
    if (hm.type === 'sanctum' && foes.filter(e => e.kind === '@boss').length !== 1) err('성소에는 @boss 가 정확히 하나 있어야 한다');
    if (hm.type !== 'sanctum' && foes.some(e => e.kind === '@boss' || ENEMIES[e.kind]?.boss)) err('수호자는 성소에만 둔다');
    for (const e of foes) { if (e.kind !== '@boss' && !ENEMIES[e.kind]) err('모르는 적: ' + e.kind); if (e.patrol && (e.patrol.length !== 2 || e.patrol.some(p => hm.tiles[p[1]]?.[p[0]] !== '.'))) err(e.kind + ': 순찰 끝점이 바닥이 아니다'); if (Object.values(INSIDE).some(p => Math.abs(p[0] - e.x) + Math.abs(p[1] - e.y) < 2)) warn(e.kind + ' (' + e.x + ',' + e.y + '): 문 바로 앞이라 들어서자마자 들킨다'); }
    for (const o of objs) { if (o.kind === 'node' && !ER.data.MATERIALS[o.mat]) err('모르는 재료: ' + o.mat); if (o.kind === 'chest' && !ER.data.CHESTS[o.chest]) err('모르는 상자: ' + o.chest);
      if (o.guarded) { const gs = foes.filter(e => e.post); if (!gs.length) err((o.mat || o.kind) + ': 경비 표시가 있는데 경비(post) 적이 없다'); else if (!gs.some(e => Math.abs(e.x - o.x) + Math.abs(e.y - o.y) <= LEVEL.guardRadius)) warn((o.mat || o.kind) + ' (' + o.x + ',' + o.y + '): ' + LEVEL.guardRadius + '칸 안에 경비가 없어 시작부터 풀려 있다'); }
      else if (foes.length && ['chest', 'device'].includes(o.kind)) warn(o.kind + ' (' + o.x + ',' + o.y + '): 적이 있는 방인데 지키는 이가 없다'); }
    if (!out.some(i => i.level === 'error')) { const probe = { doors: { N: 1, E: 1, S: 1, W: 1 }, tiles: hm.tiles.map((r, y) => r.split('').map((c, x) => (Object.values(DOOR).some(p => p[0] === x && p[1] === y) ? 'D' : c)).join('')), objects: objs, enemies: foes }; if (!valid(probe)) err('닿을 수 없는 문·소품·적이 있다'); }
    return out;
  }
  function applyRoom(rs, region, room, ids, hm) {
    if (lintRoom(hm, region.id).some(i => i.level === 'error')) return false;
    const fx = hm.flip && rs ? R.int(rs, 'map', 2) : 0, fy = hm.flip && rs ? R.int(rs, 'map', 2) : 0, X = x => (fx ? W - 1 - x : x), Y = y => (fy ? H - 1 - y : y);
    const grid = BLANK().map(r => r.split('')); for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) grid[Y(y)][X(x)] = hm.tiles[y][x] === '#' ? 'o' : hm.tiles[y][x];
    for (const d of Object.keys(room.doors)) grid[DOOR[d][1]][DOOR[d][0]] = 'D';
    room.tiles = grid.map(r => r.join('')); room.handmade = hm.id; if (hm.name) room.name = hm.name;
    room.enemies = (hm.enemies || []).map(src => { const e = makeEnemy(src.kind === '@boss' ? region.boss : src.kind, X(src.x), Y(src.y), ids); if (src.facing) e.facing = fx ? (src.facing === 'left' ? 'right' : 'left') : src.facing; if (src.patrol) e.patrol = { a: [X(src.patrol[0][0]), Y(src.patrol[0][1])], b: [X(src.patrol[1][0]), Y(src.patrol[1][1])], to: 'b' }; if (src.post) e.post = true; if (src.looting) e.looting = true; return e; });
    const guards = room.enemies.filter(e => e.post).map(e => e.id);
    room.objects = (hm.objects || []).map(src => { const o = { id: 'o' + (ids.n++), kind: src.kind, x: X(src.x), y: Y(src.y) }; if (src.kind === 'node') { o.mat = src.mat; o.qty = src.qty || 2; } if (src.kind === 'chest') { o.chest = src.chest || 'basic'; o.opened = false; } if (src.kind === 'device') o.on = false; if (src.kind === 'camp' || src.kind === 'altar') o.used = false; if (src.guarded && guards.length) o.guards = guards.slice(); return o; });
    return valid(room);
  }

  const RARE = new Set(['resin', 'coal', 'crystal', 'essence', 'moonshard']);
  function buildRoom(rs, region, room, ids, opts) {
    const def = region.rooms_def[room.type];
    room.name = def.name; room.danger = !!def.danger;
    const force = opts && opts.force && opts.force.type === room.type && !opts.forced ? opts.force : null;
    const pool = force ? [force] : (ER.CONTENT?.rooms || []).filter(r => !r.disabled && r.type === room.type && (!r.regions?.length || r.regions.includes(region.id)));
    if (pool.length && (force || R.next(rs, 'map') < LEVEL.handmade)) { let w = R.next(rs, 'map') * pool.reduce((n, r) => n + (r.weight || 1), 0), hm = pool[0]; for (const r of pool) { w -= r.weight || 1; if (w <= 0) { hm = r; break; } } if (applyRoom(rs, region, room, ids, hm)) { if (force) opts.forced = true; return; } delete room.handmade; room.name = def.name; }
    const doorsIn = Object.keys(room.doors).map(d => INSIDE[d]), md = (x, y, q) => Math.abs(q[0] - x) + Math.abs(q[1] - y);
    for (let attempt = 0; attempt < 60; attempt++) {
      const grid = []; for (let y = 0; y < H; y++) grid.push(Array.from({ length: W }, (_, x) => (x === 0 || y === 0 || x === W - 1 || y === H - 1 ? '#' : '.')));
      for (const d of Object.keys(room.doors)) grid[DOOR[d][1]][DOOR[d][0]] = 'D';
      const safe = room.type === 'entry' || room.type === 'shelter', simple = attempt > 40;
      const used = new Set(['6,5']); for (const q of doorsIn) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!dx || !dy) { used.add(key(q[0] + dx, q[1] + dy)); used.add(key(q[0] + dx * 2, q[1] + dy * 2)); } /* 실제로 있는 문 앞만 비운다 */
      const isFree = (x, y) => grid[y]?.[x] === '.' && !used.has(key(x, y)), claim = (x, y) => used.add(key(x, y));
      const edge = (x, y) => x === 1 || y === 1 || x === W - 2 || y === H - 2, doorDist = (x, y) => Math.min(...doorsIn.map(q => md(x, y, q)), 99);
      room.objects = []; room.enemies = [];
      const putAt = (o, x, y) => { o.x = x; o.y = y; o.id = 'o' + (ids.n++); room.objects.push(o); claim(x, y); return o; };
      const randomFree = pred => { for (let i = 0; i < 120; i++) { const x = 1 + R.int(rs, 'map', W - 2), y = 1 + R.int(rs, 'map', H - 2); if (isFree(x, y) && (!pred || pred(x, y))) return [x, y]; } return null; };
      // 1) 고정 소품과 목표 지점
      if (room.type === 'entry') putAt({ kind: 'portal' }, 6, 4);
      if (def.camp) putAt({ kind: 'camp', used: false }, 6, 4);
      const group = def.enemies.length ? R.pick(rs, 'map', def.enemies).slice() : [], boss = group.some(k => ENEMIES[k].boss);
      const edges = []; for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (edge(x, y) && isFree(x, y) && !((x === 1 || x === W - 2) && (y === 1 || y === H - 2))) edges.push([x, y, doorDist(x, y)]);
      edges.sort((p, q) => q[2] - p[2]); const top = edges.filter(e => e[2] >= edges[0][2] - 1), anchor = R.pick(rs, 'map', top.length ? top : edges);
      const inward = anchor[0] === 1 ? [1, 0] : anchor[0] === W - 2 ? [-1, 0] : anchor[1] === 1 ? [0, 1] : [0, -1], side = [inward[1], inward[0]];
      // 2) 기둥: 목표 지점 둘레 2칸은 비워 둔다. 성소는 돌진을 유도할 기둥을 최소 2개 둔다.
      const tpl = simple ? [] : R.pick(rs, 'map', TEMPLATES), flipX = R.int(rs, 'map', 2), flipY = R.int(rs, 'map', 2); let pillars = 0;
      for (const [px, py] of tpl) { const x = flipX ? W - 1 - px : px, y = flipY ? H - 1 - py : py; if (isFree(x, y) && md(x, y, anchor) > 2) { grid[y][x] = 'o'; pillars++; } }
      if (boss && !simple) for (const [x, y] of [[3, 2], [9, 6], [9, 2], [3, 6]]) if (pillars < 2 && isFree(x, y)) { grid[y][x] = 'o'; pillars++; }
      // 3) 목표물: 장치 → 상자 → 특산/광맥 재료를 목표 지점 벽가에 모은다.
      const nodes = []; for (const [mat, [cmin, cmax], [amin, amax]] of def.nodes) { const n = cmin + R.int(rs, 'map', cmax - cmin + 1); for (let i = 0; i < n; i++) nodes.push({ kind: 'node', mat, qty: amin + R.int(rs, 'map', amax - amin + 1) }); }
      const vein = /^mine/.test(room.type), prizes = [], common = [];
      if (def.device) prizes.push({ kind: 'device', on: false }); if (def.chest) prizes.push({ kind: 'chest', chest: def.chest, opened: false });
      for (const n of nodes) (group.length && (RARE.has(n.mat) || vein) ? prizes : common).push(n);
      const wallSpots = edges.filter(e => isFree(e[0], e[1])).sort((p, q) => md(p[0], p[1], anchor) - md(q[0], q[1], anchor)); let ok = true; const prizeObjs = [];
      for (const o of prizes) { const spot = wallSpots.find(e => isFree(e[0], e[1])); if (!spot) { ok = false; break; } prizeObjs.push(putAt(o, spot[0], spot[1])); }
      if (def.altar) { const q = randomFree((x, y) => edge(x, y)); if (q) putAt({ kind: 'altar', used: false }, q[0], q[1]); else ok = false; }
      if (!ok) continue;
      // 4) 적: 역할에 따라 선다.
      const guards = []; let patrolled = false; const melee = group.filter(k => ['melee', 'pack'].includes(ENEMIES[k].ai) && !ENEMIES[k].elite);
      const looting = room.type === 'supply' && prizeObjs.some(o => o.kind === 'chest');
      const near = (from, lo, hi, pref) => { const c = []; for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const d = md(x, y, from); if (isFree(x, y) && d >= lo && d <= hi) c.push([x, y, pref(x, y)]); } c.sort((p, q) => q[2] - p[2]); return c[0] || null; };
      for (const kind of group) {
        const d = ENEMIES[kind]; let spot = null, role = 'guard';
        if (d.boss) { spot = isFree(6, 4) ? [6, 4] : near([6, 4], 1, 2, () => 0); role = 'boss'; }
        else if (!prizeObjs.length) spot = randomFree((x, y) => doorDist(x, y) >= 4) || randomFree((x, y) => doorDist(x, y) >= 3);
        else if (!patrolled && melee.length >= 2 && kind === melee[melee.length - 1] && guards.length) { // 통로 순찰: 목표 반대편을 가로지른다
          const horiz = inward[0] !== 0, fixed = horiz ? (anchor[0] === 1 ? 8 : 4) : (anchor[1] === 1 ? 6 : 2), lane = [];
          for (let i = 2; i <= (horiz ? H : W) - 3; i++) { const x = horiz ? fixed : i, y = horiz ? i : fixed; if (isFree(x, y) && doorDist(x, y) >= LEVEL.patrolDoorDist) lane.push([x, y]); else if (lane.length >= 3) break; else lane.length = 0; }
          if (lane.length >= 3) { spot = lane[0]; role = { a: lane[0], b: lane[lane.length - 1], to: 'b' }; patrolled = true; }
        }
        if (!spot) { const target = prizeObjs[guards.length % Math.max(1, prizeObjs.length)] || { x: anchor[0], y: anchor[1] }, from = [target.x, target.y];
          spot = d.range ? near(from, 2, 3, (x, y) => doorDist(x, y) * 2 - Math.abs(md(x, y, from) - 3)) : near(from, 1, 2, (x, y) => -md(x, y, [from[0] + inward[0] * (d.elite ? 1 : 2), from[1] + inward[1] * (d.elite ? 1 : 2)]));
          if (!spot) spot = randomFree((x, y) => doorDist(x, y) >= 3); }
        if (!spot) { ok = false; break; }
        claim(spot[0], spot[1]); const e = makeEnemy(kind, spot[0], spot[1], ids); room.enemies.push(e);
        if (typeof role === 'object') e.patrol = role; else if (role === 'guard' && prizeObjs.length) { guards.push(e); e.post = true;
          if (looting && !d.range) { const c = prizeObjs.find(o => o.kind === 'chest'); e.facing = c.x < e.x ? 'left' : c.x > e.x ? 'right' : (anchor[0] < 6 ? 'left' : 'right'); e.looting = true; } // 상자 쪽을 본다
          else e.facing = e.x < 6 ? 'right' : 'left'; }
      }
      if (!ok) continue;
      for (const o of prizeObjs) if (guards.length) o.guards = guards.map(e => e.id);
      // 5) 위험 지형: 경비의 "방 가운데 반대쪽" 칸. 없는 방은 통로 한가운데에 작은 덩어리 하나.
      if (!safe && !simple) { let placed = 0;
        for (const e of room.enemies) for (const [dx, dy] of [[-inward[0], -inward[1]], side, [-side[0], -side[1]]]) { const x = e.x + dx, y = e.y + dy; if (placed < LEVEL.hazardMax && isFree(x, y) && md(x, y, [6, 4]) >= md(e.x, e.y, [6, 4]) && !prizeObjs.some(o => md(x, y, [o.x, o.y]) === 1)) { grid[y][x] = 'h'; claim(x, y); placed++; } }
        if (placed < 2) { const q = randomFree((x, y) => !edge(x, y) && doorDist(x, y) >= 2); if (q) { grid[q[1]][q[0]] = 'h'; claim(q[0], q[1]); const [dx, dy] = R.pick(rs, 'map', Object.values(DIRS)); if (isFree(q[0] + dx, q[1] + dy)) { grid[q[1] + dy][q[0] + dx] = 'h'; claim(q[0] + dx, q[1] + dy); } } }
      }
      // 6) 흔한 재료: 입구 쪽 벽가(목표 지점에서 먼 곳)
      for (const n of common) { const c = edges.filter(e => isFree(e[0], e[1]) && !room.objects.some(o => md(e[0], e[1], [o.x, o.y]) === 1)).sort((p, q) => md(q[0], q[1], anchor) - md(p[0], p[1], anchor)); const pickFrom = c.slice(0, Math.max(1, Math.ceil(c.length / 3))), q = pickFrom.length ? R.pick(rs, 'map', pickFrom) : null; if (!q) { ok = false; break; } putAt(n, q[0], q[1]); }
      if (!ok) continue;
      room.tiles = grid.map(r => r.join(''));
      if (valid(room)) return;
    }
    throw new Error('방 생성 실패: ' + room.type);
  }

  function makeEnemy(kind, x, y, ids, rs, grid) {
    const d = ENEMIES[kind];
    const e = { id: 'e' + (ids.n++), kind, x, y, hp: d.hp, maxHp: d.hp, armor: d.armor || 0, state: 'idle', facing: x < 6 ? 'right' : 'left' /* 방 가운데를 바라본다 */, st: {}, intent: null, step: 0 };
    // 근접 적 일부는 두 지점을 오가며 순찰한다(탐사 중 내 2걸음마다 1걸음).
    if (rs && grid && (d.ai === 'melee' || d.ai === 'pack') && R.int(rs, 'map', 2) === 0) {
      const dir = R.pick(rs, 'map', [[1, 0], [-1, 0], [0, 1], [0, -1]]); let len = 0, cx = x, cy = y;
      while (len < 3 && grid[cy + dir[1]]?.[cx + dir[0]] === '.') { cx += dir[0]; cy += dir[1]; len++; }
      if (len >= 2) e.patrol = { a: [x, y], b: [cx, cy], to: 'b' };
    }
    return e;
  }

  function generate(regionId, rs, opts = {}) {
    const region = REGIONS[regionId]; if (!region) throw new Error('알 수 없는 지역');
    const leafNeed = region.types.filter(t => t === 'vault' || t === 'deep').length + 1;
    const { rooms, at } = layout(rs, region.rooms, Math.min(leafNeed, 2));
    assignTypes(rs, region, rooms);
    if (region.rank >= 2) { // 고리 1개: 성소를 제외한 이웃 방끼리 잇는다.
      const pairs = [];
      for (const r of rooms) for (const [d, [dx, dy]] of Object.entries(DIRS)) { const o = at.get(key(r.gx + dx, r.gy + dy)); if (o != null && o > r.id && !r.doors[d] && r.type !== 'sanctum' && rooms[o].type !== 'sanctum') pairs.push([r, d, rooms[o]]); }
      if (pairs.length) { const [a, d, b] = R.pick(rs, 'map', pairs); a.doors[d] = { to: b.id }; b.doors[OPP[d]] = { to: a.id }; }
    }
    const ids = { n: 1 };
    for (const room of rooms) { buildRoom(rs, region, room, ids, opts); room.seen = new Array(W * H).fill(0); room.visited = false; room.known = room.type === 'entry' || (opts.knowSanctum && room.type === 'sanctum'); }
    return { rooms, nextId: ids.n, devices: rooms.reduce((n, r) => n + r.objects.filter(o => o.kind === 'device').length, 0) };
  }

  ER.map = { W, H, DIRS, OPP, DOOR, INSIDE, generate, makeEnemy, reachable, valid, key, lintRoom, applyRoom, blank: BLANK,
    blocks: o => o.kind !== 'pile' && o.kind !== 'trap' };
  if (typeof module === 'object') module.exports = ER;
})(typeof globalThis !== 'undefined' ? globalThis : this);
