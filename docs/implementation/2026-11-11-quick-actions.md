# 0.6.8 목록·알림 간편 편집

기준: main `4fe66d08d8aa2224ff6187ff366c7c8a4ddb26cb` + dirty 작업 트리, Linux x64, Node24.22.1. 사용자14항목 중 연결 오류는 Q1에서 제외했고 나머지는 Q2~Q5 및 최종 `진행해`로 승인했다. [계획](../superpowers/plans/2026-11-11-quick-actions.md)·[화면 설계](../design/forest-crystal.md)·[창 동작](../design/calendar-preview-and-desktop-polish.md)을 따른다.

## 구현

- 닫기는 즉시 트레이, 트레이 실패만 종료/취소, 기본 높이890과 기존 작업 영역 제한.
- 목록 휴지통은 확인 없이 cascade 삭제. 멤버 공유 자료·미저장 편집 보호 유지.
- 종 아이콘의 알림 전용 팝업과 main 알림 전용 mutation. 기존 일정 초안을 저장하지 않으며 각 PC 알림만 수정.
- 팝업은 저장 overlay 안에 둔다. 삭제/회수·실패·결과불명·필드 오류를 구분하고 창 종료 미저장 상태에 포함한다.
- 목록/팝업 배경, 가벼운 삭제 버튼, 아이콘-only 닫기,160ms 스위치, 공유 배지·알림 안내·간트 구분선을 반영.
- 월 Select는 달력 밖 포털과 소유권 연결로 위치·포커스를 분리한다.

## 재현·보정

목록 삭제·알림 진입/독립 저장3개 UI 검사가 구현 전에 실패했다. native 테스트는 처음 DISPLAY 부재로 실행되지 않았고 :94 Xorg를 준비한 뒤 새 mutation 부재로 실패함을 확인했다. 구현 후 native 전체가 통과했다. 높이890 요구도 기존820 응답의 실패를 먼저 확인했다.

실제 Electron에서 월 목록을 열면 부모 달력이151px 스크롤되어 상단이 잘리는 현상을 재현했다. 부모 scrollTop0·메뉴 hit test·선택/Escape 후 포커스를 검사하며 포털 이동 후 통과했다. 알림 저장 후 포커스는 DOM 갱신 뒤 복원하도록 보정했다.

첫 전체 검사는 새 테스트 mock의 `ok` 리터럴 타입 오류로 중단됐다. 테스트 타입만 수정했으며 초기 결과를 `artifacts/quick-actions/verify-first.json`과 `verify-app-first.log`에 보존한다.

## 검증 결과

최종 전체 검사7단계와 하네스7개가 통과했다. 독립 리뷰의 포커스 P2는 실패 재현 후 보정했고 추가 미해결 지적은 없다. 화면 증거는 `artifacts/quick-actions/screens/{month-list,reminder,projects}.png`에 있다. Windows 실제 트레이·배율·바탕화면 투과는 미검증이며 Linux 자동 검증으로 대체하지 않는다. 공휴일 내장 보류와 공유 연결 오류 제외 범위는 유지한다.

추가 검증 보정: 버전0.6.8 반영으로 설치 설정 검사의 고정 버전 기대값도 갱신했다(설치 정책 검사는 유지). UI 전체132/134에서 기존 월 선택 테스트가 달력 DOM 내부만 탐색하던 부분을 새 포털 범위로 바꾸고, 알림 보정 안내 버튼 검사는 새 종 버튼과 구분하도록 안내 영역에 한정했다. 실제 날짜 입력·알림 보정 검사는 유지했다.

독립 리뷰는 목록 삭제 후 포커스 유실 P2 한 건을 보고했다. 휴지통을 누른 뒤 프로젝트 목록 버튼으로 복귀하는 검사가 수정 전에 실패함을 확인했고, 저장 덮개 및 삭제 대상 편집기 닫기가 끝난 DOM에서 포커스를 복원하도록 보정했다. 기타 API·공유 회수·알림 저장 결과·포털·미저장 보호에는 추가 지적이 없었다. 리뷰와 초기 실패 로그는 `artifacts/quick-actions/review.md`, `delete-focus-red.log`에 보존한다.

환경/검사 한계: 전체 검사 재실행 중 변경하지 않은 패키지 fixture의 ASAR `package.json` 읽기가 NUL 바이트 JSON 오류로 한 번 실패했다. 동일 `tests/release/package.test.mjs` 단독 재검사8개는 통과했다. 원인은 확정하지 않았으며 배포 코드·의존성·검사를 임의 완화하지 않았다. `verify-asar.{json,log}`와 `package-recheck.log`를 보존하고 최종 전체 결과와 구분한다.

한 전체 UI 실행에서 알림 기본값 편집·알림 클릭의 초안 보존·공유 알림 저장 후 조회 실패 복구3건이5초 제한을 넘었다(131/134). 해당 두 파일 단독 재검사6개는8.62초에 모두 통과했다. 제한 시간·재시도 설정·검사 내용을 완화하지 않았고 `verify-timeouts.{json,log}`, `ui-timeouts.log`, `ui-timeout-recheck.log`를 남겼다. 이 간헐 실패는 최종 성공 결과와 별도로 보존한다.

새 preload 빌드 뒤 native 보안 검사는 이전8개 메서드 수 기대값으로 실패했다. 알림 전용 명령 추가에 맞춰 native/Electron 검사 모두 허용된9개 메서드의 이름 전체를 비교하도록 보정했다. 임의 invoke 노출 금지·sandbox·context isolation·Node 차단 검사는 유지한다. 해당 실패는 `verify-bridge.{json,log}`에 보존한다.

첫 전체 Electron 실행은 추가 보안 검사에 남은8개 기대값과 즉시 창 숨김 후 클릭 응답 대기로 끝나지 못한 테스트 때문에240초 집계 제한에 걸렸다. 남은 보안 기대값도9개 이름 전체로 맞췄다. 숨긴 창은 입력 응답을 복원까지 미룰 수 있으므로, 관련 테스트는 클릭 Promise를 보유한 채 main의 숨김/복원을 관찰한 뒤 응답 성공을 확인한다. 저장 대기·입력 보존·실제 quit 검사는 그대로다. 보정 후 관련 Electron7개는10.9초에 통과했고 제한 시간은 변경하지 않았다(`verify-e2e-first.json`, `e2e-first.log`, `tray-security-green.log`).


### 최종 실행 증거

`DISPLAY=:94 npm run verify:app`: UTC `2026-11-11T06:31:09.424Z` → `2026-11-11T06:36:35.197Z`, HEAD `4fe66d08d8aa2224ff6187ff366c7c8a4ddb26cb` + dirty 작업 트리, Linux x64/Node24.22.1. 타입·배포15개·단위118개×3시간대·UI134개·제품 빌드·native42개·Electron85개(3.0분)가 모두 통과했다. 집계 제한 및 개별 테스트 제한을 유지했다. 하네스7개와 `git diff --check`도 통과했다.

최종 보고서는 `artifacts/quick-actions/verified-app.json`, 전체 요약은 `verify-app.log`에 보존한다. 실제 Electron의 월 목록·빠른 알림·프로젝트 목록 화면을 직접 확인했다. 기본 창 높이·숨김·저장 중 종료·트레이 실패 경로는 격리 Linux Electron에서 검증했으며 Windows 실기 인수를 대신하지 않는다. 최종 커밋·원격 반영과 CI 상태는 완료 메시지에 기록한다.
