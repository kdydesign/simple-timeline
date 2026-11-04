# Simple Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 승인된 오프라인 Windows 일정 앱을 실제 SQLite CRUD, 간트·달력, 설치본 검증의 순서로 완성한다.

**Architecture:** Electron main만 DB·파일을 소유하고 sandbox preload의 고정 API로 React와 연결한다.
순수 도메인·시각화 함수와 DB·IPC·UI를 각각 검증하고, Electron에 맞게 재빌드한 동일 네이티브 모듈을 DB 테스트와 앱에서 사용한다.

**Tech Stack:** Node 24.22.1, Electron 45.2.1, React/ReactDOM 19.3.1, TypeScript 7.0.2,
electron-vite 6.0.0/Vite 8.3.5, electron-builder 26.18.0, better-sqlite3 13.0.3,
Vitest 5.1.0, Playwright 1.64.1. 전체 고정 버전과 문서상 확인 범위는 [도구 조사](../../research/2026-11-03-implementation-tooling.md)를 따른다.

**Spec:** [도메인·날짜](../../design/domain-rules.md), [프로세스·IPC](../../design/architecture.md),
[저장](../../design/storage.md), [화면](../../design/experience.md), [시각화](../../design/visualization.md).
이 다섯 승인 문서를 읽고 실행한다. [전체 설계](../specs/2026-11-03-simple-timeline-design.md)는 요구사항 인덱스다.

상태: 스테이지 4 사용자 승인 계획. Task 1~5는 스테이지 5에서 구현·검증했다.
[실행 기록](../../implementation/stage-05.md)과 [인수인계](../../wayfinder/handoffs/05-foundation-crud.md)를 따른다.
Task 6~8도 스테이지 6에서 구현·검증했다. [실행 기록](../../implementation/stage-06.md)과
[인수인계](../../wayfinder/handoffs/06-visualizations.md)를 따른다. Task 9도 스테이지 7에서 구현·자동 검증했다.
2026-11-04 사용자 기본 설치 인수와 범위 조정으로 이번 MVP를 마무리했다.
[스테이지 7 인수인계](../../wayfinder/handoffs/07-windows-release.md)와 [사용자 기록](../../release/user-acceptance.md)을 따른다.

## Global Constraints

- 한 채팅에서는 요청받은 한 스테이지만 진행한다.
- React renderer는 직접 Node.js·파일 시스템·SQLite를 호출하지 않는다.
- 날짜는 서기 0001~9999년의 그레고리력 실제 날짜다. 연도 0000은 허용하지 않는다.
- 표현은 정확히 `YYYY-MM-DD`다. 빈 값·존재하지 않는 날짜·시각/시간대가 붙은 값은 허용하지 않는다.
- 시작일과 종료일을 모두 포함한다. 기간 일수는 두 날짜 사이의 달력상 일수 차이 + 1이다.
- 이름 안쪽 공백과 대소문자는 보존한다. 프로젝트명과 일정명은 각각 중복을 허용하며 항목의 정체성은 내부 식별자로 구분한다.
- 프로젝트 삭제는 프로젝트 한 행 삭제와 FK cascade를 하나의 트랜잭션으로 commit한다.
- main은 DB commit 후에만 성공을 반환한다. renderer는 처리 중 중복 제출을 막고 낙관적 저장을 하지 않는다.
- 선택 연월은 메모리에만 유지하며 앱 시작 시 현지 현재 월로 초기화한다.
- 1일 28 CSS px 고정이며 월/일 눈금, 가로·세로 스크롤을 제공한다. 자동 맞춤 축소·줌은 MVP에 추가하지 않는다.
- 기본 3줄만 표시한다. 숨겨진 막대가 해당 날짜에 있으면 그 날짜에 `+N 더 보기`를 제공한다.
- Teams·공유·동기화·모바일·수동 백업/복원·자동 업데이트·검색/필터·드래그 편집은 추가하지 않는다.
- 목업 HTML은 설계 자료다. 제품 코드/자산으로 복사하지 않는다. 테스트는 운영 DB가 아닌 매번 생성하는 임시 프로필만 사용한다.

## Review Focus

다음 다섯 실패 경로를 아래 소유 작업의 테스트로 고정한다.

1. Unicode 공백·대소문자·중복 이름 때문에 다른 항목이 합쳐지는 입력: Task 1 정규화와 Task 2 ID 정밀도 검증.
2. 첫 실행처럼 보이는 손상/0바이트/알 수 없는 DB: Task 3 원본 바이트 보존·편집 차단 검증.
3. commit 후 응답/재조회가 끊겨 중복 create가 발생하는 상황: Task 5와 Task 8의 결과 불명·재전송 금지 검증.
4. 0001/9999년·윤년·월/주 경계에서 누락되거나 약 1억 px CSS 좌표가 생기는 입력: Task 6·7·8 극단 범위 검증.
5. 긴 이름·좁은 창/확대·키보드 이동 후 포커스가 사라지는 상황: Task 5·6·8 UI와 Task 9 실제 Windows 검증.

## 실행 순서·기술 제안

| 스테이지 | 작업 | 종료 경계 |
| --- | --- | --- |
| 5 기본 앱·저장·CRUD | Task 1~5 | UI → preload → main → 실제 SQLite의 CRUD·오류·재실행 보존. 시각화는 아직 미구현 |
| 6 간트·달력 | Task 6~8 | 승인된 두 모드·연월·가상 이동·겹침·키보드·CRUD 통합 |
| 7 Windows | Task 9 | Windows Server 설치 lifecycle + 사용자 기본 설치 인수. 사용자 결정으로 상세 미실행 항목은 별도 후속 |

