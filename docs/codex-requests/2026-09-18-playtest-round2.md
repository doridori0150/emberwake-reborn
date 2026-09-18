# 플레이 테스트 준비 2라운드 리뷰 (Codex Astra, 2026-09-18)

대상: main 95618b9. 요청문은 아래 '요청', 답변은 '판정', 반영 결과는 맨 아래 '반영표'.

## 요청

# 플레이 테스트 준비 2라운드 리뷰 요청 (Emberwake Reborn, main 95618b9)

## 읽을 파일
- 1라운드 요청·답변·반영표: `docs/codex-requests/2026-09-18-playtest-round1.md` (맨 아래 '반영표'가 이번에 무엇을 했는지 표로 정리)
- 이번 변경: `git log -2 --stat`, `git show 7d3c35e` (한 커밋에 다 들어 있다)
- 규칙: `src/run.js` (`slotReason`/`costText`/`spend`, `hurtHero` 앞단의 반응, `actEnemy` 의 `lunge`/`shield`/`firepot`, `igniteTiles`/`fireTick`, `freeNear`), `src/data.js` (`ACTION_TYPES`, `RULES.charges/fire/shop.buy*`, 카드 `slot/tier/charge`, `AI_TYPES`, 사냥개·투척병), `src/content.js` (방패 파수병 `ai: shield`), `src/guild.js` (`market/buyMat`, 정산의 `seed/log`)
- 화면: `src/app.js` (`slotName`/`cardHTML`, HUD 반응·충전, `diagBundle/copyDiag`, `openMarket`, `confirmExtract`, 첫 전투 안내), `src/render.js` (불길, 의도 배지), `styles.css`
- 봇·검증: `tools/campaign.cjs`, `tools/sim.cjs`, `tools/make-save.cjs`, `tests/core.test.cjs` (마지막 4개 테스트), `docs/WORKLOG.md` 11차
- 읽기 전용입니다. 아무 파일도 고치지 마세요. `node --test tests/core.test.cjs`, `node tools/campaign.cjs 2 60`, `node tools/smart-bot.cjs 40` 은 실행해도 됩니다.

## 배경
1라운드 권장 순서 중 4(공격 예산·위협 표시), 5(철갑병 약타+강타), 6(행동 4종·T3 충전), 7의 일부(진단 내보내기·후반 저장·첫 전투 안내)를 했고, 적 패턴 3종과 금화 소비처(행상)를 더했다. 봇 결과: 캠페인 4회×100원정 예외 0, 1회 완주(42원정·패배 0), 3회는 3지역 성소 미도달. smart-bot 장면별 승률은 1라운드와 같다.

소유자 요청 두 가지(발더스 3식 행동 타입·티어, 적 패턴 다양화)를 이번에 넣었으니 **설계가 게임 루프와 맞는지**와 **테스터에게 줄 수 있는 상태인지**를 봐 달라.

