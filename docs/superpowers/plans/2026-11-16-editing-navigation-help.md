# Editing, navigation and help implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. 승인된 구현을 직접 실행하고 마지막에 독립 전체 검토를 받는다.

**Goal:** 확인 없는 초안 폐기, 간트 Space 복구, 경고 토스트, 빠르고 완전한 도움말, 역할 배지.
**Architecture:** 기존 편집/종료·업데이트 안전 경계는 유지하며 dirty만 차단 조건에서 제거한다. 도움말 main 관리자는 사전 준비/사용자 열림/트레이 숨김을 구별하고 전용 읽기 전용 IPC로 현재 읽기 상태와 준비 완료만 교환한다. 제품 기능 안내는 기존 콘텐츠/촬영 검증 구조를 확장한다.
**Tech Stack:** 기존 Electron/React/SQLite/TypeScript/Vitest/Playwright, 새 의존성 없음.
**Spec:** [Q1~Q8 승인 설계](../../design/editing-navigation-and-help.md)

## Global Constraints

- 미저장 입력은 폐기하되 시작된 저장은 안전하게 마무리. UPDATE도 자동 설치, 재실행 후 대기 파일은 명시적 설치 유지.
- 트레이 X는 입력 보존. 데이터 삭제 확인·권한·보안 계약은 그대로 유지.
- 행동 경고4초, 성공2초. 필드·DB/통신 오류를 토스트로 숨기지 않음.
- 도움말 창1초/본문3초는 실측 목표. 주 창 준비 후 사전 로딩. 사용자 X는 숨김, 종료 시 파괴. 개인정보 없는 시간 기록.
- 역할은 호스트/멤버만 표시. 개인·미확정 상태 숨김.
- 기존 사용자 승인/AGENTS에 따라 검증 후 main 직접 commit/push. 사용자 데이터/실행 프로필로 시험 금지.

## Review Focus

1. 설치 준비 중 늦은 저장·renderer 무응답·결과 불명에서는 초안 폐기 동의로 안전 확인을 생략하지 않음(Task1).
2. Space 누름 전 range 포커스·일반 input·button에서 키보드 기본 기능과 pan의 충돌(Task2).
3. prewarm 중 열기/숨김/역할 변경/실패 경합이 창을 임의 표시하거나 준비된 IPC 상태를 오염시키지 않음(Task3).
4. ready IPC가 이전 열기의 늦은 응답이면 새 열기의 성능 성공으로 기록하지 않음(Task3).
5. 도움말이 예전 미저장 보호/테마 전환/미지원 기능을 실제 기능으로 안내하지 않음(Task4).

## Task 1: 초안 폐기·경고·안전한 종료

**Files:** App.tsx, SharingSettings.tsx, state/useUpdates.ts, main/bootstrap.ts, main/close.ts, 기존 UI/unit/E2E 업데이트·편집·공유·종료 검사.
**Interfaces:** 기존 request(action), requestCloseQuick(), SharingSettings.close()는 저장 중 제외하고 확인 없이 수행. useUpdateGuard(UpdateSafety)는 known/saving/blocked를 검사하고 dirty/dateDraft는 설치 거부 이유에서 제외. main install barrier/timeout 유지. App.warning은 우측하단 role=alert4초, 기존 notice는2초.
- [x] RED: 편집/빠른 알림/공유 X에서 초안 버리기 확인 없음, Exit dirty 확인 callback 미호출, UPDATE dirty+날짜초안으로 clean ack, saving/unknown 거부, 경고4초.
- [x] GREEN: `npm run test:ui -- tests/ui/editor.test.tsx tests/ui/quick-actions.test.tsx tests/ui/updates.test.tsx tests/ui/sharing.test.tsx`; `npm run test:unit -- tests/unit/close.test.ts tests/unit/update-installer.test.ts`.
- [x] 기존 E2E의 폐기 확인·dirty 설치 대기를 새 승인 계약으로 갱신. 실제 쓰기/실패/재실행 대기 검사는 유지.

