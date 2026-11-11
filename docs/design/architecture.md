# Electron 구조와 IPC 계약

작성일: 2026-11-03. 스테이지 2 사용자 승인 설계.
이 문서는 승인된 권한·IPC 계약과 현재 구현의 연결을 설명한다.
2026-11-05 [Planrail 후속 승인](planrail-improvements.md)이 선택 날짜·창 숨김/종료·공통 UI의 이전 동작을 대체한다.
업무 API·저장 권한은 유지하며 검증 근거와 미구현 차이는 별도로 표시한다.
[도메인 규칙](domain-rules.md)을 유지하며 저장 상세는 [저장 설계](storage.md)에 둔다.

## 목적과 범위

Windows 개인용 오프라인 일정 앱에서 화면과 저장 권한을 분리하고,
실제 저장에 성공한 데이터만 두 조회 모드에 반영한다.
Teams·서버·로그인·동기화·자동 업데이트·수동 백업/복원은 최초 MVP 범위 밖이었다.
0.6.0은 [승인된 LAN 공유](lan-project-sharing.md)를 추가했다. 외부 서버·클라우드 계정은 사용하지 않는다.
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
- React renderer: 입력·표시·선택 날짜·달력 표시 월·편집 상태와 조회 캐시를 관리한다.
  Node.js·SQLite·파일 시스템 권한이 없다. 입력 사전 검사는 편의 기능이며 main 검증을 대체하지 않는다.
- 순수 도메인 함수: 날짜 유효성·기간·정규화·정렬 의미. Electron·UI·DB와 독립적이다.

창은 `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`로 만든다.
패키지에 포함한 로컬 UI만 로드하고 CSP로 실행 소스를 제한한다. 임의 탐색·새 창·webview와
권한 요청은 거부한다. 개발 서버 허용은 개발 환경의 정확한 origin으로만 제한한다.
main은 IPC마다 소유 BrowserWindow의 최상위 frame과 허용된 URL을 확인한다.
하위 frame·외부 페이지·닫힌 창의 호출을 거부한다. 반환값은 복제 가능한 일반 DTO만 사용한다.
SQL은 준비된 문장에 값을 바인딩하고 renderer 문자열을 SQL 구문으로 결합하지 않는다.

## 제한된 API

업무 메서드와 채널은 아래의 일대일 대응만 허용한다. 모두 `invoke/handle` 요청·응답이다.
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

## 커스텀 창 제어 (C안 후속 구현)

