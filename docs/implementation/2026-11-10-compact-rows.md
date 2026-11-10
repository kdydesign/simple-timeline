# 간트 행 축소·알림 스위치 · 0.6.3

기준 `6ddba8e` clean main. 사용자의 행 높이 축소와 스위치 교체 요청을 적용한다.
[화면 기준](../design/forest-crystal.md#063-행-밀도알림-조작-보정)을 따른다.

## 변경과 근거

- 프로젝트 64→44px, 일정 60→40px. 행 모델을 바꿔 가상화 prefix·접기/펼치기·스크롤 기준도 일치시켰다.
  프로젝트의 큰 굵은 글씨·배경, 일정 들여쓰기는 유지했다. 이름 버튼의 공통 최소 높이는 간트 안에서만 해제했다.
  이름·날짜 줄 높이와 위아래 여백을 줄이고 28px 일정 막대를 행 중앙에 둔다.
- 알림 입력은 기존 Radix Switch를 감싼 로컬 컴포넌트다. 레이블·Tab/Space·체크 상태를 연결하며
  일정 추가·편집과 멤버의 개인 알림 편집에 동일하게 적용한다. 저장·기본 꺼짐·발송 동작은 바꾸지 않는다.
- JSDOM에 없는 ResizeObserver는 테스트 환경에서만 보완했다. Radix의 숨은 form 입력 크기 관찰을 위한 것이며
  실제 레이아웃·리사이즈는 Electron 검증으로 확인한다. 의존성·DB·main/preload 변경은 없다.

## 검증

격리 프로필, sandbox 유지, Linux x64·Node24.22.1·Electron45.2.1·Xorg `:95`.
`artifacts/compact-rows/`에 실패·수정 후 결과와 화면을 보존한다.

- RED: 기존 그룹 높이244px로 축소 레이아웃 검사가 실패했고, 체크박스에는 switch 역할이 없음을 확인했다.
- 첫 수정 후 이름 버튼의 공통 최소28px가 두 줄 표시를 행 밖으로 밀어낸 것을 실제 Electron 검사로 발견·수정했다.
- 알림 UI 3개 검사와 실제 bridge의 저장·재실행 복원, 행 경계·접기/펼치기 회귀가 통과했다.
- 1440×900 격리 Electron 화면을 `after/add.png`, `after/dark.png` 등으로 캡처해 이전 0.6.2 화면과 대조했다.
  프로젝트/일정 계층, 이름·날짜 표시, 스위치 켜짐/꺼짐과 두 테마를 확인했다.
- 독립 리뷰의 Critical/Important 결함은 없다. 고대비 hover 선택자 우선순위 지적을 반영해 시스템 색을 유지하도록 수정했다.
- `DISPLAY=:95 npm run verify:app`: 2026-11-10 14:28:48~14:35:08 UTC, HEAD `6ddba8e` + 이번 변경(dirty), 7단계 통과.
  타입·빌드, release 15, unit 112×3 TZ, UI 116, native 41, Electron E2E 75개가 통과했다.
- Chromium forced-colors 에뮬레이션에서 스위치 켜짐/꺼짐 각각의 배경·테두리가 hover 전후 유지됨을 확인했다.
  `forced/forced-colors.json`과 화면이 근거이며 Windows 고대비 실기 인수와 구분한다.
- `node scripts/harness/run.mjs verify` 7/7, `git diff --check` 통과.
- main 커밋·push의 최종 SHA와 해당 clean checkout CI 상태는 종료 메시지에서 확인한다.

Windows 150% 배율의 실제 화면 인수는 별도 미검증이다.