## 항목별 요청 (판정: 차단 / 권고 / 동의 + 근거 `파일:줄`)
A. **행동 타입·티어 구현**: (1) 반응이 `hurtHero` 앞단에서 방어·되치기를 "그 공격 1회"에만 적용하는 방식이 옳은가 — 원거리·광역·기회 공격·추적자 돌진과의 상호작용에서 빠진 경우나 악용(예: 반응을 걸어 두고 귀환해 기회 공격을 무력화)이 있는가. (2) 자유 행동을 전투 중 턴당 1회로만 제한한 것이 무료 행동 남용을 막는가(탐사 중에는 시간 비용). (3) T3 공용 충전 2 + 야영 충전이 "지금 쓸까 아낄까"를 실제로 만드는지, 아니면 연막·지면 강타만으로는 체감이 없는지. 티어를 연구 단계로 자동 배정한 것의 문제. (4) 화면·미리보기에서 사용 불가 사유가 빠지는 경로.
B. **적 패턴 3종**: 도약(1칸 비키면 따라 물림·2칸이면 헛물), 방패병(예고 없는 약타 밀치기·찧기), 투척병(잔류 불길)이 각각 "항상 대응법이 하나는 있다"를 지키는가. 불길 규칙(영웅은 목적지일 때만 밟기, 적은 회피, 전투 종료·방 이동 시 소멸, 방패병이 불길로 밀어 넣기)의 구멍. 공격 예산(`maxAttacksPerPhase 2`, 원거리 1)과 새 패턴의 합이 한 턴에 낼 수 있는 최대 피해가 너무 큰 조합(예: 방패병 2 + 투척병 + 사냥개)을 스폰 표(`content.js spawns`)에서 찾아 달라.
C. **경제**: 행상(기준가 3배, 하루 3종×2개)이 금화 4,000 누적 문제를 실제로 줄이는가, 아니면 후반에 재료 병목을 없애 진행을 너무 쉽게 하는가. 캠페인 봇 로그로 판단 가능하면 수치를 달라.
D. **봇·검증의 신뢰도**: 캠페인 봇의 새 행동(장비 전원 장착, 행상 구매, 귀환 균열, 추적자 대치 포기)이 사람의 행동과 어긋나 문제를 가리는 곳. 1회 완주·3회 미도달의 원인이 시간 제한인지 봇의 판단인지 구분해 달라(예: `node tools/campaign.cjs 1 100 verbose` 의 서고 원정 결과 분포).
E. **플레이 테스트 준비 상태**: 진단 번들(`diagBundle`)에 빠진 정보, 개인정보로 볼 만한 것(UA·저장 전체), 첫 전투 안내의 정확성, README 테스터 안내의 누락. **"외부 테스터 5명에게 지금 줘도 되는가"** 를 한 줄로.
F. **커밋 가능 여부**: 95618b9 를 테스트 배포 기준점으로 삼아도 되는가. 차단 항목이 있으면 3라운드에서 고칠 순서 5줄 이내.

## 출력 형식
- A~F 순서. 각 항목: 판정 → 근거(`파일:줄`) → 설명. B 는 표로.
- 마지막에 "3라운드 할 일" 5~8줄(차단 먼저).


## 판정 (Codex 답변 원문)

**`95618b9`은 개발 비교 기준점으로 보존해도 되지만, 외부 테스트 배포 승인은 보류합니다.** 반응 방어 잔량, 도약 안전거리, 투척병 처리, 행상 날짜 제한에서 재현 가능한 결함을 찾았습니다.

파일은 수정하지 않았습니다. 최초 실행에서 **51/51 테스트 통과**, 캠페인 `2 60`은 **60회 미완주·42회 완주**, 추가 계측은 **시드 0~3, 최대 100원정**으로 진행했습니다. 검토 도중 외부에서 추가된 테스트 1개는 이번 기준점 판정에서 제외했습니다.

**A. 행동 타입·티어 구현 — 차단: 반응의 ‘공격 1회 한정’이 지켜지지 않습니다.**

- **차단 — 반응 방어가 다음 공격까지 남습니다.** 근거: [src/run.js:593](D:/Project_home/Game/EmberwakeReborn/src/run.js:593), [src/run.js:641](D:/Project_home/Game/EmberwakeReborn/src/run.js:641). 반응 방어를 일반 `block`에 더하고, 공격 후에는 반격 값만 복원합니다. 피해 3인 적 둘을 상대로 반응 방어 4를 걸면, 첫 공격을 막고 남은 1이 두 번째 공격도 막습니다. **예상 HP 손실 3, 실제 2**를 재현했습니다. 기존 방어와 반응 전용 방어를 분리하고 반응 잔량을 버려야 합니다. 현재 테스트는 적 하나만 사용하여 이를 놓칩니다. [tests/core.test.cjs:1610](D:/Project_home/Game/EmberwakeReborn/tests/core.test.cjs:1610)

