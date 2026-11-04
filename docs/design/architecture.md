# Electron 구조와 IPC 계약

작성일: 2026-11-03. 스테이지 2 사용자 승인 설계.
이 문서는 승인된 계약이다. 현재 구현과 검증 근거는 마지막 절에서 연결하며 차이를 별도로 표시한다.
[도메인 규칙](domain-rules.md)을 유지하며 저장 상세는 [저장 설계](storage.md)에 둔다.

## 목적과 범위

Windows 개인용 오프라인 일정 앱에서 화면과 저장 권한을 분리하고,
실제 저장에 성공한 데이터만 두 조회 모드에 반영한다.
Teams·서버·로그인·동기화·자동 업데이트·수동 백업/복원은 MVP 범위 밖이다.
화면 배치는 [화면 설계](experience.md), 고정 버전은 [package.json](../../package.json)을 따른다.
저장 실패를 성공이나 빈 데이터로 표시하는 것을 허용하지 않는다.

## 접근 비교와 사용자 선택

- main이 SQLite를 소유: 프로세스와 실패 경로가 단순하고 트랜잭션을 한곳에서 관리한다.
  동기 DB 작업이 길면 main 응답이 지연될 수 있어 짧은 쿼리·트랜잭션을 사용한다.
- 별도 DB 프로세스: 긴 작업 격리에 유리하지만 종료·재연결·요청 실패 계약이 추가된다.

사용자는 main 소유 방식을 선택했다. 향후 측정에서 응답 지연이 확인되면 별도 프로세스를 재검토한다.
이 선택 자체가 대용량 성능이나 Windows 검증의 근거는 아니다. 실행 결과는 아래 검증 기록을 따른다.

## 책임과 보안 경계

- main: 앱 수명주기·창·단일 인스턴스 정책, IPC 발신자/입력 검증, 도메인 검증,
  SQLite 연결·쿼리·트랜잭션·마이그레이션·로그를 소유한다.
- preload: `contextBridge`로 아래 고정 메서드만 노출한다. 범용 `send/invoke`,
  채널명·SQL·파일 경로·Electron 객체·이벤트 객체를 renderer로 넘기지 않는다.
- React renderer: 입력·표시·선택 연월·편집 상태와 조회 캐시를 관리한다.
  Node.js·SQLite·파일 시스템 권한이 없다. 입력 사전 검사는 편의 기능이며 main 검증을 대체하지 않는다.
- 순수 도메인 함수: 날짜 유효성·기간·정규화·정렬 의미. Electron·UI·DB와 독립적이다.

창은 `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`로 만든다.
패키지에 포함한 로컬 UI만 로드하고 CSP로 실행 소스를 제한한다. 임의 탐색·새 창·webview와
권한 요청은 거부한다. 개발 서버 허용은 개발 환경의 정확한 origin으로만 제한한다.
main은 IPC마다 소유 BrowserWindow의 최상위 frame과 허용된 URL을 확인한다.
하위 frame·외부 페이지·닫힌 창의 호출을 거부한다. 반환값은 복제 가능한 일반 DTO만 사용한다.
SQL은 준비된 문장에 값을 바인딩하고 renderer 문자열을 SQL 구문으로 결합하지 않는다.

## 제한된 API

메서드와 채널은 아래의 일대일 대응만 허용한다. 모두 `invoke/handle` 요청·응답이다.
조회 데이터가 두 모드에 함께 필요하므로 MVP는 전체 snapshot을 한 읽기 트랜잭션으로 제공한다.
프로젝트별 조회는 이 snapshot을 `projectId`로 선택한다. 불필요한 범용 조회 API는 두지 않는다.

| preload 메서드 / 채널 | 입력 data | 성공 data |
| --- | --- | --- |
| `getStatus` / `app:status` | 없음 | `{state: 'ready' 또는 'blocked', errorCode?: ErrorCode}` |
| `getSnapshot` / `timeline:snapshot` | 없음 | `{projects: Project[], schedules: Schedule[]}` |
| `createProject` / `project:create` | `{name, color, participants}` | 저장된 `Project` |
| `updateProject` / `project:update` | `{id, name, color, participants}` | 저장된 `Project` |
| `deleteProject` / `project:delete` | `{id, confirmed: true}` | `{id}` |
| `createSchedule` / `schedule:create` | `{projectId, name, startDate, endDate}` | 저장된 `Schedule` |
| `updateSchedule` / `schedule:update` | `{id, name, startDate, endDate}` | 저장된 `Schedule` |
| `deleteSchedule` / `schedule:delete` | `{id}` | `{id}` |

- 모두 입력은 plain object, 필드 형식·필수값·알 수 없는 필드 거부를 main에서 검사한다.
  인자 없는 API에는 추가 인자를 허용하지 않는다. 식별자는 양의 64비트 정수의 정규 십진 문자열이다.
