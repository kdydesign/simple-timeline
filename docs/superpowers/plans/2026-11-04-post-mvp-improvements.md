# Post-MVP Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 승인된 후속 화면·편집·설치 개선을 기존 데이터와 보안 계약을 유지하며 구현한다.

**Architecture:** 기존 React 상태와 date-only 계산을 확장한다. 드래그는 순수 날짜 변환과 공통 포인터 세션으로 분리하고 저장은 기존 updateSchedule을 사용한다. 테마·접힘은 renderer의 앱 origin 설정에 저장하며 DB 스키마를 변경하지 않는다.

**Tech Stack:** 기존 Electron / React / TypeScript / SQLite, 추가 런타임 의존성 없음.

**Spec:** [승인 설계](../../design/post-mvp-improvements.md)

## Global Constraints

- YYYY-MM-DD, 0001~9999년, 양 끝 포함, 최소 1일.
- renderer에 Node·파일·DB 권한을 노출하지 않는다.
- 실제 저장 확인 후에만 성공 표시. 오류·결과 불명·재조회 실패는 지속 안내한다.
- 라이트 초기값, 수동 테마와 프로젝트별 접힘 유지, 최근 프로젝트는 실행 중만 기억.
- 정상 재실행 창 3초·사용 가능 5초는 Windows 실측 전 목표다.
- 아이콘은 시안 검토 후 사용자가 선택한 디자인을 적용한다.

## Review Focus

- 날짜 양 끝에서 이동·크기 조절 시 기간 보존 및 1일 하한.
- 드래그 도중 월 전환/가상화/포인터 중단에도 한 번만 저장.
- 미저장 패널·결과 불명·저장 후 조회 실패에서 입력과 데이터 보존.
- 작은 창·확대·키보드 포커스·고정 헤더와 날짜 선택기의 접근성.
- 재실행·설치 업데이트·제거 후 DB 및 UI 설정의 보존 경계.

## Task 1: 공통 UI 설정·날짜 선택기·알림

**Files:** `src/renderer/state/usePreferences.ts`, `src/renderer/components/DatePicker.tsx`, `EditorPanel.tsx`, `Toolbar.tsx`, `StatusNotice.tsx`, `src/renderer/App.tsx`, `src/renderer/styles.css`, `tests/ui/improvements.test.tsx`.
**Interfaces:** usePreferences는 theme/collapsed와 변경 함수를 반환. DatePicker는 id/value/onChange/invalid props를 소비. Toast는 2초 후 해제. onAddDate(date, projectId?)는 기존 패널을 사용.

- [x] 새 UI 테스트로 초기 테마·설정 유지·날짜 선택기·2초 토스트의 실패 확인.
- [x] 최소 구현과 App 연결. 캘린더는 기존 calendarGrid와 입력 검증 재사용.
- [x] UI 테스트와 타입 검사 통과 확인.

## Task 2: 간트 계층·오늘·날짜 클릭·헤더

**Files:** `src/renderer/components/GanttView.tsx`, `CalendarView.tsx`, `Toolbar.tsx`, `src/renderer/App.tsx`, `src/renderer/state/useEditor.ts`, `tests/ui/improvements.test.tsx`, `tests/e2e/improvements.spec.ts`.
**Interfaces:** onAddDate, collapsed/onToggleProject, todayRequest {date, token}; App이 선택 월과 최근 프로젝트 관리. todayRequest를 적용한 범위는 실행 중 유지.

- [x] 날짜 클릭·행 프로젝트 우선·접힘·오늘 이동 테스트 실패 확인.
- [x] 기존 가상화 유지, 접힘은 표시 행만 제한. 오늘은 보이는 폭을 고려해 중앙 이동.
- [x] UI/E2E에서 양쪽 화면 결과·고정 헤더 확인.

## Task 3: 드래그 이동·기간 조절

**Files:** `src/visualization/drag.ts`, `src/renderer/state/useScheduleDrag.ts`, 두 view, App, `tests/unit/drag.test.ts`, `tests/ui/drag.test.tsx`, `tests/e2e/improvements.spec.ts`.
**Interfaces:** dragDates(schedule, kind, delta) → {startDate,endDate}; hook은 begin/preview/consumeClick, 좌표 resolver 및 탐색 callback 사용. App은 기존 mutate(updateSchedule)로 한 번 저장.

- [x] 날짜 경계·기간 유지·한쪽 끝 조절의 실패 테스트 확인.
- [x] 포인터 세션·취소·미리보기·잘린 조각 손잡이·가장자리 탐색 구현.
- [x] 미저장 패널 차단, 같은 일정 패널 갱신, 저장 실패 및 취소 테스트.

## Task 4: 설치·아이콘·시작 시간

**Files:** `electron-builder.yml`, `src/main/bootstrap.ts`, `src/main/window.ts`, `src/main/startup.ts`, `tests/release/package.test.mjs`, `tests/e2e/startup.spec.ts`, `docs/release/`.
**Interfaces:** 시작 시간은 프로세스 시작/앱 ready/저장소 ready/창 표시/데이터 조회 완료 구간을 기록. 기존 IPC 발신자 검증 유지.

- [x] 기존 시작·설치 경로와 테스트를 조사하고 실패 테스트/진단 기준 추가.
- [x] 사용자별 assisted installer 완료·실행 옵션. 선택된 아이콘만 배포 자산에 연결.
- [x] 측정 근거로 확인 가능한 지연만 개선하고 Windows 사용자 PC 결과는 별도 기록.

## Task 5: 통합 검증·문서 보정·리뷰

- [x] `npm run verify:app` 및 하네스 verify 실행. 새 동작과 바뀐 테스트 기대값 대조.
- [x] 독립 리뷰 후 중요한 결함을 회귀 테스트와 함께 보정.
- [x] 현재 구현·승인 설계·미실측을 문서에서 구분하고 검증 결과 기록.
- [x] 승인된 상시 정책대로 main 커밋·push, 원격 SHA·CI 상태 보고.

실행 결과와 미실측 범위: [구현 기록](../../implementation/2026-11-04-post-mvp-improvements.md).