스테이지 안에서는 작업 순서대로 검증·커밋한다. 다른 채팅으로 넘겨야 하면 완료한 작업 번호와 실패/미실행을
인수인계에 남기고 현재 스테이지를 진행 중으로 유지한다. 작업 체크는 실제 완료 후에만 바꾼다.

에이전트 제안: electron-vite + electron-builder를 사용한다. Forge 일체형도 가능하지만,
이 앱에서는 CJS main/preload 출력·별도 테스트 runner·NSIS 패키징을 명시적으로 분리하기 쉽다.
구현 언어는 TypeScript, 스타일은 로컬 CSS, 전역 상태/날짜/가상화 라이브러리는 추가하지 않는다.
날짜는 승인된 순번 계산, 가상화는 작은 순수 window 함수와 React 상태로 구현한다.
되돌리기 쉬운 내부 선택도 이 계획 전체 승인에 포함됐으며 기존 단계의 사용자 선택으로 소급하지 않는다.

앱 정체성 제안: `appId=com.kdydesign.simpletimeline`, 표시명 `Simple Timeline`,
고정 프로필 폴더 `app.getPath('appData')/SimpleTimeline`을 준비해 `userData`로 설정한다.
DB는 그 아래 `data/timeline.sqlite3`. 업데이트·표시명 변경으로 경로가 바뀌지 않게 한다.
Windows x64는 최초 CI 빌드 축이며 최종 지원 OS/CPU를 임의 확정한 것이 아니다. 지원 범위·설치 범위·서명·배포·제거 정책은 Task 9에서 사용자와 정한다.

## 파일·인터페이스 지도

Task 1~9 경로는 실제 구현되었다. Task 9의 실제 결과와 사용자 인수 범위는 아래와 검증 기록을 따른다.

| 위치 | 책임·소유 작업 |
| --- | --- |
| `package.json`, `package-lock.json`, `.node-version`, `tsconfig*.json`, `electron.vite.config.mts`, `vitest*.config.mts` | 정확 버전·컴파일·테스트 경계, Task 1부터 필요한 항목만 추가 |
| `src/shared/types.ts`, `src/shared/api.ts` | DTO·Result·ErrorCode·8개 메서드와 채널 상수, Task 1 |
| `src/domain/date.ts`, `normalize.ts`, `sort.ts` | 순수 업무 날짜·입력 정리·수치 ID 비교, Task 1 |
| `src/main/db/schema.ts`, `repository.ts`, `lifecycle.ts`, `migrations.ts` | 실제 DB·트랜잭션·무결성·버전·보존 사본, Task 2~3 |
| `src/main/index.ts`, `bootstrap.ts`, `window.ts`, `ipc.ts`, `errors.ts`, `close.ts`, `profile.ts`; `src/preload/index.ts` | 수명주기·권한·검증·CJS bridge·닫기, Task 4~5 |
| `src/renderer/index.html`, `main.tsx`, `App.tsx`, `styles.css`, `global.d.ts` | 로컬 renderer·CSP·앱 골격, Task 4~5 |
| `src/renderer/state/useTimeline.ts`, `useEditor.ts`; `components/Toolbar.tsx`, `ProjectList.tsx`, `EditorPanel.tsx`, `ConfirmDialog.tsx`, `StatusNotice.tsx` | 단일 snapshot·편집·포커스·오류, Task 5 |
| `src/visualization/gantt.ts`, `viewport.ts`, `calendar.ts`; `src/renderer/components/GanttView.tsx`, `CalendarView.tsx`, `DayScheduleList.tsx` | 순수 배치와 실제 조회, Task 6~7 |
| `tests/fixtures/timeline.ts`; `tests/unit/*.test.ts`, `tests/ui/*.test.tsx`, `tests/native/*.case.ts`, `tests/e2e/*.spec.ts` | 업무·DB·UI·Electron 경로의 독립 검증 |
| `tests/native/runner.cjs`, `scripts/testing/run-native.mjs`, `tests/e2e/{fixture,main}.ts`, `electron.vite.test.config.mts`, `playwright.config.mts` | Electron ABI로 실행·프로필 격리·실패/시간 제한·artifact |
| `.github/workflows/app.yml`, `electron-builder.yml`, `docs/release/windows-validation.md`, `user-guide.md` | 앱 CI와 설치 결과, Task 1~9 단계별 확장 |

공유 DTO는 승인 IPC 문서의 필드를 그대로 갖는다. `Id=string`은 양의 64비트 정수 정규 십진수,
`BusinessDate=string`은 검증된 날짜, `YearMonth={year:number;month:number}`다.
`TimelineSnapshot={projects:Project[];schedules:Schedule[]}`,
`Result<T>={ok:true;data:T}|{ok:false;error:{code:ErrorCode;message:string;field?:string}}`.
입력/반환 타입은 `TimelineApi`의 승인된 8개 메서드로만 노출한다. `window.simpleTimeline: TimelineApi`다.
main 내부 BigInt는 DTO 변환 전에 십진 문자열로 바꾼다. 채널·범용 invoke·경로·SQL을 renderer로 노출하지 않는다.

## 실행 명령·환경 계약

직접 의존성은 조사 표 22종 중 별도 `@electron/rebuild`를 제외한 21종이다. 재빌드는 builder가 lockfile에 고정한 내부 경로를 쓴다.
Task 1에서 정확 버전(범위 기호 없이)과 npm lockfile을 생성한다. 이후 설치는 `npm ci`다.
스테이지 4에서는 설치하지 않았다. 스테이지 5~7에서 아래 명령을 구현·실행했다.

