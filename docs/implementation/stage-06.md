# 스테이지 6 실행 기록 — 간트·달력

시작 main은 `ad4126c32d6d52f15632873b5e965ba4dc77adf6`.
사용자가 ‘스태이지 6 진행해’로 승인 계획 Task 6~8의 실행을 요청했다.
기존 요구사항·날짜·저장·화면 설계를 재질문하거나 기능 범위를 늘리지 않았다.
구현·독립 검토 수정·로컬·Ubuntu/Windows 앱 CI를 완료했다. 스테이지 7 설치·배포는 미착수다.

## 구현과 커밋

- `ffa30ca`: [간트 계산](../../src/visualization/gantt.ts), [viewport](../../src/visualization/viewport.ts),
  [GanttView](../../src/renderer/components/GanttView.tsx). 일당 28px·월/일 눈금·고정 이름 열,
  전체 월 범위·가로 논리 손잡이/wheel/키보드, 날짜 양쪽 31일 overscan,
  행 높이 누적합/이진 검색. 거대한 전체 폭 DOM 없이 화면 근처 좌표를 사용한다.
- `a8087ad`: [달력 계산](../../src/visualization/calendar.ts),
  [CalendarView](../../src/renderer/components/CalendarView.tsx),
  [날짜 전체 목록](../../src/renderer/components/DayScheduleList.tsx).
  월요일 시작 4~6주, 월 교차 후 주별 분할·계속 방향, 원 일정 정렬·최소 빈 줄 재사용,
  3줄 초과 날짜별 고유 ID 수와 전체 일정 목록. 인접 월 숫자만, 범위 밖 연도는 빈 비활성 칸이다.
- `b3f6eff`: 두 모드·선택 월·입력·스크롤 anchor 유지, 실제 CRUD/오류·키보드·대량 데이터 통합 검증.
  [App](../../src/renderer/App.tsx)과 [프로젝트 목록](../../src/renderer/components/ProjectList.tsx)은
  같은 snapshot을 사용한다. SQLite schema·IPC·운영 프로필 경로를 바꾸지 않았다.
- `6a61c4c`: 화면 가장자리 월 제목이 보이는 부분 안에 위치하도록 보완했다.
- `e930cd4`: 독립 검토와 추가 재현의 중요 항목을 수정했다. 아래 검토 기록을 따른다.

목업을 제품 코드로 복사하지 않았다. 날짜/일정 개수 제한, 검색·드래그·수동 백업·동기화를 추가하지 않았다.

## RED→GREEN과 실제 검증

Task 6 좌표/창/범위 unit 3개·간트 UI 2개, Task 7 격자/경계/겹침/줄 재사용 unit 4개·UI 2개를
미구현 assertion의 RED로 확인한 뒤 구현했다. 핫픽스 x=280/1148/1316, 폭=868/168/28과
극단 3652059일을 literal 기대값으로 검증했다. 윤년·연도/월/주 경계·큰 수치 ID·중복 이름을 포함한다.

Task 8의 현재 달력 밖 저장 안내, 가상 행 밖 focused 막대, 미저장 확인과 날짜 목록 교체,
제목에서 역방향 Tab, 가장자리 월 제목도 각각 RED→GREEN으로 보완했다.
기존에 정상인 실패 경로를 망가뜨려 인위적인 RED를 만들지 않았다.

Linux x64·Node 24.22.1·Electron 45.2.1·ABI 150:
`DISPLAY=:99 npm run verify:app`의 타입 검사·unit 31개×UTC/New_York/Seoul·UI 23개·native 11개·
E2E 19개·production/test build가 통과했다. E2E skipped/flaky/unexpected는 모두 0이다.
`node scripts/harness/run.mjs verify`의 검사 7종·회귀 22개도 통과했다.
모든 DB/Chromium profile은 임시 경로이며 seed/오류 주입은 별도 test main에만 있다.

