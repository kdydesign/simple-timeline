# 0.6.9 참여자 관리·알림 컨트롤

## 범위

사용자 요청 5개와 ‘공유 권한도 제거·확인 후 삭제’ 답변을 반영한다. [계획](../superpowers/plans/2026-11-11-sharing-participants.md), [공유 설계](../design/lan-project-sharing.md), [화면 기준](../design/forest-crystal.md)을 따른다. 공유 시작의 개발 실행 오류 진단은 이번 범위에 포함하지 않는다.

## 변경

- 이름 placeholder와 IPv4 형식·활성 IP 중복 오류를 필드 하단/붉은 테두리로 표시한다. 첫 오류로 포커스하고 수정 시 재검사한다. main의 검증도 유지한다.
- 참여자 삭제는 호스트 전용이며 영향 프로젝트 확인 후 모든 ACL·자격을 회수하고 목록/승인 대상에서 제거한다. 프로젝트·일정·기존 표시 이름은 유지한다. 승인 취소와 삭제는 구분한다.
- [저장 schema v4](../design/storage.md)는 삭제 상태를 추가한다. 기존 자격을 회수로 인식시키기 위해 내부 등록/회수 기록을 논리 삭제로 남긴다. 재등록은 새 ID·승인이다.
- 등록 항목의 입력과 상태/작업 행, 신규 참여자 입력을 여백과 구분선으로 구분한다.
- 일정 추가/편집·빠른 알림의 시작/종료 옵션은 종 아이콘·32×18px 스위치·텍스트의 2행이다. 기존 공유 스위치와 데이터 계약은 유지한다.

## 검증 기록

기준 HEAD af1a05c7d01515f23a4358f2a90b241d4f0b5070 + 이번 변경 dirty. Linux x64, Node24.22.1, Electron45.2.1, 격리 프로필·sandbox 유지, DISPLAY=:93. 운영 DB는 사용하지 않았다.

- RED: UI placeholder/삭제 버튼 2개 실패, native deleteDevice 미구현 실패를 먼저 확인.
- 초기 native 실행은 DISPLAY 부재로 중단했다. Xorg 준비 후 실행했고, 새 preload 미빌드로 allowlist 불일치가 발생하여 build 후 native44가 통과했다.
- 신규 Electron 흐름은 입력 오류·삭제 확인·프로젝트/일정 보존·키보드 스위치·32×18px와 세로 배치 검사를 통과했다.
- 실제 화면: `artifacts/participants/screens/validation.png`, `participants.png`, `reminders.png`, `quick-reminders.png`. Linux Electron 화면이며 Windows 배경 투과·150% 배율 실기 검증을 대신하지 않는다.
- 첫 전체 실행은 Asia/Seoul의 `calendar-performance`·`sharing-network` 요청 제한 테스트가 각각 기본5초를 초과했다. 같은 시간대의 두 파일을 단독 실행하면21개가 통과했다(6.79초). 원인은 확정하지 않았고 코드·기본 제한·검사 수는 변경하지 않았다. 원본 실패 기록은 `artifacts/participants/verify-first.json`·`tz-first.log`에 보존했다.
- 두 번째 전체 실행은 UI136개 중 공유 원본 이름 갱신 대기·설정 초안 보호 검사2개가 실패했다. 같은 파일 단독 실행은16개 모두 통과(10.55초)했다. 원인은 확정하지 않았고 제품/테스트 코드를 이 실패에 맞춰 변경하지 않았다. `verify-second.json`·`ui-second.log`·`ui-isolated.log`에 보존했다.
- 세 번째 전체 실행은 UI136개 중 기존 멤버 빠른 알림 팝업 닫힘 대기1개가 실패했다. 변경 전 HEAD를 별도 임시 디렉터리에 펼친 대조 실행은 UI134개 통과(65.61초)했다. 시간에 따른 실행 편차가 있으나 원인이나 이번 변경과의 인과관계는 확정하지 않았다. `verify-third.json`·`ui-third.log`·`ui-baseline.log`를 보존했다.
- 네 번째 전체 실행은 앞6단계 모두 통과했고 Electron85/86 통과 후 보안 allowlist가 신규 `deleteDevice`를 기대하지 않아 실패했다. native와 동일하게 E2E 허용 메서드 목록에 해당 이름만 추가했다. 범용 invoke·권한·격리 검사는 유지했다. `verify-fourth.json`·`e2e-fourth.log`에 보존했다.
- 최종 `DISPLAY=:93 npm run verify:app`: **7/7 통과**. UTC2026-11-11T07:26:24.217Z~07:31:21.087Z. release15, unit118×3TZ, UI136, native44, Electron86(3.0분), 타입·build 포함. 테스트한 제품 소스 이후 변경은 문서/실행 기록 보정뿐이다.
- `node scripts/harness/run.mjs verify`: 7종 통과. `git diff --check` 통과. 최종 문서 보정 뒤 하네스 검사를 재실행한다.
- 최종 보고서 사본: `artifacts/participants/verified-app.json`, 전체 실행 로그 `verify-app.log`. 이전 실패와 최종 통과를 함께 보존한다.

## 검토·남은 범위

독립 코드 리뷰에서 중요한 구현 결함은 발견되지 않았다. 테스트 보완 제안 3개는 남겼다: 삭제 후 실제 DB close/reopen(현재는 같은 연결의 store 재생성), 삭제 시 대기 pair 제거의 전용 회귀, member/IPC 경계에서 삭제 거절의 전용 회귀. 현재 personal 역할 거절·공통 main guard·v3 migration 재열기·실제 TLS 삭제 회수는 검사한다.

이번 변경의 실제 Windows 설치·회사망·원격 멤버 재접속은 미검증이다. 기존 사용자 설치본의 공유 허용 결과를 이번 버전의 인수 증거로 확대하지 않는다.
