# SQLite 저장 설계

작성일: 2026-11-03. 스테이지 2 사용자 승인 설계.
[도메인 규칙](domain-rules.md), [프로세스·IPC 계약](architecture.md)을 따른다.
이 문서는 승인된 저장 계약이다. 현재 구현·검증 근거와 계약의 차이는 아래에 구분한다.

## 드라이버와 호환성

승인된 에이전트 제안: `better-sqlite3`를 main 전용으로 사용한다.
동기 API와 명시적 트랜잭션이 짧은 로컬 CRUD에 적합하다. `node:sqlite`는 Electron에 포함된 Node의
지원 상태에 결합되고, 비동기 드라이버는 이 MVP의 짧은 작업에 별도 복잡성을 더하므로 우선 선택하지 않는다.
이 선택은 공식 자료 검토 후 문서 전체 승인으로 확정했다. 현재 고정 버전은 [package.json](../../package.json)을 따른다.

Electron의 ABI와 일반 Node ABI는 다를 수 있다. Electron 버전·Windows CPU 대상별로
`@electron/rebuild` 또는 패키징 도구의 동등한 재빌드를 적용하고 네이티브 `.node` 파일을
asar 밖에 포함한다. 빌드 중 prebuilt 다운로드/컴파일이 필요할 수 있으나 설치된 앱 실행에는
인터넷이나 컴파일러를 요구하지 않는다. 대상별 prebuilt 존재를 추정하지 않는다.
현재 [빌드 설정](../../electron-builder.yml)은 native 준비와 asarUnpack을 설정한다.
better-sqlite3 13의 선택된 Windows binding은 `prebuilds/win32-x64.node`이며 실제 로딩·설치 검증은
[Windows 기록](../release/windows-validation.md)을 따른다. 모든 환경에서 소스 컴파일한 것으로 추정하지 않는다.
공식 근거는 [조사 문서](../research/2026-11-03-electron-sqlite.md)를 따른다.

## 논리 스키마와 불변식

아래는 승인된 내부 표현이며 실제 SQL은 [schema.ts](../../src/main/db/schema.ts)에 있다.
테이블은 STRICT를 사용한다. 이름 중복을 금지하는 UNIQUE는 두지 않는다.

| 테이블 | 필드·제약 |
| --- | --- |
| `projects` | `id INTEGER PRIMARY KEY AUTOINCREMENT`, `name TEXT NOT NULL`, `color TEXT NOT NULL`, `created_at TEXT NOT NULL`, `updated_at TEXT NOT NULL` |
| `project_participants` | `project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE`, `position INTEGER NOT NULL CHECK(position >= 0)`, `name TEXT NOT NULL`, `PRIMARY KEY(project_id, position)`, `UNIQUE(project_id, name)` (BINARY 비교) |
| `schedules` | `id INTEGER PRIMARY KEY AUTOINCREMENT`, `project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE`, `name TEXT NOT NULL`, `start_date TEXT NOT NULL`, `end_date TEXT NOT NULL`, `created_at TEXT NOT NULL`, `updated_at TEXT NOT NULL` |

참여자는 JSON 대신 자식 테이블로 저장한다. 목록 순서·이름 중복·프로젝트와의 연쇄 삭제를
DB 제약으로 표현할 수 있다. 전역 사람 테이블이나 계정·권한은 만들지 않는다.
생성·수정 시 참여자 전체 교체와 프로젝트 변경을 같은 트랜잭션에 넣는다.

- ID는 테이블별 생성 순서다. AUTOINCREMENT로 삭제한 ID를 재사용하지 않는다.
  main 내부는 BigInt 안전 정수 모드, IPC에서는 십진 문자열로 변환해 JavaScript 정밀도 손실을 막는다.
- 생성/수정 시각은 main이 UTC ISO 형식으로 부여한다. 시스템 시계가 되돌아가도 정렬은 ID를 기준으로 유지한다.
  update는 ID와 created_at을 변경하지 않는다.
