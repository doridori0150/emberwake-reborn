/* 앱 통합: 화면 전환, 입력, HUD, 길드 패널, 준비·정산·저장 모달, 자동 저장.
   규칙은 ER.run / ER.guild 에만 있다. 여기서는 행동을 보내고 결과를 그린다. */
(function (g) {
  'use strict';
  const ER = g.ER,
    D = ER.data,
    RUN = ER.run,
    G = ER.guild,
    M = ER.map,
    gfx = ER.gfx;
  const $ = s => document.querySelector(s),
    el = (tag, cls, html) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (html != null) e.innerHTML = html;
      return e;
    };
  let showThreat = false,
    state = null,
    runView = null,
    guildView = null,
    sel = null,
    hover = null,
    kbTarget = null,
    drawerId = null,
    toastTimer = 0,
    saving = Promise.resolve(),
    readOnly = false;
  const matName = k => (k === 'gold' ? '금화' : D.MATERIALS[k].name),
    icon = (id, cls) => '<img class="' + (cls || 'ico') + '" src="' + gfx.url(id) + '" alt="">',
    matIcon = k => icon('material.' + (k === 'moonshard' ? 'crystal' : k));
  const chip = (k, text, cls) => '<span class="chip ' + (cls || '') + '" title="' + matName(k) + '">' + matIcon(k) + text + '</span>';
  const costChips = (Gs, cost, extra) =>
    Object.entries(cost)
      .map(([k, n]) => {
        const have = G.have(Gs, k) + (extra?.[k] || 0);
        return chip(k, matName(k) + ' ' + have + '/' + n, have >= n ? 'ok' : 'lack');
      })
      .join('');

  // ───────── 저장
  function persist() {
    if (readOnly || !state) return;
    const snap = JSON.parse(JSON.stringify(Object.assign({}, state, { run: state.run ? RUN.strip(state.run) : null })));
    saving = saving
      .then(() => ER.save.save(snap))
      .then(r => {
        if (!r.ok) saveProblem(r);
      })
      .catch(e => saveProblem({ reason: String(e) }));
    return saving;
  }
  function saveProblem(r) {
    const b = $('#banner');
    b.hidden = false;
    b.innerHTML = '<span>⚠ ' + (r.reason || '저장 실패') + '</span>';
    if (r.conflict) {
      readOnly = true;
      const a = el('button', 'small', '새로고침하여 최신 진행 불러오기');
      a.onclick = () => location.reload();
      const c = el('button', 'small danger', '이 탭의 진행으로 덮어쓰기');
      c.onclick = async () => {
        readOnly = false;
        const x = await ER.save.save(
          JSON.parse(JSON.stringify(Object.assign({}, state, { run: state.run ? RUN.strip(state.run) : null }))),
          true
        );
        if (x.ok) b.hidden = true;
      };
      b.append(a, c);
    } else {
      const a = el('button', 'small', '다시 저장');
      a.onclick = () => {
        b.hidden = true;
        persist();
      };
      const e2 = el('button', 'small', '파일로 내보내기');
      e2.onclick = exportSave;
      b.append(a, e2);
    }
  }
  function freshState() {
    return {
      meta: { created: 'ER' + Date.now().toString(36), app: ER.save.APP },
      guild: G.newGame(),
      run: null,
      settings: { fast: false, sound: true },
      flags: { intro: false }
    };
  }
  function exportSave() {
    const blob = new Blob([ER.save.exportText(Object.assign({}, state, { run: state.run ? RUN.strip(state.run) : null }))], {
        type: 'application/json'
      }),
      a = el('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'emberwake-reborn-save-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ───────── 공통 UI
  function modal(html, opts = {}) {
    const m = $('#modal'),
      box = $('#modalBox');
    box.innerHTML = html;
    m.hidden = false;
    m.dataset.lock = opts.lock ? '1' : '';
    m.onclick = e => {
      if (e.target === m && !opts.lock) closeModal();
    };
    return box;
  }
  function closeModal() {
    $('#modal').hidden = true;
    $('#modalBox').innerHTML = '';
  }
  const modalOpen = () => !$('#modal').hidden;
  function ask(title, body, yesLabel, danger) {
    return new Promise(res => {
      const box = modal(
        '<h2>' +
          title +
          '</h2><p class="lead">' +
          body +
          '</p><div class="row"><button id="askNo" type="button">취소 <kbd>Esc</kbd></button><button id="askYes" class="' +
          (danger ? 'danger' : 'primary') +
          ' big" type="button">' +
          yesLabel +
          '</button></div>',
        { lock: true }
      );
      box.querySelector('#askNo').onclick = () => {
        closeModal();
        res(false);
      };
      box.querySelector('#askYes').onclick = () => {
        closeModal();
        res(true);
      };
    });
  }
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      t.hidden = true;
    }, 1900);
  }
  function show(screen) {
    $('#guild').hidden = screen !== 'guild';
    $('#run').hidden = screen !== 'run';
  }
  function cardHTML(c, o = {}) {
    return (
      '<div class="top">' +
      icon(c.art) +
      '<span>' +
      c.name +
      '</span></div><span class="slotbadge">' +
      (c.slot === 'main' ? '주 행동' : '보조') +
      '</span><div class="txt">' +
      c.text +
      '</div><div class="meta">' +
      (c.target === 'self' ? '자신' : '사거리 ' + c.range) +
      (c.exhaust ? ' · 소진' : '') +
      '</div>' +
      (o.key ? '<span class="key">' + o.key + '</span>' : '')
    );
  }

  // ═════════ 길드 화면
  // 이벤트 대화: 규칙(run.js / guild.js)이 띄운 pendingEvent 를 대화창으로 보여 주고, 고른 선택지를 규칙에 돌려준다.
  function openRunEvent() {
    const r = run(),
      pe = r?.pendingEvent;
    if (!pe || ER.dialog.isOpen() || modalOpen()) return;
    const e = ER.events.get(pe.id);
    if (!e) return doAct({ t: 'event', choice: -1 });
    const have = RUN.evHave(r);
    ER.audio.play('ui');
    ER.dialog.open(e, {
      vars: { hero: D.HEROES[r.heroId].name },
      can: c => ER.events.requireOk(c.require, have),
      onChoose: k => doAct({ t: 'event', choice: k })
    });
  }
  function checkGuildEvent() {
    const Gs = state?.guild,
      pe = Gs?.pendingEvent;
    if (!pe || ER.dialog.isOpen() || modalOpen() || $('#guild').hidden) return;
    const e = ER.events.get(pe.id),
      done = k => {
        const res = G.answer(Gs, k);
        persist();
        renderGuild();
        if (res.note) guildToast(res.note);
      };
    if (!e) return done(-1);
    G.ensure(Gs);
    const have = G.evHave(Gs);
    ER.dialog.open(e, { vars: { hero: D.HEROES[Gs.selected.hero].name }, can: c => ER.events.requireOk(c.require, have), onChoose: done });
  }
  // 주민에게 말 걸기: 그 주민에게 걸린 이벤트(npcTalk)가 있으면 그것을, 없으면 인사 한마디 뒤 맡은 시설 패널을 연다.
  let greetTurn = 0;
  function talkTo(id) {
    const Gs = state.guild;
    if (id.startsWith('hero.')) {
      const h = D.HEROES[id.slice(5)];
      return ER.dialog.open(
        {
          name: h.name,
          pages: [{ speaker: h.name, portrait: h.asset, side: 'right', text: h.build }],
          choices: [{ label: '이 대원으로 바꾼다' }, { label: '그만둔다' }]
        },
        {
          onChoose: k => {
            if (k === 0 && G.selectHero(Gs, h.id).ok) {
              persist();
              renderGuild();
            }
          }
        }
      );
    }
    const n = D.NPCS[id];
    if (!n) return;
    if (G.fire(Gs, 'npcTalk', { npc: id })) {
      persist();
      return checkGuildEvent();
    }
    const ruin = n.role && Gs.facilities[n.role] < 1,
      lines = (ruin && n.greetRuin?.length ? n.greetRuin : n.greet) || ['…'],
      text = lines[greetTurn++ % lines.length],
      page = { speaker: n.name, portrait: 'npc.' + id, side: 'right', text };
    if (n.role === 'stash' && !ruin)
      return ER.dialog.open(
        {
          name: n.name,
          pages: [page],
          choices: [
            {
              label: Gs.shop.done ? '오늘 장사는 마쳤다 (원정을 다녀오면 새 날)' : '가게를 연다 — 진열하고 값을 정한다',
              require: Gs.shop.done ? { flag: '__never' } : null
            },
            { label: '창고를 본다 (재고·급매·확장)' },
            { label: '그만둔다' }
          ]
        },
        {
          can: c => !c.require,
          onChoose: k => {
            if (k === 0) openShop();
            else if (k === 1) openDrawer('stash');
          }
        }
      );
    ER.dialog.open(
      { name: n.name, pages: [page], choices: [] },
      {
        onClose: () => {
          if (n.role) openDrawer(n.role);
        }
      }
    );
  }
  /* 가게: 진열(재료·수량·가격) → 장사(손님이 하나씩 와서 반응) → 결산. 결과는 guild.shopDay 가 한 번에 계산하고 화면은 그것을 재생만 한다. */
  function openShop() {
    const Gs = state.guild,
      slots = G.shopSlots(Gs),
      shelves = Array.from({ length: slots }, () => null),
      mats = () => Object.keys(D.MATERIALS).filter(k => (Gs.stock[k] || 0) > 0);
    const MOOD = {
      cheap: ['횡재다!', '#8ecf72', '너무 싸게 팔았다'],
      happy: ['좋은 값이네', '#5fc9b8', '만족하며 샀다'],
      reluctant: ['음… 비싸지만', '#f3c77e', '망설이다 하나만 샀다'],
      refuse: ['너무 비싸!', '#e0605a', '그냥 돌아갔다']
    };
    const noteText = k => {
      const n = Gs.shop.notes[k];
      if (!n) return '아직 팔아 본 적 없음 · 기준가 ' + D.MATERIALS[k].value;
      const p = [];
      if (n.cheap) p.push('<span style="color:#8ecf72">' + n.cheap + ' 이하: 횡재</span>');
      if (n.happy) p.push('<span style="color:#5fc9b8">' + n.happy + ': 만족</span>');
      if (n.reluctant) p.push('<span style="color:#f3c77e">' + n.reluctant + ': 망설임</span>');
      if (n.refuse && n.refuse < 9999) p.push('<span style="color:#e0605a">' + n.refuse + ' 이상: 거절</span>');
      return p.join(' · ');
    };
    const box = modal(
      '<h2>가게 열기 — ' +
        Gs.day +
        '일째</h2><p class="lead">진열대 ' +
        slots +
        '칸에 재료를 올리고 <b>개당 가격</b>을 정하세요. 손님 약 ' +
        G.shopCustomers(Gs) +
        '명이 와서 표정으로 값을 알려 줍니다. 많이 판 재료는 한동안 값이 떨어집니다. 하루에 한 번만 열 수 있습니다.</p><div id="shShelves" class="cardlist"></div><div class="row"><span id="shSum" class="src" style="flex:1"></span><button id="shCancel" type="button">닫기</button><button id="shGo" class="primary" type="button">장사 시작</button></div>'
    );
    const draw = () => {
      const wrap = box.querySelector('#shShelves');
      wrap.innerHTML = '';
      const used = {};
      shelves.forEach(sh => {
        if (sh) used[sh.mat] = (used[sh.mat] || 0) + sh.qty;
      });
      shelves.forEach((sh, i) => {
        const d = el('div', 'item');
        if (!sh) {
          const free = mats().filter(k => (Gs.stock[k] || 0) - (used[k] || 0) > 0);
          d.innerHTML =
            icon('decor.crate', '') +
            '<div class="nm">진열대 ' +
            (i + 1) +
            ' — 비어 있음</div><div class="btns"></div><div class="ef">' +
            (free.length ? '' : '올릴 재료가 없다') +
            '</div>';
          const sel = el('select');
          sel.innerHTML =
            '<option value="">재료 고르기…</option>' +
            free.map(k => '<option value="' + k + '">' + matName(k) + ' (' + ((Gs.stock[k] || 0) - (used[k] || 0)) + ')</option>').join('');
          sel.onchange = () => {
            const k = sel.value;
            if (!k) return;
            const n = Gs.shop.notes[k] || {};
            shelves[i] = {
              mat: k,
              qty: Math.min((Gs.stock[k] || 0) - (used[k] || 0), D.MATERIALS[k].stack),
              price: n.happy || D.MATERIALS[k].value
            };
            draw();
          };
          d.querySelector('.btns').append(sel);
        } else {
          const max = (Gs.stock[sh.mat] || 0) - (used[sh.mat] || 0) + sh.qty,
            demand = Gs.shop.demand[sh.mat];
          d.innerHTML =
            matIcon(sh.mat) +
            '<div class="nm">' +
            matName(sh.mat) +
            (demand ? ' <span class="src">수요 ' + Math.round(demand * 100) + '%</span>' : '') +
            '</div><div class="btns"></div><div class="ef">가격 수첩: ' +
            noteText(sh.mat) +
            '</div>';
          const mk = (label, fn) => {
              const b = el('button', 'small', label);
              b.type = 'button';
              b.onclick = () => {
                fn();
                draw();
              };
              return b;
            },
            btns = d.querySelector('.btns');
          btns.append(
            '수량 ',
            mk('−', () => {
              sh.qty = Math.max(1, sh.qty - 1);
            }),
            el('b', '', ' ' + sh.qty + ' '),
            mk('+', () => {
              sh.qty = Math.min(max, sh.qty + 1);
            }),
            ' 가격 ',
            mk('−', () => {
              sh.price = Math.max(1, sh.price - 1);
            }),
            el('b', '', ' ' + sh.price + ' '),
            mk('+', () => {
              sh.price = Math.min(99, sh.price + 1);
            }),
            ' ',
            mk('내리기', () => {
              shelves[i] = null;
            })
          );
        }
        wrap.append(d);
      });
      const on = shelves.filter(Boolean);
      box.querySelector('#shSum').textContent = on.length
        ? '다 팔리면 금화 ' +
          on.reduce((n, sh) => n + sh.qty * sh.price, 0) +
          ' (급매로 팔면 ' +
          on.reduce((n, sh) => n + sh.qty * G.quickPrice(Gs, sh.mat), 0) +
          ')'
        : '';
      box.querySelector('#shGo').disabled = !on.length;
    };
    draw();
    box.querySelector('#shCancel').onclick = closeModal;
    box.querySelector('#shGo').onclick = () => {
      const list = shelves.filter(Boolean),
        res = G.shopDay(Gs, list);
      if (!res.ok) return toastIn(box, res.reason);
      persist();
      playShop(list, res);
    };
    const toastIn = (b, msg) => {
      b.querySelector('#shSum').textContent = msg;
    };
    function playShop(list, res) {
      const b2 = modal(
        '<h2>장사 중…</h2><canvas id="shCv" width="640" height="230" style="width:100%;border-radius:8px;background:#1b1510"></canvas><div id="shLog" class="src" style="min-height:3.2em;margin:8px 0"></div><div class="row"><span id="shGold" style="flex:1;font-weight:700">금화 +0</span><button id="shSkip" type="button">빨리 감기</button><button id="shDone" class="primary" type="button" disabled>결산</button></div>',
        { lock: true }
      );
      const cv = b2.querySelector('#shCv'),
        ctx = cv.getContext('2d'),
        left = list.map(sh => sh.qty),
        sx = i => Math.round((560 * (i + 1)) / (list.length + 1)) + 20;
      let vi = -1,
        t0 = 0,
        gold = 0,
        fast = false,
        raf = 0,
        bubble = null;
      const DUR = () => (fast ? 280 : 1500);
      const frame = now => {
        if (!document.body.contains(cv)) return;
        if (vi < 0 || now - t0 > DUR()) {
          if (vi >= 0) {
            const v = res.visits[vi];
            left[v.shelf] -= v.qty;
            gold += v.gold;
            b2.querySelector('#shGold').textContent = '금화 +' + gold;
          }
          vi++;
          t0 = now;
          if (vi >= res.visits.length) {
            finish();
            return;
          }
          const v = res.visits[vi],
            m = MOOD[v.mood];
          bubble = m;
          b2.querySelector('#shLog').innerHTML =
            '손님 ' +
            (vi + 1) +
            '/' +
            res.visits.length +
            ' — ' +
            matName(v.mat) +
            ' ' +
            v.price +
            '금화: <b style="color:' +
            m[1] +
            '">' +
            m[0] +
            '</b> ' +
            m[2] +
            (v.qty ? ' (' + v.qty + '개, +' + v.gold + ')' : '');
          if (v.qty) ER.audio.play('build');
        }
        const v = res.visits[vi],
          p = Math.min(1, (now - t0) / DUR()),
          tx = sx(v.shelf),
          cx = p < 0.35 ? 660 - (660 - tx) * (p / 0.35) : p < 0.7 ? tx : tx - (tx + 40) * ((p - 0.7) / 0.3);
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = '#2a2018';
        ctx.fillRect(0, 0, 640, 230);
        ctx.fillStyle = '#3a2c20';
        ctx.fillRect(0, 150, 640, 80);
        for (let x = 0; x < 640; x += 64) {
          ctx.fillStyle = 'rgba(0,0,0,.12)';
          ctx.fillRect(x, 150, 2, 80);
        }
        list.forEach((sh, i) => {
          const x = sx(i);
          if (gfx.image('town.shop_counter')) gfx.drawFit(ctx, 'town.shop_counter', x, 168, 120, 96);
          else gfx.frameFit(ctx, 'tiles.labyrinth', 'prop.table', x, 150, 90, 70);
          if (left[i] > 0) gfx.drawFit(ctx, 'material.' + (sh.mat === 'moonshard' ? 'crystal' : sh.mat), x, 112, 34, 34);
          ctx.font = 'bold 13px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = 'rgba(8,10,12,.85)';
          ctx.fillRect(x - 34, 154, 68, 20);
          ctx.fillStyle = left[i] > 0 ? '#ffe27a' : '#9aa3a6';
          ctx.fillText(left[i] > 0 ? sh.price + '금 ×' + left[i] : '품절', x, 169);
        });
        const hero = ['ara', 'noa', 'lumi'][vi % 3],
          a = gfx.asset(D.HEROES[hero].asset),
          walking = p < 0.35 || p >= 0.7;
        gfx.sprite(
          ctx,
          D.HEROES[hero].asset,
          gfx.actorFrame(a, walking ? 'walk' : 'idle', p < 0.7 ? (p < 0.35 ? 'left' : 'up') : 'left', now),
          cx,
          214,
          64,
          false,
          ['hue-rotate(40deg) saturate(.7)', 'hue-rotate(150deg) saturate(.6)', 'hue-rotate(260deg) saturate(.7)', 'sepia(.6)'][vi % 4]
        );
        if (p >= 0.35 && p < 0.75 && bubble) {
          ctx.font = 'bold 14px sans-serif';
          const w = ctx.measureText(bubble[0]).width + 16;
          ctx.fillStyle = '#10161a';
          ctx.beginPath();
          ctx.roundRect(cx - w / 2, 120, w, 24, 8);
          ctx.fill();
          ctx.strokeStyle = bubble[1];
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.fillStyle = bubble[1];
          ctx.fillText(bubble[0], cx, 137);
        }
        raf = requestAnimationFrame(frame);
      };
      const finish = () => {
        cancelAnimationFrame(raf);
        b2.querySelector('#shSkip').disabled = true;
        const done = b2.querySelector('#shDone');
        done.disabled = false;
        done.focus();
        const sold =
            Object.entries(res.sold)
              .map(([k, n]) => matName(k) + ' ' + n)
              .join(', ') || '없음',
          un = res.unsold.map(u => matName(u.mat) + ' ' + u.qty).join(', ');
        b2.querySelector('#shLog').innerHTML =
          '<b>결산</b> — 판매: ' +
          sold +
          (un ? ' · 남은 것(창고로): ' + un : '') +
          '<br>손님 반응은 가격 수첩에 적어 두었다. 해가 기운다 — 원정을 다녀오면 새 날이 온다.';
        b2.querySelector('#shGold').textContent = '금화 +' + res.gold;
      };
      b2.querySelector('#shSkip').onclick = () => {
        fast = true;
      };
      b2.querySelector('#shDone').onclick = () => {
        closeModal();
        renderGuild();
        guildToast('오늘 장사: 금화 +' + res.gold);
      };
      raf = requestAnimationFrame(frame);
    }
  }
  function enterGuild() {
    G.fire(state.guild, 'guildVisit', {});
    show('guild');
    runView.setRun(null);
    guildView.setState(state.guild);
    renderGuild();
    if (state.guild.lastReport && !state.guild.lastReport.seen) showReport();
    else if (!state.flags.intro) showIntro();
  }
  function renderGuild() {
    const Gs = state.guild;
    guildView.setState(Gs);
    G.ensure(Gs);
    $('#guildStage').textContent = guildView.stageName() + ' · ' + Gs.day + '일째 ' + (G.dayPhase(Gs) === 'dusk' ? '해 질 녘' : '낮');
    setTimeout(checkGuildEvent, 0);
    const keys = ['gold', ...Object.keys(D.MATERIALS).filter(k => Gs.stock[k])];
    $('#stockBar').innerHTML = keys.map(k => chip(k, String(G.have(Gs, k)))).join('') || '<span class="chip">창고가 비어 있다</span>';
    const pin = $('#pinChip');
    if (Gs.pinned) {
      const t = G.target(Gs, Gs.pinned);
      pin.hidden = false;
      pin.innerHTML =
        '📌 목표: ' +
        t.name +
        ' — ' +
        (t.can
          ? '<b>지금 가능!</b>'
          : Object.entries(t.missing)
              .map(([k, n]) => matName(k) + ' ' + n)
              .join(', ') + ' 부족');
      pin.onclick = () => openTarget(Gs.pinned);
    } else {
      pin.hidden = false;
      pin.innerHTML = '📌 투자 목표 없음 — 시설에서 고정';
      pin.onclick = () => openDrawer('workshop');
    }
    const can = G.allTargets(Gs).filter(t => t.can),
      hint = $('#guildHint');
    if (can.some(t => t.t.kind === 'facility'))
      hint.innerHTML = '<b>▲ 표시</b>가 뜬 주민에게 말을 걸어 복구·강화하세요. 마을이 달라지면 다음 원정도 달라집니다.';
    else if (Gs.facilities.stash >= 1 && !Gs.shop.done && Object.keys(Gs.stock).some(k => Gs.stock[k] > 0))
      hint.innerHTML = '<b>창고지기</b>에게 말을 걸어 <b>가게</b>를 열 수 있습니다. 진열하고 값을 정하면 손님이 와서 삽니다(하루 한 번).';
    else if (!Gs.stats.runs)
      hint.innerHTML =
        '길드는 폐허입니다. <b>WASD·클릭</b>으로 걸어가 <b>원정의 문</b> 곁에서 <b>E</b>(또는 Enter)로 첫 원정을 준비하세요. 첫 목표: <b>제작 공방 복구</b>(고목재 4 · 철광 3).';
    else if (can.length)
      hint.innerHTML =
        '지금 할 수 있는 투자 <b>' +
        can.length +
        '</b>건: ' +
        can
          .slice(0, 3)
          .map(t => t.name)
          .join(' · ') +
        (can.length > 3 ? ' …' : '');
    else
      hint.innerHTML = Gs.pinned
        ? '목표에 필요한 재료를 구하러 다시 미궁으로. 준비 화면에서 어디서 나오는지 볼 수 있습니다.'
        : '시설 패널에서 다음 투자 목표를 <b>📌 고정</b>해 두면 원정 중에도 진행을 볼 수 있습니다.';
    const nav = $('#guildNav');
    nav.innerHTML = '';
    for (const id of Object.keys(D.FACILITIES)) {
      if (!G.facilityVisible(Gs, id)) continue;
      const b = el(
        'button',
        'small',
        D.FACILITIES[id].name + '<span class="lv">' + (Gs.facilities[id] ? Gs.facilities[id] + '단계' : '폐허') + '</span>'
      );
      b.title = '담당 주민에게 걸어간다';
      b.onclick = () => {
        closeDrawer();
        guildView.goTo(id);
      };
      nav.append(b);
    }
    const qb = el('button', 'small', '의뢰 게시판');
    qb.onclick = () => openDrawer('board');
    nav.append(qb);
    if (drawerId) openDrawer(drawerId);
  }
  function openTarget(t) {
    openDrawer(
      t.kind === 'facility'
        ? t.id
        : t.kind === 'gear' || t.kind === 'option'
          ? 'workshop'
          : t.kind === 'research' || t.kind === 'upgrade'
            ? 'observatory'
            : t.kind === 'train'
              ? 'barracks'
              : 'board'
    );
  }
  function targetItem(t, iconId, opts = {}) {
    const Gs = state.guild,
      info = G.target(Gs, t),
      pinned = G.sameTarget(Gs.pinned, t),
      d = el('div', 'item' + (info.done ? ' done' : '') + (info.locked ? ' locked' : '') + (opts.cls ? ' ' + opts.cls : ''));
    d.innerHTML =
      icon(iconId, '') +
      '<div class="nm">' +
      info.name +
      '</div><div class="btns"></div><div class="ef">' +
      info.effect +
      (info.locked ? ' <span class="src">— ' + info.locked + '</span>' : '') +
      '</div>' +
      (info.done ? '' : '<div class="costs">' + costChips(Gs, info.cost) + '</div>') +
      (!info.done && Object.keys(info.missing).length
        ? '<div class="ef src">획득처: ' +
          Object.keys(info.missing)
            .filter(k => k !== 'gold')
            .map(k => matName(k) + ' ← ' + (info.sources[k].join(', ') || '전리품'))
            .join(' / ') +
          '</div>'
        : '');
    const btns = d.querySelector('.btns');
    if (info.done) {
      btns.innerHTML = '<span class="src">완료</span>';
      return d;
    }
    if (t.kind === 'train' && !info.locked) {
      const tier = Gs.heroes[t.hero].perks.length;
      for (const p of D.HEROES[t.hero].perks[tier]) {
        const b = el('button', 'small' + (info.can ? ' primary' : ''), p.name);
        b.title = p.text;
        b.disabled = !info.can;
        b.onclick = () => doInvest(t, p.id);
        btns.append(b);
      }
    } else {
      const b = el('button', 'small' + (info.can ? ' primary' : ''), opts.verb || '투자');
      b.disabled = !info.can;
      b.title = info.locked || (info.can ? '' : '재료 부족');
      b.onclick = () => doInvest(t);
      btns.append(b);
    }
    const p = el('button', 'small pinbtn' + (pinned ? ' on' : ''), '📌');
    p.title = pinned ? '목표 고정 해제' : '이 항목을 투자 목표로 고정';
    p.onclick = () => {
      Gs.pinned = pinned ? null : t;
      persist();
      renderGuild();
    };
    btns.append(p);
    return d;
  }
  function doInvest(t, choice) {
    const r = G.invest(state.guild, t, choice);
    if (!r.ok) return guildToast(r.reason);
    ER.audio.play('build');
    if (t.kind === 'facility') guildView.celebrate(t.id);
    guildToast('완료: ' + r.name + ' — ' + r.note);
    persist();
    renderGuild();
  }
  function guildToast(msg) {
    const h = $('#guildHint');
    h.innerHTML = '<b>' + msg + '</b>';
    clearTimeout(guildToast.t);
    guildToast.t = setTimeout(renderGuild, 4200);
  }
  function openDrawer(id) {
    drawerId = id;
    const Gs = state.guild,
      dr = $('#drawer');
    dr.hidden = false;
    $('#guild').classList.add('with-drawer');
    dr.innerHTML = '';
    const head = el('header'),
      body = el('div', 'body');
    dr.append(head, body);
    const close = el('button', 'small', '닫기 <kbd>Esc</kbd>');
    close.onclick = closeDrawer;
    if (id === 'board') {
      head.innerHTML = '<h3>의뢰 게시판</h3>';
      head.append(close);
      body.append(el('h4', '', '납품·토벌 의뢰'));
      for (const [qid, q] of Object.entries(D.QUESTS)) {
        if (!G.questVisible(Gs, qid)) continue;
        const it = targetItem(
          { kind: 'quest', id: qid },
          q.reward.unlock ? 'prop.gate' : q.reward.gear ? D.GEAR[q.reward.gear].icon : 'material.gold',
          { verb: '납품' }
        );
        it.querySelector('.ef').insertAdjacentHTML('afterbegin', q.text + '<br>보상: ');
        body.append(it);
      }
      return;
    }
    const f = D.FACILITIES[id],
      lv = Gs.facilities[id];
    head.innerHTML = '<h3>' + f.name + '<span class="lv">' + (lv ? lv + '단계' : '폐허') + ' · ' + f.role + '</span></h3>';
    head.append(close);
    if (lv < f.levels.length) {
      body.append(el('h4', '', lv ? '다음 단계' : '복구'));
      body.append(
        targetItem({ kind: 'facility', id }, 'facility.' + id + '.' + Math.min(lv + 1, id === 'workshop' ? 3 : 2), {
          cls: 'upgrade',
          verb: lv ? '강화' : '복구'
        })
      );
    } else body.append(el('div', 'src', '최고 단계입니다.'));
    if (!lv) {
      body.append(el('div', 'ef', '<br>복구하면 열리는 것: ' + f.levels.map((l, i) => '<br>' + (i + 1) + '단계 — ' + l.text).join('')));
      return;
    }
    if (id === 'workshop') {
      G.ensure(Gs);
      for (const [slot, label] of Object.entries(D.GEAR_SLOTS)) {
        const list = Object.entries(D.GEAR).filter(([gid, x]) => G.slotOf(gid) === slot && (x.cost || Gs.gearOwned.includes(gid)));
        if (!list.length) continue;
        body.append(
          el(
            'h4',
            '',
            label + ' 제작 — ' + (slot === 'trinket' ? '준비 화면에서 ' + G.gearSlots(Gs) + '칸까지 장착' : '대원마다 하나씩 장착')
          )
        );
        for (const [gid, x] of list) {
          body.append(targetItem({ kind: 'gear', id: gid }, x.icon, { verb: '제작' }));
          if (!Gs.gearOwned.includes(gid) || !(x.options || []).length) continue;
          const mine = Gs.gearOpts[gid] || [];
          for (const opt of x.options) {
            const o = D.CRAFT_OPTIONS[opt];
            if (!o) continue;
            if (mine.includes(opt)) {
              const row = el(
                  'div',
                  'item',
                  icon(x.icon, '') +
                    '<div class="nm">↳ ' +
                    o.name +
                    ' <span class="src">붙임</span></div><div class="btns"></div><div class="ef">' +
                    D.effectText(o.effects) +
                    '</div>'
                ),
                b = el('button', 'small', '떼어 내기');
              b.type = 'button';
              b.onclick = () => {
                G.removeOption(Gs, gid, opt);
                persist();
                renderGuild();
                openDrawer('workshop');
              };
              row.querySelector('.btns').append(b);
              body.append(row);
            } else body.append(targetItem({ kind: 'option', id: gid, opt }, x.icon, { verb: '붙이기' }));
          }
        }
      }
    }
    if (id === 'stash') {
      body.append(el('h4', '', '재고와 급매(헐값) — 제값은 가게에서 · 가방 ' + (D.RULES.bagSlots + lv) + '칸'));
      const keys = Object.keys(D.MATERIALS).filter(k => Gs.stock[k]);
      if (!keys.length) body.append(el('div', 'src', '창고가 비어 있다. 귀환문으로 돌아와야 재료가 입고된다.'));
      for (const k of keys) {
        const m = D.MATERIALS[k],
          d = el('div', 'item');
        d.innerHTML =
          matIcon(k) +
          '<div class="nm">' +
          m.name +
          ' × ' +
          Gs.stock[k] +
          '</div><div class="btns"></div><div class="ef">' +
          m.tier +
          ' · 쓰임: ' +
          m.use +
          ' · 가게 기준가 ' +
          m.value +
          ' · 급매 ' +
          G.quickPrice(Gs, k) +
          '</div>';
        for (const n of [1, Gs.stock[k]]) {
          const b = el('button', 'small', (n === 1 ? '1개' : '전부') + ' 급매');
          b.onclick = () => {
            const r = G.sell(Gs, k, n);
            if (r.ok) {
              guildToast(m.name + ' ' + n + '개 → 금화 ' + r.gold);
              persist();
              renderGuild();
            } else guildToast(r.reason);
          };
          d.querySelector('.btns').append(b);
          if (Gs.stock[k] === 1) break;
        }
        body.append(d);
      }
    }
    if (id === 'barracks') {
      body.append(el('h4', '', '대원 훈련 — 특성은 둘 중 하나만'));
      for (const h of Gs.roster) {
        body.append(targetItem({ kind: 'train', hero: h }, 'gear.sword'));
        const got = Gs.heroes[h].perks.map(pid => D.HEROES[h].perks.flat().find(p => p.id === pid));
        if (got.length) body.append(el('div', 'src', D.HEROES[h].name + ' 습득: ' + got.map(p => p.name + '(' + p.text + ')').join(', ')));
      }
      body.append(el('div', 'src', '<br>출격 시 붕대 ' + Math.min(2, lv) + '개 지급(보조 행동, 체력 6 회복).'));
    }
    if (id === 'observatory') {
      body.append(el('h4', '', '카드 연구 — 연구한 카드는 준비 화면에서 덱에 편성'));
      for (const c of Object.values(D.CARDS))
        if (D.RESEARCH[c.source]?.mats) body.append(targetItem({ kind: 'research', id: c.id }, c.art, { verb: '연구' }));
      body.append(el('h4', '', '카드 강화 — 비용·사거리·부가 효과 중 한 갈래만'));
      for (const c of Object.values(D.CARDS))
        if (c.upgrades && Gs.cards.includes(c.id) && !Gs.upgrades[c.id])
          for (const u of c.upgrades) body.append(targetItem({ kind: 'upgrade', id: c.id, branch: u.id }, c.art, { verb: '강화' }));
    }
  }
  function closeDrawer() {
    drawerId = null;
    $('#drawer').hidden = true;
    $('#guild').classList.remove('with-drawer');
  }

  // 원정 준비
  function openPrep() {
    closeDrawer();
    const Gs = state.guild,
      S = Gs.selected;
    if (!Gs.roster.includes(S.hero)) S.hero = Gs.roster[0];
    const box = modal(
      '<h2>원정 준비</h2><p class="lead">대원 한 명이 12장 덱을 들고 들어갑니다. 귀환문으로 돌아와야 전리품이 길드의 것이 됩니다.</p><div class="prep"><div><h4>대원</h4><div class="heroes"></div><div id="heroInfo"></div></div><div><h4 id="deckTitle"></h4><div id="deck" class="decklist"></div><div id="deckIssue" class="issue"></div><h4>넣을 수 있는 카드</h4><div id="pool" class="decklist"></div><h4 id="gearTitle"></h4><div id="gear" class="decklist"></div></div><div><h4>목적지</h4><div id="regions"></div><h4>투자 목표</h4><div id="prepGoal"></div><div class="row"><button id="prepCancel" type="button">닫기</button><button id="prepGo" class="primary big" type="button">출격 <kbd>Enter</kbd></button></div></div></div>'
    );
    const draw = () => {
      const hs = box.querySelector('.heroes');
      hs.innerHTML = '';
      for (const id of Gs.roster) {
        const h = D.HEROES[id],
          b = el(
            'button',
            'heropick' + (S.hero === id ? ' sel' : ''),
            '<canvas width="72" height="72"></canvas><span><b>' +
              h.name +
              '</b> · ' +
              h.title +
              '<small>체력 ' +
              h.hp +
              ' · 이동 ' +
              h.move +
              ' · ' +
              h.attack.name +
              ' ' +
              (h.attack.dice || h.attack.dmg) +
              '(사거리 ' +
              h.attack.range +
              ')</small></span>'
          );
        b.onclick = () => {
          S.hero = id;
          persist();
          draw();
        };
        hs.append(b);
        const c = b.querySelector('canvas').getContext('2d');
        c.imageSmoothingEnabled = false;
        gfx.sprite(c, h.asset, 'down-0', 36, 68, 60);
      }
      if (!Gs.roster.includes('lumi')) hs.append(el('div', 'src', '술사 루미: 관측 연구실을 복구하면 합류'));
      const h = D.HEROES[S.hero],
        me = Gs.heroes[S.hero];
      box.querySelector('#heroInfo').innerHTML =
        '<p class="ef"><b>특성</b> ' +
        h.passive +
        '</p><p class="ef"><b>덱 방향</b> ' +
        h.build +
        '</p>' +
        (me.perks.length
          ? '<p class="src">훈련: ' + me.perks.map(pid => h.perks.flat().find(p => p.id === pid).name).join(', ') + '</p>'
          : '');
      box.querySelector('#deckTitle').textContent =
        '준비 덱 ' + me.deck.length + '/' + D.RULES.deckSize + ' — 눌러서 빼기 (같은 카드 ' + D.RULES.maxCopies + '장까지)';
      const dk = box.querySelector('#deck');
      dk.innerHTML = '';
      me.deck.forEach((cid, i) => {
        const c = D.CARDS[cid],
          b = el(
            'button',
            'mini ' + c.slot,
            icon(c.art) + '<span>' + c.name + (Gs.upgrades[cid] ? '+' : '') + '</span><span class="x">✕</span>'
          );
        b.title = c.text;
        b.onclick = () => {
          G.deckRemove(Gs, S.hero, i);
          persist();
          draw();
        };
        dk.append(b);
      });
      const pool = box.querySelector('#pool');
      pool.innerHTML = '';
      for (const cid of Gs.cards) {
        const c = D.CARDS[cid];
        if (c.hero && c.hero !== S.hero) continue;
        const n = me.deck.filter(x => x === cid).length,
          b = el(
            'button',
            'mini ' + c.slot,
            icon(c.art) +
              '<span>' +
              c.name +
              ' <span class="src">' +
              n +
              '/' +
              D.RULES.maxCopies +
              '</span></span><span class="x">＋</span>'
          );
        b.title = '[' + (c.slot === 'main' ? '주 행동' : '보조') + '] ' + c.text;
        b.disabled = n >= D.RULES.maxCopies || me.deck.length >= D.RULES.deckSize;
        b.onclick = () => {
          const r = G.deckAdd(Gs, S.hero, cid);
          if (!r.ok) box.querySelector('#deckIssue').textContent = r.reason;
          persist();
          draw();
        };
        pool.append(b);
      }
      const issues = G.deckIssues(Gs, S.hero, me.deck);
      box.querySelector('#deckIssue').textContent = issues[0] ? '출격 불가: ' + issues[0] : '';
      G.ensure(Gs);
      box.querySelector('#gearTitle').textContent =
        '장비 — 무기 1 · 가방 1 · 장신구 ' + me.gear.filter(q => G.slotOf(q) === 'trinket').length + '/' + G.gearSlots(Gs);
      const gr = box.querySelector('#gear');
      gr.innerHTML = Gs.gearOwned.length ? '' : '<span class="src">제작 공방에서 장비를 만들 수 있다.</span>';
      for (const gid of Gs.gearOwned
        .slice()
        .sort((p, q) => Object.keys(D.GEAR_SLOTS).indexOf(G.slotOf(p)) - Object.keys(D.GEAR_SLOTS).indexOf(G.slotOf(q)))) {
        const x = D.GEAR[gid];
        if (!x || (x.heroes?.length && !x.heroes.includes(S.hero))) continue;
        const on = me.gear.includes(gid),
          b = el(
            'button',
            'mini' + (on ? ' main' : ''),
            icon(x.icon) +
              '<span>[' +
              D.GEAR_SLOTS[G.slotOf(gid)] +
              '] ' +
              x.name +
              '<br><span class="src">' +
              D.gearText(gid, Gs.gearOpts[gid]) +
              '</span></span><span class="x">' +
              (on ? '장착됨' : '장착') +
              '</span>'
          );
        b.onclick = () => {
          const r = G.equip(Gs, S.hero, gid);
          if (!r.ok) box.querySelector('#deckIssue').textContent = r.reason;
          persist();
          draw();
        };
        gr.append(b);
      }
      const rg = box.querySelector('#regions');
      rg.innerHTML = '';
      for (const rid of G.ORDER) {
        const r = D.REGIONS[rid],
          st = Gs.regions[rid],
          b = el(
            'button',
            'regionpick' + (S.region === rid ? ' sel' : ''),
            '<b>' +
              r.name +
              '</b> ' +
              (st.unlocked ? (st.boss ? '· 수호자 격파' : '') : '🔒') +
              '<small>' +
              (st.unlocked
                ? r.subtitle +
                  ' · 방 ' +
                  r.rooms +
                  '개 · 붉은달까지 ' +
                  (r.limit + G.mods(Gs).limitBonus) +
                  '<br>나오는 재료: ' +
                  r.materials.map(matName).join(', ') +
                  (G.wearOf(Gs, rid)
                    ? '<br><span class="warn">소진 ' +
                      G.wearOf(Gs, rid) +
                      '/' +
                      D.RULES.deplete.max +
                      ' — 재료 수량 ' +
                      Math.round((1 - G.yieldOf(Gs, rid)) * 100) +
                      '% 감소. 다른 지역을 다녀오거나 날이 지나면 회복</span>'
                    : '')
                : '이전 지역의 수호자를 쓰러뜨리고 귀환하거나, 의뢰 게시판의 우회 항로를 복구') +
              '</small>'
          );
        b.disabled = !st.unlocked;
        b.onclick = () => {
          S.region = rid;
          persist();
          draw();
        };
        rg.append(b);
      }
      const pg = box.querySelector('#prepGoal');
      if (Gs.pinned) {
        const t = G.target(Gs, Gs.pinned),
          here = D.REGIONS[S.region].materials;
        pg.innerHTML =
          '<div class="item" style="grid-template-columns:1fr"><div class="nm">📌 ' +
          t.name +
          '</div><div class="ef" style="grid-column:1">' +
          t.effect +
          '</div><div class="costs" style="grid-column:1">' +
          costChips(Gs, t.cost) +
          '</div>' +
          Object.keys(t.missing)
            .filter(k => k !== 'gold')
            .map(
              k =>
                '<div class="src" style="grid-column:1">' +
                matName(k) +
                ': ' +
                (here.includes(k)
                  ? '<b style="color:var(--green)">이 지역에서 나온다</b>'
                  : (t.sources[k].join(', ') || '전리품') + '에서 나온다') +
                '</div>'
            )
            .join('') +
          '</div>';
      } else
        pg.innerHTML =
          '<span class="src">고정한 목표가 없다. 시설 패널의 📌로 고정하면 필요한 재료와 나오는 지역을 여기서 보여준다.</span>';
      box.querySelector('#prepGo').disabled = issues.length > 0 || !Gs.regions[S.region].unlocked;
    };
    draw();
    box.querySelector('#prepCancel').onclick = closeModal;
    box.querySelector('#prepGo').onclick = startRun;
  }
  function startRun() {
    const r = G.startRun(state);
    if (!r.ok) return toast(r.reason);
    closeModal();
    persist();
    enterRun();
  }

  function showIntro() {
    const box = modal(
      '<h2>잿불은 아직 꺼지지 않았다</h2><p class="lead">한때 미궁 원정으로 이름났던 <b>잿불 길드</b>는 폐허가 되었고, 남은 대원은 둘뿐입니다.</p><p>① <b>원정의 문</b>에서 대원·덱·목적지를 고릅니다.<br>② 미궁에서 채집하고 싸우며, <b>더 들어갈지 지금 돌아갈지</b> 정합니다. 귀환문을 지나야 전리품이 남습니다.<br>③ 가져온 재료로 <b>시설을 복구</b>하면 장비·카드·대원이 늘고 다음 원정이 달라집니다.</p><p class="src">첫 목표는 <b>제작 공방 복구</b>(고목재 4 · 철광 3)로 고정해 두었습니다. 입구 근처 방만 돌아도 모을 수 있습니다.</p><div class="row"><button class="primary big" id="introOk" type="button">시작</button></div>',
      { lock: true }
    );
    box.querySelector('#introOk').onclick = () => {
      state.flags.intro = true;
      persist();
      closeModal();
    };
  }
  function showReport() {
    const Gs = state.guild,
      r = Gs.lastReport,
      win = r.outcome === 'extracted';
    const list = o =>
      Object.entries(o)
        .map(([k, n]) => chip(k, matName(k) + ' ×' + n))
        .join('');
    let html =
      '<h2>' +
      (win ? '귀환 정산' : '원정 실패') +
      ' — ' +
      r.region +
      '</h2><p class="lead">' +
      r.hero +
      ' · 사용 시간 ' +
      r.time +
      '/' +
      r.limit +
      ' · 처치 ' +
      r.kills +
      '</p>';
    if (win)
      html +=
        '<h4>창고에 입고</h4><div class="loot">' +
        (list(r.gained) || '<span class="src">가져온 재료가 없다</span>') +
        chip('gold', '금화 +' + r.gold) +
        '</div>';
    else
      html +=
        '<h4>잃은 것</h4><div class="loot">' +
        (list(r.lost) || '<span class="src">없음</span>') +
        chip('gold', '금화 ' + (r.lostGold || 0)) +
        '</div>' +
        (Object.keys(r.gained).length ? '<h4>창고 덕에 건진 것</h4><div class="loot">' + list(r.gained) + '</div>' : '') +
        '<p class="src">복구한 시설·장비·카드·대원은 그대로입니다. 다음 원정은 바로 준비할 수 있습니다.</p>';
    if (r.objective) html += '<div class="unlock">✦ 목표 회수: 길드에 돌아왔다</div>';
    for (const u of r.unlocked) html += '<div class="unlock">✦ 새 지역 개방: ' + u + ' — 추가 조건 없이 바로 출격할 수 있습니다</div>';
    for (const q of r.quests) html += '<div class="unlock">✦ 의뢰 완료: ' + q.name + ' → ' + q.reward + '</div>';
    if (r.tried?.length) html += '<h4>이번 원정에서 써 본 발견 카드</h4><div id="repTried"></div>';
    if (r.pinned) html += '<h4>고정한 목표</h4><div id="repPin"></div>';
    if (r.newly.length) html += '<h4>이번 귀환으로 새로 가능해진 투자</h4><div id="repNew"></div>';
    html += '<div class="row"><button class="primary big" id="repOk" type="button">길드로</button></div>';
    const box = modal(html, { lock: true });
    const go = t => {
      r.seen = true;
      persist();
      closeModal();
      openTarget(t);
    };
    if (r.pinned) {
      const d = el(
        'div',
        'item',
        icon('prop.beacon', '') +
          '<div class="nm">📌 ' +
          r.pinned.name +
          '</div><div class="btns"></div><div class="ef">' +
          (r.pinned.can
            ? '<b style="color:var(--green)">재료가 모였다!</b> '
            : '아직 부족: ' +
              Object.entries(r.pinned.missing)
                .map(([k, n]) => matName(k) + ' ' + n)
                .join(', ') +
              ' · ') +
          r.pinned.effect +
          '</div>'
      );
      if (r.pinned.can) {
        const b = el('button', 'small primary', '바로 가기');
        b.onclick = () => go(r.pinned.t);
        d.querySelector('.btns').append(b);
      }
      box.querySelector('#repPin').append(d);
    }
    for (const id of r.tried || []) {
      const t = G.target(Gs, { kind: 'research', id }),
        c = D.CARDS[id],
        d = el(
          'div',
          'item',
          icon(c.art, '') +
            '<div class="nm">' +
            c.name +
            '</div><div class="btns"></div><div class="ef">' +
            c.text +
            '</div><div class="costs">' +
            (t.locked ? '<span class="src">' + t.locked + '</span>' : costChips(Gs, t.cost)) +
            '</div>'
        );
      const b1 = el('button', 'small', '📌 연구 목표로');
      b1.onclick = () => {
        Gs.pinned = { kind: 'research', id };
        r.seen = true;
        persist();
        closeModal();
        renderGuild();
      };
      d.querySelector('.btns').append(b1);
      box.querySelector('#repTried').append(d);
    }
    if (r.newly.length)
      for (const n of r.newly.slice(0, 6)) {
        const d = el(
          'div',
          'item',
          icon('material.gold', '') + '<div class="nm">' + n.name + '</div><div class="btns"></div><div class="ef">' + n.effect + '</div>'
        );
        const b = el('button', 'small', '보러 가기');
        b.onclick = () => go(n.t);
        d.querySelector('.btns').append(b);
        box.querySelector('#repNew').append(d);
      }
    box.querySelector('#repOk').onclick = () => {
      r.seen = true;
      persist();
      closeModal();
      renderGuild();
    };
  }

  // 저장 관리·설정
  async function openSaves() {
    const backups = await ER.save.listBackups();
    const box = modal(
      '<h2>저장 관리</h2><p class="lead">행동할 때마다 이 브라우저에 자동 저장됩니다(' +
        (ER.save.mode() === 'idb' ? 'IndexedDB' : 'localStorage 대체') +
        '). 다른 브라우저·PC로 옮길 때는 파일로 내보내세요.</p><div class="row" style="justify-content:flex-start"><button id="svExport" type="button">파일로 내보내기</button><button id="svImport" type="button">파일에서 가져오기</button><button id="svText" type="button">텍스트로 복사·붙여넣기</button><button id="svNew" class="danger" type="button">새 게임</button><input id="svFile" type="file" accept=".json,application/json" hidden></div><div id="svTextBox" hidden><p class="src">파일 저장이 막힌 환경(웹 게시본 등)에서는 아래 글자를 통째로 복사해 두었다가, 다른 기기의 같은 칸에 붙여넣고 가져오세요.</p><textarea id="svArea" rows="5" style="width:100%;background:#0e1113;color:#e9e4d8;border:1px solid #2e383f;border-radius:8px;font-size:.75rem" spellcheck="false"></textarea><div class="row" style="justify-content:flex-start;margin-top:6px"><button id="svCopy" type="button">현재 진행을 칸에 채우고 복사</button><button id="svPaste" type="button">칸의 내용으로 가져오기</button></div></div><h4>백업 (새 게임·가져오기·복원 전에 자동 생성, 최근 6개)</h4><div id="svList"></div><div id="svMsg" class="issue"></div><div class="row"><button id="svClose" type="button">닫기</button></div>'
    );
    const msg = t => {
      box.querySelector('#svMsg').textContent = t;
    };
    const list = box.querySelector('#svList');
    if (!backups.length) list.innerHTML = '<span class="src">백업이 없다.</span>';
    for (const b of backups) {
      const d = el(
        'div',
        'item',
        icon('material.scroll', '') +
          '<div class="nm">' +
          b.label +
          '</div><div class="btns"></div><div class="ef">' +
          new Date(b.at).toLocaleString('ko-KR') +
          ' · ' +
          b.info +
          '</div>'
      );
      const x = el('button', 'small', '이 백업으로 복원');
      x.onclick = async () => {
        try {
          const r = await ER.save.restore(b.key);
          if (r.ok) {
            readOnly = true;
            /* 떠나면서 이전 진행을 다시 덮어쓰지 않게 잠근다 */ location.reload();
          } else msg(r.reason);
        } catch (e) {
          msg(e.message);
        }
      };
      d.querySelector('.btns').append(x);
      list.append(d);
    }
    box.querySelector('#svClose').onclick = closeModal;
    box.querySelector('#svExport').onclick = () => {
      exportSave();
      box.querySelector('#svTextBox').hidden = false;
      msg('파일이 내려받아지지 않는 환경이라면 아래 "칸에 채우고 복사"를 쓰세요.');
    };
    box.querySelector('#svImport').onclick = () => box.querySelector('#svFile').click();
    const importFrom = async text => {
      try {
        const st = ER.save.importText(text);
        if (
          !(await ask(
            '저장 파일 가져오기',
            '현재 진행을 자동 백업한 뒤 파일의 진행(금화 ' + st.guild.gold + ' · 원정 ' + st.guild.stats.runs + '회)으로 바꿉니다.',
            '가져오기'
          ))
        )
          return openSaves();
        await saving;
        const r = await ER.save.replaceWith(st, '가져오기 전 자동 백업');
        if (r.ok) {
          readOnly = true;
          /* 떠나면서 이전 진행을 다시 덮어쓰지 않게 잠근다 */ location.reload();
        } else msg(r.reason);
      } catch (err) {
        msg('가져오기 실패: ' + err.message + ' — 현재 진행은 그대로입니다.');
      }
    };
    box.querySelector('#svFile').onchange = async e => {
      const f = e.target.files[0];
      if (f) importFrom(await f.text());
    };
    box.querySelector('#svText').onclick = () => {
      box.querySelector('#svTextBox').hidden = false;
    };
    box.querySelector('#svCopy').onclick = async () => {
      const ta = box.querySelector('#svArea');
      ta.value = ER.save.exportText(Object.assign({}, state, { run: state.run ? RUN.strip(state.run) : null }));
      ta.select();
      try {
        await navigator.clipboard.writeText(ta.value);
        msg('복사했습니다. 안전한 곳에 붙여 두세요.');
      } catch {
        msg('칸의 글자를 직접 복사하세요(Ctrl+C).');
      }
    };
    box.querySelector('#svPaste').onclick = () => {
      const v = box.querySelector('#svArea').value.trim();
      if (!v) return msg('먼저 저장 글자를 칸에 붙여넣으세요.');
      importFrom(v);
    };
    box.querySelector('#svNew').onclick = async () => {
      if (
        !(await ask(
          '새 게임',
          '현재 진행을 자동 백업한 뒤 처음부터 시작합니다. 백업은 저장 관리에서 언제든 복원할 수 있습니다.',
          '새 게임 시작',
          true
        ))
      )
        return openSaves();
      await saving;
      const r = await ER.save.replaceWith(freshState(), '새 게임 전 자동 백업');
      if (r.ok) {
        readOnly = true;
        /* 떠나면서 이전 진행을 다시 덮어쓰지 않게 잠근다 */ location.reload();
      } else msg(r.reason);
    };
  }
  function openSettings() {
    const inRun = !!state.run;
    const box = modal(
      '<h2>설정</h2><label class="opt"><input type="checkbox" id="stFast"> 빠른 연출 (이동·공격 재생 시간 단축)</label><label class="opt"><input type="checkbox" id="stSound"> 효과음</label><p class="src">길드: WASD/클릭으로 걷기 · 시설 곁에서 E · Enter 원정 준비<br>원정: 방향키/WASD 이동 · 클릭 이동/공격 · 1~7 카드 · F 공격 · G 방어 · R 숨 고르기 · C 특수기 · Tab 대상 전환 · Enter 확정 · E/Q 상호작용 · Space 또는 T 턴 종료 · V 위협 범위 · M 지도 · B 가방 · L 기록 · Esc 취소</p>' +
        (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)
          ? '<p class="src">개발: <a href="editor.html" style="color:inherit">콘텐츠 도구 열기</a> (방·몬스터 편집)</p>'
          : '') +
        '<div class="row">' +
        (inRun ? '<button id="stGiveUp" class="danger" type="button">원정 포기 (전리품 상실)</button>' : '') +
        '<button id="stSaves" type="button">저장 관리</button><button id="stClose" class="primary" type="button">닫기</button></div>'
    );
    const f = box.querySelector('#stFast'),
      s = box.querySelector('#stSound');
    f.checked = state.settings.fast;
    s.checked = state.settings.sound;
    f.onchange = () => {
      state.settings.fast = f.checked;
      applySettings();
      persist();
    };
    s.onchange = () => {
      state.settings.sound = s.checked;
      applySettings();
      persist();
    };
    box.querySelector('#stClose').onclick = closeModal;
    box.querySelector('#stSaves').onclick = openSaves;
    if (inRun)
      box.querySelector('#stGiveUp').onclick = async () => {
        if (
          !(await ask(
            '원정 포기',
            '가방의 전리품과 이번 원정의 금화를 잃고 길드로 돌아갑니다. 복구한 시설·장비·카드는 그대로입니다.',
            '포기하고 귀환',
            true
          ))
        )
          return;
        RUN.act(state.run, { t: 'giveUp' });
        finishRun();
      };
  }
  function applySettings() {
    runView.speed = state.settings.fast ? 0.4 : 1;
    ER.audio.setEnabled(state.settings.sound);
  }

  // ═════════ 원정 화면
  function enterRun() {
    show('run');
    sel = null;
    hover = null;
    kbTarget = null;
    runView.setRun(state.run);
    state.run.events = [];
    renderRun();
  }
  const run = () => state.run;
  async function doAct(a) {
    const r0 = run();
    if (!r0 || runView.busy || modalOpen()) return;
    if (a.t === 'end') (($('#turnBanner').className = 'turnbanner enemy'), ($('#turnBanner').textContent = '적 턴…'));
    const hp0 = r0.hero.hp;
    const res = RUN.act(r0, a);
    if (!res.ok) {
      toast(res.reason);
      renderRun();
      return;
    }
    sel = null;
    kbTarget = null;
    const evs = r0.events;
    r0.events = [];
    runView.overlay = {};
    renderRun(true);
    persist();
    for (const e of evs) {
      if (e.t === 'roll') showRoll(e);
      if (e.t === 'phase') toast('【' + e.name + '】 ' + e.text);
    }
    await runView.play(evs);
    if (r0.status !== 'active') return finishRun();
    renderRun();
    if (a.t === 'end') {
      const blocked = evs.filter(e => e.t === 'dmg' && e.id === 'hero' && e.kind === 'block').reduce((n, e) => n + e.n, 0),
        lost = hp0 - r0.hero.hp,
        dodged = evs.filter(e => e.t === 'text' && /회피/.test(e.text)).length;
      toast(
        '적 턴 결과 — ' + (lost > 0 ? '받은 피해 ' + lost : '피해 없음') + (blocked ? ' · 막음 ' + blocked : '') + (dodged ? ' · 회피' : '')
      );
    }
  }
  function openDraft() {
    const r = run(),
      d = r?.pendingDraft;
    if (!d || modalOpen()) return;
    const known = state.guild.cards;
    const box = modal(
      '<h2>발견 카드 — ' +
        d.source +
        '</h2><p class="lead">한 장을 골라 <b>이번 원정 동안만</b> 덱에 넣습니다(손패로 바로 들어옴). 마음에 들면 귀환 후 관측 연구실에서 연구해 영구히 쓸 수 있습니다.</p><div class="draft"></div><div class="row"><button id="dfSkip" type="button">카드는 두고 금화 5 챙기기</button></div>',
      { lock: true }
    );
    d.options.forEach((id, i) => {
      const c = RUN.card(r, id),
        b = el(
          'button',
          'card ' + c.slot,
          cardHTML(c, { key: i + 1 }) +
            '<div class="meta" style="text-align:left;color:' +
            (known.includes(id) ? 'var(--dim)' : 'var(--violet)') +
            '">' +
            (known.includes(id) ? '이미 연구한 카드' : '미연구 — 써 보고 연구할지 정하자') +
            '</div>'
        );
      b.onclick = () => {
        closeModal();
        doAct({ t: 'draft', pick: i });
      };
      box.querySelector('.draft').append(b);
    });
    box.querySelector('#dfSkip').onclick = () => {
      closeModal();
      doAct({ t: 'draft', pick: -1 });
    };
  }
  function showRoll(e) {
    const p = $('#rollPop');
    p.hidden = false;
    p.innerHTML =
      '<div>' +
      e.label +
      ' · ' +
      e.formula +
      (e.mode === 'advantage' ? ' · 행운' : e.mode === 'steady' ? ' · 고정' : '') +
      '</div><div class="n">' +
      e.total +
      '</div>' +
      (e.cands?.length > 1 ? '<div class="src">' + e.cands.join(' / ') + ' 중 높은 값</div>' : '') +
      (e.dc != null ? '<div class="' + (e.ok ? 'ok' : 'ng') + '">목표 ' + e.dc + ' — ' + (e.ok ? '성공' : '실패') + '</div>' : '');
    clearTimeout(showRoll.t);
    showRoll.t = setTimeout(() => {
      p.hidden = true;
    }, 1700);
  }
  function finishRun() {
    if (state.run?.test) {
      show('run');
      return modal(
        '<h2>시험 플레이 종료</h2><p class="lead">결과: ' +
          state.run.status +
          ' · 남은 체력 ' +
          state.run.hero.hp +
          '/' +
          state.run.hero.maxHp +
          ' · 시간 ' +
          state.run.time +
          '</p><p>이 창을 닫거나 새로고침하면 같은 방을 다시 시험합니다.</p>',
        { lock: true }
      );
    }
    const rep = G.settle(state);
    persist();
    sel = null;
    if (rep && rep.outcome === 'defeat') ER.audio.play('die');
    enterGuild();
  }

  function renderRun(quiet) {
    const r = run();
    if (!r) return;
    const rm = RUN.room(r),
      reg = D.REGIONS[r.regionId],
      h = r.hero,
      combat = r.mode === 'combat',
      ph = RUN.phaseDef(r);
    if (!quiet) $('#roomName').textContent = rm.name;
    $('#regionName').textContent = reg.name;
    const left = Math.max(0, r.limit - r.time),
      moon = $('#moon');
    moon.className = 'moon' + (r.phase >= 2 ? ' red' : '');
    moon.innerHTML =
      '<span title="' +
      ph.text +
      '">' +
      ['🌑', '🌘', '🌕', '👁'][r.phase] +
      ' ' +
      ph.name +
      '</span><div class="gauge" title="50% 술렁임 · 80% 붉은달 · 100% 추적자"><i style="width:' +
      Math.min(100, (r.time / r.limit) * 100) +
      '%"></i><b style="left:50%"></b><b style="left:80%"></b></div><span class="label">' +
      (left ? '붉은달까지 <b>' + left + '</b>' : '<b>추적자가 쫓는다</b>') +
      '</span>';
    const tb = $('#turnBanner');
    if (!quiet || !tb.className.includes('enemy')) {
      tb.className = 'turnbanner' + (combat ? ' combat' : '');
      tb.textContent = combat
        ? r.pursuers.length && !RUN.alertIn(rm).length
          ? '추격당하는 중 · 내 턴 ' + r.turn
          : '전투 · 내 턴 ' + r.turn
        : '탐사 중 · 이동 자유';
    }
    const pips = (n, max, cls) =>
      Array.from({ length: Math.max(n, max) }, (_, i) => '<i class="pip ' + cls + (i < n ? '' : ' off') + '"></i>').join('');
    $('#heroHud').innerHTML =
      '<h4>' +
      D.HEROES[r.heroId].name +
      ' <span class="sub">' +
      D.HEROES[r.heroId].title +
      '</span></h4><div class="bar"><i style="width:' +
      (h.hp / h.maxHp) * 100 +
      '%"></i></div><div>체력 <b>' +
      h.hp +
      '</b>/' +
      h.maxHp +
      (h.block ? ' · <span class="blockbadge">방어 ' + h.block + '</span>' : '') +
      (h.focus ? ' · 집중 +' + (h.focus + h.focusBonus) : '') +
      (h.retaliate ? ' · 반격 ' + h.retaliate : '') +
      (h.rollMode ? ' · ' + (h.rollMode === 'advantage' ? '행운 준비' : '고정 준비') : '') +
      (h.harvest ? ' · 채집 +' + h.harvest : '') +
      '</div>' +
      '<div class="pips"><span title="' +
      D.HEROES[r.heroId].gaugeText +
      ' 전투 중 내 턴 시작·처치·치명타마다 +1.">투지' +
      pips(h.gauge || 0, D.RULES.gauge.max, 'gauge') +
      '</span></div>' +
      (combat
        ? '<div class="pips"><span>이동' +
          pips(h.mp, RUN.moveMax(r), '') +
          '</span><span>주' +
          pips(h.main, 1, 'main') +
          '</span><span>보조' +
          pips(h.bonus, 1, 'bonus') +
          '</span></div>'
        : '') +
      '<div class="sub">덱 ' +
      r.deck.draw.length +
      ' · 버림 ' +
      r.deck.discard.length +
      (r.deck.exhaust.length ? ' · 소진 ' + r.deck.exhaust.length : '') +
      '</div>';
    // 목표·가방
    const bagCount = {};
    r.bag.forEach(s => {
      bagCount[s.mat] = (bagCount[s.mat] || 0) + s.qty;
    });
    let goal = '';
    if (r.pinned) {
      const t = G.target(state.guild, r.pinned);
      goal =
        '<h4>📌 ' +
        t.name +
        '</h4><div class="goal-row">' +
        (costChips(state.guild, Object.fromEntries(Object.entries(t.cost).filter(([k]) => k !== 'gold')), bagCount) ||
          '<span class="sub">재료 없음</span>') +
        '</div><div class="sub">창고 + 가방 / 필요</div>';
    }
    goal +=
      '<div class="sub" style="margin-top:4px">' +
      (r.flags.objective
        ? '✦ ' + reg.objective.name + ' 확보 — 귀환하자'
        : r.flags.bossDead
          ? '수호자 격파 — ' + reg.objective.name + ' 회수'
          : r.devicesOn < r.devicesNeed
            ? '성소 봉인 장치 ' + r.devicesOn + '/' + r.devicesNeed
            : '성소가 열렸다 — 수호자가 기다린다') +
      '</div>';
    const slots = RUN.bagSlots(r);
    goal +=
      '<div class="bagmini">' +
      Array.from({ length: slots }, (_, i) => {
        const s = r.bag[i];
        return '<div>' + (s ? matIcon(s.mat) + s.qty + '/' + RUN.stackOf(r, s.mat) : '') + '</div>';
      }).join('') +
      '</div><div class="sub">가방 ' +
      r.bag.length +
      '/' +
      slots +
      '칸 · 금화 ' +
      r.gold +
      '</div>';
    // 탈출 경고: 던전에 남을수록 위험한 신호를 한곳에 모아 보여 준다(규칙 수치 RULES.warn).
    const warns = [];
    if (h.hp <= h.maxHp * D.RULES.warn.hp) warns.push('체력 ' + Math.round((h.hp / h.maxHp) * 100) + '%');
    if (r.bag.length >= slots) warns.push('가방 가득');
    if (r.time >= r.limit) warns.push('붉은달 — 추적자');
    else if (r.time >= r.limit * D.RULES.warn.time) warns.push('붉은달까지 ' + (r.limit - r.time));
    if (r.pursuers?.length) warns.push('추격 ' + r.pursuers.length);
    if (warns.length) goal += '<div class="warns">▲ 귀환을 생각할 때: ' + warns.join(' · ') + '</div>';
    $('#goalHud').innerHTML = goal;
    // 기본 행동
    const bs = $('#basics');
    bs.innerHTML = '';
    const atk = D.HEROES[r.heroId].attack;
    const basic = (label, key, fn, off, on) => {
      const b = el('button', on ? 'sel' : '', label + ' <kbd>' + key + '</kbd>');
      b.disabled = !!off;
      b.onclick = fn;
      bs.append(b);
    };
    const wp = RUN.weapon(r);
    basic(
      '공격 ' + wp.dice + (wp.bonus ? '+' + wp.bonus : '') + (wp.range > 1 ? ' (사거리 ' + wp.range + ')' : ''),
      'F',
      () => select({ kind: 'attack' }),
      combat && h.main < 1,
      sel?.kind === 'attack'
    );
    basic(
      '방어 +' + (D.RULES.guardBlock + (D.HEROES[r.heroId].guardBonus || 0) + (r.perks.includes('ara_guard') ? 2 : 0)),
      'G',
      () => doAct({ t: 'guard' }),
      !combat || h.main < 1
    );
    basic('숨 고르기', 'R', () => select({ kind: 'discard' }), !combat || h.bonus < 1 || !r.deck.hand.length, sel?.kind === 'discard');
    {
      const sp = D.HEROES[r.heroId].special,
        lack = (h.gauge || 0) < D.RULES.gauge.cost,
        off = !combat || lack || h[sp.slot] < 1;
      basic(
        '✦ ' + sp.name + ' <span class="src">투지 ' + D.RULES.gauge.cost + '</span>',
        'C',
        () => useSpecial(),
        off,
        sel?.kind === 'special'
      );
      bs.lastChild.title =
        '[' +
        (sp.slot === 'main' ? '주 행동' : '보조 행동') +
        ' + 투지 ' +
        D.RULES.gauge.cost +
        '] ' +
        sp.text +
        (lack ? ' — 투지가 모자란다(' + (h.gauge || 0) + '/' + D.RULES.gauge.cost + ')' : '');
      bs.lastChild.classList.add('special');
    }
    if (r.items.bandage) basic('붕대 ×' + r.items.bandage, 'H', () => doAct({ t: 'item', id: 'bandage' }), combat && h.bonus < 1);
    if (r.items.flare) basic('섬광 ×' + r.items.flare, 'J', () => doAct({ t: 'item', id: 'flare' }), !combat || h.bonus < 1);
    if (r.items.recall) basic('귀환석 ×' + r.items.recall, 'K', useRecall, combat);
    // 손패
    const hand = $('#hand');
    hand.innerHTML = '';
    r.deck.hand.forEach((cid, i) => {
      const c = RUN.card(r, cid),
        usable = !(combat && ((c.slot === 'main' && h.main < 1) || (c.slot === 'bonus' && h.bonus < 1))),
        b = el(
          'button',
          'card ' +
            c.slot +
            (sel?.kind === 'card' && sel.i === i ? ' sel' : '') +
            (usable ? '' : ' off') +
            (sel?.kind === 'discard' ? ' discarding' : ''),
          cardHTML(c, { key: i + 1 }) + ((r.temp || []).includes(cid) ? '<span class="tempbadge">발견</span>' : '')
        );
      b.title = (combat ? '' : '탐사 중 카드 사용: 시간 ' + D.RULES.time.card + ' · ') + c.text;
      b.onclick = () => {
        if (sel?.kind === 'discard') return doAct({ t: 'breathe', i });
        if (sel?.kind === 'card' && sel.i === i && c.target === 'self') return doAct({ t: 'card', i });
        select({ kind: 'card', i });
      };
      if (sel?.kind === 'card' && sel.i === i && c.target === 'self') {
        const u = el('span', 'use', '');
        u.innerHTML = '<button class="primary small" type="button" style="width:100%">사용 <kbd>Enter</kbd></button>';
        b.append(u);
      }
      hand.append(b);
    });
    if (!r.deck.hand.length)
      hand.innerHTML = '<span class="src" style="align-self:center">손패가 없다. 기본 공격·방어는 언제나 쓸 수 있다.</span>';
    const et = $('#endTurn');
    et.hidden = !combat;
    et.disabled = runView.busy;
    $('#feed').innerHTML = r.log
      .slice(-3)
      .map((l, i, arr) => '<div style="opacity:' + (0.45 + (0.55 * (i + 1)) / arr.length) + '">' + l + '</div>')
      .join('');
    renderPrompt();
    updateOverlay();
    if (r.pendingEvent && !runView.busy) openRunEvent();
    else if (r.pendingDraft && !runView.busy) openDraft();
  }
  function select(s) {
    const r = run();
    if (!r || runView.busy) return;
    if (sel && s && sel.kind === s.kind && sel.i === s.i) sel = null;
    else sel = s;
    kbTarget = null;
    if (sel?.kind === 'card') {
      const c = RUN.card(r, r.deck.hand[sel.i]);
      const why =
        r.mode === 'combat' &&
        (c.slot === 'main' && r.hero.main < 1
          ? '주 행동을 이미 썼다'
          : c.slot === 'bonus' && r.hero.bonus < 1
            ? '보조 행동을 이미 썼다'
            : null);
      if (why) {
        toast(why);
        sel = null;
      }
    }
    ER.audio.play('ui');
    renderRun();
  }
  function useSpecial() {
    const r = run();
    if (!r || runView.busy) return;
    const p = RUN.preview(r, { t: 'special', target: null }),
      sp = D.HEROES[r.heroId].special;
    if (sp.target === 'self') return p.ok ? doAct({ t: 'special' }) : toast(p.reason);
    if (!p.ok && p.reason !== '대상을 고르세요') return toast(p.reason);
    select({ kind: 'special' });
  }
  const selAction = id =>
    sel.kind === 'attack'
      ? { t: 'attack', id }
      : sel.kind === 'special'
        ? { t: 'special', target: { id } }
        : { t: 'card', i: sel.i, target: { id } };
  const KEYS = ['E', 'Q', 'Z', 'X'];
  function promptOptions() {
    const r = run(),
      out = [];
    for (const o of RUN.nearbyObjects(r)) for (const it of RUN.interactions(r, o)) out.push({ o, it });
    return out.slice(0, KEYS.length);
  }
  function renderPrompt() {
    const r = run(),
      p = $('#prompt');
    p.innerHTML = '';
    if (!r) return;
    if (sel?.kind === 'card') {
      const c = RUN.card(r, r.deck.hand[sel.i]);
      p.innerHTML =
        '<span><b>' +
        c.name +
        '</b> · ' +
        (r.mode === 'combat' ? (c.slot === 'main' ? '주 행동' : '보조 행동') : '시간 ' + D.RULES.time.card) +
        ' — ' +
        (c.target === 'self'
          ? '카드를 다시 누르거나 Enter로 사용'
          : c.target === 'tile'
            ? '빛나는 칸을 클릭'
            : '대상 클릭 · Tab 전환 · Enter 확정') +
        ' · Esc 취소</span>';
    } else if (sel?.kind === 'special') {
      const sp = D.HEROES[r.heroId].special;
      p.innerHTML =
        '<span><b>✦ ' +
        sp.name +
        '</b> · 투지 ' +
        D.RULES.gauge.cost +
        ' + ' +
        (sp.slot === 'main' ? '주 행동' : '보조 행동') +
        ' — ' +
        sp.text +
        ' · 대상 클릭 · Tab 전환 · Enter 확정 · Esc 취소</span>';
    } else if (sel?.kind === 'attack')
      p.innerHTML = '<span><b>기본 공격</b> · 주 행동 — 대상 클릭 · Tab 전환 · Enter 확정 · Esc 취소</span>';
    else if (sel?.kind === 'discard')
      p.innerHTML = '<span><b>숨 고르기</b> · 보조 행동 — 버릴 카드를 고르면 1장을 새로 뽑는다 · Esc 취소</span>';
    else {
      promptOptions().forEach(({ o, it }, i) => {
        const b = el(
          'button',
          'opt',
          '<kbd>' +
            KEYS[i] +
            '</kbd> ' +
            it.label +
            ' <span class="cost">' +
            it.cost +
            '</span>' +
            (it.note ? '<span class="note">' + it.note + '</span>' : '') +
            (it.full ? '<span class="warn">가방 자리 없음</span>' : '') +
            (it.blocked ? '<span class="warn">' + it.blocked + '</span>' : '')
        );
        b.onclick = () => interact(o, it);
        p.append(b);
      });
    }
    const dt = hover && RUN.doorInfo(r, hover.x, hover.y);
    const nearDoor = Object.entries(M.INSIDE).find(
      ([d, q]) => RUN.room(r).doors[d] && Math.abs(q[0] - r.hero.x) + Math.abs(q[1] - r.hero.y) <= 1
    );
    const dir = dt?.dir || nearDoor?.[0];
    if (dir && !sel) {
      const di = RUN.doorInfo(r, M.DOOR[dir][0], M.DOOR[dir][1]),
        ex = RUN.exitInfo(r, dir);
      p.append(
        el(
          'span',
          di.sealed ? 'warn' : 'dimtxt',
          di.sealed
            ? '🔒 봉인된 문 — 봉인 장치를 모두 작동해야 열린다'
            : '문 → ' +
                (di.target.known ? di.target.name : '미탐사 구역') +
                ' · 시간 ' +
                ex.time +
                (r.mode === 'combat'
                  ? ' · <span class="warn">이탈: 기회 공격 ' +
                    ex.freeHits +
                    '회, 추격 ' +
                    ex.chasers +
                    (ex.bossHeal ? ', 수호자 회복 ' + ex.bossHeal : '') +
                    '</span>'
                  : '')
        )
      );
    }
    if (!sel && r.mode === 'combat' && r.deck.hand.length >= D.RULES.handMax && r.hero.bonus > 0)
      p.append(el('span', 'warn', '손패가 가득 차 새 카드를 뽑지 못한다 — R 숨 고르기로 한 장을 바꾸자'));
    if (!p.children.length)
      p.innerHTML =
        '<span class="dimtxt">' +
        (r.mode === 'combat'
          ? '칸을 눌러 이동 · 적을 눌러 공격 · 카드를 골라 사용 · V 위협 범위 · Space로 턴 종료'
          : '칸을 눌러 이동 · 빛나는 테두리의 소품 곁에서 E · 적에게 먼저 공격하면 기습') +
        '</span>';
  }
  function interact(o, it) {
    if (it.method === 'extract') {
      if (it.blocked) return toast(it.blocked);
      return confirmExtract(o);
    }
    doAct({ t: 'interact', id: o.id, method: it.method });
  }
  function confirmExtract(o) {
    const r = run(),
      list = r.bag.map(s => chip(s.mat, matName(s.mat) + ' ×' + s.qty)).join('');
    const left = RUN.room(r).objects.length;
    const box = modal(
      '<h2>길드로 귀환할까요?</h2><p class="lead">귀환하면 이번 원정은 끝나고 가방의 전리품이 창고에 들어갑니다. 붉은달까지 ' +
        Math.max(0, r.limit - r.time) +
        ' 남았습니다.</p><div class="loot">' +
        (list || '<span class="src">가방이 비어 있다</span>') +
        chip('gold', '금화 ' + r.gold) +
        '</div>' +
        (r.flags.bossDead && !r.flags.objective
          ? '<p class="issue">수호자를 쓰러뜨렸지만 ' +
            D.REGIONS[r.regionId].objective.name +
            '을(를) 아직 줍지 않았습니다. (다음 지역 개방에는 영향 없음)</p>'
          : '') +
        '<div class="row"><button id="exNo" type="button">계속 탐사 <kbd>Esc</kbd></button><button id="exYes" class="primary big" type="button">귀환 확정</button></div>'
    );
    box.querySelector('#exNo').onclick = closeModal;
    box.querySelector('#exYes').onclick = () => {
      closeModal();
      doAct({ t: 'interact', id: o.id, method: 'extract' });
    };
  }

  function validTargets() {
    const r = run();
    if (!r || !sel) return [];
    return RUN.alive(RUN.room(r)).filter(e => RUN.preview(r, selAction(e.id)).ok);
  }
  function updateOverlay() {
    const r = run();
    if (!r) return;
    const ov = {},
      rm = RUN.room(r),
      tip = $('#tip');
    tip.hidden = true;
    if (runView.busy) {
      runView.overlay = {};
      return;
    }
    const at = hover && RUN.alive(rm).find(e => e.x === hover.x && e.y === hover.y && (RUN.visible(r, e.x, e.y) || e.state === 'alert'));
    const focusE = at || (kbTarget && RUN.alive(rm).find(e => e.id === kbTarget));
    if (sel?.kind === 'card') {
      const c = RUN.card(r, r.deck.hand[sel.i]);
      if (c) {
        ov.range = RUN.cardRangeTiles(r, c);
        const tgt = c.target === 'enemy' ? focusE && { id: focusE.id } : c.target === 'tile' ? hover : null;
        if (c.target === 'self' || tgt) {
          const p = RUN.preview(r, { t: 'card', i: sel.i, target: tgt });
          if (p.ok) {
            ov.preview = p.dmg;
            ov.crit = p.crit;
            ov.marks = p.marks;
            if (p.tiles?.length) ov.tile = hover;
          }
        }
      }
    } else if (sel?.kind === 'attack' || sel?.kind === 'special') {
      ov.range = RUN.cardRangeTiles(r, {
        range: sel.kind === 'attack' ? RUN.weapon(r).range : D.HEROES[r.heroId].special.range,
        target: 'enemy'
      });
      if (focusE) {
        const p = RUN.preview(r, selAction(focusE.id));
        if (p.ok) {
          ov.preview = p.dmg;
          ov.crit = p.crit;
          if (p.tiles?.length) ov.tile = { x: p.tiles[0][0], y: p.tiles[0][1] };
        }
      }
    } else {
      if (r.mode === 'combat') ov.reach = RUN.reachableTiles(r);
      if (at) {
        const p = RUN.preview(r, { t: 'attack', id: at.id });
        if (p.ok) {
          ov.preview = p.dmg;
          ov.crit = p.crit;
        }
      } else if (hover && !rm.objects.some(o => o.x === hover.x && o.y === hover.y && M.blocks(o))) {
        const p = RUN.preview(r, { t: 'move', x: hover.x, y: hover.y });
        if (p.path) {
          ov.path = p.path;
          ov.pathBad = !p.ok;
        }
      }
    }
    if (showThreat && r.mode === 'combat') ov.allThreat = RUN.allThreat(r);
    if (focusE) {
      ov.hoverId = focusE.id;
      if (focusE.state === 'alert') ov.threat = RUN.threatTiles(r, focusE);
      else ov.watch = RUN.watchTiles(r, focusE);
      const d = D.ENEMIES[focusE.kind];
      tip.hidden = false;
      tip.innerHTML =
        '<h5>' +
        d.name +
        (d.elite ? ' · 정예' : d.boss ? ' · 수호자' : '') +
        '</h5><div>체력 ' +
        focusE.hp +
        '/' +
        focusE.maxHp +
        (RUN.armorOf(r, focusE) ? ' · 장갑 ' + RUN.armorOf(r, focusE) : '') +
        (d.cap ? ' · 피해 상한 ' + d.cap : '') +
        '</div><div class="intent">다음 행동: ' +
        RUN.intentText(r, focusE) +
        '</div>' +
        (D.enemyNote(focusE.kind) ? '<div class="note">' + D.enemyNote(focusE.kind) + '</div>' : '') +
        '<div class="note">' +
        (focusE.state === 'alert' ? '점선: 다음 턴에 닿을 수 있는 범위' : '노란 칸: 지금 살피고 있는 곳 — 밟으면 들킨다') +
        '</div>';
      const cv = runView.cv.getBoundingClientRect(),
        st = $('#runStage').getBoundingClientRect(),
        tx = cv.left - st.left + ((focusE.x + 1.1) / M.W) * cv.width,
        ty = cv.top - st.top + ((focusE.y - 0.5) / M.H) * cv.height;
      tip.style.left = Math.min(st.width - 270, Math.max(4, tx)) + 'px';
      tip.style.top = Math.max(4, Math.min(st.height - 150, ty)) + 'px';
    } else if (hover) {
      const o = rm.objects.find(x => x.x === hover.x && x.y === hover.y && rm.seen[x.y * M.W + x.x]);
      const t = rm.tiles[hover.y][hover.x];
      let txt = '';
      if (o?.kind === 'node')
        txt =
          '<h5>' +
          matName(o.mat) +
          ' ×' +
          o.qty +
          '</h5><div class="note">' +
          D.MATERIALS[o.mat].tier +
          ' · 쓰임: ' +
          D.MATERIALS[o.mat].use +
          '</div>';
      else if (o?.kind === 'pile')
        txt = '<h5>바닥의 물품</h5><div>' + o.items.map(i => matName(i.mat) + ' ×' + i.qty).join(', ') + '</div>';
      else if (o?.kind === 'chest')
        txt =
          '<h5>' +
          D.CHESTS[o.chest].name +
          '</h5><div class="note">' +
          (o.opened
            ? o.contents?.length
              ? '남은 물품: ' + o.contents.map(i => matName(i.mat) + ' ×' + i.qty).join(', ')
              : '비었다'
            : D.CHESTS[o.chest].check
              ? '안전 해체 또는 판정 시도'
              : '열기') +
          '</div>';
      else if (o?.kind === 'trap') txt = '<h5>결박 덫</h5><div class="note">밟은 적: 피해 3, 속박 1턴</div>';
      else if (t === 'h') {
        const hz = D.REGIONS[r.regionId].hazard;
        txt =
          '<h5>' +
          hz.name +
          '</h5><div class="note">' +
          (hz.dmg
            ? '들어가거나 밀려 들어가면 피해 ' + hz.dmg + '. 적은 스스로 밟지 않는다.'
            : '이동력 +1 소모. 물 위의 적은 연쇄 전류 전이 피해 +2.') +
          '</div>';
      } else if (t === 'o') txt = '<h5>기둥</h5><div class="note">이동과 시야를 막는다. 사수의 조준을 끊는 엄폐물.</div>';
      if (txt) {
        tip.hidden = false;
        tip.innerHTML = txt;
        const cv = runView.cv.getBoundingClientRect(),
          st = $('#runStage').getBoundingClientRect();
        tip.style.left = Math.min(st.width - 270, cv.left - st.left + ((hover.x + 1.1) / M.W) * cv.width) + 'px';
        tip.style.top = Math.max(4, cv.top - st.top + ((hover.y - 0.3) / M.H) * cv.height) + 'px';
      }
    }
    runView.overlay = ov;
  }
  function clickTile(t) {
    const r = run();
    if (!r || runView.busy || modalOpen()) return;
    const rm = RUN.room(r);
    const e = RUN.alive(rm).find(x => x.x === t.x && x.y === t.y && (RUN.visible(r, x.x, x.y) || x.state === 'alert'));
    if (sel?.kind === 'card') {
      const c = RUN.card(r, r.deck.hand[sel.i]);
      if (c.target === 'self') return doAct({ t: 'card', i: sel.i });
      const target = c.target === 'tile' ? t : e && { id: e.id };
      if (!target) return toast('대상을 고르세요 (Esc 취소)');
      return doAct({ t: 'card', i: sel.i, target });
    }
    if (sel?.kind === 'attack' || sel?.kind === 'special') {
      if (!e) return toast('대상이 될 적을 고르세요 (Esc 취소)');
      return doAct(selAction(e.id));
    }
    if (sel?.kind === 'discard') {
      sel = null;
      return renderRun();
    }
    if (e) {
      const p = RUN.preview(r, { t: 'attack', id: e.id });
      if (p.ok) return doAct({ t: 'attack', id: e.id });
      return toast(p.reason + ' — 가까이 가거나 카드를 쓰세요');
    }
    const o = rm.objects.find(x => x.x === t.x && x.y === t.y && M.blocks(x));
    if (o) {
      const dist = Math.abs(o.x - r.hero.x) + Math.abs(o.y - r.hero.y);
      if (dist <= 1) {
        const its = RUN.interactions(r, o);
        if (its.length === 1) return interact(o, its[0]);
        if (its.length > 1) return toast('아래 안내줄에서 방법을 고르세요 (E / Q)');
        return;
      }
      let best = null;
      for (const [dx, dy] of [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0]
      ]) {
        const p = RUN.pathTo(r, o.x + dx, o.y + dy);
        if (p && (!best || p.cost < best.cost)) best = { x: o.x + dx, y: o.y + dy, cost: p.cost };
      }
      if (best) return doAct({ t: 'move', x: best.x, y: best.y });
      return toast('갈 수 없다');
    }
    doAct({ t: 'move', x: t.x, y: t.y });
  }
  async function useRecall() {
    const r = run();
    if (!r?.items.recall || r.mode !== 'explore') return toast('귀환석은 탐사 중에만 쓸 수 있습니다.');
    if (
      await ask(
        '귀환석 사용',
        '지금 자리에서 바로 길드로 귀환합니다. 가방의 전리품은 그대로 가져갑니다. (원정당 ' + r.items.recall + '회 남음)',
        '귀환한다'
      )
    )
      doAct({ t: 'recall' });
  }
  function openMap() {
    const r = run(),
      shown = new Map();
    for (const rm of r.rooms) if (rm.visited || rm.known) shown.set(rm.id, rm);
    for (const rm of r.rooms) if (rm.visited) for (const d of Object.values(rm.doors)) if (!shown.has(d.to)) shown.set(d.to, r.rooms[d.to]);
    const xs = [...shown.values()].map(x => x.gx),
      ys = [...shown.values()].map(x => x.gy),
      minX = Math.min(...xs),
      minY = Math.min(...ys),
      CWd = 150,
      CHt = 96,
      w = (Math.max(...xs) - minX + 1) * CWd,
      hgt = (Math.max(...ys) - minY + 1) * CHt;
    let html =
      '<h2>지도 — ' +
      D.REGIONS[r.regionId].name +
      '</h2><p class="lead">가 본 방과 그 문 너머만 표시됩니다. 점선은 아직 모르는 방, 붉은 점선 길은 봉인된 문입니다.</p><div class="mapgrid" style="width:' +
      w +
      'px;height:' +
      hgt +
      'px">';
    for (const rm of shown.values()) {
      const x = (rm.gx - minX) * CWd + 15,
        y = (rm.gy - minY) * CHt + 15,
        known = rm.visited || rm.known;
      for (const [d, door] of Object.entries(rm.doors)) {
        if (!shown.has(door.to) || (d !== 'E' && d !== 'S')) continue;
        if (!rm.visited && !r.rooms[door.to].visited) continue;
        const sealed = door.sealed && r.devicesOn < r.devicesNeed;
        html +=
          d === 'E'
            ? '<div class="mlink' +
              (sealed ? ' sealed' : '') +
              '" style="left:' +
              (x + 120) +
              'px;top:' +
              (y + 30) +
              'px;width:30px;height:5px"></div>'
            : '<div class="mlink' +
              (sealed ? ' sealed' : '') +
              '" style="left:' +
              (x + 58) +
              'px;top:' +
              (y + 66) +
              'px;width:5px;height:30px"></div>';
      }
      const left = rm.visited
        ? rm.objects.filter(
            o => (o.kind === 'node' && o.qty > 0) || (o.kind === 'chest' && (!o.opened || o.contents?.length)) || o.kind === 'pile'
          ).length
        : 0;
      html +=
        '<div class="mroom' +
        (rm.id === r.roomId ? ' cur' : '') +
        (known ? '' : ' unk') +
        (known && rm.danger ? ' danger' : '') +
        '" style="left:' +
        x +
        'px;top:' +
        y +
        'px"><b>' +
        (known ? rm.name : '?') +
        '</b><small>' +
        (rm.id === r.roomId
          ? '현재 위치'
          : rm.type === 'entry'
            ? '귀환문'
            : known && rm.type === 'sanctum'
              ? '수호자·목표'
              : known && rm.danger
                ? '위험·고보상'
                : known && rm.type === 'shelter'
                  ? '쉼터'
                  : rm.visited
                    ? ''
                    : known
                      ? '미방문'
                      : '미탐사') +
        (left ? ' · 남은 물품 ' + left : '') +
        (RUN.alive(rm).length && rm.visited ? ' · 적 ' + RUN.alive(rm).length : '') +
        '</small></div>';
    }
    html +=
      '</div><div class="row"><span id="mapHint" class="src" style="flex:1"></span><button id="mapClose" class="primary" type="button">닫기 <kbd>M</kbd></button></div>';
    const box = modal(html);
    box.querySelector('#mapClose').onclick = closeModal;
    // 가 본 방을 누르면 그 방까지 자동으로 걸어간다(문마다 시간이 드는 것은 같다). 규칙은 run.travelInfo / act({t:'travel'}).
    const rooms = [...shown.values()],
      cells = box.querySelectorAll('.mroom'),
      hint = box.querySelector('#mapHint');
    hint.textContent = r.mode === 'explore' ? '가 본 방을 누르면 그 방으로 이동합니다.' : '전투 중에는 자동 이동을 할 수 없습니다.';
    rooms.forEach((rm, i) => {
      const info = RUN.travelInfo(r, rm.id),
        cell = cells[i];
      if (!info || !cell) return;
      cell.classList.add('go');
      cell.title = '이동: 방 ' + info.rooms + '개 · 시간 ' + info.time;
      cell.onmouseenter = () =>
        (hint.textContent =
          rm.name + '(으)로 이동 — 방 ' + info.rooms + '개를 지나고 시간 ' + info.time + '이 든다. 적에게 들키면 그 방에서 멈춘다.');
      cell.onclick = () => {
        closeModal();
        doAct({ t: 'travel', to: rm.id });
      };
    });
  }
  function openBag() {
    const r = run(),
      slots = RUN.bagSlots(r);
    let html =
      '<h2>가방 ' +
      r.bag.length +
      '/' +
      slots +
      '칸</h2><p class="lead">재료마다 한 칸에 묶음 크기까지 쌓입니다. 내려놓은 물품은 발밑에 남아 다시 주울 수 있습니다. 귀환해야 창고에 들어갑니다.</p><div class="bagslots">';
    for (let i = 0; i < slots; i++) {
      const s = r.bag[i];
      html += s
        ? '<div class="slot">' +
          icon('material.' + (s.mat === 'moonshard' ? 'crystal' : s.mat), '') +
          '<div><b>' +
          matName(s.mat) +
          '</b></div><div>' +
          s.qty +
          ' / ' +
          RUN.stackOf(r, s.mat) +
          '</div><div class="src">' +
          D.MATERIALS[s.mat].use +
          '</div><button class="small danger" data-drop="' +
          i +
          '" type="button">내려놓기</button></div>'
        : '<div class="slot empty">빈 칸</div>';
    }
    html += '</div><div class="row"><button id="bagClose" class="primary" type="button">닫기 <kbd>B</kbd></button></div>';
    const box = modal(html);
    box.querySelector('#bagClose').onclick = closeModal;
    box.querySelectorAll('[data-drop]').forEach(b => {
      b.onclick = () => {
        closeModal();
        doAct({ t: 'drop', slot: +b.dataset.drop }).then(openBag);
      };
    });
  }
  function openLog() {
    const r = run();
    const box = modal(
      '<h2>원정 기록</h2><div class="logbox">' +
        r.log
          .slice()
          .reverse()
          .map(l => '<div>' + l + '</div>')
          .join('') +
        '</div><div class="row"><button id="logClose" class="primary" type="button">닫기</button></div>'
    );
    box.querySelector('#logClose').onclick = closeModal;
  }

  function onKey(e) {
    if (ER.dialog.isOpen()) return;
    ER.audio.unlock();
    const k = e.key,
      low = (k || '').toLowerCase(),
      r = run(),
      inRun = !$('#run').hidden;
    if (k === 'Escape') {
      if (modalOpen()) {
        const no = $('#askNo');
        if (no) no.click();
        else if (!$('#modal').dataset.lock) closeModal();
      } else if (sel) {
        sel = null;
        kbTarget = null;
        renderRun();
      } else if (drawerId) closeDrawer();
      return;
    }
    if (modalOpen() && r?.pendingDraft && /^[1-3]$/.test(k)) {
      const b = document.querySelectorAll('#modalBox .draft .card')[+k - 1];
      if (b) b.click();
      return;
    }
    if (modalOpen()) {
      if ((k === 'm' || k === 'M' || k === 'b' || k === 'B') && inRun) closeModal();
      if (k === 'Enter') {
        const b = $('#modalBox .primary.big:not(:disabled)') || $('#modalBox .primary:not(:disabled)');
        if (b) {
          e.preventDefault();
          b.click();
        }
      }
      return;
    }
    if (!inRun) {
      const gd = { arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down', arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right' }[
        low
      ];
      if (gd) {
        e.preventDefault();
        guildView.step(gd);
      } else if (low === 'e') guildView.interact();
      else if (k === 'Enter') openPrep();
      return;
    }
    if (!r || runView.busy) return;
    const dir = { arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down', arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right' }[
      low
    ];
    if (dir) {
      e.preventDefault();
      sel = null;
      return doAct({ t: 'step', dir });
    }
    if (k === ' ' || e.code === 'Space' || k === 'Spacebar' || low === 't') {
      e.preventDefault();
      if (r.mode === 'combat') doAct({ t: 'end' });
      return;
    }
    if (low === 'c') return useSpecial();
    if (low === 'f') return select({ kind: 'attack' });
    if (low === 'g') return doAct({ t: 'guard' });
    if (low === 'r') return select({ kind: 'discard' });
    if (low === 'h' && r.items.bandage) return doAct({ t: 'item', id: 'bandage' });
    if (low === 'j' && r.items.flare) return doAct({ t: 'item', id: 'flare' });
    if (low === 'k' && r.items.recall) return useRecall();
    if (low === 'v') {
      showThreat = !showThreat;
      toast(showThreat ? '위협 범위 표시 켬 — 주황 모서리 칸은 다음 적 턴에 공격이 닿을 수 있다' : '위협 범위 표시 끔');
      return updateOverlay();
    }
    if (low === 'm') return openMap();
    if (low === 'b') return openBag();
    if (low === 'l') return openLog();
    if (/^[1-7]$/.test(k)) {
      const i = +k - 1;
      if (i < r.deck.hand.length) {
        if (sel?.kind === 'discard') return doAct({ t: 'breathe', i });
        select({ kind: 'card', i });
      }
      return;
    }
    if (k === 'Tab' && sel) {
      e.preventDefault();
      const list = validTargets();
      if (!list.length) return toast('사거리 안에 대상이 없다');
      const idx = list.findIndex(x => x.id === kbTarget);
      kbTarget = list[(idx + 1) % list.length].id;
      hover = null;
      return updateOverlay();
    }
    if (k === 'Enter' && sel) {
      e.preventDefault();
      if (sel.kind === 'card') {
        const c = RUN.card(r, r.deck.hand[sel.i]);
        if (c.target === 'self') return doAct({ t: 'card', i: sel.i });
        if (kbTarget) return doAct({ t: 'card', i: sel.i, target: { id: kbTarget } });
        const l = validTargets();
        if (l.length === 1) return doAct({ t: 'card', i: sel.i, target: { id: l[0].id } });
        return toast('Tab으로 대상을 고르세요');
      }
      if (sel.kind === 'attack' || sel.kind === 'special') {
        const l = validTargets(),
          id = kbTarget || (l.length === 1 && l[0].id);
        if (id) return doAct(selAction(id));
        return toast('Tab으로 대상을 고르세요');
      }
    }
    const ki = KEYS.indexOf(k.toUpperCase());
    if (ki >= 0 && !sel) {
      const opt = promptOptions()[ki];
      if (opt) interact(opt.o, opt.it);
    }
  }

  async function boot() {
    await gfx.load();
    runView = new ER.RunView($('#runCanvas'));
    guildView = new ER.GuildView($('#guildCanvas'), id => {
      ER.audio.unlock();
      if (modalOpen() || ER.dialog.isOpen()) return;
      if (id === 'gate') openPrep();
      else if (id.startsWith('npc:')) talkTo(id.slice(4));
      else openDrawer(id);
    });
    const testKey = new URLSearchParams(location.search).get('test');
    if (testKey) {
      // editor.html 의 시험 플레이: 저장을 읽지도 쓰지도 않는다.
      readOnly = true;
      state = freshState();
      let t = null;
      try {
        t = JSON.parse(localStorage.getItem('er-editor-test') || 'null');
      } catch (e) {
        t = null;
      }
      if (!t || !t.room) throw new Error('시험할 방이 없다. editor.html 에서 "시험 플레이"를 눌러 주세요.');
      const hero = D.HEROES[t.hero] ? t.hero : 'ara';
      state.run = RUN.create({
        regionId: t.region,
        heroId: hero,
        deck: D.HEROES[hero].deck,
        seed: 'test-' + Date.now(),
        testRoom: t.room,
        known: []
      });
      const b = $('#banner');
      b.hidden = false;
      b.innerHTML = '<span>시험 플레이 — 저장되지 않습니다. 창을 닫고 에디터로 돌아가세요.</span>';
    }
    const loaded = testKey ? { state } : await ER.save.load();
    if (loaded.state) state = loaded.state;
    else {
      state = freshState();
      if (loaded.error) {
        const box = modal(
          '<h2>저장을 읽지 못했습니다</h2><p class="lead">' +
            loaded.error +
            '</p><p>손상된 기록은 덮어쓰기 전에 백업으로 보관합니다. 저장 관리에서 이전 백업을 복원하거나 새 게임으로 시작할 수 있습니다.</p><div class="row"><button id="erSaves" type="button">저장 관리 열기</button><button id="erNew" class="primary" type="button">새 게임으로 시작</button></div>',
          { lock: true }
        );
        await new Promise(res => {
          box.querySelector('#erNew').onclick = async () => {
            await ER.save.backup('손상된 기록 보관');
            closeModal();
            res();
          };
          box.querySelector('#erSaves').onclick = async () => {
            await openSaves();
          };
        });
      }
      persist();
    }
    if (!testKey && loaded.state) {
      const before = JSON.stringify(state),
        notes = G.sanitize(state);
      if (notes.length) {
        await ER.save.backup('콘텐츠 변경 전 자동 백업');
        console.warn('저장 정리:', notes);
        setTimeout(() => toast('콘텐츠가 바뀌어 저장을 정리했습니다: ' + notes.join(', ') + ' (원본은 저장 관리의 백업에 있습니다)'), 800);
      } else if (before !== JSON.stringify(state)) {
        /* 빈 칸만 채움 */
      }
    }
    state.settings = Object.assign({ fast: false, sound: true }, state.settings);
    state.flags = state.flags || {};
    applySettings();
    const cv = $('#runCanvas');
    cv.addEventListener('mousemove', e => {
      const t = runView.tileAt(e.clientX, e.clientY);
      if (t?.x !== hover?.x || t?.y !== hover?.y) {
        hover = t;
        kbTarget = null;
        updateOverlay();
        renderPrompt();
      }
    });
    cv.addEventListener('mouseleave', () => {
      hover = null;
      updateOverlay();
    });
    cv.addEventListener('click', e => {
      ER.audio.unlock();
      const t = runView.tileAt(e.clientX, e.clientY);
      if (t) clickTile(t);
    });
    cv.addEventListener('contextmenu', e => {
      e.preventDefault();
      if (sel) {
        sel = null;
        renderRun();
      }
    });
    $('#endTurn').onclick = () => doAct({ t: 'end' });
    $('#sortieBtn').onclick = openPrep;
    document.addEventListener('keydown', onKey);
    document.querySelectorAll('[data-act]').forEach(b => {
      b.onclick = () => ({ map: openMap, bag: openBag, log: openLog, settings: openSettings, saves: openSaves })[b.dataset.act]();
    });
    window.addEventListener('beforeunload', () => {
      persist();
    });
    if (state.run && state.run.status === 'active') enterRun();
    else if (state.run) finishRun();
    else enterGuild();
    g.__ER_DEBUG = {
      get state() {
        return state;
      },
      view: () => runView,
      town: () => guildView,
      busy: () => runView.busy,
      // 읽기 전용 상황 요약(글자 지도). 상태를 바꾸지 않는다.
      ascii() {
        const r = state.run;
        if (!r) return 'guild';
        const rm = RUN.room(r),
          rows = rm.tiles.map(t => t.split(''));
        for (const o of rm.objects)
          rows[o.y][o.x] = { node: 'n', chest: 'c', portal: 'P', device: 'v', camp: 'f', altar: 'a', objective: '*', pile: 'p', trap: 't' }[
            o.kind
          ];
        for (const e of RUN.alive(rm)) rows[e.y][e.x] = e.state === 'alert' ? e.kind[0].toUpperCase() : e.kind[0];
        rows[r.hero.y][r.hero.x] = '@';
        return (
          rows.map(x => x.join('')).join(String.fromCharCode(10)) +
          String.fromCharCode(10) +
          JSON.stringify({
            room: rm.id + ':' + rm.type,
            doors: Object.fromEntries(
              Object.entries(rm.doors).map(([d, v]) => [
                d,
                r.rooms[v.to].type + (r.rooms[v.to].visited ? '(v)' : '') + (v.sealed && r.devicesOn < r.devicesNeed ? '[sealed]' : '')
              ])
            ),
            mode: r.mode,
            turn: r.turn,
            hp: r.hero.hp + '/' + r.hero.maxHp,
            block: r.hero.block,
            mp: r.hero.mp,
            main: r.hero.main,
            bonus: r.hero.bonus,
            hand: r.deck.hand,
            time: r.time + '/' + r.limit,
            bag: r.bag.map(s => s.mat + s.qty).join(','),
            gold: r.gold,
            foes: RUN.alive(rm).map(
              e =>
                e.id +
                ':' +
                e.kind +
                ' ' +
                e.hp +
                'hp @' +
                e.x +
                ',' +
                e.y +
                ' ' +
                e.state +
                ' ' +
                RUN.intentText(r, e) +
                ' ' +
                JSON.stringify(e.st)
            ),
            objs: rm.objects.map(o => o.kind + (o.mat ? ':' + o.mat + o.qty : '') + '@' + o.x + ',' + o.y),
            pursuers: r.pursuers.length,
            status: r.status,
            log: r.log.slice(-4)
          })
        );
      }
    }; // 읽기 전용 점검 창구. 직접 플레이 검증에서는 상황 파악에만 쓰고 입력은 화면(클릭·키)으로만 한다.
  }
  boot().catch(e => {
    document.body.innerHTML = '<pre style="color:#f88;padding:20px">시작 실패: ' + (e?.stack || e) + '</pre>';
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