최초 native 시작 실패는 꺼져 있던 X 서버 때문이었다. 기존 Xvfb :99를 시작해 해결했고 sandbox는 유지했다.
검토 수정 중 controller가 전체/개별 검증을 겹쳐 한 번 Playwright output 정리 충돌로
`electron.log ENOENT`가 발생했다. 동시 부하 중 기존 긴 draft UI 테스트도 5초 timeout을 냈다.
모든 실행을 끝낸 뒤 전체 명령 하나만 단독 실행해 통과했다. 검사 생략·timeout 증가는 적용하지 않았다.

검토 수정의 로컬 전체 검증은 `6a61c4c` 기준 dirty 작업 트리였고 해당 변경을 `e930cd4`에 포함했다.
원격 근거:

- [핵심 구현 앱 CI](https://github.com/kdydesign/simple-timeline/actions/runs/41630213147): `b3f6eff`, 두 OS 성공.
- [월 제목 수정 앱 CI](https://github.com/kdydesign/simple-timeline/actions/runs/41630650674): `6a61c4c`, 두 OS 성공.
- [검토 수정 앱 CI](https://github.com/kdydesign/simple-timeline/actions/runs/41632370013): `e930cd4`, 두 OS 성공.
- [검토 수정 저장소 CI](https://github.com/kdydesign/simple-timeline/actions/runs/41632369987): 별도 repository-only 검증.

최종 문서 커밋의 SHA·원격 main·앱/하네스 CI는 종료 메시지에서 별도로 대조한다.
보고서·로그·이미지·성능 JSON은 CI artifact에 보존한다. 로컬 latest는 덮어써지는 자료다.

## 성능 관측과 범위

[대량 E2E](../../tests/e2e/scale.spec.ts)는 1280×800·일정 10000개
(극단 연도 2개와 같은 날 9998개)에서 양 끝 날짜·마지막 가상 행·날짜 전체 목록 끝 항목을 실제 앱으로 열었다.
날짜 DOM 110개 미만, 간트 행 40개 미만, 날짜 목록 행 20개 미만이며 CSS 좌표가 viewport 주변에 한정된다.
fixture 수는 제품 한도가 아니다. [키보드 E2E](../../tests/e2e/keyboard.spec.ts)의
640×400은 1280×800의 200% 확대 상당 CSS 레이아웃 검증이며 실제 Windows 배율/보조기술 검증은 아니다.

로컬 관측 한 회(`e930cd4`에 포함된 수정): Linux 6.18.57·Xeon Platinum 8573C·5 vCPU·메모리 18.9GB,
준비 3044ms(DB seed 10000건·시작·자동화 포함), 끝 이동 23ms, 달력 전환 245ms.
renderer JS heap 약 26.9MB, Browser/Tab working set 각각 223072/212692 KiB,
Electron 누적 CPU 사용 시간 각각 3.39/2.00초였다.
반복 실행 값은 달라진다. 순간 CPU%나 일반 PC SLA로 해석하지 않는다.
원 JSON은 E2E의 `scale-metrics.json`에 있다.

## 독립 검토와 한 번의 수정 패스

독립 reviewer는 `ad4126c..6a61c4c` 전체를 읽기 전용으로 검토하고 중요 3개를 실제 Electron에서 재현했다.
각 항목을 [브라우저 회귀](../../tests/e2e/review.spec.ts)에서 RED로 확인한 뒤 수정했다.

1. overscan 막대로 Tab하면 overflow:hidden track이 독립 scroll되어 날짜 눈금과 어긋났다.
   막대는 실제 viewport 교집합만 그리고 track은 overflow:clip으로 별도 스크롤을 막는다.
2. 가로 이동으로 focused 막대가 제거되면 BODY로 포커스가 사라졌다.
   제거 전에 같은 일정의 남아 있는 이름 버튼으로 포커스를 넘긴다.
3. 날짜 목록과 편집 패널을 연 채 창을 좁히면 양쪽이 inert가 됐다.
   최상위 날짜 목록을 body portal에 두고 목록 닫기·overlay 전환/덮임 해제 때 편집 포커스를 복원한다.
   portal만으로 부족했던 늦은 resize 이벤트의 복귀 경로도 같은 회귀로 보완했다.

reviewer가 재현하지 못해 판단을 보류한 두 상태도 executor가 UI 테스트로 재현해 중요 항목으로 처리했다.

4. 저장 중 모드/월 변경 후 저장 시작 시점 값으로 완료 안내를 계산했다.
   완료 시점의 현재 모드·월로 안내/복귀를 정한다.
5. 이전 저장 성공 문구가 새 저장 실패 옆에 남았다.
   새 저장/확정 삭제 요청 시 이전 성공 안내를 비운다.

각 RED→GREEN과 전체 suite 단독 재검증을 통과했다. 두 번째 review를 반복하지 않았다.

남긴 작은 개선: 간트 header가 실제 body의 scrollbar gutter 약 15px를 포함해 측정된다.
논리 End에서 마지막 날짜 막대가 일부 잘릴 수 있다. 원 날짜·기간·이름 버튼의 편집 접근은 유지된다.
실제 body 폭 또는 같은 header gutter로 맞추는 표시 개선을 후속 항목으로 남겼다.

## 실행 중 정한 조정과 비용

1. 사용자 지시에 따라 main checkout에서 직접 진행했다. 별도 worktree 없이 승인된 일반 push만 사용한다.
2. cloud helper가 설치되지 않아 동등한 ledger/brief/실패·성공 근거를 수동 관리했다. 검증 게이트는 유지하고 기록 비용만 수동이다.
3. 기존 CRUD E2E selector를 임시 목록 대신 간트 행으로 옮겼다. 저장·재실행·연쇄 삭제 assertion은 유지했다.
4. Segment startDate/endDate는 원 기간이고 weekStart/column/span은 조각이다. 정렬·설명에 원 날짜를 쓰는 내부 표현이다.
5. 날짜 전체 목록도 viewport 렌더링한다. 개수 제한 없이 끝까지 접근하며 정적 목록과 다른 키보드 탐색을 안내한다.
6. 고정 소스의 독립 검토와 별도 OS CI를 병행했다. CI 실패는 따로 원인을 확인하며 종료 게이트는 생략하지 않는다.
7. 실제 Windows 설치/오프라인/업데이트/물리 오류/배율/보조기술은 Task 9에 남긴다. 설치본 준비 완료는 미검증이다.
8. 변경하지 않은 Task 1~5는 기존 전체 회귀로 검증한다. 별도 독립 보안·저장 감사까지 수행했다고 확대하지 않는다.
9. 10000개 초과·실제 Windows 성능의 임의 규모 보장은 없다. 제품 한도는 추가하지 않았으며 더 큰 부하는 미확정이다.
10. 종료 문서는 최종 코드·CI가 정해진 뒤 executor가 대조한다. 독립 prose review를 받은 것으로 표시하지 않는다.
11. 최종 SHA의 CI를 수정 후 다시 대조한다. 이전 green으로 이후 커밋의 성공을 대신하지 않는다.
12. 저장 중 조회 변경은 재현 후 중요 수정으로 전환했다. 보완하지 않으면 현재 맥락의 안내가 틀릴 수 있었다.
13. 이전 성공/새 실패 안내 혼재는 재현 후 중요 수정으로 전환했다. 보완하지 않으면 저장 결과가 모호했다.
14. 소스 push·로컬 검증 후 실행 환경 연결이 끊겨 문서 최종 반영은 GitHub API로 했다.
    최신 main과 expected SHA를 대조해 일반 fast-forward만 사용하고 최종 검증은 CI의 깨끗한 checkout에서 수행한다.
    최종 SHA의 로컬 재실행·scratch 정리는 할 수 없었다. 기존 workspace에는 예전 미커밋 문서 초안이 남을 수 있다.
    재개 시 변경을 무조건 버리지 말고 최신 원격과 대조하거나 새 checkout을 사용한다.

## 후속 범위·주의

스테이지 5의 migration 사본 경로/대상 버전 로그 개선과 빌드 도구 moderate advisory는
[이전 실행 기록](stage-05.md)을 따른다. 강제 의존성 다운그레이드는 하지 않았다.
스테이지 7에서 미확정인 Windows 지원 OS/CPU·설치 범위·서명/배포·제거 정책을 사용자와 정하고 실제 설치본을 검증한다.
