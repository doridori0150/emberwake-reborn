/* 길드 경제·성장·진행. 원정 엔진과 마찬가지로 순수 상태 전이만 담당한다.
   투자 대상(target)은 {kind:'facility'|'gear'|'research'|'upgrade'|'train'|'quest', id, ...} 하나의 형태로 다뤄
   '목표 고정 → 필요한 재료·발견 지역 → 귀환 후 가능해진 투자'를 같은 코드로 보여준다. */
(function (g) {
  'use strict';
  const ER = g.ER = g.ER || {};
  if (typeof require === 'function' && !ER.run) require('./run.js');
  const { RULES, MATERIALS, CARDS, RESEARCH, HEROES, TRAINING, REGIONS, FACILITIES, GEAR, QUESTS } = ER.data;
  const ORDER = ['verdant', 'foundry', 'archive'];

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
    else if (t.kind === 'gear') { const x = GEAR[t.id]; name = x.name + ' 제작'; cost = x.cost || {}; effect = x.text; done = G.gearOwned.includes(t.id); if (!x.cost) locked = '의뢰 보상'; else if (G.facilities.workshop < x.tier) locked = '제작 공방 ' + x.tier + '단계 필요'; }
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
    for (const c of Object.values(CARDS)) if (RESEARCH[c.source]?.mats) out.push({ kind: 'research', id: c.id });
    for (const h of G.roster) out.push({ kind: 'train', hero: h });
    for (const [id, q] of Object.entries(QUESTS)) if (questVisible(G, id) && !q.auto) out.push({ kind: 'quest', id });
    return out.map(t => target(G, t)).filter(x => !x.done);
  }
  function questVisible(G, id) { const q = QUESTS[id]; if (q.hideIfUnlocked && G.regions[q.hideIfUnlocked].unlocked && !G.quests[id]) return false; if (q.region && !G.regions[q.region].unlocked) return false; return true; }
  const sameTarget = (a, b) => a && b && a.kind === b.kind && a.id === b.id && a.hero === b.hero;

  function invest(G, t, choice) { // 모든 구매·복구·연구·훈련·납품의 단일 입구
    const info = target(G, t); if (info.done) return { ok: false, reason: '이미 완료' }; if (info.locked) return { ok: false, reason: info.locked }; if (!info.can) return { ok: false, reason: '재료 부족: ' + Object.entries(info.missing).map(([k, n]) => (k === 'gold' ? '금화' : MATERIALS[k].name) + ' ' + n).join(', ') };
    let note = info.effect;
    if (t.kind === 'train') { const tier = G.heroes[t.hero].perks.length, p = HEROES[t.hero].perks[tier].find(x => x.id === choice); if (!p) return { ok: false, reason: '특성을 고르세요' }; pay(G, info.cost); G.heroes[t.hero].perks.push(p.id); note = p.name + ': ' + p.text; }
    else {
      pay(G, info.cost);
      if (t.kind === 'facility') { G.facilities[t.id]++; if (t.id === 'observatory' && G.facilities.observatory === 1 && !G.roster.includes('lumi')) { G.roster.push('lumi'); note += ' 루미가 연구실 문을 두드렸다.'; } }
      else if (t.kind === 'gear') G.gearOwned.push(t.id);
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
  function equip(G, heroId, id) { const h = G.heroes[heroId], i = h.gear.indexOf(id); if (i >= 0) { h.gear.splice(i, 1); return { ok: true }; } if (!G.gearOwned.includes(id)) return { ok: false, reason: '없는 장비' }; if (h.gear.length >= gearSlots(G)) return { ok: false, reason: '장비 칸이 가득 찼다(' + gearSlots(G) + '칸)' }; h.gear.push(id); return { ok: true }; }

  function mods(G) { const f = G.facilities; return { bagSlots: f.stash, bandages: Math.min(2, f.barracks), hpBonus: f.barracks >= 3 ? 4 : 0, limitBonus: (f.observatory >= 2 ? 8 : 0) + (f.observatory >= 3 ? 8 : 0), mapIntel: f.observatory >= 1, knowSanctum: f.observatory >= 3, saveFirstSlot: f.stash >= 2 }; }
  function startRun(state, seed) {
    const G = state.guild, heroId = G.selected.hero, regionId = G.selected.region; if (state.run) return { ok: false, reason: '진행 중인 원정이 있다' };
    if (!G.roster.includes(heroId)) return { ok: false, reason: '출격할 수 없는 대원' }; if (!G.regions[regionId]?.unlocked) return { ok: false, reason: '아직 열리지 않은 지역' };
    const issues = deckIssues(G, heroId, G.heroes[heroId].deck); if (issues.length) return { ok: false, reason: issues[0] };
    G.runSeq++; G.lastReport = null;
    state.run = ER.run.create({ regionId, heroId, deck: G.heroes[heroId].deck, gear: G.heroes[heroId].gear.filter(x => G.gearOwned.includes(x)), perks: G.heroes[heroId].perks, upgrades: G.upgrades, mods: mods(G), known: G.cards.slice(), seed: seed || (state.meta?.created || 'ER') + '-' + G.runSeq, pinned: G.pinned });
    return { ok: true };
  }

  // 정산: 원정 ID당 한 번만. 귀환해야 창고에 들어간다.
  function settle(state) {
    const G = state.guild, run = state.run; if (!run || run.status === 'active') return null;
    if (G.settled.includes(run.id)) { state.run = null; return G.lastReport; }
    const before = allTargets(G).filter(x => x.can).map(x => x.name);
    const rep = { id: run.id, outcome: run.status, region: REGIONS[run.regionId].name, hero: HEROES[run.heroId].name, gained: {}, lost: {}, gold: 0, unlocked: [], quests: [], time: run.time, limit: run.limit, kills: run.stats.kills, tried: (run.temp || []).filter(id => !G.cards.includes(id)), objective: false, newly: [], pinned: null };
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
    G.lastReport = rep; state.run = null; return rep;
  }

  ER.guild = { ORDER, newGame, have, affordable, target, allTargets, invest, sell, deckIssues, deckAdd, deckRemove, equip, gearSlots, mods, startRun, settle, facilityVisible, questVisible, sameTarget, sources };
  if (typeof module === 'object') module.exports = ER;
})(typeof globalThis !== 'undefined' ? globalThis : this);