- **동의·명세 보완 — 귀환 기회 공격과 돌진에도 발동하는 것은 합리적입니다.** 근거: [src/run.js:2645](D:/Project_home/Game/EmberwakeReborn/src/run.js:2645), [src/run.js:1556](D:/Project_home/Game/EmberwakeReborn/src/run.js:1556), [src/run.js:1214](D:/Project_home/Game/EmberwakeReborn/src/run.js:1214). 기회 공격·돌진은 `melee:true`, 원거리·광역은 아닙니다. 따라서 반응을 준비해 귀환 피해를 줄이는 것은 카드와 원정 종료를 대가로 한 정상적인 선택으로 볼 수 있습니다. 다만 **철갑병의 내려찍기도 광역이라 반응하지 않습니다.** ‘근접 공격’의 범위를 설명하고, 첫 안내의 ‘적 턴에 발동’을 ‘다음 근접 공격에 발동’으로 맞추세요. 방어 잔량 누출 때문에 여러 기회 공격까지 보호하는 부분은 결함입니다.

- **동의·권고 — 자유 행동 제한은 현재 카드 구성에 충분합니다.** 근거: [src/run.js:1804](D:/Project_home/Game/EmberwakeReborn/src/run.js:1804), [src/run.js:1969](D:/Project_home/Game/EmberwakeReborn/src/run.js:1969). 정확히는 **자유 행동 전체 1회가 아니라 같은 카드 ID당 1회**입니다. 탐사에서는 시간·카드를 소비하며 채집 보너스도 누적 대신 덮어씁니다. 다만 `freeUsed`는 다음 영웅 턴에서만 초기화하고 전투 시작·종료에서는 지우지 않아, 전투 마지막 턴의 사용 기록이 다음 전투 첫 턴에 남을 수 있습니다. [src/run.js:837](D:/Project_home/Game/EmberwakeReborn/src/run.js:837), [src/run.js:1718](D:/Project_home/Game/EmberwakeReborn/src/run.js:1718)

- **권고 — 충전 구조는 루프에 맞지만, 절약 판단은 아직 검증되지 않았습니다.** 근거: [src/data.js:1476](D:/Project_home/Game/EmberwakeReborn/src/data.js:1476), [src/run.js:2599](D:/Project_home/Game/EmberwakeReborn/src/run.js:2599). 공용 충전과 체력 회복을 포기하는 야영 선택은 유효합니다. 그러나 네 캠페인에서 **연막 사용 0회·야영 충전 0회**, 지면 강타만 **51/6/47/56회** 사용했습니다. 이 봇으로 두 카드 사이의 자원 경쟁을 평가할 수 없습니다. T3 7종 중 충전 카드는 2종이므로, T3는 **연구 단계**, 충전은 **별도 사용 자원**이라고 명확히 표시하는 편이 좋습니다.

- **권고 — 실행 검증은 있으나 사용 불가 사유가 화면에서 빠집니다.** 근거: [src/app.js:1944](D:/Project_home/Game/EmberwakeReborn/src/app.js:1944), [src/app.js:2174](D:/Project_home/Game/EmberwakeReborn/src/app.js:2174), [src/app.js:2608](D:/Project_home/Game/EmberwakeReborn/src/app.js:2608). 충전·행동 부족은 선택 시 토스트로 나오지만, 손패 툴팁에는 이유가 없습니다. 대상 미리보기는 `p.ok === false`일 때 `reason`을 버립니다. 키보드 대상 선택도 상태이상 조건·시야 문제를 모두 ‘사거리 안에 대상이 없다’로 뭉칩니다.

**B. 적 패턴 3종 — 차단: 예고와 실제 대응 결과가 일치하지 않는 경우가 있습니다.**

피해 수치는 방어·회피·중독 감소를 적용하기 전입니다.

