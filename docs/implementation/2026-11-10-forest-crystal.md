# Forest Crystal 적용 기록

상태: 0.6.1 디자인 적용과 로컬 앱 검증 완료. [승인 설계](../design/forest-crystal.md), [계획](../superpowers/plans/2026-11-10-forest-crystal.md).

사용자가 기능별 시안과 투명도 보정을 승인하고 구현을 요청했다. 기존 기능을 유지한 데스크톱 디자인 변경이다.
기준 소스 `3a5eaaf42137b3adac0a95c7b48c67c0d282b2dd`, clean main에서 시작했다.

## 반영

- [재질 CSS](../../src/renderer/forest-crystal.css): Forest Crystal 색상, 큰 유리 테두리, 반투명 패널, 낮은 버튼 그림자, 일정 색상의 유리 막대, 라이트/다크를 함께 적용했다. 달력과 툴바는 같은 `--glass`를 사용한다.
- [Toolbar](../../src/renderer/components/Toolbar.tsx): 290×442px 프로젝트 목록의 하단 추가를 오른쪽 아이콘으로 바꿨다. 버튼 아래 위치·내부 스크롤·접근 가능한 이름은 유지한다.
- [EditorPanel](../../src/renderer/components/EditorPanel.tsx): 시작/종료 날짜를 두 열에 배치하고 저장/취소 폭을 늘렸다. 저장·전체 선택·상단 일정 추가는 같은 연한 그린이다.
- [Icon](../../src/renderer/components/Icon.tsx): 달력 전환을 날짜 격자와 고리가 있는 아이콘으로 구분한다.
- [창 재질 정책](../../src/main/window-material.ts): Windows 11 22H2+에 native Acrylic을 적용한다. 일반 창의 크기 조절·최대화를 유지하고 지원하지 않는 OS에는 불투명 배경을 쓴다. [Electron 공식 API](https://www.electronjs.org/docs/latest/api/browser-window#winsetbackgroundmaterialmaterial-windows)의 지원 범위를 따른다.
- 설치본 식별은 0.6.1이다. 의존성·저장 스키마·권한·공유 프로토콜·알림·날짜/드래그 계약은 변경하지 않았다.

블러는 패널과 팝오버의 가상 요소에 둬 fixed 포털의 좌표 기준을 바꾸지 않는다. 막대별 블러·상시 애니메이션·원격 폰트는 추가하지 않았다.
이전 CSS 레이어는 기능 배치 근거로 유지하며 최종 재질만 덮어쓴다. 이후 공통 스타일 수정 시 [스타일 연결](../design/architecture.md#renderer-공통-ui와-스타일)을 함께 확인해야 한다.

## 검증 근거

환경: Linux x64, Node 24.22.1, Electron 45.2.1, Xorg dummy `DISPLAY=:95`, 일반 UID1000, Electron sandbox 유지.
검사는 임시 SQLite·Chromium 프로필만 사용했다. 현재 프로필의 데이터는 사용하지 않았다.
기준 SHA 위 변경이 포함된 `dirty=true` 결과이며 clean 기준 커밋 자체의 결과로 해석하지 않는다.

| 검사 | 결과 |
| --- | --- |
| 변경 전 `flat-glass.spec.ts` | 5/5 통과, 기준 화면 5개 캡처 |
| `window-material.test.ts` | native 조건 실패 RED 확인 후 6/6 통과; Windows 지원/미지원·비정상 버전·Linux·macOS |
| `forest-crystal.spec.ts` + `planrail-design.spec.ts` | 8/8 통과; 팝오버 좌표·크기·아이콘 동작, 같은 버튼/표면 재질, 중첩 팝오버·짧은 창·미저장 포커스·툴팁·창 명령 |
| 리뷰 보정 `forest-crystal.spec.ts` + `desktop-focus-layout.spec.ts` | 7/7 통과; 달력 제목의 중복 배경·오류 테두리·극단 프로젝트 색상 대비의 RED→GREEN 및 패널 하단 고정 |
| `npm run verify:app` | 최종 7/7 단계 통과: typecheck, release 15개, unit 112개×3 TZ, UI 116개, build, native 41개, Electron E2E 72개. 2026-11-10 13:19:24~13:24:11 UTC |
| `node scripts/harness/run.mjs verify` | 7/7 통과. 로컬 링크·지도 완료 상태·공백·하네스 회귀 확인. `git diff --check` 통과 |

화면 비교: 같은 합성 프로젝트·일정으로 1440×900에서 간트·프로젝트 목록·달력·일정 추가·다크 모드를 전후 캡처했다.
로컬 산출물은 `artifacts/forest-crystal/before/`와 `after/`의 PNG와 `metadata.json`, 실행 로그다. 보정 후 스크롤한 달력·열린 날짜 선택기도 캡처해 제목/요일 고정과 팝오버 가독성을 확인했다.
프로젝트 색상·한국어 문구·알림 필드를 보존했다. 생성 시안에 생략된 실제 정보는 삭제하지 않았다.
자동 검사의 1280×820·짧은 창 조건과 함께 팝오버·편집 패널의 경계와 키보드 접근을 확인한다.

독립 리뷰에서 달력 제목의 배경이 부모와 겹치는 것, 일반 테두리가 오류 필드 표시를 덮는 것을 발견해 수정했다.
검정 프로젝트의 일정 글자는 수정 전 CSS 기본 배경 대비 3.30:1로 측정되어 tint를 낮췄다. 검정/흰색·양 모드·양 테마의 일반 막대 대비 4.5:1 이상을 자동 확인하며 모든 상태의 WCAG 검증으로 확대하지 않는다.
첫 전체 실행은 E2E 69/70 통과였다. 실패 1건은 viewport 끝 ±2px을 요구한 이전 검사와 새 외곽 여백 18px의 불일치다.
승인된 여백을 반영해 viewport 안쪽 24px 이내와 실제 간트 패널 하단 ±2px을 함께 검사하도록 보정했다. 스크롤 조작·마지막 일정 접근 검사는 유지했다.

## 별도 확인 범위

- Linux 화면은 CSS 재질과 동작의 증거다. Windows 바탕화면 투과·DWM Acrylic의 색/흐림·투명 효과 설정 켜기/끄기는 **미검증**이다.
- 회사 PC의 150% 배율·그래픽 드라이버에서 가독성, 드래그 중 렌더링 비용과 시작 시간은 **미검증**이다. 기존 느린 실행이 해결됐다는 주장이 아니다.
- 창 관리자가 없는 Xorg에서는 native 최소화/최대화 상태 관측이 제한된다. 실제 창 명령 전달·숨김/복원은 회귀에서 검사하며 Windows 실기를 대체하지 않는다.
- CI의 Windows 설치 검증과 실제 사용자 PC 시각 인수는 별개다. 최종 소스 SHA·원격 반영·CI 상태는 종료 메시지에서 확인한다.
