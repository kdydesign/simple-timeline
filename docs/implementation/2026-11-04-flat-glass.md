# C안 flat·반투명 화면 구현

## 범위와 근거

2026-11-04 사용자의 “디자인 변경 사항 반영해” 요청에 따라
[확정 C안](../design/flat-glass-redesign.md)과 [구현 계획](../superpowers/plans/2026-11-04-flat-glass.md)을 반영했다.
기준 HEAD는 `e1ab545113907d746ce24bcecf23f77b2ddc5a61`이며 아래 검증은 이 변경 작업 트리(dirty=true)의 결과다.
설계 선택을 다시 묻거나 새로운 필터·검색·OS 투명 효과를 추가하지 않았다.

## 변경과 이유

- `Titlebar.tsx`와 `main/window-ipc.ts`: OS 기본 제목 표시줄 대신 커스텀 창 버튼을 제공한다.
  창 제어는 기존 8개 업무 API와 분리하고 동일한 발신자 검증을 적용했다.
  닫기는 기존 close guard를 거쳐 저장 중 대기·미저장 변경 보호를 유지한다.
- `Toolbar.tsx`, `ProjectList.tsx`, `App.tsx`: 프로젝트 관리 목록을 폴더 아이콘의 290×442px 팝오버로 옮겼다.
  많은 항목은 가운데 목록만 스크롤하고 제목·닫기·추가 버튼은 고정한다. 짧은 창에서는 최대 높이를 제한한다.
- `Icon.tsx`, `TooltipLayer.tsx`: 도구 모음의 형태와 버튼 설명을 통일했다.
  문서 단위 이벤트 처리로 가상화된 일정 버튼마다 툴팁 상태를 만들지 않는다.
  저장·취소·삭제 확인의 텍스트는 유지한다.
- `Popover.tsx`, `Select.tsx`, `DatePicker.tsx`, `EditorPanel.tsx`: 프로젝트·월·날짜 입력 옆에
  팝오버를 배치해 폼 위치를 유지한다. 공간에 따라 위로 열고 화면 안으로 크기를 제한한다.
  DOM은 편집 패널 안에 두어 기존 포커스 제한과 중첩 Escape가 함께 작동한다.
  방향키·Enter·Tab·Escape, 연도/날짜 직접 입력, 오늘/선택 날짜 구분을 제공한다.
- `flat-glass.css`, `GanttView.tsx`, `CalendarView.tsx`: 승인된 라이트·다크 토큰,
  평면 구획·얇은 선·작업 공간 여백과 옅은 막대 채움을 적용했다. 프로젝트 색상 값은 저장 그대로 쓰며
  선과 16% 채움으로 표현하고 글자는 테마 본문색으로 읽기 쉽게 한다.

일정 CRUD·DB 스키마·저장 위치·날짜 규칙·1일 28px·가상화·드래그·테마/접힘 저장은 유지했다.
의존성·배포 설정·버전(0.2.1)은 변경하지 않았다. 설치본은 같은 버전이어도 소스 SHA로 구분한다.
사용자가 보류한 관리 PC 시작 지연 문제는 이 변경의 성능 개선 결과로 주장하지 않는다.

## 검토와 보정

새 E2E의 초기 3개 검사는 구현 전 실패한 뒤 구현 후 통과했다.
기존 UI 검사 두 건은 native select 조작 대신 실제 팝오버 항목 선택으로 바꾸되,
0001년 날짜 선택·최근 프로젝트 유지 검증을 보존했다.

Superpowers 독립 코드 리뷰에서 날짜 아이콘 재클릭 시 닫았다 다시 열리는 문제와
연월 팝오버를 연 직후 Escape가 작동하지 않는 문제를 발견했다.
두 동작을 Electron E2E로 먼저 재현한 뒤, 날짜 입력+아이콘 전체를 anchor로 사용하고
연월 팝오버 내부로 포커스를 이동해 수정했다. 재검토에서 Critical/Important 미해결 지적은 없다.
스크롤로 anchor가 화면 밖에 나간 경우에도 좌표와 최대 높이를 viewport 안으로 제한했다.

## 실제 화면 확인