| 후속 명령 | 도입 작업·내용 |
| --- | --- |
| `npm run typecheck` | Task 1: domain tsconfig를 `tsc --noEmit`으로 검사, Task 4부터 node/web tsconfig도 별도 검사. renderer는 Node 타입/DB import 금지 |
| `npm run test:unit` | Task 1: `vitest run --config vitest.config.mts`, `tests/unit`만. native addon import 금지 |
| `npm run test:tz` | Task 1: Node launcher로 3개 TZ의 동일 unit 검사 실행 |
| `npm run test:native` | Task 2: `tsc -p tsconfig.native.json && node scripts/testing/run-native.mjs` |
| `npm run rebuild:native` | Task 2: `electron-builder install-app-deps`, postinstall에도 같은 명령. Electron target 고정 |
| `npm run dev` / `npm run build` | Task 4: `electron-vite dev` / typecheck 후 `electron-vite build` |
| `npm run test:ui` | Task 5: `vitest run --config vitest.ui.config.mts`, jsdom·bridge fake |
| `npm run build:test` | Task 5: `electron-vite build --config electron.vite.test.config.mts`, 별도 테스트 진입점과 `artifacts/test-app` 출력 |
| `npm run test:e2e` | Task 5: build:test 후 `playwright test --config playwright.config.mts`. 제품 bootstrap·preload·renderer를 실제 Electron에서 실행 |
| `npm run verify:app` | Task 5부터 `node scripts/testing/verify-app.mjs`, 현재 typecheck → test:release → test:tz(unit 포함) → UI → build → native → e2e 순서, 어느 실패도 비정상 종료 |
| `npm run test:packaged` | Task 9: `node scripts/testing/packaged-smoke.mjs`로 산출물 확인 후 `playwright test --config playwright.packaged.config.mts`, 임시 Windows 사용자/VM에서만 실행 |
| `npm run dist:win` | Task 9: build 후 `node scripts/release/build-windows.mjs`가 clean SHA·기존 출력 검사, Windows x64 NSIS·패키지 검사·manifest 생성 |

Node용 better-sqlite3 테스트를 Vitest에서 실행하지 않는다. npm postinstall로 Electron ABI로 맞춘 addon을
Electron runner가 로드한다. Node와 Electron의 Node 버전이 같아도 ABI가 다르다.
native 테스트는 `app.whenReady()` 뒤 테스트 배열을 실행하는 CJS runner다. `NativeCase={name:string;run(ctx:NativeContext):void|Promise<void>}`,
각 `.case.ts`는 `cases: NativeCase[]`를 export한다. runner는 성공/실패 수를 기록하고 실패 시 `app.exit(1)` 한다.
native tsconfig는 CommonJS로 `src`와 `tests/native`를 `artifacts/native/`에 같은 상대 구조로 컴파일한다.
runner는 그 아래 `tests/native/*.case.js`를 발견하고 `cases`를 실행한다. 런처는 60초 제한·프로세스 종료·JSON/로그 보존을 담당한다. 잘못된 일반 Node 런타임이면 즉시 실패한다.
DB/마이그레이션 원리는 실제 임시 DB를 쓰고, 디스크 가득참 등 재현 어려운 경로만 좁은 I/O seam으로 주입한다.

Linux headless 실행은 GUI 라이브러리와 Xvfb가 필요하다. `xvfb-run -a npm run verify:app`,
Windows는 `npm run verify:app`를 사용한다. Electron sandbox를 꺼서 통과시키지 않는다.
현재 클라우드에서 실행이 불가능하면 원인을 기록하고 Windows CI의 실제 실행 결과로 해당 검증을 확보한다.
CI는 기존 repository-harness를 유지하고 별도 app workflow를 단계별 확장한다.
`node_modules`를 Node/Electron 또는 OS/CPU 사이에 공유하지 않고 npm 다운로드 캐시만 사용한다.
verify:app은 `artifacts/app/`에 SHA·OS·런타임·명령·실패/미실행을 기록하고 CI도 이 명령/로그를 보존한다.
그 보고서는 `repository-harness-only` 결과와 별개이며 실제 설치 검증을 포함하지 않는다. 테스트 미발견/skip/timeout을 성공으로 바꾸지 않는다.

## Task 1: 순수 도메인·공유 계약 (스테이지 5)

**Files:** Create `package.json`, `package-lock.json`, `.node-version`, `tsconfig.json`, `vitest.config.mts`,
`src/shared/{types,api}.ts`, `src/domain/{date,normalize,sort}.ts`, `tests/fixtures/timeline.ts`,
`tests/unit/{date,normalize,sort}.test.ts`, `scripts/testing/run-unit-tz.mjs`, `tsconfig.domain.json`, `.github/workflows/app.yml`.

**Interfaces:** Produces `parseBusinessDate(value:unknown): BusinessDate`, `toOrdinal(date:BusinessDate):number`,
`fromOrdinal(value:number):BusinessDate`, `inclusiveDays(start:BusinessDate,end:BusinessDate):number`, `monthBounds(ym:YearMonth):{start:BusinessDate;end:BusinessDate}`,
`shiftMonth(ym:YearMonth,delta: -1|1):YearMonth|null`, `normalizeName(unknown):string`, `normalizeParticipants(unknown):string[]`,
`normalizeColor(unknown):string`, `compareIds(a:Id,b:Id):number`, `sortSnapshot(snapshot):TimelineSnapshot`.
잘못된 입력은 `DomainValidationError(field:string,message:string)`를 던진다. 공유형은 위 인터페이스 지도를 따른다.

