/* 콘텐츠 도구(editor.html): 방 검수 · 방 에디터 · 몬스터 작업대.
   편집 대상은 ER.CONTENT(src/content.js) 하나다. 저장은 로컬 서버의 /__dev/content 로 보내고, 서버가 없으면 파일 본문을 보여 준다.
   규칙을 새로 만들지 않는다: 방 검사는 mapgen.lintRoom, 모의전은 bot.duel, 특성 설명은 data.TRAITS 를 그대로 쓴다. */
(function (g) {
  'use strict';
  const ER = g.ER, D = ER.data, M = ER.map, { ENEMIES, REGIONS, MATERIALS, CHESTS, TRAITS, AI_TYPES, RULES } = D, W = M.W, H = M.H;
  const $ = s => document.querySelector(s), clone = o => JSON.parse(JSON.stringify(o)), esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const C = ER.CONTENT = Object.assign({ enemies: {}, spawns: [], rooms: [] }, ER.CONTENT); // 작업본(생성기도 같은 객체를 본다)
  let saved = JSON.stringify(C), canSave = false, tab = 'review';

  // ───────── 공통: 상태 표시·저장
  const dirty = () => JSON.stringify(C) !== saved;
  function status(msg, cls) { const s = $('#status'); s.textContent = msg || (dirty() ? '저장하지 않은 변경이 있습니다' : canSave ? '저장됨' : '읽기 전용(로컬 서버 아님) — "텍스트로 보기"로 복사하세요'); s.className = cls || (dirty() ? 'dirty' : ''); }
  function touch() { status(); }
  function problems() { // 저장 전에 알려 줄 문제
    const out = [];
    for (const [k, d] of Object.entries(C.enemies)) { for (const f of ['name', 'asset', 'ai']) if (!d[f]) out.push(k + ': ' + f + ' 없음'); if (!AI_TYPES[d.ai]) out.push(k + ': 모르는 행동 유형 ' + d.ai); for (const [id, p] of Object.entries(d.traits || {})) { if (!TRAITS[id]) out.push(k + ': 모르는 특성 ' + id); for (const f of ['into', 'kind']) if (p[f] && !ENEMIES[p[f]]) out.push(k + ': 특성이 가리키는 적 ' + p[f] + ' 없음'); } }
    C.spawns.forEach((s, i) => { if (!REGIONS[s.region]?.rooms_def[s.room]) out.push('등장 조합 ' + (i + 1) + ': 없는 지역/방 ' + s.region + '/' + s.room); for (const k of s.group) if (!ENEMIES[k]) out.push('등장 조합 ' + (i + 1) + ': 없는 적 ' + k); });
    for (const r of C.rooms) { const errs = M.lintRoom(r).filter(i => i.level === 'error'); if (errs.length && !r.disabled) out.push('방 ' + r.id + ': ' + errs[0].msg + ' (게임에서는 이 방을 건너뛴다)'); }
    const ids = C.rooms.map(r => r.id); ids.forEach((id, i) => { if (ids.indexOf(id) !== i) out.push('방 id 중복: ' + id); });
    return out;
  }
  function showText(title, note) { $('#dlgTitle').textContent = title; $('#dlgNote').textContent = note; $('#dlgText').value = ER.contentfmt.text(C); $('#dlg').hidden = false; }
  async function save() {
    const why = ER.contentfmt.check(C); if (why) return status(why, 'bad'); const probs = problems();
    if (!canSave) return showText('src/content.js 본문', '로컬 서버(npm start)로 열지 않아 파일을 직접 쓸 수 없습니다. 아래 내용을 src/content.js 에 붙여 넣으세요.' + (probs.length ? ' 주의: ' + probs.join(' / ') : ''));
    try { const r = await fetch('/__dev/content', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(C) }), j = await r.json(); if (!j.ok) return status('저장 실패: ' + j.reason, 'bad'); saved = JSON.stringify(C); status('저장됨 — 적 ' + j.enemies + ' · 등장 조합 ' + j.spawns + ' · 방 ' + j.rooms + (probs.length ? ' · 주의 ' + probs.length + '건: ' + probs[0] : ''), probs.length ? 'dirty' : ''); }
    catch (e) { status('저장 실패: ' + e.message, 'bad'); }
  }

  // ───────── 공통: 방 그리기(도식). 생성된 방과 수제 방 정의를 같은 모양으로 받는다.
  const COLORS = { wall: '#232a2f', floor: '#3a4238', floor2: '#353d34', pillar: '#8a8f86', hazard: '#7d2f2a', door: '#c9a35a' };
  const OBJ = { node: ['#8ecf72', '재'], chest: ['#f0a545', '상'], device: ['#b79cf2', '봉'], altar: ['#5fc9b8', '제'], camp: ['#ff9d5c', '불'], portal: ['#ffe27a', '문'] };
  function drawRoom(cv, room, T, o = {}) {
    cv.width = W * T; cv.height = H * T; const ctx = cv.getContext('2d'), tiles = room.tiles, cx = x => x * T + T / 2;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = tiles[y][x]; ctx.fillStyle = c === '#' ? COLORS.wall : (x + y) % 2 ? COLORS.floor : COLORS.floor2; ctx.fillRect(x * T, y * T, T, T); if (c === 'o') { ctx.fillStyle = COLORS.pillar; ctx.beginPath(); ctx.arc(cx(x), cx(y), T * 0.36, 0, 7); ctx.fill(); } if (c === 'h') { ctx.fillStyle = COLORS.hazard; ctx.fillRect(x * T + 2, y * T + 2, T - 4, T - 4); } if (c === 'D') { ctx.fillStyle = COLORS.door; ctx.fillRect(x * T + T * 0.2, y * T + T * 0.2, T * 0.6, T * 0.6); } }
    if (o.doors) for (const p of Object.values(M.DOOR)) { ctx.strokeStyle = COLORS.door; ctx.setLineDash([3, 3]); ctx.strokeRect(p[0] * T + 3, p[1] * T + 3, T - 6, T - 6); ctx.setLineDash([]); }
    const foes = room.enemies || [], objs = room.objects || [], font = b => { ctx.font = (b ? 'bold ' : '') + Math.round(T * 0.5) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; };
    for (const ob of objs) { const guards = ob.guards ? foes.filter(e => ob.guards.includes(e.id)) : ob.guarded ? foes.filter(e => e.post) : []; ctx.strokeStyle = 'rgba(255,143,122,.75)'; ctx.lineWidth = Math.max(1, T / 16); for (const e of guards) { ctx.beginPath(); ctx.moveTo(cx(ob.x), cx(ob.y)); ctx.lineTo(cx(e.x), cx(e.y)); ctx.stroke(); } }
    for (const ob of objs) { const [col, ch] = OBJ[ob.kind] || ['#ccc', '?']; ctx.fillStyle = col; ctx.fillRect(ob.x * T + T * 0.14, ob.y * T + T * 0.14, T * 0.72, T * 0.72); ctx.fillStyle = '#10140f'; font(true); ctx.fillText(ob.kind === 'node' ? (MATERIALS[ob.mat]?.name || '?')[0] : ch, cx(ob.x), cx(ob.y) + 1); }
    for (const e of foes) { const d = ENEMIES[e.kind === '@boss' ? REGIONS[o.region || 'verdant'].boss : e.kind] || {}, pt = e.patrol ? (Array.isArray(e.patrol) ? e.patrol : [e.patrol.a, e.patrol.b]) : null;
      if (pt) { ctx.strokeStyle = '#ffe27a'; ctx.setLineDash([4, 3]); ctx.lineWidth = Math.max(1, T / 14); ctx.beginPath(); ctx.moveTo(cx(pt[0][0]), cx(pt[0][1])); ctx.lineTo(cx(pt[1][0]), cx(pt[1][1])); ctx.stroke(); ctx.setLineDash([]); }
      ctx.fillStyle = d.boss ? '#e0605a' : d.elite ? '#d9764a' : d.range ? '#d68ad0' : '#e8b0a8'; ctx.beginPath(); ctx.arc(cx(e.x), cx(e.y), T * (d.boss ? 0.46 : 0.38), 0, 7); ctx.fill(); if (e.post) { ctx.strokeStyle = '#ff5a4a'; ctx.lineWidth = Math.max(1.5, T / 12); ctx.stroke(); }
      const fdx = (e.facing || (e.x < 6 ? 'right' : 'left')) === 'left' ? -1 : 1; ctx.fillStyle = '#1a0f0d'; ctx.beginPath(); ctx.moveTo(cx(e.x) + fdx * T * 0.34, cx(e.y)); ctx.lineTo(cx(e.x) + fdx * T * 0.12, cx(e.y) - T * 0.16); ctx.lineTo(cx(e.x) + fdx * T * 0.12, cx(e.y) + T * 0.16); ctx.fill();
      if (T >= 30) { ctx.fillStyle = '#fff'; ctx.font = Math.round(T * 0.26) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText((d.name || e.kind).slice(0, 6) + (e.looting ? '·약탈' : ''), cx(e.x), e.y * T + T * 0.86); } }
    if (o.sel) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(o.sel.x * T + 1, o.sel.y * T + 1, T - 2, T - 2); }
  }
  function lintBuilt(room) { // 생성된 방(무작위·수제 공통)의 눈에 띄는 문제
    const out = [], md = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y), safe = room.type === 'entry' || room.type === 'shelter';
    for (const o of room.objects) if (['chest', 'device'].includes(o.kind) && room.enemies.length) { const gs = room.enemies.filter(e => (o.guards || []).includes(e.id)); if (!gs.length) out.push({ level: 'warn', msg: o.kind + ': 지키는 적이 없다' }); else if (!gs.some(e => md(e, o) <= RULES.level.guardRadius)) out.push({ level: 'warn', msg: o.kind + ': 경비가 ' + RULES.level.guardRadius + '칸 밖에 있다' }); }
    for (const e of room.enemies) for (const d of Object.keys(room.doors)) { const p = M.INSIDE[d]; if (Math.abs(p[0] - e.x) + Math.abs(p[1] - e.y) < 2) out.push({ level: 'warn', msg: (ENEMIES[e.kind]?.name || e.kind) + ': 문 바로 앞' }); }
    if (!safe && room.enemies.length && !room.tiles.join('').includes('h')) out.push({ level: 'warn', msg: '위험 지형이 없다(밀치기 활용 불가)' });
    if (!M.valid(room)) out.push({ level: 'error', msg: '닿을 수 없는 곳이 있다' });
    return out;
  }
  const lintHtml = list => '<ul class="lint">' + (list.length ? list.map(i => '<li class="' + i.level + '">' + (i.level === 'error' ? '✖ ' : '▲ ') + esc(i.msg) + '</li>').join('') : '<li class="ok">✔ 문제 없음</li>') + '</ul>';
  const optList = (obj, cur, label) => Object.entries(obj).map(([k, v]) => '<option value="' + k + '"' + (k === cur ? ' selected' : '') + '>' + esc(label ? label(k, v) : v.name || k) + '</option>').join('');

  // ───────── 1) 방 검수
  const RV = { region: 'verdant', type: '', count: 12, seed: 'review', flagged: new Set() };
  function renderReview() {
    const root = $('#tab-review'), reg = REGIONS[RV.region], types = [...new Set(reg.types.concat(reg.extra || []))];
    root.innerHTML = '<div class="bar"><label>지역 <select id="rvRegion">' + optList(REGIONS, RV.region) + '</select></label><label>방 종류 <select id="rvType"><option value="">전체(입구·쉼터 제외)</option>' + types.map(t => '<option value="' + t + '"' + (t === RV.type ? ' selected' : '') + '>' + esc(reg.rooms_def[t].name) + ' (' + t + ')</option>').join('') + '</select></label><label>개수 <select id="rvCount">' + [12, 24, 48].map(n => '<option' + (n === RV.count ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></label><label>시드 <input id="rvSeed" type="text" value="' + esc(RV.seed) + '" style="width:110px"></label><button id="rvGo" type="button">다시 뽑기</button><span id="rvSum" class="dim small"></span></div><div id="rvCards" class="cards"></div>';
    const redo = () => { RV.region = $('#rvRegion').value; RV.type = REGIONS[RV.region].rooms_def[$('#rvType').value] ? $('#rvType').value : ''; RV.count = +$('#rvCount').value; RV.seed = $('#rvSeed').value || 'review'; renderReview(); };
    for (const id of ['#rvRegion', '#rvType', '#rvCount']) $(id).onchange = redo; $('#rvGo').onclick = () => { $('#rvSeed').value = 'r' + Math.random().toString(36).slice(2, 7); redo(); };
    const cards = $('#rvCards'), picked = []; let tries = 0, err = null;
    while (picked.length < RV.count && tries < 400) { const seed = RV.seed + '-' + (tries++); try { const map = M.generate(RV.region, ER.rng.seedStreams(seed)); for (const rm of map.rooms) if (picked.length < RV.count && (RV.type ? rm.type === RV.type : !['entry', 'shelter'].includes(rm.type))) picked.push({ rm, seed }); } catch (e) { err = seed + ': ' + e.message; break; } }
    let warns = 0, patrol = 0, hm = 0, foes = 0;
    for (const { rm, seed } of picked) { const lint = lintBuilt(rm); warns += lint.length; if (rm.enemies.some(e => e.patrol)) patrol++; if (rm.handmade) hm++; foes += rm.enemies.length;
      const card = el('div', 'rc' + (lint.some(i => i.level === 'error') ? ' flag' : '')), cv = el('canvas'); drawRoom(cv, rm, 20, { region: RV.region });
      card.append(el('h4', '', esc(rm.name) + ' <span class="badge">' + rm.type + '</span>' + (rm.handmade ? '<span class="badge hm">수제 ' + esc(rm.handmade) + '</span>' : '')), cv, el('div', 'sub', esc(rm.enemies.map(e => ENEMIES[e.kind].name + (e.patrol ? '(순찰)' : e.looting ? '(약탈)' : e.post ? '(경비)' : '')).join(', ') || '적 없음') + ' · 시드 ' + esc(seed)), el('div', '', lintHtml(lint)));
      const b = el('button', '', '에디터로 복사'); b.type = 'button'; b.onclick = () => { const r = fromBuilt(rm); C.rooms.push(r); ED.id = r.id; touch(); show('rooms'); }; card.append(b); cards.append(card); }
    $('#rvSum').textContent = err ? '생성 실패 ' + err : '방 ' + picked.length + '개 · 평균 적 ' + (foes / Math.max(1, picked.length)).toFixed(1) + ' · 순찰 있는 방 ' + patrol + ' · 수제 방 ' + hm + ' · 경고 ' + warns + '건';
  }
  function freeId(base) { let id = base, n = 2; while (C.rooms.some(r => r.id === id)) id = base + '_' + (n++); return id; }
  function fromBuilt(rm) { // 생성된 방 → 수제 방 초안
    const ids = rm.enemies.filter(e => e.post).map(e => e.id);
    return { tiles: rm.tiles.map(r => r.replace(/D/g, '#')), id: freeId(RV.region + '_' + rm.type), name: '', type: rm.type, regions: [RV.region], weight: 1, flip: true,
      objects: rm.objects.map(o => Object.assign({ kind: o.kind, x: o.x, y: o.y }, o.kind === 'node' ? { mat: o.mat, qty: o.qty } : {}, o.kind === 'chest' ? { chest: o.chest } : {}, o.guards?.some(i => ids.includes(i)) ? { guarded: true } : {})),
      enemies: rm.enemies.map(e => Object.assign({ kind: ENEMIES[e.kind].boss ? '@boss' : e.kind, x: e.x, y: e.y, facing: e.facing }, e.post ? { post: true } : {}, e.looting ? { looting: true } : {}, e.patrol ? { patrol: [e.patrol.a, e.patrol.b] } : {})) };
  }

  // ───────── 2) 방 에디터
  const ED = { id: null, tool: 'select', sel: null, mat: 'wood', qty: 2, chest: 'basic', foe: 'goblin', testRegion: 'verdant', testHero: 'ara', painting: false };
  const TOOLS = [['select', '선택'], ['floor', '바닥'], ['pillar', '기둥'], ['hazard', '위험 지형'], ['node', '재료'], ['chest', '상자'], ['device', '봉인 장치'], ['altar', '제단'], ['camp', '모닥불'], ['portal', '귀환문'], ['foe', '적'], ['patrol', '순찰 끝점'], ['erase', '지우기']];
  const curRoom = () => C.rooms.find(r => r.id === ED.id) || null;
  const thingAt = (r, x, y) => (r.enemies || []).find(e => e.x === x && e.y === y) || (r.objects || []).find(o => o.x === x && o.y === y) || null;
  function setTile(r, x, y, c) { if (x < 1 || y < 1 || x > W - 2 || y > H - 2) return; r.tiles[y] = r.tiles[y].slice(0, x) + c + r.tiles[y].slice(x + 1); }
  function removeAt(r, x, y) { r.enemies = (r.enemies || []).filter(e => !(e.x === x && e.y === y)); r.objects = (r.objects || []).filter(o => !(o.x === x && o.y === y)); }
  function applyTool(r, x, y, drag) {
    if (x < 1 || y < 1 || x > W - 2 || y > H - 2) return; const t = ED.tool;
    if (t === 'select') { if (!drag) ED.sel = thingAt(r, x, y) ? { x, y } : null; }
    else if (t === 'floor' || t === 'pillar' || t === 'hazard') { if (t !== 'floor') removeAt(r, x, y); setTile(r, x, y, { floor: '.', pillar: 'o', hazard: 'h' }[t]); }
    else if (t === 'erase') { if (thingAt(r, x, y)) removeAt(r, x, y); else setTile(r, x, y, '.'); ED.sel = null; }
    else if (drag) return;
    else if (t === 'patrol') { const e = ED.sel && (r.enemies || []).find(q => q.x === ED.sel.x && q.y === ED.sel.y); if (!e) return status('먼저 "선택"으로 적을 고르세요', 'bad'); if (x === e.x && y === e.y) delete e.patrol; else if (x !== e.x && y !== e.y) return status('순찰로는 가로나 세로 한 줄이어야 합니다', 'bad'); else { e.patrol = [[e.x, e.y], [x, y]]; delete e.post; } }
    else { removeAt(r, x, y); setTile(r, x, y, '.');
      if (t === 'foe') (r.enemies = r.enemies || []).push({ kind: ED.foe, x, y, facing: x < 6 ? 'right' : 'left', post: true });
      else (r.objects = r.objects || []).push(Object.assign({ kind: t, x, y }, t === 'node' ? { mat: ED.mat, qty: ED.qty } : {}, t === 'chest' ? { chest: ED.chest } : {}, ['chest', 'device'].includes(t) ? { guarded: true } : {}));
      ED.sel = { x, y }; }
    touch();
  }
  function newRoom() { const r = { tiles: M.blank(), id: freeId('room'), name: '', type: 'hall', regions: ['verdant'], weight: 1, flip: true, objects: [], enemies: [] }; C.rooms.push(r); ED.id = r.id; ED.sel = null; touch(); renderRooms(); }
  function renderRooms() {
    const root = $('#tab-rooms'); if (!curRoom() && C.rooms.length) ED.id = C.rooms[0].id; const r = curRoom();
    root.innerHTML = '<div class="cols"><div><div class="list" id="edList"></div><div class="row" style="margin-top:6px"><button id="edNew" type="button">새 방</button><button id="edDup" type="button"' + (r ? '' : ' disabled') + '>복제</button><button id="edDel" class="danger" type="button"' + (r ? '' : ' disabled') + '>삭제</button></div></div><div id="edMain"></div><div id="edSide"></div></div>';
    const list = $('#edList'); if (!C.rooms.length) list.append(el('div', 'grp', '수제 방이 없습니다. "새 방"을 누르거나 방 검수 탭에서 "에디터로 복사"를 쓰세요.'));
    for (const q of C.rooms) { const bad = M.lintRoom(q).some(i => i.level === 'error'), b = el('button', q.id === ED.id ? 'sel' : '', esc(q.id) + ' <span class="badge">' + q.type + '</span>' + (q.disabled ? '<span class="badge">끔</span>' : '') + (bad ? '<span class="badge" style="color:#ff9c95;border-color:#ff9c95">오류</span>' : '')); b.type = 'button'; b.onclick = () => { ED.id = q.id; ED.sel = null; renderRooms(); }; list.append(b); }
    $('#edNew').onclick = newRoom;
    $('#edDup').onclick = () => { const c = clone(r); c.id = freeId(r.id); C.rooms.push(c); ED.id = c.id; touch(); renderRooms(); };
    $('#edDel').onclick = () => { if (!confirm('방 ' + r.id + ' 을(를) 지울까요?')) return; C.rooms.splice(C.rooms.indexOf(r), 1); ED.id = null; touch(); renderRooms(); };
    if (!r) return;
    const main = $('#edMain'); main.innerHTML = '<div class="panel"><div class="tools" id="edTools"></div><div class="row small" id="edOpts" style="margin:8px 0"></div><canvas id="edCanvas"></canvas><div class="dim small" style="margin-top:6px">왼쪽 클릭: 도구 적용(바닥·기둥·위험 지형은 끌어서 칠하기) · 오른쪽 클릭: 지우기 · 점선 네모는 문이 날 수 있는 자리 · 붉은 선은 경비 관계, 노란 점선은 순찰로, 붉은 테두리는 경비(post)</div></div>';
    for (const [id, name] of TOOLS) { const b = el('button', ED.tool === id ? 'on' : '', name); b.type = 'button'; b.onclick = () => { ED.tool = id; renderRooms(); }; $('#edTools').append(b); }
    const opts = $('#edOpts');
    if (ED.tool === 'node') { opts.innerHTML = '재료 <select id="oMat">' + optList(MATERIALS, ED.mat) + '</select> 수량 <input id="oQty" type="number" min="1" max="9" value="' + ED.qty + '">'; $('#oMat').onchange = e => { ED.mat = e.target.value; }; $('#oQty').onchange = e => { ED.qty = Math.max(1, +e.target.value || 1); }; }
    else if (ED.tool === 'chest') { opts.innerHTML = '상자 <select id="oChest">' + optList(CHESTS, ED.chest) + '</select>'; $('#oChest').onchange = e => { ED.chest = e.target.value; }; }
    else if (ED.tool === 'foe') { opts.innerHTML = '적 <select id="oFoe"><option value="@boss"' + (ED.foe === '@boss' ? ' selected' : '') + '>@boss (그 지역의 수호자)</option>' + optList(Object.fromEntries(Object.entries(ENEMIES).filter(([, d]) => !d.boss)), ED.foe, (k, d) => d.name + ' (' + k + ')') + '</select>'; $('#oFoe').onchange = e => { ED.foe = e.target.value; }; }
    else if (ED.tool === 'patrol') opts.textContent = '"선택"으로 적을 고른 뒤, 같은 줄의 끝 칸을 누릅니다. 적 자신을 누르면 순찰을 지웁니다.';
    const cv = $('#edCanvas'), T = 48, paint = () => drawRoom(cv, r, T, { doors: true, sel: ED.sel, region: (r.regions || [])[0] }); paint();
    const at = e => { const b = cv.getBoundingClientRect(); return [Math.floor((e.clientX - b.left) / b.width * W), Math.floor((e.clientY - b.top) / b.height * H)]; };
    cv.onmousedown = e => { if (e.button === 2) return; ED.painting = true; const [x, y] = at(e); applyTool(r, x, y, false); if (['floor', 'pillar', 'hazard'].includes(ED.tool)) paint(); else renderRooms(); };
    cv.onmousemove = e => { if (!ED.painting || !['floor', 'pillar', 'hazard'].includes(ED.tool)) return; const [x, y] = at(e); applyTool(r, x, y, true); paint(); };
    g.onmouseup = () => { if (ED.painting) { ED.painting = false; if (tab === 'rooms') renderSide(r); } };
    cv.oncontextmenu = e => { e.preventDefault(); const [x, y] = at(e), keep = ED.tool; ED.tool = 'erase'; applyTool(r, x, y, false); ED.tool = keep; renderRooms(); };
    renderSide(r);
  }
  function renderSide(r) {
    const side = $('#edSide'); if (!side) return; const types = [...new Set(Object.values(REGIONS).flatMap(q => q.types.concat(q.extra || [])))], lint = M.lintRoom(r);
    side.innerHTML = '<div class="panel"><h3>방 정보</h3><div class="form"><label>id</label><input id="rId" type="text" value="' + esc(r.id) + '"><label>이름</label><input id="rName" type="text" placeholder="비우면 지역의 방 이름" value="' + esc(r.name || '') + '"><label>방 종류</label><select id="rType">' + types.map(t => '<option' + (t === r.type ? ' selected' : '') + '>' + t + '</option>').join('') + '</select><label>지역</label><div class="row">' + Object.values(REGIONS).map(q => '<label class="row"><input type="checkbox" data-reg="' + q.id + '"' + ((r.regions || []).includes(q.id) ? ' checked' : '') + '>' + esc(q.name) + '</label>').join('') + '</div><label>가중치</label><input id="rW" type="number" min="1" max="9" value="' + (r.weight || 1) + '"><label>옵션</label><div class="row"><label class="row"><input id="rFlip" type="checkbox"' + (r.flip ? ' checked' : '') + '>무작위 뒤집기</label><label class="row"><input id="rOff" type="checkbox"' + (r.disabled ? ' checked' : '') + '>게임에서 끄기</label></div></div><div class="dim small" style="margin-top:6px">같은 종류의 수제 방이 있으면 ' + Math.round(RULES.level.handmade * 100) + '% 확률로 무작위 방 대신 나옵니다.</div></div><div class="panel"><h3>검사</h3>' + lintHtml(lint) + '</div><div class="panel" id="edSel"></div><div class="panel"><h3>시험 플레이</h3><div class="row"><select id="tReg">' + optList(Object.fromEntries((r.regions?.length ? r.regions : Object.keys(REGIONS)).map(k => [k, REGIONS[k]])), ED.testRegion) + '</select><select id="tHero">' + optList(D.HEROES, ED.testHero) + '</select><button id="tGo" class="primary" type="button"' + (lint.some(i => i.level === 'error') ? ' disabled' : '') + '>새 창에서 플레이</button></div><div class="dim small" style="margin-top:6px">저장하지 않아도 지금 그린 상태로 시험합니다. 시험 플레이는 게임 저장을 건드리지 않습니다.</div></div>';
    $('#rId').onchange = e => { const v = e.target.value.trim(); if (!/^[a-z][a-z0-9_]*$/.test(v) || C.rooms.some(q => q !== r && q.id === v)) { e.target.value = r.id; return status('id 는 겹치지 않는 영문 소문자·숫자·_', 'bad'); } r.id = ED.id = v; touch(); renderRooms(); };
    $('#rName').onchange = e => { r.name = e.target.value.trim(); touch(); }; $('#rType').onchange = e => { r.type = e.target.value; touch(); renderRooms(); }; $('#rW').onchange = e => { r.weight = Math.max(1, +e.target.value || 1); touch(); };
    $('#rFlip').onchange = e => { r.flip = e.target.checked; touch(); }; $('#rOff').onchange = e => { if (e.target.checked) r.disabled = true; else delete r.disabled; touch(); renderRooms(); };
    side.querySelectorAll('[data-reg]').forEach(c => { c.onchange = () => { r.regions = [...side.querySelectorAll('[data-reg]:checked')].map(q => q.dataset.reg); touch(); renderRooms(); }; });
    $('#tReg').onchange = e => { ED.testRegion = e.target.value; }; $('#tHero').onchange = e => { ED.testHero = e.target.value; };
    $('#tGo').onclick = () => { try { localStorage.setItem('er-editor-test', JSON.stringify({ room: r, region: $('#tReg').value, hero: $('#tHero').value })); } catch (e) { return status('시험 정보를 넘기지 못했다: ' + e.message, 'bad'); } g.open('index.html?test=1', 'er-test'); };
    const box = $('#edSel'), t = ED.sel && thingAt(r, ED.sel.x, ED.sel.y);
    if (!t) { box.innerHTML = '<h3>선택한 것</h3><div class="dim small">"선택" 도구로 소품이나 적을 누르면 속성을 고칩니다.</div>'; return; }
    const foe = (r.enemies || []).includes(t), done = () => { touch(); renderRooms(); };
    if (foe) { box.innerHTML = '<h3>' + esc(t.kind === '@boss' ? '@boss' : ENEMIES[t.kind]?.name || t.kind) + ' (' + t.x + ',' + t.y + ')</h3><div class="form"><label>바라봄</label><select id="sFace"><option value="left"' + (t.facing === 'left' ? ' selected' : '') + '>왼쪽</option><option value="right"' + (t.facing !== 'left' ? ' selected' : '') + '>오른쪽</option></select><label>역할</label><div class="row"><label class="row"><input id="sPost" type="checkbox"' + (t.post ? ' checked' : '') + '>경비(소품을 지킨다)</label><label class="row"><input id="sLoot" type="checkbox"' + (t.looting ? ' checked' : '') + '>약탈 중(표시용)</label></div><label>순찰</label><div class="small">' + (t.patrol ? '(' + t.patrol[0] + ') ↔ (' + t.patrol[1] + ')' : '없음 — "순찰 끝점" 도구') + '</div></div><div class="dim small" style="margin-top:6px">' + esc(t.kind === '@boss' ? '성소에서 그 지역의 수호자로 바뀐다.' : D.enemyNote(t.kind) || AI_TYPES[ENEMIES[t.kind]?.ai] || '') + '</div>';
      $('#sFace').onchange = e => { t.facing = e.target.value; done(); }; $('#sPost').onchange = e => { if (e.target.checked) t.post = true; else delete t.post; done(); }; $('#sLoot').onchange = e => { if (e.target.checked) t.looting = true; else delete t.looting; done(); }; }
    else { box.innerHTML = '<h3>' + esc(t.kind === 'node' ? MATERIALS[t.mat]?.name + ' ×' + t.qty : CHESTS[t.chest]?.name || t.kind) + ' (' + t.x + ',' + t.y + ')</h3><div class="form">' + (t.kind === 'node' ? '<label>재료</label><select id="sMat">' + optList(MATERIALS, t.mat) + '</select><label>수량</label><input id="sQty" type="number" min="1" max="9" value="' + t.qty + '">' : '') + (t.kind === 'chest' ? '<label>상자</label><select id="sChest">' + optList(CHESTS, t.chest) + '</select>' : '') + (['node', 'chest', 'device'].includes(t.kind) ? '<label>경비</label><label class="row"><input id="sGuard" type="checkbox"' + (t.guarded ? ' checked' : '') + '>경비가 살아 있으면 손댈 수 없다</label>' : '') + '</div>';
      if ($('#sMat')) { $('#sMat').onchange = e => { t.mat = e.target.value; done(); }; $('#sQty').onchange = e => { t.qty = Math.max(1, +e.target.value || 1); done(); }; } if ($('#sChest')) $('#sChest').onchange = e => { t.chest = e.target.value; done(); }; if ($('#sGuard')) $('#sGuard').onchange = e => { if (e.target.checked) t.guarded = true; else delete t.guarded; done(); }; }
  }

  // ───────── 3) 몬스터 작업대
  const ORIG = {}; // 페이지를 열 때의 적 표(기본 + 저장된 content). "기본값으로" 되돌릴 때 쓴다.
  const FO = { id: 'goblin', count: 1, mates: '', region: 'verdant', grown: false, n: 100, ref: 'goblin', result: null };
  const FIELDS = [['hp', '체력', 1, 200], ['dmg', '피해', 0, 30], ['speed', '이동', 0, 8], ['detect', '감지 거리', 1, 12], ['range', '사거리(0=근접)', 0, 8], ['armor', '장갑', 0, 5], ['size', '그림 크기', 24, 96]];
  const isBase = k => !!ORIG[k]?.__base, badge = k => (!ORIG[k] ? '<span class="badge add">새 적</span>' : C.enemies[k] && ORIG[k].__base ? '<span class="badge mod">수정됨</span>' : ORIG[k].__base ? '<span class="badge">기본</span>' : '<span class="badge add">추가</span>');
  function edit(k, fn) { // 기본 적을 고치면 전체 사본이 content 에 덮어쓰기로 들어간다
    if (!C.enemies[k]) C.enemies[k] = clone(ENEMIES[k]); fn(C.enemies[k]); const d = C.enemies[k]; for (const f of ['range', 'armor']) if (!d[f]) delete d[f]; if (d.traits && !Object.keys(d.traits).length) delete d.traits; if (!d.note) delete d.note; if (!d.tint) delete d.tint; if (!d.elite) delete d.elite;
    ENEMIES[k] = clone(d); FO.result = null; touch();
  }
  function usedBy(k) { const out = []; C.spawns.forEach(s => { if (s.group.includes(k)) out.push('등장 조합 ' + s.region + '/' + s.room); }); for (const r of C.rooms) if ((r.enemies || []).some(e => e.kind === k)) out.push('방 ' + r.id); for (const [q, d] of Object.entries(ENEMIES)) for (const p of Object.values(d.traits || {})) if (q !== k && (p.into === k || p.kind === k)) out.push(d.name + '의 특성'); for (const q of Object.values(REGIONS)) for (const [t, def] of Object.entries(q.rooms_def)) if (def.enemies.some(gp => gp.includes(k)) && !C.spawns.some(s => s.region === q.id && s.room === t && s.group.includes(k))) out.push('기본 조합 ' + q.id + '/' + t); return out; }
  function renderFoes() {
    const root = $('#tab-foes'); if (!ENEMIES[FO.id]) FO.id = 'goblin'; const k = FO.id, d = ENEMIES[k];
    root.innerHTML = '<div class="cols"><div><div class="list" id="foList"></div><div class="row" style="margin-top:6px"><button id="foNew" type="button">새 적</button><button id="foDup" type="button">복제</button></div></div><div id="foMain"></div><div id="foSide"></div></div>';
    const list = $('#foList'), groups = [['일반', q => !q.boss && !q.elite], ['정예', q => q.elite && !q.boss], ['수호자', q => q.boss]];
    for (const [name, f] of groups) { list.append(el('div', 'grp', name)); for (const [id, q] of Object.entries(ENEMIES)) if (f(q)) { const b = el('button', id === k ? 'sel' : '', esc(q.name) + ' ' + badge(id)); b.type = 'button'; b.onclick = () => { FO.id = id; FO.result = null; renderFoes(); }; list.append(b); } }
    const make = (src, name) => { let id = prompt('새 적의 id (영문 소문자·숫자·_)', src ? src + '2' : 'newfoe'); if (!id) return; id = id.trim(); if (!/^[a-z][a-z0-9_]*$/.test(id) || ENEMIES[id]) return status('쓸 수 없는 id: ' + id, 'bad'); const base = src ? clone(ENEMIES[src]) : { name, asset: 'enemy.goblin', hp: 8, dmg: 3, speed: 3, detect: 3, ai: 'melee', size: 46, gold: [2, 4], loot: [] }; delete base.__base; if (src) base.name += ' 변종'; C.enemies[id] = base; ENEMIES[id] = clone(base); FO.id = id; FO.result = null; touch(); renderFoes(); };
    $('#foNew').onclick = () => make(null, '새 적'); $('#foDup').onclick = () => make(k);
    // 가운데: 수치·특성
    const assets = Object.keys(ER.ASSETS.assets).filter(a => a.startsWith('enemy.')), main = $('#foMain'), boss = d.ai === 'boss';
    main.innerHTML = '<div class="panel"><h3>' + esc(d.name) + ' <span class="dim small">' + k + '</span> ' + badge(k) + '</h3><div class="row" style="align-items:flex-start;gap:14px"><canvas id="foArt" width="130" height="130" style="background:#0a0d0f;border-radius:6px"></canvas><div class="form" style="flex:1;min-width:260px"><label>이름</label><input id="fName" type="text" value="' + esc(d.name) + '"><label>그림</label><select id="fAsset">' + assets.map(a => '<option' + (a === d.asset ? ' selected' : '') + '>' + a + '</option>').join('') + '</select><label>색 필터</label><input id="fTint" type="text" placeholder="예: hue-rotate(60deg) saturate(1.5)" value="' + esc(d.tint || '') + '"><label>행동 유형</label><select id="fAi">' + optList(AI_TYPES, d.ai, (id, v) => id + ' — ' + v) + '</select>' + FIELDS.map(([f, name, lo, hi]) => '<label>' + name + '</label><input data-num="' + f + '" type="number" min="' + lo + '" max="' + hi + '" value="' + (d[f] || 0) + '">').join('') + '<label>금화</label><div class="row"><input id="fG0" type="number" min="0" max="99" value="' + d.gold[0] + '">~<input id="fG1" type="number" min="0" max="99" value="' + d.gold[1] + '"></div><label>구분</label><label class="row"><input id="fElite" type="checkbox"' + (d.elite ? ' checked' : '') + (boss ? ' disabled' : '') + '>정예(목표 바로 앞을 지키고, 붉은달 증원에서 빠진다)</label>' + (boss ? '<label>예고 순서</label><input id="fPattern" type="text" value="' + esc((d.pattern || []).join(', ')) + '"><label>피해 상한</label><input data-num="cap" type="number" min="0" max="30" value="' + (d.cap || 0) + '">' : '') + '<label>설명</label><textarea id="fNote" placeholder="툴팁에 보이는 글(특성 설명은 자동으로 붙는다)">' + esc(d.note || '') + '</textarea></div></div></div><div class="panel"><h3>전리품</h3><div id="foLoot"></div><div class="row"><select id="lMat">' + optList(MATERIALS) + '</select><button id="lAdd" type="button">추가</button></div></div><div class="panel"><h3>특성 <span class="dim small">— 행동 유형 위에 얹는 조립식 부품</span></h3><div id="foTraits"></div><div class="row"><select id="tAdd">' + Object.entries(TRAITS).filter(([id]) => !d.traits?.[id]).map(([id, t]) => '<option value="' + id + '">' + esc(t.name) + '</option>').join('') + '</select><button id="tAddBtn" type="button">특성 추가</button></div></div>';
    const art = $('#foArt').getContext('2d'), a = ER.gfx.asset(d.asset); if (a) { const fr = a.anims?.idle?.frames?.[0] ?? Object.keys(a.frames)[0]; ER.gfx.sprite(art, d.asset, fr, 65, 118, Math.min(110, (d.size || 46) * 1.7), !a.facesLeft, d.tint || null); }
    const re = () => renderFoes();
    $('#fName').onchange = e => { edit(k, q => { q.name = e.target.value.trim() || q.name; }); re(); }; $('#fAsset').onchange = e => { edit(k, q => { q.asset = e.target.value; }); re(); }; $('#fTint').onchange = e => { edit(k, q => { q.tint = e.target.value.trim(); }); re(); };
    $('#fAi').onchange = e => { edit(k, q => { q.ai = e.target.value; if (['ranged', 'caster'].includes(q.ai) && !q.range) q.range = 4; if (q.ai === 'boss') { q.boss = true; q.pattern = q.pattern || ['sweep', 'charge']; q.cap = q.cap || 8; } else { delete q.boss; delete q.pattern; delete q.cap; } }); re(); };
    main.querySelectorAll('[data-num]').forEach(i => { i.onchange = () => { edit(k, q => { q[i.dataset.num] = Math.max(+i.min, Math.min(+i.max, Math.round(+i.value || 0))); }); re(); }; });
    $('#fG0').onchange = $('#fG1').onchange = () => { edit(k, q => { const lo = Math.max(0, +$('#fG0').value || 0), hi = Math.max(lo, +$('#fG1').value || 0); q.gold = [lo, hi]; }); re(); };
    $('#fElite').onchange = e => { edit(k, q => { q.elite = e.target.checked; }); re(); }; $('#fNote').onchange = e => { edit(k, q => { q.note = e.target.value.trim(); }); };
    if (boss) $('#fPattern').onchange = e => { const okp = ['sweep', 'charge', 'summon', 'slam', 'vent', 'runes', 'beam', 'blink'], p = e.target.value.split(',').map(x => x.trim()).filter(x => okp.includes(x)); if (!p.length) { status('쓸 수 있는 예고: ' + okp.join(', '), 'bad'); return re(); } edit(k, q => { q.pattern = p; if (p.includes('summon') && !q.summon) q.summon = 'goblin'; }); re(); };
    const loot = $('#foLoot'); (d.loot || []).forEach(([mat, p], i) => { const row = el('div', 'row small', esc(MATERIALS[mat]?.name || mat) + ' 확률 <input type="number" min="0" max="1" step="0.05" value="' + p + '"> <button type="button" class="danger">빼기</button>'); row.style.marginBottom = '4px'; row.querySelector('input').onchange = e => { edit(k, q => { q.loot[i][1] = Math.max(0, Math.min(1, +e.target.value || 0)); }); }; row.querySelector('button').onclick = () => { edit(k, q => { q.loot.splice(i, 1); }); re(); }; loot.append(row); });
    $('#lAdd').onclick = () => { const mat = $('#lMat').value; if ((d.loot || []).some(l => l[0] === mat)) return; edit(k, q => { (q.loot = q.loot || []).push([mat, 0.5]); }); re(); };
    const tr = $('#foTraits'); if (!Object.keys(d.traits || {}).length) tr.append(el('div', 'dim small', '특성 없음.'));
    for (const [id, p] of Object.entries(d.traits || {})) { const meta = TRAITS[id], box = el('div', 'trait'); if (!meta) { box.textContent = '모르는 특성: ' + id; tr.append(box); continue; }
      box.innerHTML = '<div class="t"><strong>' + esc(meta.name) + '</strong><div class="row small">' + Object.entries(meta.params).map(([f, [def, label]]) => '<label class="row">' + esc(label) + ' ' + (typeof def === 'string' ? '<select data-p="' + f + '">' + optList(Object.fromEntries(Object.entries(ENEMIES).filter(([q, v]) => !v.boss && q !== k)), p[f], (q, v) => v.name) + '</select>' : '<input data-p="' + f + '" type="number" min="0" max="100" value="' + p[f] + '">') + '</label>').join('') + '<button type="button" class="danger">빼기</button></div></div><div class="d">' + esc(meta.text(p)) + '</div>';
      box.querySelectorAll('[data-p]').forEach(i => { i.onchange = () => { edit(k, q => { q.traits[id][i.dataset.p] = i.tagName === 'SELECT' ? i.value : Math.max(0, +i.value || 0); }); re(); }; }); box.querySelector('button').onclick = () => { edit(k, q => { delete q.traits[id]; }); re(); }; tr.append(box); }
    $('#tAddBtn').onclick = () => { const id = $('#tAdd').value; if (!id) return; edit(k, q => { q.traits = q.traits || {}; q.traits[id] = Object.fromEntries(Object.entries(TRAITS[id].params).map(([f, [def]]) => [f, def])); }); re(); };
    renderFoeSide(k, d);
  }
  function renderFoeSide(k, d) {
    const side = $('#foSide'), mine = C.spawns.map((s, i) => [s, i]).filter(([s]) => s.group.includes(k)), uses = usedBy(k);
    side.innerHTML = '<div class="panel"><h3>모의전</h3><div class="form"><label>이 적 수</label><input id="dCount" type="number" min="1" max="4" value="' + FO.count + '"><label>동료</label><input id="dMates" type="text" placeholder="예: archer, goblin" value="' + esc(FO.mates) + '"><label>지역</label><select id="dReg">' + optList(REGIONS, FO.region) + '</select><label>대원</label><label class="row"><input id="dGrown" type="checkbox"' + (FO.grown ? ' checked' : '') + '>성장한 대원(훈련 2·장비 2)</label><label>비교 대상</label><select id="dRef">' + optList(Object.fromEntries(Object.entries(ENEMIES).filter(([, v]) => !!v.boss === !!d.boss)), FO.ref, (q, v) => v.name) + '</select></div><div class="row" style="margin-top:8px"><button id="dGo" class="primary" type="button">' + FO.n + '판 돌리기</button><span id="dMsg" class="dim small"></span></div><div id="dOut" style="margin-top:8px"></div><div class="dim small" style="margin-top:6px">봇은 사람보다 단순합니다. 절대값보다 비교 대상과의 차이를 보세요.</div></div><div class="panel"><h3>나오는 곳</h3><div id="spList"></div><div class="row"><select id="spReg">' + optList(REGIONS, FO.region) + '</select><select id="spRoom"></select></div><div class="row" style="margin-top:4px"><input id="spGroup" type="text" style="flex:1" value="' + esc(k) + '" placeholder="함께 나오는 적(쉼표)"><button id="spAdd" type="button">조합 추가</button></div><div class="dim small" style="margin-top:6px">방이 만들어질 때 그 방 종류의 조합 가운데 하나가 뽑힙니다. 저장 후 새로고침하면 방 검수 탭에 반영됩니다.</div></div><div class="panel"><h3>관리</h3><div class="row">' + (isBase(k) ? '<button id="foReset" type="button"' + (C.enemies[k] ? '' : ' disabled') + '>기본값으로 되돌리기</button>' : '<button id="foDel" class="danger" type="button">이 적 삭제</button>') + '</div>' + (uses.length ? '<div class="dim small" style="margin-top:6px">쓰이는 곳: ' + esc(uses.join(', ')) + '</div>' : '') + '</div>';
    const fillRooms = () => { const q = REGIONS[$('#spReg').value]; $('#spRoom').innerHTML = Object.entries(q.rooms_def).filter(([, def]) => def.enemies.length && !def.enemies.flat().some(x => ENEMIES[x]?.boss)).map(([t, def]) => '<option value="' + t + '">' + esc(def.name) + ' (' + t + ')</option>').join(''); }; fillRooms(); $('#spReg').onchange = fillRooms;
    const sp = $('#spList'); for (const q of Object.values(REGIONS)) for (const [t, def] of Object.entries(q.rooms_def)) for (const gp of def.enemies) if (gp.includes(k) && !mine.some(([s]) => s.region === q.id && s.room === t && s.group.join() === gp.join())) sp.append(el('div', 'small dim', esc(q.name + ' · ' + def.name + ': ' + gp.map(x => ENEMIES[x].name).join(' + ')) + ' <span class="badge">기본</span>'));
    for (const [s, i] of mine) { const row = el('div', 'row small', esc(REGIONS[s.region]?.name + ' · ' + (REGIONS[s.region]?.rooms_def[s.room]?.name || s.room) + ': ' + s.group.map(x => ENEMIES[x]?.name || x).join(' + ')) + ' <button type="button" class="danger">빼기</button>'); row.style.marginBottom = '4px'; row.querySelector('button').onclick = () => { C.spawns.splice(i, 1); touch(); renderFoes(); }; sp.append(row); }
    if (!sp.children.length) sp.append(el('div', 'dim small', '아직 어느 방에도 나오지 않는다.'));
    $('#spAdd').onclick = () => { const group = $('#spGroup').value.split(',').map(x => x.trim()).filter(Boolean), bad = group.find(x => !ENEMIES[x] || ENEMIES[x].boss); if (!group.length || bad) return status('조합에 쓸 수 없는 적: ' + (bad || '(비어 있음)'), 'bad'); if (group.length > 3) return status('한 조합은 3마리까지', 'bad'); C.spawns.push({ region: $('#spReg').value, room: $('#spRoom').value, group }); touch(); renderFoes(); };
    if ($('#foReset')) $('#foReset').onclick = () => { delete C.enemies[k]; const o = clone(ORIG[k]); delete o.__base; ENEMIES[k] = o; FO.result = null; touch(); renderFoes(); };
    if ($('#foDel')) $('#foDel').onclick = () => { if (uses.length) return status('먼저 쓰이는 곳에서 빼세요: ' + uses.join(', '), 'bad'); if (!confirm(d.name + ' 을(를) 지울까요?')) return; delete C.enemies[k]; delete ENEMIES[k]; FO.id = 'goblin'; touch(); renderFoes(); };
    for (const [id, f] of [['#dCount', 'count'], ['#dMates', 'mates'], ['#dReg', 'region'], ['#dRef', 'ref']]) $(id).onchange = e => { FO[f] = f === 'count' ? Math.max(1, Math.min(4, +e.target.value || 1)) : e.target.value; FO.result = null; }; $('#dGrown').onchange = e => { FO.grown = e.target.checked; FO.result = null; };
    const out = $('#dOut'), table = res => { const pct = v => Math.round(v * 100) + '%', rows = Object.keys(D.HEROES).map(h => { const a = res.me[h], b = res.ref[h], diff = a.lost - b.lost; return '<tr><td>' + esc(D.HEROES[h].name) + '</td><td>' + pct(a.win) + '</td><td>' + pct(a.hpLeft) + '</td><td>' + a.turns.toFixed(1) + '</td><td>' + a.lost.toFixed(1) + '</td><td style="color:' + (diff > 1 ? '#ff9c95' : diff < -1 ? '#8ecf72' : 'inherit') + '">' + (diff >= 0 ? '+' : '') + diff.toFixed(1) + '</td></tr>'; }).join(''); out.innerHTML = '<table><thead><tr><th>대원</th><th>승률</th><th>승리 시 체력</th><th>턴</th><th>받은 피해</th><th>비교 대비</th></tr></thead><tbody>' + rows + '</tbody></table><div class="dim small" style="margin-top:4px">비교: ' + esc(ENEMIES[FO.ref].name) + ' ×' + FO.count + ' — 받은 피해 ' + Object.keys(D.HEROES).map(h => res.ref[h].lost.toFixed(1)).join(' / ') + '</div>'; };
    if (FO.result) table(FO.result);
    $('#dGo').onclick = () => { const mates = FO.mates.split(',').map(x => x.trim()).filter(Boolean), bad = mates.find(x => !ENEMIES[x]); if (bad) return status('모르는 적: ' + bad, 'bad'); const spots = [[8, 4], [9, 2], [9, 6], [10, 4], [10, 3], [10, 5], [7, 2]], line = kind => Array.from({ length: FO.count }, () => kind).concat(mates).slice(0, spots.length).map((q, i) => [q, spots[i][0], spots[i][1]]);
      $('#dMsg').textContent = '계산 중…'; $('#dGo').disabled = true; setTimeout(() => { try { const o = { n: FO.n, region: FO.region, grown: FO.grown, seed: 'wb' }; FO.result = { me: ER.bot.duel(line(k), o), ref: ER.bot.duel(line(FO.ref), o) }; table(FO.result); $('#dMsg').textContent = ''; } catch (e) { $('#dMsg').textContent = '실패: ' + e.message; } $('#dGo').disabled = false; }, 30); };
  }

  // ───────── 시작
  function show(t) { tab = t; for (const id of ['review', 'rooms', 'foes']) { $('#tab-' + id).hidden = id !== t; document.querySelector('[data-tab="' + id + '"]').classList.toggle('on', id === t); } try { history.replaceState(null, '', '#' + t); } catch (e) { /* file:// */ } ({ review: renderReview, rooms: renderRooms, foes: renderFoes })[t](); }
  async function boot() {
    for (const [k, d] of Object.entries(ENEMIES)) ORIG[k] = clone(d);
    // data.js 의 기본 적. 고치면 content 에 덮어쓰기로 들어가고, 지울 수는 없다.
    const baseIds = ['goblin', 'wolf', 'archer', 'shaman', 'brute', 'hound', 'sentry', 'slinger', 'acolyte', 'wraith', 'warden', 'overseer', 'hierophant', 'stalker']; for (const k of baseIds) if (ORIG[k]) { ORIG[k].__base = true; }
    document.querySelectorAll('[data-tab]').forEach(b => { b.onclick = () => show(b.dataset.tab); });
    $('#btnSave').onclick = save; $('#btnText').onclick = () => showText('src/content.js 본문', '지금 작업본을 파일 본문으로 만든 것입니다.'); $('#dlgClose').onclick = () => { $('#dlg').hidden = true; }; $('#dlgCopy').onclick = async () => { $('#dlgText').select(); try { await navigator.clipboard.writeText($('#dlgText').value); status('복사했습니다'); } catch (e) { document.execCommand('copy'); } };
    g.addEventListener('beforeunload', e => { if (dirty()) { e.preventDefault(); e.returnValue = ''; } });
    g.addEventListener('hashchange', () => { const t = location.hash.slice(1); if (['review', 'rooms', 'foes'].includes(t) && t !== tab) show(t); });
    g.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } });
    try { const r = await fetch('/__dev/ping'); canSave = r.ok && (await r.json()).ok === true; } catch (e) { canSave = false; }
    await ER.gfx.load(); status(); show(['review', 'rooms', 'foes'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'review');
    g.__ER_EDITOR = { C, ED, FO, RV, show, problems };
  }
  boot().catch(e => { document.body.innerHTML = '<pre style="color:#f88;padding:20px">도구 시작 실패: ' + (e?.stack || e) + '</pre>'; });
})(typeof globalThis !== 'undefined' ? globalThis : this);
