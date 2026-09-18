# 2026-09-18 플레이 테스트 준비 1라운드 리뷰 (Codex gpt-6-astra, high)

기준 커밋 2caa2f7. 반영표는 맨 아래.

## 요청

# 플레이 테스트 준비 1라운드 리뷰 요청 (Emberwake Reborn)

## 읽을 파일
- 규칙: `src/run.js`(전투·적 AI·카드 `doCard`·`actEnemy`·`actBoss`), `src/data.js`(RULES·CARDS·HEROES·ENEMIES·REGIONS), `src/content.js`, `src/guild.js`
- 봇·검증: `tools/campaign.cjs`, `tools/sim.cjs`, `src/bot.js`, `tests/core.test.cjs`
- 문서: `docs/DESIGN.md`, `docs/WORKLOG.md`(9~10차), `docs/codex-requests/2026-09-18-cleanup-review.md`(직전 리뷰 반영표)
- 읽기 전용입니다. 아무 파일도 고치지 마세요. 필요하면 `node tools/campaign.cjs 2 60`, `node tools/smart-bot.cjs 40`, `node --test tests/core.test.cjs` 를 직접 실행해도 됩니다(읽기 전용 샌드박스에서 실행 가능).

## 배경
지난 리뷰(정리) 이후 던전 기믹·귀환 편의·지역 소진·배치식 마을을 넣었고, 이제 "외부 테스터가 플레이할 수 있는 상태"를 목표로 라운드를 돌고 있다. 1라운드에서 새 게임부터 3지역 수호자까지 자동으로 도는 캠페인 봇을 만들었다. 결과: 4회 중 2회 완주(89회 원정), 예외·교착 없음. 봇이 찾아낸 설계 문제 하나(추적자가 붙으면 귀환문을 못 씀)는 "적이 붙어 있어도 기회 공격을 받으며 귀환"으로 바꿨다.

소유자(기획자)가 방금 두 가지를 더 요청했다:
1. **발더스 게이트 3처럼 스킬을 티어와 행동 타입으로 구분**해서 쓰게 해 달라.
2. **적 패턴·공격 방식을 더 다양하게**. 특히 "정예처럼 생긴 놈(철갑 파수병 `brute`, ai:'heavy')의 내려찍기가 무조건 피할 수 있어서 별로다".

## 항목별 요청 (판정: 차단 / 권고 / 동의 + 근거 `파일:줄`)
A. **진행 검증의 신뢰도**: 캠페인 봇이 완주한 것이 "사람도 완주할 수 있다"의 근거가 되는가. 봇이 가리는 문제(예: 봇만 가능한 행동, 봇이 절대 하지 않는 행동)를 지목해 달라. 봇 결과에서 실제 밸런스 위험으로 읽히는 것(예: 3지역 성소 도달률, 금화가 4,000까지 쌓이는데 쓸 곳이 없음)을 골라 달라.
B. **귀환 규칙 변경**(`src/run.js` interactions/doInteract 의 extract): "적이 붙어 있어도 기회 공격을 받고 귀환"이 옳은가, 악용 경로(전투 회피 최적화)가 있는가.
C. **행동 타입·티어 설계(요청 1)**: 지금은 카드가 `slot: 'main'|'bonus'` 둘뿐이고, 반격 태세 같은 카드는 "다음 턴까지 효과"로 흉내 낸다. 발더스 3의 행동/보조 행동/반응(reaction)/자유 행동과 주문 슬롯(티어)을 이 게임(1인, 12장 덱, 턴당 드로우 2, 투지 게이지 0~5)에 옮긴다면 어떤 형태가 좋은가. 구체적으로: (1) 행동 타입 4종을 어떻게 정의하고 UI에 어떻게 보이게 할지, (2) 티어(1~3)를 무엇에 걸지 — 연구 단계, 투지 비용, 원정당 사용 횟수(주문 슬롯) 중 무엇이 이 게임 루프(귀환·야영)와 맞는지, (3) 기존 34장을 다시 분류할 때의 원칙. 데이터 스키마 제안(카드 필드)과 `run.js` 의 어느 함수를 건드려야 하는지 `파일:줄` 로.
D. **적 패턴 다양화(요청 2)**: `actEnemy`/`actBoss` 의 현재 6가지 행동 유형과 `TRAITS` 9종을 보고, "예고하면 항상 피할 수 있다"를 깨면서도 미리보기·공정성(플레이어가 대응할 수 있음)을 지키는 공격 방식을 5~8개 제안해 달라. 각각: 이름, 예고 방식, 피하거나 막는 방법(항상 하나는 있어야 함), 어느 적에 붙일지, 구현 위치. 특히 `heavy` 의 내려찍기를 어떻게 바꿀지(예: 추적, 넓은 범위, 밀어내기, 2연타, 사거리 2, 예고 없는 약한 타격 + 예고 있는 강한 타격 조합).
E. **플레이 테스트 준비 체크리스트**: 외부 테스터에게 주기 전에 꼭 있어야 하는 것 중 지금 없는 것(예: 기록 내보내기, 버그 리포트 경로, 첫 10분 안내, 난이도 선택, 세이브 슬롯). 각 항목의 값어치와 비용을 짧게.
F. **커밋 가능 여부**: 1라운드 상태(2caa2f7)를 기준점으로 삼아도 되는가.

