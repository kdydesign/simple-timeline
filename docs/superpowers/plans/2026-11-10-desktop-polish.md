# Calendar preview and desktop polish implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Implement the approved Q1–Q9 calendar feedback and desktop behavior.
**Architecture:** Keep saved schedules unchanged while drawing a pointer-transparent calendar preview layer. Main owns close choices and About; renderer retains focus and expands Gantt to its viewport.
**Tech Stack:** Existing Electron, React, SQLite, Radix/shadcn, Vitest, Playwright.
**Spec:** [Approved design](../../design/calendar-preview-and-desktop-polish.md)

## Global Constraints

- 1707×820 DIP clamped to work area, no window persistence.
- No DB/schema/dependency changes; dirty/save protection and existing drag contract remain.
- Korean UI, light/dark, sandbox and fixed preload surface preserved.
- User approved design and implementation; existing authorization is direct main commits/push after verification.

## Review Focus

- Multiple close/quit requests while a choice is pending must not bypass cancellation.
- Hidden About and failed tray must not strand the process or lose dirty input.
- Preview must stay visible over three lanes, across adjacent months, without blocking hit testing.
- Automated focus restoration must not suppress later real keyboard/hover tooltips.
- Short/tall windows and open editor must retain access to final Gantt row and navigation.

## Task 1: Desktop lifecycle

**Files:** src/main/{close,bootstrap,tray,window}.ts, new src/main/about.ts and window-bounds.ts; tests/unit/close.test.ts, desktop-polish.test.ts; tests/e2e/{main,tray}.ts.
**Interfaces:** CloseChoice = 'hide' | 'quit' | 'cancel'; installCloseGuard options.chooseClose?:()=>Promise<CloseChoice>. createTray fourth optional showAbout callback. initialWindowBounds(workArea) produces centered clamped rectangle. About uses main app version and existing icon.
- [x] Add failing unit tests for each choice, concurrent requests, fallback and clamped bounds; run `npm run test:unit -- tests/unit/close.test.ts tests/unit/desktop-polish.test.ts` (RED).
- [x] Implement main-owned native choice/About dialogs with cancellation default and single-flight protection; use existing guarded quit path. Add test-only choice injection to existing isolated bootstrap harness, never production environment overrides.
- [x] Run the unit command (GREEN); extend Electron lifecycle tests for cancellation and default size. Commit task files.

## Task 2: Calendar live preview

**Files:** src/renderer/state/useScheduleDrag.ts, components/CalendarView.tsx, new components/CalendarDragPreview.tsx, visualization/calendar.ts, renderer/planrail.css; tests/unit/calendar.test.ts, tests/e2e/calendar-preview.spec.ts, tests/e2e/improvements.spec.ts.
**Interfaces:** Drag preview carries pointer coordinates and validity alongside Dates/id. calendarPreviewSegments(dates, month) yields visible-week segments including adjacent month dates; consumes existing date ordinal utilities. Component renders pointer-transparent overlays using calendar column geometry.
- [x] Add failing geometry tests for week/month/year bounds and Electron assertions before pointerup for preview visibility/position and unchanged persisted dates (RED).
- [x] Keep original lanes static and dim original fragments; layer preview above lanes with range continuation; pointer label includes dates and invalid-drop cancellation hint. Clean on finish/cancel; retain existing status accessibility.
- [x] Run unit/calendar and targeted Electron drag tests (GREEN); cover three-lane overflow, both resize ends, Escape/outside cancellation. Commit task files.

## Task 3: Focus and Gantt viewport

**Files:** src/renderer/{App.tsx,planrail.css}, components/Icon.tsx, focus utility if needed; tests/e2e/desktop-focus-layout.spec.ts, existing design tests.
**Interfaces:** Mark automated focus restoration only for its synchronous focus event; IconButton maintains hover/keyboard tooltips while ignoring automatic focus. Gantt content uses available viewport height without changing calendar flow.
- [x] Add Electron regression for date-cell add→close with no ghost tooltip plus subsequent Tab/hover, and short/tall viewport navigation bottom/final-row reachability (RED).
- [x] Correct schedule fallback, suppress programmatic-restoration tooltip, flex Gantt body into available height; preserve editor and scroll behaviors.
- [x] Run targeted tests (GREEN); commit task files.

## Task 4: Whole change validation and handoff

- [x] Fresh whole-change reviewer checks code against spec and Review Focus; fix important findings with regression tests.
- [x] Run `npm run verify:app` and `node scripts/harness/run.mjs verify`, inspect artifacts. Take actual Electron screenshots in light/dark and compare preview/lifecycle/layout.
- [x] Update relevant user/design/current-state records with exact checks and Windows-only manual limits. Final commit/push and CI status are reported in the completion message.
