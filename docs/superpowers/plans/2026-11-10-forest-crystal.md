# Forest Crystal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox syntax for tracking.

**Goal:** 승인된 Forest Crystal 시안을 기존 기능을 보존하며 실제 데스크톱에 적용한다.
**Architecture:** 기존 renderer 동작과 좌표 계산을 유지한다. 최종 재질 CSS와 제한된 컴포넌트 변경, Windows native backdrop 정책으로 구현한다.
**Tech Stack:** Electron 45 / React 19 / 기존 shadcn·Radix / CSS.
**Spec:** [승인 설계](../../design/forest-crystal.md).

## Global Constraints

- 기본 290×442px 프로젝트 팝오버, 버튼 바로 아래, 내부 스크롤.
- 달력과 툴바 동일 투명도. 달력은 제목·격자 단일 패널.
- 저장·선택·일정 추가는 같은 연한 그린. 낮은 버튼 입체감.
- DB·날짜·공유·알림·IPC 권한·현재 데이터는 보존한다. 새 의존성 없음.
- 승인된 직접 main 작업·검증 후 push 방식을 유지하며 재승인을 요청하지 않는다.

## Review Focus

- 유리 표면이 fixed 팝오버의 위치나 모달 포커스를 바꾸는지 실제 Electron으로 확인.
- 짧은 창과 최대화에서 편집 하단/간트 스크롤을 계속 사용할 수 있는지 확인.
- 진한 프로젝트 색상과 라이트/다크에서 글자·비활성 상태를 읽을 수 있는지 화면 확인.
- Windows Acrylic 미지원/설정 비활성화에서도 크기 조절·창 컨트롤을 유지.
- 날짜 강조와 막대 드래그 hit target을 재질 레이어가 가로채지 않는지 기존 회귀 실행.

### Task 1: 재질·창 정책 및 핵심 컨트롤

**Files:** `src/main/window.ts`, `src/main/window-material.ts`, `src/renderer/forest-crystal.css`, `src/renderer/App.tsx`, `src/renderer/components/Toolbar.tsx`, `src/renderer/components/Icon.tsx`, `tests/unit/window-material.test.ts`, `tests/e2e/forest-crystal.spec.ts`.
**Interfaces:** 순수 `windowMaterial(platform: string, release: string)`는 native backdrop 옵션을 반환한다. 최종 CSS는 공통 `--glass`, `--text`, `--accent` 토큰과 재질 규칙을 제공한다.

- [x] 기존 Electron 화면 캡처와 핵심 UI 회귀로 기준 상태 확인.
- [x] Windows 지원 버전/비지원 OS/비정상 버전의 backdrop 정책 테스트 RED 확인.
- [x] 팝오버 아이콘 버튼과 좌표, 동일 달력/툴바 재질을 검사하는 실제 Electron 회귀 RED 확인.
- [x] native 옵션·시안의 최종 CSS·프로젝트 추가 아이콘·캘린더 아이콘 적용.
- [x] 관련 unit/Electron 회귀 GREEN, 타입 검사.

### Task 2: 시각 보정·전체 검증·전달

**Files:** `src/renderer/components/GanttView.tsx`, `src/renderer/components/CalendarView.tsx`, `src/renderer/components/CalendarDragPreview.tsx`, 필요한 공통 UI, `tests/e2e/planrail-design.spec.ts`, 구현 기록.
**Interfaces:** 원래 날짜/기간 계산과 막대 위치는 그대로 사용하고 색상 표현만 공유한다.

- [x] 프로젝트 색상 막대·오버레이·편집 패널의 라이트/다크 표면 보정.
- [x] 네 기능 화면을 캡처하여 승인 이미지와 비교, 팝오버·날짜 선택·확인창·스크롤 확인.
- [x] 변경된 승인 토큰에 맞춰 기존 디자인 검사의 기대값을 갱신하고 기능 검사는 유지.
- [x] `DISPLAY=:95 npm run verify:app`, `node scripts/harness/run.mjs verify`, `git diff --check` 통과.
- [x] 전체 변경 fresh review 후 필요한 수정·검증을 마쳐 반영할 변경 확정.

전달: main 커밋·push 및 CI 상태는 종료 메시지에 소스 SHA·실행 링크로 기록한다.

