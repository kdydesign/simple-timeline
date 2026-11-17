# Holiday Ranges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 승인된 한 줄 기간 입력과 간트/달력 날짜 삼각 표시를 구현한다.
**Architecture:** 기존 holiday JSON에 선택적 endDate를 추가하고 구버전 경로는 날짜별 투영을 제공한다. 공통 DatePicker의 모달 portal과 스타일을 보정한다.
**Tech Stack:** Electron, React, TypeScript, SQLite, Radix.
**Spec:** docs/design/holiday-ranges-and-markers.md

## Global Constraints
- 0001~9999년, 양 끝 포함, 겹침 금지, 기존 총 1,000일 제한 유지.
- 휴일 변경 알림 없음, 멤버 조회 전용, 구버전 동기화 유지.
- 사용자 승인 시안 우선. 운영 DB 사용 금지. main 직접 검증·커밋·push는 AGENTS의 상시 승인에 따른다.

## Review Focus
- 윤일/연말/9999년 말 범위: 경계 밖으로 계산하지 않는다.
- 저장 실패/겹침: 기존 데이터와 작성 중 입력 보존.
- 구버전 호스트 fallback과 신버전 호스트의 구버전 전달: cache/ETag 일관성.
- 모달 안 월 선택: pointer hit-test, Escape, 키보드 focus.
- 휴일 날짜에 일정 막대/드래그: 삼각 표시가 입력을 가로채지 않는다.

### Task 1: Holiday range domain and transport
Files: src/shared/holidays.ts, src/domain/holidays.ts, src/main/sharing/{host,client}.ts; tests/unit/holidays.test.ts; tests/native/sharing-extras.case.ts.
Interfaces: HolidayDate {date:string;endDate?:string;name:string}; namedHoliday(date,calendar):HolidayDate|undefined; expandHolidayCalendar(calendar):HolidayCalendar.
- [x] Write range boundary, overlap, legacy expansion tests; run test:unit and observe RED.
- [x] Implement strict optional endDate validation, named lookup and bounded legacy expansion.
- [x] Add negotiated ranges route and fallback; prove real TLS/cache and legacy response behavior.
- [x] Run unit/native tests GREEN.

### Task 2: Input and view presentation
Files: HolidaySettings.tsx, DatePicker.tsx, Select.tsx, GanttView.tsx, CalendarView.tsx, renderer styles; tests/ui/sharing-holidays.test.tsx, tests/e2e/holidays.spec.ts.
Interfaces: consumes namedHoliday + range validation; same sharing save API.
- [x] Write failing range form and marker tests; observe RED.
- [x] Implement today baseline, one row fields, atomic range edits, inline overlap errors; preserve weekly drafts.
- [x] Reuse schedule date styles; modal-owned month portal; shared named holiday marker tooltip (hover/focus), no recurring text.
- [x] Run UI/E2E and inspect screenshots including calendar month list.

### Task 3: Documentation, review and release
Files: help/release notes, docs design/implementation/status.
- [x] Update help and version to 0.8.7 with Feat/Fix notes.
- [x] Run verify:app and harness verify sequentially; record actual outcomes.
- [x] Fresh whole-change reviewer; fix important findings with regression tests.
- [ ] Commit/push main after verification; inspect CI for final SHA (완료 보고에 실제 결과 기록).