[승인된 C안](flat-glass-redesign.md)의 기본 제목 표시줄 제거에 따라,
업무 API와 분리된 `window.timelineWindow.command(action)`을 제공한다.
`window:command` 채널은 `minimize`, `toggle-maximize`, `close`, `state` 문자열 한 개만 받으며
동일한 최상위 frame·소유 창·URL 검증을 적용한다. 알 수 없는 명령·잘못된 인수는 거부한다.
결과는 `{ok: boolean, maximized?: boolean}`이며 창 객체·범용 IPC는 노출하지 않는다.
닫기는 `BrowserWindow.close()`를 호출한다. 0.5.0부터 main의 선택창에서 트레이 숨김·완전 종료·취소를 고른다.
숨김은 입력과 진행 중 저장을 유지하며 중복 닫기 요청은 선택창을 쌓지 않는다.
트레이 ‘종료’와 `app.quit()`는 창을 복원한 뒤 저장 대기·미저장 확인을 거쳐 실제 종료한다.
트레이 생성 실패 시에는 안내 후 완전 종료·취소만 제공한다. About은 main의 실제 버전과 기존 아이콘을 사용하는 native 정보창이다.
기본 창은 1707×820 DIP를 표시 모니터의 작업 영역에 제한한다. 자세한 계약은 [데스크톱 개선 설계](calendar-preview-and-desktop-polish.md)를 따른다.
[close guard](../../src/main/close.ts)·[main 수명주기](../../src/main/bootstrap.ts)가 이 구분을 소유하며,
복원·종료를 위해 renderer의 범용 권한이나 새 트레이 IPC를 추가하지 않았다.
구현은 [창 IPC](../../src/main/window-ipc.ts), [타입](../../src/shared/window-api.ts)에 있다.
아래 오류 DTO와 저장 계약은 기존 8개 업무 API의 계약이다.

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
선택 날짜는 메모리에만 유지하며 새 실행 시 현지 오늘로 초기화한다. 트레이 복원은 같은 상태를 이어 쓴다.
일반 날짜 탐색은 달력 표시 월을 맞추지만 드래그로 월을 탐색할 때는 표시 월만 바뀔 수 있다.
테마·프로젝트 접힘·간트 날짜 너비의 영속화는 [저장 설계](storage.md#화면-설정과-메모리-상태)를 따른다.

## renderer 공통 UI와 스타일

현재 UI는 공식 shadcn/ui 소스를 로컬 컴포넌트로 포함하고 Radix의 동작을 사용한다.
[출처·고정 커밋·수정 범위](../../resources/licenses/shadcn-ui-NOTICE.md)와 MIT 원문을 배포 파일에도 포함한다.
기존 C안 배치 위에 [Forest Crystal](forest-crystal.md) 외형을 적용한다. 이전 A Zinc의 재질·색상을 대체하며 공식 예제와 색상·크기·간격은 다를 수 있다.

| 사용처 | 실제 구성·수정 위치 |
| --- | --- |
| 일정 추가의 소속 프로젝트 | [EditorPanel](../../src/renderer/components/EditorPanel.tsx) → [앱 Select](../../src/renderer/components/Select.tsx) → [shadcn Select](../../src/renderer/components/ui/select.tsx) → Radix. 프로젝트 색상·이름·키보드 이동을 연결한다. 일정 편집에서는 읽기 전용이다. |
| 날짜 입력·선택 달력 | [DatePicker](../../src/renderer/components/DatePicker.tsx)는 shadcn Input·Button·Popover·Select를 조합한다. 날짜 격자는 기존 [calendarGrid](../../src/visualization/calendar.ts)를 사용하며 shadcn Calendar/React DayPicker로 교체하지 않았다. 한국어·월요일 시작·0001~9999년 계약을 유지하기 위한 구성이다. |
| 프로젝트 목록·날짜 팝오버 | [앱 Popover](../../src/renderer/components/Popover.tsx)가 shadcn/Radix 위치 계산과 로컬 portal container를 연결한다. 편집 패널 안의 중첩 선택기도 같은 DOM 포커스 범위를 유지한다. |
| 아이콘 버튼·툴팁 | [IconButton](../../src/renderer/components/Icon.tsx)은 shadcn Button을 사용하고 tooltip을 명시적으로 켠 상단 6개 버튼만 Tooltip으로 감싼다. [App](../../src/renderer/App.tsx)의 Provider가 250ms 지연을 설정한다. |
| 삭제·변경 버리기 확인 | [ConfirmDialog](../../src/renderer/components/ConfirmDialog.tsx)는 shadcn AlertDialog를 사용한다. 제목 표시줄은 모달 중에도 클릭 가능하지만 본문 차단과 확인창 포커스 보호는 유지한다. 실제 앱 종료의 확인은 main의 Electron 대화상자다. |
| 시작일·종료일 알림·공유 프로젝트로 저장 | [ReminderFields](../../src/renderer/components/ReminderFields.tsx) → [로컬 Switch](../../src/renderer/components/ui/switch.tsx) → 기존 `radix-ui`의 Switch. shadcn 원문 복사 없이 작성한 래퍼이며 별도 의존성을 추가하지 않는다. 두 알림 값과 저장 흐름은 유지한다. |

스타일은 [App](../../src/renderer/App.tsx)에서 `shadcn.css` → `styles.css` → `flat-glass.css` → `planrail.css` → `forest-crystal.css` 순서로 가져온다.
[Tailwind 토큰](../../src/renderer/shadcn.css)은 theme/utilities만 사용하며 preflight는 적용하지 않는다.
[기본 레이아웃](../../src/renderer/styles.css)·[C안 구조](../../src/renderer/flat-glass.css) 위에
[Planrail 상태·동작 스타일](../../src/renderer/planrail.css), [Forest Crystal 재질](../../src/renderer/forest-crystal.css)을 적용한다.
팝오버를 포함하는 패널의 블러는 별도 가상 요소에 둔다. 조상에 직접 `backdrop-filter`를 적용하면 fixed 포털의 기준 좌표가 바뀔 수 있다.
기존 전역 규칙과 Tailwind 규칙이 함께 있으므로
0.6.5는 다크 전용이며 테마 전환 버튼을 제공하지 않는다. 공통 스타일 수정 시 간트/달력, 편집 패널·중첩 팝오버를 함께 확인한다.
회귀 위치와 실제 검증 범위는 [검증 안내](../harness/validation.md)를 따른다.

## 근거·승인·현재 검증

공식 근거와 확인 범위는 [Electron·SQLite 조사](../research/2026-11-03-electron-sqlite.md)를 참조한다.
사용자는 2026-11-03 ‘설계 승인, 스테이지 2 마무리’를 선택하여 문서 전체를 승인했다.
현재 구현은 [main 진입](../../src/main/bootstrap.ts), [창 권한](../../src/main/window.ts),
[preload](../../src/preload/index.ts), [8개 API 타입·채널](../../src/shared/api.ts), [화면 상태](../../src/renderer/state/useTimeline.ts)에 있다.
IPC 거부·오류 변환·원자 삭제·저장 실패 검증은 [스테이지 5 기록](../implementation/stage-05.md)과
[현재 검증 경로](../harness/validation.md)를 따른다. 자동화 통과를 별도의 침투 테스트 결과로 확대하지 않는다.
Planrail 0.3.0은 [당시 구현 기록](../implementation/2026-11-05-planrail.md),
0.4.0 알림·계층 개선은 [최신 구현 기록](../implementation/2026-11-05-reminders.md),
Windows 설치와 과거 MVP 인수는 [Windows 검증 기록](../release/windows-validation.md)에서 버전별로 구분한다.

## 일정 알림 실행과 별도 IPC (0.4.0)

[알림 확정 설계](reminders-and-hierarchy.md)를 따른다. [순수 평가](../../src/domain/reminder.ts),
[영속 선점](../../src/main/db/reminders.ts), [main 실행기](../../src/main/reminders/engine.ts),
[Electron Notification 어댑터](../../src/main/reminders/native.ts)를 분리한다.
main은 실행·30초 간격·절전 복귀·업무 commit 후 후보를 평가하며 창을 숨겨도 동작한다.
실제 종료 시 평가 타이머·OS 이벤트·알림 참조·IPC를 정리한 뒤 DB를 닫는다.

기존 8개 업무 API의 일정 DTO에 `reminder`를 추가한다. 입력 미지정은 생성 시 기본값, 수정 시 기존값 보존이다.
추가된 `timelineReminders`는 [고정 API](../../src/shared/reminder-api.ts)의 `getState/retry/acknowledge/onChange`만 노출한다.
[main IPC](../../src/main/reminders/ipc.ts)는 sender의 창·메인 frame·URL과 명령·인자를 검증한다.
임의 채널·메시지 전송을 허용하지 않으며 기존 renderer permission 차단을 완화하지 않는다.
알림 클릭은 일정 ID·토큰으로 보관해 UI 준비 후 처리한다. 실제 종료 뒤 콜드 활성화는 지원 범위 밖이다.

[알림 상태 훅](../../src/renderer/state/useReminders.ts)은 이벤트 구독을 해제하고 이전 비동기 조회를 무효화한다.
[App](../../src/renderer/App.tsx)은 ready 상태에서 새 snapshot을 조회하고, 기존 미저장 확인으로 일정 편집을 연다.
알림 전송 오류는 일정 저장 오류와 구분한다. [알림 입력](../../src/renderer/components/ReminderFields.tsx)은 기존 편집 폼의 dirty·저장·검증을 사용한다.

## LAN 공유 경계 (0.6.0)

main의 [sharing 서비스](../../src/main/sharing/service.ts)가 SQLite 원본·별도 수신 캐시·핀 검증 HTTPS를 소유한다.
preload는 기존 8개 `simpleTimeline` 메서드를 유지하고 별도 고정 `timelineSharing` facade를 제공한다.
허용된 14개 메서드는 [공유 계약](../../src/shared/sharing.ts)에 있으며 채널·URL·SQL·자격·키를 받거나 노출하지 않는다.
샌드박스·CSP·최상위 frame 검증을 유지한다. 호스트가 지정한 IPv4 한 곳에만 바인딩하며 기본 포트는 TCP47831이다.

호스트는 원본과 프로젝트별 수신 권한을 수정한다. 멤버는 출처 ID가 있는 읽기 전용 수신본과 자기 PC의 알림만 관리한다.
연결 승인에는 실제 소스 IP·설치 자격과 양쪽의 전체 SHA-256 지문 확인이 필요하다. 자격 수령 확인 전에는 자료를 제공하지 않는다.
연결·수신 세대 검증으로 연결 해제·절전·종료·timeout 뒤의 늦은 완료를 차단한다.
2초 폴링·5초 요청 제한·2/4/8/16/30초 재연결과 마지막 정상 확인 후7초의 초록 표시 한계를 적용한다.
개인 저장과 수신 조회 실패는 독립적이다. 공유 알림의 실제 미처리 대상만 발송 직전 별도 최신 권한을 확인한다.

트레이는 연결 상태 / 구분선 / About / 구분선 / Open / Exit 순서다. 연결 상태는 모든 역할의 공유 설정을 연다.
멤버 제목 상태는 Planrail 옆, 수동 동기화는 간트/달력 왼쪽이다. 공유 설정은 기존 편집 입력과 초기·복귀·중첩 포커스를 보존한다.
종료는 요청을 먼저 무효화하고 서버·타이머·알림을 정리한 뒤 DB를 닫는다.
[실행 기록](../implementation/2026-11-10-lan-sharing.md)은 Linux loopback·시험 vault와 실제 Windows/LAN 인수를 구분한다.