## 출력 형식
- A~F 순서. 각 항목: 판정 → 근거(`파일:줄`) → 설명. C·D 는 표로.
- 마지막에 "2라운드 권장 순서" 5~8줄.

## 판정

검토 기준은 **`2caa2f7`**입니다. 파일은 수정하지 않았습니다. **47개 테스트는 모두 통과**했지만, 현재 기본 시드로 캠페인 4회를 실행하면 **240회 원정 동안 완주 0회**였습니다. 따라서 개발 기록으로 보존할 수는 있어도, 외부 플레이 준비 완료를 입증하는 기준점으로 승인하기에는 부족합니다.

**A. 진행 검증의 신뢰도 — 차단: 완주 가능성의 증거로 사용하기에는 부족**

근거: [campaign.cjs:73](D:/Project_home/Game/EmberwakeReborn/tools/campaign.cjs:73), [sim.cjs:22](D:/Project_home/Game/EmberwakeReborn/tools/sim.cjs:22), [core.test.cjs:1598](D:/Project_home/Game/EmberwakeReborn/tests/core.test.cjs:1598).

현재 봇은 **특정 자동 정책으로 엔진의 진행 경로를 검사하는 도구**로는 유효합니다. 사람의 완주 가능성·소요 시간·설명 이해도를 검증하지는 못합니다.

직접 실행한 결과는 다음과 같습니다.

| 실행 | 결과 |
|---|---|
| `node --test tests/core.test.cjs` | 47/47 통과 |
| `node tools/campaign.cjs 2 60` | 두 캠페인 모두 60회 원정에서 미완주 |
| 추가 확인: `node tools/campaign.cjs 4 60` | 4회 모두 미완주. 패배 각각 17·20·18·17회 |
| 실행 중 메모리 계측 | 서고 보스 목표 원정 **47회 중 성소 방문 1회**. 그 1회도 사제 처치 후 사망 |
| 같은 4회 최종 금화 | **4,403 / 3,994 / 4,057 / 3,971** |

제공된 **“4회 중 2회 완주·89회 원정”은 이번 조건에서 재현되지 않았습니다.** 당시 커밋·시드·최대 원정 수·출력 원본을 묶어야 비교 가능한 기준이 됩니다.

봇이 가리는 문제는 양방향입니다.

| 판정 | 근거 | 문제와 영향 |
|---|---|---|
| 차단 | [sim.cjs:22](D:/Project_home/Game/EmberwakeReborn/tools/sim.cjs:22), [sim.cjs:266](D:/Project_home/Game/EmberwakeReborn/tools/sim.cjs:266) | 미탐색 방의 연결·종류·위험도를 읽고 목적지를 정합니다. 사람에게 없는 정보를 사용하므로 길 찾기와 지도 정보의 가치를 검증하지 못합니다. |
| 권고 | [sim.cjs:257](D:/Project_home/Game/EmberwakeReborn/tools/sim.cjs:257) | 접근 실패 시 `e.state = 'alert'`로 직접 바꿉니다. 실행 여부와 별개로, 검증 봇에 정상 행동 API 밖의 복구 경로가 있습니다. |
| 차단 | [bot.js:56](D:/Project_home/Game/EmberwakeReborn/src/bot.js:56), [sim.cjs:102](D:/Project_home/Game/EmberwakeReborn/tools/sim.cjs:102) | 전투 정책이 특수기·붕대·섬광·기믹을 사용하지 않습니다. 전투를 최대 60턴 묶어 처리하므로 도중 귀환 판단도 늦습니다. |
| 권고 | [sim.cjs:213](D:/Project_home/Game/EmberwakeReborn/tools/sim.cjs:213), [sim.cjs:221](D:/Project_home/Game/EmberwakeReborn/tools/sim.cjs:221) | 야영은 사용하지만 귀환석·자동 이동을 사용하지 않고, 탐사 상태의 귀환은 입구 방을 향합니다. 성소 귀환 균열의 편의를 충분히 시험하지 않습니다. |
| 차단 | [campaign.cjs:37](D:/Project_home/Game/EmberwakeReborn/tools/campaign.cjs:37), [campaign.cjs:83](D:/Project_home/Game/EmberwakeReborn/tools/campaign.cjs:83) | 연구 카드를 선택 대원에게 무작정 넣고, 장비는 제작 당시 대원에게만 장착합니다. 도전 준비 조건도 **전체 보유 장비 수**입니다. 실제 계측에서 장비 18개를 보유하고도 루미 장착은 0개인 사례가 나왔습니다. |
| 권고 | [campaign.cjs:79](D:/Project_home/Game/EmberwakeReborn/tools/campaign.cjs:79) | 소진에 따른 지역 교대와 짝수 원정의 보스 목표가 맞물립니다. 시드 3에서는 서고 원정 18회 중 17회가 채집 목표였습니다. 지역별 도전 기회가 균등하지 않습니다. |
| 차단 | [core.test.cjs:1598](D:/Project_home/Game/EmberwakeReborn/tests/core.test.cjs:1598) | 테스트 이름은 “첫 지역 수호자까지 진행”인데 실제 검사는 예외 문자열 부재·원정 25회 이상·공방 1단계뿐입니다. **수호자 격파를 검사하지 않습니다.** |
| 권고 | [campaign.cjs:125](D:/Project_home/Game/EmberwakeReborn/tools/campaign.cjs:125) | 정산 뒤 저장을 직렬화했다가 읽기만 합니다. 복원 상태로 다음 원정을 이어가지 않으며, 전투 중 재접속·실제 브라우저 저장도 검사하지 않습니다. |

