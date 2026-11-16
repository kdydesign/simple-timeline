# Host/member Help Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. 승인된 설계의 구현 요청에 따라 현재 세션에서 직접 실행하고 마지막에 독립 검토한다.

**Goal:** 오프라인 호스트·멤버 도움말을 독립 창으로 제공한다.

**Architecture:** main이 단일 도움말 창과 세션 읽기 상태를 소유한다. 별도 sandbox preload와 renderer 진입점은 읽기 전용 콘텐츠/검색/이미지 확대만 제공한다. 주 창의 트레이·종료 흐름에 연결하며 데이터 API는 공유하지 않는다.

**Tech Stack:** 기존 Electron, React, TypeScript, Vitest, Playwright. 새 의존성 없음.

**Spec:** [승인 설계](../../design/host-member-help.md)

## Global Constraints

- H1~H8 승인. 이번 요청은 도움말 구현이며 알림 제어·접속 상태 기능은 보류 유지.
- 기본1120×800, 작업 영역 제한. 역할별 첫 항목, 같은 실행 중 읽기 위치 유지.
- 도움말은 하나, X는 도움말만 종료. 트레이 숨김·복원 연동, 주 창 초안·종료 보호 유지.
- sandbox/contextIsolation 유지, Node/webview/외부 탐색 차단. 전용 preload와 발신 창 검증.
- 실제 가상 데이터 화면, 번호 설명, 오프라인 자산·검색. 제품 API·공유 동작 변경 없음.
- 기존 사용자 승인에 따라 main에서 작업·검증 후 직접 push한다. 별도 구현 계획 승인을 반복 요청하지 않는다.

## Review Focus

1. 도움말 로딩 도중 트레이 숨김/종료 → 창이 뒤늦게 다시 나타나지 않음(Task1).
2. 도움말 renderer의 데이터/임의 IPC 접근 → 거부, 고정 출처·mainFrame 검사(Task1/3).
3. 앱 종료 취소·도움말 renderer 실패 → 주 창 초안 보존, 재시도 가능(Task1/3).
4. 검색 결과 없음·높은 배율·이미지 누락 → 접근 가능한 안내와 닫기/복원(Task2/3).
5. 미구현 기능·오래된 화면 포함 → 현재 기능만 문서화, 이미지 촬영 기록(Task2/3).

### Task 1: 독립 창과 IPC

**Files:** `src/shared/help.ts`, `src/main/help-window.ts`, `src/preload/help.ts`, `src/main/bootstrap.ts`, `src/main/window-ipc.ts`, `electron.vite.config.mts`, `tests/unit/help-window.test.ts`.

**Interfaces:** `createHelpWindow({mainWindow,url,preload,role,version,icon,onError})` → `open/hideWithMain/restoreWithMain/dispose`. 별도 `help:command`의 `state/remember/minimize/toggle-maximize/close`, `HelpReadingState {topicId,query,scrollTop}`. 주 창 `window:command`에 `help`만 추가.

- [x] 단일 창/숨김 중 로드 완료/재열기 상태/로드 실패/허용되지 않은 IPC/종료 dispose 테스트 작성 후 `npm run test:unit -- tests/unit/help-window.test.ts` 실패 확인.
- [x] main manager·전용 preload·빌드 진입점·주 창 종료 경로 연결. 같은 명령 통과 확인.

### Task 2: 콘텐츠와 도움말 UI

**Files:** `src/shared/help-content.ts`, `src/renderer/help.html`, `src/renderer/help/`, `src/renderer/components/Titlebar.tsx`, `src/renderer/components/Icon.tsx`, `tests/ui/help.test.tsx`, `tests/unit/help-content.test.ts`.

**Interfaces:** `HelpArticle {id,section,title,intro,steps,image?,related}`; 첫 항목 personal=`getting-started`,host=`host-start`,member=`member-connect`. 검색 함수는 제목·본문·단계의 검색 결과/일치 문맥을 반환. main 검증과 UI가 같은 항목 ID 목록 사용.

- [x] 역할별 진입/검색/초안과 무관한 읽기 상태/이미지 확대·Escape·대체 설명 UI 테스트와 중복ID/경로/related 검증 작성, 실패 확인.
- [x] 승인된 다크 시안으로 구현. 목차 접기·검색 지우기·단계 번호·내부 링크·키보드 이미지 이동·창 조작·실패 재시도 제공.
- [x] `npm run test:ui -- tests/ui/help.test.tsx`와 콘텐츠 단위 검사 통과 확인.

### Task 3: 실제 화면·통합·검증

**Files:** `tests/e2e/help.spec.ts`, 도움말 PNG/촬영 메타데이터, 기존 사용자 안내·설계·STATUS·구현 기록.

- [x] Electron 두 창/입력 보존/트레이 숨김·복원/초기화/IPC 격리 테스트 작성 후 실패 확인.
- [x] 격리 테스트 프로필의 현재 앱 화면 촬영·도움말 자산 등록. LAN 예시는 명시하고 실제 환경 주소/자격은 제외.
- [x] 관련 E2E, `npm run verify:app`, `node scripts/harness/run.mjs verify`, `git diff --check`. 실제 실행 가능한 범위와 Windows 실기 미검증 분리.
- [x] 독립 전체 검토 후 중요한 문제는 재현 테스트로 수정. 문서 갱신·main commit/push, 결과와 한계 보고.

## 실행 기록

- 시작 기준 `c214891`. 제품 코드 clean. 완료된 MVP 단계는 유지한다.
- Ruling: 스킬의 작업 공간 스크립트 대신 기존 ignored `artifacts/help-implementation/`에 실행 로그를 둔다. 현재 main 직접 작업은 AGENTS의 상시 사용자 승인에 근거한다. 별도 워크트리 간 통합은 불필요하며 변경 범위 검사로 기존 파일을 보호한다.

- Task 1 complete: 창/IPC 단위4개와 이후 검토 회귀2개 통과. 코드/로그: `artifacts/help-implementation/window-*`, `review-*`.
- Task 2 complete: 콘텐츠 단위2개·UI3개, 실제 이미지 로딩/확대·재열기 E2E 통과. 이미지 크기를 미리 확보해 재열기 스크롤 보정.
- Ruling: 출시 버전은0.8.2로 선택 — 기존0.8.1 멤버가 새 도움말 포함 배포를 구분할 필요가 있음 — 잘못되면 배포 버전 정책을 조정해야 하며 데이터 형식에는 영향 없음.
- Final fixed: 늦은 로드의 포커스 탈취·트레이 복원 래치·숨김 오류의 주 창 표시 — 재현 단위2개 RED→GREEN, 관련 단위8/8.
- Final ruling: 현재 항목 재선택의 화면/저장 위치 불일치는 읽기 위치 계약에 영향을 주므로 수정 대상으로 재분류. 실제 스크롤과 저장 위치를 함께0으로 맞추는 UI 재현 테스트 RED→GREEN으로 보정. 알려진 미수정 검토 항목 없음.
- Final ruling: Windows 배율·다중 모니터·Narrator·설치 실기·회사 PC 시작 시간은 환경이 달라 미검증으로 유지 — Linux 통과를 실기 인수로 오해하지 않도록 기록.

- Task 3 complete: verify:app 7/7 통과(release26, 단위243×3TZ, UI173, native70, E2E99, typecheck/build). ASAR fixture 쓰기 완료 대기를 추가한 뒤 release26개 재검증. 하네스·문서 링크21개·diff 검사 통과. 실제 도움말 기본/좁은 화면 확인.
