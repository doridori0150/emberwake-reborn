# 2026-09-18 코드 정리 전 리뷰 (Codex gpt-6-astra, high)

대상: main 2da7e99. 요청문은 아래 '요청', 답변은 '판정'. 반영 결과는 맨 아래 '반영표'.

## 요청

# 코드 리뷰 요청: Emberwake Reborn — "지금 코드가 재사용·수정이 쉬운 상태인가"

## 읽을 파일
- 규칙(포팅 후보): `src/rng.js`, `src/data.js`, `src/content.js`, `src/events.js`, `src/mapgen.js`, `src/run.js`, `src/guild.js`, `src/save.js`, `src/bot.js`, `tests/core.test.cjs`
- 화면: `src/app.js`, `src/render.js`, `src/guildview.js`, `src/dialog.js`
- 도구: `editor.html`, `src/editor.js`, `src/editor2.js`, `src/contentfmt.js`, `tools/server.cjs`, `tools/build.cjs`
- 문서: `README.md`, `docs/DESIGN.md`, `docs/WORKLOG.md`
- `assets/generated/` 는 지금 다른 작업이 쓰고 있으니 무시하세요. 아무 파일도 고치지 마세요(읽기 전용 리뷰).

## 배경
이 게임은 AI(Claude)가 며칠 동안 빠르게 기능을 쌓아 만든 순수 JS 웹게임이다(프레임워크·빌드 도구 없음, 전역 `ER` 네임스페이스, Node 테스트). 소유자(비개발 기획자)는 "AI가 대충 휘갈겨 써서 나중에 고치기 더 힘들어지는 것 아닌가"를 걱정한다. 계획은 **이 구조로 게임을 완성한 뒤 상용 엔진(Unity/Godot)으로 포팅**하는 것이다. 따라서 질문은 두 가지다: (1) 지금 코드가 계속 기능을 얹기에 안전한가, (2) 포팅을 생각하면 어디를 정리하는 게 값어치가 있고 어디는 버려도 되는가.

작성자(Claude)의 자체 평가: 규칙/화면 분리, 데이터화(content.js), 테스트 37개는 강점. 약점은 한 줄에 400자 넘는 줄이 app.js 64개·editor2.js 55개·editor.js 34개·run.js 27개나 되는 과밀한 코드, 렌더링·이벤트 연결·상태 변경이 한 함수에 섞인 UI, innerHTML 문자열 조립, 문자열 치환 패치로 수정해 온 이력. 이 평가가 맞는지 독립적으로 검증해 달라.

## 항목별 요청
각 항목에 **판정(차단 / 권고 / 동의)** 과 근거 `파일:줄` 을 달아 달라. "차단"은 다음 기능을 얹기 전에 고쳐야 하는 것, "권고"는 정리 주간에 할 것, "동의"는 지금 상태로 충분한 것.

