# 문서 기준과 탐색 경로

이 프로젝트는 단일 도메인 문맥을 사용한다. 현재 구현과 승인된 설계가 다르면 둘을 나란히 기록한다.
코드가 존재한다는 이유로 요구사항이 바뀐 것으로, 설계가 승인됐다는 이유로 구현·검증된 것으로 간주하지 않는다.

| 확인할 내용 | 기준과 읽을 문서 |
| --- | --- |
| 설치본 NodeRail·TermRail 피드백 | [ZIP 권한 진단, 터미널 표시와 작업 탭 설계](../design/noderail-termrail-installed-feedback.md) · [구현과 검사 범위](../implementation/2026-11-20-installed-feedback.md) |
| TermRail SSH 터미널 | [승인된 화면·동작과 후속 검토 항목](../design/ssh-terminal-menu.md). [구현·검증 기록](../implementation/2026-11-19-termrail-and-windows-zip.md). |
| Windows 전 버전 공식 ZIP 설치·내부 로고 축소 | [후속 설계 초안·시안](../design/windows-node-zip-all-versions.md). [구현·검증 기록](../implementation/2026-11-19-termrail-and-windows-zip.md). |
| Node 공식 ZIP 설치·실패 후 환경 다시 검사·Windows 셸 아이콘 | [설계](../design/noderail-zip-recovery-shell-icons.md) · [구현 및 검증](../implementation/2026-11-19-windows-node-zip.md). Windows nvm 1.1.10·1.1.11 직접 설치, 종료 확인 후 재검사, 시작 메뉴와 작업 표시줄 아이콘. |
| NodeRail 사내 프록시와 설치·사용 진행 화면 | [확정 설계·시안 A·인수 기준](../design/noderail-proxy-and-loading.md). Windows 주소·포트 프록시, WSL2 배포판별 설정, 양쪽 목록 레이어, 두 헤더의 불투명도. [구현과 검증 범위](../implementation/2026-11-19-noderail-proxy-loading.md) |
| NodeRail 상세·Home 작업 레이어 및 마감 일수 | [설계 협의와 시안](../design/workrail-node-detail.md). [제품 반영 및 검증 범위](../implementation/2026-11-19-node-detail.md) |
| 환경별 Node 연동·Home 개선 협의 | [통합 설계·요구별 수용 기준·시안](../design/workrail-environments-and-home.md). 기존 nvm 기능별 연동, WSL 기본 사용자·필요 시 소스 빌드·도구 수동 설치 안내, 자동 환경 선택, Home/도움말/footer 및 실제 배포 파일 이름까지 포함. Q12에서 수정 시안·세부안을 포함한 통합 설계 확정 후 별도 요청으로 구현·로컬 전체 검증·독립 검토 완료. 원격 패키지와 Windows/WSL 실기는 실행 기록의 범위를 구분한다. 현재 상태는 [구현·검증 기록](../implementation/2026-11-19-workrail-environments.md)과 [계획](../superpowers/plans/2026-11-19-workrail-environments.md)을 따른다 |
| WorkRail 개선 구현·검증 | [구현 계획](../superpowers/plans/2026-11-18-workrail-polish-and-recovery.md) · [실행 기록](../implementation/2026-11-18-workrail-polish-and-recovery.md). 사용자 구현 요청으로 화면·역할 전환·Node 복구를 반영하고 로컬 전체 검증 완료. Windows 실기·원격 CI는 별도. 아래 과거 설계-only 상태와 구분 |
| WorkRail 화면 정리 설계 | [설계·수정 시안 v3](../design/workrail-screen-polish.md). 상단 메뉴·Node 표·Home 카드 높이·footer 색상/무음 심벌·설정 밀도/휴일 구분·공유 버튼·메뉴 E 모듈형·앱 F WR 모노그램 선택과 확인용 보드. 후속 구현 요청으로 반영, 검증은 최신 실행 기록 참조 |
| 호스트·멤버 역할 전환 | [후속 설계](../design/sharing-role-switch.md). 양방향 전환·호스트 원본/등록/승인 보관·별도 조회와 현재 일정/알림 제외·수신 자료/자격 정리 후 재승인. 후속 구현에서 기존 역할 고정 정책을 대체, schema 9·복구 검증은 실행 기록 참조 |
| 기존 Node 충돌·제거 지원 설계 | [확정 설계](../design/node-conflict-removal.md). 공식 MSI 제거·Windows 표준 UI·개발 실행의 독립 관리 창을 Q6에서 전체 확정. 설계-only 이후 별도 구현 요청으로 반영했으며 Windows 실기와 코드 검증을 구분 |
| WorkRail 통합 도구·Node 관리 | [승인 설계](../design/team-tool-expansion.md) · [이전 구현 계획](../superpowers/plans/2026-11-18-workrail.md) · [구현·검증](../implementation/2026-11-18-workrail.md). 현재 메뉴는 Q10 변경을 반영한 B 상단 탭이다. 이전 하단 도크 구현은 당시 기록이다. 통합 홈·Node 목록 A와 기존 스타일은 유지하며 설계 변경과 구현 기록을 구분 |
| 설정 탭·개인 휴일·워킹데이 | [승인 설계](../design/settings-and-working-days.md) · [0.8.8 구현·검증](../implementation/2026-11-18-settings-working-days.md). 구현 및 최종 소스의 양 OS CI 완료. 호스트도 개인 휴일을 합산하되 전송하지 않음. 저장·IPC 경계는 [저장](../design/storage.md)·[구조](../design/architecture.md), 합산 규칙은 [도메인](../design/domain-rules.md) |
| 휴일 기간·날짜 삼각 표시 | [승인 설계](../design/holiday-ranges-and-markers.md) · [구현 기록](../implementation/2026-11-17-holiday-ranges.md) |
| 멤버 버전·공통 휴일·승인 요청 알림 협의 | [승인 설계](../design/member-versions-holidays-and-pairing-notices.md) · [0.8.6 구현·검증](../implementation/2026-11-17-member-holidays.md). Q1~Q11·시안 승인 후 구현, 기존 프로토콜 호환 유지 |
| 현재 작업 상태·인수 범위 | [STATUS](../wayfinder/STATUS.md), [MVP 사용자 인수](../release/user-acceptance.md) |
| 최신 화면 재질·디자인 | [0.8.1 버튼 재질](../implementation/2026-11-12-startup-and-install.md), [0.6.10 참여자 한 줄 배치](../implementation/2026-11-11-participant-row.md), [0.6.9 참여자·알림 컨트롤](../implementation/2026-11-11-sharing-participants.md), [0.6.8 목록·알림 간편 편집](../implementation/2026-11-11-quick-actions.md), [0.6.7 저장 진행·필드 오류·공유 설정](../implementation/2026-11-11-form-experience.md), [0.6.5~0.6.6 다크 전용·간트 탐색·트랙 경계 구현 기록](../implementation/2026-11-11-dark-navigation.md), [Forest Crystal 승인 설계](../design/forest-crystal.md), [0.6.4 딥 그레이·스틸 블루](../implementation/2026-11-11-steel-blue.md), [0.6.3 행 밀도·알림 스위치](../implementation/2026-11-10-compact-rows.md), [0.6.2 투과·P 아이콘](../implementation/2026-11-10-glass-correction.md). 기존 C안 배치와 기능을 유지하며 색상·재질은 이 설계를 우선 |
| 용어·전체 요구사항 | [CONTEXT](../../CONTEXT.md)는 용어만, [전체 설계](../superpowers/specs/2026-11-03-simple-timeline-design.md)는 요구사항 인덱스 |
| Planrail 후속 변경 | [확정 설계](../design/planrail-improvements.md), [구현·검증 기록](../implementation/2026-11-05-planrail.md). 명시된 이름·탐색·트레이·화면 변경은 이전 후속 설계보다 우선 |
| 일정 알림·간트 계층 개선 | [확정 설계](../design/reminders-and-hierarchy.md). Q15 전체 승인. [구현·검증](../implementation/2026-11-05-reminders.md), 실제 Windows 알림 실기는 미검증 |
| 달력 미리보기·창 동작 후속 협의 | [승인 설계](../design/calendar-preview-and-desktop-polish.md), [구현·검증](../implementation/2026-11-10-desktop-polish.md). Q1~Q9와 전체 구현 승인, Windows 실기 한계는 실행 기록 참조 |
| 이전 MVP 후속 변경 | [개선·오류 대응 확정 설계](../design/post-mvp-improvements.md). 명시된 변경 항목에서는 기존 MVP 설계보다 우선하며, [구현·검증 기록](../implementation/2026-11-04-post-mvp-improvements.md)과 구분 |
| 승인된 업무 규칙 | [도메인·날짜](../design/domain-rules.md), 실제 계산은 [domain](../../src/domain/) |
| 승인된 권한·저장 계약 | [구조](../design/architecture.md), [저장](../design/storage.md); 현재 코드는 [main](../../src/main/), [preload](../../src/preload/), [API 타입](../../src/shared/api.ts) |
| 승인된 화면·날짜 배치 | 기능 배치는 [Planrail 화면](../design/planrail-improvements.md), 재질은 [Forest Crystal](../design/forest-crystal.md)이 우선. [C안](../design/flat-glass-redesign.md)·[MVP 화면](../design/experience.md)·[시각화](../design/visualization.md)는 대체되지 않은 계약과 당시 결정 근거. 실제 코드는 [renderer](../../src/renderer/)·[계산 함수](../../src/visualization/) |
| 공통 UI·스타일 수정 | [renderer 구성](../design/architecture.md#renderer-공통-ui와-스타일). 소속 프로젝트 Select·날짜 선택기·포털·테마의 실제 연결과 회귀 경로 |
| 도구·명령·검증 범위 | [package.json](../../package.json), [CI](../../.github/workflows/), [검증 안내](../harness/validation.md) |
| 공유 변경 Windows 알림 | [승인 설계](../design/shared-change-notifications.md). Q1~Q13 전체 확정. [0.7.0 구현·검증 기록](../implementation/2026-11-11-shared-change-notifications.md)에서 실제 검증 범위와 실기 잔여 항목 확인. 기존 날짜 알림과 별개 |
| 업데이트 알림·전체 무음·접속 멤버·트레이 조회 | [승인 설계](../design/notification-controls-and-member-presence.md). Q1~Q8 개별 결정 및 Q9 문서 전체 확정. [0.8.3 구현 기록](../implementation/2026-11-16-notification-controls-and-presence.md). 도움말 빌드 성공 후 구현을 요청받아 반영했으며 검증 범위는 기록 참조 |
| 릴리즈노트·저장 확인·도움말 진단 | [0.8.5 승인 설계](../design/release-notes-and-confirmations.md) · [구현·검증](../implementation/2026-11-17-release-notes-confirmations.md). 미저장 초안 폐기는 유지하고 실제 저장/삭제 확인, 별도 릴리즈노트, 도움말 구간 진단과 taskbar 아이콘을 추가 |
| 편집 폐기·Space 탐색·전체 기능 도움말 | [0.8.4 승인 설계](../design/editing-navigation-and-help.md) · [구현·검증](../implementation/2026-11-16-editing-navigation-help.md). 기존 미저장 확인/UPDATE 대기를 갱신하고 도움말 사전 준비·재사용·성능 계측을 추가 |
| 호스트·멤버 도움말 창 | [승인 설계·시안](../design/host-member-help.md). H1~H8 확정 후 별도 구현 요청. [0.8.2 구현·검증](../implementation/2026-11-16-host-member-help.md). 독립 창·역할별 목차/검색·이미지 확대·트레이 연동. 도움말 CI 실패는 bfb7887에서 수정하고 Windows/Linux 전체 성공 확인 |
| 호스트 배포 기반 앱 업데이트 | [승인 설계](../design/lan-app-updates.md). Q1~Q20·문서 전체·구현 진행 승인. [0.8.0 구현·검증](../implementation/2026-11-11-lan-app-updates.md)에 구현과 실제 Windows 미검증 범위를 기록했다. 호스트 ZIP 등록·멤버 UPDATE·파일 검증·안전한 설치 인계 계약 |
| 사내 프로젝트 공유·동기화 | [설계·검토](../design/lan-project-sharing.md). Q1~Q27·후속 참여자 권한·UI 위치 확정. 보안·상태·알림 계약 검토 보정 완료. 당시 트레이 상태 클릭 진입은0.8.8 설정 버튼으로 대체. 필터별 간트 기간 유지. 0.6.0 [구현·검증 기록](../implementation/2026-11-10-lan-sharing.md), 실제 Windows·사내망 인수는 별도 |
| Windows 자동 실행·수동 설치 종료 | [0.8.1 확정 설계](../design/windows-login-startup.md)·[구현 및 검증](../implementation/2026-11-12-startup-and-install.md). 사용자별 로그인 실행, 구버전0.8.0에 한정한 수동 설치 강제 종료와 기존 UPDATE 보호를 구분 |
| 설치·사용·보존 정책 | [배포 정책](../release/policy.md), [사용 안내](../release/user-guide.md) |
| 당시 실행 증거 | [구현 기록](../implementation/), [Windows 검증](../release/windows-validation.md), [단계 인수인계](../wayfinder/handoffs/)의 SHA·환경·한계 |
| 문서 점검·개선 제안 | [하네스 재점검](../harness/review.md). 제안은 구현·승인 상태와 분리 |

결정의 상세는 기존 설계 문서 한 곳에 두고 지도·상태·인수인계에는 요약과 링크를 남긴다.
스테이지별 계획·조사·인수인계는 당시의 근거이며 현재 운영 절차는 [세션 안내](../harness/session.md)를 따른다.
새로운 중대한 설계 결정을 기록해야 할 때만 `docs/adr/`를 만든다. 실제 대안·선택·이유의 근거를 기록하며,
기존 승인 문서의 결정을 새 ADR 체계로 중복 이관하지 않는다.