**실제 밸런스 위험으로 읽을 것은 다음 세 가지입니다.**

- **서고 성소 도달 전 소모가 과합니다.** 1/47은 경고 신호입니다. 다만 봇이 성소를 마지막에 방문하고 보급 수단을 무시하므로, 바로 적 체력을 낮추기보다 `장치 완료 → 성소 도착 → 보스 처치 → 생환`을 분리 계측해야 합니다. 서고는 11방·장치 2개·이동을 늦추는 물 지형입니다. 근거: [sim.cjs:266](D:/Project_home/Game/EmberwakeReborn/tools/sim.cjs:266), [data.js:922](D:/Project_home/Game/EmberwakeReborn/src/data.js:922).
- **금화의 전투 준비 전환 경로가 약합니다.** 4,000금이 있어도 부족한 정수·부품을 해결하지 못합니다. 다만 봇의 구매 목록에는 카드 강화가 빠지고, 마을 장식도 사지 않습니다. “소비처가 전혀 없다”보다 **재료 병목을 완화할 금화 소비처가 부족하다**가 정확합니다. 장식도 현재 재료 비용입니다. 근거: [guild.js:202](D:/Project_home/Game/EmberwakeReborn/src/guild.js:202), [data.js:1316](D:/Project_home/Game/EmberwakeReborn/src/data.js:1316). 제한 수량의 보급품·기초 재료 교환부터 시험하는 것이 좋습니다.
- **대원별 후반 대응력 차이가 큽니다.** 기본 덱 사제 모의전 40회에서 아라 93%, 노아 20%, 루미 60%였습니다. 성장·실제 성소 배치가 빠진 결과이므로 사람 승률은 아니지만, 노아의 접근 비용과 방어 수단은 우선 점검할 가치가 있습니다. 근거: [smart-bot.cjs:39](D:/Project_home/Game/EmberwakeReborn/tools/smart-bot.cjs:39), [bot.js:151](D:/Project_home/Game/EmberwakeReborn/src/bot.js:151).

**B. 귀환 규칙 변경 — 동의, 위험 표시와 일자 진행은 보완 권고**

근거: [run.js:2253](D:/Project_home/Game/EmberwakeReborn/src/run.js:2253), [run.js:2404](D:/Project_home/Game/EmberwakeReborn/src/run.js:2404).

**귀환 허용은 맞습니다.** 추적자의 역할이 귀환을 재촉하는 것이라면, 귀환문 앞에서 탈출 자체를 봉쇄하면 안 됩니다. 현재는 전투 중 주 행동을 쓰고, 인접한 비기절 근접 적의 공격을 먼저 받은 뒤 살아 있으면 귀환합니다. 치명적인 기회 공격을 받아도 성공 귀환으로 덮어쓰지는 않습니다.

다만 다음 경로를 의도된 규칙으로 확정해야 합니다.

- **이동 후 무피해 귀환이 가능합니다.** 귀환문 `(2,4)`, 영웅 `(3,4)`, 적 `(4,4)`에서 바로 귀환하면 피해 3입니다. 이동력 3으로 `(2,3)`에 이동한 뒤 귀환하면 피해 0이었습니다. 일반 이탈은 추가 이동력만 요구하기 때문입니다. **이동력을 남긴 대가로 얻는 탈출 선택**으로 허용하는 편이 낫습니다. 이를 막으려고 일반 이동 전체에 기회 공격을 추가하면 노아와 위치 전술이 크게 달라집니다. 근거: [run.js:259](D:/Project_home/Game/EmberwakeReborn/src/run.js:259).
- **원거리 조준·바닥 예고·대기 중 추격자는 귀환으로 회피합니다.** 원정 종료라는 대가가 있으므로 정상적인 철수 보상으로 볼 수 있습니다. 정예 보물도 경비를 끌어낸 뒤 회수할 수 있지만, 이는 기존 경비 규칙이 허용한 해결법입니다. 근거: [run.js:2164](D:/Project_home/Game/EmberwakeReborn/src/run.js:2164).
- **확인창의 생환 안내는 고쳐야 합니다.** 하단 선택지에는 기회 공격이 나오지만 최종 확인창은 “전리품이 창고에 들어갑니다”만 강조합니다. `기회 공격 N회 → 방어·회피 적용 후 예상 잔여 HP → 사망 시 전리품 상실`을 확인창에도 표시해야 합니다. 근거: [app.js:1928](D:/Project_home/Game/EmberwakeReborn/src/app.js:1928), [app.js:1982](D:/Project_home/Game/EmberwakeReborn/src/app.js:1982).

추가로 **시간 0 즉시 귀환으로 날짜를 넘기는 우회**를 재현했습니다. 회랑에 들어갔다 바로 나오는 것을 세 번 반복하니 서고 소진이 `3→0`으로 회복했습니다. 매번 장사 가능 상태와 수요도 회복됩니다. 근거: [guild.js:450](D:/Project_home/Game/EmberwakeReborn/src/guild.js:450), [guild.js:716](D:/Project_home/Game/EmberwakeReborn/src/guild.js:716), [guild.js:757](D:/Project_home/Game/EmberwakeReborn/src/guild.js:757).