A. **규칙 엔진의 경계**: `run.js`/`guild.js`/`events.js`/`mapgen.js` 가 DOM·캔버스 없이 도는 순수 규칙인가. 화면 코드(`app.js`, `guildview.js`)로 규칙이 새어 나간 곳이 있는가(예: 주민 대화·가게 UI 안의 규칙, `talkTo`, `openShop`). 포팅 때 "명세"로 쓸 수 있는 수준인가.
B. **데이터 스키마**: `content.js` 의 enemies/spawns/gear/craftOptions/events/npcs/tuning/rooms 와 `data.js` 의 기본 표·병합 방식(덮어쓰기, `BASE` 스냅샷)이 일관되고 엔진 중립적인가. 스키마 검증이 충분한가(`contentfmt.check`, `lintRoom`, `events.lint`). 버전/마이그레이션이 필요한가.
C. **가독성·수정 용이성**: 과밀한 한 줄 코드가 실제로 얼마나 위험한가. 자동 포매터(prettier)로 한 번에 푸는 것이 안전한가, 아니면 함수 분해가 먼저인가. 가장 먼저 쪼개야 할 함수 5개를 `파일:줄`로 지목해 달라.
D. **중복과 재사용**: 같은 일을 하는 코드가 여러 곳에 있는가(예: 난수 해시 `rnd`/`shopRng`, 이벤트 효과 적용이 run.js 와 guild.js 에 각각, `evHave` 중복, editor 의 폼 패턴 반복, 장비/적 "기본값으로 되돌리기" 패턴 반복). 공용화할 값어치가 있는 것만 골라 달라.
E. **상태·저장 안전성**: 저장 데이터(`guild`, `run`)에 새 필드를 `ensure()` 로 채우는 방식, 콘텐츠를 지웠을 때(장비·이벤트·주민·적 삭제) 기존 저장이 깨지는 경로가 있는가. 실제로 크래시가 날 수 있는 곳을 지목해 달라.
F. **테스트**: 37개 테스트가 규칙을 충분히 고정하는가. 한 테스트가 너무 많은 것을 검사해 실패 원인을 찾기 어려운가. 빠진 핵심 시나리오 3개.
G. **도구와 서버**: `tools/server.cjs` 의 쓰기 API(`/__dev/content`, `/__dev/portrait`)의 안전성, `editor.js`/`editor2.js` 의 구조(탭 등록·훅)가 탭을 더 늘려도 버티는가.
H. **포팅 관점의 우선순위**: Unity/Godot 로 옮긴다면 (1) 그대로 가져갈 것, (2) 명세로만 쓰고 다시 짤 것, (3) 버릴 것을 파일 단위로 분류해 달라. 그에 따라 **지금 정리에 시간을 쓸 값어치가 있는 곳과 없는 곳**을 말해 달라.
I. **정리 계획**: 기능 추가를 멈추고 1~2일 정리한다면 순서대로 무엇을 하겠는가(최대 8단계, 각 단계의 위험과 검증 방법 포함). 동작을 바꾸지 않는 리팩터링만.
J. **커밋 가능 여부**: 지금 main 의 상태가 "계속 기능을 얹어도 되는 상태"인가, "정리 먼저"인가 한 줄 결론.

## 출력 형식
- 항목 A~J 순서, 각 항목: 판정 → 근거(`파일:줄` 2~5개) → 한두 문단 설명.
- 마지막에 "소유자에게 한 단락으로": 비개발자가 이해할 말로, 지금 코드 상태와 권장 결정을 요약.
- 작성자의 자체 평가와 다르게 본 부분이 있으면 분명히 적어 달라. 듣기 좋은 말은 필요 없다.

## 판정

**결론은 “정리 먼저”입니다.** 규칙 엔진을 버리고 다시 만들 정도는 아닙니다. 하지만 **편집한 값이 재실행 후 되살아나는 문제, 저장하지 않은 편집을 ‘저장됨’으로 표시하는 문제, 콘텐츠 삭제 후 기존 저장이 예외를 내는 문제**는 다음 기능을 얹기 전에 고쳐야 합니다.

현재 `main`(`2da7e99`)의 요청 파일을 검토했고, `node --test tests/core.test.cjs`는 **37개 모두 통과**했습니다. 아래 재현 결과는 실제 코드를 Node 메모리 안에서 실행한 것입니다. 저장소·서버 검증에는 대체 객체를 사용했으며, 실제 파일 쓰기·브라우저 플레이·빌드 생성은 하지 않았습니다. 파일을 수정하지 않았고 `assets/generated/`도 제외했습니다.

**A. 규칙 엔진의 경계 — 권고**

근거: [guild.js:81–92](D:/Project_home/Game/EmberwakeReborn/src/guild.js:81), [guild.js:109](D:/Project_home/Game/EmberwakeReborn/src/guild.js:109), [app.js:33–38](D:/Project_home/Game/EmberwakeReborn/src/app.js:33), [app.js:164](D:/Project_home/Game/EmberwakeReborn/src/app.js:164), [guildview.js:26–28](D:/Project_home/Game/EmberwakeReborn/src/guildview.js:26).

`run.js`·`guild.js`·`events.js`·`mapgen.js`는 **DOM·캔버스 없이 실행할 수 있는 규칙 코드**입니다. 이것은 실질적인 강점입니다. 다만 입력 상태를 직접 변경하고 전역 데이터에 의존하므로 엄밀한 의미의 순수 함수는 아닙니다. 길드 이벤트는 `Math.random`을 사용해 동일 저장에서 같은 선택 과정이 재현된다는 보장도 없습니다. 반면 상점 매출·수요·손님 반응은 `guild.shopDay`에서 계산하고 `openShop`은 결과를 재생합니다. **상점 규칙까지 UI에 뒤섞였다는 평가는 과도합니다.**

