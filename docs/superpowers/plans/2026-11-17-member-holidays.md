# 멤버 버전·휴일·승인 알림 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 승인된 멤버 버전 표시, 호스트 공통 휴일 동기화, 코드 확인 이후 호스트 승인 알림을 추가한다.

**Architecture:** 기존 snapshot의 정확한 키 계약을 유지한다. 선택적 버전 헤더와 별도 인증된 휴일 endpoint를 기존 동기화 회차에 연결하고 SQLite에 휴일·버전·승인 알림 이력을 보관한다.

**Tech Stack:** 기존 Electron, React, TypeScript, SQLite, Vitest, Playwright.

**Spec:** [승인 설계](../../design/member-versions-holidays-and-pairing-notices.md)

## Global Constraints

- 구버전 프로젝트 동기화 유지. 휴일 변경 알림 없음. 날짜 0001~9999, 기본 반복 토·일.
- 승인 PC·IP·TLS pin 검증 유지. renderer DB/파일 권한 금지.
- 휴일표 일시 단절 보존, revoke/disconnect 제거. 전체 무음·중복 방지 준수.
- 기존 main 직접 반영 승인에 따라 작업하며 단계별 검증 후 최종 커밋·push한다.

## Review Focus

- 늦게 도착한 휴일 응답이 disconnect/revoke 후 자료를 복구하지 않아야 함 (작업2).
- 구버전 또는 잘못된 버전 헤더가 기존 동기화를 깨지 않아야 함 (작업1/2).
- 휴일만 바뀌어도 일정 변경 알림을 생성하면 안 됨 (작업1/2).
- 승인 요청이 대기 중 무음 해제·재실행해도 소급 발송하지 않아야 함 (작업3).
- 휴일 관리 초안을 주기 동기화가 덮어쓰지 않아야 함 (작업4).

## Task 1: 데이터 계약·비파괴 저장

Files: 새 `src/shared/holidays.ts`, `src/domain/holidays.ts`, `src/main/db/sharing/extras.ts`; 수정 migrations/store/lifecycle; tests/unit/holidays.test.ts, tests/native/sharing-extras.case.ts.

Interfaces: `HolidayCalendar {weekdays:number[];dates:{date:string;name:string}[]}`; `HolidayEnvelope {schemaVersion:1;hostId;datasetId;revision;calendar}`. `createSharingExtras(db)`는 host calendar save/read, member cache apply/clear, version report, pair notification claim/finish를 제공한다. 날짜별 최대1000개·이름100자, 요일0~6. 호스트 저장 revision UUID, 전체 원자적 저장. 버전 같은 값은60초마다 영속 시각 병합.

- [x] 날짜 중복·윤일·빈 요일/이름 실패 및 기본/특정일 우선 판정 테스트 RED.
- [x] schema v7 추가. 기존 v6 자료 보존·호스트만 저장·member 캐시 identity/해제·버전 바인딩 변경/누락·pair 60초/mute 테스트 RED→GREEN.
- [x] `npm run test:unit -- tests/unit/holidays.test.ts`와 `xvfb-run -a npm run test:native` PASS.

## Task 2: 인증된 통신·서비스

Files: sharing/transport.ts,host.ts,client.ts,service.ts,ipc-core.ts, preload/api and shared/sharing.ts; tests/unit/sharing-network.test.ts, tests/native/sharing-integration.case.ts.

Interfaces: `x-planrail-version` optional header. `GET /v1/holidays` ETag/304, `pollHolidays({force,signal})` separate from legacy poll outcome. Service polls after successful main snapshot in same coordinator and applies partial failure status. `SharingState.holidays` includes calendar,status,lastReceivedAt,message. Host `saveHolidays({calendar})` IPC validates full calendar.

- [x] New endpoint requires active authorization with0 projects; old body unchanged, no auth/unknown header failure; 404 unsupported vs timeout/revoked, identity mismatch tests RED.
- [x] Host handlers, client conditional poll, service lifecycle/cache fencing, partial failure/manual sync and metadata wiring.
- [x] Unit transport + native sharing integration pass including revoke/disconnect clearing and unchanged schedule notifications.

## Task 3: 호스트 승인 알림

Files: 새 notifications/pairing.ts; host.ts member confirm callback; service.ts wiring and desktop runtime sender. Tests native/sharing-extras.case.ts and unit/sharing-network.test.ts.

Interfaces: `onPairConfirmed(pair)` fires only first member-confirm transition before host approval. `createPairingNotifications` uses extras claim + global mute + pending validity, `ReminderSender`, requestSettings opener. Failed/unknown attempts do not retry; latest valid pending list remains source of truth.

- [x] Duplicate confirm, host preapproval and muted/new request60sec boundary tests RED.
- [x] Durable perpair claim and perdevice cooldown. Native message click opens current approval list preserving inputs. Dispose prevents late DB access.
- [x] Unit/native PASS.

## Task 4: 승인 시안 UI·릴리즈 검증

Files: 새 HolidaySettings.tsx; SharingSettings/SharingDeviceForm/App/GanttView/CalendarView; forest-crystal.css; tests/ui/sharing-holidays.test.tsx. 도움말/릴리즈노트와 package version0.8.6.

Interfaces: optional `GanttProps.holidays` consumes calendar; shared `holidayName(date,calendar)`; settings consumes state and saveHolidays. 호스트만 편집. DatePicker 재사용, 필드 오류/상태 안내. 기존 참여자 행 아래 버전. 간트 트랙 경계 유지·달력3줄 보존.

- [x] Host edit vs member readonly, stale/unsupported, invalid date/name, draft persistence and Gantt/calendar markings UI tests RED.
- [x] 기존 스타일/날짜 컴포넌트 사용, 제품 도움말·릴리즈 기록 갱신.
- [x] `npm run typecheck`, `xvfb-run -a npm run verify:app`, `node scripts/harness/run.mjs verify` PASS; 브라우저/격리앱 화면 확인.
- [x] Fresh whole-change review and important fixes.

검증된 변경을 main에 커밋·push하고 실제 최종 SHA의 Windows/Linux CI를 확인한다. 결과는 완료 보고의 커밋과 Actions를 기준으로 한다.

## Execution ledger

Pre-flight: Task1 HolidayCalendar→Task2 payload/Task4 render, Task1 claim→Task3 notifications, Task2 callback→Task3 notifier: 동일 계약. 기존 main 직접 반영 승인 적용. 새 라이브러리 없음.
사용자의 설계·시안 승인과 구현 지시에 따라 추가 방법 선택 질문 없이 같은 세션에서 진행한다.

Task1–3 구현·개별 검사 완료. 최초 새 모듈 부재/endpoint 테스트 실패를 확인하고 구현했으며 단위38개·native84개·UI17개 단계 검사를 통과했다. 후속 검토 회귀와 migration 검사를 추가했다. 독립 reviewer의 Important3(재접속 capability·설치본 버전 귀속·모달 보류) 및 Minor(조회 요일 UI·SemVer·presence)를 모두 보정하고 재검토에서 추가 지적 없음. 전체 회귀7단계와 최종 화면 확인은 완료했다. 최종 커밋의 CI 결과는 완료 보고를 따른다. 실행 근거와 초기 실패 보정은 [구현 기록](../../implementation/2026-11-17-member-holidays.md)에 남긴다.