| 대상 | 판정 → 근거 | 설명 |
|---|---|---|
| 도약 | **차단** → [run.js:1407](D:/Project_home/Game/EmberwakeReborn/src/run.js:1407), [run.js:2955](D:/Project_home/Game/EmberwakeReborn/src/run.js:2955) | 가운데 착지 칸이 막히면 십자 안에서 영웅과 가까운 칸으로 착지를 바꿉니다. **기존 위치 `(3,4)`에서 `(3,2)`로 두 칸 피하고, 가운데에 불길이 있는 상태에서 예고 밖 피해 3**을 재현했습니다. 표시 범위는 원래 십자뿐입니다. 착지 후보별 공격 범위까지 표시하거나 공격을 예고 범위 안으로 제한해야 합니다. 한 칸 이동도 현재는 십자 안이라 기본 피해가 아닌 `+1` 공격을 받습니다. |
| 투척병 | **차단** → [run.js:1477](D:/Project_home/Game/EmberwakeReborn/src/run.js:1477), [data.js:600](D:/Project_home/Game/EmberwakeReborn/src/data.js:600) | 조준 실행 시 `can()`을 다시 검사하지 않습니다. **기둥 뒤로 이동하여 LOS가 끊겼는데도 피해 5**를 받았습니다. ‘시야를 끊어 조준 해제’ 설명과 다릅니다. 또 총 공격 예산이 찼어도 `areaHit` 이후 불길을 생성합니다. **앞선 공격 2회 뒤, 미뤄졌다고 표시된 투척에서 불길 5칸 생성**을 재현했습니다. |
| 방패병 | **권고** → [run.js:1442](D:/Project_home/Game/EmberwakeReborn/src/run.js:1442), [run.js:2875](D:/Project_home/Game/EmberwakeReborn/src/run.js:2875) | 거리 벌리기·제어·방어라는 대응은 있습니다. 그러나 피해를 전부 막아도 밀리고, 반격으로 방패병을 죽여도 밀치기가 계속됩니다. 방어는 밀치기 저항이 아닙니다. 벽 충돌과 뒤쪽 위험 지형까지 표시해야 ‘방어하면 안전하다’는 오해를 줄일 수 있습니다. |
| 불길 공통 규칙 | **권고** → [run.js:773](D:/Project_home/Game/EmberwakeReborn/src/run.js:773), [run.js:1461](D:/Project_home/Game/EmberwakeReborn/src/run.js:1461), [run.js:2202](D:/Project_home/Game/EmberwakeReborn/src/run.js:2202) | 일반 이동의 목적지 제한·적 경로 회피·전투 종료/방 이탈 소멸은 구현돼 있습니다. 하지만 **적을 불길로 밀어도 불 피해가 없고, 영웅 도약 착지도 불 피해를 건너뜁니다.** 영웅 일반 이동은 지형+불 피해를 모두 받지만 방패 밀치기는 `else if`여서 지형 피해만 받습니다. 지속 피해가 없는 ‘진입 피해’라면 그대로 명시하고, 진입 방식별 판정을 통일하세요. |
| 불길·균열 배치와 표시 | **권고** → [run.js:401](D:/Project_home/Game/EmberwakeReborn/src/run.js:401), [render.js:395](D:/Project_home/Game/EmberwakeReborn/src/render.js:395), [app.js:2242](D:/Project_home/Game/EmberwakeReborn/src/app.js:2242) | `keepDoors`의 문 앞 보호는 좋습니다. 다만 `freeNear`는 불길을 제외하지 않아 증원·균열 등이 불 위에 배치될 수 있습니다. 화면에는 불길 그림이 있지만 남은 턴·피해 툴팁이 없습니다. 이동 미리보기의 불 피해 문구도 해당 화면 경로에서는 표시되지 않습니다. |
| 방패병 혼합 스폰 | **권고** → [content.js:26](D:/Project_home/Game/EmberwakeReborn/src/content.js:26), [content.js:275](D:/Project_home/Game/EmberwakeReborn/src/content.js:275), [run.js:942](D:/Project_home/Game/EmberwakeReborn/src/run.js:942) | 일반 표에는 방패병+투척병, 수제 **방패 전열에는 방패병 2+투척병**이 있습니다. 술렁임의 추가 적으로 사냥개가 붙으면 요청한 4체 조합이 실제 가능합니다. 붉은달에서 **밀치기 3+분출구 4+투척 6=13**까지 가능한 조합입니다. 공격 횟수 2는 총 피해나 지형 추가 피해의 상한이 아닙니다. |
| 더 큰 피해 조합 | **권고** → [data.js:935](D:/Project_home/Game/EmberwakeReborn/src/data.js:935), [data.js:1019](D:/Project_home/Game/EmberwakeReborn/src/data.js:1019), [run.js:1372](D:/Project_home/Game/EmberwakeReborn/src/run.js:1372) | 기존 표의 용광로 **철갑병+용광로 파수병**은 강타 중첩 시 **17, 붉은달 19**입니다. 서고 **철갑병 2**는 **18/20**입니다. 후자는 기본 루미 HP 24의 83%입니다. 예고 회피가 가능하므로 수치만으로 차단하지 않지만, 좁은 지형·불길과 함께 우선 시험해야 합니다. |

