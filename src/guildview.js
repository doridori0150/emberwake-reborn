/* 마을 화면(로비). 선택한 대원이 카메라가 따라오는 넓은 마을을 걸어 다니며 주민에게 말을 건다(WASD/클릭 이동, E 말 걸기).
   - 배치는 data.TOWN, 주민은 data.NPCS(content.js 의 npcs 로 덮어씀). 시설은 그 앞의 주민에게 말을 걸어 연다. 시설 그림을 눌러도 주민에게 걸어간다.
   - 폐허에서 시작해 복구도에 따라 길·조명·장식·행인이 늘어난다. 장사를 마친 날은 해 질 녘이 된다(guild.dayPhase).
   - onPick(id): 'gate' | 'board' | 'npc:<id>'. 판정 영역은 실제로 그려진 크기다. */
(function (g) {
  'use strict';
  const ER = g.ER,
    D = ER.data,
    G = ER.guild,
    gfx = ER.gfx,
    T = 64,
    CW = 1024,
    CH = 640,
    TOWN = D.TOWN,
    TW = TOWN.w,
    TH = TOWN.h;
  const STAGE = ['폐허', '불씨가 돌아온 마을', '다시 열린 길드', '북적이는 마을', '재건된 잿불 마을'];
  function rnd(seed) {
    let s = seed;
    return () => (s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x297a2d39) >>> 0) / 4294967296;
  }
  const rectTiles = ([x0, x1, y0, y1]) => {
    const o = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) o.push(x + ',' + y);
    return o;
  };
  const ROAD = new Set(TOWN.roads.flatMap(rectTiles));
  const VILLAGER_TINTS = [
    'hue-rotate(40deg) saturate(.7)',
    'hue-rotate(150deg) saturate(.6) brightness(1.1)',
    'hue-rotate(260deg) saturate(.7)',
    'sepia(.6) brightness(1.05)',
    'hue-rotate(-60deg) saturate(.8)'
  ];

  class GuildView {
    constructor(canvas, onPick) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.G = null;
      this.hover = null;
      this.rects = {};
      this.onPick = onPick;
      this.pulse = {};
      this.cam = { x: 0, y: 0 };
      this.villagers = [];
      canvas.addEventListener('mousemove', e => {
        const [wx, wy] = this.world(e);
        this.hoverTile = [Math.floor(wx / T), Math.floor(wy / T)];
        this.hover = this.pick(e);
        canvas.style.cursor = this.hover ? 'pointer' : 'default';
      });
      canvas.addEventListener('mouseleave', () => {
        this.hover = null;
      });
      canvas.addEventListener('click', e => {
        if (this.build) return this.buildClick(e);
        const id = this.pick(e);
        if (id) return this.goTo(id);
        const [wx, wy] = this.world(e);
        this.moveTo(Math.floor(wx / T), Math.floor(wy / T));
      });
      this.av = { x: TOWN.start[0], y: TOWN.start[1], px: TOWN.start[0], py: TOWN.start[1], path: [], dir: 'down', then: null };
      this.last = performance.now();
      const loop = () => {
        if (this.G && !canvas.closest('[hidden]')) this.draw();
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
    setState(Gs) {
      this.G = Gs;
      G.ensure(Gs);
      if (this.blocked().has(this.av.x + ',' + this.av.y)) {
        this.av.x = this.av.px = TOWN.start[0];
        this.av.y = this.av.py = TOWN.start[1];
        this.av.path = [];
      }
    }
    world(e) {
      const r = this.cv.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * CW + this.cam.x, ((e.clientY - r.top) / r.height) * CH + this.cam.y];
    }
    total() {
      return Object.values(this.G.facilities).reduce((a, b) => a + b, 0);
    }
    stageName() {
      const t = this.total();
      return STAGE[t === 0 ? 0 : Math.min(STAGE.length - 1, 1 + Math.floor((t - 1) / 3))];
    }
    // 지금 마을에 나와 있는 주민: 시설 담당은 그 시설이 보일 때부터, 다른 대원은 문 근처에 서 있다.
    // 시설 부지·발밑 기준점은 저장된 배치(G.layout)를 따른다(guild.zoneOf / spotOf). 문은 고정.
    zone(id) {
      return G.zoneOf(this.G, id);
    }
    spot(id) {
      return G.spotOf(this.G, id);
    }
    npcs() {
      const Gs = this.G,
        out = [];
      for (const [id, n] of Object.entries(D.NPCS)) {
        if (n.hidden || (n.role && !G.facilityVisible(Gs, n.role)) || (n.flag && !Gs.evFlags?.[n.flag])) continue;
        const q = Object.assign({ id }, n);
        if (n.role && TOWN.places[n.role]) {
          // 시설 담당 주민은 시설이 옮겨진 만큼 따라간다(기본 부지 기준 상대 위치)
          const base = TOWN.places[n.role].zone,
            z = this.zone(n.role);
          q.x = n.x - base[0] + z[0];
          q.y = n.y - base[2] + z[2];
        }
        out.push(q);
      }
      const posts = { ara: [13, 4, 'right'], noa: [17, 4, 'left'], lumi: [18, 6, 'left'] };
      for (const h of Gs.roster)
        if (h !== Gs.selected.hero)
          out.push({
            id: 'hero.' + h,
            hero: h,
            name: D.HEROES[h].name,
            asset: D.HEROES[h].asset,
            x: posts[h][0],
            y: posts[h][1],
            dir: posts[h][2]
          });
      return out;
    }
    decorZone(d) {
      const sz = D.DECOR[d.kind]?.size || [1, 1];
      return [d.x, d.x + sz[0] - 1, d.y, d.y + sz[1] - 1];
    }
    blocked() {
      const s = new Set();
      for (const id of Object.keys(TOWN.places)) rectTiles(this.zone(id)).forEach(k => s.add(k));
      for (const d of this.G.decor || []) rectTiles(this.decorZone(d)).forEach(k => s.add(k));
      for (const n of this.npcs()) s.add(n.x + ',' + n.y);
      for (const k of this.trees()) s.add(k);
      return s;
    }
    trees() {
      // 들나무 후보는 고정(시드), 실제로 서는 자리는 지금의 시설·장식·주민을 피한다.
      if (!this._treeCands) {
        const r = rnd(11),
          out = [];
        for (let i = 0; i < 46; i++) {
          const x = 1 + Math.floor(r() * (TW - 2)),
            y = 3 + Math.floor(r() * (TH - 4));
          if (!ROAD.has(x + ',' + y) && Math.abs(x - 15) > 2) out.push([x, y]);
        }
        this._treeCands = out;
      }
      const busy = new Set();
      for (const id of Object.keys(TOWN.places)) {
        const [x0, x1, y0, y1] = this.zone(id);
        rectTiles([x0 - 1, x1 + 1, y0 - 1, y1 + 2]).forEach(k => busy.add(k));
      }
      for (const d of this.G.decor || []) rectTiles(this.decorZone(d)).forEach(k => busy.add(k));
      const npcs = this.npcs(),
        out = new Set();
      for (const [x, y] of this._treeCands) {
        const k = x + ',' + y;
        if (!busy.has(k) && !npcs.some(n => Math.abs(n.x - x) + Math.abs(n.y - y) < 2)) out.add(k);
      }
      return out;
    }
    walkable(x, y, b) {
      return x >= 1 && x <= TW - 2 && y >= 3 && y <= TH - 2 && !b.has(x + ',' + y);
    }
    usable(id) {
      return id === 'gate' || id === 'board' || id.startsWith('npc:');
    }
    // 아바타 곁(대각선 포함 1칸)의 상호작용 대상: 주민이 먼저, 다음이 문·게시판
    near() {
      const a = this.av;
      let best = null;
      const tryTile = (id, x, y) => {
        const d = Math.max(Math.abs(x - a.x), Math.abs(y - a.y));
        if (d <= 1 && (!best || d < best.d)) best = { id, d };
      };
      for (const n of this.npcs()) tryTile('npc:' + n.id, n.x, n.y);
      if (best) return best.id;
      for (const id of ['gate', 'board'])
        for (const k of rectTiles(this.zone(id))) {
          const [x, y] = k.split(',').map(Number);
          tryTile(id, x, y);
        }
      return best?.id || null;
    }
    bfs(goal) {
      const b = this.blocked(),
        a = this.av,
        start = a.x + ',' + a.y,
        prev = new Map([[start, null]]),
        q = [[a.x, a.y]];
      while (q.length) {
        const [x, y] = q.shift();
        if (goal(x, y)) {
          const out = [];
          let k = x + ',' + y;
          while (prev.get(k) !== null) {
            out.unshift(k.split(',').map(Number));
            k = prev.get(k);
          }
          return out;
        }
        for (const [dx, dy] of [
          [0, -1],
          [1, 0],
          [0, 1],
          [-1, 0]
        ]) {
          const nx = x + dx,
            ny = y + dy,
            k = nx + ',' + ny;
          if (!prev.has(k) && this.walkable(nx, ny, b)) {
            prev.set(k, x + ',' + y);
            q.push([nx, ny]);
          }
        }
      }
      return null;
    }
    moveTo(tx, ty) {
      const p = this.bfs((x, y) => x === tx && y === ty);
      if (p) {
        this.av.path = p;
        this.av.then = null;
      }
    }
    targetTiles(id) {
      if (id.startsWith('npc:')) {
        const n = this.npcs().find(q => 'npc:' + q.id === id);
        return n ? [[n.x, n.y]] : [];
      }
      return rectTiles(this.zone(id)).map(k => k.split(',').map(Number));
    }
    // 시설 id 로 부르면 그 시설의 담당 주민에게 간다(바로가기 버튼·시설 그림 클릭).
    resolve(id) {
      if (D.FACILITIES[id]) {
        const n = this.npcs().find(q => q.role === id);
        return n ? 'npc:' + n.id : null;
      }
      return id;
    }
    goTo(raw) {
      const id = this.resolve(raw);
      if (!id) return this.onPick(raw);
      if (this.near() === id && !this.av.path.length) return this.onPick(id);
      const tiles = this.targetTiles(id),
        p = this.bfs((x, y) => tiles.some(([a, b]) => Math.max(Math.abs(a - x), Math.abs(b - y)) <= 1));
      if (p) {
        this.av.path = p;
        this.av.then = id;
        if (!p.length) this.onPick(id);
      } else this.onPick(id);
    }
    step(dir) {
      const v = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir],
        a = this.av;
      a.dir = dir;
      if (a.path.length) return;
      if (this.walkable(a.x + v[0], a.y + v[1], this.blocked())) {
        a.path = [[a.x + v[0], a.y + v[1]]];
        a.then = null;
      }
    }
    interact() {
      const id = this.near();
      if (id) {
        const n = id.startsWith('npc:') && this.npcs().find(q => 'npc:' + q.id === id);
        if (n)
          this.av.dir =
            Math.abs(n.x - this.av.x) >= Math.abs(n.y - this.av.y) ? (n.x < this.av.x ? 'left' : 'right') : n.y < this.av.y ? 'up' : 'down';
        this.onPick(id);
      }
      return !!id;
    }
    /* ───── 꾸미기 모드: 시설·장식을 집어 옮기거나 새 장식을 놓는다. 규칙(겹침·비용)은 guild.canPlace/placeDecor 가 판정한다.
       this.build = { item: {facility:id} | {decor:kind} | {decorIndex:i} | null }. onBuild(action) 으로 앱에 알린다. */
    startBuild(item) {
      this.build = { item: item || null };
      this.av.path = [];
    }
    endBuild() {
      this.build = null;
    }
    buildSize() {
      const it = this.build?.item;
      if (!it) return null;
      if (it.facility) return TOWN.places[it.facility].size;
      if (it.decor) return D.DECOR[it.decor]?.size || [1, 1];
      if (it.decorIndex != null) return D.DECOR[this.G.decor[it.decorIndex]?.kind]?.size || [1, 1];
      return null;
    }
    buildAt() {
      // 집은 것의 왼쪽 위 칸: 마우스 칸이 부지 가운데가 되게 한다
      const sz = this.buildSize(),
        t = this.hoverTile;
      if (!sz || !t) return null;
      return [t[0] - Math.floor((sz[0] - 1) / 2), t[1] - Math.floor((sz[1] - 1) / 2)];
    }
    buildCheck() {
      const it = this.build?.item,
        at = this.buildAt();
      if (!it || !at) return null;
      const skip = it.facility ? { facility: it.facility } : it.decorIndex != null ? { decor: it.decorIndex } : null;
      return Object.assign({ at }, G.canPlace(this.G, this.buildSize(), at[0], at[1], skip));
    }
    buildClick(e) {
      const it = this.build.item;
      if (!it) {
        // 아무것도 안 집은 상태: 화면의 시설·장식을 누르면 집는다
        const id = this.pick(e);
        if (!id) return;
        if (id.startsWith('decor:')) this.build.item = { decorIndex: +id.slice(6) };
        else if (TOWN.places[id]?.movable) this.build.item = { facility: id };
        else if (this.onBuild) this.onBuild({ type: 'hint', text: '옮길 수 없는 곳입니다.' });
        return;
      }
      const c = this.buildCheck();
      if (!c) return;
      if (!c.ok) return this.onBuild && this.onBuild({ type: 'hint', text: c.reason });
      this.build.item = null;
      if (this.onBuild) this.onBuild({ type: 'place', item: it, x: c.at[0], y: c.at[1] });
    }
    drawBuild(ctx, cam) {
      // 격자, 부지 테두리, 집은 것의 그림자
      ctx.strokeStyle = 'rgba(255,255,255,.08)';
      ctx.lineWidth = 1;
      for (let x = Math.floor(cam.x / T); x <= Math.floor((cam.x + CW) / T); x++)
        for (let y = Math.floor(cam.y / T); y <= Math.floor((cam.y + CH) / T); y++) ctx.strokeRect(x * T + 0.5, y * T + 0.5, T - 1, T - 1);
      const zoneRect = (z, color) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(z[0] * T + 2, z[2] * T + 2, (z[1] - z[0] + 1) * T - 4, (z[3] - z[2] + 1) * T - 4);
        ctx.setLineDash([]);
      };
      for (const id of Object.keys(TOWN.places)) if (TOWN.places[id].movable) zoneRect(this.zone(id), 'rgba(95,201,184,.7)');
      for (const d of this.G.decor || []) zoneRect(this.decorZone(d), 'rgba(240,165,69,.7)');
      const c = this.buildCheck();
      if (c) {
        const [w, h] = this.buildSize();
        ctx.fillStyle = c.ok ? 'rgba(142,207,114,.35)' : 'rgba(224,96,90,.35)';
        ctx.fillRect(c.at[0] * T, c.at[1] * T, w * T, h * T);
        const it = this.build.item,
          asset = it.facility
            ? this.G.facilities[it.facility]
              ? this.assetFor(it.facility)
              : null
            : D.DECOR[it.decor || this.G.decor[it.decorIndex]?.kind]?.asset;
        if (asset) {
          ctx.save();
          ctx.globalAlpha = 0.6;
          gfx.drawFit(
            ctx,
            asset,
            (c.at[0] + w / 2) * T,
            (c.at[1] + h) * T,
            it.facility ? 230 : Math.max(52, w * T - 8),
            it.facility ? 200 : h * T + 40
          );
          ctx.restore();
        }
        if (!c.ok) this.tag(ctx, (c.at[0] + w / 2) * T, c.at[1] * T - 10, c.reason, '#20140a', '#ffb3ad');
      }
    }
    tick(now) {
      const a = this.av,
        dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.tickVillagers(dt);
      if (!a.path.length) return;
      const [tx, ty] = a.path[0],
        sp = 7 * dt,
        dx = tx - a.px,
        dy = ty - a.py,
        d = Math.hypot(dx, dy);
      a.dir = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
      if (d <= sp) {
        a.px = a.x = tx;
        a.py = a.y = ty;
        a.path.shift();
        if (!a.path.length && a.then) {
          const id = a.then;
          a.then = null;
          this.onPick(id);
        }
      } else {
        a.px += (dx / d) * sp;
        a.py += (dy / d) * sp;
      }
    }
    // 행인: 길 위를 오가는 분위기용 주민. 길을 막지 않는다. 복구될수록 늘고, 해 질 녘에는 줄어든다.
    tickVillagers(dt) {
      const want = Math.max(0, Math.min(5, Math.floor(this.total() / 2) + 1) - (G.dayPhase(this.G) === 'dusk' ? 2 : 0)),
        roads = [...ROAD].map(k => k.split(',').map(Number)).filter(([, y]) => y >= 4);
      while (this.villagers.length < want) {
        const [x, y] = roads[Math.floor(Math.random() * roads.length)];
        this.villagers.push({
          x,
          y,
          tx: x,
          ty: y,
          wait: Math.random() * 2,
          dir: 'down',
          hero: ['ara', 'noa', 'lumi'][this.villagers.length % 3],
          tint: VILLAGER_TINTS[this.villagers.length % VILLAGER_TINTS.length]
        });
      }
      this.villagers.length = Math.min(this.villagers.length, want);
      for (const v of this.villagers) {
        const dx = v.tx - v.x,
          dy = v.ty - v.y,
          d = Math.hypot(dx, dy);
        if (d < 0.05) {
          v.moving = false;
          if ((v.wait -= dt) <= 0) {
            const opts = roads.filter(
              ([x, y]) => (x === Math.round(v.x) || y === Math.round(v.y)) && Math.abs(x - v.x) + Math.abs(y - v.y) <= 8
            );
            const p = opts[Math.floor(Math.random() * opts.length)];
            if (p) {
              v.tx = p[0];
              v.ty = p[1];
            }
            v.wait = 1 + Math.random() * 4;
          }
        } else {
          v.moving = true;
          const sp = 2.2 * dt;
          v.x += (dx / d) * Math.min(sp, d);
          v.y += (dy / d) * Math.min(sp, d);
          v.dir = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
        }
      }
    }
    celebrate(id) {
      this.pulse[id] = performance.now();
    }
    pick(e) {
      const [x, y] = this.world(e);
      let best = null;
      for (const [id, b] of Object.entries(this.rects))
        if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h && (!best || b.y + b.h > this.rects[best].y + this.rects[best].h))
          best = id;
      return best;
    }
    assetFor(id) {
      const lv = this.G.facilities[id];
      if (id === 'workshop') return 'facility.workshop.' + Math.min(3, lv);
      return 'facility.' + id + '.' + Math.min(2, lv);
    }

    draw() {
      const ctx = this.ctx,
        Gs = this.G,
        now = performance.now(),
        total = this.total(),
        dusk = G.dayPhase(Gs) === 'dusk';
      ctx.imageSmoothingEnabled = false;
      this.rects = {};
      this.tick(now);
      const cam = this.cam;
      cam.x = Math.max(0, Math.min(TW * T - CW, (this.av.px + 0.5) * T - CW / 2));
      cam.y = Math.max(0, Math.min(TH * T - CH, (this.av.py + 0.5) * T - CH / 2));
      ctx.save();
      ctx.translate(-Math.round(cam.x), -Math.round(cam.y));
      const x0 = Math.floor(cam.x / T),
        x1 = Math.min(TW - 1, x0 + 17),
        y0 = Math.floor(cam.y / T),
        y1 = Math.min(TH - 1, y0 + 11),
        gr = rnd(3);
      const tuft = [];
      for (let i = 0; i < 260; i++) tuft.push([gr() * TW * T, (2.6 + gr() * (TH - 3)) * T, gr()]);
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const edge = y < 2 || x === 0 || x === TW - 1 || y === TH - 1,
            k = x + ',' + y;
          if (edge) {
            gfx.frame(ctx, 'tiles.labyrinth', 'wall.verdant', x * T, y * T, T, T);
            if (y >= 2) {
              ctx.fillStyle = 'rgba(10,24,14,.55)';
              ctx.fillRect(x * T, y * T, T, T);
            }
            continue;
          }
          if (ROAD.has(k)) {
            gfx.frame(ctx, 'tiles.labyrinth', total >= 4 ? 'floor.cobble' : 'floor.verdant', x * T, y * T, T, T);
            if (total < 4) {
              ctx.fillStyle = 'rgba(70,58,40,.35)';
              ctx.fillRect(x * T, y * T, T, T);
            }
          } else {
            // 잔디 타일(이미지 생성 에셋). 복구가 진행되면 군데군데 들꽃이 핀다. 그림이 없으면 단색으로 대신한다.
            const flowers = total >= 2 && (x * 7 + y * 13) % 5 === 0,
              tile = gfx.image(flowers ? 'town.tile_grass_flowers' : 'town.tile_grass');
            if (tile) ctx.drawImage(tile, x * T, y * T, T, T);
            else {
              ctx.fillStyle = (x + y) % 2 ? '#36502f' : '#3a5633';
              ctx.fillRect(x * T, y * T, T, T);
            }
          }
        }
      for (const [tx, ty, kind] of gfx.image('town.tile_grass') ? [] : tuft) {
        if (
          tx < cam.x - 20 ||
          tx > cam.x + CW + 20 ||
          ty < cam.y - 20 ||
          ty > cam.y + CH + 20 ||
          ROAD.has(Math.floor(tx / T) + ',' + Math.floor(ty / T))
        )
          continue;
        if (kind < 0.75) {
          ctx.strokeStyle = kind < 0.4 ? '#4f7340' : '#64893f';
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (let q = -1; q <= 1; q++) {
            ctx.moveTo(tx, ty);
            ctx.lineTo(tx + q * 4, ty - 8);
          }
          ctx.stroke();
        } else if (total >= 2) {
          ctx.fillStyle = kind < 0.88 ? '#e8d27a' : '#d98aa0';
          ctx.fillRect(tx - 2, ty - 6, 4, 4);
        }
      }
      if (total >= 5) gfx.drawFit(ctx, 'decor.rug', 15 * T, 6.2 * T, 150, 90);
      const items = [],
        add = (id, asset, cx, by, maxW, maxH, opt = {}) => items.push({ id, asset, cx, by, maxW, maxH, opt }),
        P = TOWN.places;
      add('gate', 'prop.gate', P.gate.spot[0] * T, P.gate.spot[1] * T, 150, 170);
      if (total >= 2) {
        add(null, 'decor.banner', 12.6 * T, 2.3 * T, 60, 110);
        add(null, 'decor.banner', 17.4 * T, 2.3 * T, 60, 110);
      }
      // 문 앞 등불 두 개는 고정. 나머지 장식은 플레이어가 놓는다(G.decor).
      for (const [lx, ly] of [
        [13.5, 3.4],
        [16.5, 3.4]
      ])
        add(null, 'decor.lamp', lx * T, ly * T, 40, 70, { lit: total >= 1, unlit: total < 1 });
      (Gs.decor || []).forEach((d, i) => {
        const def = D.DECOR[d.kind];
        if (!def) return;
        const [x0, x1, y0, y1] = this.decorZone(d),
          cx = ((x0 + x1 + 1) / 2) * T,
          by = (y1 + 0.95) * T,
          w = (x1 - x0 + 1) * T;
        add('decor:' + i, def.asset, cx, by, def.tall ? 120 : Math.max(52, w - 8), def.tall ? 150 : def.size[1] * T + 40, {
          lit: def.lit,
          decor: true
        });
      });
      const bspot = this.spot('board');
      add('board', 'facility.board', bspot[0] * T, bspot[1] * T, 120, 90);
      for (const id of Object.keys(D.FACILITIES)) {
        const [sx, sy] = this.spot(id),
          lv = Gs.facilities[id];
        if (!G.facilityVisible(Gs, id)) {
          items.push({ ruin: true, hidden: true, cx: sx * T, by: sy * T });
          continue;
        }
        if (lv === 0) {
          items.push({ id, ruin: true, cx: sx * T, by: sy * T });
          continue;
        }
        add(id, this.assetFor(id), sx * T, sy * T, id === 'workshop' ? 290 : 230, 200);
        if (lv >= 3 || (lv >= 2 && id !== 'workshop'))
          add(null, 'facility.' + (id === 'workshop' ? 'barracks' : id) + '.extra', sx * T + (sx < 15 ? 160 : -160), sy * T, 70, 90);
      }
      for (const k of this.trees()) {
        const [x, y] = k.split(',').map(Number);
        items.push({ tree: true, cx: (x + 0.5) * T, by: (y + 0.95) * T, v: (x * 7 + y * 13) % 3 });
      }
      for (const n of this.npcs()) items.push({ npc: n, cx: (n.x + 0.5) * T, by: (n.y + 0.86) * T });
      for (const v of this.villagers) items.push({ villager: v, cx: (v.x + 0.5) * T, by: (v.y + 0.86) * T });
      items.push({
        hero: Gs.selected.hero,
        avatar: true,
        cx: (this.av.px + 0.5) * T,
        by: (this.av.py + 0.86) * T,
        dir: this.av.dir,
        walking: this.av.path.length > 0
      });
      if (this.av.path.length) {
        const end = this.av.path[this.av.path.length - 1];
        ctx.strokeStyle = 'rgba(95,201,184,.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse((end[0] + 0.5) * T, (end[1] + 0.8) * T, 16, 6, 0, 0, 7);
        ctx.stroke();
      }
      items.sort((a, b) => a.by - b.by);
      const nearId = this.av.path.length ? null : this.near();
      const person = (asset, cx, by, dir, anim, tint, t) => {
        const a = gfx.asset(asset),
          frame = gfx.actorFrame(a, anim, dir, t);
        ctx.fillStyle = 'rgba(0,0,0,.35)';
        ctx.beginPath();
        ctx.ellipse(cx, by, 20, 7, 0, 0, 7);
        ctx.fill();
        gfx.sprite(ctx, asset, frame, cx, by - Math.sin(now / 450 + cx) * 1.2, 56, false, tint || null);
      };
      for (const it of items) {
        if (it.tree && gfx.image(it.v === 1 ? 'town.tree_pine' : 'town.tree_oak')) {
          /* 나무 그림(이미지 생성 에셋). 없으면 아래의 도형 나무로 대신한다. */
          ctx.fillStyle = 'rgba(0,0,0,.3)';
          ctx.beginPath();
          ctx.ellipse(it.cx, it.by - 2, 30, 9, 0, 0, 7);
          ctx.fill();
          gfx.drawFit(ctx, it.v === 1 ? 'town.tree_pine' : 'town.tree_oak', it.cx, it.by + 6, 120, it.v === 1 ? 150 : 140);
          continue;
        }
        if (it.tree) {
          ctx.fillStyle = 'rgba(0,0,0,.28)';
          ctx.beginPath();
          ctx.ellipse(it.cx, it.by, 26, 9, 0, 0, 7);
          ctx.fill();
          ctx.fillStyle = '#4a3525';
          ctx.fillRect(it.cx - 6, it.by - 40, 12, 40);
          const c = ['#2f5a34', '#35653a', '#2b5230'][it.v];
          for (const [dx, dy, r] of [
            [0, -78, 30],
            [-22, -56, 26],
            [22, -56, 26],
            [0, -48, 28]
          ]) {
            ctx.fillStyle = c;
            ctx.beginPath();
            ctx.arc(it.cx + dx, it.by + dy, r, 0, 7);
            ctx.fill();
          }
          ctx.fillStyle = 'rgba(255,255,255,.07)';
          ctx.beginPath();
          ctx.arc(it.cx - 10, it.by - 84, 14, 0, 7);
          ctx.fill();
          continue;
        }
        if (it.villager) {
          const v = it.villager;
          person(D.HEROES[v.hero].asset, it.cx, it.by, v.dir, v.moving ? 'walk' : 'idle', v.tint, now);
          continue;
        }
        if (it.npc) {
          const n = it.npc,
            id = 'npc:' + n.id,
            face =
              nearId === id
                ? Math.abs(this.av.x - n.x) >= Math.abs(this.av.y - n.y)
                  ? this.av.x < n.x
                    ? 'left'
                    : 'right'
                  : this.av.y < n.y
                    ? 'up'
                    : 'down'
                : n.dir || 'down';
          if (n.sprite && gfx.image(n.sprite)) {
            /* 주민 전용 그림(서 있는 한 장). 없으면 대원 스프라이트에 색 필터를 입혀 대신한다. */
            ctx.fillStyle = 'rgba(0,0,0,.35)';
            ctx.beginPath();
            ctx.ellipse(it.cx, it.by, 20, 7, 0, 0, 7);
            ctx.fill();
            gfx.drawFit(ctx, n.sprite, it.cx, it.by + 2 - Math.sin(now / 450 + it.cx) * 1.2, 56, 88);
          } else person(n.asset, it.cx, it.by, face, 'idle', n.tint, now);
          this.rects[id] = { x: it.cx - 26, y: it.by - 64, w: 52, h: 72 };
          const can = n.role && G.target(Gs, { kind: 'facility', id: n.role }).can,
            shop = n.role === 'stash' && Gs.facilities.stash >= 1 && !Gs.shop.done;
          this.tag(ctx, it.cx, it.by + 18, n.name, this.hover === id ? '#ffe27a' : n.hero ? '#9aa3a6' : '#e9e4d8');
          if (can || shop)
            this.tag(
              ctx,
              it.cx,
              it.by - 74 + Math.sin(now / 250) * 4,
              can ? '▲ 복구·강화 가능' : '가게를 열 수 있다',
              '#20140a',
              '#f0a545'
            );
          continue;
        }
        if (it.hero) {
          person(D.HEROES[it.hero].asset, it.cx, it.by, it.dir, it.walking ? 'walk' : 'idle', null, now);
          ctx.strokeStyle = 'rgba(95,201,184,.9)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(it.cx, it.by, 24, 9, 0, 0, 7);
          ctx.stroke();
          this.tag(ctx, it.cx, it.by + 20, D.HEROES[it.hero].name, '#5fc9b8');
          continue;
        }
        if (it.ruin) {
          this.ruin(ctx, it, now);
          continue;
        }
        const im = gfx.image(it.asset);
        if (!im) continue;
        const s = Math.min(it.maxW / im.width, it.maxH / im.height),
          w = im.width * s,
          h = im.height * s,
          x = it.cx - w / 2,
          y = it.by - h;
        ctx.fillStyle = 'rgba(0,0,0,.3)';
        ctx.beginPath();
        ctx.ellipse(it.cx, it.by - 4, w * 0.45, 10, 0, 0, 7);
        ctx.fill();
        const hot = it.id && this.hover === it.id,
          p = it.id && this.pulse[it.id] && now - this.pulse[it.id] < 1600;
        ctx.save();
        if (hot || p) {
          ctx.shadowColor = p ? '#ffe27a' : '#f0a545';
          ctx.shadowBlur = p ? 30 + 20 * Math.sin(now / 80) : 18;
        }
        if (it.opt.unlit) ctx.filter = 'grayscale(1) brightness(.55)';
        ctx.drawImage(im, x, y, w, h);
        ctx.restore();
        if (it.opt.lit) {
          const gl = ctx.createRadialGradient(it.cx, y + 16, 2, it.cx, y + 16, dusk ? 130 : 90);
          gl.addColorStop(0, 'rgba(255,190,90,' + (dusk ? 0.5 : 0.3) + ')');
          gl.addColorStop(1, 'rgba(255,190,90,0)');
          ctx.fillStyle = gl;
          ctx.fillRect(it.cx - 130, y - 114, 260, 260);
        }
        if (it.id) {
          this.rects[it.id] = { x, y, w, h };
          if (!it.opt.decor) this.nameplate(ctx, it, now);
        }
      }
      if (this.build) this.drawBuild(ctx, cam);
      if (nearId && !this.build) {
        const n = nearId.startsWith('npc:') ? this.npcs().find(q => 'npc:' + q.id === nearId) : null,
          tiles = this.targetTiles(nearId),
          cx = ((Math.min(...tiles.map(t => t[0])) + Math.max(...tiles.map(t => t[0])) + 1) / 2) * T,
          top = Math.min(...tiles.map(t => t[1])) * T;
        this.tag(
          ctx,
          cx,
          Math.max(cam.y + 40, top - (n ? 52 : 34) + Math.sin(now / 300) * 3),
          'E · ' + (nearId === 'gate' ? '원정 준비' : nearId === 'board' ? '의뢰 게시판 보기' : '말 걸기'),
          '#20140a',
          '#ffe27a'
        );
      }
      ctx.restore();
      // 빛: 복구될수록 어둠이 걷히고, 장사를 마친 날은 해 질 녘 빛이 든다.
      const dark = Math.max(0.02, 0.42 - total * 0.05);
      ctx.fillStyle = 'rgba(6,8,14,' + dark + ')';
      ctx.fillRect(0, 0, CW, CH);
      if (dusk) {
        const gsk = ctx.createLinearGradient(0, 0, 0, CH);
        gsk.addColorStop(0, 'rgba(255,120,60,.20)');
        gsk.addColorStop(1, 'rgba(30,20,70,.34)');
        ctx.fillStyle = gsk;
        ctx.fillRect(0, 0, CW, CH);
      }
      // 길잡이: 화면 밖의 시설·문 방향
      ctx.save();
      for (const [id, p] of Object.entries(TOWN.places)) {
        if (D.FACILITIES[id] && !G.facilityVisible(Gs, id)) continue;
        const spot = this.spot(id),
          sx = spot[0] * T - cam.x,
          sy = (spot[1] - 1) * T - cam.y;
        if (sx > 30 && sx < CW - 30 && sy > 30 && sy < CH - 30) continue;
        const ex = Math.max(28, Math.min(CW - 28, sx)),
          ey = Math.max(60, Math.min(CH - 70, sy)),
          label = id === 'gate' ? '원정의 문' : id === 'board' ? '게시판' : D.FACILITIES[id].name,
          ang = Math.atan2(sy - ey, sx - ex);
        ctx.font = 'bold 12px sans-serif';
        const w = ctx.measureText(label).width + 26;
        const bx = Math.max(6, Math.min(CW - w - 6, ex - w / 2));
        ctx.fillStyle = 'rgba(8,10,12,.7)';
        ctx.beginPath();
        ctx.roundRect(bx, ey - 11, w, 22, 8);
        ctx.fill();
        ctx.fillStyle = '#c9a35a';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, bx + 20, ey + 1);
        ctx.translate(bx + 11, ey);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.moveTo(6, 0);
        ctx.lineTo(-4, -5);
        ctx.lineTo(-4, 5);
        ctx.fill();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      ctx.restore();
      ctx.textBaseline = 'alphabetic';
    }
    ruin(ctx, it, now) {
      const { cx, by } = it;
      ctx.fillStyle = 'rgba(0,0,0,.3)';
      ctx.beginPath();
      ctx.ellipse(cx, by - 4, 90, 16, 0, 0, 7);
      ctx.fill();
      ctx.save();
      ctx.filter = 'grayscale(.9) brightness(.5)';
      gfx.drawFit(ctx, 'decor.crate', cx - 40, by, 66, 66);
      gfx.drawFit(ctx, 'decor.bench', cx + 34, by - 2, 90, 44);
      ctx.restore();
      ctx.strokeStyle = '#4a4339';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(cx - 80, by - 6);
      ctx.lineTo(cx - 24, by - 70);
      ctx.moveTo(cx + 76, by - 8);
      ctx.lineTo(cx + 34, by - 58);
      ctx.stroke();
      if (it.hidden) return;
      const hot = this.hover === it.id;
      if (hot) {
        ctx.strokeStyle = '#f0a545';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.ellipse(cx, by - 8, 106, 28, 0, 0, 7);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      this.rects[it.id] = { x: cx - 100, y: by - 90, w: 200, h: 100 };
      this.nameplate(ctx, it, now);
    }
    nameplate(ctx, it, now) {
      const Gs = this.G,
        id = it.id;
      let text,
        color = '#e9e4d8',
        can = false;
      if (id === 'gate') {
        text = '원정의 문';
        color = '#ffe27a';
      } else if (id === 'board') {
        const open = Object.keys(D.QUESTS).filter(q => G.questVisible(Gs, q) && !Gs.quests[q]);
        can = open.some(q => G.target(Gs, { kind: 'quest', id: q }).can);
        text = '의뢰 게시판' + (open.length ? ' · ' + open.length : '');
      } else {
        const f = D.FACILITIES[id],
          lv = Gs.facilities[id];
        text = f.name + (lv ? ' ' + lv + '단계' : ' (폐허)');
        if (!lv) color = '#c9b79a';
      }
      this.tag(ctx, it.cx, it.by + 18, text, this.hover === id ? '#ffe27a' : color);
      if (can) this.tag(ctx, it.cx, it.by - it.maxH - 8 + Math.sin(now / 250) * 4, '▲ 납품 가능', '#20140a', '#f0a545');
    }
    tag(ctx, x, y, text, color, bg) {
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      const w = ctx.measureText(text).width + 14;
      ctx.fillStyle = bg || 'rgba(8,10,12,.82)';
      ctx.beginPath();
      ctx.roundRect(x - w / 2, y - 15, w, 21, 7);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
    }
  }
  ER.GuildView = GuildView;
})(typeof globalThis !== 'undefined' ? globalThis : this);
