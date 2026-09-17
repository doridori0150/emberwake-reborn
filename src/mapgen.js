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
  const KEEP_CLEAR = new Set(['6,1', '6,2', '6,6', '6,7', '1,4', '2,4', '10,4', '11,4', '5,1', '7,1', '5,7', '7,7', '1,3', '1,5', '11,3', '11,5', '6,5']); // 6,5 = 입구 방의 시작 칸
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

  function buildRoom(rs, region, room, ids) {
    const def = region.rooms_def[room.type];
    room.name = def.name; room.danger = !!def.danger;
    for (let attempt = 0; attempt < 40; attempt++) {
      const grid = []; for (let y = 0; y < H; y++) grid.push(Array.from({ length: W }, (_, x) => (x === 0 || y === 0 || x === W - 1 || y === H - 1 ? '#' : '.')));
      for (const d of Object.keys(room.doors)) grid[DOOR[d][1]][DOOR[d][0]] = 'D';
      const safe = room.type === 'entry' || room.type === 'shelter';
      const tpl = attempt > 30 ? [] : R.pick(rs, 'map', TEMPLATES), flipX = R.int(rs, 'map', 2), flipY = R.int(rs, 'map', 2);
      for (const [px, py] of tpl) { const x = flipX ? W - 1 - px : px, y = flipY ? H - 1 - py : py; if (!KEEP_CLEAR.has(key(x, y))) grid[y][x] = 'o'; }
      const used = new Set(KEEP_CLEAR);
      const freeTile = (pred) => { for (let i = 0; i < 80; i++) { const x = 1 + R.int(rs, 'map', W - 2), y = 1 + R.int(rs, 'map', H - 2); if (grid[y][x] === '.' && !used.has(key(x, y)) && (!pred || pred(x, y))) return [x, y]; } return null; };
      const claim = (x, y, pad) => { used.add(key(x, y)); if (pad) for (const [dx, dy] of Object.values(DIRS)) used.add(key(x + dx, y + dy)); };
      if (!safe && attempt < 30) { // 위험 지형: 2~3칸 덩어리 1~2개
        const clusters = 1 + R.int(rs, 'map', 2);
        for (let c = 0; c < clusters; c++) { const s = freeTile(); if (!s) break; grid[s[1]][s[0]] = 'h'; claim(s[0], s[1]); const [dx, dy] = R.pick(rs, 'map', Object.values(DIRS)); const x2 = s[0] + dx, y2 = s[1] + dy; if (grid[y2]?.[x2] === '.' && !used.has(key(x2, y2))) { grid[y2][x2] = 'h'; claim(x2, y2); } }
      }
      room.tiles = grid.map(r => r.join('')); room.objects = []; room.enemies = [];
      const put = (o, pred, pad = true) => { const p = o.x != null ? [o.x, o.y] : freeTile(pred); if (!p) return false; if (o.x != null && grid[p[1]][p[0]] !== '.') { room.tiles = null; return false; } o.x = p[0]; o.y = p[1]; o.id = 'o' + (ids.n++); room.objects.push(o); claim(p[0], p[1], pad); return true; };
      const edge = (x, y) => x === 1 || y === 1 || x === W - 2 || y === H - 2;
      let ok = true;
      if (room.type === 'entry') ok = put({ kind: 'portal', x: 6, y: 4 }) && ok;
      if (def.camp) ok = put({ kind: 'camp', x: 6, y: 4, used: false }) && ok;
      if (def.device) ok = put({ kind: 'device', on: false }) && ok;
      if (def.altar) ok = put({ kind: 'altar', used: false }) && ok;
      if (def.chest) ok = put({ kind: 'chest', chest: def.chest, opened: false }, edge) && ok;
      for (const [mat, [cmin, cmax], [amin, amax]] of def.nodes) { const n = cmin + R.int(rs, 'map', cmax - cmin + 1); for (let i = 0; i < n; i++) ok = put({ kind: 'node', mat, qty: amin + R.int(rs, 'map', amax - amin + 1) }, edge) && ok; }
      if (!ok || !room.tiles) continue;
      const group = def.enemies.length ? R.pick(rs, 'map', def.enemies) : [];
      const doors = Object.keys(room.doors).map(d => INSIDE[d]);
      for (const kind of group) {
        const boss = ENEMIES[kind].boss;
        const p = boss && grid[4][6] === '.' && !used.has('6,4') ? [6, 4] : freeTile((x, y) => doors.every(d => Math.abs(d[0] - x) + Math.abs(d[1] - y) >= 4));
        const q = p || freeTile((x, y) => doors.every(d => Math.abs(d[0] - x) + Math.abs(d[1] - y) >= 3));
        if (!q) { ok = false; break; }
        claim(q[0], q[1]); room.enemies.push(makeEnemy(kind, q[0], q[1], ids, rs, grid));
      }
      if (ok && valid(room)) return;
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
    for (const room of rooms) { buildRoom(rs, region, room, ids); room.seen = new Array(W * H).fill(0); room.visited = false; room.known = room.type === 'entry' || (opts.knowSanctum && room.type === 'sanctum'); }
    return { rooms, nextId: ids.n, devices: rooms.reduce((n, r) => n + r.objects.filter(o => o.kind === 'device').length, 0) };
  }

  ER.map = { W, H, DIRS, OPP, DOOR, INSIDE, generate, makeEnemy, reachable, valid, key,
    blocks: o => o.kind !== 'pile' && o.kind !== 'trap' };
  if (typeof module === 'object') module.exports = ER;
})(typeof globalThis !== 'undefined' ? globalThis : this);
