# Flat glass C Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans; one fresh final reviewer.

**Goal:** 승인된 C안을 제품에 적용하면서 기존 일정·저장·창 닫기 보호를 유지한다.
**Architecture:** 업무 API와 분리된 제한적 창 API, 재사용 가능한 팝오버·Select·아이콘·전역 툴팁,
기존 React 상태와 일정 계산을 유지하는 레이아웃 변경.
**Tech Stack:** 기존 Electron45/React19/TypeScript/CSS, 의존성 추가 없음.
**Spec:** [확정 설계](../../design/flat-glass-redesign.md).

## Global Constraints

- 프로젝트 팝오버 290×442px, 내부 목록만 스크롤, 제목·추가 버튼 고정.
- 업무 CRUD 8개 API·DB·날짜 0001~9999·양 끝 포함·간트 1일28px·가상화 유지.
- 렌더러 Node 권한 차단. 커스텀 닫기는 기존 close guard 경유.
- 팝오버는 폼을 밀지 않고 화면 안에 배치. 중첩 Escape·키보드·미저장 보호 유지.
- 상시 승인에 따라 검증 후 main에 직접 push. 이번 사용자 요청은 설계 구현 승인이다.

## Review Focus

1. 신뢰하지 않는 frame/알 수 없는 창 명령으로 창 제어가 가능한지.
2. 제목 표시줄 버튼이 편집 모달 중에도 닫기 보호를 통과하는지.
3. 중첩 팝오버의 Escape·Tab·외부 클릭이 입력을 버리거나 모달 포커스를 탈출하는지.
4. 짧은 창·200% 배율·긴 목록에서 버튼/팝오버가 잘리는지.
5. 임의 프로젝트 색상에서 라이트/다크 막대 텍스트 대비와 드래그 타깃이 유지되는지.

### Task 1: 창 API와 제목 표시줄

Files: `src/shared/window-api.ts`, `src/main/window-ipc.ts`, `src/main/window.ts`,
`src/main/bootstrap.ts`, `src/preload/index.ts`, `src/renderer/global.d.ts`,
`src/renderer/components/Titlebar.tsx`, `Icon.tsx`, `tests/e2e/flat-glass.spec.ts`.
Interface: 별도 `window.timelineWindow.command('minimize'|'toggle-maximize'|'close'|'state')`
→ `{ok:boolean,maximized?:boolean}`. 업무 API 형태는 불변.
- [x] 제목 표시줄·dirty close 보존 E2E를 작성, 기존 앱에서 실패 확인.
- [x] trusted sender 및 명령/인수 검증, `frame:false`, close() 사용. titlebar는 모달 inert 밖에 배치.
- [x] 타입·빌드·해당 E2E 통과 확인.

### Task 2: 공통 입력과 팝오버

Files: `Popover.tsx`, `Select.tsx`, `TooltipLayer.tsx`, `DatePicker.tsx`, `EditorPanel.tsx`, UI/E2E.
Interface: Popover는 anchor ref, onClose(restoreFocus), 크기/className/children을 받는다.
Select는 label/id/value/options/onChange, Arrow/Home/End/Enter/Escape/Tab 지원.
- [x] 기존 앱에서 날짜 선택 시 폼 위치 유지·중첩 Escape·custom select 검사를 실패 확인.
- [x] 고정 좌표·상하 반전·화면 제한·중첩 DOM 유지로 editor focus trap과 호환한다.
- [x] 날짜 직접 입력·연도 경계와 기존 선택 저장 테스트를 새 UI 의미에 맞춰 유지한다.
- [x] 관련 UI와 E2E 통과 확인.

### Task 3: C안 통합 및 색상

Files: `Toolbar.tsx`, `ProjectList.tsx`, `App.tsx`, `styles.css`, `flat-glass.css`,
Gantt/Calendar 프레젠테이션과 테스트.
- [x] 팝오버 290×442·20개 프로젝트 내부 스크롤·고정 제목/추가·툴팁 E2E 실패 확인.
- [x] 목록을 toolbar 팝오버로 이동. 폴더·월·뷰·테마·추가 버튼 아이콘, 연월 직접 입력 병행.
- [x] 테마 토큰·flat 구획·연한 막대 채움·고정 헤더를 적용. UI 컴포넌트 외 업무 상태는 유지.
- [x] 격리 Electron 실제 화면을 두 테마·두 모드·편집·짧은 창에서 확인.

### Task 4: 검증·리뷰·기록

- [x] `DISPLAY=:98 npm run verify:app` 통과(제품 빌드·타입·release·3TZ·UI·native·E2E).
- [x] 독립 리뷰, 중요 지적은 재현 검사와 함께 수정.
- [x] 설계/구현/검증 범위를 문서화하고 `node scripts/harness/run.mjs verify`, diff/link 검사.
전달 단계: 승인된 변경만 main 커밋·push하고 원격 SHA 및 CI 상태를 최종 응답에 남긴다.
