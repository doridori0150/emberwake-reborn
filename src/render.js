/* 에셋 로더와 원정 화면 렌더러.
   규칙은 즉시 확정되고(run.js), 여기서는 run.events 를 순서대로 재생해 보여줄 뿐이다.
   그림(스프라이트)과 판정(타일)을 분리한다: 선택·호버 표시는 발밑 타원이고 스프라이트 사각형을 쓰지 않는다. */
(function (g) {
  'use strict';
  const ER = g.ER,
    D = ER.data,
    RUN = ER.run,
    M = ER.map,
    T = 64,
    W = M.W,
    H = M.H;
  const images = new Map();
  const gfx = (ER.gfx = {
    load() {
      const list = Object.values(ER.ASSETS.assets),
        srcs = [...new Set(list.map(a => a.src))];
      return Promise.all(
        srcs.map(
          src =>
            new Promise(res => {
              const im = new Image();
              im.onload = () => {
                images.set(src, im);
                res();
              };
              im.onerror = () => {
                console.warn('에셋 로드 실패', src);
                res();
              };
              im.src = src;
            })
        )
      );
    },
    asset: id => ER.ASSETS.assets[id],
    image: id => images.get(ER.ASSETS.assets[id]?.src),
    url: id => ER.ASSETS.assets[id]?.src || '',
    draw(ctx, id, x, y, w, h) {
      const a = gfx.asset(id),
        im = a && images.get(a.src);
      if (!im) {
        ctx.fillStyle = '#a3f';
        ctx.fillRect(x, y, w, h);
        return;
      }
      ctx.drawImage(im, x, y, w, h);
    },
    drawFit(ctx, id, cx, by, maxW, maxH) {
      const a = gfx.asset(id),
        im = a && images.get(a.src);
      if (!im) return;
      const s = Math.min(maxW / im.width, maxH / im.height);
      ctx.drawImage(im, cx - (im.width * s) / 2, by - im.height * s, im.width * s, im.height * s);
    },
    frame(ctx, id, name, x, y, w, h) {
      const a = gfx.asset(id),
        im = a && images.get(a.src),
        f = a?.frames[name];
      if (!im || !f) return;
      ctx.drawImage(im, f[0], f[1], f[2], f[3], x, y, w, h);
    },
    frameFit(ctx, id, name, cx, by, maxW, maxH) {
      const a = gfx.asset(id),
        im = a && images.get(a.src),
        f = a?.frames[name];
      if (!im || !f) return;
      const s = Math.min(maxW / f[2], maxH / f[3]);
      ctx.drawImage(im, f[0], f[1], f[2], f[3], cx - (f[2] * s) / 2, by - f[3] * s, f[2] * s, f[3] * s);
    },
    // 발 기준점(px,py)에 몸 높이 height 로 그린다.
    sprite(ctx, id, frameName, px, py, height, flip, filter) {
      const a = gfx.asset(id),
        im = a && images.get(a.src),
        f = a?.frames[frameName];
      if (!im || !f) return;
      const s = height / a.bodyHeight;
      ctx.save();
      ctx.translate(Math.round(px), Math.round(py));
      if (flip) ctx.scale(-1, 1);
      if (filter) ctx.filter = filter;
      ctx.drawImage(im, f[0], f[1], f[2], f[3], -f[4] * s, -f[5] * s, f[2] * s, f[3] * s);
      ctx.restore();
    },
    actorFrame(a, anim, dir, t) {
      const an = a.anims[anim] || a.anims.idle;
      const list = a.kind === 'actor' ? an.dirs[dir] || an.dirs.down : an.frames;
      const i = Math.floor(t / an.ms);
      return list[an.loop ? i % list.length : Math.min(i, list.length - 1)];
    },
    animLength(a, anim) {
      const an = a.anims[anim];
      return (a.kind === 'actor' ? an.dirs.down.length : an.frames.length) * an.ms;
    }
  });
  const NODE_ART = { ore: ['tiles', 'prop.ore'], herb: ['tiles', 'prop.herb'] };
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  class RunView {
    constructor(canvas) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.units = new Map();
      this.floats = [];
      this.fx = [];
      this.overlay = {};
      this.busy = false;
      this.speed = 1;
      this.fade = 0;
      this.shakeUntil = 0;
      this.run = null;
      this.vis = null;
      const loop = () => {
        this.draw();
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
    setRun(run) {
      this.run = run;
      this.units.clear();
      this.floats = [];
      this.fx = [];
      if (run) this.sync();
    }
    sync() {
      const run = this.run,
        rm = RUN.room(run),
        keep = new Set(['hero']);
      this.viewRoom = run.roomId; // 화면에 보이는 방은 여기서만 바뀐다(이동 연출 중에 새 방이 미리 보이지 않게)
      const put = (id, o) => {
        const u = this.units.get(id);
        if (u && !u.dead) Object.assign(u, o, { anim: u.anim === 'walk' ? 'idle' : u.anim });
        else this.units.set(id, Object.assign({ id, anim: 'idle', t0: performance.now(), alpha: 1 }, o));
      };
      put('hero', {
        hero: true,
        asset: D.HEROES[run.heroId].asset,
        x: run.hero.x,
        y: run.hero.y,
        dir: run.hero.facing,
        hp: run.hero.hp,
        maxHp: run.hero.maxHp,
        size: 58
      });
      for (const e of RUN.alive(rm)) {
        keep.add(e.id);
        const d = D.ENEMIES[e.kind];
        put(e.id, { asset: d.asset, tint: d.tint, x: e.x, y: e.y, dir: e.facing, hp: e.hp, maxHp: e.maxHp, size: d.size, e });
      }
      for (const id of [...this.units.keys()]) if (!keep.has(id)) this.units.delete(id);
      this.vis = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) this.vis.push(RUN.visible(run, x, y));
    }
    float(x, y, text, color, big) {
      this.floats.push({ x, y, text, color, big, t0: performance.now(), dur: 900 });
    }
    async play(events) {
      if (!events.length) {
        this.sync();
        return;
      }
      this.busy = true;
      const sp = () => this.speed;
      for (const ev of events) {
        const u = this.units.get(ev.id || ev.who);
        if (ev.t === 'move' && u) {
          u.anim = 'walk';
          for (const [x, y] of ev.path) {
            const fx = u.x,
              fy = u.y,
              dur = (ev.fast ? 45 : ev.jump ? 220 : u.hero ? 95 : 80) * sp(),
              t0 = performance.now();
            if (u.hero) u.dir = x < fx ? 'left' : x > fx ? 'right' : y < fy ? 'up' : 'down';
            else if (x !== fx) u.dir = x < fx ? 'left' : 'right';
            while (performance.now() - t0 < dur) {
              const k = (performance.now() - t0) / dur;
              u.x = fx + (x - fx) * k;
              u.y = fy + (y - fy) * k;
              u.hop = ev.jump ? Math.sin(k * Math.PI) * 40 : 0;
              await sleep(8);
            }
            u.x = x;
            u.y = y;
            u.hop = 0;
            if (u.hero) ER.audio?.play('step');
          }
          u.anim = 'idle';
        } else if (ev.t === 'attack' && u) {
          if (u.hero) {
            const dx = ev.tx - u.x,
              dy = ev.ty - u.y;
            if (dx || dy) u.dir = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
          } else if (ev.tx !== u.x) u.dir = ev.tx < u.x ? 'left' : 'right';
          u.anim = ev.anim === 'skill' && u.hero ? 'skill' : 'attack';
          u.t0 = performance.now();
          u.lunge = { tx: ev.tx, ty: ev.ty, t0: u.t0 };
          ER.audio?.play(u.hero ? (ev.anim === 'skill' ? 'skill' : 'slash') : 'enemy');
          await sleep(230 * sp());
          setTimeout(() => {
            if (u.anim === 'attack' || u.anim === 'skill') u.anim = 'idle';
            u.lunge = null;
          }, 200);
        } else if (ev.t === 'proj') {
          this.fx.push({
            kind: 'proj',
            style: ev.kind,
            fx: ev.fx,
            fy: ev.fy,
            tx: ev.tx,
            ty: ev.ty,
            t0: performance.now(),
            dur: 170 * sp()
          });
          await sleep(170 * sp());
        } else if (ev.t === 'blast') {
          this.fx.push({ kind: 'blast', tiles: ev.tiles, style: ev.kind, t0: performance.now(), dur: 380 });
          ER.audio?.play('blast');
          await sleep(200 * sp());
        } else if (ev.t === 'dmg') {
          const col =
            {
              hit: '#ffd9a0',
              block: '#9fd0ff',
              heal: '#8ecf72',
              burn: '#ff9a4a',
              poison: '#a6e06a',
              slam: '#ffffff',
              hazard: '#e0c070',
              counter: '#ffe27a',
              trap: '#ffffff',
              chain: '#b7d4ff'
            }[ev.kind] || '#fff';
          this.float(ev.x, ev.y, (ev.kind === 'heal' ? '+' : ev.kind === 'block' ? '막음 ' : '-') + ev.n, col, ev.kind !== 'block');
          if (u) {
            if (ev.kind === 'heal') u.hp = Math.min(u.maxHp, u.hp + ev.n);
            else if (ev.kind !== 'block') {
              u.hp -= ev.n;
              u.flash = performance.now();
              if (!u.hero) {
                u.anim = 'hurt';
                u.t0 = performance.now();
                setTimeout(() => {
                  if (u.anim === 'hurt') u.anim = 'idle';
                }, 220);
              }
            }
          }
          ER.audio?.play(ev.kind === 'heal' ? 'heal' : ev.kind === 'block' ? 'block' : 'hit');
          await sleep(120 * sp());
        } else if (ev.t === 'die' && u) {
          u.dead = true;
          u.dieT = performance.now();
          ER.audio?.play('die');
          await sleep(260 * sp());
          this.units.delete(u.id);
        } else if (ev.t === 'spawn') {
          const e = RUN.alive(RUN.room(this.run)).find(x => x.id === ev.id);
          if (e) {
            const d = D.ENEMIES[e.kind];
            this.units.set(e.id, {
              id: e.id,
              asset: d.asset,
              tint: d.tint,
              x: e.x,
              y: e.y,
              dir: e.facing,
              hp: e.hp,
              maxHp: e.maxHp,
              size: d.size,
              e,
              anim: 'idle',
              t0: performance.now(),
              alpha: 1,
              born: performance.now()
            });
            this.float(e.x, e.y, '!', '#ffd24a', true);
            await sleep(200 * sp());
          }
        } else if (ev.t === 'alert' && u) {
          this.float(u.x, u.y - 0.4, '!', '#ffd24a', true);
          ER.audio?.play('alert');
          await sleep(140 * sp());
        } else if (ev.t === 'status' && u)
          this.float(
            u.x,
            u.y - 0.2,
            { burn: '화상', poison: '중독', root: '속박', stun: '기절', exposed: '빈틈!' }[ev.kind] +
              (ev.kind === 'burn' || ev.kind === 'poison' ? ' +' + ev.n : ''),
            { burn: '#ff9a4a', poison: '#a6e06a', root: '#9fd0ff', stun: '#ffe27a', exposed: '#d6b3ff' }[ev.kind]
          );
        else if (ev.t === 'text') {
          this.float(ev.x, ev.y - 0.5, ev.text, '#f3a29d');
          await sleep(90 * sp());
        } else if (ev.t === 'loot') {
          this.float(ev.x, ev.y - 0.3, ev.text, '#ffe27a');
          ER.audio?.play('loot');
        } else if (ev.t === 'shake') this.shakeUntil = performance.now() + 220;
        else if (ev.t === 'crit') {
          this.float(ev.x, ev.y - 0.7, '치명타!', '#ffe27a', true);
          this.shakeUntil = performance.now() + 160;
          ER.audio?.play('blast');
        } else if (ev.t === 'special') {
          const hu = this.units.get('hero');
          if (hu) this.float(hu.x, hu.y - 0.9, ev.name, '#d6b3ff', true);
          ER.audio?.play('skill');
          await sleep(260 * sp());
        } else if (ev.t === 'face') {
          const fu = this.units.get(ev.id);
          if (fu) fu.dir = ev.dir;
        } else if (ev.t === 'flash') this.fx.push({ kind: 'flash', t0: performance.now(), dur: 300 });
        else if (ev.t === 'room') {
          for (let i = 0; i <= 6; i++) {
            this.fade = i / 6;
            await sleep(18);
          }
          this.sync();
          this.floats = [];
          for (let i = 6; i >= 0; i--) {
            this.fade = i / 6;
            await sleep(18);
          }
        }
      }
      this.sync();
      this.busy = false;
    }
    tileAt(clientX, clientY) {
      const r = this.cv.getBoundingClientRect(),
        x = Math.floor(((clientX - r.left) / r.width) * W),
        y = Math.floor(((clientY - r.top) / r.height) * H);
      return x >= 0 && y >= 0 && x < W && y < H ? { x, y } : null;
    }

    draw() {
      // 규칙은 문을 밟는 즉시 방을 바꾸지만, 화면은 방 전환 이벤트가 재생될 때까지 이전 방을 그린다.
      const run = this.run;
      if (!run) return;
      const real = run.roomId;
      if (this.viewRoom != null && run.rooms[this.viewRoom]) run.roomId = this.viewRoom;
      try {
        this.paint();
      } finally {
        run.roomId = real;
      }
    }
    paint() {
      const ctx = this.ctx,
        run = this.run,
        now = performance.now();
      if (!run) return;
      const rm = RUN.room(run),
        reg = D.REGIONS[run.regionId],
        ov = this.overlay;
      ctx.imageSmoothingEnabled = false;
      ctx.save();
      ctx.fillStyle = reg.ambient;
      ctx.fillRect(0, 0, W * T, H * T);
      if (now < this.shakeUntil) ctx.translate((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
      // 바닥·벽
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const t = rm.tiles[y][x],
            px = x * T,
            py = y * T;
          if (t === '#') {
            gfx.frame(ctx, 'tiles.labyrinth', reg.wall, px, py, T, T);
            if (y > 0) {
              ctx.fillStyle = 'rgba(0,0,0,.45)';
              ctx.fillRect(px, py, T, T);
            }
            continue;
          }
          gfx.frame(ctx, 'tiles.labyrinth', reg.floor, px, py, T, T);
          if ((x + y) % 2) {
            ctx.fillStyle = 'rgba(0,0,0,.07)';
            ctx.fillRect(px, py, T, T);
          }
          if (t === 'D') this.door(ctx, run, x, y);
          if (t === 'h') this.hazard(ctx, reg.hazard.id, px, py, now);
          if (t === 's') {
            // 잠든 가시: 레버를 당기면 솟는 자리. 바닥의 구멍 무늬로만 보인다.
            ctx.strokeStyle = 'rgba(224,96,90,.45)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(px + 6, py + 6, T - 12, T - 12);
            ctx.setLineDash([]);
            ctx.fillStyle = 'rgba(20,12,12,.55)';
            for (let i = 0; i < 9; i++) ctx.fillRect(px + 14 + (i % 3) * 16, py + 14 + Math.floor(i / 3) * 16, 5, 5);
          }
        }
      // 이동 가능 칸·사거리·경로
      if (ov.reach)
        for (const [x, y] of ov.reach) {
          ctx.fillStyle = 'rgba(95,201,184,.13)';
          ctx.fillRect(x * T + 2, y * T + 2, T - 4, T - 4);
        }
      if (ov.range)
        for (const [x, y] of ov.range) {
          ctx.fillStyle = 'rgba(240,165,69,.16)';
          ctx.fillRect(x * T + 2, y * T + 2, T - 4, T - 4);
          ctx.strokeStyle = 'rgba(240,165,69,.5)';
          ctx.lineWidth = 1;
          ctx.strokeRect(x * T + 2.5, y * T + 2.5, T - 5, T - 5);
        }
      if (ov.allThreat)
        for (const [x, y] of ov.allThreat) {
          ctx.fillStyle = 'rgba(255,140,60,.17)';
          ctx.fillRect(x * T + 1, y * T + 1, T - 2, T - 2);
          ctx.strokeStyle = 'rgba(255,160,90,.85)';
          ctx.lineWidth = 3;
          for (const [cx, cy, sx, sy] of [
            [4, 4, 1, 1],
            [T - 4, 4, -1, 1],
            [4, T - 4, 1, -1],
            [T - 4, T - 4, -1, -1]
          ]) {
            ctx.beginPath();
            ctx.moveTo(x * T + cx + sx * 12, y * T + cy);
            ctx.lineTo(x * T + cx, y * T + cy);
            ctx.lineTo(x * T + cx, y * T + cy + sy * 12);
            ctx.stroke();
          }
        }
      if (ov.watch)
        for (const [x, y] of ov.watch) {
          ctx.fillStyle = 'rgba(255,226,122,.13)';
          ctx.fillRect(x * T + 1, y * T + 1, T - 2, T - 2);
          ctx.strokeStyle = 'rgba(255,226,122,.55)';
          ctx.lineWidth = 1;
          ctx.strokeRect(x * T + 3.5, y * T + 3.5, T - 7, T - 7);
        }
      if (ov.threat)
        for (const [x, y] of ov.threat) {
          ctx.strokeStyle = 'rgba(255,150,90,.55)';
          ctx.setLineDash([4, 4]);
          ctx.lineWidth = 2;
          ctx.strokeRect(x * T + 5, y * T + 5, T - 10, T - 10);
          ctx.setLineDash([]);
        }
      // 적의 예고 칸: 색 + 빗금 + 느낌표(색만으로 구분하지 않는다)
      for (const e of RUN.alive(rm))
        if (e.intent?.tiles && this.units.get(e.id)) for (const [x, y] of e.intent.tiles) this.warnTile(ctx, x, y, now);
      if (ov.path) {
        ctx.strokeStyle = ov.pathBad ? 'rgba(224,96,90,.9)' : 'rgba(95,201,184,.95)';
        ctx.lineWidth = 4;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(run.hero.x * T + T / 2, run.hero.y * T + T / 2);
        for (const [x, y] of ov.path) ctx.lineTo(x * T + T / 2, y * T + T / 2);
        ctx.stroke();
        const last = ov.path[ov.path.length - 1];
        if (last) {
          ctx.fillStyle = ctx.strokeStyle;
          ctx.beginPath();
          ctx.arc(last[0] * T + T / 2, last[1] * T + T / 2, 7, 0, 7);
          ctx.fill();
        }
      }
      if (ov.tile) {
        ctx.strokeStyle = 'rgba(255,255,255,.35)';
        ctx.lineWidth = 2;
        ctx.strokeRect(ov.tile.x * T + 3, ov.tile.y * T + 3, T - 6, T - 6);
      }
      // 소품과 유닛을 y 순서로
      const drawables = [];
      for (let y = 1; y < H - 1; y++)
        for (let x = 1; x < W - 1; x++)
          if (rm.tiles[y][x] === 'o')
            drawables.push({
              y: y + 0.01,
              f: () => {
                this.shadow(ctx, x, y, 22);
                gfx.frameFit(ctx, 'tiles.labyrinth', 'prop.pillar', x * T + T / 2, y * T + T * 0.95, 50, 110);
              }
            });
      for (const o of rm.objects)
        if (rm.seen[o.y * W + o.x]) drawables.push({ y: o.y + (M.blocks(o) ? 0 : -0.5), f: () => this.object(ctx, run, o, now) });
      for (const u of this.units.values()) {
        if (!u.hero && !(this.vis?.[Math.round(u.y) * W + Math.round(u.x)] || u.e?.state === 'alert')) continue;
        drawables.push({ y: u.y + 0.02, f: () => this.unit(ctx, run, u, now) });
      }
      drawables.sort((a, b) => a.y - b.y).forEach(d => d.f());
      {
        const hu0 = this.units.get('hero');
        if (
          hu0 &&
          [...this.units.values()].some(
            u => !u.hero && !u.dead && u.y > hu0.y && u.y - hu0.y < 1.6 && Math.abs(u.x - hu0.x) < 1 && u.size > 60
          )
        ) {
          ctx.globalAlpha = 0.55;
          const a0 = gfx.asset(hu0.asset);
          gfx.sprite(
            ctx,
            hu0.asset,
            gfx.actorFrame(a0, hu0.anim === 'hurt' ? 'idle' : hu0.anim, hu0.dir, now - hu0.t0),
            hu0.x * T + T / 2,
            hu0.y * T + T * 0.86,
            hu0.size
          );
          ctx.globalAlpha = 1;
        }
      }
      // 조준선
      for (const e of RUN.alive(rm))
        if (e.intent?.type === 'aim' && this.units.get(e.id)) {
          ctx.strokeStyle = 'rgba(255,80,70,.85)';
          ctx.setLineDash([8, 6]);
          ctx.lineDashOffset = -now / 40;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(e.x * T + T / 2, e.y * T + T / 3);
          ctx.lineTo(run.hero.x * T + T / 2, run.hero.y * T + T / 3);
          ctx.stroke();
          ctx.setLineDash([]);
          const hx = this.units.get('hero');
          ctx.beginPath();
          ctx.arc(hx.x * T + T / 2, hx.y * T + T / 3, 14, 0, 7);
          ctx.moveTo(hx.x * T + T / 2 - 20, hx.y * T + T / 3);
          ctx.lineTo(hx.x * T + T / 2 + 20, hx.y * T + T / 3);
          ctx.moveTo(hx.x * T + T / 2, hx.y * T + T / 3 - 20);
          ctx.lineTo(hx.x * T + T / 2, hx.y * T + T / 3 + 20);
          ctx.stroke();
        }
      // 시야·안개·붉은달 조명
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const edge = rm.tiles[y][x] === '#' || rm.tiles[y][x] === 'D',
            seen = rm.seen[y * W + x] || edge,
            vis = this.vis?.[y * W + x] || edge;
          if (!seen) {
            ctx.fillStyle = '#05070a';
            ctx.fillRect(x * T, y * T, T, T);
          } else if (!vis) {
            ctx.fillStyle = 'rgba(4,6,10,.4)';
            ctx.fillRect(x * T, y * T, T, T);
          }
        }
      const hu = this.units.get('hero'),
        ph = RUN.phaseDef(run).id,
        rad = (RUN.vision(run) + 1.2) * T,
        grd = ctx.createRadialGradient(hu.x * T + T / 2, hu.y * T + T / 2, rad * 0.45, hu.x * T + T / 2, hu.y * T + T / 2, rad * 1.5);
      grd.addColorStop(0, 'rgba(0,0,0,0)');
      grd.addColorStop(1, ph === 'red' || ph === 'hunt' ? 'rgba(70,0,14,.62)' : ph === 'stir' ? 'rgba(40,22,0,.5)' : 'rgba(0,0,0,.42)');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, W * T, H * T);
      if (ph === 'red' || ph === 'hunt') {
        ctx.fillStyle = 'rgba(150,10,30,' + (0.1 + 0.04 * Math.sin(now / 500)) + ')';
        ctx.fillRect(0, 0, W * T, H * T);
      }
      // 효과·숫자
      this.fx = this.fx.filter(f => now - f.t0 < f.dur);
      for (const f of this.fx) {
        const k = (now - f.t0) / f.dur;
        if (f.kind === 'proj') {
          const x = (f.fx + (f.tx - f.fx) * k) * T + T / 2,
            y = (f.fy + (f.ty - f.fy) * k) * T + T / 3;
          ctx.fillStyle = { fire: '#ff9a4a', ice: '#9fd0ff', arrow: '#e8e0c8', bolt: '#d6b3ff' }[f.style] || '#fff';
          ctx.beginPath();
          ctx.arc(x, y, f.style === 'arrow' ? 4 : 7, 0, 7);
          ctx.fill();
        } else if (f.kind === 'blast') {
          ctx.fillStyle = 'rgba(255,' + (f.style === 'fire' ? '150,60,' : '235,200,') + 0.6 * (1 - k) + ')';
          for (const [x, y] of f.tiles) ctx.fillRect(x * T, y * T, T, T);
        } else if (f.kind === 'flash') {
          ctx.fillStyle = 'rgba(255,255,255,' + 0.8 * (1 - k) + ')';
          ctx.fillRect(0, 0, W * T, H * T);
        }
      }
      if (ov.preview)
        for (const d of ov.preview) {
          const u = this.units.get(d.id);
          if (!u) continue;
          const txt =
            (d.min === d.max ? d.min : d.min + '~' + d.max) +
            (d.note ? ' (' + d.note + ')' : '') +
            (d.kill ? ' 처치' : '') +
            (d.crit && ov.crit ? ' · 치명 ' + d.crit + ' (' + ov.crit + '%)' : '');
          if (d.to && (d.to[0] !== u.x || d.to[1] !== u.y)) {
            ctx.strokeStyle = '#ffe27a';
            ctx.setLineDash([5, 4]);
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(u.x * T + T / 2, u.y * T + T / 2);
            ctx.lineTo(d.to[0] * T + T / 2, d.to[1] * T + T / 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.arc(d.to[0] * T + T / 2, d.to[1] * T + T / 2, 9, 0, 7);
            ctx.stroke();
          }
          this.label(ctx, u.x * T + T / 2, u.y * T + T + 4, '예상 ' + txt, d.kill ? '#ffe27a' : '#ffd9a0', '#3a1b1aee');
        }
      if (ov.marks)
        for (const m of ov.marks) {
          const u = this.units.get(m.id);
          if (u) this.label(ctx, u.x * T + T / 2, u.y * T + T + 4, m.text, '#ff9a4a', '#3a1b1aee');
        }
      this.floats = this.floats.filter(f => now - f.t0 < f.dur);
      for (const f of this.floats) {
        const k = (now - f.t0) / f.dur;
        ctx.globalAlpha = 1 - k * k;
        ctx.font = (f.big ? 'bold 24px' : 'bold 16px') + ' sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#000c';
        const x = f.x * T + T / 2,
          y = f.y * T - 8 - k * 34;
        ctx.strokeText(f.text, x, y);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, x, y);
        ctx.globalAlpha = 1;
      }
      if (this.fade) {
        ctx.fillStyle = 'rgba(0,0,0,' + this.fade + ')';
        ctx.fillRect(0, 0, W * T, H * T);
      }
      ctx.restore();
    }
    shadow(ctx, x, y, r) {
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.beginPath();
      ctx.ellipse(x * T + T / 2, y * T + T * 0.84, r, r * 0.38, 0, 0, 7);
      ctx.fill();
    }
    label(ctx, x, y, text, color, bg) {
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      const w = ctx.measureText(text).width + 12;
      ctx.fillStyle = bg || 'rgba(8,10,12,.8)';
      ctx.beginPath();
      ctx.roundRect(x - w / 2, y - 14, w, 19, 6);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
    }
    warnTile(ctx, x, y, now) {
      const px = x * T,
        py = y * T;
      ctx.save();
      ctx.beginPath();
      ctx.rect(px + 1, py + 1, T - 2, T - 2);
      ctx.clip();
      ctx.fillStyle = 'rgba(224,70,60,' + (0.22 + 0.08 * Math.sin(now / 200)) + ')';
      ctx.fillRect(px, py, T, T);
      ctx.strokeStyle = 'rgba(255,120,100,.5)';
      ctx.lineWidth = 3;
      for (let i = -T; i < T; i += 14) {
        ctx.beginPath();
        ctx.moveTo(px + i, py + T);
        ctx.lineTo(px + i + T, py);
        ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,90,80,.9)';
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 1.5, py + 1.5, T - 3, T - 3);
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd0cc';
      ctx.fillText('!', px + T - 10, py + 16);
    }
    hazard(ctx, id, px, py, now) {
      if (id === 'thorn') {
        ctx.fillStyle = 'rgba(40,60,20,.55)';
        ctx.fillRect(px + 4, py + 4, T - 8, T - 8);
        ctx.strokeStyle = '#9bbf4a';
        ctx.lineWidth = 2;
        for (let i = 0; i < 6; i++) {
          const x = px + 10 + (i % 3) * 20,
            y = py + 18 + Math.floor(i / 3) * 24;
          ctx.beginPath();
          ctx.moveTo(x - 7, y + 8);
          ctx.lineTo(x, y - 9);
          ctx.lineTo(x + 7, y + 8);
          ctx.moveTo(x - 4, y + 2);
          ctx.lineTo(x - 10, y - 3);
          ctx.moveTo(x + 4, y + 2);
          ctx.lineTo(x + 10, y - 3);
          ctx.stroke();
        }
      } else if (id === 'vent') {
        ctx.fillStyle = '#1a0d08';
        ctx.fillRect(px + 8, py + 8, T - 16, T - 16);
        const gl = 0.5 + 0.3 * Math.sin(now / 300 + px);
        ctx.fillStyle = 'rgba(255,120,30,' + gl + ')';
        for (let i = 0; i < 4; i++) ctx.fillRect(px + 12, py + 13 + i * 11, T - 24, 5);
      } else {
        ctx.fillStyle = 'rgba(60,110,190,.5)';
        ctx.fillRect(px + 2, py + 2, T - 4, T - 4);
        ctx.strokeStyle = 'rgba(190,220,255,.5)';
        ctx.lineWidth = 2;
        const o = (now / 600 + px) % 1;
        ctx.beginPath();
        ctx.ellipse(px + T / 2, py + T / 2, 8 + o * 16, 4 + o * 8, 0, 0, 7);
        ctx.stroke();
      }
    }
    door(ctx, run, x, y) {
      const info = RUN.doorInfo(run, x, y);
      if (!info) return;
      const px = x * T,
        py = y * T;
      ctx.fillStyle = '#05070a';
      ctx.fillRect(px + 8, py + 8, T - 16, T - 16);
      ctx.strokeStyle = info.sealed ? '#e0605a' : '#c9a35a';
      ctx.lineWidth = 3;
      ctx.strokeRect(px + 7.5, py + 7.5, T - 15, T - 15);
      if (info.sealed) {
        ctx.lineWidth = 4;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(px + 18 + i * 14, py + 10);
          ctx.lineTo(px + 18 + i * 14, py + T - 10);
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = '#c9a35a';
        ctx.font = 'bold 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText({ N: '▲', S: '▼', W: '◀', E: '▶' }[info.dir], px + T / 2, py + T / 2 + 8);
      }
      const name = info.sealed ? '봉인됨' : info.target.known ? info.target.name : '미탐사';
      const lx = info.dir === 'W' ? px + T + 44 : info.dir === 'E' ? px - 44 : px + T / 2,
        ly = info.dir === 'N' ? py + T + 16 : info.dir === 'S' ? py - 6 : py - 4;
      this.label(ctx, lx, ly, name, info.sealed ? '#f3a29d' : info.target.visited ? '#9aa3a6' : '#e9e4d8');
    }
    object(ctx, run, o, now) {
      const cx = o.x * T + T / 2,
        by = o.y * T + T * 0.9,
        near = Math.abs(o.x - run.hero.x) + Math.abs(o.y - run.hero.y) <= 1;
      if (M.blocks(o)) this.shadow(ctx, o.x, o.y, 22);
      if (near && o.kind !== 'trap' && RUN.interactions(run, o).length) {
        ctx.strokeStyle = 'rgba(255,226,122,.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(cx, o.y * T + T * 0.84, 28, 11, 0, 0, 7);
        ctx.stroke();
      }
      const tileFrame = (name, s = 1) => gfx.frameFit(ctx, 'tiles.labyrinth', name, cx, by, 54 * s, 54 * s);
      if (o.kind === 'node') {
        if (NODE_ART[o.mat]) tileFrame(NODE_ART[o.mat][1]);
        else {
          if (o.mat === 'moonshard') {
            ctx.save();
            ctx.filter = 'hue-rotate(120deg) saturate(2)';
            gfx.drawFit(ctx, 'material.crystal', cx, by, 44, 48);
            ctx.restore();
          } else gfx.drawFit(ctx, 'material.' + o.mat, cx, by, 44, 48);
        }
        const tw = 0.5 + 0.5 * Math.sin(now / 350 + o.x);
        ctx.fillStyle = 'rgba(255,240,180,' + tw * 0.9 + ')';
        ctx.fillRect(cx + 14, by - 46, 3, 3);
        ctx.fillRect(cx - 18, by - 30, 2, 2);
      } else if (o.kind === 'chest') {
        if (o.chest === 'vault') gfx.drawFit(ctx, 'prop.cache', cx, by, 54, 52);
        else tileFrame('prop.chest');
        if (o.opened && !o.contents?.length) {
          ctx.fillStyle = 'rgba(0,0,0,.5)';
          ctx.fillRect(cx - 26, by - 50, 52, 50);
        } else if (o.chest !== 'basic' && !o.opened) this.label(ctx, cx, by - 56, '봉인', '#d6b3ff');
      } else if (o.kind === 'barrel') {
        // 폭발통: 상자 그림에 붉은 빛. 불이 붙으면 깜박인다.
        ctx.save();
        ctx.filter = 'hue-rotate(-25deg) saturate(1.9)' + (o.fuse && Math.floor(now / 160) % 2 ? ' brightness(1.7)' : '');
        gfx.drawFit(ctx, 'decor.crate', cx, by, 46, 46);
        ctx.restore();
        this.label(ctx, cx, by - 52, o.fuse ? '곧 폭발!' : '폭발통', o.fuse ? '#ff8f7a' : '#f3c77e');
      } else if (o.kind === 'crate') {
        tileFrame('prop.crate', 1.05);
      } else if (o.kind === 'lever') {
        // 레버: 받침 + 손잡이(당긴 쪽으로 기운다)
        const lean = o.on ? 14 : -14;
        ctx.fillStyle = '#4a4339';
        ctx.fillRect(cx - 16, by - 12, 32, 10);
        ctx.strokeStyle = '#c9a35a';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(cx, by - 10);
        ctx.lineTo(cx + lean, by - 40);
        ctx.stroke();
        ctx.fillStyle = '#e0605a';
        ctx.beginPath();
        ctx.arc(cx + lean, by - 42, 6, 0, 7);
        ctx.fill();
        this.label(ctx, cx, by - 58, '레버', '#f3c77e');
      } else if (o.kind === 'portal') {
        tileFrame('prop.portal', 1.7);
        this.label(ctx, cx, by - 96, o.rift ? '귀환 균열' : '귀환문', '#ffe27a');
      } else if (o.kind === 'device') {
        ctx.save();
        if (!o.on) ctx.filter = 'grayscale(.8) brightness(.8)';
        gfx.drawFit(ctx, 'prop.seal', cx, by, 56, 50);
        ctx.restore();
        this.label(ctx, cx, by - 54, o.on ? '작동함' : '봉인 장치', o.on ? '#8ecf72' : '#d6b3ff');
      } else if (o.kind === 'camp') {
        ctx.save();
        if (o.used) ctx.filter = 'grayscale(1) brightness(.6)';
        gfx.drawFit(ctx, 'prop.camp', cx, by, 56, 52);
        ctx.restore();
      } else if (o.kind === 'altar') {
        ctx.save();
        if (o.used) ctx.filter = 'grayscale(1) brightness(.6)';
        gfx.drawFit(ctx, 'prop.altar', cx, by, 56, 56);
        ctx.restore();
      } else if (o.kind === 'objective') {
        const bob = Math.sin(now / 300) * 4;
        ctx.fillStyle = 'rgba(255,226,122,.25)';
        ctx.beginPath();
        ctx.arc(cx, by - 26, 26 + bob, 0, 7);
        ctx.fill();
        gfx.drawFit(ctx, 'material.relic', cx, by - 6 + bob, 40, 40);
        this.label(ctx, cx, by - 58, D.REGIONS[run.regionId].objective.name, '#ffe27a');
      } else if (o.kind === 'pile') {
        gfx.drawFit(ctx, 'gear.pack', cx, by - 4, 30, 30);
      } else if (o.kind === 'trap') {
        ctx.strokeStyle = '#ffe27a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, o.y * T + T / 2, 16, 0, 7);
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4;
          ctx.moveTo(cx + Math.cos(a) * 16, o.y * T + T / 2 + Math.sin(a) * 16);
          ctx.lineTo(cx + Math.cos(a) * 23, o.y * T + T / 2 + Math.sin(a) * 23);
        }
        ctx.stroke();
      }
      if (!o.opened && !o.on && RUN.guardsNear(run, o).length)
        this.label(ctx, cx, by - (o.kind === 'node' ? 56 : 72), '경비 중', '#ff8f7a');
    }
    unit(ctx, run, u, now) {
      const a = gfx.asset(u.asset);
      let px = u.x * T + T / 2,
        py = u.y * T + T * 0.86 - (u.hop || 0);
      if (u.lunge) {
        const k = Math.min(1, (now - u.lunge.t0) / 200),
          amt = Math.sin(k * Math.PI) * 12,
          dx = u.lunge.tx - u.x,
          dy = u.lunge.ty - u.y,
          len = Math.hypot(dx, dy) || 1;
        px += (dx / len) * amt;
        py += (dy / len) * amt;
      }
      const hover = this.overlay.hoverId === u.id,
        target = this.overlay.preview?.some(d => d.id === u.id);
      ctx.fillStyle = 'rgba(0,0,0,.4)';
      ctx.beginPath();
      ctx.ellipse(u.x * T + T / 2, u.y * T + T * 0.86, u.size * 0.36, u.size * 0.13, 0, 0, 7);
      ctx.fill();
      ctx.lineWidth = hover || target ? 3 : 2;
      ctx.strokeStyle = u.hero
        ? 'rgba(95,201,184,.9)'
        : u.e?.state === 'alert'
          ? hover || target
            ? '#ffb4a8'
            : 'rgba(224,96,90,.85)'
          : 'rgba(200,200,200,.5)';
      ctx.beginPath();
      ctx.ellipse(u.x * T + T / 2, u.y * T + T * 0.86, u.size * 0.4 + 3, u.size * 0.15 + 2, 0, 0, 7);
      ctx.stroke();
      const frame = gfx.actorFrame(a, u.anim === 'hurt' && u.hero ? 'idle' : u.anim, u.dir, now - u.t0),
        bob = u.anim === 'walk' && !u.hero ? Math.abs(Math.sin(now / 70)) * 5 : u.anim === 'idle' ? Math.sin(now / 420 + u.x) * 1.2 : 0;
      ctx.globalAlpha = u.dead ? Math.max(0, 1 - (now - u.dieT) / 260) : u.born ? Math.min(1, (now - u.born) / 300) : 1;
      const flash = u.flash && now - u.flash < 140;
      gfx.sprite(
        ctx,
        u.asset,
        frame,
        px,
        py - bob,
        u.size,
        !u.hero && a.facesLeft && u.dir === 'right',
        flash ? 'brightness(2.2)' : u.tint
      );
      ctx.globalAlpha = 1;
      if (u.dead) return; // 죽은 유닛에는 체력바·배지를 그리지 않는다
      const top = py - u.size - 12,
        w = Math.max(36, u.size * 0.7);
      if (!u.hero) {
        const e = u.e;
        ctx.fillStyle = '#000b';
        ctx.fillRect(px - w / 2 - 1, top - 1, w + 2, 7);
        ctx.fillStyle = '#5a1f1c';
        ctx.fillRect(px - w / 2, top, w, 5);
        ctx.fillStyle = D.ENEMIES[e.kind].boss ? '#ffb347' : '#e0605a';
        ctx.fillRect(px - w / 2, top, (w * Math.max(0, u.hp)) / u.maxHp, 5);
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.strokeText(Math.max(0, u.hp) + '/' + u.maxHp, px, top - 3);
        ctx.fillText(Math.max(0, u.hp) + '/' + u.maxHp, px, top - 3);
        let badge =
          e.state !== 'alert'
            ? e.patrol
              ? '↔ 순찰'
              : '… 방심'
            : e.st.stun
              ? '✶ 기절'
              : e.intent
                ? { aim: '◎ 조준 ', area: '▼ ', charge: '➤ 돌진 ', summon: '✦ 소환', blink: '✦ 점멸' }[e.intent.type] +
                  (e.intent.type === 'area' ? e.intent.label + ' ' : '') +
                  (e.intent.dmg || '')
                : D.ENEMIES[e.kind].boss
                  ? '⚔ ' +
                    Math.max(1, D.ENEMIES[e.kind].dmg - 2 + (run.phase >= 2 ? 1 : 0)) +
                    ' · 다음 ' +
                    {
                      sweep: '휩쓸기',
                      charge: '돌진',
                      summon: '소환',
                      slam: '내려찍기',
                      vent: '열기',
                      runes: '문양',
                      beam: '광선',
                      blink: '점멸'
                    }[D.ENEMIES[e.kind].pattern[e.step % D.ENEMIES[e.kind].pattern.length]]
                  : D.ENEMIES[e.kind].range
                    ? '◎ 자리잡기'
                    : '⚔ ' + Math.max(1, D.ENEMIES[e.kind].dmg + (run.phase >= 2 ? 1 : 0) - (e.st.poison ? 1 : 0));
        this.label(
          ctx,
          px,
          top - 16,
          badge,
          e.state === 'alert' ? '#ffd0cc' : '#c9cfd0',
          e.state === 'alert' ? 'rgba(70,20,18,.88)' : 'rgba(20,24,28,.8)'
        );
        let sx = px - w / 2;
        for (const [k, col, name] of [
          ['burn', '#ff9a4a', '화'],
          ['poison', '#a6e06a', '독'],
          ['root', '#9fd0ff', '속'],
          ['exposed', '#d6b3ff', '틈']
        ])
          if (e.st[k]) {
            ctx.fillStyle = col;
            ctx.beginPath();
            ctx.roundRect(sx, top + 8, 24, 13, 4);
            ctx.fill();
            ctx.fillStyle = '#111';
            ctx.font = 'bold 10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(name + e.st[k], sx + 12, top + 18);
            sx += 27;
          }
        if (e.armor) {
          ctx.fillStyle = '#b8c4cc';
          ctx.beginPath();
          ctx.roundRect(px + w / 2 + 3, top - 3, 22, 13, 4);
          ctx.fill();
          ctx.fillStyle = '#111';
          ctx.font = 'bold 10px sans-serif';
          ctx.fillText('갑' + e.armor, px + w / 2 + 14, top + 7);
        }
      } else {
        const h = run.hero,
          bw = 46;
        ctx.fillStyle = '#000b';
        ctx.fillRect(px - bw / 2 - 1, top - 1, bw + 2, 8);
        ctx.fillStyle = '#1f3a2a';
        ctx.fillRect(px - bw / 2, top, bw, 6);
        ctx.fillStyle = u.hp / u.maxHp > 0.35 ? '#6fd38a' : '#f0a545';
        ctx.fillRect(px - bw / 2, top, (bw * Math.max(0, u.hp)) / u.maxHp, 6);
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.fillStyle = '#fff';
        const txt = Math.max(0, u.hp) + '/' + u.maxHp + (h.block > 0 ? '  🛡' + h.block : '');
        ctx.strokeText(txt, px, top - 3);
        ctx.fillText(txt, px, top - 3);
        const gmax = D.RULES.gauge.max,
          g = h.gauge || 0;
        for (let i = 0; i < gmax; i++) {
          ctx.fillStyle = i < g ? (g >= D.RULES.gauge.cost ? '#d6b3ff' : '#8f7ac0') : 'rgba(0,0,0,.55)';
          ctx.beginPath();
          ctx.arc(px - (gmax - 1) * 4.5 + i * 9, top + 12, 3, 0, 7);
          ctx.fill();
        }
      }
    }
  }
  ER.RunView = RunView;
})(typeof globalThis !== 'undefined' ? globalThis : this);