이는 이번 전투 귀환 허용만의 문제가 아닙니다. **빈 원정 취소는 날짜를 넘기지 않게 하거나, 비용·효과가 명확한 ‘하루 쉬기’로 정식 제공**하십시오. 현재는 소진 시스템을 우회하는 번거로운 클릭이 최적 행동이 될 수 있습니다.

**C. 행동 타입·티어 설계 — 권고: 행동 종류와 원정 자원을 분리**

근거: [data.js:69](D:/Project_home/Game/EmberwakeReborn/src/data.js:69), [run.js:1607](D:/Project_home/Game/EmberwakeReborn/src/run.js:1607), [run.js:2016](D:/Project_home/Game/EmberwakeReborn/src/run.js:2016).

BG3에서 가져올 핵심은 **“어떤 행동 자원을 쓰는가”와 “몇 번 사용할 수 있는가”를 별도로 읽게 하는 구조**입니다. 공식 UI 설명도 행동·주문 슬롯·직업 자원별 필터를 구분합니다. 아래 수치와 규칙은 Emberwake용 제안입니다. [Larian 공식 설명](https://baldursgate3.game/news/community-update-15-absolute-frenzy_49)

| 행동 타입 | 정의 | UI | 기존 코드 연결 |
|---|---|---|---|
| 주 행동 `main` | 내 턴 1회. 공격·큰 방어·회복·주요 상호작용 | 기존 주 행동 점 1개. 기본 공격과 카드가 같은 자원을 쓴다는 표시 | [slotReason:1607](D:/Project_home/Game/EmberwakeReborn/src/run.js:1607), [spend:1759](D:/Project_home/Game/EmberwakeReborn/src/run.js:1759) |
| 보조 행동 `bonus` | 내 턴 1회. 이동 보완·준비·작은 방어·소모품 | 기존 보조 점 1개. 사용 가능 카드만 강조 | [act:2647](D:/Project_home/Game/EmberwakeReborn/src/run.js:2647) |
| 반응 `reaction` | **내 턴 시작부터 다음 내 턴 시작까지 1회**. 지정 사건이 발생했을 때 사용 | 반응 점 1개와 발동 조건. 기본은 “사용/넘기기” 확인, 이후 자동 사용 설정 | [hurtHero:588](D:/Project_home/Game/EmberwakeReborn/src/run.js:588), [enemyPhase:1477](D:/Project_home/Game/EmberwakeReborn/src/run.js:1477) |
| 자유 행동 `free` | 주·보조를 쓰지 않는 제한된 편의 행동. 공격·드로우·투지 생성은 원칙적으로 제외 | 소비 점 없이 ‘자유’ 배지. 카드별 횟수 제한과 탐사 시간은 별도 표시 | [preview:1661](D:/Project_home/Game/EmberwakeReborn/src/run.js:1661), [doCard:2035](D:/Project_home/Game/EmberwakeReborn/src/run.js:2035) |

이동력은 지금처럼 독립적으로 유지하십시오. **자유 행동으로 분류해 이동 비용을 없애는 것은 아닙니다.**

반응 카드는 손패에 있을 때만 제안하고, 실제 발동 시 카드와 반응을 소비하는 방식이 단순합니다. 현재 `riposte`는 주 행동을 써서 여러 근접 공격에 반격하는 태세입니다. 이를 반응으로 바꾸면 **한 공격에 대한 방어·반격**으로 다시 설계해야 합니다. 기존 수치를 유지한 채 주 행동 비용만 없애면 큰 상향입니다. 아라의 기본 패시브 반격과 카드 반응도 별도로 표시해야 합니다. 근거: [data.js:120](D:/Project_home/Game/EmberwakeReborn/src/data.js:120), [run.js:610](D:/Project_home/Game/EmberwakeReborn/src/run.js:610).

티어는 다음 형태를 권합니다.

| 선택 | 판정 | 이유·구체안 |
|---|---|---|
| 연구 단계만 티어로 사용 | 부분 동의 | 해금 순서는 설명하지만 전투 중 사용 판단을 만들지는 못합니다. `researchLevel`은 별도 필드로 둡니다. |
| 티어마다 투지 1·2·3 소비 | 비권고 | 기존 특수기와 경쟁하고, 막기·이동·상태 부여에 따른 대원별 획득 차이가 모든 카드 비용으로 번집니다. 근거: [data.js:40](D:/Project_home/Game/EmberwakeReborn/src/data.js:40), [run.js:1519](D:/Project_home/Game/EmberwakeReborn/src/run.js:1519). |
| **T1·T2는 덱 순환, T3만 원정 공용 사용 횟수** | **권고** | T1은 기본 전술, T2는 조건·조합 확장, T3는 전투를 크게 바꾸는 비상수단. 시작 실험값은 **T3 공용 2회/원정**. 카드 두 장을 넣어도 횟수는 공유합니다. |
| 귀환·야영과 연결 | 권고 | 출격 시 전량 충전. 야영은 기존 시간 4·1회 사용을 유지하며 **체력 회복 또는 T3 1회 회복** 중 선택. 무한 충전은 막습니다. 근거: [run.js:2366](D:/Project_home/Game/EmberwakeReborn/src/run.js:2366). |

이렇게 하면 턴 전술은 주·보조·반응, 장기 준비는 T3 횟수가 담당합니다. **T3로 옮기는 카드에 기존 소진까지 자동으로 중복 부과하지 마십시오.** 회복 카드처럼 의도적으로 소진이 필요한 예외는 유지합니다. 공용 횟수를 다 쓴 T3 카드는 손패에 남기보다 해당 원정의 소진 더미로 보내는 정책도 필요합니다.

기존 34장은 우선 행동 분류만 다음처럼 시험할 수 있습니다.

| 분류 초안 | 카드 | 원칙 |
|---|---|---|
| 주 행동 17장 | `strike`, `mend`, `shove`, `spark`, `bulwark`, `shield_bash`, `hook`, `backstab`, `ignite`, `frost`, `detonate`, `venom`, `rune_bolt`, `cleave`, `chain`, `pierce`, `quake` | 직접 공격·강한 방어·회복 비용 유지 |
| 보조 행동 13장 | `guard_up`, `dash`, `focus`, `regroup`, `taunt`, `vault`, `thorns`, `snare`, `fortune`, `sidestep`, `catalyst`, `steady`, `smoke` | 이동·드로우·공격 증폭은 무료화하지 않음 |
| 반응 1장 | `riposte` | 단일 근접 공격에 대한 반응으로 효과 재설계 |
| 자유 행동 3장 | `harvest`, `scout`, `lockpick` | 전투 효율을 직접 올리지 않는 탐사 준비. 탐사 시간·소진은 유지하고 동일 ID 턴당 1회 제한 |

근거: 기본·대원 카드 [data.js:74](D:/Project_home/Game/EmberwakeReborn/src/data.js:74), 연구 카드 [data.js:203](D:/Project_home/Game/EmberwakeReborn/src/data.js:203).

**티어를 기존 `research1→T2`, `research2→T3`로 일괄 치환하면 안 됩니다.** `chain`·`catalyst`는 루미의 반복 조합이고 `lockpick`은 탐사 보조입니다. 연구가 늦다는 이유만으로 원정 제한을 걸면 덱의 목적이 깨집니다. T3 자리는 현재 카드에 억지로 배정하기보다, 강화된 비상 방어·광역 제어처럼 효과를 재설계한 소수 카드부터 채우는 편이 좋습니다.

| 카드 스키마 제안 | 의미 |
|---|---|
| `actionType: 'main' \| 'bonus' \| 'reaction' \| 'free'` | 기존 `slot` 대체 |
| `tier: 1 \| 2 \| 3` | 효과 규모·사용 등급 |
| `researchLevel: 0..3` | 영구 해금 조건. 티어와 독립 |
| `chargeCost: 0 \| 1` | T3 공용 횟수 소비 |
| `gaugeCost: 0` | 기본 카드에는 부과하지 않음. 향후 예외만 명시 |
| `trigger: null \| { event: 'beforeDamage', attackKind: 'melee' }` | 반응 발동 조건 |
| `duration: 'instant' \| 'oneHit' \| 'untilNextTurn' \| 'combat'` | 반격·방어의 지속 범위 명시 |
| `perTurnLimit`, `exploreTime`, `exhaust` | 무료 반복 제한·탐사 시간·카드별 소진을 구분 |

| 수정 위치 | 필요한 작업 |
|---|---|
| [create:29](D:/Project_home/Game/EmberwakeReborn/src/run.js:29), [startCombat:818](D:/Project_home/Game/EmberwakeReborn/src/run.js:818), [beginHeroTurn:1511](D:/Project_home/Game/EmberwakeReborn/src/run.js:1511) | 반응·원정 횟수 초기화와 회복 시점 정의. 방 이동으로 원정 횟수가 복구되지 않게 함 |
| [slotReason:1607](D:/Project_home/Game/EmberwakeReborn/src/run.js:1607), [preview:1661](D:/Project_home/Game/EmberwakeReborn/src/run.js:1661), [spend:1759](D:/Project_home/Game/EmberwakeReborn/src/run.js:1759) | 행동·횟수·투지 비용을 같은 검사와 소비 함수로 처리 |
| [doCard:2016](D:/Project_home/Game/EmberwakeReborn/src/run.js:2016), [applyCardSelf:1941](D:/Project_home/Game/EmberwakeReborn/src/run.js:1941) | 카드 이동·반응 예약·지속 효과 분리 |
| [hurtHero:588](D:/Project_home/Game/EmberwakeReborn/src/run.js:588), [enemyPhase:1477](D:/Project_home/Game/EmberwakeReborn/src/run.js:1477), [act:2590](D:/Project_home/Game/EmberwakeReborn/src/run.js:2590) | `pendingReaction`에서 중단하고 선택 뒤 정확한 공격 위치부터 재개. 엔진 안에 UI 콜백을 넣지 않음 |
| [rest:2366](D:/Project_home/Game/EmberwakeReborn/src/run.js:2366), [save.migrate:26](D:/Project_home/Game/EmberwakeReborn/src/save.js:26) | 야영 회복과 구버전 저장 기본값 처리 |
| [cardHTML:156](D:/Project_home/Game/EmberwakeReborn/src/app.js:156), [HUD:1657](D:/Project_home/Game/EmberwakeReborn/src/app.js:1657) | 카드에 행동 배지·티어·남은 횟수 표시. 사용 불가 이유를 구분 |

반응 도입의 주요 비용은 카드 필드 추가보다 **적 턴 중단·저장·재개**입니다. 이 경계를 먼저 검증해야 합니다.

**D. 적 패턴 다양화 — 권고, 기존 위협 표시·공격 제한 불일치는 차단**

근거: [actEnemy:1211](D:/Project_home/Game/EmberwakeReborn/src/run.js:1211), [actBoss:1335](D:/Project_home/Game/EmberwakeReborn/src/run.js:1335), [TRAITS:694](D:/Project_home/Game/EmberwakeReborn/src/data.js:694).

현재 공격 AI 6종에 `none`까지 포함하면 데이터 enum은 7종입니다. 특성 9종 중 재생·정면 방패·지휘 등은 타격 방식보다 **처치 순서와 접근 방향**을 바꾸는 요소입니다.

철갑병이 약하다는 지적은 타당합니다. 예고 실행 턴에는 고정 3칸만 타격하고 바로 종료합니다. 단독 모의전 40회에서 세 대원 모두 받은 피해가 0이었습니다. 루미는 1회가 턴 제한 내 미종료였고, 이것도 피해를 받은 패배는 아니었습니다. 근거: [heavy:1312](D:/Project_home/Game/EmberwakeReborn/src/run.js:1312), [bot.fight:142](D:/Project_home/Game/EmberwakeReborn/src/bot.js:142).

패턴을 강화하기 전에 아래 두 가지를 고쳐야 합니다.

| 판정 | 근거 | 재현 결과·조치 |
|---|---|---|
| 차단 | [actBoss:1397](D:/Project_home/Game/EmberwakeReborn/src/run.js:1397), [threatTiles:2712](D:/Project_home/Game/EmberwakeReborn/src/run.js:2712), [allThreat:2752](D:/Project_home/Game/EmberwakeReborn/src/run.js:2752) | 보스는 예고 실행 뒤 접근·후려치기를 이어가지만, 위협 표시는 예고 칸만 반환합니다. 예고 밖으로 이동한 영웅이 후속 공격으로 피해 4를 받는 사례를 재현했습니다. **예고 범위와 후속 접근 공격 범위를 함께 표시**해야 합니다. |
| 차단 | [strike:1113](D:/Project_home/Game/EmberwakeReborn/src/run.js:1113), [areaHit:1176](D:/Project_home/Game/EmberwakeReborn/src/run.js:1176), [boss charge:1361](D:/Project_home/Game/EmberwakeReborn/src/run.js:1361) | 최대 2회 제한은 `strike`만 검사합니다. 광역 공격 3개를 겹친 fixture에서 한 적 턴에 3회·피해 21이 들어갔습니다. 광역·돌진·연타의 공격 예산 정책을 통일해야 합니다. 현재 테스트는 사수·일반 근접만 검사합니다. [core.test.cjs:181](D:/Project_home/Game/EmberwakeReborn/tests/core.test.cjs:181) |

추천 패턴은 다음 7개입니다. 목표는 피해를 강제하는 것이 아니라 **피하려면 이동·행동·방어 중 무엇인가를 투자하게 하는 것**입니다.

| 이름·대상 | 예고 방식 | 대응 수단 | 구현 위치 |
|---|---|---|---|
| **접근 견제 + 깊은 내려찍기 — `brute`** | 접근 공격 가능 범위와 약한 타격을 상시 표시. 인접 시 약타 3 후 전방 깊이 2×폭 3의 강타 예고. 실행 턴에는 강타만 | 사전 방어로 약타 차단, 측후방 이동, 밀치기·속박으로 예고 취소. 강타 후 빈틈 제공 | [heavy:1312](D:/Project_home/Game/EmberwakeReborn/src/run.js:1312), [strike:1113](D:/Project_home/Game/EmberwakeReborn/src/run.js:1113) |
| **제한 추적 내려찍기 — `sentry`** | ‘대상 추적·회전 최대 90도·사거리 2’ 표시. 플레이어 이동마다 실제 판정 범위 갱신 | 등 뒤로 돌기, 사거리 이탈, 밀치기·속박. 턴 종료 후 몰래 추가 회전 금지 | [heavy:1321](D:/Project_home/Game/EmberwakeReborn/src/run.js:1321), [threatTiles:2712](D:/Project_home/Game/EmberwakeReborn/src/run.js:2712) |
| **방패 밀어붙이기 — `shieldman`** | 직선 타격과 영웅이 밀릴 도착 칸·지형 피해까지 예고 | 측면 이동, 완전 방어 시 밀림 취소, 적을 먼저 밀어 선 끊기 | [melee:1237](D:/Project_home/Game/EmberwakeReborn/src/run.js:1237), [hurtHero:588](D:/Project_home/Game/EmberwakeReborn/src/run.js:588). 영웅 밀림 처리 추가 |
| **잔류 화염 투척 — `slinger`** | 다음 턴 폭발 범위와 이후 2턴 남는 불길을 다른 무늬로 표시 | 폭발 전 이탈, 우회, 시전 전 조준 취소. 불길이 유일한 통로를 완전히 막는 배치는 제한 | [ranged:1242](D:/Project_home/Game/EmberwakeReborn/src/run.js:1242), [enemyPhase:1477](D:/Project_home/Game/EmberwakeReborn/src/run.js:1477) |
| **감시 사격 — `archer`·`hexer`** | 고정 사격선을 켜고 “이 선을 통과하면 1회 발사” 표시 | 엄폐·밀 상자, 다른 길, 근접으로 제압, 방어·연막을 준비하고 통과 | [doMove:1778](D:/Project_home/Game/EmberwakeReborn/src/run.js:1778), [strike:1113](D:/Project_home/Game/EmberwakeReborn/src/run.js:1113). 이동 확정 전 경고 필요 |
| **두 박자 도약 — `alpha`·`hound`** | 첫 도약과 후속 공격을 서로 다른 **적 턴**으로 나눠 순서 표시 | 첫 공격 회피 후 다음 내 턴에 재배치·제어·방어. 한 번 옆으로 간 뒤 계속 정지하는 대응은 어려워짐 | [pack:1237](D:/Project_home/Game/EmberwakeReborn/src/run.js:1237), 기존 [enrage:491](D:/Project_home/Game/EmberwakeReborn/src/run.js:491)와 결합 |
| **예고된 포위 소환 — `nest`·`hierophant`** | 소환까지 남은 턴과 출현 후보 칸을 표시. 점유 시 대체 칸도 공개 | 둥지 우선 처치·기절, 출현 칸 선점, 안전 통로로 이동. 입구 전체 봉쇄 금지 | [spawner:1225](D:/Project_home/Game/EmberwakeReborn/src/run.js:1225), [boss summon:1372](D:/Project_home/Game/EmberwakeReborn/src/run.js:1372) |

**철갑병에는 첫 번째만 먼저 적용하십시오.** 추적·범위 확대·밀치기·2연타를 한 번에 넣으면 어떤 요소가 효과적이었는지 알 수 없습니다. 기존 벽 충돌 시 장갑 파괴·기절 약점은 유지하는 편이 좋습니다. 근거: [shoveEnemy:743](D:/Project_home/Game/EmberwakeReborn/src/run.js:743).

각 패턴은 기본 이동·기본 방어로 대응 가능한 상황을 포함해야 합니다. 손패에 특정 카드가 있어야만 살 수 있는 설계를 기본값으로 삼으면 12장 덱의 무작위성이 불공정하게 느껴집니다. 새 패턴에도 실제 판정과 같은 범위를 사용하는 `threatTiles`·`intentText`를 함께 구현해야 합니다.

**E. 플레이 테스트 준비 체크리스트 — 차단: 배포·관찰 최소 장치 보완 필요**

근거: [app.js:1346](D:/Project_home/Game/EmberwakeReborn/src/app.js:1346), [app.js:1213](D:/Project_home/Game/EmberwakeReborn/src/app.js:1213), [WORKLOG.md:156](D:/Project_home/Game/EmberwakeReborn/docs/WORKLOG.md:156).

저장 내보내기·가져오기·백업과 시작 안내는 **이미 있습니다.** 빠진 부분을 구분해야 합니다. 비용은 상대적인 구현·검증 비용입니다.

| 항목 | 판정·현재 상태 | 값어치 | 비용 |
|---|---|---|---|
| **버그 신고 경로 + 진단 묶음** | 필수. 저장 JSON은 있으나 버전·최근 행동열·오류를 묶는 신고 흐름은 없음 | 재현에 필요한 왕복 질문 감소. 커밋·콘텐츠 해시·시드·최근 행동·저장을 한 번에 복사 | 중 |
| **실패 직전 기록 보존** | 필수. 로그는 80줄 제한이고 정산 뒤 `state.run=null` | 사망·귀환 후 신고해도 원인을 분석 가능 | 소~중. [run.js:199](D:/Project_home/Game/EmberwakeReborn/src/run.js:199), [guild.js:755](D:/Project_home/Game/EmberwakeReborn/src/guild.js:755) |
| **실제 배포물의 저장·재개 점검** | 필수. 직전 리뷰에도 비동기 저장 시나리오는 미완료로 남음 | 진행 손실은 밸런스 피드백 자체를 끊음. 새 브라우저·전투 중 새로고침·가져오기·충돌 확인 | 중. [반영표:188](D:/Project_home/Game/EmberwakeReborn/docs/codex-requests/2026-09-18-cleanup-review.md:188) |
| **첫 10분 단계 안내** | 권고. 도입 설명·첫 목표는 있음. 조작 성공을 따라가는 안내는 부족 | 이동→공격→보조→턴 종료→귀환→공방 복구를 실제 행동으로 학습 | 중. [app.js:1213](D:/Project_home/Game/EmberwakeReborn/src/app.js:1213) |
| **후반 테스트용 시작 기록·과제** | 필수에 가까움. 새 게임만 주면 대부분 서고에 도달하지 못할 가능성 | 신규 경험과 후반 전투를 따로 평가. 지역별 적정 장비·덱 저장과 짧은 과제 제공 | 소 |
| **화면 조작 확인** | 필수. 폭발통·상자·일부 마을 편집 조작은 문서상 직접 검증 미완료 | 엔진 통과와 실제 클릭 가능 여부를 연결. 좁은 화면도 포함 | 소~중. [WORKLOG.md:157](D:/Project_home/Game/EmberwakeReborn/docs/WORKLOG.md:157), [WORKLOG.md:166](D:/Project_home/Game/EmberwakeReborn/docs/WORKLOG.md:166) |
| 난이도 선택 | 후순위 권고. 현재 설정에는 없음 | 장기적으로 유용하지만 지금 추가하면 난이도 문제의 원인 구분이 어려움. 우선 고정 조건과 별도 보조 모드 실험 | 중. [app.js:1455](D:/Project_home/Game/EmberwakeReborn/src/app.js:1455) |
| 이름 있는 세이브 슬롯 | 후순위 권고. 현재 진행 1개와 백업 존재 | 여러 빌드 비교에 편리. 초기 소수 테스트는 내보내기·가져오기로 대체 가능 | 중. [save.js:112](D:/Project_home/Game/EmberwakeReborn/src/save.js:112) |

특히 문서는 정리해야 합니다. WORKLOG 후반에 “가구 배치 없음”, “새 생성 이미지 없음” 같은 앞부분 업데이트와 충돌하는 설명이 남아 있습니다. 테스터에게 줄 안내는 현재 빌드의 기능·알려진 문제만 따로 짧게 고정하는 편이 좋습니다. 근거: [WORKLOG.md:170](D:/Project_home/Game/EmberwakeReborn/docs/WORKLOG.md:170).

**F. 커밋 가능 여부 — 동의: 개발 비교 기준 / 차단: 외부 배포 승인 기준**

근거: [직전 리뷰 반영표:174](D:/Project_home/Game/EmberwakeReborn/docs/codex-requests/2026-09-18-cleanup-review.md:174), [core.test.cjs:1598](D:/Project_home/Game/EmberwakeReborn/tests/core.test.cjs:1598), [run.js:2712](D:/Project_home/Game/EmberwakeReborn/src/run.js:2712).

`2caa2f7`은 **2라운드 전후를 비교할 개발 기준점으로 보존해도 됩니다.** 직전 정리의 관련 회귀 테스트가 통과하고, 이번 실행에서 예외·교착도 발생하지 않았습니다.

다만 **“캠페인 완주 검증 완료·외부 플레이 준비 완료”라는 표시는 차단**합니다. 완주 보고가 재현되지 않고, 보스 위협 표시 누락과 공격 횟수 제한의 실제 불일치가 있습니다. 이번 검토에서도 브라우저를 통한 신규 플레이·배포물 저장 QA는 수행하지 않았습니다.

**2라운드 권장 순서**

1. `2caa2f7`과 이번 출력값을 보존하고, 기존 2/4 완주 기록의 실행 조건을 맞춘다.
2. 캠페인 검사를 장치·성소·격파·생환으로 나누고, 보스 격파 assertion과 복원 후 진행 검사를 추가한다.
3. 봇의 장착·특수기·보급품·귀환 판단을 보완하고, 정상 행동 API 밖의 상태 변경을 제거한다.
4. 보스 후속 위협 표시와 광역·돌진의 공격 예산을 먼저 통일한다.
5. 철갑병에 약한 접근 타격+고정 강타만 적용해 단독·혼합전에서 비교한다.
6. 행동 4종과 반응 중단·재개를 구현한 뒤, 소수 T3 카드로 원정 횟수·야영 회복을 시험한다.
7. 진단 내보내기·배포물 저장 QA·신규/후반 테스트 과제를 준비하고 실제 사람의 첫 10분을 관찰한다.
## 반영표 (2026-09-18, 2라운드)

| 항목 | 판정 | 반영 |
|---|---|---|
| A 캠페인 봇 검증의 신뢰도 | 권고 | 봇이 장비를 모든 대원에게 끼우고, 행상에서 재료를 사고, 귀환 균열을 쓰고, 추적자 대치가 60라운드면 포기. 교착 덤프에 적·불길·손패·기록 포함. 4회×100원정 예외 0, 1회 완주. 캠페인 검사 분리(장치·성소·격파·생환)는 미반영 |
| B 귀환 규칙(기회 공격) | 동의 | 유지. 귀환 확인 창에 기회 공격 피해·현재 체력 표시 |
| C 행동 타입·티어 | 권고(안 채택) | 주/보조/반응/자유 4종, 티어 1~3 자동 배정, T3 카드만 원정당 공용 충전 2 + 야영 충전. 반응 중단·재개는 "1회 발동 후 사라짐"으로 단순화 |
| D 적 패턴 | 권고 | 철갑병 약타+깊은 내려찍기(1라운드에 반영), 사냥개 도약(추적 1칸), 방패 파수병 밀치기·찧기, 잿불 투척병 잔류 불길. 사수 감시선·둥지/사제 예고 소환은 미반영 |
| D 공격 예산·보스 위협 표시 | 차단 | 광역·돌진이 예산을 쓰고, 수호자 예고 칸+접근 범위를 함께 표시(1라운드 직후 반영) |
| E 플레이 테스트 준비물 | 권고 | 진단 정보 복사(버전·커밋·콘텐츠 해시·시드·최근 행동·저장), 빌드 정보 파일, 지난 원정 기록 유지, 첫 전투 안내 창, 후반 시험 저장 생성기, README 테스터 안내. 난이도 선택·세이브 슬롯은 미반영 |
| E 문서 모순 | 권고 | WORKLOG "남은 결함·위험"·"에셋 현황"의 옛 서술 수정 |
| F 날짜 우회(빈 원정) | 차단 | `RULES.dayMinTime`(1라운드 직후 반영) |
| 발견한 버그 | — | 귀환 균열이 문 앞 칸을 막아 봇이 방을 못 나감 → `freeNear(..., {keepDoors})` |