**C. 경제 — 차단: 하루 제한을 우회할 수 있습니다. 금화 소비 효과는 권고 수준입니다.**

근거: [src/run.js:2833](D:/Project_home/Game/EmberwakeReborn/src/run.js:2833), [src/guild.js:773](D:/Project_home/Game/EmberwakeReborn/src/guild.js:773), [src/guild.js:791](D:/Project_home/Game/EmberwakeReborn/src/guild.js:791).

**출발 → 시간 0에 원정 포기 → 정산**으로 하루가 넘어갑니다. 빈 가방이면 길드 금화·재료 손실 없이 행상 품목과 수량이 갱신됩니다. 실제로 3회 반복하여 날짜가 2→3→4일로 바뀌고 보유 금화는 유지됐습니다. 설정의 원정 포기로 접근 가능한 경로입니다. `dayMinTime`이 즉시 귀환은 막았지만 즉시 포기는 막지 못했습니다.

현재 봇의 실제 소비는 다음과 같습니다.

| 시드 | 진행 원정 수 | 행상 구매 수량 | 행상 총지출 | 최종 금화 |
|---|---:|---:|---:|---:|
| 0 | 100 | 33 | 726 | 17,786 |
| 1 | 42·완주 | 12 | 228 | 6,461 |
| 2 | 100 | 27 | 582 | 17,031 |
| 3 | 100 | 22 | 360 | 16,766 |

근거: 구매 정책 [tools/campaign.cjs:53](D:/Project_home/Game/EmberwakeReborn/tools/campaign.cjs:53), 품목 규칙 [src/guild.js:465](D:/Project_home/Game/EmberwakeReborn/src/guild.js:465).

행상은 **초중반 부족 재료를 메우지만 후반 금화 누적은 해결하지 못합니다.** 마지막 구매도 각각 30/14/30/20일째입니다. 다만 봇은 특정 투자 목표만 보므로 이를 사람의 최대 구매량으로 해석하면 안 됩니다.

열린 지역 재료만 팔고 유물·두루마리·달빛 결정을 제외하는 방향은 타당합니다. 정상적인 하루 제한 아래에서 진행이 지나치게 쉬워졌다는 증거는 없습니다. 먼저 즉시 포기 우회를 막고, 그다음 구매 전후 투자 시점과 반복 소비처를 평가하세요.

**D. 봇·검증 신뢰도 — 차단: 미완주를 ‘시간 제한 때문’이라고 판정할 수 없습니다.**

근거: [tools/campaign.cjs:87](D:/Project_home/Game/EmberwakeReborn/tools/campaign.cjs:87), [tools/sim.cjs:239](D:/Project_home/Game/EmberwakeReborn/tools/sim.cjs:239), [tools/sim.cjs:294](D:/Project_home/Game/EmberwakeReborn/tools/sim.cjs:294).

파일 수정 없이 출발·정산을 메모리에서 계측했습니다.

| 시드 | 서고 원정 | 실제 보스 목표 | 성소 방문 | 보스 목표 원정 결과 |
|---|---:|---:|---:|---|
| 0 | 40 | 1 | 0 | 88/118, 장치 1/2에서 사망 |
| 1 | 11 | 1 | 1 | 보스 목표는 103/118, HP 13/34로 귀환. **완주는 별도의 채집 목표 원정**에서 발생 |
| 2 | 38 | 1 | 0 | 94/118, HP 7/34로 귀환 |
| 3 | 48 | 0 | 0 | 전부 채집 목표 |

