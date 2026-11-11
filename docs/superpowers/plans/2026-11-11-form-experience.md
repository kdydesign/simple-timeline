# Form experience implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development for the cohesive implementation task, followed by an independent whole-change review. Main direct commit/push is already authorized by AGENTS.md.

**Goal:** Implement approved toolbar spacing, empty shared Gantt, saving progress, field validation, project sharing layout and sharing popup refinements.
**Architecture:** Preserve Electron/SQLite/API contracts. Renderer validates all editable fields before writes, retains API single errors, associates field errors locally, and separates timeline mutation progress from sharing busy. CSS reuses existing tokens and components.
**Tech Stack:** React/TypeScript, Radix, CSS, Electron, Vitest/Playwright.
**Spec:** [Forest Crystal follow-up](../../design/forest-crystal.md#후속-시안-검토--툴바-간격저장-진행필드-오류).

## Global constraints

- Preserve domain date0001~9999, participant normalization, local/shared permissions, mutation uncertainty, existing sync and window behavior. No dependency or DB/protocol changes.
- Exact CSS values and Q1~Q5 plus popup additions in spec are binding. Scope is desktop. No re-approval of specified changes. Version0.6.7.
- Product code stays in existing architecture; no invented real percent progress. Success only after real confirmed mutation. Main direct commit/push after full verification; no PR.

## Review focus

- Save validation occurs before sharing conversion confirmation and never sends invalid edits; shared member cannot edit source fields.
- Invalid dates and reminders produce all independently knowable errors without losing normalization; PC errors identify correct row when locally known, server group errors never guess row.
- Saving shield blocks keyboard and pointer, keeps titlebar accessible, and releases/restores usable focus after failure; manual/background sync never shows it.
- Successful write plus failed refresh is distinguished from failed/uncertain write; no automatic replay and no false success completion.
- Hidden empty shared navigation restores on filter/data change; popover blur does not clip menus or break nested modal focus; single tray dot retains state color.

### Task1: Approved form and sharing experience

Files: App.tsx, state/useTimeline.ts, renderer validation module if needed, EditorPanel/ReminderFields/Select/DatePicker/StatusNotice, new SavingOverlay component, GanttView, SharingSettings, forest-crystal.css, main/tray.ts; focused tests in tests/ui, tests/e2e and existing tray tests.
Interfaces: renderer field-error map keyed by stable form field/participant index; existing ApiError remains unchanged. Saving state driven by timeline mutation only; hook/component receives explicit pending and confirmed outcome, not sharing.busy.
- [x] Write/run regressions for multi-field validation (name/color, date order/reminder, participant PC), error correction and no premature API/confirmation, save pending/success/failure/uncertain and no sync shield. Observe expected failure.
- [x] Implement validated renderer behavior, stable input IDs/describedby and red borders, project group separators/PC spacing. Keep server failures recoverable and form data preserved.
- [x] Apply exact toolbar/popover CSS,1:8 navigation, shared-empty hiding/restoration, X close and single tray indicator. Adapt superseded contract assertions.
- [x] Run relevant UI/native/Electron checks, inspect real screenshots for shared popup LAN dropdown, project errors, pending save, empty shared and navigation. No simultaneous app suites.
- [x] Self-review and report changed files/tests/failures/risks; leave changes uncommitted for final reviewed delivery.

### Task2: Review, verify and deliver

- [x] Independent review of complete diff against approved spec; resolve substantive findings and verify fixes.
- [x] Update existing design/implementation records and version0.6.7, preserving historical evidence. Run npm run verify:app, harness verify and diff check. Record exact SHA/dirty/environment and any unverified Windows appearance.
- [ ] Commit only task changes to main, normal push, verify remote SHA and report observed CI status.
