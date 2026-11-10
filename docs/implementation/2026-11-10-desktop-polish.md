# Planrail 0.5.0 달력 미리보기·데스크톱 개선

기준: `3cb6f97e41334067b3fcd7b25b3e990ca087afd1`. [설계](../design/calendar-preview-and-desktop-polish.md)의 Q1~Q9와 전체 구현을 사용자가 승인했다.
[계획](../superpowers/plans/2026-11-10-desktop-polish.md)에 따라 구현했다. 최종 전체 검증·원격 반영 결과는 아래에 기록한다.

## 변경과 이유

- 달력의 드래그 날짜 계산을 실제 막대에 반영한다. 저장된 lane 배치와 별도 overlay를 사용해 겹침·주/월 경계·인접 월에서도 예상 결과를 확인한다. 원본은 흐리게 남고 pointer-events를 가로채지 않는다.
- X·Alt+F4마다 main의 native 선택창을 연다. 중복 선택창을 차단하고 완전 종료는 저장 대기·미저장 입력 보호를 유지한다. 트레이 종료는 이 선택을 반복하지 않는다.
- About은 숨긴 메인 창과 독립적인 native 정보창이다. 실제 버전·기존 아이콘·합의한 개발자/저작권/설명을 표시하며 중복 호출을 막는다.
- 기본 크기 1707×820 DIP를 초기 모니터 작업 영역으로 제한한다. 영속적인 크기 저장은 추가하지 않는다.
- 자동 포커스 복원은 동기 focus 이벤트 동안만 툴팁을 억제한다. 실제 마우스/Tab 탐색은 유지하고 날짜 호출자와 일정 편집 대체 대상을 구분한다.
- 간트 본문의 고정 최대 높이를 제거해 남은 공간을 채우고, 가로 탐색·배율은 하단에 유지한다. 달력 스크롤은 유지한다.
- 앱 버전은 설치본 구분을 위해 0.5.0. DB schema v2·의존성 버전·앱 ID·저장 위치는 유지한다.

## 검증 진행 기록

- 닫기 선택·동시 요청·실패/취소·창 크기·About 단위 검사: 새 회귀 RED 확인 후 9개 GREEN.
- Electron 트레이·저장 대기·About 정보·초기 크기: 6개 통과. 선택은 테스트 전용 bootstrap DI로 주입하며 실제 OS 대화상자를 클릭한 증거는 아니다.
- 달력 계산: 새 미리보기 함수 부재 RED 후 6개 통과. 0001/9999 경계와 보이는 인접 월 포함.
- 달력 Electron: 미리보기 부재 RED 후 이동/양 끝 resize/겹침/영역 밖 취소 3개 통과. 기존 improvements 10개 통과.
- 툴팁 유령 표시와 큰 창 하단 차이 168px를 Electron으로 재현한 뒤 수정. 새 2개와 기존 desktop-polish/planrail-design 9개 통과.
- 실제 Electron light/dark 미리보기와 1280×1100/500 간트 화면 캡처를 확인했다. `artifacts/screenshots/desktop-polish-final/`은 로컬 실행 산출물이며 Git에 넣지 않는다.
- 원래 desktop-polish 테스트는 모두 보존했다. 새 달력 검사는 calendar-preview.spec.ts에 분리했다.
- 독립 코드 검토에서 날짜 호출자가 월 이동으로 사라질 때 잘못된 버튼에 복귀하는 경우를 발견했다. 회귀 테스트 RED 후 패널을 열 때 복귀 키를 캡처하고 date 호출자의 대체 대상을 일정 추가로 지정해 GREEN(3개)을 확인했다. React가 재사용한 DOM의 바뀐 날짜를 복귀 키로 잘못 읽지 않는다. 보류한 검토 항목은 없다.

## 구현자 판단과 남은 실기

종료/About에 native UI를 선택했다. 숨긴 renderer와 독립적으로 동작하는 대신 OS별 외형은 다를 수 있다.
기존 상시 지시에 따라 main에서 단계별 커밋하며 검증 후 일반 push한다.
Windows native 대화상자 표시·Escape·트레이·실제 최대화와 150%/200% 배율은 사용자 PC 실기로 확인해야 한다.
Linux Electron의 viewport 검증을 Windows 실기 검증으로 확대하지 않는다. 시작 성능·설치 DPI·PC 공유 기능은 이번 작업 범위 밖이다.

## 최종 로컬 검증

`DISPLAY=:94 npm run verify:app`의 7개 단계가 모두 통과했다.
- 실행: 2026-11-10T04:42:25.468Z ~ 2026-11-10T04:44:44.561Z (UTC), Linux x64 / Node 24.22.1 / Electron 45.2.1.
- 보고서 HEAD: `33bdd41bd8a298d844964f4bf2c0db3fd9ede9a3`, dirty=true는 당시 문서 정리를 포함한다. 제품 보정 코드는 이 HEAD에 커밋되어 있다.
- 배포 검사 15, 단위 검사 64 × 3개 시간대, UI 69, native 15, Electron E2E 66개 통과.
- 하네스 verify 7개 검사, diff 공백 검사, 문서 상대 링크 103개 대상 존재 확인.
- 첫 전체 검사(65 E2E)도 통과했고, 검토 보정 후 전체 검사(66 E2E)를 다시 통과했다. 실패를 숨기거나 timeout/skip 설정을 바꾸지 않았다.
- 검토 보정은 제거된 날짜 호출자 회귀 RED→GREEN으로 확인했다. 중요한 미해결 검토 사항은 없다.

원격 최종 SHA·Windows/Linux CI 및 설치 artifact는 종료 메시지에서 제공한다.
현재 이 기록만으로 Windows CI·사용자 PC 실기 통과를 주장하지 않는다.