규칙 누출은 있습니다. `talkTo`가 출격 대원을 직접 바꾸고 주민 역할·시설 상태에 따라 행동을 결정하며, `guildview`가 주민 출현 조건을 판정합니다. 원정 포기는 설정창에서 `run.status='defeat'`로 직접 변경합니다. 당장 프레임워크를 도입할 이유는 없지만, 이런 행동은 규칙 명령으로 모으는 편이 좋습니다. 현재 엔진은 **포팅할 때 실행 결과를 비교하는 기준 구현으로 쓸 수 있으나, 이것만 옮기면 게임 규칙이 전부 따라오는 상태는 아닙니다.**

**B. 데이터 스키마 — 차단**

근거: [data.js:253–281](D:/Project_home/Game/EmberwakeReborn/src/data.js:253), [editor.js:201–208](D:/Project_home/Game/EmberwakeReborn/src/editor.js:201), [editor2.js:35–37](D:/Project_home/Game/EmberwakeReborn/src/editor2.js:35), [contentfmt.js:7–16](D:/Project_home/Game/EmberwakeReborn/src/contentfmt.js:7), [events.js:37–39](D:/Project_home/Game/EmberwakeReborn/src/events.js:37).

**병합 방식이 편집기와 게임 로딩에서 다릅니다.** 게임은 기본 장비·적·주민에 속성을 덧씌우지만, 편집기는 완성된 객체를 교체하고 값이 0인 속성을 삭제합니다. 실제 재현에서 기본 적 `brute`의 장갑을 0으로 만들면 재로딩 후 **1**, 기본 장비 `satchel`의 가방 효과를 제거하면 재로딩 후 **2**가 됩니다. `BASE`도 장비·수치·주민에는 있지만 적에는 같은 방식으로 제공되지 않습니다. 적 편집기의 `ORIG`는 이미 콘텐츠를 합친 표여서 “출고 기본값”과 “페이지를 열었을 때의 값”이 혼용됩니다.

콘텐츠를 데이터로 분리한 방향은 좋지만 검증은 충분하지 않습니다. `contentfmt.check`는 최상위 모양 위주여서 `group` 없는 등장 조합을 통과시키고, 이후 로딩에서 `.every` 예외가 납니다. `events.lint`도 음수 요구 비용을 허용해 `gold:-100`인 선택지를 고르면 금화가 늘어납니다. 방 검사는 도달 가능성·필수 자원까지 확인하는 상대적으로 좋은 부분이지만, 전체 스키마 검증을 대신하지 못합니다. **누락·0·빈 배열·삭제의 의미와 기본값 복원 정책을 먼저 통일**해야 합니다. 콘텐츠 스키마 버전과 저장 버전은 구분하고, 필드 구조·ID 변경에는 이전 규칙을 두십시오. 단순 밸런스 수치 변경마다 버전을 올릴 필요는 없습니다.

**C. 가독성·수정 용이성 — 권고**

우선 분해할 함수와 근거는 다음 5개입니다.

| 함수 | 근거 | 나눌 책임 |
|---|---|---|
| `doCard` | [run.js:562](D:/Project_home/Game/EmberwakeReborn/src/run.js:562) | 사용 조건·비용 처리, 효과 실행, 카드 이동·후처리 |
| `openShop` | [app.js:41](D:/Project_home/Game/EmberwakeReborn/src/app.js:41) | 진열 초안, 폼 표시·입력, 장사 실행, 결과 재생 |
| `openPrep` | [app.js:112](D:/Project_home/Game/EmberwakeReborn/src/app.js:112) | 대원·덱·장비·지역 선택과 각각의 이벤트 연결 |
| `renderFoes` | [editor.js:211](D:/Project_home/Game/EmberwakeReborn/src/editor.js:211) | 적 속성·특성 편집, 등장 조합, 모의전·관리 |
| `renderEvents` | [editor2.js:93](D:/Project_home/Game/EmberwakeReborn/src/editor2.js:93) | 대사 페이지, 선택지·조건·효과, 연결·미리보기 |

400자를 넘는 줄을 현재 파일에서 실측하면 **app 57개 / editor2 47개 / editor 25개 / run 26개**입니다. 작성자가 제시한 **64/55/34/27과는 다릅니다.** 가장 긴 줄은 `editor.js`의 2,425자입니다. 긴 줄 자체가 오류는 아니지만, 이 코드에서는 HTML 작성·상태 변경·이벤트 등록이 붙어 있어 수정 범위와 실행 순서를 파악하기 어렵습니다. 특히 비동기 저장 오류처럼 중요한 상태 변경이 한 줄에 묻힙니다. 문자열 치환으로 수정했다는 *작업 방식 자체*는 현재 소스만으로 독립 확인할 수 없습니다.

