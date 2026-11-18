# Settings and Working Days Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 승인한 설정 탭·개인 휴일·워킹데이·개발 멤버 실행을 구현하고 전체 도움말을 갱신한다.
**Architecture:** 공통 원본과 개인 원본을 SQLite에서 분리한다. LAN 응답은 공통 원본만 사용하고 로컬 날짜 조회는 출처를 유지한 합집합으로 계산한다. 기존 설정 컴포넌트를 두 탭으로 나누며 앱 수명·저장 차단 계약을 유지한다.
**Tech Stack:** Electron, React, TypeScript, SQLite, Radix/shadcn, Vitest, Playwright.
**Spec:** [승인 설계](../../design/settings-and-working-days.md), Q10 구현 승인.

## Global Constraints
- 날짜 0001~9999, 양 끝 포함; 개인 정보는 LAN 휴일 응답에 포함하지 않는다.
- 같은 PC의 모든 일정에 공통+개인 합산, 겹친 날짜 한 번 제외; 휴일 변경 알림 없음.
- 일반 dev/운영 DB를 자동 테스트에 사용하지 않는다. sandbox 유지, 앱 검사 순차 실행.
- 승인된 기존 흐름 유지, 문서/도움말도 이번 버전에 맞춘다. main 직접 커밋·push 권한 유지.

## Review Focus
- 승인 취소/공유 중지/미지원 호스트 중 개인 저장과 보존: native 저장/서비스 검사.
- 휴일 저장 직후 원격 응답 ETag 불변 및 개인정보 제외: native + network 검사.
- 동기화 갱신·탭 전환 중 두 개의 휴일 초안 독립: UI 검사.
- 모든 요일 휴일·9999년·중복 기간에서 0일/정확한 워킹데이: domain 검사.
- 설치 호스트와 개발 멤버의 데이터/업데이트 캐시 격리, packaged 플래그 무시: profile 단위 검사.

### Task 1: Personal holiday storage and effective calendar
**Files:** `src/shared/holidays.ts`, `src/domain/holidays.ts`, new `src/main/db/personal-holidays.ts`, migrations/lifecycle, sharing service/IPC/API/preload; tests/unit/working-days.test.ts, tests/native/personal-holidays.case.ts.
**Interfaces:** `HolidaySources {common?:HolidayCalendar;personal:HolidayCalendar}`; `effectiveHolidayCalendar(sources):HolidayCalendar`; `namedHolidays(date,sources):{source:'common'|'personal';holiday:HolidayDate}[]`; `workingDays(start,end,sources):number`; `SharingState.personalHolidays?:HolidayCalendar`; `SharingApi.savePersonalHolidays({calendar}):Promise<Result<SharingState>>`.
- [x] Write failing domain tests: 2026-11-23~29 with common25/personal26 =>3, duplicate25 =>4; all weekdays =>0; 0001-01-01~9999-12-31 no holidays=>3652059; source names both returned.
- [x] Run `npm run test:unit -- tests/unit/working-days.test.ts` (expected missing exports FAIL); implement arithmetic weekly count + bounded named-date exclusions and source-preserving query; rerun PASS.
- [x] Add native storage/revocation/privacy tests and IPC validation, run RED, implement independent table migration and local command while preserving common endpoint source; run focused native + unit PASS.
- [x] Commit domain/store/API with tests.

### Task 2: Settings UI, titlebar, views and working days
**Files:** SharingSettings, HolidaySettings, Titlebar, Icon, HolidayDateTooltip, GanttView, CalendarView, EditorPanel, App, useSharing, forest-crystal.css, main/tray.ts; tests/ui/settings-personal.test.tsx, existing holiday/editor/tray tests.
**Interfaces:** Task1 sources consumed through App, effective calendar passed to views plus original sources for names; personal/common editors save separately.
- [x] Write failing UI tests for settings button/default basic tab, tab draft retention, both holiday editors, text deletion, source tooltip and period display; run `npm run test:ui -- tests/ui/settings-personal.test.tsx` RED.
- [x] Implement two mounted tab panels, independent dirty callbacks, approval deep link, permission/source props, settings titlebar icon and separators, informational tray state; wire personal save/working count. Repair selected style specificity and warning toast.
- [x] Run relevant UI/unit tests; update intentional changed contract tests; run visual Electron checks for weekday/role selection and settings width/scroll/portal.
- [x] Commit UI and tests.

### Task 3: Isolated development member
**Files:** main/index.ts, profile.ts, bootstrap.ts, package.json, tests/unit/profile.test.ts, README.md, docs/harness/validation.md.
**Interfaces:** `developmentMemberOptions({packaged,development,args,appData}):{profileDir:string;developmentMember:true}|undefined`; bootstrap option gates updater install and isolates updater cache.
- [x] Write and run failing profile test for packaged/production flags ignored, development profile differs from SimpleTimeline, repeated path stable.
- [x] Implement dev:member CLI forwarding, profile before single-instance, updater install disabled for this dev run; preserve normal dev behavior. Run profile tests/typecheck PASS.
- [x] Document host installed + dev member pairing and persistence; commit.