- [x] **Step 1 — RED:** 날짜·입력·순서 테스트를 먼저 만들고 아래 기대값을 고정한다.

  ```ts
  expect(inclusiveDays('2028-02-28', '2028-03-01')).toBe(3);
  expect(toOrdinal('9999-12-31')).toBe(3652059);
  expect(fromOrdinal(3652059)).toBe('9999-12-31');
  expect(normalizeParticipants([' 민수 ', '', '민수', 'Jin', 'jin'])).toEqual(['민수', 'Jin', 'jin']);
  expect(compareIds('9', '10')).toBeLessThan(0);
  ```

  1900-02-29/0000/고정 자릿수 위반/시각 포함/역전 기간을 거부하고 2000-02-29와 0001년을 허용한다.
  Unicode 앞뒤 공백을 정리하고 내부 공백/대소문자/중복 이름은 유지한다. 색상은 대문자 `#RRGGBB`다.
- [x] **Step 2 — RED確認:** `npm run test:unit -- tests/unit/date.test.ts tests/unit/normalize.test.ts tests/unit/sort.test.ts`。
  대상 함수 미구현에 따른 실패를 확인한다. 설정/테스트 발견 실패는 먼저 수정한다.
- [x] **Step 3 — GREEN:** 위 함수와 DTO만 구현한다. fixture는 핫픽스 3건·빈 프로젝트·동명/동기간 일정 5건을 포함한다.
  renderer/DB 의존성을 넣지 않고 다른 TZ에서도 같은 결과가 나오는 fixture를 준비한다.
- [x] **Step 4 — 검증:** typecheck와 `npm run test:tz`로 UTC / America/New_York / Asia/Seoul의 unit 자식 프로세스를 실행한다.
  cross-platform Node launcher가 환경변수를 설정하며 Windows shell의 `TZ=...` 구문에 의존하지 않는다. CI도 같은 검사를 실행한다.
- [x] **Step 5 — Commit:** `node scripts/harness/run.mjs verify` 후 이 작업 파일만 커밋. 메시지 `feat: add date-only domain and shared contracts`.

## Task 2: 실제 SQLite 스키마·CRUD·원자 삭제 (스테이지 5)

**Files:** Create `src/main/db/{schema,repository}.ts`, `tests/native/{runner.cjs,repository.case.ts}`,
`scripts/testing/run-native.mjs`, `tsconfig.native.json`; Modify `package.json`, app workflow.

**Interfaces:** Consumes Task 1 DTO/정규화. Produces `openDatabase(path:string):DatabaseHandle`,
`createRepository(db:DatabaseHandle, clock:()=>string):Repository`. Repository는 `getSnapshot():TimelineSnapshot`과
승인 API의 프로젝트/일정 CRUD에 대응하는 **동기** 메서드(성공 DTO 반환, 실패 예외)를 갖는다.
DB 연결은 main에만 있고 `safeIntegers`로 읽어 ID를 변환한다. 오류→Result는 Task 4에서 한다.

- [x] **Step 1 — RED:** 임시 실제 DB에 대해 부모 없는 일정 거부, 참여자 순서·중복, 생성 정렬,
  `sqlite_sequence`를 이용한 ID `9007199254740993`의 문자열 왕복, 날짜 CHECK의 윤년/범위/역전을 검증한다.
  삭제 도중 하위 일정 DELETE를 ABORT하는 테스트 전용 trigger로 프로젝트·일정·참여자 전부 rollback을 확인한다.
- [x] **Step 2 — RED 확인:** `npm run rebuild:native`, `npm run test:native`를 실행해 미구현 저장소의 assertion 실패 확인.
  로딩/ABI 실패는 검사 실패이며 업무 테스트 성공으로 취급하지 않는다.
- [x] **Step 3 — GREEN:** STRICT 세 테이블·FK cascade·인덱스·prepared statements, 한 트랜잭션 snapshot,
  쓰기/참여자 전체 교체 트랜잭션을 구현한다. 날짜 CHECK는 문자열/월 일수/윤년 산술을 쓰고 자동 보정 함수에 의존하지 않는다.
  main의 JS 정규화가 Unicode trim 기준이며 SQL 기본 trim만으로 대체하지 않는다.
- [x] **Step 4 — 검증:** `npm run test:native`에서 FK ON·DELETE journal·FULL·busy_timeout 3000, NOT_FOUND,
  중복 이름 허용·메타데이터 유지·재열기 데이터 일치를 확인. runner는 완료 후 연결·임시 경로를 정리한다.
  테스트용 schema trigger와 sequence 조작은 제품 경로에 넣지 않는다. Windows CI도 실행한다.
- [x] **Step 5 — Commit:** 하네스도 통과한 뒤 `feat: persist timeline with atomic SQLite transactions`.

## Task 3: DB 수명주기·마이그레이션·실패 시 보존 (스테이지 5)

**Files:** Create `src/main/db/{lifecycle,migrations}.ts`, `src/main/profile.ts`, `tests/native/lifecycle.case.ts`.

**Interfaces:** Consumes Task 2. Produces `initializeStorage(profileDir:string, migrations:Migration[]):Promise<StorageState>`,
`Migration={version:number;up(db:DatabaseHandle):void}`, `StorageState={state:'ready';db;repository}|{state:'blocked';error}`.
프로필 생성·사본 I/O를 주입할 좁은 테스트 seam은 renderer로 노출하지 않는다.

- [x] **Step 1 — RED:** 없는 파일에서만 신규 생성, 기존 0바이트/손상/다른 앱 DB 보존, 고버전 거부,
  테스트용 v1→v2 성공·실패·사본 실패·FK 위반·권한/I/O 오류를 검증한다.
  사본 생성 실패 때 user_version과 원본 바이트가 그대로인지 검사한다.
