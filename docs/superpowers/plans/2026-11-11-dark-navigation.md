# Dark navigation implementation plan

> **For agentic workers:** Use superpowers:executing-plans. 승인된 설계를 이 세션에서 직접 구현하고 최종 독립 검토를 수행한다.

**Goal:** 다크 전용 유리 화면과 분리된 간트 배율/가로 이동, 주말 표시를 구현한다. 대한민국 공휴일 날짜는 2026-11-11 사용자 승인으로 보류한다.
**Architecture:** 기존 React/Radix 컴포넌트와 가상화 offset을 유지한다. 화면 토큰과 스크롤 스타일을 정리하고, 주말은 ordinal로 판정한다. 공휴일은 공식 검증 후 오프라인 날짜 표를 추가할 후속 설계다.
**Tech Stack:** Electron, React, TypeScript, CSS, Vitest, Playwright.
**Spec:** [승인 설계](../../design/forest-crystal.md#후속-협의--다크-전용간트-탐색휴일-강조).

## Global constraints

- Q1~Q5 및 요청14항목 승인. 기능·공유 권한·알림·0001~9999년 날짜 지원 보존.
- alpha: popup .5, control .3, glass .5, list-control .6. workspace padding14px, app-shell margin6px14px0.
- 배율50~300%, 기본100%, 슬라이더는 왼쪽 날짜 고정. 하단20:80. 공휴일2026~2027년은 공식 검증까지 보류.
- main 직접 커밋/push 상시 승인. 전체 검증 후 한 커밋으로 묶고 중간 승인 요청은 하지 않는다.

## Review focus

- 저장된 라이트 설정이 있어도 첫 화면부터 다크이며 배율·접힘 상태는 유지한다(Task1).
- 공유 Switch 조작이 저장을 자동 실행하거나 멤버 권한을 늘리지 않는다(Task1).
- 줌 슬라이더 방향키가 가로 이동까지 일으키지 않고 날짜 범위 끝/폭 변경에도 탐색 가능하다(Task2).
- 스크롤바가 숨겨져도 키보드/드래그/고대비에서 접근 가능하며 전체 날짜 범위에 비례한 거대 DOM을 만들지 않는다(Task2).
- 휴일이 오늘/선택/드래그를 가리지 않고 지원 밖 연도와 연말 경계에 정확히 안내한다(Task3).

### Task1: Dark-only surfaces and project controls

Files: renderer/index.html, state/usePreferences.ts, components/Toolbar.tsx, App.tsx, components/EditorPanel.tsx, forest-crystal.css; tests/ui/improvements.test.tsx, sharing tests, tests/e2e/forest-crystal.spec.ts.
Interfaces: existing preferences retains collapsed/dayWidth, removes theme switching. Existing Switch consumes checked/onCheckedChange.
- [x] Write/run regression for stored light->dark without losing collapsed/dayWidth and no theme button; shared project uses switch with existing permissions. Expect initial failure.
- [x] Implement dark-only initialization, toolbar removal, Switch replacement, approved tokens/layout/list-hover changes.
- [x] Run affected UI checks and typecheck; expect PASS. Adapt tests of superseded theme/checkbox contract.

### Task2: Separate navigation and reveal scrollbars

Files: components/GanttView.tsx, new components/GanttNavigation.tsx, forest-crystal.css, tests/ui/planrail-zoom-pan.test.tsx, tests/e2e/dark-navigation.spec.ts.
Interfaces: GanttNavigation consumes offset/min/max/viewport/dayWidth, onMove(offset), onZoom(width), disabled and existing keyboard handler for horizontal only. Horizontal scrollbar exposes ARIA scrollbar with logical offset; pointer motion maps finite track to offset, avoids native giant DOM width limits.
- [x] Write/run tests for zoom range/reset/left anchor, independent arrow keys, horizontal start/end movement, empty center and20:80 layout. Expect failure for new controls.
- [x] Implement two navigation areas, retained reset, always-visible zoom range and accessible horizontal thumb. Preserve wheel/pan/drag behavior. Move empty message into body center; center name heading.
- [x] Add thin rounded transparent scroll styles with reveal on hover/focus/drag; reduced-motion and forced-colors overrides. Keep geometry stable and minimum pointer hit targets.
- [x] Run focused UI/E2E; expect PASS including existing date-navigation cases.

### Task3: Official offline holiday highlighting

주말 구현·검증은 완료(`src/visualization/weekends.ts`, `tests/unit/weekends.test.ts`). 2026-11-11 사용자가 공식 자료 검증 전 공휴일만 보류하고 나머지를 완료하도록 승인했다. 아래 파일·인터페이스·체크리스트는 미구현 후속 작업이다.

Files: new visualization/koreanHolidays.ts and source data, GanttView.tsx, forest-crystal.css, tests/unit/holidays.test.ts, tests/ui/gantt.test.tsx; source documentation.
Interfaces: holidayName(date:string):string|undefined, isHolidayYearSupported(year:number):boolean, isWeekend(ordinal:number):boolean. No runtime network.
- [ ] Verify2026/2027 official holiday dates including later amendments; record URLs/date/fact extraction. Do not label unofficial calendar export alone authoritative.
- [ ] Write/run date lookup, substitute/lunar holiday, boundary year and weekend tests; expect absent implementation failure.
- [ ] Add verified date facts and holiday/weekend shading only for rendered columns; preserve today/selection overlay and schedule fills. Show unsupported-year notice for visible dates.
- [ ] Run unit tests across timezones and affected UI; expect PASS.

### Task4: Full verification and delivery

- [x] Inspect real Electron screens at desktop sizes: empty/shared, project popup, editor switch, navigation zoom/scroll, weekends (public holidays deferred). Store screenshots; Windows native material remains separate manual validation.
- [x] Update relevant design/implementation/user-guide and version to0.6.5; no dependency upgrade.
- [x] Run `npm run verify:app`, `node scripts/harness/run.mjs verify`, `git diff --check`; expect all pass.
- [x] Independent whole-change review, fix important issues with reproducing tests; repeat affected/full checks as needed.
- [ ] Commit approved files, push main, report commit and observed CI status without claiming pending CI pass.
