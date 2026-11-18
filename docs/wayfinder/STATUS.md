# 진행 상태

최신 메뉴 설계 변경: [통합 도구 설계 Q10](../design/team-tool-expansion.md#q10-변경-반영-기준--상단-탭-b)을 사용자가 D 하단 도크에서 **B 상단 탭**으로 변경했다. 제목 표시줄 아래 홈·Planrail·Node 관리를 배치하고 기존 글래스 색상·재질과 상태 보존을 유지한다. Node 목록 A·통합 홈 B는 그대로다. 설계만 반영했으며 제품 코드는 여전히 하단 도크이고 후속 구현은 시작하지 않았다.

최신 확정 설계: [기존 Node 제거와 nvm 설치](../design/node-conflict-removal.md)는 Q1~Q6를 확정하고 독립 설계 검토를 마쳤다. 공식 MSI 제거를 Windows 표준 화면에서 지원하며 개발 실행은 독립 관리 창으로 이어간다. 사용자가 코드 수정을 금지했으므로 제품 코드는 변경하지 않았고 구현 전이다. 기존 MVP 완료 상태는 유지한다.

최신 후속: WorkRail 1.0.0 [통합 도구 설계](../design/team-tool-expansion.md)는 이름·도크 D·Node 목록 A·통합 현황 홈 B·W 아이콘 A와 구현 요청을 받았다. [구현·검증 기록](../implementation/2026-11-18-workrail.md)에 로컬 구현·독립 검토 및 clean `aa126ba`의 전체 자동 검사 통과를 기록했다. 경미한 동시 복구 조회 진단 한계는 기록을 따른다. 기존 MVP 완료 상태는 유지하며 게시·push·Windows 실기는 수행하지 않았다.

이전 후속: 0.8.8 [설정 탭·개인 휴일·워킹데이](../design/settings-and-working-days.md)는 Q10 승인 후 구현·도움말 갱신·검토를 완료했다. 제품 소스 `8a11bed1dacf158bc847832d4c26aa3642b93f5f`의 Application과 Repository harness는 Windows·Linux 모두 성공했다. 로컬 전체 검사 실패와 회사 PC 미검증 범위는 [구현·검증 기록](../implementation/2026-11-18-settings-working-days.md)에 별도로 보존한다. 기존 MVP 완료 상태는 유지한다.

이전 후속: 0.8.7 [휴일 기간·삼각 표시](../design/holiday-ranges-and-markers.md)는 수정 시안 승인 후 구현·독립 검토·로컬 단계별 검증을 완료했다. 통합 실행의 시간 초과와 재실행 결과는 검증 기록에 구분했다. 최종 SHA의 원격 CI는 Actions와 완료 보고를 따른다. [검증 기록](../implementation/2026-11-17-holiday-ranges.md)을 따른다. 기존 MVP 완료 상태는 유지한다.
이전 후속: 0.8.6 [멤버 버전·공통 휴일·연결 승인 요청 알림](../design/member-versions-holidays-and-pairing-notices.md)은 Q1~Q11과 시안 검토 후 전체 구현을 승인받았다. 제품 구현·독립 검토 보정·로컬 전체7단계 검증을 완료했다. 최종 SHA의 원격 CI는 Actions와 완료 보고를 따른다. [구현 기록](../implementation/2026-11-17-member-holidays.md). 기존 MVP 지도 완료 상태는 유지한다.
이전 후속: 0.8.5 릴리즈노트·저장 확인·창 외형·도움말 진단 구현·독립 검토·로컬 전체 검증 완료. 원격 CI는 최종 SHA의 Actions와 종료 보고를 따른다. [승인 설계](../design/release-notes-and-confirmations.md) · [검증 기록](../implementation/2026-11-17-release-notes-confirmations.md). 최초 도움말13초의 실제 성능 수정은 새 Windows 진단 이후이며, 사전 준비 시점은 유지한다.
이전 후속: 0.8.4 [편집·탐색·전체 기능 도움말](../design/editing-navigation-and-help.md) Q1~Q8 구현·독립 검토·로컬 전체 검증 완료. 원격 CI와 최종 SHA는 종료 보고에서 확인한다. [구현 기록](../implementation/2026-11-16-editing-navigation-help.md)에서 검증 상태를 확인한다. 기존 MVP 지도는 유지한다.


현재: 스테이지 7 완료. 기본 설치 인수 범위의 MVP를 마무리했다.
이전 후속: 0.8.2 [호스트·멤버 도움말 창](../design/host-member-help.md). H1~H8 확정 후 사용자가 별도 구현을 요청했다. [구현·검증 기록](../implementation/2026-11-16-host-member-help.md)에서 오프라인 도움말과 실제 검증 범위를 확인한다.
이전 후속: 0.8.3 업데이트 Windows 알림·전체 무음·호스트 접속 멤버·트레이 자동 실행 표시를 구현하고 독립 검토·로컬 전체 검증을 완료했다. 사용자가 도움말 완료 후 구현을 명시했다. [승인 설계](../design/notification-controls-and-member-presence.md)·[구현 기록](../implementation/2026-11-16-notification-controls-and-presence.md)을 따른다. 0.8.2 도움말 CI는 bfb7887에서 보정 후 양 OS·Windows 설치까지 성공했다. 기존 MVP 지도는 유지한다.
이전 후속: 0.8.1 버튼 재질·로그인 자동 실행·수동 설치 종료 구현·독립 검토 완료. `c914232`의 양 OS 전체 앱 검사와 실제 Windows 설치3개 통과. 회사 PC의 실제 로그인 인수는 미검증이다. [확정 설계](../design/windows-login-startup.md)·[실행 기록](../implementation/2026-11-12-startup-and-install.md#최종-windows-결과)을 따른다. MVP 단계 완료 상태는 유지한다.
이전 후속: 0.8.0 호스트 배포 기반 앱 업데이트를 구현했다. [승인 설계](../design/lan-app-updates.md)·[구현·검증 기록](../implementation/2026-11-11-lan-app-updates.md)에 로컬 검사와 실제 Windows 미검증 범위를 구분한다. 기존 MVP 완료 상태를 유지한다. 최종 SHA·CI 결과는 종료 메시지를 따른다.
이전 후속: 0.7.0 공유 변경 알림 구현·로컬 전체 검증 완료. [구현·검증 기록](../implementation/2026-11-11-shared-change-notifications.md)을 따른다.
이전 후속: 0.6.10 참여자 한 줄 배치·상태 배지 보정. [구현·검증](../implementation/2026-11-11-participant-row.md)을 따른다.
이전 후속: 0.6.9 참여자 필드 검증·삭제와 작은 알림 스위치를 반영했다. [구현·검증](../implementation/2026-11-11-sharing-participants.md)을 따른다.
이전 후속: 0.6.8 목록 삭제·알림 간편 편집·월 목록·창 숨김·스타일을 반영했다. [구현·검증](../implementation/2026-11-11-quick-actions.md)을 따른다. 최종 SHA·CI 상태는 종료 메시지에서 확인한다.
이전 후속: 0.6.3 간트 행을 축소하고 시작일·종료일 알림을 스위치로 변경했다. [구현·검증](../implementation/2026-11-10-compact-rows.md)을 따른다. 최종 SHA·CI 상태는 종료 메시지에서 확인한다.
이전 후속: 0.6.2 Forest Crystal 투과와 유리 표현을 보정하고 시안의 P 아이콘을 적용했다. [승인 설계](../design/forest-crystal.md)·[보정과 검증 범위](../implementation/2026-11-10-glass-correction.md)를 따른다. Windows 실제 바탕화면 투과는 별도 인수 항목이며 최종 커밋·원격 반영 여부는 종료 메시지에서 확인한다.
후속: Planrail 0.6.0 사내 LAN 공유를 구현했다. [승인 설계](../design/lan-project-sharing.md)와 [구현·검증 기록](../implementation/2026-11-10-lan-sharing.md)을 따른다.
두 격리 Electron 프로필의 loopback TLS 자동 검증과 실제 Windows·회사망 인수는 구분하며 기존 지도 완료 상태는 유지한다.
이전 후속: Planrail 0.5.0 달력 미리보기·닫기 선택·About·창 크기·포커스·간트 하단 개선을 구현했다.
[승인 설계](../design/calendar-preview-and-desktop-polish.md)와 [구현·검증 기록](../implementation/2026-11-10-desktop-polish.md)을 따른다.
Windows native 대화상자·배율 실기는 미검증이며, 최종 SHA·CI 결과는 종료 메시지에서 확인한다.
이전 후속: Planrail 0.4.0 일정 알림·간트 계층 개선 구현과 로컬 전체 검증을 완료했다.
[알림 확정 설계](../design/reminders-and-hierarchy.md)·[구현 기록](../implementation/2026-11-05-reminders.md)을 따른다. Windows 알림 실기는 미검증이며 CI·최종 SHA는 종료 메시지에서 확인한다.
이전 후속: Planrail 0.3.0 구현·main 반영과 Windows/Linux CI를 완료했다.
[확정 설계](../design/planrail-improvements.md)·[구현 기록](../implementation/2026-11-05-planrail.md)·[버전별 Windows 근거](../release/windows-validation.md)를 따른다.
기존 MVP 사용자 인수를 0.3.0 실기 인수로 확대하지 않으며 지도는 완료 상태를 유지한다.
이전 후속: [개선·오류 대응 설계](../design/post-mvp-improvements.md)를 사용자와 확정하고 문서에 반영했다.
구현과 자동 검증 결과는 [후속 구현 기록](../implementation/2026-11-04-post-mvp-improvements.md)을 따른다.
기존 MVP 단계는 완료 상태를 유지하며 사용자 Windows PC 시작 시간·새 설치 화면의 실기 확인은 남아 있다.
[실행 기록](../implementation/stage-07.md)과 [인수인계](handoffs/07-windows-release.md)를 참조한다.
실제 Electron·SQLite CRUD·간트·달력과 Windows NSIS 빌드가 있다.
[Windows 검증 기록](../release/windows-validation.md)에서 실제 설치 lifecycle과 미실행 실기 항목을 구분한다.
Windows Server CI의 설치·오프라인·업데이트·제거 후 보존은 통과했다.
사용자 기본 설치·실행·업데이트·제거/재설치와 데이터 보존 확인 및 상세 검증 분리는
[사용자 인수 기록](../release/user-acceptance.md)을 따른다. 상세 미확인 항목을 통과로 표시하지 않았다.
최종 문서 commit·push 및 CI 결과와 SHA는 종료 메시지에서 확인한다.

프로젝트 설정과 실행 명령: [Codex 하네스](../harness/README.md).
새 세션은 루트 [AGENTS.md](../../AGENTS.md)에서 시작한다.
초기 하네스 설정의 기록: [설정 인수인계](handoffs/00-harness.md).
MVP 이후 성능·코드 보정: [리팩토링 실행 기록](../implementation/2026-11-04-refactoring.md).
현재 운영 문서·검증의 점검 결과: [하네스 재점검 기록](../harness/review.md).

| 스테이지 | 이름 | 상태 |
| --- | --- | --- |
| 1 | [도메인·날짜 규칙 설계](stages/01-domain.md) | 완료 |
| 2 | [Electron·SQLite 구조 설계](stages/02-architecture.md) | 완료 |
| 3 | [화면·간트·달력 설계](stages/03-experience.md) | 완료 |
| 4 | [구현 계획 확정](stages/04-implementation-plan.md) | 완료 |
| 5 | [기본 앱·저장·CRUD 구현](stages/05-foundation-crud.md) | 완료 |
| 6 | [간트·달력 구현](stages/06-visualizations.md) | 완료 |
| 7 | [Windows 설치·오프라인 검증](stages/07-windows-release.md) | 완료 |

상태: 미착수 → 진행 중 → 사용자 확인 대기 → 완료. 진행 불가이면 차단됨.
완료는 완료 기준 충족·필요한 승인·인수인계·저장소 반영까지 확인한 경우다.
아직 원격에 반영하지 못했다면 로컬 완료와 GitHub 반영 여부를 별도로 기록한다.

## 다음 실행 규칙

`node scripts/harness/run.mjs context`의 `selected: null`, `frontier: []`는 완료된 지도의 정상 결과다.
후속 요청은 [세션 절차](../harness/session.md)에 따라 진행하고, 이 지도의 완료 상태를 자동으로 바꾸지 않는다.
새 작업의 상세는 관련 문서에 기록하며 이 상태 인덱스에는 필요한 요약과 링크만 둔다.