- [x] **Step 2 — RED 확인:** `npm run test:native`에서 lifecycle assertion 실패 확인.
- [x] **Step 3 — GREEN:** 파일 존재를 구분하고 기존 파일은 `fileMustExist`로 연다. 신규 파일에만
  앱 식별용 `application_id=1398033486`와 schema v1을 한 트랜잭션으로 기록한다.
  기존 파일의 header·application_id·quick_check·foreign_key_check·user_version을 확인하고 모르는 DB는 수정하지 않는다.
  기존 v0/잘못된 파일을 신규 데이터로 간주하지 않는다. 초기화 도중 끊긴 신규 파일도 다음 실행에 차단·보존한다.
- [x] **Step 4 — GREEN:** 업그레이드 전 `backup()` 완료→readonly 사본 검증→닫기, 이후 버전별 트랜잭션과 user_version 갱신.
  각 실패 단계 rollback·DB 사용 차단, 사본과 원본 자동 삭제/교체 금지. 재실행/업데이트 경로는 고정 프로필을 사용한다.
- [x] **Step 5 — 검증·Commit:** native와 unit·하네스 통과 후 `feat: preserve database across startup and migrations`.
  Windows 실제 디스크 부족/비정상 종료는 Task 9에 남기고, 여기서는 seam의 오류 변환 및 실제 SQLite 잠금/rollback을 구분해 기록한다.

## Task 4: 안전한 Electron 실행·preload·IPC (스테이지 5)

**Files:** Create `electron.vite.config.mts`, `src/main/{index,bootstrap,window,ipc,errors}.ts`,
`tsconfig.node.json`, `tsconfig.web.json`, `src/preload/index.ts`,
`src/renderer/{index.html,main.tsx,global.d.ts,App.tsx}` 초기 골격,
`tests/unit/ipc.test.ts`, `tests/native/security.case.ts`; Modify build/typecheck 설정.

**Interfaces:** Consumes `StorageState`, `Repository`, `TimelineApi`. Produces
`bootstrap(options:BootstrapOptions):Promise<ApplicationHandle>`,
`registerTimelineIpc(window:BrowserWindow, storage:StorageState, allowedUrl:string):()=>void`,
`isTrustedSender(event,window,allowedUrl):boolean`, `toPublicError(error:unknown):ApiError`.
root package는 CommonJS 기본값을 유지하고 `main=out/main/index.cjs`로 둔다. production 출력은 `out/main/index.cjs`, `out/preload/index.cjs`(각 단일 CJS bundle), `out/renderer/index.html`.
sandbox preload는 electron 외 require를 남기지 않고 공유 상수도 bundle에 포함한다.

- [x] **Step 1 — RED:** 미허용 sender/하위 frame/URL/닫힌 창, 추가 필드·잘못된 타입·confirmed 누락,
  BigInt/SQL/stack 유출 거부 테스트를 작성. 반환 성공은 commit 이후인지 검사한다.
- [x] **Step 2 — RED 확인:** `npm run test:unit -- tests/unit/ipc.test.ts`, build 후 `npm run test:native`.
  초기 미구현 bridge/security assertion이 실패해야 한다.
- [x] **Step 3 — GREEN:** DB 열기 전 단일 인스턴스 lock, 고정 프로필, BrowserWindow 격리 세 옵션,
  production 로컬 index의 정확 URL/최상위 frame 확인, 개발 서버는 고정 origin만 허용한다.
  탐색·새 창·권한 요청 차단. 8채널만 handle하고 clone 가능한 DTO/정제 오류만 반환한다.
  DB 초기화 실패는 main 안내창에 경로·원인, renderer에는 승인 status/errorCode만 전달한다.
- [x] **Step 4 — 검증:** `npm run build`, unit/native. 실제 창에서 Node require 없음·preload API 키 8개,
  외부 탐색 거부·sandbox/contextIsolation/NodeIntegration 설정·두 번째 실행 시 DB 중복 열기 방지 확인.
  CSP는 production script-src self, 필요한 로컬 CSS/좌표 style만 허용. dev HMR 허용을 production에 복사하지 않는다.
- [x] **Step 5 — Commit:** 하네스 통과 후 `feat: connect isolated Electron UI through validated IPC`.

## Task 5: CRUD 패널·단일 캐시·실패·닫기 통합 (스테이지 5)

**Files:** Create renderer의 state/hooks·Toolbar/ProjectList/EditorPanel/ConfirmDialog/StatusNotice·CSS,
`src/main/close.ts`, `scripts/testing/verify-app.mjs`, `vitest.ui.config.mts`, `playwright.config.mts`, `tests/e2e/{fixture,main}.ts`, `electron.vite.test.config.mts`,
`tests/ui/{editor,state}.test.tsx`, `tests/e2e/{crud,security}.spec.ts`; Modify App·main·app workflow.

**Interfaces:** Consumes `window.simpleTimeline`. Produces `useTimeline(api:TimelineApi)`의
`{snapshot:TimelineSnapshot|null,phase:TimelinePhase,error:ApiError|null,refresh:()=>Promise<void>,mutate}`,
phase는 loading/ready/saving/stale/uncertain/blocked다.
`mutate<K extends MutationName>(method:K,input:MutationInput<K>):Promise<Result<MutationOutput<K>>>`의
MutationName은 공유 API 중 create/update/delete 여섯 메서드이며 입력/반환은 그 계약에서 추출한다.
`useEditor()`는 kind·원본 ID·draft·dirty·호출 요소를 유지한다. 시각화 컴포넌트는 이 공유 상태만 사용한다.
시각화 도입 전에는 프로젝트/일정의 검증용 목록에서 CRUD를 확인한다. 별도의 영구 ‘목록 모드’를 제품 기능으로 추가하지 않는다.