### Task 4: Release, help audit, whole verification
**Files:** package/package-lock, shared/help.ts, shared/release-notes.ts, help assets and capture scripts, docs release/user-guide, implementation record.
- [x] Audit every help topic against implementation; update settings routes, personal/common/workdays, images, and release 0.8.8 Feat/Fix. Recapture synthetic images using isolated fixtures.
- [x] Run `node scripts/harness/run.mjs verify` and `xvfb-run -a npm run verify:app` sequentially; investigate failures, record true limits.
- [x] Fresh whole-change review and fix material findings with reproduction tests; prepare the verified changes and evidence for one integrated commit.
- [ ] Observe exact-commit Linux/Windows CI after push; report its result separately from local evidence.

## Execution ledger
Pre-flight: Task1 types are Task2 inputs; Task3 profile options independently integrate bootstrap; Task4 help captures depend on Task2 UI. Signatures and scope agree with the approved spec.
Ruling: use inline execution and repository main workflow; user has explicitly approved implementation, so no additional plan/method approval. Cost: one final independent review instead of per-task reviewers. Ledger kept here because cloud skill helper scripts are not installed in the executor.


### 진행 근거 (2026-11-18)
- Task1 domain/IPC/native RED→GREEN 완료. native88/88, v7→8 migration·재시작 보존·실제 TLS 두 휴일 API 응답/ETag 비공개 검사 포함.
- Task2 UI RED→GREEN, 변경 계약 회귀57/57. Electron 설정/휴일/도움말 촬영7건 통과(최초 신규 테스트의 중복 일정 추가 selector를 명시적 toolbar 대상으로 수정 후 재통과). 호스트+개인 겹침 워킹데이4일 및 두 tooltip 출처 확인.
- Task3 profile RED→GREEN, typecheck/build 통과. unpackaged development만 플래그 처리. 실제 dev 명령은 임시 appData에서 추가 확인 예정.
- Task4 기존26개 도움말 점검·2개 추가, 14개 실제 fixture 이미지 갱신. 문서 하네스 통과, 순차 verify:app 진행 중.
- Ruling: 도움말 build gate의 이미지-버전 순환을 해결하기 위해 촬영 준비 빌드에 이전 이미지를 임시 참조하고 capturePending을 명시했다. 실제0.8.8 화면을 촬영한 뒤 전부 교체하고 최종 build를 통과했다. 임시 참조/미촬영 메타데이터는 최종 산출물에 남기지 않는다.
- Ruling: 각 task의 교차 API/UI/패키지 변경은 전체 검사 후 하나의 기능 커밋으로 묶는다. 단계별 RED/GREEN 근거는 보존한다. 비용은 중간 task 단위 cherry-pick이 아닌 통합 변경으로 검토해야 한다는 점이다.


### 최종 독립 검토
- 실행: settings_final_review, gpt-6.2-astra, fresh context/read-only. Important4건: 설정 상태 없음의 inert 잠금, 승인 요청 재소비, 취소 후 재시작 시 공통 기본값 재적용, E2E API allowlist 누락. 회귀 RED→GREEN 수정 패스에 포함.
- Final: minor (deferred): dev:member 실제 설치는 차단하지만 업데이트 UI는 일반 설치 오류·재시도 버튼을 사용한다. 개발 전용 안내/버튼 구분은 후속 개선.
- Final: minor (deferred): 다른 표에 요일이 남으면 휴일이라는 설명은 도움말에 제공하며 설정 영역의 추가 한 문장은 후속 문구 개선.
- Final: Ruling: 검토자가 판단을 유보한 전체 verify:app 결과는 실행 종료 후 직접 로그/exit code로 확인한다. Windows 설치 호스트·개발 멤버 동시 실기와 사내 정책은 Linux 결과로 추정하지 않고 미검증으로 보고한다. 비용은 해당 Windows 환경의 인수 확인이 별도로 필요하다는 점이다.

- 최종 수정 패스: UI 2건·native 1건 RED 재현 후 수정, API allowlist와 변경된 탭 포커스 계약 보정. UI15/15·실제 Electron8/8 GREEN. native 최초 명령의 DISPLAY 없음은 Xvfb 재실행으로 분리했고, 실제 RED는 승인 취소 재시작 검사에서 확인했다.
- dev:member 실제 명령을 임시 XDG_CONFIG_HOME으로 실행하여 격리 DB 생성·운영 프로필 미생성·기본 멤버 선택·자동 승인 없음 확인. 프로세스/임시 폴더 정리 완료. 최종 verify:app은 제품 build부터 재검사 중이다.

- 최종 전체 검사 진행: typecheck/release/TZ294×3/UI207/build/native89 PASS. native 승인 취소 영속 회귀도 GREEN이며 개인 표 단독 워킹데이7일을 재시작/복귀에서 확인했다.

- 최종 로컬 E2E104/106: calendar-preview·reminders 프로세스 종료 wait timeout2건. 별도2회 반복11/12는 다른 테스트의 launch timeout. 최소 Electron20/20, 같은 DEBUG 조건의 기준archive18/18·현재18/18 통과. 원인 미확정이며 제품 코드·테스트 timeout·검사 대상을 변경하지 않았다.
- Ruling: 로컬 전체 실패를 보존한 채 중요한 기능 회귀/검토 통과 변경을 통합 커밋하고 깨끗한 Linux/Windows CI로 전체 검사한다. 로컬 전체 통과로 표현하지 않으며 CI가 실패하면 후속 처리한다. 자세한 근거는 구현 기록에 둔다.