**소진에 따른 지역 교대와 전체 원정 번호의 홀짝이 맞물려 서고 보스 도전이 거의 사라집니다.** 채집 목표는 시간 50%에서 철수하며, 보스 목표도 성소를 마지막으로 미룹니다. 시드 0의 서고 결과는 **38회 귀환·2회 패배, 39회 채집 목표**입니다. 이 분포를 시간 부족의 증거로 사용할 수 없습니다.

추가 신뢰도 문제는 다음과 같습니다.

- **장비 전원 장착은 개선에 동의하지만 성공 여부를 확인해야 합니다.** 장신구 칸이 차면 `equip`이 실패하는데 봇은 반환값을 무시합니다. 제작 개수도 여전히 출격 준비 기준입니다. [campaign.cjs:48](D:/Project_home/Game/EmberwakeReborn/tools/campaign.cjs:48), [guild.js:606](D:/Project_home/Game/EmberwakeReborn/src/guild.js:606)
- **반응 변경을 전투 봇이 따라가지 못했습니다.** 반격 태세를 쓰면 기존 주 행동 카드처럼 공격 계획을 버립니다. 무료로 남은 주 행동을 활용하지 못하거나 이미 걸린 반응을 다시 시도합니다. [bot.js:89](D:/Project_home/Game/EmberwakeReborn/src/bot.js:89), [bot.js:133](D:/Project_home/Game/EmberwakeReborn/src/bot.js:133)
- **추적자 대치 포기는 교착 해결 검증이 아닙니다.** 60턴 묶음 전투 전후의 HP 차이로 활동을 판단하므로 정확한 ‘60턴 무피해 교환’ 계측도 아닙니다. 포기를 일반 패배와 분리해야 합니다. [sim.cjs:123](D:/Project_home/Game/EmberwakeReborn/tools/sim.cjs:123)
- **귀환 균열 사용은 적절합니다.** 다만 시드 1의 완주는 수호자 격파·생환이며 목표물은 회수하지 않았습니다. 완주 정의를 구분하세요. 미탐색 지도 열람·적 상태 직접 변경·복원 상태로 이어가지 않는 저장 검사는 여전히 남습니다. [sim.cjs:34](D:/Project_home/Game/EmberwakeReborn/tools/sim.cjs:34), [sim.cjs:291](D:/Project_home/Game/EmberwakeReborn/tools/sim.cjs:291), [campaign.cjs:136](D:/Project_home/Game/EmberwakeReborn/tools/campaign.cjs:136)
- **51개 통과의 범위도 제한적입니다.** 캠페인 테스트는 수호자 격파를 assert하지 않으며, smart-bot 장면에는 방패병·투척병 혼합전이 없습니다. 이번 사제 승률은 아라 **100%**, 노아 **43%**, 루미 **70%**였습니다. [core.test.cjs:1601](D:/Project_home/Game/EmberwakeReborn/tests/core.test.cjs:1601), [smart-bot.cjs:8](D:/Project_home/Game/EmberwakeReborn/tools/smart-bot.cjs:8)

**E. 플레이 테스트 준비 — 차단: 배포 전 규칙 수정과 짧은 브라우저 검증이 필요합니다.**

근거: [src/app.js:1597](D:/Project_home/Game/EmberwakeReborn/src/app.js:1597), [README.md:70](D:/Project_home/Game/EmberwakeReborn/README.md:70), [docs/WORKLOG.md:179](D:/Project_home/Game/EmberwakeReborn/docs/WORKLOG.md:179).

진단 번들의 방향은 좋지만 다음을 보완해야 합니다.