- [x] **Step 1 — RED:** bridge fake UI 테스트에 앞뒤 공백·동명·참여자 입력 행·기본 색상/날짜·역전 오류·삭제 확인,
  저장 중 중복 클릭·실패 입력 보존·commit 후 refresh 실패·응답 소실 후 자동 create 재전송 0회를 고정한다.
  긴 이름과 overlay의 Tab/Escape·버리기/계속 편집·제출 후 포커스 복귀도 검사한다.
- [x] **Step 2 — RED 확인:** `npm run test:ui -- tests/ui/editor.test.tsx tests/ui/state.test.tsx`.
  아직 없는 동작의 assertion으로 실패해야 한다.
- [x] **Step 3 — GREEN:** 승인 화면의 편집·로딩/오류 상태를 구현. stale/uncertain에서는 재조회 전 CRUD 차단,
  결과 불명 create는 자동 매칭·재전송 금지. 저장·삭제 성공 후에만 snapshot을 갱신한다.
  beforeunload/main 닫기 확인으로 미저장과 저장 중 종료를 처리한다. 새 IPC를 임의 추가하지 않는다.
- [x] **Step 4 — E2E RED→GREEN:** `npm run build && npm run test:e2e -- tests/e2e/crud.spec.ts tests/e2e/security.spec.ts`.
  Playwright `_electron`으로 실제 앱을 열어 프로젝트·개발/QA/배포 생성→수정→재실행→동일 ID/날짜 확인→프로젝트 일괄 삭제를 검증한다.
  실제 renderer에서 require/파일/SQL/raw invoke 없음과 iframe의 bridge 없음·외부 탐색 거부도 검사한다.
  e2e는 별도 test main이 같은 bootstrap에 임시 프로필을 주입해 실제 userData에 접근하지 않는다.
  production main에는 이 override나 테스트 adapter가 없다. 테스트 편의용 API를 preload에 넣지 않는다.
  `BootstrapOptions`는 main 내부의 profileDir·저장소/오류 주입 의존성이며 renderer 입력이 아니다.
- [x] **Step 5 — 검증·Commit:** `npm run verify:app`, 하네스, Ubuntu·Windows app CI 통과 후
  `feat: edit projects and schedules with persistent error-safe UI`.
  스테이지 5 인수인계에서 테스트 프로필·실제 DB·native ABI·미실행 Windows 설치를 구분하고 여기서 멈춘다.

## Task 6: 간트 가상 범위·실제 막대·탐색 (스테이지 6)

**Files:** Create `src/visualization/{gantt,viewport}.ts`, renderer `GanttView.tsx`,
`tests/unit/gantt.test.ts`, `tests/ui/gantt.test.tsx`; Modify App/Toolbar, fixtures.

**Interfaces:** Consumes 날짜 함수·snapshot·선택 연월. Produces
`ganttRange(snapshot,ym):{start:BusinessDate;end:BusinessDate}`,
`ganttRect(schedule,range):{x:number;width:number}`,
`viewportWindow({logicalOffset,viewportSize,unitSize,overscan}):{first:number;lastExclusive:number;origin:number}`,
`monthOffset(ym,range,viewportWidth):{offset:number;outside:boolean}`.
first는 포함, lastExclusive는 제외, origin은 첫 렌더 구간의 논리 px다. 행은 별도
`visibleRows(prefix:readonly number[],offset:number,height:number,overscanRows:number):{first:number;lastExclusive:number}`로 구한다.
React 뷰는 `GanttView({snapshot,selectedMonth,onEditProject,onEditSchedule,onAddSchedule})`.

- [x] **Step 1 — RED:** `ganttRect` 개발/QA/배포 x=280/1148/1316, 폭=868/168/28,
  빈 일정 선택 월·빈 프로젝트·중간 빈 월·극단 3652059일 범위와 clamp를 검사한다.
  동일 1000px viewport에서 전체 범위 크기와 무관하게 날짜 DOM 수가 제한되고 CSS 좌표가 거대해지지 않아야 한다.
- [x] **Step 2 — RED 확인:** unit의 gantt, UI의 gantt를 각각 실행해 미구현 좌표/이동 동작 실패 확인.
- [x] **Step 3 — GREEN:** 월/일 header·이름 열 고정, 프로젝트 56px·일정 44px 행, 이름/막대 편집,
  일당 28px, viewport 양쪽 31일 overscan의 날짜/월만 렌더한다. 행은 높이 누적합과 이진 검색으로 창을 구한다.
  가로 논리 offset와 물리 좌표를 분리하고 전체 논리 범위 스크롤 손잡이·wheel·키보드를 연결한다.
  긴 막대도 렌더 구간과 교차한 x/width만 CSS에 넣고, 전체 기간은 데이터/설명에 유지한다.
  물리 DOM 너비를 전체 약 1억 px로 두지 않는다. 포커스 행은 유지하거나 명시적으로 복귀시킨다.
- [x] **Step 4 — 검증:** `npm run test:unit -- tests/unit/gantt.test.ts`, `npm run test:ui -- tests/ui/gantt.test.tsx`.
  범위 밖 선택 안내, 연월 직접 이동, Home/End/일 단위 이동, 모드 왕복의 위치, CRUD 후 anchor clamp,
  마지막 일정 삭제와 짧은 막대의 이름 경로·포커스 유지·색상 외 구분을 검증한다.
