/* 길드 안뜰 화면. 선택한 대원(아바타)이 안뜰을 직접 걸어 다니며 시설 곁에서 상호작용한다(WASD/클릭 이동, E 열기).
   시설 바로가기 버튼과 시설 클릭(걸어가서 열기)도 함께 제공한다.
    폐허에서 시작해 시설 단계·총 복구도에 따라 설비·조명·장식·대원의 모습이 달라진다.
   판정 영역은 실제로 그려진 스프라이트 크기이며, 강조는 외곽 발광과 발밑 이름표로 한다. */
(function (g) {
  'use strict';
  const ER = g.ER, D = ER.data, G = ER.guild, gfx = ER.gfx, T = 64, CW = 1024, CH = 640;
  const SPOTS = { workshop: [3.3, 5.3], stash: [12.7, 5.3], barracks: [3.5, 9.0], observatory: [12.5, 9.0], board: [8, 6.4], gate: [8, 2.75] };
  const STAGE = ['폐허', '불씨가 돌아온 안뜰', '다시 열린 길드', '북적이는 길드', '재건된 잿불 길드'];
  function rnd(seed) { let s = seed; return () => ((s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x297a2d39 >>> 0) / 4294967296); }

  class GuildView {
    constructor(canvas, onPick) { this.cv = canvas; this.ctx = canvas.getContext('2d'); this.G = null; this.hover = null; this.rects = {}; this.onPick = onPick; this.pulse = {};
      canvas.addEventListener('mousemove', e => { this.hover = this.pick(e); canvas.style.cursor = this.hover ? 'pointer' : 'default'; });
      canvas.addEventListener('mouseleave', () => { this.hover = null; });
      canvas.addEventListener('click', e => { const id = this.pick(e); if (id) return this.goTo(id); const r = this.cv.getBoundingClientRect(); this.moveTo(Math.floor((e.clientX - r.left) / r.width * 16), Math.floor((e.clientY - r.top) / r.height * 10)); });
      this.av = { x: 7, y: 4, px: 7, py: 4, path: [], dir: 'down', then: null, t0: 0 }; this.last = performance.now();
      const loop = () => { if (this.G && !canvas.closest('[hidden]')) this.draw(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
    setState(Gs) { this.G = Gs; if (this.blocked().has(this.av.x + ',' + this.av.y)) { this.av.x = this.av.px = 7; this.av.y = this.av.py = 4; this.av.path = []; } }
    // 시설·소품·다른 대원이 차지한 칸. 그림 크기에 맞춘 고정 부지다.
    zones() { const Gs = this.G, total = this.total(), rect = (x0, x1, y0, y1) => { const o = []; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) o.push(x + ',' + y); return o; };
      const z = { gate: rect(7, 8, 2, 2), board: rect(7, 8, 5, 6), workshop: rect(1, 5, 3, 5), stash: rect(11, 14, 3, 5), barracks: rect(2, 4, 7, 8), observatory: rect(11, 13, 7, 8) };
      const extra = ['6,3', '9,3']; if (total >= 3) extra.push('7,9', '8,9'); if (total >= 7) extra.push(...rect(7, 8, 7, 8));
      for (const [h, p] of Object.entries(this.posts())) if (Gs.roster.includes(h) && h !== Gs.selected.hero) extra.push(Math.floor(p[0]) + ',' + Math.floor(p[1] - 0.01));
      return { z, extra }; }
    posts() { return { ara: [6.9, 4.2, 'down'], noa: this.G.facilities.workshop ? [5.6, 6.6, 'left'] : [9.6, 4.6, 'down'], lumi: [10.6, 9.0, 'right'] }; }
    blocked() { const { z, extra } = this.zones(), s = new Set(extra); for (const t of Object.values(z)) t.forEach(k => s.add(k)); return s; }
    walkable(x, y, b) { return x >= 1 && x <= 14 && y >= 3 && y <= 9 && !b.has(x + ',' + y); }
    usable(id) { return id === 'gate' || id === 'board' || (D.FACILITIES[id] && G.facilityVisible(this.G, id)); }
    // 아바타 곁(대각선 포함 1칸)에 있는 상호작용 대상
    near() { const { z } = this.zones(), a = this.av; let best = null; for (const [id, tiles] of Object.entries(z)) { if (!this.usable(id)) continue; for (const k of tiles) { const [x, y] = k.split(',').map(Number), d = Math.max(Math.abs(x - a.x), Math.abs(y - a.y)); if (d <= 1 && (!best || d < best.d)) best = { id, d }; } } return best?.id || null; }
    bfs(goal) { const b = this.blocked(), a = this.av, start = a.x + ',' + a.y, prev = new Map([[start, null]]), q = [[a.x, a.y]]; while (q.length) { const [x, y] = q.shift(); if (goal(x, y)) { const out = []; let k = x + ',' + y; while (prev.get(k) !== null) { out.unshift(k.split(',').map(Number)); k = prev.get(k); } return out; } for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) { const nx = x + dx, ny = y + dy, k = nx + ',' + ny; if (!prev.has(k) && this.walkable(nx, ny, b)) { prev.set(k, x + ',' + y); q.push([nx, ny]); } } } return null; }
    moveTo(tx, ty) { const p = this.bfs((x, y) => x === tx && y === ty); if (p) { this.av.path = p; this.av.then = null; } }
    goTo(id) { if (!this.usable(id)) return; if (this.near() === id && !this.av.path.length) return this.onPick(id); const tiles = new Set(this.zones().z[id]), p = this.bfs((x, y) => [...tiles].some(k => { const [a, b] = k.split(',').map(Number); return Math.max(Math.abs(a - x), Math.abs(b - y)) <= 1; })); if (p) { this.av.path = p; this.av.then = id; if (!p.length) this.onPick(id); } else this.onPick(id); }
    step(dir) { const v = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir], a = this.av; a.dir = dir; if (a.path.length) return; if (this.walkable(a.x + v[0], a.y + v[1], this.blocked())) { a.path = [[a.x + v[0], a.y + v[1]]]; a.then = null; } }
    interact() { const id = this.near(); if (id) this.onPick(id); return !!id; }
    tick(now) { const a = this.av, dt = Math.min(0.05, (now - this.last) / 1000); this.last = now; if (!a.path.length) return; const [tx, ty] = a.path[0], sp = 6.5 * dt, dx = tx - a.px, dy = ty - a.py, d = Math.hypot(dx, dy); a.dir = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down'); if (d <= sp) { a.px = a.x = tx; a.py = a.y = ty; a.path.shift(); if (!a.path.length && a.then) { const id = a.then; a.then = null; this.onPick(id); } } else { a.px += dx / d * sp; a.py += dy / d * sp; } }
    celebrate(id) { this.pulse[id] = performance.now(); }
    total() { return Object.values(this.G.facilities).reduce((a, b) => a + b, 0); }
    stageName() { const t = this.total(); return STAGE[t === 0 ? 0 : Math.min(STAGE.length - 1, 1 + Math.floor((t - 1) / 3))]; }
    pick(e) { const r = this.cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * CW, y = (e.clientY - r.top) / r.height * CH; let best = null; for (const [id, b] of Object.entries(this.rects)) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h && (!best || b.y + b.h > this.rects[best].y + this.rects[best].h)) best = id; return best; }
    assetFor(id) { const lv = this.G.facilities[id]; if (id === 'workshop') return 'facility.workshop.' + Math.min(3, lv); return 'facility.' + id + '.' + Math.min(2, lv); }

    draw() {
      const ctx = this.ctx, Gs = this.G, now = performance.now(), total = this.total(); ctx.imageSmoothingEnabled = false; this.rects = {}; this.tick(now);
      for (let y = 0; y < 10; y++) for (let x = 0; x < 16; x++) { if (y < 2 || x === 0 || x === 15) { gfx.frame(ctx, 'tiles.labyrinth', 'wall.verdant', x * T, y * T, T, T); if (y >= 2) { ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(x * T, y * T, T, T); } } else { gfx.frame(ctx, 'tiles.labyrinth', total >= 6 ? 'floor.cobble' : 'floor.verdant', x * T, y * T, T, T); if ((x + y) % 2) { ctx.fillStyle = 'rgba(0,0,0,.06)'; ctx.fillRect(x * T, y * T, T, T); } } }
      // 폐허의 흔적: 복구될수록 잡초와 잔해가 줄어든다.
      const r = rnd(7); for (let i = 0; i < 26; i++) { const x = 80 + r() * (CW - 160), y = 170 + r() * (CH - 220), kind = r(); if (i >= 26 - total * 2.2) continue; if (kind < 0.6) { ctx.strokeStyle = '#5f7a3a'; ctx.lineWidth = 2; ctx.beginPath(); for (let k = -2; k <= 2; k++) { ctx.moveTo(x, y); ctx.lineTo(x + k * 5, y - 12 - Math.abs(k) * -2); } ctx.stroke(); } else { ctx.fillStyle = '#3c3a36'; ctx.beginPath(); ctx.ellipse(x, y, 12 + r() * 10, 6, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#55524b'; ctx.fillRect(x - 6, y - 8, 9, 7); } }
      if (total >= 5) gfx.drawFit(ctx, 'decor.rug', 8 * T, 4.6 * T, 150, 90);
      const items = [];
      const add = (id, asset, cx, by, maxW, maxH, opt = {}) => items.push({ id, asset, cx, by, maxW, maxH, opt });
      // 출격 문과 회관 벽 장식
      add('gate', 'prop.gate', SPOTS.gate[0] * T, SPOTS.gate[1] * T, 130, 150);
      if (total >= 2) { add(null, 'decor.banner', 5.2 * T, 2.2 * T, 60, 110); add(null, 'decor.banner', 10.8 * T, 2.2 * T, 60, 110); }
      add(null, 'decor.lamp', 6.3 * T, 3.3 * T, 40, 70, { lit: total >= 1 }); add(null, 'decor.lamp', 9.7 * T, 3.3 * T, 40, 70, { lit: total >= 1 });
      if (total >= 3) { add(null, 'decor.plant', 1.6 * T, 3.2 * T, 50, 60); add(null, 'decor.plant', 14.4 * T, 3.2 * T, 50, 60); add(null, 'decor.bench', 8 * T, 9.3 * T, 110, 50); }
      if (total >= 7) add(null, 'decor.fountain', 8 * T, 8.4 * T, 130, 110);
      add('board', 'facility.board', SPOTS.board[0] * T, SPOTS.board[1] * T, 120, 90);
      for (const id of Object.keys(D.FACILITIES)) { const [sx, sy] = SPOTS[id], lv = Gs.facilities[id]; if (!G.facilityVisible(Gs, id)) { items.push({ ruin: true, hidden: true, cx: sx * T, by: sy * T }); continue; } if (lv === 0) { items.push({ id, ruin: true, cx: sx * T, by: sy * T }); continue; } add(id, this.assetFor(id), sx * T, sy * T, id === 'workshop' ? 250 : 190, 190); if (lv >= 3 || (lv >= 2 && id !== 'workshop')) add(null, 'facility.' + (id === 'workshop' ? 'barracks' : id) + '.extra', sx * T + (sx < 8 ? 130 : -130), sy * T, 70, 90); if (lv >= 2) add(null, 'decor.lamp', sx * T + (sx < 8 ? -120 : 120), sy * T, 36, 64, { lit: true }); }
      // 대원: 맡은 자리 근처에 서 있다.
      const posts = this.posts();
      for (const h of Gs.roster) { if (h === Gs.selected.hero) continue; const [x, y, dir] = posts[h]; items.push({ hero: h, cx: x * T, by: y * T, dir }); }
      items.push({ hero: Gs.selected.hero, avatar: true, cx: (this.av.px + 0.5) * T, by: (this.av.py + 0.86) * T, dir: this.av.dir, walking: this.av.path.length > 0 });
      if (this.av.path.length) { const end = this.av.path[this.av.path.length - 1]; ctx.strokeStyle = 'rgba(95,201,184,.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse((end[0] + 0.5) * T, (end[1] + 0.8) * T, 16, 6, 0, 0, 7); ctx.stroke(); }
      items.sort((a, b) => a.by - b.by);
      for (const it of items) {
        if (it.hero) { const a = gfx.asset(D.HEROES[it.hero].asset), work = !it.avatar && it.hero === 'noa' && Gs.facilities.workshop && (now % 3200) < 330, frame = gfx.actorFrame(a, it.walking ? 'walk' : work ? 'attack' : 'idle', it.dir, work ? now % 3200 : now); ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(it.cx, it.by, 20, 7, 0, 0, 7); ctx.fill(); gfx.sprite(ctx, D.HEROES[it.hero].asset, frame, it.cx, it.by - Math.sin(now / 450 + it.cx) * 1.2, 56); if (it.avatar) { ctx.strokeStyle = 'rgba(95,201,184,.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(it.cx, it.by, 24, 9, 0, 0, 7); ctx.stroke(); this.tag(ctx, it.cx, it.by + 20, D.HEROES[it.hero].name, '#5fc9b8'); } else this.tag(ctx, it.cx, it.by + 18, D.HEROES[it.hero].name, '#9aa3a6'); continue; }
        if (it.ruin) { this.ruin(ctx, it, now); continue; }
        const im = gfx.image(it.asset); if (!im) continue; const s = Math.min(it.maxW / im.width, it.maxH / im.height), w = im.width * s, h = im.height * s, x = it.cx - w / 2, y = it.by - h;
        ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(it.cx, it.by - 4, w * 0.45, 10, 0, 0, 7); ctx.fill();
        const hot = it.id && this.hover === it.id, p = it.id && this.pulse[it.id] && now - this.pulse[it.id] < 1600;
        ctx.save(); if (hot || p) { ctx.shadowColor = p ? '#ffe27a' : '#f0a545'; ctx.shadowBlur = p ? 30 + 20 * Math.sin(now / 80) : 18; } if (it.opt.lit === false) ctx.filter = 'grayscale(1) brightness(.55)'; ctx.drawImage(im, x, y, w, h); ctx.restore();
        if (it.opt.lit) { const gl = ctx.createRadialGradient(it.cx, y + 16, 2, it.cx, y + 16, 90); gl.addColorStop(0, 'rgba(255,190,90,.35)'); gl.addColorStop(1, 'rgba(255,190,90,0)'); ctx.fillStyle = gl; ctx.fillRect(it.cx - 90, y - 74, 180, 180); }
        if (it.id) { this.rects[it.id] = { x, y, w, h }; this.nameplate(ctx, it, now); }
      }
      // 어둠: 복구될수록 걷힌다. 불 켜진 곳은 밝다.
      const dark = Math.max(0.04, 0.5 - total * 0.05); ctx.fillStyle = 'rgba(6,8,14,' + dark + ')'; ctx.fillRect(0, 0, CW, CH);
      { const n = this.near(); if (n && !this.av.path.length) { const tiles = this.zones().z[n].map(k => k.split(',').map(Number)), cx = (Math.min(...tiles.map(t => t[0])) + Math.max(...tiles.map(t => t[0])) + 1) / 2 * T, top = Math.min(...tiles.map(t => t[1])) * T; this.tag(ctx, cx, Math.max(40, top - 34 + Math.sin(now / 300) * 3), 'E · ' + (n === 'gate' ? '원정 준비' : n === 'board' ? '의뢰 게시판 보기' : D.FACILITIES[n].name + ' 열기'), '#20140a', '#ffe27a'); } }
      if (this.hover && this.rects[this.hover]) { /* 호버한 시설은 어둠 위에서도 이름표가 또렷하게 보이도록 다시 그린다 */ const it = items.find(i => i.id === this.hover); if (it) this.nameplate(ctx, it, now, true); }
    }
    ruin(ctx, it, now) {
      const { cx, by } = it; ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(cx, by - 4, 80, 14, 0, 0, 7); ctx.fill();
      ctx.save(); ctx.filter = 'grayscale(.9) brightness(.5)'; gfx.drawFit(ctx, 'decor.crate', cx - 34, by, 60, 60); gfx.drawFit(ctx, 'decor.bench', cx + 30, by - 2, 80, 40); ctx.restore();
      ctx.strokeStyle = '#4a4339'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(cx - 70, by - 6); ctx.lineTo(cx - 20, by - 60); ctx.moveTo(cx + 66, by - 8); ctx.lineTo(cx + 30, by - 50); ctx.stroke();
      if (it.hidden) return; const hot = this.hover === it.id; if (hot) { ctx.strokeStyle = '#f0a545'; ctx.lineWidth = 2; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.ellipse(cx, by - 8, 96, 26, 0, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
      this.rects[it.id] = { x: cx - 90, y: by - 80, w: 180, h: 90 }; this.nameplate(ctx, it, now);
    }
    nameplate(ctx, it, now, force) {
      const Gs = this.G, id = it.id; let text, color = '#e9e4d8', can = false;
      if (id === 'gate') { text = '원정의 문'; color = '#ffe27a'; } else if (id === 'board') { const open = Object.keys(D.QUESTS).filter(q => G.questVisible(Gs, q) && !Gs.quests[q]); can = open.some(q => G.target(Gs, { kind: 'quest', id: q }).can); text = '의뢰 게시판' + (open.length ? ' · ' + open.length : ''); }
      else { const f = D.FACILITIES[id], lv = Gs.facilities[id], t = G.target(Gs, { kind: 'facility', id }); can = t.can; text = f.name + (lv ? ' ' + lv + '단계' : ' (폐허)'); if (!lv) color = '#c9b79a'; }
      this.tag(ctx, it.cx, it.by + 18, text, this.hover === id || force ? '#ffe27a' : color);
      if (can) { const b = Math.sin(now / 250) * 4; this.tag(ctx, it.cx, it.by - (it.ruin ? 96 : it.maxH) - 8 + b, id === 'board' ? '▲ 납품 가능' : '▲ 복구·강화 가능', '#20140a', '#f0a545'); }
    }
    tag(ctx, x, y, text, color, bg) { ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; const w = ctx.measureText(text).width + 14; ctx.fillStyle = bg || 'rgba(8,10,12,.82)'; ctx.beginPath(); ctx.roundRect(x - w / 2, y - 15, w, 21, 7); ctx.fill(); ctx.fillStyle = color; ctx.fillText(text, x, y); }
  }
  ER.GuildView = GuildView;
})(typeof globalThis !== 'undefined' ? globalThis : this);
