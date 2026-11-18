# Node 안내와 휴일 설정 구현 계획

> 실행: superpowers:executing-plans로 현재 작업 공간에서 순차 진행한다.

**목표:** 공식 MSI 판독 오류를 수정하고 Node 경고·휴일 설정을 간결하고 잘리지 않게 표시한다.
**구조:** 기존 Electron main의 MSI 함수와 React 구성요소/CSS만 수정한다. 권한·설치 정책·공유 데이터 모델은 유지한다.
**기술:** TypeScript, PowerShell/Windows Installer COM, React, CSS, Vitest, Playwright.
**설계:** [Node 안내와 휴일 설정](../../design/node-guidance-and-holiday-layout.md).

## 제약과 검토 기준

- 아이콘 교체는 보류. 운영 DB/Node 설치를 자동 검사에 사용하지 않는다.
- MSI COM 검사에서 배열 오염이 제거되어 단일 문자열이 반환되는지 확인한다.
- 제거 불가·nvm 설치 대기·관리 창 인계·재부팅 안내를 숨기거나 우회하지 않는다.
- 멤버 공통 휴일은 조회 전용. 긴 이름과 좁은 창에서 내용이 가려지지 않아야 한다.
- 기존 날짜 팝업과 저장/취소 기능을 유지하며 artifact 생성 검사는 순차 실행한다.

## 작업

- [ ] 1. Windows 일회성 MSI COM 회귀 검사를 추가하고 `standalone-windows.ts`의 출력 오염을 수정한다. 실패 안내는 확인 불가 의미로 정정한다.
- [ ] 2. `NodeScreen.tsx`·`NodeRecovery.tsx`의 중복 설명을 요약/버튼/접힌 상세로 정리한다. `workrail.css`에서 기존 경고 색과 글래스 버튼을 사용한다. UI 회귀 검사로 버튼 상태와 상세 접근을 검증한다.
- [ ] 3. `HolidaySettings.tsx`·`forest-crystal.css`에서 반복 영역의 버튼 그룹을 분리하고 세로 배치/날짜 세 열을 적용한다. 실제 화면에서 세 입력의 높이와 영역 경계를 확인한다.
- [ ] 4. 전체 앱 검사와 하네스, 변경 전체 검토를 완료하고 결과를 기록한다. Windows 실행 여부와 사용자 PC 재검사 필요를 구분해 보고한다.

## 진행 기록

- 사용자 Q1/Q2 선택에 따라 설계 문서를 제품 변경 전에 작성했다. 현재 작업 공간은 clean `workrail` 브랜치이며 기존 구현은 완료 상태다.