순서는 **자동 포매팅 → 함수 분해**가 낫습니다. 포매팅을 별도 변경으로 끝내면 이후 의미 있는 수정이 잘 보입니다. 다만 저장소 전체에 무조건 적용하면 안 됩니다. `content.js`는 전용 생성기가 관리하고, 빌드는 초상화 경로의 문자열 표기 형식에도 의존합니다. 이 파일은 우선 제외하십시오. 긴 HTML 문자열도 포매터만으로 책임이 분리되지는 않습니다. `doCard` 분해에서는 효과 순서와 난수 소비 순서를 반드시 보존해야 합니다.

**D. 중복과 재사용 — 권고**

근거: [run.js:687–707](D:/Project_home/Game/EmberwakeReborn/src/run.js:687), [guild.js:108–118](D:/Project_home/Game/EmberwakeReborn/src/guild.js:108), [app.js:30](D:/Project_home/Game/EmberwakeReborn/src/app.js:30), [editor2.js:19–37](D:/Project_home/Game/EmberwakeReborn/src/editor2.js:19), [editor.js:254](D:/Project_home/Game/EmberwakeReborn/src/editor.js:254).

공용화의 값어치가 가장 큰 것은 **콘텐츠 적용·복원 절차와 이벤트 선택 처리**입니다. 전자는 이미 B의 동작 차이를 만들고 있습니다. 후자는 조건 확인→비용 지불→효과 적용→다음 이벤트로 이동하는 절차가 두 엔진에 반복됩니다. 절차와 금화·플래그 처리는 공유하되, 원정 가방의 용량·바닥에 남기기와 길드 창고 처리는 별도 함수로 유지해야 합니다. `app.js`의 길드용 `evHave` 복제도 엔진이 제공하는 조회 함수를 사용하면 됩니다.

폼은 이미 `costEditor`·`effectEditor`처럼 공유할 만한 단위가 있습니다. 이 수준의 작은 공용 함수면 충분하며, 모든 탭을 처리하는 범용 폼 엔진까지 만들 필요는 없습니다. `rnd`와 `shopRng`는 유사하지만 시드 초기화와 사용 목적이 다릅니다. **그림 배치 난수와 경제 난수를 한 흐름으로 합치는 것은 피해야 합니다.** 짧은 난수 코드 중복 제거보다 기존 결과를 유지하는 것이 중요합니다.

**E. 상태·저장 안전성 — 차단**

근거: [guild.js:12](D:/Project_home/Game/EmberwakeReborn/src/guild.js:12), [guild.js:34–35](D:/Project_home/Game/EmberwakeReborn/src/guild.js:34), [render.js:30](D:/Project_home/Game/EmberwakeReborn/src/render.js:30), [run.js:160](D:/Project_home/Game/EmberwakeReborn/src/run.js:160), [save.js:12–41](D:/Project_home/Game/EmberwakeReborn/src/save.js:12).

실제로 예외가 발생하는 경로를 확인했습니다.

| 조건 | 결과 |
|---|---|
| 저장의 고정 목표가 가리키는 장비를 콘텐츠에서 삭제 | `guild.target`이 없는 장비의 `.name`을 읽어 예외. 길드 화면의 목표 표시에도 연결됨 |
| 진행 중 원정에 남아 있는 적 종류를 콘텐츠에서 삭제 | 규칙 미리보기는 없는 정의의 `.traits`에서 예외. 화면 복원도 `.asset` 접근으로 실패하는 경로가 있음 |
| IndexedDB가 없어 localStorage로 대체된 상태에서 두 세션이 저장 | 오래된 세션의 저장도 성공 처리되어 최신 진행을 덮음 |

`ensure()`로 **없는 최상위 필드를 추가하는 방식은 작은 호환성 보완으로는 충분**합니다. 하지만 부분 객체, 잘못된 타입, 삭제된 콘텐츠 참조까지 복구하는 마이그레이션은 아닙니다. 저장 체크섬도 “파일 내용이 변했는가”를 검사할 뿐 게임 상태의 유효성을 보장하지 않습니다. 실제로 `unpack`은 중요한 필드가 다수 없는 객체도 통과시킵니다. localStorage의 JSON 파싱은 `load`의 오류 처리 밖에 있어 손상된 기록이 시작 오류로 이어질 수도 있습니다.

