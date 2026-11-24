# 진행 상태

장비 접속 상태 메뉴의 이름은 **DeviceRail**로 확정했다. 장비 화면과 Home 위젯은 협의 중이다. 수동 등록·개인 PC 저장, SSH와 제품 서비스의 독립 상태 표시, 앱 세션 안의 장비별 매크로 인증 재사용을 선택했다. [설계 초안과 시안](../design/device-monitor.md)

2026-11-21 **WorkRail 1.1.0 설치 후 피드백 반영.** 쿼리·헤더의 즉시 입력, 응답 모드, 서버 오류 본문, 메뉴·툴팁, Home 결과와 TermRail 분할선을 수정했다. [변경과 검증](../implementation/2026-11-21-postrail-editor.md#110-현장-피드백-반영)

2026-11-21 **WorkRail 1.1.0 · PostRail 편집기와 Home 즐겨찾기 구현.** 요청 파라미터·파일·인증, 응답 편집과 복사, 환경 관리 및 console을 반영했다. Home에서는 저장한 반복 POST의 실행 버튼 아래에서 횟수를 선택하고 마지막 처리 회차의 응답을 열 수 있다. [구현·검증 기록](../implementation/2026-11-21-postrail-editor.md)

2026-11-20 **PostRail 편집기 후속 설계 · 헤더·응답 도구·요청 이름 검색 보강, 전체 승인 대기.** 넓은 환경 관리 창, 요청별 인증 표시, 환경별 토큰 비우기 및 세션 console 최근 1,000줄을 협의했다. 사용자는 쿼리·경로·POST 폼과 같은 PC의 첨부 경로 재사용을 선택했다. 헤더 표/raw 전환, 응답 본문 직접 편집과 수정본 복사, 수신 원문 조회와 독립된 JSON 포맷 정렬, 요청 이름만 검색하는 시안을 추가했다. [설계·시안과 인수 기준](../superpowers/specs/2026-11-20-postrail-editor-design.md)

2026-11-20 **Home·PlanRail과 Electron 성능 1·2차 구현.** 일정 조회·로컬 알림, 릴리즈노트 ×의 창 해제를 반영했다. 공유 인덱스 구현은 Home 준비 시간의 채택 기준에 따라 별도 후보 브랜치에 보관했다. [적용 범위와 측정 결과](../implementation/2026-11-20-electron-performance.md)


2026-11-20 **Home·첫 PlanRail 진입 성능 개선 1차 설계 확정 · 구현 보류.** 간트와 달력이 일정 인덱스를 공유하고 Home 준비 시간과 첫 PlanRail 조작 시간을 함께 평가하기로 했다. [확정 설계와 채택 기준](../superpowers/specs/2026-11-20-home-planrail-performance-design.md)

2026-11-20 승인된 PostRail 작업 화면과 Home 즐겨찾기를 제품에 반영했다. 환경별 토큰 재사용, 순차 전송, 회차별 결과 조회와 앱 종료 동작은 [구현·검증 기록](../implementation/2026-11-20-postrail.md)을 따른다.

2026-11-20 **PostRail 최종 설계 승인 · 제품 구현 전.** 사용자가 최신 PostRail 작업 화면·환경별 인증·Home 즐겨찾기와 시안을 확정했다. 아래 기록은 협의 이력이다. [최종 설계](../design/postrail-workspace.md) · [승인 시안](../design/mockups/postrail-workspace.html)

2026-11-20 PostRail 요청 메뉴에서 한 번에 같은 그룹에 복제하고 환경 변수 목록 아래에서 행을 추가하도록 [설계와 시안](../design/postrail-workspace.md)을 갱신했다. 목록 단축키는 유지한다. 제품 구현 전이다.

2026-11-20 PostRail 저장 요청 메뉴·단축키 복사와 그룹 붙여넣기, 환경 변수 추가·삭제 아이콘을 [설계와 시안](../design/postrail-workspace.md)에 반영했다. 제품 구현 전이다.

2026-11-20 PostRail 시안의 요청 이름 옆 변경 저장, 통합 추가 메뉴, 전체 높이의 왼쪽 패널과 PlanRail 알림 설정형 팝업을 [작업 화면 설계](../design/postrail-workspace.md)에 반영했다. 제품 구현 전이다.

2026-11-20 PostRail 시안에 요청 생성·수정, 그룹·요청 컨텍스트 메뉴, 메서드 선택과 표준 팝업의 하단 삭제 버튼을 반영했다. [설계와 시안](../design/postrail-workspace.md) · 제품 구현 전.

2026-11-20 PostRail 요청·응답 JSON 본문의 타입별 구문 강조와 요청 변수 표시를 [작업 화면 시안](../design/postrail-workspace.md)에 반영했다. 제품 구현 전이다.

2026-11-20 PostRail 후속 시안에 하단에서 펼치는 일반 텍스트 로그, Home 즐겨찾기 최대 5개와 공유 설정 관리 링크 스타일을 반영했다. [설계와 두 화면](../design/postrail-workspace.md) · 제품 구현 전.

2026-11-20 PostRail 화면을 코드 편집 중심으로 조정하고 PlanRail과 같은 하단 상태 바 및 Home 즐겨찾기 즉시 실행을 [후속 설계와 시안](../design/postrail-workspace.md)에 반영했다. Home에서는 현재 환경으로 실행하며 POST는 기본 단건 및 명시적 반복 실행을 모두 지원하는 설계로 합의했다. 제품 구현 전이다.

2026-11-20 PostRail 후속 설계 검토. 저장 요청 그룹, 기본 단건 보내기, 환경 관리·회차 결과 footer, 요청 아래 응답, Home 위젯과 환경별 토큰 재사용을 [설계 및 시안](../design/postrail-workspace.md)에 반영했다. 제품 구현 전이다.

2026-11-20 PostRail Q1~Q12 재검토 후 트레이 숨김·앱 종료, 환경별 토큰 수신 API 주소, 요청별 응답 대기 시간 정책을 추가 확정했다. 현재 단계는 설계 승인 및 인터랙티브 시안 검토이며 제품 구현 전이다. [재검토 기록 및 시안](../design/postrail-review.md)

2026-11-20 PostRail 첫 버전의 REST 요청, 환경별 인증, 반복 POST 번호와 결과 표시를 Q1~Q12로 확정했다. [승인 설계 및 화면 시안](../design/postrail.md). 현재 단계는 설계까지다.

2026-11-20 TermRail 시작 파일은 기본 셸을 열고 프롬프트에서 한 줄씩 입력한다. 서버 수정 창은 추가 창과 같은 표준 팝업을 사용한다. [검증 범위](../implementation/2026-11-20-termrail-default-shell.md)

2026-11-20 NodeRail 작업 로그와 버전 표시, Home의 5개 목록과 전체 보기, TermRail 파일 선택·팝업, 메뉴별 도움말을 반영했다. [구현 내용과 검사 범위](../implementation/2026-11-20-workrail-log-home-termrail-help.md)

2026-11-20 설치본 피드백 후속 작업으로 NodeRail ZIP 진단·상태 색상과 TermRail 시작 파일·작업 탭·보이기·입력 검증을 반영했다. [구현과 검사 범위](../implementation/2026-11-20-installed-feedback.md)

2026-11-19 TermRail SSH 터미널, Windows 공식 Node ZIP 설치 통합과 크기별 아이콘을 제품에 반영했다. 플랫폼별 인수 범위는 [구현·검증 기록](../implementation/2026-11-19-termrail-and-windows-zip.md)에서 확인한다.

2026-11-19 후속 개선은 설계 단계다. Windows x64 ZIP 설치 통일의 관리자별 검증 항목과 크기별 아이콘 기준은 [NodeRail·아이콘 설계](../design/windows-node-zip-all-versions.md)에, 트레이 숨김과 별도 창 닫기의 연결 유지 동작은 [TermRail 설계](../design/ssh-terminal-menu.md#전체-개선-재검토에서-확인한-세션-동작)에 기록했다. [통합 검토 기록](../harness/review.md)

2026-11-19 사용자가 TermRail 네 번째 시안과 사용자 동작을 승인했다. [확정 설계](../design/ssh-terminal-menu.md)에 승인 범위와 후속 기술 검토 항목을 기록했다. 현재 단계는 설계까지다.

2026-11-19 TermRail [네 번째 시안](../design/ssh-terminal-menu.md)에 서버 수정, ＋ 탭 서버 선택 메뉴, 개별 터미널 닫기와 분할 공간 재배치, 왼쪽 레이아웃 저장 버튼을 반영했다.

2026-11-19 TermRail 세 번째 시안에 공통 메뉴 크기, 서버 추가, 전체 레이아웃 교체, 분할선 크기 조절·비율 복원을 반영했다. [현재 화면과 레이아웃 전환](../design/ssh-terminal-menu.md)

2026-11-19 TermRail 화면 협의에서 서버 더블클릭으로 새 작업 탭을 열고 드래그로 분할하는 동작을 선택했다. [두 번째 시안과 설계](../design/ssh-terminal-menu.md)에서 탭 우클릭 별도 창·레이아웃 저장 위치를 검토한다.

2026-11-19 SSH 메뉴 Q1~Q6 협의 반영. TermRail, 탭·분할·별도 창·다중 모니터, 매번 아이디·비밀번호 입력, 레이아웃 열 때 전체 서버 접속 시작, 직접 SSH 연결을 선택했다. [협의 문서와 첫 화면 시안](../design/ssh-terminal-menu.md)에 기록했으며 세부 협의와 화면 확인을 진행 중이다. 기존 Windows ZIP·아이콘 설계와 함께 검토한다.

2026-11-19 후속 설계 초안 작성. 사용자가 Windows nvm 버전에 관계없이 공식 ZIP 직접 설치로 통일하도록 지정했다. 저장 구조별 처리·실패 복구·검증 기준과 내부 로고 축소 시안을 [후속 설계](../design/windows-node-zip-all-versions.md)에 기록했다. 세부안은 검토 단계이며 제품 코드는 변경하지 않았다.

2026-11-19 [승인 설계](../design/workrail-node-detail.md)의 레일 아이콘, 패널 A·검색 D, Home 작업 레이어·달력 일수, Windows/실행 중 WSL의 폴더·릴리스 열기를 구현했다. Windows footer E2E는 참여자 영역 실측값으로 검증한다. [구현 기록](../implementation/2026-11-19-node-detail.md)

2026-11-19 환경 연동·통합 화면의 16개 개선 구현·독립 검토와 clean `91df811`의 Linux 전체 검사·하네스를 완료했다. [현재 구현·검증 기록](../implementation/2026-11-19-workrail-environments.md)에 지원 버전, WSL·nvm 실기 한계와 검사 근거를 구분했다. 원격 Windows 패키지 판정은 해당 배포 SHA의 Application 실행과 artifact를 확인한다. 아래 설계 확정·미착수 문구는 당시 이력이며 완료된 MVP 지도는 다시 열지 않는다.

2026-11-19 Q12 확정: 사용자가 [환경별 Node 연동·Home 등 16개 통합 개선 설계](../design/workrail-environments-and-home.md)를 최종 승인했다. compact Home 시안·14px 공통 여백·위젯 목록 제한·작업 중 환경 변경 잠금·구버전 호스트 버전 확인 불가 처리까지 포함한다. **설계 확정·제품 구현 미착수**이며 아래 확인 대기 문구는 당시 이력이다.

2026-11-19 전체 설계 재검토: [16개 개선의 통합 설계](../design/workrail-environments-and-home.md)에 코드 근거·예외 상태·요구별 수용 기준을 보강했다. Q4 소스 컴파일 지원, Q7 WSL 기본 사용자만, Q8 도구 미설치 공식 안내, Q9 artifact/실제 EXE·ZIP WorkRail 통일, Q10 메뉴별 도움말 읽기 위치, Q11 footer `외 N명`을 확정했다. 아래 이전 미결 표기는 이력이다. 통합 설계 최종 확인 전이며 제품 구현은 시작하지 않았다. [지침·문서 재점검](../harness/review.md#2026-11-19--workrail-16개-개선-설계-재검토) 참조.

2026-11-19 새 설계 협의: [환경별 Node 연동·Home 개선](../design/workrail-environments-and-home.md)에 16개 요구와 공식 자료 조사, 호스트/멤버·NodeRail 검토 시안을 기록했다. WSL nodenv는 사용자 기본 버전만 변경하고, 종료된 배포판은 `환경 시작` 클릭 후 조회하는 것으로 Q1/Q2를 확정했다. Q3은 기존 nvm의 기능별 확인 후 가능한 기능 제공으로 확정했다. Q4 소스 빌드 범위는 미결이며, Q5 피드백에 따라 Home 하단을 작은 위젯으로 줄이고 공유 배지를 실제 PlanRail 스타일로 맞춘 v2 시안을 준비했다. 수정 시안 확인은 대기 중이다. Q6은 환경 자동 감지·단일 환경 자동 선택·복수 환경 마지막 선택 복원 및 `환경 변경`·최초 복수 환경 선택으로 확정하고 시안을 갱신했다. 최종 설계 승인 전, 제품 코드는 변경하지 않았다. 기존 완료 지도는 유지한다.

2026-11-19 설치본에서 UAC 승인 후 Node 설치 오류에 대응해 누락 AutoRun 처리를 보정하고 실행 단계별 오류를 표시했다. clean `01094fb`에서 Linux 앱 전체 검사와 하네스가 통과했다. Windows 실제 설치와 사용자 PC 원인 확정은 미검증이다. [검증 기록](../implementation/2026-11-18-workrail-polish-and-recovery.md#2026-11-19-설치본의-node-버전-설치-오류-후속).

2026-11-19 WR 앱·선 메뉴 아이콘, 화면 간격·표 헤더·경고 및 개발 복구 창 인계를 제품에 적용했다. clean `467be88`에서 Linux 앱 전체 7단계와 하네스가 통과했다. [후속 검증](../implementation/2026-11-18-workrail-polish-and-recovery.md#2026-11-19-후속-검증).

이전 후속 완료: [Node 경고·휴일 설정](../design/node-guidance-and-holiday-layout.md)의 Q1/Q2 선택과 MSI COM 판독 수정을 반영했다. clean `b42cb41`에서 Linux 전체 검사(UI 250·native 97·E2E 113)와 하네스 7개가 통과했다. Windows COM·실제 제거는 미검증이며 아이콘 교체는 보류한다. [구현 기록](../implementation/2026-11-18-node-guidance-and-holidays.md)을 따른다.

최신 구현·검증 완료: 사용자의 설계 반영 요청에 따라 [화면·역할 전환·Node 복구](../implementation/2026-11-18-workrail-polish-and-recovery.md)를 문서 선행 정리 후 구현했다. clean `f356b71`에서 로컬 전체 검사(3 TZ unit·UI·build·native·E2E)가 통과했다. Windows MSI/UAC/복구 실기 및 원격 CI는 미검증이다. 아래 설계 확인 대기·제품 미변경 문구는 이전 단계 이력이며 현재 완료 여부는 구현 기록을 따른다. 기존 MVP 지도는 다시 열지 않는다.

이전 설계 협의 — 화면 설계: [Home·PlanRail·NodeRail 화면 정리](../design/workrail-screen-polish.md)에 초기 8개 요청·Q1~Q4 선택 및 후속 v2/v3 수정 요청을 반영했다. v3는 Home 두 카드 높이 일치·알림 색상/무음 심벌·Node 제목 제거·설정 밀도/휴일 구분·우측 공유 버튼 및 메뉴/앱 아이콘 4안이다. 추가 E~H 비교 후 메뉴 **E 모듈형**·앱 **F WR 모노그램**을 사용자가 선택했고 BrandKit 확인용 보드에 반영했다. 전체 화면 설계 확인은 대기 중이며 제품 코드는 변경하지 않았다.

이전 설계 협의 — 역할 전환 설계: [호스트↔멤버](../design/sharing-role-switch.md) 양방향 전환을 협의했다. 이전 호스트 원본·등록·승인은 보관하고 원본은 별도 조회만 허용하며 현재 일정/알림에서 제외한다. 멤버→호스트는 수신 자료·알림·자격 정리 후 재승인을 요구한다. 공유·업데이트 배포는 자동 재개하지 않는다. 사용자 선택을 기록했으며 전체 설계 확인·구현 전이다.

이전 설계 협의 — 메뉴 설계 변경: [통합 도구 설계 Q10](../design/team-tool-expansion.md#q10-변경-반영-기준--상단-탭-b)을 사용자가 D 하단 도크에서 **B 상단 탭**으로 변경했다. 제목 표시줄 아래 홈·Planrail·Node 관리를 배치하고 기존 글래스 색상·재질과 상태 보존을 유지한다. Node 목록 A·통합 홈 B는 그대로다. 설계만 반영했으며 제품 코드는 여전히 하단 도크이고 후속 구현은 시작하지 않았다.

이전 설계 협의 — 확정 설계: [기존 Node 제거와 nvm 설치](../design/node-conflict-removal.md)는 Q1~Q6를 확정하고 독립 설계 검토를 마쳤다. 공식 MSI 제거를 Windows 표준 화면에서 지원하며 개발 실행은 독립 관리 창으로 이어간다. 사용자가 코드 수정을 금지했으므로 제품 코드는 변경하지 않았고 구현 전이다. 기존 MVP 완료 상태는 유지한다.

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
