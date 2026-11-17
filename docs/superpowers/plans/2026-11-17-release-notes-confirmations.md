# Release notes, confirmations and help diagnostics implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Inline implementation with one fresh final reviewer.

**Goal:** 승인된 릴리즈노트·제목 표시줄·저장 확인·아이콘 개선과 도움말 진단 제공.
**Architecture:** 릴리즈노트는 별도 읽기 전용 IPC/창과 로컬 콘텐츠를 사용하며 최초 클릭 때 생성한다. 기존 도움말 사전 준비를 유지하면서 수치 계측만 추가한다. mutation 직전 확인은 renderer에서 처리하고 main의 권한·저장 경계는 유지한다.
**Tech Stack:** 기존 Electron/React/TypeScript/Vitest/Playwright, 새 의존성 없음.
**Spec:** [승인 Q1~Q8](../../design/release-notes-and-confirmations.md)

## Global Constraints

- 도움말 ui-ready+1초 기존 준비 유지. 릴리즈노트 자동 사전 준비 없음. 13초 해결 주장 금지.
- 릴리즈노트0.8.0~현재 정식 버전, Feat/Fix/Perf/Docs, 실제 변경 근거만.
- 일정 추가/수정/삭제/드래그·알림 설정·프로젝트 삭제 한 번 확인. 취소 시 초안 유지. 초안 폐기는 확인 없이 유지.
- 현재 AppUserModelID·사용자 DB·권한 유지. Windows 캐시 강제 삭제/고정 항목 변경 금지.
- main 직접 commit/push는 기존 승인 범위. 기존 변경은 이번 협의 문서2개임을 확인.

## Review Focus

1. 확인 대기 중 공유 회수·대상 삭제·설치 잠금으로 잘못된 대상 저장 방지(Task3).
2. 빠른 알림 확인 취소가 실패 메시지나 저장 완료로 오인되지 않음(Task3).
3. 두 정보창의 IPC 권한·포커스·트레이 복원 상태가 섞이지 않음(Task1).
4. 진단의 시간 원점·비정상 값·URL/내용 누출·session observer 충돌(Task2).
5. Windows 설치 경로에 공백이 있거나 고정 바로가기 캐시가 남아도 잘못된 실행 대상/아이콘 경로를 지정하지 않음(Task4).

## Task1: 릴리즈노트 콘텐츠·별도 창·제목 표시줄

**Files:** new shared/release-notes.ts, shared/release-content.ts, main/release-window.ts, preload/release-notes.ts, renderer/release-notes.html, renderer/release-notes/{main.tsx,ReleaseNotesApp.tsx}; main/bootstrap.ts, window-ipc.ts, shared/window-api.ts, global.d.ts, Titlebar.tsx, Icon.tsx, forest-crystal.css, electron.vite.config.mts.
**Interfaces:** ReleaseReading {version:string;scrollTop:number}; ReleaseApi.command(state|remember|minimize|toggle-maximize|close); optional onOpen. createReleaseWindow(options) => open/hideWithMain/restoreWithMain/dispose. window command release-notes.
- [x] RED: content versions/types/validation, one lazy sandbox window/IPC/reading/tray/dispose, UI version selection; titlebar release button command.
- [x] GREEN: unit/release-window, release-content and UI/release-notes; build includes independent HTML/preload; release window only constructs on click.
- [x] Caption order release/help/separator/min/max/close; root border0; actual Electron checks final Task5.

## Task2: 도움말 최초 로딩 진단

**Files:** help-performance.ts, new help-diagnostics.ts, help-window.ts, preload/help.ts, shared/help.ts, help/main.tsx; unit/help-performance/help-window/help-diagnostics.
**Interfaces:** recorder keeps requests opening history, adds bounded resourceRequests and renderer/preload timing objects with clock/timeOrigin. Fixed trusted probe reads navigation/paints/module marker; preload marker numeric IPC validated by help window.
- [x] RED: serialization bounds/redaction/invalid timing rejection, observer isolated by webContents and released, stale sender rejected.
- [x] GREEN: schema2 metadata, max40 resources/20 openings,60s observer deadline, fails do not gate rendering. Existing preparation timing unchanged.