- [x] **Step 5 — Commit:** verify:app·하네스 통과 후 `feat: render full-range virtual gantt with calendar-date navigation`.

## Task 7: 월간 달력·주 분할·3줄과 전체 목록 (스테이지 6)

**Files:** Create `src/visualization/calendar.ts`, renderer `CalendarView.tsx`, `DayScheduleList.tsx`,
`tests/unit/calendar.test.ts`, `tests/ui/calendar.test.tsx`; Modify App.

**Interfaces:** Consumes 날짜 함수·snapshot·ym. Produces `calendarGrid(ym):{weeks:(BusinessDate|null)[][]}`,
`calendarSegments(schedules,ym):Segment[]`, `placeWeek(segments):PlacedSegment[]`,
`hiddenCount(placed,date):number`, `schedulesOnDate(snapshot,date):Schedule[]`.
`Segment={scheduleId,projectId,weekStart,column,span,continuesLeft,continuesRight,startDate,endDate}`;
PlacedSegment에 `lane:number`를 더한다. `CalendarView`는 Gantt와 같은 선택/편집 콜백을 사용한다.

- [x] **Step 1 — RED:** 2021-02/2026-11/12의 4/6/5주, 일~월·월/연도·윤년 경계 분할,
  9999-12 빈 비활성 칸·계속 방향, 같은 기간 5개에서 +2와 전체 목록 5개,
  B/C/A/D 줄 재사용 사례·이름 중복 ID 보존을 검사한다.
- [x] **Step 2 — RED 확인:** `npm run test:unit -- tests/unit/calendar.test.ts`, UI 달력 테스트에서 미구현 assertion 실패 확인.
- [x] **Step 3 — GREEN:** 선택 월과 교차 후 주별 분할, 승인 정렬과 최소 빈 줄 배치.
  인접 월은 숫자만 표시하고 3줄 초과는 날짜별 숨김 수를 계산한다. 더 보기는 원본에서 그날 전체 목록을 조회한다.
  일정 ID로 편집하며 긴 목록은 내부 스크롤, 닫기/편집 후 포커스 복귀와 전문 레이블을 제공한다.
- [x] **Step 4 — 검증:** `npm run test:ui -- tests/ui/calendar.test.tsx`, unit.
  선택 월 바깥 일정 누락/유입 없음, 각 주별 lane이 달라도 같은 ID 연결, 색상/전체 기간 표시·키보드 진입을 확인한다.
- [x] **Step 5 — Commit:** verify:app·하네스 통과 후 `feat: render monthly calendar with accessible overlapping schedules`.

## Task 8: 두 모드·CRUD·극단 범위 통합 (스테이지 6)

**Files:** Create `tests/e2e/{timeline,failures,scale}.spec.ts`; Modify fixtures·App/state·app CI.

**Interfaces:** Consumes Task 1~7의 실제 앱. 새 제품 API를 추가하지 않는다.
불가피한 오류 주입은 별도 test main의 bootstrap 의존성으로만 하며 production main/bundle에는 포함하지 않는다.
오류 모드는 test fixture가 생성한 설정으로 정하고, renderer에는 실제 승인 bridge만 존재한다.

- [x] **Step 1 — RED:** e2e에 핫픽스→모드 전환→선택 월 유지→수정/삭제 양쪽 반영→재실행 현재 월 복귀,
  저장 실패/응답 소실/조회 실패와 중복 create 0회, 범위 밖 월·마지막 일정 삭제를 먼저 작성한다.
- [x] **Step 2 — RED 확인:** build/e2e를 실행하고 새 시나리오의 실제 실패를 기록한다. 기존 구현이 이미 만족하면
  같은 assertion을 중복시키지 않고 빠진 실패 경로를 검증한다. 임의로 정상 기능을 망가뜨려 RED를 만들지 않는다.
- [x] **Step 3 — GREEN:** 부족한 연결/포커스·캐시만 수정한다. 0001~9999 양 끝 이동과 10000개 일정 fixture에서
  전체 데이터 접근·선택·더 보기·현재 viewport 렌더량을 검사한다. fixture 크기는 검증 부하이며 제품 한도가 아니다.
- [x] **Step 4 — 검증:** `npm run verify:app`, 하네스, 두 OS app CI. 1280×800 및 200% 확대 상당 레이아웃,
  긴 Unicode 이름·키보드만으로 추가/편집/삭제·가상 행 밖 포커스 이동을 확인한다.
  CPU/메모리/첫 렌더·스크롤 지연과 환경을 기록하고 프리즈/행 누락을 해결한다. 측정 전 성능 SLA를 만들지 않는다.
- [x] **Step 5 — Commit:** `test: verify timeline persistence and visualization end to end`.
  스테이지 6 결과·테스트·미실행 설치 검증을 인수인계하고 Windows 배포는 시작하지 않는다.

## Task 9: Windows 설치·업데이트·오프라인 실제 검증 (스테이지 7)

**Files:** Create `electron-builder.yml`, `docs/release/{windows-validation,user-guide}.md`,
`scripts/testing/packaged-smoke.mjs`, `tests/e2e/packaged.spec.ts`, `playwright.packaged.config.mts`; Modify package scripts·app CI.

**Interfaces:** Consumes 검증된 build·고정 프로필. 산출물은 정확 버전/CPU/SHA를 붙인 설치 파일과 검증 기록이다.
Windows 지원 버전·CPU, 사용자별/전체 설치, 설치 경로/권한, 서명·배포·제거 데이터 정책은 **이 단계 사용자 결정**이다.
그 결정 전 공개 release나 설치 기본 정책을 임의 확정하지 않는다.

