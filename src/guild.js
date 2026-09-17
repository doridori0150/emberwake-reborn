/* 길드 경제·성장·진행. 원정 엔진과 마찬가지로 순수 상태 전이만 담당한다.
   투자 대상(target)은 {kind:'facility'|'gear'|'research'|'upgrade'|'train'|'quest', id, ...} 하나의 형태로 다뤄
   '목표 고정 → 필요한 재료·발견 지역 → 귀환 후 가능해진 투자'를 같은 코드로 보여준다. */
(function (g) {
  'use strict';
  const ER = g.ER = g.ER || {};
  if (typeof require === 'function' && !ER.run) require('./run.js');
  const { RULES, MATERIALS, CARDS, RESEARCH, HEROES, TRAINING, REGIONS, FACILITIES, GEAR, QUESTS } = ER.data;
  const ORDER = ['verdant', 'foundry', 'archive'], D = ER.data;
  if (typeof require === 'function' && !ER.events) require('./events.js');
  // 이전 저장에는 없는 칸을 채운다(제작 옵션·이벤트 기록).
  function ensure(G) { G.gearOpts = G.gearOpts || {}; G.evFlags = G.evFlags || {}; G.evSeen = G.evSeen || []; G.eventQueue = G.eventQueue || []; if (G.pendingEvent === undefined) G.pendingEvent = null; return G; }
  const slotOf = id => GEAR[id]?.slot || 'trinket';

  function newGame() {
    const heroes = {}; for (const h of Object.values(HEROES)) heroes[h.id] = { perks: [], deck: h.deck.slice(), gear: [] };
    return { v: 1, gold: 10, stock: {}, facilities: { workshop: 0, stash: 0, barracks: 0, observatory: 0 }, heroes, roster: ['ara', 'noa'],
      cards: Object.values(CARDS).filter(c => c.source === 'basic' || c.source === 'hero').map(c => c.id), upgrades: {}, gearOwned: [],
      regions: { verdant: { unlocked: true, boss: false, runs: 0 }, foundry: { unlocked: false, boss: false, runs: 0 }, archive: { unlocked: false, boss: false, runs: 0 } },
      quests: {}, relics: [], pinned: { kind: 'facility', id: 'workshop' }, settled: [], stats: { runs: 0, defeats: 0 }, lastReport: null, selected: { hero: 'ara', region: 'verdant' }, runSeq: 0 };
  }

  const have = (G, k) => (k === 'gold' ? G.gold : G.stock[k] || 0);
  const affordable = (G, cost) => Object.entries(cost).every(([k, n]) => have(G, k) >= n);
  function pay(G, cost) { for (const [k, n] of Object.entries(cost)) { if (k === 'gold') G.gold -= n; else { G.stock[k] -= n; if (!G.stock[k]) delete G.stock[k]; } } }
  const facilityVisible = (G, id) => FACILITIES[id].reveal === 0 || Object.values(G.facilities).some(n => n > 0);
  const gearSlots = G => RULES.gearSlots + (G.facilities.workshop >= 3 ? 1 : 0);
  function sources(mat) { return ORDER.filter(r => REGIONS[r].materials.includes(mat)).map(r => REGIONS[r].name); }

  // 투자 대상의 이름·비용·효과·가능 여부를 한 형태로 돌려준다.
  function target(G, t) {
    let name, cost, effect, locked = null, done = false;
    if (t.kind === 'facility') { const f = FACILITIES[t.id], lv = G.facilities[t.id]; done = lv >= f.levels.length; const L = f.levels[Math.min(lv, f.levels.length - 1)]; name = f.name + ' ' + (lv + 1) + '단계' + (lv === 0 ? ' 복구' : ''); cost = L.cost; effect = L.text; if (!facilityVisible(G, t.id)) locked = '다른 시설을 먼저 복구'; }
    else if (t.kind === 'gear') { const x = GEAR[t.id]; name = x.name + ' 제작'; cost = x.cost || {}; effect = '[' + D.GEAR_SLOTS[slotOf(t.id)] + (x.heroes?.length ? ' · ' + x.heroes.map(h => HEROES[h]?.name || h).join('/') + ' 전용' : '') + '] ' + D.gearText(t.id); done = G.gearOwned.includes(t.id); if (!x.cost) locked = '의뢰 보상'; else if (G.facilities.workshop < x.tier) locked = '제작 공방 ' + x.tier + '단계 필요'; }
    else if (t.kind === 'option') { const x = GEAR[t.id], o = D.CRAFT_OPTIONS[t.opt], mine = ensure(G).gearOpts[t.id] || []; name = x.name + ' 옵션: ' + o.name; cost = o.cost || {}; effect = D.effectText(o.effects) + ' (옵션 칸 ' + mine.length + '/' + (x.optionSlots || 1) + ')'; done = mine.includes(t.opt); if (!G.gearOwned.includes(t.id)) locked = '먼저 ' + x.name + ' 제작'; else if (!done && mine.length >= (x.optionSlots || 1)) locked = '옵션 칸이 가득 찼다 — 장비 창에서 옵션을 떼어 내면 다시 붙일 수 있다'; }
    else if (t.kind === 'research') { const c = CARDS[t.id], r = RESEARCH[c.source]; name = '연구: ' + c.name; cost = Object.assign({}, r.cost, r.mats[t.id]); effect = '[' + (c.slot === 'main' ? '주' : '보조') + '] ' + c.text; done = G.cards.includes(t.id); if (G.facilities.observatory < r.need) locked = '관측 연구실 ' + r.need + '단계 필요'; }
    else if (t.kind === 'upgrade') { const c = CARDS[t.id], u = c.upgrades.find(x => x.id === t.branch); name = '강화: ' + c.name + ' — ' + u.name; cost = RESEARCH.upgrade.cost; effect = u.text + ' (한 카드에 한 갈래만)'; done = !!G.upgrades[t.id]; if (G.facilities.observatory < RESEARCH.upgrade.need) locked = '관측 연구실 2단계 필요'; else if (!G.cards.includes(t.id)) locked = '아직 없는 카드'; }
    else if (t.kind === 'train') { const h = HEROES[t.hero], tier = G.heroes[t.hero].perks.length, T = TRAINING[Math.min(tier, TRAINING.length - 1)]; done = tier >= TRAINING.length; name = h.name + ' ' + (tier + 1) + '차 훈련'; cost = T.cost; effect = done ? '' : h.perks[tier].map(p => p.name + ': ' + p.text).join(' / ') + ' 중 하나'; if (!G.roster.includes(t.hero)) locked = '아직 합류하지 않음'; else if (G.facilities.barracks < T.need) locked = '훈련·회복실 ' + T.need + '단계 필요'; }
    else if (t.kind === 'quest') { const q = QUESTS[t.id]; name = '의뢰: ' + q.name; cost = q.need || {}; effect = q.rewardText; done = !!G.quests[t.id]; if (q.auto) locked = '조건 달성 시 자동 완료'; }
    const missing = {}; for (const [k, n] of Object.entries(cost)) if (have(G, k) < n) missing[k] = n - have(G, k);
    return { t, name, cost, effect, locked, done, can: !locked && !done && !Object.keys(missing).length, missing, sources: Object.fromEntries(Object.keys(cost).filter(k => k !== 'gold').map(k => [k, sources(k)])) };
  }
  function allTargets(G) {
    const out = [];
    for (const id of Object.keys(FACILITIES)) if (facilityVisible(G, id)) out.push({ kind: 'facility', id });
    for (const id of Object.keys(GEAR)) if (GEAR[id].cost) out.push({ kind: 'gear', id });
    for (const id of G.gearOwned) for (const opt of GEAR[id]?.options || []) if (D.CRAFT_OPTIONS[opt]) out.push({ kind: 'option', id, opt });
    for (const c of Object.values(CARDS)) if (RESEARCH[c.source]?.mats) out.push({ kind: 'research', id: c.id });
    for (const h of G.roster) out.push({ kind: 'train', hero: h });
    for (const [id, q] of Object.entries(QUESTS)) if (questVisible(G, id) && !q.auto) out.push({ kind: 'quest', id });
    return out.map(t => target(G, t)).filter(x => !x.done);
  }
  function questVisible(G, id) { const q = QUESTS[id]; if (q.hideIfUnlocked && G.regions[q.hideIfUnlocked].unlocked && !G.quests[id]) return false; if (q.region && !G.regions[q.region].unlocked) return false; return true; }
  const sameTarget = (a, b) => a && b && a.kind === b.kind && a.id === b.id && a.hero === b.hero && a.opt === b.opt;

  function invest(G, t, choice) { // 모든 구매·복구·연구·훈련·납품의 단일 입구
    const info = target(G, t); if (info.done) return { ok: false, reason: '이미 완료' }; if (info.locked) return { ok: false, reason: info.locked }; if (!info.can) return { ok: false, reason: '재료 부족: ' + Object.entries(info.missing).map(([k, n]) => (k === 'gold' ? '금화' : MATERIALS[k].name) + ' ' + n).join(', ') };
    let note = info.effect;
    if (t.kind === 'train') { const tier = G.heroes[t.hero].perks.length, p = HEROES[t.hero].perks[tier].find(x => x.id === choice); if (!p) return { ok: false, reason: '특성을 고르세요' }; pay(G, info.cost); G.heroes[t.hero].perks.push(p.id); note = p.name + ': ' + p.text; }
    else {
      pay(G, info.cost);
      if (t.kind === 'facility') { G.facilities[t.id]++; fire(G, 'facility', { facility: t.id, level: G.facilities[t.id] }); if (t.id === 'observatory' && G.facilities.observatory === 1 && !G.roster.includes('lumi')) { G.roster.push('lumi'); note += ' 루미가 연구실 문을 두드렸다.'; } }
      else if (t.kind === 'gear') G.gearOwned.push(t.id);
      else if (t.kind === 'option') { const o = ensure(G).gearOpts; (o[t.id] = o[t.id] || []).push(t.opt); }
      else if (t.kind === 'research') G.cards.push(t.id);
      else if (t.kind === 'upgrade') G.upgrades[t.id] = t.branch;
      else if (t.kind === 'quest') note = completeQuest(G, t.id);
    }
    if (sameTarget(G.pinned, t)) G.pinned = null;
    return { ok: true, note, name: info.name };
  }
  function completeQuest(G, id) { const q = QUESTS[id], r = q.reward; G.quests[id] = true; if (r.gold) G.gold += r.gold; if (r.gear && !G.gearOwned.includes(r.gear)) G.gearOwned.push(r.gear); if (r.scroll) G.stock.scroll = (G.stock.scroll || 0) + r.scroll; if (r.unlock) G.regions[r.unlock].unlocked = true; return q.rewardText; }
  function sell(G, mat, qty) { if (G.facilities.stash < 1) return { ok: false, reason: '회수 창고 1단계 필요' }; if ((G.stock[mat] || 0) < qty || qty < 1) return { ok: false, reason: '수량 부족' }; const gold = Math.floor(MATERIALS[mat].value * qty * (G.facilities.stash >= 3 ? 1.25 : 1)); pay(G, { [mat]: qty }); G.gold += gold; return { ok: true, gold }; }

  // 덱·장비
  function deckIssues(G, heroId, deck) { const out = [], count = {}; if (deck.length !== RULES.deckSize) out.push('덱은 정확히 ' + RULES.deckSize + '장 (' + deck.length + '장)'); for (const id of deck) { count[id] = (count[id] || 0) + 1; const c = CARDS[id]; if (!c || !G.cards.includes(id)) out.push('없는 카드: ' + id); else if (c.hero && c.hero !== heroId) out.push(c.name + ': 다른 대원 전용'); } for (const [id, n] of Object.entries(count)) if (n > RULES.maxCopies) out.push(CARDS[id].name + ': 같은 카드는 ' + RULES.maxCopies + '장까지'); return out; }
  function deckAdd(G, heroId, id) { const d = G.heroes[heroId].deck; if (d.length >= RULES.deckSize) return { ok: false, reason: '덱이 가득 찼다. 먼저 한 장을 빼세요.' }; if (d.filter(x => x === id).length >= RULES.maxCopies) return { ok: false, reason: '같은 카드는 ' + RULES.maxCopies + '장까지' }; const c = CARDS[id]; if (!G.cards.includes(id) || (c.hero && c.hero !== heroId)) return { ok: false, reason: '쓸 수 없는 카드' }; d.push(id); return { ok: true }; }
  function deckRemove(G, heroId, index) { G.heroes[heroId].deck.splice(index, 1); return { ok: true }; }
  function equip(G, heroId, id) { const h = G.heroes[heroId], i = h.gear.indexOf(id); if (i >= 0) { h.gear.splice(i, 1); return { ok: true }; } if (!G.gearOwned.includes(id)) return { ok: false, reason: '없는 장비' }; const x = GEAR[id], slot = slotOf(id); if (x.heroes?.length && !x.heroes.includes(heroId)) return { ok: false, reason: x.heroes.map(q => HEROES[q]?.name || q).join('/') + ' 전용 장비' };
    if (slot === 'trinket') { if (h.gear.filter(q => slotOf(q) === 'trinket').length >= gearSlots(G)) return { ok: false, reason: '장신구 칸이 가득 찼다(' + gearSlots(G) + '칸)' }; }
    else h.gear = h.gear.filter(q => slotOf(q) !== slot); // 무기·가방은 한 칸: 바꿔 낀다
    h.gear.push(id); return { ok: true }; }
  function removeOption(G, id, opt) { const o = ensure(G).gearOpts[id] || [], i = o.indexOf(opt); if (i < 0) return { ok: false, reason: '없는 옵션' }; o.splice(i, 1); return { ok: true }; }
  // ───────── 길드에서 뜨는 이벤트(귀환·시설 복구·방문). 한 번에 하나씩, 나머지는 줄을 선다.
  const evHave = G => ({ gold: G.gold, mat: m => G.stock[m] || 0, flags: G.evFlags, hero: G.selected.hero });
  function fire(G, type, ctx) { ensure(G); const e = ER.events.pick(type, ctx || {}, G.evFlags, G.evSeen.concat(G.eventQueue, G.pendingEvent ? [G.pendingEvent.id] : []), Math.random); if (!e) return null; if (G.pendingEvent) G.eventQueue.push(e.id); else openEvent(G, e.id); return e.id; }
  function openEvent(G, id) { G.pendingEvent = { id }; if (!G.evSeen.includes(id)) G.evSeen.push(id); }
  function answer(G, choice) {
    ensure(G); const pe = G.pendingEvent, e = pe && ER.events.get(pe.id); if (!pe) return { ok: false, reason: '진행 중인 이벤트가 없다' }; let next = null, note = '';
    if (e && (e.choices || []).length) { const c = e.choices[choice]; if (!c) return { ok: false, reason: '선택지를 고르세요' }; if (!ER.events.requireOk(c.require, evHave(G))) return { ok: false, reason: '조건이 모자란다' };
      if (c.require?.gold) G.gold -= c.require.gold; for (const [m, n] of Object.entries(c.require?.mat || {})) G.stock[m] = (G.stock[m] || 0) - n;
      for (const fx of c.effects || []) { if (fx.type === 'gold') G.gold = Math.max(0, G.gold + fx.n); else if (fx.type === 'mat') G.stock[fx.mat] = Math.max(0, (G.stock[fx.mat] || 0) + fx.n); else if (fx.type === 'flag') G.evFlags[fx.flag] = true; else if (fx.type === 'unflag') delete G.evFlags[fx.flag]; }
      note = ER.events.effectText(c.effects); next = c.next && ER.events.get(c.next) ? c.next : null; }
    G.pendingEvent = null; if (next) openEvent(G, next); else if (G.eventQueue.length) openEvent(G, G.eventQueue.shift());
    return { ok: true, note };
  }

  function mods(G) { const f = G.facilities; return { bagSlots: f.stash, bandages: Math.min(2, f.barracks), hpBonus: f.barracks >= 3 ? 4 : 0, limitBonus: (f.observatory >= 2 ? 8 : 0) + (f.observatory >= 3 ? 8 : 0), mapIntel: f.observatory >= 1, knowSanctum: f.observatory >= 3, saveFirstSlot: f.stash >= 2 }; }
  function startRun(state, seed) {
    const G = state.guild, heroId = G.selected.hero, regionId = G.selected.region; if (state.run) return { ok: false, reason: '진행 중인 원정이 있다' };
    if (!G.roster.includes(heroId)) return { ok: false, reason: '출격할 수 없는 대원' }; if (!G.regions[regionId]?.unlocked) return { ok: false, reason: '아직 열리지 않은 지역' };
    const issues = deckIssues(G, heroId, G.heroes[heroId].deck); if (issues.length) return { ok: false, reason: issues[0] };
    G.runSeq++; G.lastReport = null;
    state.run = ER.run.create({ regionId, heroId, deck: G.heroes[heroId].deck, gear: G.heroes[heroId].gear.filter(x => G.gearOwned.includes(x)), perks: G.heroes[heroId].perks, upgrades: G.upgrades, mods: mods(G), gearOpts: JSON.parse(JSON.stringify(ensure(G).gearOpts)), flags: G.evFlags, seen: G.evSeen, known: G.cards.slice(), seed: seed || (state.meta?.created || 'ER') + '-' + G.runSeq, pinned: G.pinned });
    return { ok: true };
  }

  // 정산: 원정 ID당 한 번만. 귀환해야 창고에 들어간다.
  function settle(state) {
    const G = state.guild, run = state.run; if (!run || run.status === 'active') return null;
    if (G.settled.includes(run.id)) { state.run = null; return G.lastReport; }
    const before = allTargets(G).filter(x => x.can).map(x => x.name);
    const rep = { id: run.id, outcome: run.status, region: REGIONS[run.regionId].name, hero: HEROES[run.heroId].name, gained: {}, lost: {}, gold: 0, unlocked: [], quests: [], time: run.time, limit: run.limit, kills: run.stats.kills, tried: (run.temp || []).filter(id => !G.cards.includes(id)), objective: false, newly: [], pinned: null };
    ensure(G); Object.assign(G.evFlags, run.evFlags || {}); for (const k of Object.keys(G.evFlags)) if (run.evFlags && !(k in run.evFlags)) delete G.evFlags[k]; for (const id of run.evSeen || []) if (!G.evSeen.includes(id)) G.evSeen.push(id);
    G.settled.push(run.id); if (G.settled.length > 50) G.settled.shift(); G.stats.runs++; G.regions[run.regionId].runs++;
    const bank = (mat, qty) => { G.stock[mat] = (G.stock[mat] || 0) + qty; rep.gained[mat] = (rep.gained[mat] || 0) + qty; };
    if (run.status === 'extracted') {
      for (const s of run.bag) bank(s.mat, s.qty); G.gold += run.gold; rep.gold = run.gold;
      if (run.flags.objective && !G.relics.includes(run.regionId)) { G.relics.push(run.regionId); rep.objective = true; }
      if (run.flags.bossDead && !G.regions[run.regionId].boss) {
        G.regions[run.regionId].boss = true; const next = ORDER[ORDER.indexOf(run.regionId) + 1];
        if (next && !G.regions[next].unlocked) { G.regions[next].unlocked = true; rep.unlocked.push(REGIONS[next].name); }
      }
      for (const [id, q] of Object.entries(QUESTS)) if (q.auto && !G.quests[id] && q.auto === 'boss:' + run.regionId && G.regions[run.regionId].boss) rep.quests.push({ name: q.name, reward: completeQuest(G, id) });
    } else {
      G.stats.defeats++; run.bag.forEach((s, i) => { if (i === 0 && run.mods.saveFirstSlot) bank(s.mat, s.qty); else rep.lost[s.mat] = (rep.lost[s.mat] || 0) + s.qty; }); rep.lostGold = run.gold;
    }
    rep.newly = allTargets(G).filter(x => x.can && !before.includes(x.name)).map(x => ({ name: x.name, effect: x.effect, t: x.t }));
    if (G.pinned) { const p = target(G, G.pinned); rep.pinned = { name: p.name, can: p.can, missing: p.missing, effect: p.effect, t: p.t }; }
    G.lastReport = rep; state.run = null; fire(G, 'returnGuild', { region: run.regionId, outcome: run.status }); return rep;
  }

  ER.guild = { ensure, slotOf, removeOption, fire, answer, ORDER, newGame, have, affordable, target, allTargets, invest, sell, deckIssues, deckAdd, deckRemove, equip, gearSlots, mods, startRun, settle, facilityVisible, questVisible, sameTarget, sources };
  if (typeof module === 'object') module.exports = ER;
})(typeof globalThis !== 'undefined' ? globalThis : this);