## Task3: 저장·삭제 확인

**Files:** App.tsx, QuickReminder.tsx, tests/ui/mutation-confirmation.test.tsx and affected existing UI/E2E flows.
**Interfaces:** Confirmation.cancel optional; quick onSave resolves Result<Schedule>|null on cancel. Mutation guards read current snapshot/permissions, captured ID+draft only. Existing field validation precedes confirm. No write before confirm.
- [x] RED: create/update cancel+confirm, no confirmation on invalid fields, rapid double confirm one write; quick cancel preserves draft; list delete cascade cancel+confirm; drag date message/no write/cancel+confirm; invalidation before confirm blocks write.
- [x] GREEN: existing delete confirmations remain one, quick/save form share one dialog, drag uses existing saved state until confirmed, save shield starts only after acceptance.
- [x] Update existing tests to explicitly accept required confirmation at successful saves, while keeping error/cancel assertions distinct.

## Task4: Windows 작업표시줄 아이콘

**Files:** new main/taskbar-details.ts, bootstrap.ts, unit/taskbar-details.test.ts, scripts/testing/windows-release-info.ps1, packaged.spec.ts.
**Interfaces:** configureTaskbarDetails(window,{platform,packaged,exePath}) calls setAppDetails with existing appId, exe resource index0, correctly quoted relaunchCommand, displayName Planrail only on packaged Windows.
- [x] RED: Windows packed path with spaces, existing appId/index/display; other platforms/dev no call.
- [x] GREEN: use actual installed executable outside ASAR; capture/assert shortcut IconLocation and source executable. Do not manipulate pinned user shortcuts.

## Task5: 출시 통합·검증·검토

**Files:** package/lock0.8.5, release-content0.8.5, help descriptions/screenshots evidence, user-guide/design/domain/STATUS/implementation record, tests/e2e/release-notes.spec.ts and existing mutation tests.
- [x] Test actual two-window lifecycle/security, root/separator pixels and confirmation flow, help schema2 timing. Screenshot release window and confirmation with isolated fixtures.
- [x] Run typecheck, targeted tests, verify:app, harness, links/diff. Expected allpass; failures investigated.
- [x] One fresh final reviewer most capable model; important fixes RED→GREEN and full green suite, minors ledger.
- [ ] main commit/push; both CI workflows and Windows actual installer success. CompanyPC delay/icon display remain explicit manual checks.

## Ledger

- Pre-flight: Task1 owns new window wiring shared with Task2 diagnostics; keep distinct partitions/channels so observers and sender guards do not interfere. Task3 changes screenshot/UI test save flows; Task5 recaptures current evidence. Task4 packed-only leaves Linux/dev icons unchanged.
- Ruling: Q8 explicitly authorizes implementation; preserve direct-main approval and proceed inline without another plan permission round. This plan is the ledger; artifacts/release-help holds temporary logs. Manual bookkeeping may miss a line, so final verification checks tasks against the spec.
- Ruling: release0.8.5 distinguishes this behavior from0.8.4; changing version later requires matching release notes and capture metadata.