## Execution ledger

기준 SHA: `3a5eaaf42137b3adac0a95c7b48c67c0d282b2dd`. 작업 전 clean, 원격 main 동일.
Ruling: 사용자 시안 확정과 구현 요청이 승인이다. 새 계획 재승인 대신 같은 범위로 직접 수행한다.
Ruling: 기존 main 직접 작업/반영 지시를 유지한다. 시각 CSS는 실제 화면과 기존 회귀로 검증하고 토큰 값을 그대로 복제하는 단위 테스트는 만들지 않는다.
진행·실행 증거는 `artifacts/forest-crystal/`에 보존한다.

Pre-flight: Task 1의 재질 토큰을 Task 2의 일정 막대·편집 패널이 사용한다. 날짜 배치·가상화·포커스 계약과 충돌하지 않는 최종 CSS로 연결한다.
Task 1: complete — native 정책 RED 1 failed/5 passed → GREEN 6/6; 팝오버·색상 회귀 RED 후 관련 Electron 8/8 GREEN, 타입 검사 통과.
Task 2: 날짜 입력을 두 열로 배치하고 저장/취소 폭을 넓혔다. 기존 날짜 값·라벨·키보드 조작은 유지한다.
Ruling: 설치본 식별 버전을 0.6.1로 올린다 — 같은 0.6.0 설치 파일과 시각 변경본을 구분하기 위해 — 기능·DB 스키마 변화는 없으며 의존성 버전도 그대로다.
Ruling: 기존 CSS 파일을 삭제·재작성하지 않고 재질 레이어를 마지막에 적용한다 — 검증된 날짜 좌표·모달 동작을 유지하기 위해 — 향후 스타일 수정 시 누적 cascade를 함께 확인해야 한다.
검증 중 발견한 primary 우선순위를 수정했다. 테마 변경 직후 색상 검사는 기존 100ms 색상 전환이 끝날 때까지 polling하며 기능 assertion을 제거하지 않았다.

Final review: fresh reviewer 완료. Critical 없음. 달력 제목의 이중 표면 Important, 오류 테두리 Minor, 극단 프로젝트 색상은 판단 보류로 보고했다.
Final: Ruling: 오류 테두리를 Important로 재분류해 같은 보정에 포함 — 기존 잘못된 필드의 시각 표시가 사라지는 회귀이므로 — 미수정 시 사용자가 오류 입력을 찾기 어려워진다.
Final: fixed 달력 이중 재질 — 헤더 transparent assertion RED→GREEN. sticky blur는 남기고 부모 표면만 칠한다.
Final: fixed 오류 테두리 — 실제 빈 이름 저장의 aria-invalid + 테두리 검사 RED→GREEN, 라이트/다크 확인.
Final: Ruling: 극단 색상 가독성을 보정 범위에 포함 — 사용자 색상이 검정일 때 대비 3.30:1이 실제 관측됨 — 일정 tint를 낮추므로 이전 중간 캡처보다 막대가 밝아진다.
Final: fixed 검정/흰색 프로젝트 막대 대비 — 양 모드·양 테마 4.5:1 이상 검사 RED→GREEN. 실측 CSS 기본 배경 기준이며 전체 WCAG 인증은 아니다.
Final: Ruling: 간트 하단의 viewport ±2px 검사를 패널 하단 ±2px + viewport 안쪽 24px 이내로 보정 — 승인된 외곽 유리 여백 18px 때문에 첫 전체 검사의 1건이 실패 — 실제 패널 하단 고정과 이동 컨트롤 조작 검사는 유지한다.
Final: Ruling: Windows 투과·배율·GPU 실기와 모든 비활성 조합은 Linux 근거로 통과 표시하지 않는다 — 실행 가능한 환경 한계 — 사용자 Windows 확인이 남는다. 생성 시안의 생략 필드는 기능 변경 없이 유지한다.
보정 후 관련 Electron 7/7 통과. 최종 전체 suite 결과는 구현 기록에 남긴다. deferred minor 없음.
Task 2: complete — verify:app 7/7 단계 (Electron E2E 72/72), harness 7/7, diff whitespace 통과. 2026-11-10 Linux dirty 작업 트리 결과다.