반대로 **이벤트·주민을 삭제하면 무조건 저장이 깨진다는 주장은 틀립니다.** 삭제된 대기 이벤트는 현재 코드에서 건너뛰며, 주민 삭제도 같은 종류의 직접 참조 예외를 확인하지 못했습니다. 로드 시점에 상태 정규화와 콘텐츠 참조 검사를 한 번 수행하고, 삭제된 항목의 대체·사용 중지·복구 정책을 정해야 합니다. 원본 저장을 보존한 상태에서 처리해야 하며, 여기저기 `?.`를 붙여 조용히 진행시키는 것으로 끝내면 안 됩니다.

**F. 테스트 — 권고**

근거: [core.test.cjs:7](D:/Project_home/Game/EmberwakeReborn/tests/core.test.cjs:7), [core.test.cjs:32](D:/Project_home/Game/EmberwakeReborn/tests/core.test.cjs:32), [core.test.cjs:150–157](D:/Project_home/Game/EmberwakeReborn/tests/core.test.cjs:150), [core.test.cjs:250](D:/Project_home/Game/EmberwakeReborn/tests/core.test.cjs:250), [core.test.cjs:279](D:/Project_home/Game/EmberwakeReborn/tests/core.test.cjs:279).

37개는 숫자만 채운 테스트가 아닙니다. 지역별 다수 시드의 지도 검증, 미리보기와 실제 효과 비교, 저장 후 난수 재현, 봇 원정 종료 검사는 가치가 큽니다. 다만 기본 fixture는 `noCrit`, `flatAttack`, `noEvents`를 켭니다. 별도 테스트가 실제 주사위·치명타·이벤트를 검사하지만, 기본 회귀 범위가 실제 플레이의 조합 전체를 대표하지는 않습니다. 저장 테스트도 직렬화 왕복 위주이며 실제 저장소 충돌을 검사하지 않습니다. 한 특성 테스트에 여러 기능이 연속으로 들어가 앞부분 실패가 뒤의 검증을 가립니다. 또 279행의 난수 비교는 값을 저장한 직후 그대로 비교해 그 구간에서는 아무 동작도 검증하지 않습니다.

빠진 핵심 시나리오는 다음 **3개**입니다. 특히 차단 결함을 수정할 때는 해당 테스트를 완료 조건으로 삼아야 합니다.

1. **콘텐츠 편집→저장→새로 로딩→되돌리기의 일치:** 장갑 0, 효과 제거, 기본값 복원, 사용자 추가 항목 삭제를 포함.
2. **구버전 저장과 삭제된 콘텐츠의 조합:** 고정 목표·장착 장비·진행 중 적·대기 이벤트를 포함해 이어하기와 정산을 확인.
3. **비동기 저장과 충돌·실패:** 저장 요청 중 추가 편집, 두 세션의 오래된 저장, IndexedDB 실패 후 대체 저장, 쓰기 실패를 확인.

기존 대형 테스트는 기능별 이름을 가진 하위 테스트로 나누고, 반복 검사는 지역·대원·시드가 실패 메시지에 나오게 하면 충분합니다.

**G. 도구와 서버 — 차단**

근거: [editor.js:50–55](D:/Project_home/Game/EmberwakeReborn/src/editor.js:50), [server.cjs:11–24](D:/Project_home/Game/EmberwakeReborn/tools/server.cjs:11), [server.cjs:28–31](D:/Project_home/Game/EmberwakeReborn/tools/server.cjs:28), [editor.js:264–267](D:/Project_home/Game/EmberwakeReborn/src/editor.js:264), [editor2.js:187–190](D:/Project_home/Game/EmberwakeReborn/src/editor2.js:187).

가장 먼저 고칠 것은 **편집기 저장 완료 판정**입니다. 요청 전의 `C`를 전송한 뒤, 응답이 오면 *그때의* `C`를 저장 완료 기준으로 기록합니다. 응답을 지연시킨 재현에서 **버전 1만 전송했는데 버전 2까지 저장됐다고 표시**했습니다. 사용자는 변경을 잃을 수 있습니다. 전송한 스냅샷을 저장 완료 기준으로 삼아야 합니다. 서버의 콘텐츠·초상화 저장도 파일에 직접 쓰며, 콘텐츠 백업은 직전 한 개뿐입니다. 중단 시 불완전한 파일이 남을 위험과 여러 편집 창의 덮어쓰기 위험이 있습니다.