Linux x64 / Node24.22.1 / Electron45.2.1 / DISPLAY=:98, 운영 DB와 분리된 임시 프로필을 사용했다.
기존 화면 캡처와 새 간트·달력의 라이트/다크, 날짜 선택기·프로젝트 선택기, 긴 프로젝트 목록을 비교했다.
1440×900과 1280×500에서 프로젝트 목록·제목·추가 버튼의 배치와 읽기 상태를 직접 확인했다.
날짜 선택기는 폼을 밀지 않고, 1280×500에서 입력 위로 열리는 좌표와 화면 경계도 E2E로 확인했다.

로컬 이미지: `artifacts/screenshots/flat-glass/`의 `light-gantt.png`, `light-calendar.png`,
`dark-gantt.png`, `dark-calendar.png`, `dark-date-picker.png`, `dark-project-select.png`,
`project-popup.png`, `project-popup-scrolled.png`, `project-popup-short.png`.
비교 기준은 `artifacts/screenshots/desktop-polish/after-*`다. 이미지는 Git 추적 밖의 로컬 증거다.

## 최종 검증

2026-11-04 08:37:31–08:39:20 UTC, 위 기준 HEAD + dirty 작업 트리:

- `DISPLAY=:98 npm run verify:app`: 7단계 전부 통과. 타입·제품 빌드, 배포 14,
  단위 38×3시간대, UI 34, native 13, E2E 43개(신규 5개 포함).
- 새 검사에서 창 API의 알 수 없는 명령 거부·업무 API 8개 유지·실제 close 확인 호출,
  긴 목록 고정 크기/스크롤/외부 클릭, 툴팁, 중첩 Escape·Tab·방향키 선택,
  폼 좌표 유지와 짧은 창의 위쪽 팝오버 배치를 확인했다.
- 기존 CRUD·저장 실패 복구·드래그·키보드·10,000개 일정 가상화·연도 경계 검사도 통과했다.
- `node scripts/harness/run.mjs verify`: 7개 검사·내부 회귀 22개 통과.
- `git diff --check`, 변경 문서 6개의 상대 링크 58개 확인 통과.
- 기계 증거는 `artifacts/app/latest.json`, `artifacts/harness/latest.json`에 있으며 다음 실행에서 덮어쓴다.
  최종 소스 SHA는 이 문서를 포함하는 커밋과 완료 메시지를 따른다.

Windows 실제 설치본의 창 이동·가장자리 크기 조절·더블 클릭 최대화/복원·Snap,
Windows 글꼴·100%/200% 배율·Narrator 및 사용자 PC 인수는 미검증이다.
최종 커밋의 CI 상태는 완료 메시지와 해당 GitHub Actions 실행에서 별도로 확인한다.
MVP 단계 지도는 완료 상태를 유지하며 후속 작업은 이 문서와 C안 설계에서 이어간다.

## Windows CI 후속 보정

첫 구현 커밋 `95a4c214d33d188e0eadf6656f333823ecb66a50`의
[Application 실행 41801371834](https://github.com/kdydesign/simple-timeline/actions/runs/41801371834)에서
Linux와 Repository harness는 통과했지만 Windows E2E 43개 중 팝오버 크기 검사 1개가 실패했다.
Windows 타입·배포 정적 검사·단위·UI·제품 빌드·native는 통과했으며,
이 실패로 Windows 설치본 생성·설치 lifecycle 단계는 실행되지 않았다.

실패한 단언은 viewport를 900px에서 500px로 바꾼 직후 팝오버 하단을 한 번만 읽었다.
기대값은 492px 이하였고 관측값 535px는 기존 위치 93px + 고정 높이 442px였다.
`Popover`의 resize listener가 React 상태로 최대 높이를 갱신하는 경로와
테스트의 즉시 측정 사이에 갱신 완료 대기가 없었다.
검사를 `expect.poll`로 바꾸어 렌더링 결과가 같은 경계 조건을 만족할 때까지 기다린다.
시간만 지연하거나 허용 오차를 늘리지 않으며, 계속 잘린 상태이면 그대로 실패한다.
제품 코드·워크플로·검사 개수는 바꾸지 않았다.

Linux에서 CPU 6배 제한을 포함한 12회 크기 변경은 모두 최종 하단 492px로 수렴했고,
Windows에서 관측된 즉시 측정 실패는 로컬에서 재현되지 않았다.
수정 후 타입 검사와 C안 E2E 5개×3회(15개), 하네스 7개·공백 검사를 모두 통과했다.
최종 Windows 확인은 보정 커밋의 Actions 결과와 완료 메시지에서 확인한다.