- Task1: 구현·단위8개/UI2개 및 Electron 두 정보창 동시 사용/격리/복원 통과. 타입 오류(이벤트 overload)는 별도 listener로 보정. UI 화면 선택 검사는 최초 GREEN 실행이며 RED 증거는 콘텐츠/창 단위 검사다.
- Task2: recorder 신규 메서드 부재 RED→GREEN, 도움말/window/observer 관련 단위 검사와 실제 schema2 생성 통과. 그림 촬영은 기능 증거이며 성능 벤치마크가 아니다.
- Task3: 확인 전 mutation과 취소 회귀 RED→GREEN; 권한 회수·중복 수락과 삭제 확인 중 하위 일정 변경 보호6개 통과. 기존 UI193개 통과 후 경계 검사3개를 추가했다. 기존 E2E 저장 경로에 명시적 수락을 추가했고 간트/달력 실제 드래그 저장 검사를 통과했다.
- Task4: taskbar helper 부재 RED→GREEN. 설치본 Windows에만 기존 AppID/EXE 아이콘/인용 실행 경로를 지정한다. 실제 Windows 검증은 CI 예정.
- Ruling: 드래그를 놓은 뒤 확인 대기에는 원본 막대를 유지하고 대화상자에 전후 날짜를 표시한다 — 미저장 후보를 확정된 일정처럼 보이지 않게 한다 — 대기 중 후보 위치를 계속 보고 싶은 사용자는 날짜 설명을 읽어야 한다.
- Ruling: UI 가상 화면/시각 확인은 Linux Xvfb :90으로 실행한다 — 이전 :98 소켓의 서버가 종료되어 있었다 — 회사 Windows 성능·아이콘 표시를 대신 검증하지 못한다.
- Task5 진행: 새0.8.5 도움말 이미지12개 실제 격리 renderer에서 재촬영, 릴리즈노트 화면 시각 확인. 전체 검사/최종 독립 검토/CI는 남아 있다.
- Task5: 기존 설치 버전 고정 assertion0.8.4가 첫 verify:app에서 실패하여0.8.5로 갱신. 타입·기능 변경이 아닌 출시 기대값을 일치시켰다. full suite를 처음부터 재실행한다.
- Ruling: 최종 독립 검토는 모든 제품 변경과 경계 검사를 적용한 현재 diff를 기준으로 전체 검사와 함께 시작한다 — 검토는 읽기 전용이며 같은 최종 코드를 검사한다 — 검토 보정이 생기면 전체 검사를 다시 실행해야 한다.
- Final review: gpt-6-astra/high의 새 문맥 읽기 전용 전체 검토. Critical0 / Important0 / Minor1. 별도 재검토 없음.
- Final: minor (deferred): 프로젝트 목록 삭제 확인 취소/대상 변경 거부 때 원래 휴지통이 목록과 함께 사라져 키보드 포커스가 목록 버튼으로 돌아오지 않는다. 삭제/입력 보존은 정상이나 다시 Tab 탐색이 필요하다. 후속 접근성 보정 항목으로 남긴다.
- Final: Ruling: 회사PC 최초 도움말 지연은 해결 여부를 판정하지 않는다 — 승인된 이번 범위는 진단 추가이고 Windows 실측이 없다 —13초 지연이 유지될 수 있으며 새 로그가 필요하다.
- Final: Ruling: 기존 고정 바로가기 캐시의 실제 아이콘은 수동 인수로 남긴다 — EXE/재실행 메타데이터 검증은 Shell 표시 검증과 다르다 — 일부 기존 고정 항목에 옛 아이콘이 남을 수 있다.
- Final: Ruling: 검토자의 전체 검사/Windows CI 판정 보류는 실행 결과로 따로 해결한다 — 코드 검토를 통과 증거로 대신하지 않는다 — 실패하면 수정·재검증까지 완료가 지연된다.
- Ruling: 공유 필터의 다단계 UI 테스트 한 건만10초 제한으로 조정한다 — 전체 실행에서5.138초로5초 제한을 넘겼으나 단독 동일 동작은1.9초에 통과했고 모든 기대 동작은 유지한다 — 이 한 건의 실제 멈춤 감지는 최대5초 늦어진다. 제품 성능 목표·전체 검사 제한은 바꾸지 않는다.

- Task5: 전체 UI196/native78 통과 후 E2E98/102. 기존 schedule 장애 주입3건은 승인 확인 단계를 빠뜨렸고 외형1건은 옛 root1px를 기대했다. 테스트에 명시적 수락/0px 기대를 반영하며 기존 장애·중복 방지 단언은 유지한다. 제품 변경 없이 재검증한다.

- Task5 로컬 완료: verify:app7단계, release26, TZ273×3, UI196, native78, E2E102 전체 통과. 하네스7검사/변경 문서 상대 링크/공백 검사 통과. 실제 확인창과 릴리즈노트 화면 확인 완료. 원격 CI 체크는 commit 이후의 최종 SHA Actions와 종료 보고를 기준으로 한다.