- **재현 정보:** 행동별 원정 ID·시드, 예외 메시지·스택, 저장 성공/실패와 저장 방식, 길드 구매·장착·가져오기 기록이 빠져 있습니다. 행동 기록은 새로고침하면 사라지고 여러 원정이 섞일 수 있습니다. `RUN.act`가 예외를 던지면 해당 행동도 기록되지 않습니다. 저장 전체는 현재 상태 복구에 유용하지만 직전 문제 행동 재현을 보장하지 않습니다. [app.js:1577](D:/Project_home/Game/EmberwakeReborn/src/app.js:1577), [app.js:1644](D:/Project_home/Game/EmberwakeReborn/src/app.js:1644)
- **공유 범위:** UA·화면 크기·시각은 환경 식별 단서이고, 저장 전체에는 진행 이력이 포함됩니다. 복사 버튼은 자동 전송하지 않습니다. 법적 분류와 별개로, 복사 전에 포함 항목을 알리고 공개 제보용 요약과 전체 저장 첨부를 분리하는 편이 좋습니다.
- **빌드 식별:** 현재 진단의 커밋은 `95618b9`이 아니라 `7d3c35e`입니다. 코드 커밋과 빌드 정보 커밋의 관계를 배포 기록에 남기세요. [build-info.js:4](D:/Project_home/Game/EmberwakeReborn/src/build-info.js:4)
- **첫 전투 안내:** 기본 행동 설명은 적절합니다. 충전은 카드별 2회가 아닌 **공용 2점**, 야영은 **체력 회복 대신 +1**, 반응은 **기회 공격에도 발동**한다고 고쳐야 합니다. 도약·방패병 예외도 B 수정과 맞춰야 합니다. [app.js:1670](D:/Project_home/Game/EmberwakeReborn/src/app.js:1670)
- **테스터 안내:** 실제 제보 제출처, 첫 세션 과제·종료 기준, 기대/실제 결과 작성 예시가 없습니다. 후반 저장은 생성 명령만 안내하므로 비개발자에게는 만들어 둔 파일과 복귀 방법을 제공해야 합니다. [README.md:72](D:/Project_home/Game/EmberwakeReborn/README.md:72), [tools/make-save.cjs:10](D:/Project_home/Game/EmberwakeReborn/tools/make-save.cjs:10)

이번 리뷰에서는 브라우저 재개·가져오기·클립보드·배포물 저장을 직접 검증하지 않았습니다. WORKLOG에도 행상 창·방패 밀치기 연출·반응 순간 문구는 미검증으로 남아 있습니다.

**외부 테스터 5명에게 지금 줘도 되는가: 아니요. 재현된 규칙 결함을 먼저 고친 뒤, 신규/후반 저장과 제보 경로를 갖춘 제한 테스트로 배포하세요.**

**F. 커밋 가능 여부 — 개발 기준점 보존은 동의, 테스트 배포 기준점 승인은 차단입니다.**

근거: [src/run.js:600](D:/Project_home/Game/EmberwakeReborn/src/run.js:600), [src/run.js:1407](D:/Project_home/Game/EmberwakeReborn/src/run.js:1407), [src/run.js:1491](D:/Project_home/Game/EmberwakeReborn/src/run.js:1491), [src/guild.js:791](D:/Project_home/Game/EmberwakeReborn/src/guild.js:791).

`95618b9`을 2라운드 비교 기준으로 유지하고, 아래 수정 후 별도 커밋을 배포 후보로 삼는 것이 적절합니다. 현재 51개 통과와 1회 완주는 아래 결함을 검증하지 않습니다.

**3라운드 할 일**

1. **차단:** 반응 방어 잔량을 제거하고 연속 공격·기회 공격·돌진·광역의 발동 계약을 검증한다.
2. **차단:** 도약의 표시 범위와 실제 피격 범위, 투척의 시야 해제·공격 예산을 일치시킨다.
3. **차단:** 시간 0 즉시 포기로 날짜·행상 재고를 갱신하는 우회를 막는다.
4. 봇의 지역별 보스 목표·반응 후 주 행동·장착 실패를 고치고, 장치→성소→격파→회수→생환과 포기를 따로 계측한다.
5. 불길 진입 판정·사용 불가 안내를 통일하고, 진단 보완·후반 저장 제공·배포물 저장/재개 QA 후 5인 테스트를 시작한다.

## 반영표 (2026-09-18, 3라운드)

