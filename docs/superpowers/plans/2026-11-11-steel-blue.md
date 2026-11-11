# Deep Gray / Steel Blue 구현 계획

> **For agentic workers:** Use superpowers:executing-plans. 승인된 시안과 사용자 JSON을 기준으로 진행한다.

**Goal:** 회색 창 모서리·두꺼운 rim을 없애고 딥 그레이/스틸 블루와 선명한 P 아이콘을 적용한다.
**Architecture:** 기존 재질 CSS를 직접 수정한다. Windows native Acrylic 구조·기능은 유지하고 ICO를 창/트레이에 연결한다.
**Tech Stack:** Electron, React, CSS, Playwright, PNG/ICO.
**Spec:** [승인 화면 설계](../../design/forest-crystal.md).

## 제약과 검토 초점

- 창/패널/버튼 투명도58/44/70%, CSS 흐림2px. OS Acrylic 흐림 수치와 동일하다고 주장하지 않는다.
- root radius0·단일1px 경계. 내부 패널 모서리와 프로젝트별 막대 색·44/40px 행·업무 기능 유지.
- 다크 배경은 중립 회색, 주요 조작은 스틸 블루. 라이트 가독성·팝오버·고대비·짧은 창 회귀를 확인한다.
- 작은 아이콘은 여백/흰색 P 대비/ICO 다중 크기를 확인한다. Windows150% 실기는 별도 인수다.
- main 직접 작업·검증 후 push는 기존 사용자 지시를 따른다. 구현 승인을 받은 항목은 재질문하지 않는다.

## Task 1: 화면 재질

- [x] 실제 Electron에서 root 모서리/경계·반사층 제거·업로드 alpha·스틸 블루 선택 상태 검사를 추가하고 RED 확인.
- [x] `src/renderer/forest-crystal.css`의 기존 규칙을 수정한다. `window-material.ts`의 미지원 OS 기본색도 중립색으로 바꾼다.
- [x] 해당 E2E 및 window-material 단위 검사를 통과시키고 실제 라이트/다크·간트/달력·팝오버 화면 비교.

## Task 2: 아이콘

- [x] PNG 대신 Windows ICO 사용 여부와 작은 크기 이미지 패키징 검사를 추가하고 RED 확인.
- [x] P 원형을 유지한 스틸 블루 원본을 만들고 작은 크기 PNG와 multi-resolution ICO로 인코딩한다.
- [x] main 창/트레이는 Windows ICO, 다른 OS와 About/renderer는 PNG. 기존 identity/appId는 유지한다.
- [x] 작은 크기 실물/확대 비교, asset 크기·알파·사용처 검증.

## Task 3: 완료 검증

- [x] 버전0.6.4, 설계·출처·구현 기록 갱신. 의존성 변경 없음.
- [x] `npm run verify:app`, `node scripts/harness/run.mjs verify`, `git diff --check` 통과.
- [x] 전체 diff 독립 리뷰 후 필요한 수정과 회귀 확인. Windows 미검증 범위 명시.
- [x] main 커밋·push, 해당 SHA의 CI 상태 확인.