- 이름·참여자·날짜 정리는 도메인 규칙을 그대로 따른다. color는 `#RRGGBB`이며 대문자로 정규화한다.
  기본값 `#2563EB`와 색상 입력은 [화면 설계](experience.md)를 따른다. 이름 길이 등 새로운 업무 제한을 만들지 않는다.
- `Project`: `{id, name, color, participants: string[], createdAt, updatedAt}`.
  `Schedule`: `{id, projectId, name, startDate, endDate, createdAt, updatedAt}`.
  시각은 UTC ISO 문자열이고 업무 날짜와 혼합하지 않는다. 생성 순서는 저장 ID를 따른다.
- 일정의 소속 프로젝트 변경 기능은 추가하지 않는다. update는 전체 편집 필드를 받아 검증한다.
  없는 ID는 생성으로 대체하지 않는다. 생성 시 식별자·시각은 main에서만 부여한다.
- 삭제 확인 UI는 [화면 설계](experience.md)를 따른다. `confirmed`는 UI 실수 방지 계약이며 보안 인증 수단이 아니다.

## 응답·오류와 화면 상태

모든 API는 `{ok: true, data}` 또는 `{ok: false, error: {code, message, field?}}`를 반환한다.
`message`는 한국어 안내이며 SQL·스택·임의 파일 내용·개인 데이터를 포함하지 않는다.
승인 설계는 main에서 원시 예외를 기록한 뒤 정제하는 것이다. 현재 [IPC dispatch](../../src/main/ipc-core.ts)는
예외를 [공개 오류](../../src/main/errors.ts)로 변환하지만 원시 예외를 로그에 남기지 않는다.
이 차이는 후속 코드 보완 대상이며 기록된 것으로 간주하지 않는다. preload의 전송 실패는 `IPC_UNAVAILABLE`로 정규화한다.

| code | 의미·처리 |
| --- | --- |
| `VALIDATION_ERROR` | 형식·업무 규칙 오류. field와 함께 입력 보존 |
| `NOT_FOUND` | 프로젝트/일정이 없음. 최신 snapshot 재조회 |
| `FORBIDDEN` | 허용되지 않은 발신자 또는 호출 |
| `DB_NOT_READY` | 초기화/마이그레이션 실패 등으로 편집 불가 |
| `DB_BUSY` | 잠금으로 저장 불가. 제한 시간 후 실패, 자동 무한 재시도 금지 |
| `STORAGE_FULL` | 용량 부족. 저장 실패 안내·입력 보존 |
| `STORAGE_IO` | 접근 권한·파일 I/O 실패 |
| `DB_CORRUPT` | 손상 감지. 기존 파일 보존·편집 차단 |
| `SCHEMA_TOO_NEW` | 더 최신 앱의 DB. 다운그레이드 마이그레이션 금지 |
| `IPC_UNAVAILABLE` | 연결 소실. 저장 여부를 단정하지 말고 재조회 |
| `INTERNAL_ERROR` | 예상 밖 오류. 성공으로 처리하지 않음 |

main은 DB commit 후에만 성공을 반환한다. renderer는 처리 중 중복 제출을 막고 낙관적 저장을 하지 않는다.
성공 후 snapshot을 재조회해 두 모드의 단일 캐시를 갱신한다. 저장은 성공했으나 재조회가 실패하면
‘저장 성공, 새로고침 실패’로 구분한다. 실패한 입력과 마지막 정상 데이터를 유지하며 오래된 데이터임을 표시한다.
응답이 끊긴 create를 자동 재전송하지 않는다. 재조회 후 사용자가 판단한다.
단일 창에서 쓰기 요청은 순차 처리한다. 다중 창 동시 편집·revision 충돌 기능은 추가하지 않는다.
선택 연월은 메모리에만 유지하며 앱 시작 시 현지 현재 월로 초기화한다.

## 근거·승인·현재 검증

공식 근거와 확인 범위는 [Electron·SQLite 조사](../research/2026-11-03-electron-sqlite.md)를 참조한다.
사용자는 2026-11-03 ‘설계 승인, 스테이지 2 마무리’를 선택하여 문서 전체를 승인했다.
현재 구현은 [main 진입](../../src/main/bootstrap.ts), [창 권한](../../src/main/window.ts),
[preload](../../src/preload/index.ts), [8개 API 타입·채널](../../src/shared/api.ts), [화면 상태](../../src/renderer/state/useTimeline.ts)에 있다.
IPC 거부·오류 변환·원자 삭제·저장 실패 검증은 [스테이지 5 기록](../implementation/stage-05.md)과
[현재 검증 경로](../harness/validation.md)를 따른다. 자동화 통과를 별도의 침투 테스트 결과로 확대하지 않는다.
Windows 설치와 사용자 인수는 [스테이지 7 기록](../implementation/stage-07.md)에 연결한다.