## Task 2: Space 탐색·역할 배지

**Files:** state/useGanttNavigation.ts, components/Titlebar.tsx, styles.css, UI zoom/navigation/sharing 및 실제 E2E.
**Interfaces:** editable(target)는 gantt-navigation의 range만 문자 입력 제외. Space pan은 현재 범위·offset만 변경. Titlebar 기존 sharing.role로 h1 바로 뒤 읽기 전용 badge.
- [x] RED: 가로/배율 range focus 후 Space pan, 일반 input Space 보존, role host/member/personal/null 및 disconnected 역할 표시.
- [x] GREEN: 해당 UI tests, 실제 Electron 스크롤 드래그→Space-pan 회귀.

## Task 3: 도움말 사전 준비·재사용·계측

**Files:** main/help-window.ts, new main/help-performance.ts, main/bootstrap.ts, shared/help.ts, preload/help.ts, renderer/help/HelpApp.tsx, unit/help-window.test.ts, UI/help.test.tsx, E2E/help.spec.ts.
**Interfaces:** createHelpWindow에 prepare():void. bootstrap ui-ready 뒤 유휴 예약해 prepare. 기존 open/hideWithMain/restoreWithMain/dispose 유지. HelpApi.onOpen(listener) 알림으로 첫 역할 및 재열기 상태 갱신; command ready는 main 발급 openId를 확인. HelpReply.openId. createHelpPerformance(path,version)는 구조화된 시간만 기록, 최대20회 파일 크기 제한.
- [x] RED: prepare로 표시없음, 닫기후 window 재사용, 첫 실제열기 당시 role, tray복원구분, dispose, 재시도, 중복/과거ready 거부.
- [x] GREEN: `npm run test:unit -- tests/unit/help-window.test.ts`; `npm run test:ui -- tests/ui/help.test.tsx`; Electron help lifecycle와 timing 파일 검증. 기존 모니터/보안 정책 유지.

## Task 4: 전체 기능 안내·출시 통합

**Files:** shared/help-content.ts, shared/help.ts, HelpApp.tsx, help images/capture metadata, help asset E2E, user-guide/기존설계/STATUS/구현기록, package/lock0.8.4.
**Interfaces:** helpSections와 HelpTopicId를 한 원천에서 확장, validateHelpArticles 유지. 기존14개 글+기본프로젝트/일정/탐색/달력/알림/트레이/설치/도움말 사용 글. 이미지 단계는 실제 가상자료 캡처와 일치.
- [x] RED: 기능별 검색 결과·모든분류가 목차에 표시·모든topic/related/image 유효. UPDATE 폐기 문구 반영, role 배지/빠른 알림 포함.
- [x] GREEN: help unit/UI 및 실제 screenshot capture/build metadata 검증.
- [x] 전체 `DISPLAY=:98 CHROME_DEVEL_SANDBOX=/usr/lib/chromium/chrome-sandbox npm run verify:app`, harness, 경로검사, 화면검토. 독립 reviewer의 중요 문제를 RED→GREEN으로 보정.
- [ ] main commit/push 후 Linux/Windows CI 및 실제 NSIS 검사/산출물 확인. 실제 회사PC1/3초는 미검증으로 구분.

## Ledger