- 프로젝트 조회는 `id ASC`. 일정 조회는 프로젝트별 `start_date, end_date, id ASC`.
  고정 길이 날짜는 BINARY 문자열 비교로 날짜순을 보장한다. ID 동률은 기본키상 발생하지 않는다.
- `schedules(project_id, start_date, end_date, id)` 인덱스를 둔다.
- main은 엄격한 그레고리력 검증과 이름 정리를 수행한다. DB CHECK에도 비어 있지 않은 정리된 이름,
  `#RRGGBB` 색상, 날짜의 고정 형식·0001~9999·월별 일수·윤년·`start_date <= end_date`를 둔다.
  SQLite 날짜 함수의 자동 보정에 의존하지 않는다. [DB 회귀](../../tests/native/repository.case.ts)에서 경계 사례를 검사한다.
- JS trim과 SQLite 기본 trim은 의미가 다르므로 main의 정규화가 기준이다.
  DB CHECK가 main 검증 전체를 대신한다고 간주하지 않는다.
- 기간·간트 범위·선택 날짜·달력 표시 월은 SQLite에 저장하지 않는다. 기간·범위는 도메인 규칙으로 계산하고 선택 상태는 메모리에서 관리한다.

## 연결·트랜잭션

main만 연결 하나를 소유하며 모든 연결에서 트랜잭션 시작 전에 `PRAGMA foreign_keys = ON`을 설정·확인한다.
MVP는 rollback journal (`journal_mode=DELETE`)과 `synchronous=FULL`을 사용한다.
단일 인스턴스·단일 연결이므로 WAL의 동시 읽기 이점보다 수명주기 단순성을 우선한다.
저널 파일을 손상 찌꺼기로 추정해 삭제하지 않는다. `busy_timeout=3000` 후에는 실패를 반환한다.

프로젝트 삭제는 프로젝트 한 행 삭제와 FK cascade를 하나의 트랜잭션으로 commit한다.
하위 일정·참여자 일부만 삭제되는 성공은 없다. 대상이 없으면 NOT_FOUND다.
생성·수정·참여자 교체도 트랜잭션이며 실패하면 rollback한다. prepared statement만 사용한다.
getSnapshot은 한 읽기 트랜잭션에서 프로젝트·일정·참여자를 읽어 같은 시점의 결과를 반환한다.
외부 파일/사용자 응답 대기·긴 계산은 트랜잭션 안에 넣지 않는다.

## DB 수명주기

사용자는 Q3 선택을 정정하여 아래 권장 정책 전체를 선택했다.

- 고정 앱 정체성의 `app.getPath('userData')/data/timeline.sqlite3` 사용.
  설치 폴더·현재 작업 폴더에 저장하지 않는다. 현재 [profile.ts](../../src/main/profile.ts)는
  앱 데이터의 SimpleTimeline 폴더를 userData로 사용한다. app ID·제품명은 [배포 정책](../release/policy.md)을 따른다.
- `requestSingleInstanceLock`을 DB 열기 전에 획득한다. 두 번째 실행은 첫 창을 활성화하고 종료한다.
- 첫 실행은 DB 파일이 없을 때만 디렉터리·빈 schema를 만든다. 기존 DB 열기 실패와 빈 DB를 구분한다.
- 앱 재실행·일반 업데이트 시 userData와 DB 경로를 유지한다. 설치 파일에 쓰기 가능한 DB를 넣지 않는다.
  제거 후에도 DB를 보존한다. 사용자 선택과 실제 확인 범위는 [사용자 인수](../release/user-acceptance.md)를 따른다.
