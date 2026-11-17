# 0.8.7 휴일 기간·표시 개선

기준: [승인 설계](../design/holiday-ranges-and-markers.md) · [구현 계획](../superpowers/plans/2026-11-17-holiday-ranges.md). 기준 SHA `1a05465`, main의 깨끗한 상태에서 시작.

## 변경

- dates JSON의 선택적 endDate로 한 기간을 보존한다. 기존 하루 항목은 그대로 읽는다. 총 1,000일 한도, 기간 역전·겹침 검사, 겹친 기존 이름/기간 안내.
- `/v1/holidays/ranges`는 기간을 전달하고 기존 경로는 날짜별로 펼친다. 새 멤버는 404일 때만 기존 경로로 fallback한다. 인증·ETag·DB 원자적 교체·조회 전용·회수·무알림은 유지.
- 호스트 공유 설정 폭을 940px 이내로 늘리고 시작일·종료일·이름·취소·추가를 한 줄 배치한다. 작업 영역이 좁으면 줄바꿈한다. 날짜 기본값은 오늘이며 기본값 자체로 미저장 상태가 되지 않는다.
- DatePicker 재사용. 공유 설정의 넓은 button/input CSS가 달력 내부에 침범하지 않게 제한한다. 월 Select는 가장 가까운 모달 안으로 portal하여 포커스와 clipping을 지킨다.
- 간트 날짜 눈금과 달력 날짜 칸에만 6px 삼각형, 등록 이름/기간은 hover/focus tooltip. 반복 요일 이름과 기존 이름 띠 제거. 기존 날짜 버튼과 드래그 동작 유지.
- 실제 격리 앱에서 휴일 관리 도움말 이미지를 재촬영하고 안내·릴리즈노트를 갱신한다. 버전별 도움말 검증 규칙에 맞춰 나머지 화면도 가상 자료로 다시 촬영했다.

## 검증 진행

- 기간 단위 테스트 RED→GREEN: 범위·윤일·9999년 말·역전·기존 항목을 포함하는 겹침·일수 상한.
- 실제 loopback TLS 단위 검사: 기간 전달/구버전 날짜별 전달/ETag/인증/구버전 fallback.
- UI 5개 통과. 초기 테스트 1개는 실행 환경 지연으로 5초 timeout, 동일 코드 순차 재실행은 5/5 통과(제한 변경 없음).
- Electron E2E 3개 통과: 휴일 범위·월 선택 hit-test/Escape/focus·양 화면·기존 상단 월 선택/빠른 작업.
- 화면 검토에서 월 선택 너비가 12px인 것을 발견했다. 80px 초과 회귀 검사를 먼저 실패시킨 뒤 holiday input 규칙 범위를 좁혀 통과했다.
- 전체 검사·독립 검토·Windows CI는 아래 완료 기록으로 갱신한다. 실제 사용자 Windows PC는 별도 미검증이다.

## 독립 검토

별도 읽기 전용 검토자(gpt-6-astra)가 전체 diff·신규 파일·설계·계획·도움말 이미지를 확인했다. Critical/Important/Minor 지적 없음. Windows 실기와 실행 중 검사 결과는 검토자의 판단에서 제외하고 실제 완료 결과로 별도 보고한다.

첫 전체 검사에서는 버전 고정 배포 테스트가 0.8.6을 기대하여 실패했다. 0.8.7 기대값과 릴리즈노트 검사 목록을 갱신했다. 배포 검사를 제거하거나 제한 시간을 늘리지 않았다.

두 번째 전체 검사에서 기존 `updates.test.tsx`의 `defers notification popup until a modal closes and shows generic current state after withdrawal`이 5초 timeout으로 실패했다(나머지 UI 201개 통과). 해당 파일을 코드·제한 시간 변경 없이 분리 실행했을 때 21/21 통과했다. 이후 전체 검사를 다시 수행한다.

전체 UI 202/202 통과 후 빌드가 도움말 capture 버전 불일치로 차단되었다. 검증기를 우회하지 않고 0.8.7로 도움말 이미지 13개를 실제 격리 앱에서 재촬영했다. 촬영 E2E 6/6 통과, source/dirty/명령/가상 자료 근거를 함께 갱신했다.

재촬영 후 전체 검사에서는 기존 editor 테스트 2개가 각각 요소 대기/5초 제한으로 실패했다(UI 200개 통과). 같은 코드·제한으로 해당 파일을 분리 실행하여 8/8 통과했다. 이후 제품 빌드와 실제 SQLite/TLS native 85/85 검사를 각각 통과했다. 통합 명령의 실패 기록을 성공으로 덮어쓰지 않으며, 마지막 단계별 검사와 원격 CI 결과는 별도로 기록한다.

전체 Electron E2E는 102개 통과, 기존 dark-navigation 첫 테스트의 desktop teardown 45초 제한 초과 1건으로 실패했다. 화면 검증 assertion 실패는 없었다. 코드·제한 변경 없이 해당 파일을 다시 실행하여 4/4 통과했다. 전체 실행 로그는 `/workspace/output/holiday-all-e2e.log`, 분리 실행은 `/workspace/output/holiday-dark-e2e.log`에 보존했다. 간트·달력·한 줄 입력·월 목록의 실제 격리 Electron 화면은 직접 확인했다.

## 로컬 완료 결과

최종 UI 전체 25파일·202/202 통과(127.95초). typecheck·배포 검사·시간대별 단위 검사는 마지막 통합 실행에서 통과했고, 이후 제품 빌드·native 85/85·UI 전체를 각각 통과했다. E2E 전체 102/103 + 실패 파일 재실행 4/4 결과를 위와 같이 구분한다. `verify:app` 한 번의 전체 성공으로 보고하지 않는다. 하네스 verify와 git diff --check 통과. 검증 제한·검사 목록·제품 로직을 재실행을 위해 변경하지 않았다.

main의 최종 커밋을 push한 뒤 Windows/Linux Application 및 Repository harness 결과를 확인한다. 정확한 SHA와 CI 결과는 완료 보고를 따른다. 회사 Windows PC의 배율·트레이·실제 사내망 인수는 별도 미검증이다.