- [x] **Step 1 — 준비·RED:** 승인된 대상의 Windows runner에서 unpacked 앱 launch/DB 쓰기·재실행 smoke를 먼저 구성한다.
  native binding 미포함/잘못된 경로를 실제 검출하는 검사가 있어야 한다. Node용 addon으로 대체해 성공시키지 않는다.
- [x] **Step 2 — GREEN:** ASAR와 native `.node` unpack, 재빌드, 고정 appId/profile, NSIS 대상·서명 옵션을 구성한다.
  `npm ci`, `npm run verify:app`, `npm run dist:win` 후 `npm run test:packaged`로 unpacked 앱을 실제 실행한다.
  production main/bundle에 테스트 진입점·프로필 override가 없다는 것도 별도 Windows 사용자/VM에서 확인한다.
- [x] **Step 3 — 실제 설치 인수(2026-11-04 사용자 범위 조정):** 각 설치본 해시 일치·관리자 요청/보안 경고 없는
  설치/실행·업데이트 후 데이터 보존·정상 제거·재설치/재실행 후 데이터 보존을 사용자 보고로 확인했다.
  Windows Server CI는 별도로 실제 오프라인 수정/삭제·재실행과 snapshot/ID/경로·제거 전후 DB hash를 확인했다.
  원래 계획의 사용자 PC 오프라인 최초 설치/신규 생성·핫픽스 CRUD/두 모드 전체와 상세 환경 정보는 미확인으로 후속에 남긴다.
- [ ] **Step 4 — 상세 후속으로 분리(미실행):** 잠금·권한·용량 부족·강제 종료·손상·고버전·마이그레이션 실패,
  실제 100%/200% Windows 배율과 키보드/보조기술, 사용자가 정한 제거 정책을 확인한다.
  운영 데이터로 손상 실험하지 않는다. 복제한 임시 Windows 사용자/VM을 사용한다.
- [x] **Step 5 — 결과·Commit:** 설치·데이터 위치·오류·백업 제외 한계를 안내서에 기록하고 실제 설치본·해시·절차를 전달했다.
  사용자 기본 설치 인수 결과와 상세 개선/오류 검증의 별도 진행 결정을 기록해 스테이지 7을 마무리한다.
  CI 빌드나 unpacked smoke만으로 설치/오프라인/업데이트 성공을 선언하지 않는다. 미실행을 통과로 처리하지 않는다.
  확인한 결과와 인수 범위 조정만 검증 후 일반 commit·push한다. 공개 배포는 사용자가 정한 범위에서만 한다.

Task 9 현재 근거: Windows 11 x64·사용자별 설치·제거 후 DB 보존·서명 없는 비공개 CI는 사용자 확정이다.
소스 `036ee00`에서 두 OS 앱 CI와 Windows Server 실제 설치 lifecycle이 통과해 Step 1~2를 확인했다.
2026-11-04 사용자 보고로 조정된 Step 3 기본 설치 인수를 확인했다.
원래 Step 3의 상세 오프라인 실기와 Step 4 물리 실패·배율/Narrator는 미확인/미실행인 후속 작업이다.
사용자가 이 항목들을 이번 MVP 인수 범위에서 분리했으며 제품 요구나 미실행 결과를 소급 변경하지 않는다.
실제 근거와 남은 항목은 [Windows 검증 기록](../../release/windows-validation.md)을 따른다.

## 요구사항과 검증 소유권

| 승인 계약 | 구현·검증 위치 |
| --- | --- |
| 날짜/입력/참여자/정렬/선택 연월 | Task 1 순수 함수, Task 2 DB, Task 5 기본값, Task 8 전환/재실행 |
| DB 경로/단일 인스턴스/보존/마이그레이션/연쇄 삭제 | Task 2~4 native, Task 5 실제 Electron CRUD, Task 9 설치/업데이트 |
| 격리/8개 IPC/검증/정제 오류 | Task 1 공유 타입, Task 4 실제 창/발신자, Task 5 security e2e |
| CRUD/미저장/실패/포커스/빈 상태 | Task 5 UI·e2e, Task 8 두 모드·오류·확대, Task 9 native dialog/실제 보조기술 |
| 전체 범위/월·일/하루/가상 이동 | Task 6 unit·UI, Task 8 극단 범위·성능 |
| 월요일/4~6주/연·월·주 경계/3줄/전체 더 보기 | Task 7 unit·UI, Task 8 실제 두 모드 |
| Windows 설치/오프라인/업데이트/제거 | Task 9 실제 Windows 결과. 다른 검사의 성공으로 대체하지 않음 |

## 계획 자체 검토·승인·종료

- 도메인·저장·IPC·화면·시각화 요구를 Task 1~9에 대조하고, Review Focus 다섯 경로의 소유 테스트를 명시했다.
- 타입·메서드명은 공유 지도에서 출발한다. 구현 시 승인 계약을 바꾸어야 하면 먼저 별도 결정으로 기록한다.
- 계획 작성 당시에는 저장소 하네스와 공식 자료 조사만 실행했다. 이후 Task 1~5의 실제 검증은 스테이지 5 실행 기록을 따른다.
  후속 시각화·설치 명령을 통과한 것으로 표현하지 않는다.
- 사용자는 2026-11-03 ‘계획 승인, 스테이지 4 마무리’로 계획 전체를 승인했다.
  인수인계와 최종 검증 후 main에 직접 커밋·push한다.
- 스테이지 5는 사용자 실행 요청 후 직접 구현·독립 검토로 진행했다. 후속 단계도 해당 단계 실행 요청을 확인한다.
