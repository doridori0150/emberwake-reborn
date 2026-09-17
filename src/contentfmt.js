/* content.js 파일 본문을 만든다. 로컬 서버(tools/server.cjs)의 저장 API 와 editor.html 의 "텍스트 복사"가 함께 쓴다.
   항목 하나가 한 줄이라 git diff 로 바뀐 곳이 잘 보인다. */
(function (g) {
  'use strict';
  const ER = (g.ER = g.ER || {});
  const spaced = v =>
    Array.isArray(v)
      ? '[' + v.map(spaced).join(', ') + ']'
      : v && typeof v === 'object'
        ? Object.keys(v).length
          ? '{ ' +
            Object.entries(v)
              .filter(([, x]) => x !== undefined)
              .map(([k, x]) => JSON.stringify(k) + ': ' + spaced(x))
              .join(', ') +
            ' }'
          : '{}'
        : JSON.stringify(v); // 한 줄 JSON
  function check(c) {
    // 저장 전 최소 모양 검사. 문제가 있으면 메시지를 돌려준다.
    if (!c || typeof c !== 'object' || Array.isArray(c)) return '콘텐츠는 객체여야 한다';
    if (!c.enemies || typeof c.enemies !== 'object' || Array.isArray(c.enemies)) return 'enemies 는 객체여야 한다';
    if (!Array.isArray(c.spawns) || !Array.isArray(c.rooms)) return 'spawns·rooms 는 배열이어야 한다';
    for (const k of ['gear', 'craftOptions', 'portraits', 'npcs']) {
      if (c[k] && (typeof c[k] !== 'object' || Array.isArray(c[k]))) return k + ' 는 객체여야 한다';
      for (const id of Object.keys(c[k] || {})) if (!/^[a-z][a-z0-9_.]*$/.test(id)) return k + ' id 는 영문 소문자·숫자·_ 만 쓴다: ' + id;
    }
    if (c.events && !Array.isArray(c.events)) return 'events 는 배열이어야 한다';
    for (const e of c.events || []) if (!e || !/^[a-z][a-z0-9_]*$/.test(e.id || '')) return '이벤트 id 는 영문 소문자·숫자·_ 만 쓴다';
    for (const p of Object.values(c.portraits || {}))
      if (p.src && !/^assets\/portraits\/[a-z0-9_]+\.(png|jpg|webp)$/.test(p.src)) return '초상화 경로는 assets/portraits/ 아래여야 한다';
    const num = v => typeof v === 'number' && Number.isFinite(v);
    for (const [i, sp] of c.spawns.entries())
      if (
        !sp ||
        typeof sp.region !== 'string' ||
        typeof sp.room !== 'string' ||
        !Array.isArray(sp.group) ||
        !sp.group.length ||
        sp.group.some(k => typeof k !== 'string')
      )
        return '등장 조합 ' + (i + 1) + ': region·room·group(적 id 목록)이 필요하다';
    for (const [k, d] of Object.entries(c.enemies)) {
      if (!d || typeof d !== 'object' || typeof d.name !== 'string' || typeof d.asset !== 'string' || typeof d.ai !== 'string')
        return '적 ' + k + ': name·asset·ai 가 필요하다';
      for (const f of ['hp', 'dmg', 'speed', 'detect', 'size']) if (!num(d[f]) || d[f] < 0) return '적 ' + k + ': ' + f + ' 는 0 이상의 수';
      if (!Array.isArray(d.gold) || d.gold.length !== 2 || !d.gold.every(num)) return '적 ' + k + ': gold 는 [최소, 최대]';
      if (!Array.isArray(d.loot)) return '적 ' + k + ': loot 는 배열';
    }
    for (const [k, x] of Object.entries(c.gear || {})) {
      if (!x || typeof x.name !== 'string') return '장비 ' + k + ': name 이 필요하다';
      for (const [m, n] of Object.entries(x.cost || {})) if (!num(n) || n < 1) return '장비 ' + k + ': 비용 ' + m + ' 는 1 이상';
      if (x.weapon && typeof x.weapon.dice !== 'string') return '장비 ' + k + ': 무기 주사위가 필요하다';
    }
    for (const [k, o] of Object.entries(c.craftOptions || {})) {
      if (!o || typeof o.name !== 'string' || !Array.isArray(o.slots)) return '제작 옵션 ' + k + ': name·slots 가 필요하다';
      for (const n of Object.values(o.cost || {})) if (!num(n) || n < 1) return '제작 옵션 ' + k + ': 비용은 1 이상';
    }
    for (const e of c.events || []) {
      if (!e.trigger || typeof e.trigger.type !== 'string' || !Array.isArray(e.pages))
        return '이벤트 ' + e.id + ': trigger·pages 가 필요하다';
      for (const ch of e.choices || []) {
        const r = ch.require || {};
        if (r.gold !== undefined && (!num(r.gold) || r.gold < 0)) return '이벤트 ' + e.id + ': 조건 금화는 0 이상';
        for (const n of Object.values(r.mat || {})) if (!num(n) || n < 1) return '이벤트 ' + e.id + ': 조건 재료는 1 이상';
        for (const fx of ch.effects || []) if ('n' in fx && !num(fx.n)) return '이벤트 ' + e.id + ': 효과 수치가 숫자가 아니다';
      }
    }
    for (const [k, n] of Object.entries(c.npcs || {}))
      if (!n || typeof n.name !== 'string' || !num(n.x) || !num(n.y) || !Array.isArray(n.greet))
        return '주민 ' + k + ': name·x·y·greet 가 필요하다';
    for (const k of Object.keys(c.enemies)) if (!/^[a-z][a-z0-9_]*$/.test(k)) return '적 id 는 영문 소문자·숫자·_ 만 쓴다: ' + k;
    for (const r of c.rooms) if (!r || !/^[a-z][a-z0-9_]*$/.test(r.id || '')) return '방 id 는 영문 소문자·숫자·_ 만 쓴다';
    return null;
  }
  function text(c) {
    const L = [];
    L.push('/* 도구(editor.html)가 관리하는 콘텐츠: 추가 적·등장 조합·수제 방. 아래 객체는 JSON 그대로라 손으로 고쳐도 된다.');
    L.push('   data.js 가 이 표를 기본 표에 합친다(같은 id 는 덮어쓴다). 도구에서 저장하면 이 파일 전체를 다시 쓴다. */');
    L.push('(function (g) {', "  'use strict';", '  const ER = g.ER = g.ER || {};', '  ER.CONTENT = {');
    const ids = Object.keys(c.enemies);
    L.push('  "enemies": {' + (ids.length ? '' : '},'));
    ids.forEach((k, i) => L.push('    ' + JSON.stringify(k) + ': ' + spaced(c.enemies[k]) + (i < ids.length - 1 ? ',' : '')));
    if (ids.length) L.push('  },');
    L.push('  "spawns": [' + (c.spawns.length ? '' : '],'));
    c.spawns.forEach((s, i) => L.push('    ' + spaced(s) + (i < c.spawns.length - 1 ? ',' : '')));
    if (c.spawns.length) L.push('  ],');
    const dict = key => {
      const o = c[key] || {},
        ks = Object.keys(o);
      L.push('  ' + JSON.stringify(key) + ': {' + (ks.length ? '' : '},'));
      ks.forEach((k, i) => L.push('    ' + JSON.stringify(k) + ': ' + spaced(o[k]) + (i < ks.length - 1 ? ',' : '')));
      if (ks.length) L.push('  },');
    };
    dict('gear');
    dict('craftOptions');
    dict('portraits');
    dict('npcs');
    L.push('  "tuning": ' + spaced(c.tuning || {}) + ',');
    {
      const ev = c.events || [];
      L.push('  "events": [' + (ev.length ? '' : '],'));
      ev.forEach((e, i) =>
        L.push(
          JSON.stringify(e, null, 2)
            .split(String.fromCharCode(10))
            .map(x => '    ' + x)
            .join(String.fromCharCode(10)) + (i < ev.length - 1 ? ',' : '')
        )
      );
      if (ev.length) L.push('  ],');
    }
    L.push('  "rooms": [' + (c.rooms.length ? '' : ']'));
    c.rooms.forEach((r, i) => {
      const { tiles, ...rest } = r;
      L.push('    { "tiles": [');
      tiles.forEach((row, j) => L.push('        ' + JSON.stringify(row) + (j < tiles.length - 1 ? ',' : '')));
      L.push('      ], ' + spaced(rest).slice(2, -2) + ' }' + (i < c.rooms.length - 1 ? ',' : ''));
    });
    if (c.rooms.length) L.push('  ]');
    L.push(
      '};',
      "  if (typeof module === 'object') module.exports = ER;",
      "})(typeof globalThis !== 'undefined' ? globalThis : this);",
      ''
    );
    return L.join(String.fromCharCode(10));
  }
  ER.contentfmt = { text, check };
  if (typeof module === 'object') module.exports = ER;
})(typeof globalThis !== 'undefined' ? globalThis : this);
