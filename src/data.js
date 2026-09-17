/* 콘텐츠 데이터: 재료·카드·대원·적·지역·시설·장비·연구·의뢰.
   규칙 코드는 이 표를 해석만 한다. 수치를 바꿀 때는 tests/ 의 균형 검사도 함께 확인한다. */
(function (g) {
  'use strict';
  const ER = g.ER = g.ER || {};
  if (typeof require === 'function' && !ER.CONTENT) require('./content.js');

  const RULES = {
    appId: 'emberwake-reborn', version: '0.1.0', saveVersion: 1,
    roomW: 13, roomH: 9,
    move: 4, deckSize: 12, maxCopies: 2, startHand: 5, drawPerTurn: 2, handMax: 7,
    bagSlots: 6, gearSlots: 2,
    level: { guardRadius: 3, patrolDoorDist: 3, hazardMax: 3, handmade: 0.4 }, // 방 구성: 경비 반경, 순찰로와 문 사이 거리, 방당 경비 옆 위험 지형 수, 수제 방이 있을 때 쓰는 확률
    guardBlock: 3, ambushBonus: 2,
    crit: { base: 10, exposed: 20, noaMoved: 10 }, // 치명타 확률(%)·피해 +50%. 영웅의 직접 공격에만 적용, 적은 치명타가 없다
    gauge: { max: 5, cost: 3 }, // 투지: 전투 중 내 턴 시작 +1, 처치 +1, 치명타 +1, 대원별 조건 +1
    maxAttacksPerPhase: 2, maxRangedPerPhase: 1, // 급사 방지: 한 적 턴에 영웅을 실제로 때릴 수 있는 횟수
    time: { door: 2, gather: 1, chest: 1, chestSafe: 3, device: 1, rest: 4, card: 1, round: 1, reshuffle: 1, pile: 0 },
    phases: [ // 붉은달 단계: 남은 시간 비율 기준
      { id: 'calm', name: '고요', from: 0, vision: 5, text: '미궁이 잠잠하다.' },
      { id: 'stir', name: '술렁임', from: 0.5, vision: 4, text: '적의 감지 거리 +1. 아직 가지 않은 방에 적이 늘어난다.' },
      { id: 'red', name: '붉은달', from: 0.8, vision: 3, text: '시야 감소, 적 피해 +1. 달빛 결정이 돋아난다.' },
      { id: 'hunt', name: '추적', from: 1, vision: 3, text: '붉은달 추적자가 쫓아온다. 귀환문은 여전히 열려 있다.' }
    ],
    chaseDepth: 2
  };

  const MATERIALS = {
    wood: { name: '고목재', stack: 5, value: 2, tier: '기초', use: '시설 복구·도구' },
    ore: { name: '미궁 철광', stack: 5, value: 3, tier: '기초', use: '시설 복구·장비' },
    herb: { name: '약초', stack: 5, value: 2, tier: '기초', use: '훈련·회복실' },
    flax: { name: '섬유', stack: 5, value: 2, tier: '기초', use: '외투·배낭' },
    resin: { name: '호박 수지', stack: 4, value: 5, tier: '회랑 특산', use: '연구·정밀 도구' },
    hide: { name: '가죽', stack: 4, value: 4, tier: '전리품', use: '장비·창고 확장' },
    coal: { name: '열탄', stack: 4, value: 6, tier: '용광로 특산', use: '2단계 시설·장비' },
    crystal: { name: '균열 수정', stack: 3, value: 10, tier: '서고 특산', use: '3단계 시설·연구' },
    essence: { name: '별빛 정수', stack: 3, value: 12, tier: '서고 특산', use: '상급 훈련·연구' },
    relic: { name: '고대 부품', stack: 2, value: 16, tier: '희귀', use: '상급 시설·판매' },
    scroll: { name: '고문서', stack: 2, value: 14, tier: '희귀', use: '카드 연구·관측실' },
    moonshard: { name: '달빛 결정', stack: 3, value: 20, tier: '붉은달 한정', use: '판매용 고가 전리품' }
  };

  const C = (id, name, slot, type, range, target, text, extra) => Object.assign({ id, name, slot, type, range, target, text, source: 'basic', art: 'cardart.finisher' }, extra);
  const CARDS = {};
  [
    // ── 공용 기초
    C('strike', '정밀 타격', 'main', 'attack', 1, 'enemy', '인접한 적에게 피해 6.', { dmg: 6, art: 'cardart.finisher',
      upgrades: [{ id: 'a', name: '묵직하게', text: '피해 8.', patch: { dmg: 8 } }, { id: 'b', name: '길게', text: '사거리 2(직선 시야).', patch: { range: 2 } }] }),
    C('guard_up', '방패 올리기', 'bonus', 'defense', 0, 'self', '방어 3을 얻는다(다음 내 턴까지).', { block: 3, art: 'cardart.ward',
      upgrades: [{ id: 'a', name: '단단히', text: '방어 5.', patch: { block: 5 } }, { id: 'b', name: '숨 돌리기', text: '방어 3, 카드 1장 뽑기.', patch: { draw: 1 } }] }),
    C('dash', '질주', 'bonus', 'move', 0, 'self', '이번 턴 이동 +2.', { move: 2, art: 'cardart.shadowstep' }),
    C('focus', '집중', 'bonus', 'special', 0, 'self', '다음 공격 피해 +2. 중첩되지 않는다.', { focus: 2, art: 'cardart.expose' }),
    C('regroup', '재정비', 'bonus', 'special', 0, 'self', '카드 2장을 뽑는다.', { draw: 2, art: 'cardart.recycle' }),
    C('mend', '응급 봉합', 'main', 'special', 0, 'self', '체력 5 회복. 소진(이번 원정에서 다시 뽑히지 않음).', { heal: 5, exhaust: true, art: 'cardart.heal' }),
    C('harvest', '정밀 채집', 'bonus', 'explore', 0, 'self', '다음 채집 수량 +2.', { special: 'harvest', art: 'cardart.harvest' }),
    C('shove', '밀어치기', 'main', 'attack', 1, 'enemy', '피해 2, 2칸 밀침. 벽·기둥·다른 적에 부딪히면 피해 +3, 위험 지형에 빠지면 지형 피해.', { dmg: 2, push: 2, art: 'cardart.breach',
      upgrades: [{ id: 'a', name: '멀리', text: '3칸 밀침.', patch: { push: 3 } }, { id: 'b', name: '강하게', text: '피해 4.', patch: { dmg: 4 } }] }),
    C('spark', '불꽃 탄환', 'main', 'attack', 4, 'enemy', '시야 내 적에게 피해 3, 화상 1.', { dmg: 3, burn: 1, art: 'cardart.fire' }),
    // ── 아라: 방어/반격
    C('riposte', '반격 태세', 'main', 'defense', 0, 'self', '방어 4. 다음 내 턴까지 근접 공격을 받을 때마다 피해 4로 반격.', { block: 4, retaliate: 4, hero: 'ara', source: 'hero', art: 'cardart.shieldLance',
      upgrades: [{ id: 'a', name: '날카롭게', text: '반격 피해 6.', patch: { retaliate: 6 } }, { id: 'b', name: '버티며', text: '방어 6.', patch: { block: 6 } }] }),
    C('bulwark', '철벽', 'main', 'defense', 0, 'self', '방어 8.', { block: 8, hero: 'ara', source: 'hero', art: 'cardart.bastion' }),
    C('shield_bash', '방패 강타', 'main', 'attack', 1, 'enemy', '피해 2 + 현재 방어(최대 8). 방어는 유지된다.', { dmg: 2, special: 'shield_bash', hero: 'ara', source: 'hero', art: 'cardart.bastion' }),
    C('taunt', '도발', 'bonus', 'special', 0, 'self', '4칸 안의 적을 1칸 끌어당기고 조준을 풀게 한다. 방어 2.', { special: 'taunt', block: 2, hero: 'ara', source: 'hero', art: 'cardart.lure' }),
    // ── 노아: 이동/밀치기/지형
    C('hook', '회수 갈고리', 'main', 'attack', 4, 'enemy', '같은 가로·세로선의 적에게 피해 1, 2칸 끌어온다. 위험 지형 위를 지나면 지형 피해.', { dmg: 1, pull: 2, line: true, hero: 'noa', source: 'hero', art: 'cardart.gravity' }),
    C('vault', '도약', 'bonus', 'move', 3, 'tile', '3칸 안의 빈 칸으로 뛰어넘는다. 적·기둥·위험 지형을 넘을 수 있다.', { special: 'vault', hero: 'noa', source: 'hero', art: 'cardart.jump' }),
    C('backstab', '뒤잡기', 'main', 'attack', 1, 'enemy', '피해 3. 이번 턴 3칸 이상 움직였다면 피해 +3.', { dmg: 3, special: 'backstab', hero: 'noa', source: 'hero', art: 'cardart.bladeDance',
      upgrades: [{ id: 'a', name: '급소', text: '조건 충족 시 +5.', patch: { bonusDmg: 5 } }, { id: 'b', name: '가볍게', text: '사용 후 이동 +2.', patch: { move: 2 } }] }),
    // ── 루미: 상태이상/연쇄
    C('ignite', '점화', 'main', 'attack', 4, 'enemy', '피해 2, 화상 2.', { dmg: 2, burn: 2, hero: 'lumi', source: 'hero', art: 'cardart.fire',
      upgrades: [{ id: 'a', name: '번지는 불', text: '대상 주변 1칸의 적에게도 화상 1.', patch: { splashBurn: 1 } }, { id: 'b', name: '센 불', text: '화상 3.', patch: { burn: 3 } }] }),
    C('frost', '서리 못', 'main', 'attack', 3, 'enemy', '피해 2, 속박 1턴(이동 불가). 조준을 끊는다.', { dmg: 2, root: 1, hero: 'lumi', source: 'hero', art: 'cardart.timeStop' }),
    C('detonate', '기폭', 'main', 'attack', 4, 'enemy', '대상의 화상·중독을 모두 터뜨려 중첩당 피해 2(최대 8). 인접한 적에게 화상 1이 번진다.', { special: 'detonate', hero: 'lumi', source: 'hero', art: 'cardart.bomb' }),
    // ── 연구 1단계
    C('thorns', '가시 갑주', 'bonus', 'defense', 0, 'self', '이번 전투 동안 나를 근접 공격한 적은 피해 2. 소진.', { special: 'thorns', exhaust: true, source: 'research1', art: 'cardart.rally' }),
    C('snare', '결박 덫', 'bonus', 'special', 2, 'tile', '2칸 안의 빈 칸에 덫 설치. 밟은 적은 피해 3, 속박 1턴.', { special: 'snare', source: 'research1', art: 'cardart.chainMark' }),
    C('venom', '독안개', 'main', 'attack', 3, 'enemy', '대상과 주변 1칸의 적(최대 3)에게 중독 2.', { poison: 2, area: 1, maxTargets: 3, source: 'research1', art: 'cardart.toxicRain' }),
    C('rune_bolt', '변동 룬탄', 'main', 'attack', 4, 'enemy', '확정 명중. 피해 1d4+2(3~6).', { roll: '1d4+2', source: 'research1', art: 'cardart.salvo' }),
    C('fortune', '행운의 매듭', 'bonus', 'special', 0, 'self', '다음 굴림(특수 카드·상자 판정)을 두 번 굴려 높은 값. 사용 전까지 유지.', { special: 'fortune', source: 'research1', art: 'cardart.rewind' }),
    C('scout', '탐색 도면', 'bonus', 'explore', 0, 'self', '인접한 방과 그 너머 방의 종류를 지도에 표시. 소진.', { special: 'scout', exhaust: true, source: 'research1', art: 'cardart.scout' }),
    C('cleave', '좁은 휩쓸기', 'main', 'attack', 1, 'enemy', '인접한 적 최대 3명에게 피해 4.', { dmg: 4, special: 'cleave', source: 'research1', art: 'cardart.whirl' }),
    C('sidestep', '회피 걸음', 'bonus', 'move', 0, 'self', '이동 +1, 방어 2.', { move: 1, block: 2, source: 'research1', art: 'cardart.shadowstep' }),
    // ── 연구 2단계
    C('chain', '연쇄 전류', 'main', 'attack', 3, 'enemy', '피해 3. 대상 2칸 안의 상태이상 걸린 적 최대 2명에게 피해 3 전이. 물 위의 적은 전이 피해 +2.', { dmg: 3, special: 'chain', source: 'research2', art: 'cardart.volley' }),
    C('catalyst', '촉매', 'bonus', 'special', 4, 'enemy', '이미 화상·중독에 걸린 적의 해당 중첩 +2.', { special: 'catalyst', source: 'research2', art: 'cardart.catalyst' }),
    C('steady', '안정의 룬', 'bonus', 'special', 0, 'self', '다음 굴림의 주사위를 평균값(올림)으로 고정. 소진.', { special: 'steady', exhaust: true, source: 'research2', art: 'cardart.purify' }),
    C('pierce', '관통 찌르기', 'main', 'attack', 3, 'enemy', '같은 직선의 적 최대 2명에게 장갑 무시 피해 4.', { dmg: 4, pierce: true, line: true, maxTargets: 2, source: 'research2', art: 'cardart.shieldLance' }),
    C('smoke', '연막', 'bonus', 'special', 0, 'self', '모든 적의 조준을 끊고 이번 적 턴의 원거리 공격을 막는다. 소진.', { special: 'smoke', exhaust: true, source: 'research2', art: 'cardart.eclipse' }),
    C('lockpick', '해체 요령', 'bonus', 'explore', 0, 'self', '다음 상자 판정에 +4. 소진.', { special: 'lockpick', exhaust: true, source: 'research2', art: 'cardart.renew' }),
    C('quake', '지면 강타', 'main', 'attack', 0, 'self', '인접한 모든 적을 1칸 밀치고 피해 2. 충돌 시 +3.', { dmg: 2, special: 'quake', push: 1, source: 'research2', art: 'cardart.breach' })
  ].forEach(c => { CARDS[c.id] = c; });

  const RESEARCH = {
    research1: { need: 1, cost: { gold: 15 }, mats: { thorns: { hide: 2 }, snare: { wood: 2, flax: 2 }, venom: { herb: 3 }, rune_bolt: { ore: 2, resin: 1 }, fortune: { resin: 2 }, scout: { flax: 2 }, cleave: { ore: 3 }, sidestep: { flax: 2, hide: 1 } } },
    research2: { need: 2, cost: { gold: 30 }, mats: { chain: { crystal: 1, coal: 2 }, catalyst: { coal: 2, herb: 3 }, steady: { scroll: 1 }, pierce: { ore: 4, coal: 1 }, smoke: { coal: 2, flax: 2 }, lockpick: { ore: 2, resin: 2 }, quake: { coal: 3, ore: 2 } } },
    upgrade: { need: 2, cost: { gold: 25, scroll: 1 } }
  };

  const HEROES = {
    ara: { id: 'ara', name: '아라', title: '방패 선봉', asset: 'actor.ara', hp: 30, move: 4, attack: { dmg: 4, range: 1, name: '검 베기' }, guardBonus: 1,
      passive: '기본 방어 +1. 방어로 근접 공격을 완전히 막으면 피해 2로 받아친다(적 턴당 1회).', gaugeText: '방어로 공격을 막아내면 투지 +1(적 턴당 1회).',
      special: { id: 'rally', name: '수호의 함성', slot: 'bonus', range: 0, target: 'self', text: '방어 +6, 다음 내 턴까지 근접 공격에 피해 3으로 반격.', block: 6, retaliate: 3 }, build: '방어·반격: 맞을 자리를 고르고, 쌓은 방어를 피해로 바꾼다.',
      deck: ['strike', 'strike', 'guard_up', 'guard_up', 'riposte', 'riposte', 'bulwark', 'shield_bash', 'taunt', 'dash', 'focus', 'mend'],
      perks: [[{ id: 'ara_guard', name: '굳건함', text: '기본 방어 +2.' }, { id: 'ara_van', name: '선봉', text: '전투 첫 턴 이동 +2.' }], [{ id: 'ara_counter', name: '응수', text: '모든 반격 피해 +2.' }, { id: 'ara_iron', name: '철의 의지', text: '최대 체력 +6.' }]] },
    noa: { id: 'noa', name: '노아', title: '그림자 길잡이', asset: 'actor.noa', hp: 26, move: 5, attack: { dmg: 3, range: 1, name: '쌍날 베기' },
      passive: '이동 5. 기본 공격 후 이동 +1. 3칸 이상 움직인 턴에는 다음 적 턴의 첫 근접 피해 -2(회피).', gaugeText: '한 턴에 3칸 이상 움직이면 투지 +1(턴당 1회).',
      special: { id: 'shadow', name: '그림자 난무', slot: 'main', range: 3, target: 'enemy', text: '3칸 안의 적 곁으로 순간이동해 피해 5. 이후 이동 +2. (뒤잡기 조건도 채워진다)', dmg: 5 }, build: '이동·밀치기·지형: 적을 벽과 가시덤불로 몰아 부딪히게 한다.',
      deck: ['strike', 'strike', 'shove', 'shove', 'hook', 'vault', 'backstab', 'backstab', 'dash', 'dash', 'harvest', 'mend'],
      perks: [[{ id: 'noa_feet', name: '가벼운 발', text: '이동 +1.' }, { id: 'noa_slam', name: '약점 포착', text: '충돌·지형 피해 +2.' }], [{ id: 'noa_ambush', name: '기습 달인', text: '기습 피해 +3.' }, { id: 'noa_loot', name: '약탈자의 손', text: '상자 판정 +2.' }]] },
    lumi: { id: 'lumi', name: '루미', title: '달빛 술사', asset: 'actor.lumi', hp: 24, move: 4, attack: { dmg: 3, range: 3, name: '마력탄' },
      passive: '기본 공격 사거리 3. 상태이상에 걸린 적에게 주는 직접 피해 +1.', gaugeText: '화상·중독을 부여하면 투지 +1(턴당 1회).',
      special: { id: 'moonburst', name: '달빛 폭주', slot: 'main', range: 4, target: 'enemy', text: '대상과 주변 1칸의 적(최대 4)에게 피해 2, 화상 2.', dmg: 2, burn: 2, area: 1, maxTargets: 4 }, build: '상태이상·연쇄: 불과 독을 쌓고 기폭·전이로 한꺼번에 터뜨린다.',
      deck: ['ignite', 'ignite', 'frost', 'frost', 'detonate', 'detonate', 'spark', 'spark', 'guard_up', 'focus', 'regroup', 'mend'],
      perks: [[{ id: 'lumi_ember', name: '잔불', text: '화상을 부여할 때 +1.' }, { id: 'lumi_frost', name: '혹한', text: '서리 못 피해 +2.' }], [{ id: 'lumi_chain', name: '연쇄 촉매', text: '상태이상 적 추가 피해 +1 → +2.' }, { id: 'lumi_ward', name: '비전 방벽', text: '전투 시작 시 방어 4.' }]] }
  };
  const TRAINING = [{ need: 1, cost: { gold: 20, herb: 4 } }, { need: 2, cost: { gold: 40, hide: 3, coal: 3 } }];

  // ai: melee | pack | ranged | caster | heavy | boss:<pattern>
  const ENEMIES = {
    goblin: { name: '유적 약탈자', asset: 'enemy.goblin', hp: 9, dmg: 3, speed: 3, detect: 3, ai: 'melee', size: 46, gold: [2, 4], loot: [['ore', 0.35], ['flax', 0.35]] },
    wolf: { name: '뿌리 늑대', asset: 'enemy.wolf', hp: 7, dmg: 2, speed: 5, detect: 4, ai: 'pack', size: 40, gold: [1, 2], loot: [['hide', 0.7]], note: '다른 늑대가 영웅 곁에 있으면 피해 +1.' },
    archer: { name: '매복 사수', asset: 'enemy.archer', hp: 8, dmg: 4, speed: 3, detect: 5, range: 5, ai: 'ranged', size: 50, gold: [3, 5], loot: [['flax', 0.5], ['wood', 0.3]], note: '한 턴 조준한 뒤 발사한다. 시야를 끊거나, 근접 타격·제어를 하면 조준이 풀린다.' },
    shaman: { name: '뼈가면 술사', asset: 'enemy.shaman', hp: 11, dmg: 4, speed: 2, detect: 4, range: 4, ai: 'caster', size: 52, gold: [4, 6], loot: [['herb', 0.5], ['resin', 0.3]], note: '발밑에 저주 문양을 새기고 다음 턴에 터뜨린다.' },
    brute: { name: '철갑 파수병', asset: 'enemy.brute', hp: 20, dmg: 7, speed: 2, detect: 3, armor: 1, ai: 'heavy', size: 60, elite: true, gold: [8, 10], loot: [['relic', 0.5], ['ore', 1]], note: '장갑 1. 내려찍기를 한 턴 예고한다. 벽에 밀어 부딪히면 장갑이 벗겨지고 기절한다.' },
    hound: { name: '재의 사냥개', asset: 'enemy.wolf', tint: 'hue-rotate(150deg) saturate(1.6)', hp: 10, dmg: 3, speed: 5, detect: 5, ai: 'pack', size: 42, gold: [2, 3], loot: [['hide', 0.6], ['coal', 0.3]] },
    sentry: { name: '용광로 파수병', asset: 'enemy.brute', tint: 'hue-rotate(-20deg) saturate(1.4)', hp: 16, dmg: 6, speed: 2, detect: 3, armor: 1, ai: 'heavy', size: 54, gold: [5, 7], loot: [['coal', 0.8], ['ore', 0.5]] },
    slinger: { name: '잿불 투척병', asset: 'enemy.archer', tint: 'hue-rotate(30deg)', hp: 10, dmg: 5, speed: 3, detect: 5, range: 5, ai: 'ranged', size: 50, gold: [4, 6], loot: [['coal', 0.5], ['flax', 0.4]] },
    acolyte: { name: '서고의 시종', asset: 'enemy.shaman', tint: 'hue-rotate(-90deg)', hp: 13, dmg: 5, speed: 2, detect: 5, range: 4, ai: 'caster', size: 52, gold: [5, 8], loot: [['crystal', 0.45], ['essence', 0.3]] },
    wraith: { name: '잔광 추적병', asset: 'enemy.goblin', tint: 'hue-rotate(160deg) brightness(1.2)', hp: 12, dmg: 4, speed: 4, detect: 4, ai: 'melee', size: 46, gold: [4, 6], loot: [['crystal', 0.35], ['flax', 0.4]] },
    warden: { name: '인장의 수문장', asset: 'enemy.warden', hp: 42, dmg: 6, speed: 2, detect: 9, ai: 'boss', pattern: ['sweep', 'charge', 'summon'], summon: 'goblin', size: 76, boss: true, cap: 8, gold: [25, 25], loot: [['relic', 1], ['scroll', 1]], note: '피해 상한 8. 휩쓸기→돌진→소환을 예고하고 반복한다. 다가와 곁에 닿으면 예고 없이 후려치고, 4칸 넘게 달아나면 격노해 더 빨리 쫓는다. 돌진이 벽에 막히거나 소환 중이면 빈틈(받는 피해 +2).' },
    overseer: { name: '용광로 집행자', asset: 'enemy.brute', tint: 'hue-rotate(-35deg) saturate(1.8) brightness(1.1)', hp: 58, dmg: 7, speed: 2, detect: 9, armor: 1, ai: 'boss', pattern: ['slam', 'vent', 'charge'], size: 78, boss: true, cap: 9, gold: [40, 40], loot: [['relic', 1], ['coal', 1], ['scroll', 1]], note: '장갑 1, 피해 상한 9. 내려찍기→열기 방출→돌진.' },
    hierophant: { name: '별을 삼킨 사제', asset: 'enemy.shaman', tint: 'hue-rotate(-120deg) saturate(1.5)', hp: 58, dmg: 6, speed: 2, detect: 9, range: 5, ai: 'boss', pattern: ['runes', 'summon', 'beam', 'blink'], summon: 'wraith', size: 76, boss: true, cap: 9, gold: [60, 60], loot: [['essence', 1], ['relic', 1], ['scroll', 1]], note: '피해 상한 9. 문양 폭발→소환→직선 광선→점멸.' },
    stalker: { name: '붉은달 추적자', asset: 'enemy.warden', tint: 'hue-rotate(-30deg) saturate(2) brightness(0.8)', hp: 60, dmg: 8, speed: 3, detect: 99, ai: 'boss', pattern: ['sweep', 'charge'], size: 80, boss: true, cap: 6, stalker: true, gold: [0, 0], loot: [['moonshard', 1]], note: '시간 초과의 대가. 쓰러뜨리기보다 귀환문으로 달아나는 편이 낫다.' }
  };

  /* 적 특성: 행동 유형(ai) 위에 얹는 조립식 부품. 적 데이터의 traits: { id: {매개변수} } 로 쓴다. 규칙은 run.js 의 같은 id 가 해석한다.
     params: [기본값, 설명]. text: 툴팁·도구에 보이는 설명. */
  const TRAITS = {
    explode: { name: '자폭', params: { dmg: [4, '피해'] }, text: p => '쓰러지면 터져 십자 1칸에 피해 ' + p.dmg + '. 곁의 적도 맞는다.' },
    split: { name: '분열', params: { into: ['slaglet', '나오는 적'], n: [2, '수'] }, text: p => '쓰러지면 ' + (ENEMIES[p.into]?.name || p.into) + ' ' + p.n + '마리로 갈라진다.' },
    regen: { name: '재생', params: { n: [2, '턴마다 회복'] }, text: p => '자기 차례마다 체력 ' + p.n + ' 회복.' },
    enrage: { name: '격앙', params: { below: [50, '체력 % 이하'], dmg: [2, '피해 +'], speed: [1, '이동 +'] }, text: p => '체력 ' + p.below + '% 이하에서 피해 +' + p.dmg + ', 이동 +' + p.speed + '.' },
    frontArmor: { name: '정면 방패', params: { n: [2, '장갑'] }, text: p => '바라보는 쪽에서 오는 피해 -' + p.n + '. 옆(같은 세로줄)이나 등 뒤, 기절 중에는 통하지 않는다.' },
    aura: { name: '지휘', params: { armor: [1, '장갑 +'], radius: [2, '반경'] }, text: p => p.radius + '칸 안의 다른 적에게 장갑 +' + p.armor + '. 먼저 쓰러뜨리자.' },
    thief: { name: '소매치기', params: { gold: [8, '훔치는 금화'] }, text: p => '타격이 들어가면 금화를 최대 ' + p.gold + ' 훔쳐 달아난다. 2턴 안에 쓰러뜨리면 되찾는다.' },
    hex: { name: '저주 화살', params: { n: [1, '버리는 카드'] }, text: p => '피해를 입히면 손패 ' + p.n + '장을 무작위로 버리게 한다.' },
    spawner: { name: '둥지', params: { kind: ['inkling', '나오는 적'], every: [2, '주기(턴)'], max: [2, '동시 최대'] }, text: p => p.every + '턴마다 ' + (ENEMIES[p.kind]?.name || p.kind) + '을(를) 낳는다(동시에 ' + p.max + '마리까지).' }
  };
  const AI_TYPES = { melee: '근접: 다가와 친다', pack: '무리: 같은 종이 곁에 있으면 피해 +1', ranged: '사수: 한 턴 조준 후 발사', caster: '술사: 발밑 문양 예고·아군 치유', heavy: '중장: 내려찍기 3칸 예고', none: '움직이지 않음(특성만 작동)', boss: '수호자: pattern 순서대로 예고' };
  const enemyNote = kind => { const d = ENEMIES[kind]; return [d.note].concat(Object.entries(d.traits || {}).map(([id, p]) => TRAITS[id] ? TRAITS[id].name + ': ' + TRAITS[id].text(p) : '')).filter(Boolean).join(' '); };

  // 방 종류별 구성. nodes: [재료, 개수범위, 1개당 수량범위]
  const REGIONS = {
    verdant: { id: 'verdant', name: '뿌리 잠긴 회랑', subtitle: '길드의 잊힌 입구', rank: 1, rooms: 7, limit: 70, floor: 'floor.verdant', wall: 'wall.verdant', ambient: '#0d1a14', hazard: { id: 'thorn', name: '가시덤불', dmg: 3 },
      boss: 'warden', objective: { id: 'seal', name: '잊힌 길드 인장' }, specialty: ['resin', 'hide'], materials: ['wood', 'ore', 'herb', 'flax', 'resin', 'hide', 'scroll', 'relic'],
      types: ['entry', 'supply', 'mine', 'garden', 'shelter', 'vault', 'sanctum'], extra: ['hall'],
      rooms_def: {
        entry: { name: '귀환 거점', enemies: [], nodes: [['wood', [1, 1], [2, 2]], ['ore', [1, 1], [2, 2]]] },
        supply: { name: '버려진 보급실', enemies: [['goblin'], ['goblin', 'goblin'], ['goblin', 'wolf']], nodes: [['flax', [1, 2], [2, 3]], ['wood', [1, 1], [2, 3]]], chest: 'basic' },
        mine: { name: '뿌리 채굴장', enemies: [['goblin', 'wolf'], ['wolf', 'wolf'], ['goblin', 'archer']], nodes: [['ore', [2, 3], [2, 3]], ['resin', [1, 1], [2, 2]]] },
        garden: { name: '봉인 정원', enemies: [['archer', 'goblin'], ['archer', 'wolf']], nodes: [['herb', [2, 2], [2, 3]], ['resin', [0, 1], [1, 2]]], device: true },
        shelter: { name: '옛 야영지', enemies: [], nodes: [['herb', [1, 1], [2, 2]], ['wood', [1, 1], [2, 2]]], camp: true },
        vault: { name: '위험 보물고', enemies: [['brute', 'archer'], ['brute', 'goblin']], nodes: [['resin', [1, 1], [2, 3]]], chest: 'vault', danger: true },
        sanctum: { name: '인장의 성소', enemies: [['warden']], nodes: [], objective: true, sealed: true },
        hall: { name: '무너진 회랑', enemies: [['wolf', 'wolf'], ['goblin', 'archer'], ['goblin']], nodes: [['wood', [1, 2], [2, 2]], ['flax', [0, 1], [2, 2]]], chest: 'sealed' }
      } },
    foundry: { id: 'foundry', name: '잿불 용광로', subtitle: '멈춘 기계의 심장', rank: 2, rooms: 9, limit: 90, floor: 'floor.foundry', wall: 'wall.foundry', ambient: '#1c0f0a', hazard: { id: 'vent', name: '열기 분출구', dmg: 4, burnHero: true },
      boss: 'overseer', objective: { id: 'core', name: '용광로 제어핵' }, specialty: ['coal'], materials: ['ore', 'coal', 'hide', 'flax', 'relic', 'scroll', 'crystal'],
      types: ['entry', 'supply', 'mine', 'garden', 'shelter', 'vault', 'sanctum', 'hall', 'mine2'], extra: ['hall'], devices: 2,
      rooms_def: {
        entry: { name: '귀환 거점', enemies: [], nodes: [['ore', [1, 1], [2, 2]]] },
        supply: { name: '연료 저장고', enemies: [['hound', 'hound'], ['sentry'], ['hound', 'slinger']], nodes: [['coal', [1, 2], [2, 2]], ['flax', [1, 1], [2, 3]]], chest: 'sealed' },
        mine: { name: '잿불 광맥', enemies: [['sentry', 'hound'], ['slinger', 'hound']], nodes: [['ore', [2, 2], [2, 3]], ['coal', [1, 2], [2, 3]]] },
        mine2: { name: '식은 주조실', enemies: [['sentry', 'slinger'], ['hound', 'hound', 'slinger']], nodes: [['coal', [2, 2], [2, 3]], ['crystal', [1, 1], [1, 1]]], device: true },
        garden: { name: '밸브 제어실', enemies: [['slinger', 'sentry'], ['slinger', 'hound']], nodes: [['ore', [1, 1], [2, 3]]], device: true },
        shelter: { name: '정비공의 쉼터', enemies: [], nodes: [['flax', [1, 1], [2, 2]]], camp: true, altar: true },
        vault: { name: '녹아내린 금고', enemies: [['brute', 'slinger', 'hound'], ['brute', 'sentry']], nodes: [['coal', [1, 1], [3, 3]]], chest: 'vault', danger: true },
        sanctum: { name: '제어핵 성소', enemies: [['overseer']], nodes: [], objective: true, sealed: true },
        hall: { name: '그을린 통로', enemies: [['hound', 'hound'], ['sentry', 'slinger'], ['hound']], nodes: [['hide', [0, 1], [1, 2]], ['ore', [1, 1], [2, 2]]], chest: 'basic' }
      } },
    archive: { id: 'archive', name: '침수된 별의 서고', subtitle: '별빛에 잠긴 기록', rank: 3, rooms: 11, limit: 110, floor: 'floor.archive', wall: 'wall.archive', ambient: '#0c0f22', hazard: { id: 'water', name: '깊은 물웅덩이', dmg: 0, slow: true, conduct: true },
      boss: 'hierophant', objective: { id: 'chart', name: '별의 항로 원본' }, specialty: ['crystal', 'essence'], materials: ['crystal', 'essence', 'herb', 'flax', 'relic', 'scroll'],
      types: ['entry', 'supply', 'mine', 'garden', 'shelter', 'vault', 'sanctum', 'hall', 'mine2', 'hall2', 'deep'], extra: ['hall'], devices: 2,
      rooms_def: {
        entry: { name: '귀환 거점', enemies: [], nodes: [['flax', [1, 1], [2, 2]]] },
        supply: { name: '사서의 창고', enemies: [['wraith', 'wraith'], ['wraith', 'acolyte']], nodes: [['flax', [1, 2], [2, 3]], ['herb', [1, 1], [2, 3]]], chest: 'sealed' },
        mine: { name: '수정 서가', enemies: [['acolyte', 'wraith'], ['wraith', 'wraith', 'slinger']], nodes: [['crystal', [2, 2], [1, 2]]] },
        mine2: { name: '정수 증류실', enemies: [['acolyte', 'acolyte'], ['sentry', 'acolyte']], nodes: [['essence', [2, 2], [1, 2]]], device: true },
        garden: { name: '별자리 제어실', enemies: [['slinger', 'wraith', 'wraith'], ['acolyte', 'slinger']], nodes: [['herb', [1, 2], [2, 3]]], device: true },
        shelter: { name: '마른 열람실', enemies: [], nodes: [['herb', [1, 1], [2, 2]]], camp: true, altar: true },
        vault: { name: '금서 보관고', enemies: [['brute', 'acolyte', 'wraith'], ['brute', 'brute']], nodes: [['essence', [1, 1], [2, 2]]], chest: 'vault', danger: true },
        deep: { name: '침수 심부', enemies: [['brute', 'acolyte', 'slinger']], nodes: [['crystal', [1, 1], [3, 3]], ['essence', [1, 1], [2, 2]]], chest: 'vault', danger: true },
        sanctum: { name: '항로의 성소', enemies: [['hierophant']], nodes: [], objective: true, sealed: true },
        hall: { name: '젖은 회랑', enemies: [['wraith', 'slinger'], ['wraith', 'wraith']], nodes: [['flax', [1, 1], [2, 2]]], chest: 'basic' },
        hall2: { name: '무너진 서가', enemies: [['acolyte', 'wraith'], ['sentry', 'wraith']], nodes: [['crystal', [1, 1], [1, 2]]], chest: 'sealed' }
      } }
  };

  const CHESTS = {
    basic: { name: '보급 상자', loot: { gold: [6, 10], mats: [['flax', 2], ['herb', 2], ['wood', 2]], picks: 2 } },
    sealed: { name: '봉인 상자', check: { formula: '1d20', dc: 11 }, loot: { gold: [8, 12], mats: [['resin', 2], ['ore', 2], ['hide', 2]], picks: 2 }, bonus: { gold: 6, mats: [['scroll', 1]] }, fail: { time: 3 } },
    vault: { name: '보물고 금고', check: { formula: '1d20', dc: 14 }, loot: { gold: [14, 20], mats: [['scroll', 1], ['relic', 1]], picks: 2 }, bonus: { gold: 10, mats: [['relic', 1]] }, fail: { time: 2, dmg: 3 } }
  };
  const ALTAR = { name: '맥동 제단', cost: { gold: 5 }, check: { formula: '2d6', dc: 8 }, success: '체력 8 회복, 이번 원정 집중 효과 +1', fail: { time: 2 } };

  const FACILITIES = {
    workshop: { name: '제작 공방', role: '장비 제작', plot: { x: 2.2, y: 5.4 }, reveal: 0,
      levels: [{ cost: { wood: 4, ore: 3 }, text: '1단계 장비 제작이 열린다.' }, { cost: { ore: 6, coal: 4, resin: 2 }, text: '2단계 장비 제작이 열린다.' }, { cost: { coal: 6, crystal: 3, relic: 2 }, text: '장비 칸 +1(3칸).' }] },
    stash: { name: '회수 창고', role: '가방·판매·납품', plot: { x: 12.0, y: 5.6 }, reveal: 0,
      levels: [{ cost: { wood: 5, flax: 3 }, text: '가방 +1칸. 재료 판매가 열린다.' }, { cost: { wood: 6, hide: 3, coal: 2 }, text: '가방 +1칸. 패배해도 가방 첫 칸을 건진다.' }, { cost: { wood: 8, crystal: 3, relic: 1 }, text: '가방 +1칸. 판매가 +25%.' }] },
    barracks: { name: '훈련·회복실', role: '대원 훈련', plot: { x: 3.0, y: 9.4 }, reveal: 1,
      levels: [{ cost: { herb: 4, flax: 3, wood: 2 }, text: '대원 1차 훈련. 출격 때 붕대 1개 지급.' }, { cost: { herb: 6, hide: 3, coal: 3 }, text: '대원 2차 훈련. 붕대 2개.' }, { cost: { herb: 8, essence: 3 }, text: '모든 대원 최대 체력 +4.' }] },
    observatory: { name: '관측 연구실', role: '카드 연구·지도', plot: { x: 11.4, y: 9.4 }, reveal: 1,
      levels: [{ cost: { ore: 3, resin: 3, scroll: 1 }, text: '술사 루미 합류. 1단계 카드 연구. 지도에 이웃 방 종류 표시.' }, { cost: { crystal: 3, scroll: 2, coal: 2 }, text: '2단계 연구와 카드 강화. 붉은달 한계 +8.' }, { cost: { essence: 4, scroll: 3, relic: 2 }, text: '출격 때부터 목표 성소 위치 표시. 붉은달 한계 +8.' }] }
  };

  const GEAR = {
    coat: { name: '수선한 외투', tier: 1, icon: 'gear.coat', cost: { flax: 3, resin: 1 }, text: '최대 체력 +4.', hp: 4 },
    strap: { name: '수지 방패끈', tier: 1, icon: 'gear.shield', cost: { hide: 2, ore: 2 }, text: '전투 시작 시 방어 3.', startBlock: 3 },
    pick: { name: '채집 곡괭이', tier: 1, icon: 'gear.pick', cost: { ore: 3, wood: 2 }, text: '광석·수지·열탄·수정 채집 +1.', gather: 1 },
    satchel: { name: '큰 배낭', tier: 1, icon: 'gear.pack', cost: { flax: 4, hide: 1 }, text: '가방 +1칸.', bag: 1 },
    tools: { name: '해체 도구', tier: 1, icon: 'gear.compass', cost: { ore: 2, resin: 2 }, text: '상자·제단 판정 +3.', check: 3 },
    lantern: { name: '열탄 랜턴', tier: 2, icon: 'gear.signal', cost: { coal: 3, ore: 2 }, text: '시야 +1. 붉은달의 시야 감소를 무시.', vision: 1 },
    spikes: { name: '가시 징', tier: 2, icon: 'gear.sword', cost: { coal: 2, hide: 2 }, text: '충돌·지형 피해 +2.', slam: 2 },
    ring: { name: '촉매 반지', tier: 2, icon: 'gear.tonic', cost: { crystal: 2, resin: 2 }, text: '매 턴 처음 부여하는 화상·중독 +1.', status: 1 },
    flare: { name: '섬광 주머니', tier: 2, icon: 'gear.flash', cost: { coal: 2, flax: 3 }, text: '원정당 1회, 보조 행동으로 모든 적을 1턴 기절시킨다(보스 제외: 조준·예고만 취소).', flare: 1 },
    crest: { name: '수문장의 뿔', tier: 9, icon: 'gear.bandage', cost: null, text: '빈틈 상태의 적에게 주는 피해 +2.', exposedBonus: 2 }
  };

  const QUESTS = {
    first: { name: '첫 회수품 납품', text: '길드가 다시 움직인다는 증거를 조합에 보낸다.', need: { wood: 2, herb: 2 }, reward: { gold: 25 }, rewardText: '금화 25' },
    warden: { name: '수문장 토벌 보고', text: '뿌리 잠긴 회랑의 수문장을 쓰러뜨리고 귀환한다.', auto: 'boss:verdant', reward: { gear: 'crest', gold: 30 }, rewardText: '수문장의 뿔 · 금화 30' },
    route2: { name: '용광로 항로 복구(우회)', text: '수문장을 피해 자재로 옛 항로를 다시 잇는다. 수문장을 잡았다면 필요 없다.', need: { wood: 8, ore: 6, resin: 3 }, reward: { unlock: 'foundry' }, rewardText: '잿불 용광로 개방', hideIfUnlocked: 'foundry' },
    fuel: { name: '겨울 연료 납품', text: '마을 대장간에 열탄을 보낸다.', need: { coal: 5 }, reward: { gold: 60 }, rewardText: '금화 60', region: 'foundry' },
    overseer: { name: '집행자 토벌 보고', text: '잿불 용광로의 집행자를 쓰러뜨리고 귀환한다.', auto: 'boss:foundry', reward: { gold: 60, scroll: 1 }, rewardText: '금화 60 · 고문서 1', region: 'foundry' },
    route3: { name: '서고 수로 복구(우회)', text: '집행자를 피해 수로를 뚫는다. 회랑과 용광로의 재료만 든다.', need: { coal: 8, ore: 6, hide: 4 }, reward: { unlock: 'archive' }, rewardText: '침수된 별의 서고 개방', hideIfUnlocked: 'archive', region: 'foundry' },
    revival: { name: '길드 재건 선언', text: '별을 삼킨 사제를 쓰러뜨리고 항로 원본을 가져온다.', auto: 'boss:archive', reward: { gold: 150 }, rewardText: '금화 150 · 길드 재건', region: 'archive' }
  };

  // 도구가 관리하는 콘텐츠(content.js)를 합친다.
  const CONTENT = ER.CONTENT || {};
  for (const [k, v] of Object.entries(CONTENT.enemies || {})) ENEMIES[k] = Object.assign(ENEMIES[k] || {}, v);
  for (const sp of CONTENT.spawns || []) { const def = REGIONS[sp.region]?.rooms_def[sp.room]; if (def && sp.group.every(k => ENEMIES[k])) def.enemies.push(sp.group.slice()); }

  ER.data = { TRAITS, AI_TYPES, enemyNote, RULES, MATERIALS, CARDS, RESEARCH, HEROES, TRAINING, ENEMIES, REGIONS, CHESTS, ALTAR, FACILITIES, GEAR, QUESTS };
  if (typeof module === 'object') module.exports = ER;
})(typeof globalThis !== 'undefined' ? globalThis : this);