- 실제 종료 시 진행 중 쓰기를 정리하고 연결을 닫는다. Planrail의 X/Alt+F4는 트레이로 숨기므로 연결과 진행 중 저장을 유지한다.
  트레이 ‘종료’는 [보호 종료 계약](architecture.md#커스텀-창-제어-c안-후속-구현)을 거친다. 비정상 종료 후 SQLite 저널 복구 결과를 확인한다.
- 기존 DB의 열기·검사·마이그레이션 실패 시 원본을 지우거나 빈 DB로 바꾸지 않는다.
  DB 사용을 차단하고 오류 원인·DB 경로·종료/재실행 안내를 제공한다.

## 화면 설정과 메모리 상태

[usePreferences](../../src/renderer/state/usePreferences.ts)는 Chromium 프로필의 localStorage에
`simple-timeline.preferences.v1` 키로 테마·접힌 프로젝트 ID·간트 1일 너비를 저장한다.
SQLite 업무 데이터나 DB 스키마에 넣지 않는다. 기본값은 라이트·모두 펼침·28px이며,
유효하지 않은 날짜 너비는 28px로 복귀한다. localStorage 쓰기 실패는 일정 편집을 차단하지 않는다.

표시명이 Planrail로 바뀌어도 내부 package/appId·SimpleTimeline 프로필·이 설정 키를 유지했다.
기존 DB뿐 아니라 테마·접힘 설정을 이어 쓰기 위한 승인 결정이며 [설치 정책](../release/policy.md)을 따른다.
선택 날짜·달력 표시 월·스크롤·탐색으로 넓힌 범위는 실행 중 상태다. 창을 숨겨도 유지되지만
새 실행에서는 선택일이 오늘로 초기화된다. 설치 제거 후 DB 보존과 설정 보존의 실제 확인 범위는
[Windows 검증 기록](../release/windows-validation.md)을 따른다.

## 마이그레이션·복구

승인된 에이전트 제안: `PRAGMA user_version`으로 스키마 버전을 관리한다.
지원 버전보다 높으면 `SCHEMA_TOO_NEW`로 차단한다. 더 낮으면 순서대로 버전별 트랜잭션을 수행하고
해당 변경과 user_version 갱신을 함께 commit한다. 실패하면 해당 버전을 rollback하고 시작을 중단한다.
마이그레이션 전체 실패 시 원본 유지 방식은 아래 사전 보존으로 보강한다.

시작 시 기존 DB의 무결성(`quick_check`)과 FK(`foreign_key_check`)를 확인한다.
업그레이드 전에는 쓰기를 받지 않는 상태에서 `backup(destination)`으로 일관된 사본을 만든다.
기존 파일을 덮어쓰지 않는 고유 이름(버전·UTC 시각·임의 접미사)의 앱 내부 migration-backups 경로를 사용한다.
Promise 완료를 기다린 후 사본을 readonly로 열어 무결성·FK·원본 user_version을 검증하고 닫는다.
사본 생성/검증 실패 시 마이그레이션하지 않는다. 생성 도중 중단된 파일은 성공 사본으로 취급하지 않는다.
설계는 보존 사본 경로와 대상 버전을 main 로그에 기록하는 것이다. 현재
[lifecycle.ts](../../src/main/db/lifecycle.ts)는 사본 생성·검증·보존을 구현했지만 이 migration 로그는 남기지 않는다.
후속 코드 보완 대상으로 유지한다. 사본을 자동 정리하지 않는다.
이는 내부 업그레이드 안전장치이며 수동 백업·복원 기능이 아니다.
버전별 실패 시 원본에 이전 단계까지 commit된 변경이 있을 수 있으며, 실패 단계는 rollback한다.
어떤 경우에도 자동 교체하지 않고 사본과 현재 파일을 모두 보존한 채 편집을 차단한다.
실패한 원본·사본을 자동 삭제하지 않는다. 자동 복원·파괴적 초기화 버튼은 만들지 않는다.

## 사용자 백업 선택과 한계

사용자는 수동 백업·복원을 MVP에서 제외했다. 내보내기·가져오기·다른 PC 이동 기능도 추가하지 않는다.
사용자가 OS 수준에서 파일을 보존한다면 트레이의 ‘종료’로 앱을 완전히 종료한 뒤 DB와 필요한 저널을 함께 다뤄야 한다.
창 X로 숨긴 상태를 종료로 간주하지 않는다.
앱 실행 중 DB 한 파일 복사를 일관된 백업으로 보장하지 않는다.
내부 마이그레이션 사본도 같은 디스크에 있으므로 디스크·PC 손실 복구나 상시 백업을 보장하지 않는다.
DB 파일은 평문이며 Windows 사용자 파일 권한을 따른다. 별도 암호화·비밀번호 기능은 추가하지 않는다.

## 검증과 남은 범위

현재 [migrations.ts](../../src/main/db/migrations.ts)는 제품 스키마 v1·v2를 지원한다.
[알림 native 회귀](../../tests/native/reminders.case.ts)는 실제 v1→v2 데이터 보존을,
[native lifecycle 회귀](../../tests/native/lifecycle.case.ts)는 현재 버전 이후의 시험용 추가 버전으로 성공·실패를 검사한다.
0.1.0→검증용 0.1.1 설치는 같은 schema이므로 실제 제품 schema 업그레이드의 증거가 아니다.

기존 DB는 application_id 1398033486과 SQLite 헤더·user_version·무결성·FK를 검사한다.
식별된 DB에 rollback journal이 있으면 recovery-backups에 DB·journal과 존재하는 WAL/SHM을 보존한 뒤 SQLite 복구를 시도한다.
이 복구 사본 경로는 로그에 남는다. migration 사본은 `.partial`에 생성·검증하고 최종 이름으로 바꾸므로
미완성 파일을 성공 사본으로 취급하지 않는다. 세부 구현은 [lifecycle.ts](../../src/main/db/lifecycle.ts)를 기준으로 한다.

ID·정렬·FK·원자 삭제·재실행·손상 보존·주입 오류는 [스테이지 5 실행](../implementation/stage-05.md),
현재 검사 명령은 [검증 안내](../harness/validation.md)를 따른다. Windows native 로딩과 설치 lifecycle은
[Windows 검증](../release/windows-validation.md)에 기록돼 있다. 실제 사용자 PC의 물리 오류·오프라인 전체 시나리오 등은
[사용자가 분리한 후속 항목](../release/user-acceptance.md)이며 이번 문서 작업에서 통과로 바꾸지 않는다.

## 일정 알림 schema v2 (0.4.0)

[알림 확정 설계](reminders-and-hierarchy.md)에 따라 [마이그레이션 목록](../../src/main/db/migrations.ts)의 v2가
[알림 SQL](../../src/main/db/reminders.ts)을 적용한다. 기존 v1 생성 SQL과 과거 검증 기록은 보존한다.

- `schedules`에 `reminder_days`(0~365), `reminder_time`(HH:mm), `reminder_start`·`reminder_end`(0/1)를 추가한다.
  기존 일정은 2일 전·09:00·둘 다 꺼짐으로 이관한다. renderer UI 환경 설정과 달리 이 설정은 업무 DB에 저장한다.
- `reminder_deliveries`는 일정 FK(연쇄 삭제), 조합 identity 기본키, `claimed/submitted/failed/unknown`, UTC 기록 시각을 가진다.
  identity는 일정 ID·시작/종료·대상 날짜·N·시각이며 이름과 활성화 스위치는 포함하지 않는다.
- 일정과 알림 설정은 하나의 트랜잭션에서 저장한다. 날짜만 수정하면 기존 설정을 보존해 합성 검증한다.
- OS 전달 전 선점을 commit한다. 재실행 때 미완료 선점은 결과 불명으로 바꾸고 자동 재전송하지 않는다.
  명확한 실패만 사용자 재시도 대상이다. 이력과 OS 전달은 원자적이지 않아 비정상 종료 경계의 누락 가능성이 있다.
- v1→v2는 기존 검증 백업·원자 업그레이드 경로를 따른다. v2를 연 뒤 v1만 아는 구버전 앱으로 되돌리는 것은 지원하지 않는다.
  [native 회귀 테스트](../../tests/native/reminders.case.ts)가 실제 Electron SQLite에서 v1 데이터 보존과 v2 동작을 검증한다.
