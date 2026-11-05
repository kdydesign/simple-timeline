# 일정 알림과 간트 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 승인된 일정별 Windows 알림, A안 계층, 붉은 삭제 버튼, 100% 클릭 복귀를 구현한다.

**Architecture:** main 소유 SQLite v2에 설정과 전송 선점을 저장한다. 순수 날짜 평가, 영속 이력, 네이티브 전송 어댑터를 분리한다. 제한된 preload는 상태·재시도·알림 클릭 확인만 제공한다.

**Tech Stack:** 기존 Electron/React/TypeScript/SQLite/shadcn 기반 UI. 새 런타임 의존성 없음.

**Spec:** [승인 설계](../../design/reminders-and-hierarchy.md), Q15 ‘설계 승인·구현 진행’.

## Global Constraints

- N=0~365 정수, 24시간 HH:mm, 일정별 공통 시각. 초기값 2/09:00/시작·종료 꺼짐.
- 날짜 0001~9999, 달력 일수, 당일 놓친 알림만 처리. 시작·종료 같은 시각 병합.
- main 선점 commit 이후 OS 전송. 결과 불명 자동 재시도 금지. 실패는 사용자가 재시도.
- 트레이에서 동작, 실제 종료 후 예약 실행과 콜드 알림 활성화는 제외.
- 기존 이름·프로필·설치 정책·참여자 데이터·날짜 및 드래그 계약 유지.
- 작업 디렉터리의 승인된 문서 변경을 보존하고 상시 승인에 따라 main 직접 반영. 구현은 이 세션에서 진행하고 마지막에 독립 리뷰.

## Review Focus

1. 동일 설정 A→B→A, 껐다 켜기, 이름 변경은 이미 선점한 조합을 반복하지 않아야 한다(Task 1/2).
2. 날짜 드래그는 알림을 보존하고 지원 범위 이전 계산이면 원자적으로 거부한다(Task 1/3).
3. 선점 후 종료·명시적 실패·DB 실패를 구분하며 저장 성공을 알림 실패로 되돌리지 않는다(Task 2).
4. 알림 클릭이 저장 중/dirty/삭제/모달 상태와 충돌해 입력을 잃지 않는다(Task 3/4).
5. DST·시간대·절전과 다수 알림은 당일 재평가 및 직렬 선점으로 처리한다(Task 2/4).

### Task 1: 날짜 계약과 영속 저장

**Files:** `src/shared/types.ts`, 새 `src/domain/reminder.ts`, `src/main/db/{migrations,repository}.ts`, 새 `src/main/db/reminders.ts`, `src/main/ipc-core.ts`, `tests/unit/reminder.test.ts`, `tests/native/reminders.case.ts`.
**Interfaces:** `ReminderSettings {daysBefore:number;time:string;start:boolean;end:boolean}`; Schedule.reminder 필수, 입력 reminder 선택(생성 기본값/수정 미지정 시 보존). `normalizeReminder(value,startDate,endDate):ReminderSettings`, `dueReminders(schedule,now):ReminderOccurrence[]`. 이력 store는 claim/finish/recover/issues를 제공하며 fingerprint는 일정/종류/대상날짜/N/시각이다.
- [x] 날짜·기본값·형식·경계·당일 후보 테스트를 먼저 작성하고 `npm run test:unit -- tests/unit/reminder.test.ts`에서 실패를 확인한다.
- [x] 순수 계산과 DTO를 추가해 테스트를 통과시킨다.
- [x] native 테스트로 v1→v2 보존, 설정 저장/드래그 보존, 범위 거부, 선점 중복/복구/삭제를 확인한다. 먼저 실패 후 마이그레이션·repository·store 구현.
- [x] `npm run test:native`, `npm run typecheck` 통과 후 관련 변경을 커밋한다.

### Task 2: 알림 실행·OS 어댑터

**Files:** 새 `src/main/reminders/{engine,native,ipc}.ts`, `src/shared/reminder-api.ts`, `src/preload/index.ts`, `src/main/bootstrap.ts`, `tests/unit/reminder-engine.test.ts`.
**Interfaces:** engine은 store, snapshot 공급자, clock, `send(message,onClick):Promise<'submitted'|'failed'|'unknown'>`를 주입받는다. `evaluate(retry=false)`, `dispose()`, 상태 조회 및 클릭 요청 토큰 확인을 제공한다. `ReminderApi`는 `getState/retry/acknowledge/onChange`로 한정한다.
- [x] 가짜 어댑터 테스트로 병합, 지연/과거/미래, A→B→A, 실패/불명, 직렬 재평가, 삭제·비활성화 큐 제외를 RED 확인한다.
- [x] engine과 Electron Notification 어댑터를 구현해 GREEN 확인한다. 30초 평가·resume·commit 후 평가, 종료 cleanup을 연결한다.
- [x] 신뢰된 sender와 엄격한 인자를 검증하는 별도 IPC/preload를 구현한다. 클릭 요청은 준비된 UI가 확인할 때까지 보관한다.
- [x] unit/typecheck 통과 후 커밋한다.

### Task 3: 폼·클릭 탐색·간트 외형

**Files:** `src/renderer/state/useEditor.ts`, 새 `src/renderer/state/useReminders.ts`, `src/renderer/{App.tsx,global.d.ts,planrail.css}`, `src/renderer/components/{EditorPanel,GanttView}.tsx`, 새 `src/renderer/components/ReminderFields.tsx`, `tests/ui/reminders.test.tsx`, `tests/ui/planrail-zoom-pan.test.tsx`.
**Interfaces:** 기존 ScheduleInput에 reminder를 포함, 폼 숫자 초안은 빈 문자열을 보존하고 저장 때 검증. 알림 상태는 기존 timeline 저장 오류와 별개. 클릭 요청을 ready 상태까지 보류하고 기존 request/dirty 확인으로 편집한다.
- [x] 폼 기본값/저장/dirty, 삭제된 일정·dirty 알림 클릭, 111%→100% 버튼 복귀와 날짜 불변 테스트 RED.
- [x] 기존 컴포넌트로 입력과 상태 안내/재시도를 구현하고 간트 참여자 요약만 제거한다. A안 스타일·붉은 삭제 버튼·배율 버튼 적용.
- [x] `npm run test:ui`, `npm run typecheck` GREEN. 시각 결과 확인 후 커밋한다.

### Task 4: 통합·회귀·기록

**Files:** `tests/e2e/reminders.spec.ts`, `tests/e2e/main.ts`, 해당 schema 버전 검증 fixture, `docs/design/{architecture,storage}.md`, `docs/release/user-guide.md`, 새 `docs/implementation/2026-11-05-reminders.md`.
- [x] Electron 테스트 어댑터로 실제 preload/DB/renderer 알림 저장·클릭·재실행을 검증한다. 제품 런타임에는 테스트 통로를 추가하지 않는다.
- [x] `npm run verify:app`, 하네스 verify. 라이트/다크·작은 창 캡처와 결과 기록. Windows 실기 알림은 자동 mock 검증과 구분한다.
- [x] 독립 전체 리뷰 후 중요한 오류를 회귀 테스트 RED→GREEN으로 수정한다.
- [x] 문서와 완료 기록을 보정하고 main commit/push, CI 확인. Windows 사용자 PC 실기 미검증은 그대로 보고한다.

로컬 실행·리뷰 결과: [구현 기록](../../implementation/2026-11-05-reminders.md). push·CI 상태와 최종 SHA는 종료 메시지에서 확인한다.