로컬 주소 바인딩, Host·Origin 검사, 고정 쓰기 경로, 초상화 ID·용량·서명 제한은 적절한 기본 방어입니다. 임의 경로에 쓰는 API는 아닙니다. 다만 정적 서버에는 별도 결함이 있습니다. `/%` 요청은 처리되지 않은 URI 예외를 만들고, 경로 검사가 문자열 접두어 비교여서 `EmberwakeReborn-sibling`처럼 같은 접두어의 형제 폴더를 허용합니다. 대체 파일 시스템을 사용해 실제 경로 계산까지 확인했습니다. 탭 등록·복원·검사 훅 자체는 지금 규모에 충분하지만, 각 훅이 전역 데이터 표를 직접 재구성합니다. **탭 개수보다 공통 편집 상태와 적용 절차를 정리하는 것이 우선**입니다.

**H. 포팅 관점의 우선순위 — 동의**

근거: [data.js:253–281](D:/Project_home/Game/EmberwakeReborn/src/data.js:253), [rng.js:10–17](D:/Project_home/Game/EmberwakeReborn/src/rng.js:10), [build.cjs:13–17](D:/Project_home/Game/EmberwakeReborn/tools/build.cjs:13), [DESIGN.md:35](D:/Project_home/Game/EmberwakeReborn/docs/DESIGN.md:35), [DESIGN.md:69–73](D:/Project_home/Game/EmberwakeReborn/docs/DESIGN.md:69).

“현재 구조로 완성한 뒤 포팅”은 가능한 전략입니다. 다만 **그대로 가져가는 대상은 주로 데이터와 검증 자료**입니다. JS 실행 파일을 Unity/Godot의 기본 런타임 코드로 그대로 옮긴다는 의미는 아닙니다.

| 분류 | 파일·부분 | 처리 |
|---|---|---|
| **그대로 보존·이관** | `content.js`의 콘텐츠 본문 | JSON 등으로 추출. ID·수치·대사·방 배치 보존 |
| **그대로 보존·이관** | `data.js`의 기본 표·밸런스 값 | 기본값과 덮어쓰기 의미를 확정한 뒤 추출. CSS 색상 필터·함수는 별도 처리 |
| **기준 자료로 보존** | `tests/core.test.cjs`, `README.md`, `docs/DESIGN.md`, `docs/WORKLOG.md` | 테스트 입력·예상 결과와 확정 규칙을 보존. 문서의 과거 설명과 현재 규칙을 구분 |
| **명세로 쓰고 재구현** | `rng.js`, `run.js`, `guild.js`, `events.js`, `mapgen.js` | 상태 전이·효과 순서·생성 규칙을 이식. 난수까지 맞추려면 32비트 연산과 소비 순서도 보존 |
| **명세·검증 도구로 보존** | `bot.js` | 비교용 봇으로 유지하고 필요할 때 엔진용으로 재작성 |
| **부분 명세 후 재구현** | `save.js`, `app.js`, `guildview.js` | 저장 형식·호환성 정책과 UI에 남은 게임 규칙만 추출 |
| **포팅 실행 코드에서는 폐기** | `app.js`·`guildview.js`의 브라우저 화면 부분, `render.js`, `dialog.js` | 새 엔진의 화면·입력·애니메이션으로 구현 |
| **웹 개발 도구로만 유지** | `editor.html`, `editor.js`, `editor2.js`, `contentfmt.js`, `tools/server.cjs`, `tools/build.cjs` | 새 엔진 실행물에는 넣지 않음. 기존 편집기가 유용하면 외부 콘텐츠 도구로 계속 사용 |

지금 투자할 곳은 **콘텐츠 적용 규칙, 저장 호환성, 규칙 진입점, 회귀 테스트**입니다. 폐기 예정 UI의 완벽한 추상화, 프레임워크 전환, 거대한 공용 폼 시스템은 우선순위가 낮습니다. 그렇다고 도구의 데이터 손실 결함까지 방치하면 안 됩니다. 빌드의 `safe()`도 현재 `</script>`를 실제로 이스케이프하지 않아 해당 문자열이 콘텐츠에 들어가면 포터블 HTML이 깨집니다. 작은 정확성 수정은 필요합니다. 문서도 치명타를 일괄 +50%라고 한 설명과 무기 추가 주사위 설명이 함께 있어 **그대로 완성된 명세로 넘기면 안 됩니다.**

