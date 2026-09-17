/* 이벤트(대화) 규칙의 공용 부분: 언제 뜨는가(트리거·조건), 선택지를 고를 수 있는가, 효과를 어떻게 적는가.
   이벤트 데이터는 content.js 의 events 이고 도구(editor.html)에서 편집한다.
   { id, name, trigger:{ type, region?, roomType?, room?, hero?, facility?, level?, outcome?, flag?, notFlag?, chance?, repeat? },
     pages:[{ speaker, portrait, side:'left'|'right', text }], choices:[{ label, require?, effects?, reply?, next? }] }
   효과 적용은 원정 중이면 run.js, 길드에서면 guild.js 가 한다(저장·재현을 위해 화면 코드가 아니라 규칙 쪽에 둔다). */
(function (g) {
  'use strict';
  const ER = (g.ER = g.ER || {});
  if (typeof require === 'function' && !ER.data) require('./data.js');
  const D = ER.data;
  const TRIGGERS = {
    runStart: { name: '원정 시작', where: 'run', filters: ['region', 'hero'] },
    roomEnter: { name: '방에 처음 들어섬', where: 'run', filters: ['region', 'roomType', 'room', 'hero'] },
    bossKill: { name: '수호자 처치', where: 'run', filters: ['region', 'hero'] },
    returnGuild: { name: '길드로 돌아옴', where: 'guild', filters: ['region', 'outcome'] },
    facility: { name: '시설 복구 완료', where: 'guild', filters: ['facility', 'level'] },
    guildVisit: { name: '길드 화면에 들어옴', where: 'guild', filters: [] },
    npcTalk: { name: '주민에게 말을 걺', where: 'guild', filters: ['npc'] }
  };
  const EFFECTS = {
    gold: { name: '금화', where: 'both', fields: ['n'] },
    mat: { name: '재료', where: 'both', fields: ['mat', 'n'] },
    flag: { name: '플래그 켜기', where: 'both', fields: ['flag'] },
    unflag: { name: '플래그 끄기', where: 'both', fields: ['flag'] },
    hp: { name: '체력', where: 'run', fields: ['n'] },
    time: { name: '시간 경과', where: 'run', fields: ['n'] },
    gauge: { name: '투지', where: 'run', fields: ['n'] },
    bandage: { name: '붕대', where: 'run', fields: ['n'] },
    card: { name: '발견 카드 3택', where: 'run', fields: [] }
  };
  const matName = m => D.MATERIALS[m]?.name || m,
    sign = n => (n > 0 ? '+' : '') + n;
  function effectText(list) {
    return (list || [])
      .map(e =>
        e.type === 'gold'
          ? '금화 ' + sign(e.n)
          : e.type === 'mat'
            ? matName(e.mat) + ' ' + sign(e.n)
            : e.type === 'hp'
              ? '체력 ' + sign(e.n)
              : e.type === 'time'
                ? '시간 ' + sign(e.n)
                : e.type === 'gauge'
                  ? '투지 ' + sign(e.n)
                  : e.type === 'bandage'
                    ? '붕대 ' + sign(e.n)
                    : e.type === 'card'
                      ? '발견 카드'
                      : ''
      )
      .filter(Boolean)
      .join(' · ');
  }
  function requireText(req) {
    if (!req) return '';
    const out = [];
    if (req.gold) out.push('금화 ' + req.gold);
    for (const [m, n] of Object.entries(req.mat || {})) out.push(matName(m) + ' ' + n);
    if (req.hero) out.push(D.HEROES[req.hero]?.name || req.hero);
    return out.join(', ');
  }
  // have: { gold, mat(id)→수량, flags, hero }
  function requireOk(req, have) {
    if (!req) return true;
    if (req.gold < 0 || Object.values(req.mat || {}).some(n => !(n >= 1))) return false;
    if (req.gold && have.gold < req.gold) return false;
    for (const [m, n] of Object.entries(req.mat || {})) if (have.mat(m) < n) return false;
    if (req.hero && req.hero !== have.hero) return false;
    if (req.flag && !have.flags[req.flag]) return false;
    if (req.notFlag && have.flags[req.notFlag]) return false;
    return true;
  }
  function matches(ev, type, ctx, flags, seen) {
    const t = ev.trigger || {};
    if (ev.disabled || t.type !== type) return false;
    if (!t.repeat && seen.includes(ev.id)) return false;
    for (const k of ['region', 'roomType', 'room', 'hero', 'facility', 'outcome', 'npc']) if (t[k] && t[k] !== ctx[k]) return false;
    if (t.level && +t.level !== +ctx.level) return false;
    if (t.flag && !flags[t.flag]) return false;
    if (t.notFlag && flags[t.notFlag]) return false;
    return true;
  }
  // 조건에 맞는 첫 이벤트. chance(%)가 있으면 roll()(0~1)로 거른다.
  function pick(type, ctx, flags, seen, roll) {
    for (const ev of D.EVENTS)
      if (matches(ev, type, ctx, flags || {}, seen || [])) {
        if (ev.trigger.chance && ev.trigger.chance < 100 && roll() * 100 >= ev.trigger.chance) continue;
        return ev;
      }
    return null;
  }
  const get = id => D.EVENTS.find(e => e.id === id) || null;
  /* 선택지 하나를 처리하는 공용 절차: 고를 수 있는가 → 비용 지불 → 효과 적용 → 다음 이벤트.
     어디서 돈·재료를 빼고 효과를 어떻게 넣는지는 부르는 쪽(hooks)이 안다: 원정은 가방, 길드는 창고.
     hooks: { pay(require), effect(fx, event) }. 선택지가 없는 이벤트는 그냥 닫힌다. */
  function choose(e, index, have, hooks) {
    if (!e || !(e.choices || []).length) return { ok: true, choice: null, next: null, note: '' };
    const c = e.choices[index];
    if (!c) return { ok: false, reason: '선택지를 고르세요' };
    if (!requireOk(c.require, have)) return { ok: false, reason: '조건이 모자란다' };
    hooks.pay(c.require || {});
    for (const fx of c.effects || []) hooks.effect(fx, e);
    return { ok: true, choice: c, next: c.next && get(c.next) ? c.next : null, note: effectText(c.effects) };
  }
  function lint(ev) {
    const out = [],
      t = TRIGGERS[ev.trigger?.type];
    if (!t) out.push('트리거를 고르세요');
    if (!(ev.pages || []).length) out.push('대화가 한 줄도 없다');
    for (const p of ev.pages || []) {
      if (!String(p.text || '').trim()) out.push('빈 대사가 있다');
      if (p.portrait && !D.PORTRAITS[p.portrait]) out.push('없는 초상화: ' + p.portrait);
    }
    (ev.choices || []).forEach((c, i) => {
      if (!String(c.label || '').trim()) out.push('선택지 ' + (i + 1) + ': 글이 없다');
      if (c.require?.gold < 0 || Object.values(c.require?.mat || {}).some(n => !(n >= 1)))
        out.push('선택지 ' + (i + 1) + ': 조건 수치는 음수가 될 수 없다');
      if (c.next && !get(c.next)) out.push('선택지 ' + (i + 1) + ': 이어질 이벤트 ' + c.next + ' 이(가) 없다');
      for (const e of c.effects || []) {
        const m = EFFECTS[e.type];
        if (!m) out.push('선택지 ' + (i + 1) + ': 모르는 효과 ' + e.type);
        else if (t && m.where !== 'both' && m.where !== t.where)
          out.push(
            '선택지 ' + (i + 1) + ': "' + m.name + '" 효과는 ' + (m.where === 'run' ? '원정 중' : '길드') + ' 이벤트에서만 쓸 수 있다'
          );
        if (e.type === 'mat' && !D.MATERIALS[e.mat]) out.push('선택지 ' + (i + 1) + ': 없는 재료');
      }
    });
    return out;
  }
  ER.events = { TRIGGERS, EFFECTS, effectText, requireText, requireOk, matches, pick, get, lint, choose };
  if (typeof module === 'object') module.exports = ER;
})(typeof globalThis !== 'undefined' ? globalThis : this);
