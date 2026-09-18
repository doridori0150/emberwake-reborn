/* 캠페인 봇: 새 게임에서 3지역 수호자까지 "원정 → 정산 → 투자 → 가게 → 다음 원정" 전체 루프를 자동으로 돈다.
   목적은 재미가 아니라 진행이 막히는 곳(소프트락·경제 병목·예외)을 찾는 것이다.
   사용법: node tools/campaign.cjs [횟수=3] [최대 원정=60] [verbose] */
'use strict';
require('../src/guild.js');
require('../src/save.js');
const { bot } = require('./sim.cjs');
const ER = globalThis.ER,
  G = ER.guild,
  D = ER.data,
  RUN = ER.run;

function pickRegion(g) {
  // 열린 지역 중 가장 깊은 곳. 그 지역 수호자를 잡았으면 다음 지역이 열린다.
  const open = G.ORDER.filter(r => g.regions[r].unlocked);
  return open[open.length - 1];
}
function pickHero(g) {
  // 대원을 돌아가며 쓴다(지역 소진처럼 편중을 막는다)
  return g.roster[g.runSeq % g.roster.length];
}
function invest(g, log) {
  // 고정 목표 → 시설 → 장비/옵션 → 연구 → 훈련 → 의뢰 순으로, 살 수 있는 것을 전부 산다.
  let bought = 0;
  for (let round = 0; round < 12; round++) {
    const list = G.allTargets(g).filter(t => t.can);
    if (!list.length) break;
    const order = { facility: 0, gear: 1, option: 2, research: 3, train: 4, quest: 5 },
      pick = list.sort(
        (a, b) => (G.sameTarget(g.pinned, b.t) ? 1 : 0) - (G.sameTarget(g.pinned, a.t) ? 1 : 0) || order[a.t.kind] - order[b.t.kind]
      )[0];
    const choice = pick.t.kind === 'train' ? D.HEROES[pick.t.hero].perks[g.heroes[pick.t.hero].perks.length][0].id : undefined;
    const r = G.invest(g, pick.t, choice);
    if (!r.ok) break;
    bought++;
    log('  투자: ' + r.name);
    if (pick.t.kind === 'research' && !g.heroes[g.selected.hero].deck.includes(pick.t.id)) {
      // 연구한 카드는 덱에 넣어 본다(가장 흔한 카드 하나를 뺀다)
      const h = g.selected.hero,
        deck = g.heroes[h].deck;
      if (G.deckAdd(g, h, pick.t.id).ok === false && deck.length >= D.RULES.deckSize) {
        G.deckRemove(g, h, deck.indexOf('strike') >= 0 ? deck.indexOf('strike') : 0);
        G.deckAdd(g, h, pick.t.id);
      }
    }
    if (pick.t.kind === 'gear') {
      const h = g.selected.hero;
      if (!D.GEAR[pick.t.id].heroes?.length || D.GEAR[pick.t.id].heroes.includes(h)) G.equip(g, h, pick.t.id);
    }
  }
  return bought;
}
function shop(g, log) {
  if (g.facilities.stash < 1 || g.shop.done) return;
  const mats = Object.keys(g.stock)
    .filter(k => g.stock[k] >= 4)
    .sort((a, b) => D.MATERIALS[b].value - D.MATERIALS[a].value)
    .slice(0, G.shopSlots(g));
  if (!mats.length) return;
  const shelves = mats.map(m => ({ mat: m, qty: Math.min(3, g.stock[m] - 2), price: g.shop.notes[m]?.happy || D.MATERIALS[m].value }));
  const r = G.shopDay(g, shelves);
  if (r.ok)
    log(
      '  가게: +' +
        r.gold +
        '금 (' +
        Object.entries(r.sold)
          .map(([m, n]) => D.MATERIALS[m].name + n)
          .join(', ') +
        ')'
    );
}
function campaign(seed, maxRuns, verbose) {
  const state = { meta: { created: 'camp-' + seed }, guild: G.newGame(), run: null },
    g = state.guild,
    log = m => verbose && console.log(m),
    events = [];
  for (let i = 0; i < maxRuns; i++) {
    const region = pickRegion(g);
    if (G.wearOf(g, region) >= 3 && G.ORDER.indexOf(region) > 0) g.selected.region = G.ORDER[G.ORDER.indexOf(region) - 1]; // 소진됐으면 한 단계 얕은 지역에서 회복을 기다린다
    if (!(G.wearOf(g, region) >= 3 && G.ORDER.indexOf(region) > 0)) g.selected.region = region;
    g.selected.hero = pickHero(g);
    // 수호자 도전은 준비가 됐을 때만(장비 2개 이상·훈련 1회 이상), 아니면 그 지역에서 재료를 모은다. 도전은 두 번에 한 번.
    const ready = g.gearOwned.length >= 2 && g.heroes[g.selected.hero].perks.length >= 1,
      goal = ready && g.runSeq % 2 === 0 ? 'boss' : 'loot';
    const r = G.startRun(state);
    if (!r.ok) {
      events.push('원정 시작 실패: ' + r.reason);
      break;
    }
    try {
      bot(state.run, goal, false, { smart: true });
    } catch (e) {
      events.push('원정 ' + (i + 1) + ' 예외: ' + e.message);
      break;
    }
    const run = state.run,
      rep = G.settle(state);
    log(
      '원정 ' +
        (i + 1) +
        ' ' +
        D.REGIONS[region].name +
        ' ' +
        D.HEROES[run.heroId].name +
        ' ' +
        goal +
        ' → ' +
        run.status +
        (rep.objective ? ' (목표 회수)' : '') +
        ' 시간 ' +
        run.time +
        '/' +
        run.limit +
        ' 금화 ' +
        g.gold
    );
    if (rep.unlocked.length) events.push('원정 ' + (i + 1) + ': ' + rep.unlocked.join(', ') + ' 개방');
    for (let guard = 0; g.pendingEvent && guard < 20; guard++) {
      let k = 0;
      while (k < 8 && !G.answer(g, k).ok) k++;
    }
    invest(g, log);
    shop(g, log);
    ER.save.unpack(ER.save.pack(state)); // 저장 왕복이 깨지지 않는지
    if (g.regions.archive.boss) {
      events.push('원정 ' + (i + 1) + '에 별의 서고 수호자 격파 — 캠페인 완주');
      break;
    }
  }
  return {
    runs: g.stats.runs,
    defeats: g.stats.defeats,
    facilities: g.facilities,
    gear: g.gearOwned.length,
    cards: g.cards.length,
    regions: Object.fromEntries(G.ORDER.map(r => [r, g.regions[r]])),
    day: g.day,
    gold: g.gold,
    events
  };
}

if (require.main === module) {
  const [n = '3', maxRuns = '60', verbose] = process.argv.slice(2);
  for (let i = 0; i < +n; i++) {
    const out = campaign(i, +maxRuns, verbose === 'verbose');
    console.log(
      '캠페인 ' +
        i +
        ': 원정 ' +
        out.runs +
        '회(패배 ' +
        out.defeats +
        ') · ' +
        out.day +
        '일 · 시설 ' +
        JSON.stringify(out.facilities) +
        ' · 장비 ' +
        out.gear +
        ' · 카드 ' +
        out.cards +
        ' · 지역 ' +
        G.ORDER.map(r => r + (out.regions[r].boss ? '✓' : out.regions[r].unlocked ? '○' : '✗')).join(' ')
    );
    for (const e of out.events) console.log('  - ' + e);
  }
}
module.exports = { campaign };