**I. 1~2일 정리 계획 — 권고**

근거: [run.js:562](D:/Project_home/Game/EmberwakeReborn/src/run.js:562), [editor.js:53](D:/Project_home/Game/EmberwakeReborn/src/editor.js:53), [core.test.cjs:32](D:/Project_home/Game/EmberwakeReborn/tests/core.test.cjs:32).

아래는 요청대로 **동작을 바꾸지 않는 리팩터링 계획**입니다. B·E·G의 결함 수정은 동작 변경이므로 별도 수정 커밋으로 구분해야 합니다. 포매팅과 함수 분해만 하고 차단 문제가 해결됐다고 판단해서는 안 됩니다.

| 순서 | 작업 | 위험 | 검증 방법 |
|---|---|---|---|
| 1 | 대표 시드·행동열·저장·콘텐츠 입력의 현재 결과를 기준으로 고정 | 잘못된 현재 동작까지 정상으로 고정할 수 있음 | 정상 기준과 알려진 결함 재현을 구분 |
| 2 | 실행 소스 자동 포매팅. 도구 생성 `content.js`는 제외 | 큰 변경량이 의미 변경을 가림 | 포매팅 전용 변경, 구문 검사·37개 테스트 |
| 3 | 기본 표·콘텐츠 덮어쓰기·편집 상태 적용 코드를 이름 있는 함수로 추출 | 객체 참조와 적용 순서 변화 | 적용 전후 전체 데이터 비교. 병합 정책 변경은 별도 수정 |
| 4 | 이벤트 공통 절차와 저장소별 효과 적용을 분리 | 비용·효과·다음 이벤트 순서 변화 | 선택 전후 상태·큐·가방·난수 비교 |
| 5 | C의 5개 함수를 작은 책임별 함수로 분해 | 클로저 변수·이벤트 중복 등록·실행 순서 변화 | 카드 결과 비교, 상점·준비창·편집기 조작 확인 |
| 6 | 저장 직렬화·저장소 접근·편집기 저장 상태 처리를 분리 | 비동기 순서 변화 | 지연 응답·실패를 주는 대체 저장소로 호출 순서와 상태 확인 |
| 7 | 대형 테스트를 이름 있는 하위 테스트로 분리하고 현재 규칙 문서를 정돈 | 검증 누락·예상값의 무심한 수정 | 기존 검사 유지 확인, 전체 테스트, 브라우저 주요 흐름·포터블 빌드 확인 |

1~2일에는 이 범위로 제한하는 편이 현실적입니다. 모듈 시스템·프레임워크·언어 전환까지 섞지 마십시오. **구조 정리와 필수 결함 수정은 별도 변경으로 검토하되, 다음 기능은 결함 수정의 회귀 검증까지 끝낸 후 추가**하는 것을 권합니다.

**J. 커밋 가능 여부 — 차단**

근거: [editor.js:53](D:/Project_home/Game/EmberwakeReborn/src/editor.js:53), [guild.js:34](D:/Project_home/Game/EmberwakeReborn/src/guild.js:34), [data.js:254](D:/Project_home/Game/EmberwakeReborn/src/data.js:254).

**현재 main은 “정리 먼저”입니다. 현 상태를 보존하는 커밋은 가능하지만, 콘텐츠 적용·저장 완료 판정·삭제된 참조 처리 결함을 고치기 전에는 다음 기능 추가의 안전한 기준점으로 승인하지 않겠습니다.**

**소유자에게 한 단락으로**

이 코드는 AI가 썼다는 이유로 버려야 하는 상태는 아닙니다. 화면 없이 게임 규칙을 실행하고 검사할 수 있는 기반은 잘 만들어져 있습니다. 다만 작성자의 자체 평가는 긴 줄과 UI 복잡성에 비해 **편집·저장의 실제 결함을 가볍게 봤습니다.** 지금 문제는 읽기 불편하다는 데서 끝나지 않고, 고친 값이 돌아오거나 저장됐다는 표시를 믿었다가 작업을 잃을 수 있다는 것입니다. 기능 추가를 잠시 멈추고 이 경계부터 고친 뒤 계속 개발하는 것이 맞습니다. 포팅을 위해 모든 코드를 아름답게 다듬을 필요는 없지만, **게임 규칙·콘텐츠·저장·테스트는 믿고 가져갈 수 있게 만들어야 합니다.**
## 반영표 (2026-09-18)