- Pre-flight: Task1 변경 문구와 UPDATE guard는 Task4 도움말/설치 E2E에 반영. Task2 역할 표시를 Task4 화면에 반영. Task3 openId/onOpen을 Task4 제목·검색 목차에서 보존.
- Ruling: Q8 구현 승인과 AGENTS의 main 지침을 적용해 재승인 없이 직접 실행한다. 계획 파일을 ledger로, artifacts/editing-help를 로그로 사용한다. 별도 스킬 스크립트 대신 수동 기록이므로 누락을 최종검증에서 대조한다.
- Ruling: 후속 버전을0.8.4로 구분한다. 다른 출시 번호가 필요하면 metadata/설치 버전 조정이 필요하다.
- Task1~3: 주요 RED→GREEN 완료. 단위25개·UI33개 통과. 실제 Electron 범위 입력→Space-pan, 초안 폐기/삭제 확인 유지, Exit 저장 대기 통과. 전체 검증 진행 중.
- Task4: 도움말25개 항목과 실제 가상자료 이미지 추가,0.8.4 버전/문서 갱신. 촬영5개 통과(두 실행 합산). 초기 DISPLAY 없음과 기존 창1개 가정 검사를 보정했다. 회사PC 실측은 남겨 둔다.
- 전체 review 범위는 기준 a060eb6부터 현재 tracked/untracked 변경 전체이며 artifacts/editing-help/review-stat.txt에 파일 요약을 보관한다. 검증 실행 중 reviewer는 코드/문서를 읽고 독립 테스트가 필요하면 별도 출력 디렉터리를 사용한다.
- Final review: fresh gpt-6-astra/high, read-only. Critical0, Important2. 공유 명령 IPC 결과 불명 설치 허용과 숨긴 prewarm 실패의 일반 Open 오류창을 확인.
- Final: fixed 공유 명령 결과 불명 설치 허용 — updates UI(unavailable/rejected) RED true→GREEN false, 정상 validation 실패는 설치 허용, poll/다른 성공 명령에도 결과 불명 유지. 해당 전체 UI21/21.
- Final: fixed prewarm/user-closed cache 오류의 주 창 방해 — help-window 단위 RED 예상 밖 onError→GREEN 무호출·명시 재생성. 해당 전체 단위9/9.
- Final: Ruling: 공유 저장 결과 불명은 세션 동안 설치 금지 latch를 유지하고 재실행·실제 설정 확인을 안내한다. 후속 poll/다른 성공으로 이전 요청을 증명할 수 없기 때문이다. 과도할 경우 사용자가 앱을 한 번 재실행해야 하는 비용이 있다.
- Final: Ruling: reviewer가 유보한 verify:app·Windows 설치 성공은 직접 전체 실행과 CI로 판정한다. 회사PC1초/3초·보안 프로그램·유휴 메모리는 미검증으로 남긴다. 환경마다 성능이 다를 수 있다.
- Final: Ruling: 기존 종료 실패 복구 구조의 전면 재설계는 범위 밖으로 유지한다. 이번에는 진행 저장 drain을 검증하고 안전 확인 실패 시 설치를 막는다. 기존 오류 복구의 한계는 남는다.
- Final: Ruling: 실패 handoff가 DB를 이미 닫은 격리 fixture와 의도적으로 공유 metadata를 지운 손상 복구 fixture의 재시작에만 app.exit를 사용한다. 제품 강제 종료를 추가하지 않으며 실제 Windows updater/NSIS가 정상 종료 경로를 검증한다. fixture만으로 실제 설치 성공을 주장하지 않는다.
- Final: Ruling: 과거 설계는 당시 기록을 보존하고 후속 승인 링크로 우선순위를 표시한다. 미지원 기능과 스타일 선호는 추가하지 않는다. 오래된 문서는 후속 링크를 함께 읽어야 한다.
- Final: minor (deferred): 재촬영한 멤버 도움말 이미지의1번 표시는 연결 아이콘보다 왼쪽 역할 배지에 가까움. 본문과 실제 기능에는 영향 없음. 일정 저장 이미지3번은 review 보고 이전의 좌표 보정에 포함돼 현재 y78이다.
- Ruling: 전체 E2E가84개 통과 후360초 제한으로 중단되어 총 예산을600초로 늘린다. 개별45초·IPC/저장 제한은 유지하고 runner 예산 검사 RED→GREEN 및 지침을 갱신한다. 완전한 멈춤 감지가 최대240초 늦어지는 비용이 있다.

- Final verification: 2026-11-16 07:31:57 UTC verify:app 전체 통과(typecheck/release26/3TZ×261/UI188/build/native78/E2E100). 하네스·문서 링크·diff 검증 통과. Windows CI는 main 반영 후 별도 확인하며 최종 SHA/결과는 종료 보고에 남긴다.