| 항목 | 판정 | 반영 |
|---|---|---|
| A 반응 방어 잔량이 다음 공격까지 남음 | 차단 | 고침: 반응 방어는 별도 값으로 그 공격에만 쓰고 남는 양은 버린다(`hurtHero` `reactBlock`). 회귀 테스트 "3라운드 계약"(적 둘, 피해 3+3 → 잃은 체력 3) |
| A 반응 범위 설명·첫 안내 문구 | 동의·보완 | 첫 전투 안내: "다음 근접 공격(기회 공격·돌진 포함, 원거리·광역 제외) 1회", 충전은 "공용 2점", 야영은 "체력 대신 +1" |
| A `freeUsed`가 전투 사이에 남음 | 권고 | 고침: 전투 시작 시 `freeUsed`·`reaction` 초기화 |
| A 사용 불가 사유가 화면에서 빠짐 | 권고 | 손패 툴팁에 "지금은 못 씀: 이유", 대상 미리보기 실패 이유를 안내줄에 표시(`ov.why`) |
| A 충전 카드 절약 판단 미검증 | 권고 | 미반영(봇이 연막을 안 씀). 플레이 테스트 항목으로 넘김 |
| B 도약 표시 밖 피격 | 차단 | 고침: 물리는 조건은 "예고 십자 안"뿐(가운데 +1, 가장자리 보정 없음, 밖은 헛물). 착지 칸이 바뀌어도 같다. 회귀 테스트(가운데 불길 + 2칸 회피) |
| B 투척병 시야·예산 미검사 | 차단 | 고침: 던지기 직전 `can()` 재검사(놓침), 원거리·총 예산이 차면 미루고 불길도 안 남김. 회귀 테스트 2개 |
| B 방패병 방어 시 밀림 | 권고 | 유지(방어는 밀치기 저항이 아님을 의도로 둠). 미리보기 문구에 이미 "1칸 밀림" |
| B 불길 진입 판정 통일 | 권고 | 고침: 밀려 들어간 적도 불 피해, 방패 밀치기는 지형+불 모두, `freeNear`가 불길 칸 제외. 불길 툴팁(피해·남은 턴) |
| B 혼합 스폰 최대 피해 | 권고 | smart-bot에 "방패 전열(방패병2+투척병)"·"혼합(방패병+투척병+사냥개)" 장면 추가: ara 100%·noa 100%·lumi 78~80% — 관찰 대상으로 둠 |
| C 시간 0 즉시 포기로 날짜·행상 갱신 | 차단 | 고침: 포기(`run.gaveUp`)는 시간을 안 썼으면 하루가 가지 않는다. 회귀 테스트 |
| C 행상이 후반 금화 누적을 못 줄임 | 권고 | 미반영(수치 조정은 플레이 데이터 뒤). 알려진 문제로 README에 기재 |
| D 캠페인 봇의 서고 보스 도전 소멸 | 차단 | 고침: 도전 여부를 지역별 횟수로 번갈아 센다. 결과 4회 중 2회 완주(목표물 회수 포함), 완주 문구에 목표물 회수 여부 표기, 포기는 별도 사건으로 기록 |
| D 봇이 반응 뒤 주 행동을 버림 | 권고 | 고침: 반격 태세는 반응으로 걸고 공격 계획을 이어 간다(아라 수문장 잔여 HP 63→76%) |
| D 장착 실패 무시 | 권고 | 로그로 표시(verbose) |
| D 캠페인 검사 분리·보스 격파 assert | 권고 | 테스트 "수호자 격파 보증" 추가(성장한 아라 모의전 승률 하한). 캠페인 단계별 계측은 미반영 |
| E 진단 번들 보완 | 차단 | 행동에 원정 시드, 예외(창·프로미스·act) 10건, 저장 방식, 새로고침에도 남는 기록(sessionStorage), 복사 전 포함 항목 확인창 |
| E 테스터 안내 | 차단 | README: 제보 경로(GitHub Issues), 첫 세션 과제, 기대/실제/순서 예시, 저장소에 `saves/late-30.json` 동봉 |
| E 빌드 식별 | 권고 | 빌드 정보 커밋을 코드 커밋 뒤 별도 커밋으로 남긴다(관계는 커밋 메시지) |
| F 배포 후보 | — | 3라운드 커밋을 제한 테스트(5인) 배포 후보로 삼는다 |