| 항목 | 판정 | 반영 | 커밋 |
|---|---|---|---|
| B 병합 방식 불일치(0·삭제한 속성이 되살아남) | 차단 | 고침: content 항목은 기본 항목을 통째로 교체(`replaceItems`), `BASE.enemies` 추가, 도구의 적 기본값도 BASE 사용. 회귀 테스트 "콘텐츠 병합" | bfec7ba |
| B 스키마 검증 부족(group 없는 조합, 음수 조건) | 차단 | 고침: `contentfmt.check` 강화, `events.lint`/`requireOk` 음수 거부, `applySpawns` 방어. 회귀 테스트 "콘텐츠 모양 검사" | bfec7ba |
| E 지워진 콘텐츠를 가리키는 저장이 예외 | 차단 | 고침: `guild.target` 이 사라진 항목을 안전하게 돌려줌, `guild.sanitize(state)` 를 불러오기 직후 실행(원본은 자동 백업). 회귀 테스트 "지워진 콘텐츠와 옛 저장" | bfec7ba |
| E localStorage 대체 저장의 충돌·깨진 JSON | 차단 | 고침: 대체 저장도 rev/세션 확인, 파싱 실패는 오류로 보고, `unpack` 구조 검사 강화. 회귀 테스트 "저장 구조 검사" | bfec7ba |
| G 도구의 "저장됨" 오판 | 차단 | 고침: 보낸 스냅샷만 저장 완료로 기록, 저장 중 재요청 차단, 뒤늦은 편집이 있으면 안내 | bfec7ba |
| G 서버: 잘못된 URL 예외, 형제 폴더 접근, 직접 덮어쓰기 | 차단 | 고침: 400 응답, 상대 경로 검사, 임시 파일 후 이름 바꾸기, 백업 5개 보관. curl 로 확인 | bfec7ba |
| H 빌드 `safe()` 가 `</script>` 를 이스케이프하지 않음 | 권고 | 고침 | bfec7ba |
| H 문서의 치명타 설명 충돌 | 권고 | 고침(DESIGN.md) | bfec7ba |
| F 279행 무의미한 난수 비교 | 권고 | 고침: 미리보기 전후 비교 + 실제 공격은 소비함을 확인 | bfec7ba |
| A 원정 포기·대원 교체가 화면 코드에서 상태 직접 변경, 길드 이벤트 Math.random | 권고 | 고침: `run.act({t:"giveUp"})`, `guild.selectHero`, 길드 이벤트 확률은 저장 상태로 만든 시드 | bfec7ba |
| C 자동 포매팅 | 권고 | 함: prettier 3.9.7(printWidth 140), content.js 제외, 포매팅 전용 커밋. 테스트·봇 통계 동일 | aaa6b1f |
| C `doCard` 분해 | 권고 | 함: rollCardDice / hitWithCard / applyCardAttack / applyCardSelf / CARD_SPECIALS. 봇 통계 동일 | 984e17a |
| D 이벤트 선택 절차 중복, `evHave` 복제 | 권고 | 함: `events.choose` + 원정/길드별 pay·effect 훅, `guild.evHave` 공개 | 984e17a |
| C `openShop`·`openPrep`·`renderFoes`·`renderEvents` 분해 | 권고 | **남음** — 포팅 때 버리는 화면 코드라 우선순위를 낮췄다. 다음에 그 화면을 크게 고칠 때 먼저 쪼갠다 | — |
| F 대형 테스트를 하위 테스트로 분리, 비동기 저장 충돌 시나리오 | 권고 | **남음** — 저장소 접근을 주입 가능하게 바꾼 뒤(리뷰 I-6) 추가 | — |
| A 주민 출현 조건이 guildview 안에 있음 | 권고 | **남음** — `guild.visibleNpcs(G)` 로 옮길 것 | — |
| D `rnd`/`shopRng` 통합 | 동의(하지 말 것) | 그대로 둠: 그림 배치 난수와 경제 난수는 섞지 않는다 | — |
