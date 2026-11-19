# WorkRail 환경 연동·통합 화면 개선 — 구현 기록

2026-11-19 사용자가 Q12 확정 설계의 제품 구현을 요청했다. [승인 설계](../design/workrail-environments-and-home.md)와 [구현 계획](../superpowers/plans/2026-11-19-workrail-environments.md)을 기준으로 수행한다.

## 기준과 범위

- 시작 제품/문서 HEAD: `1f9b71d`. 계획 커밋: `48c1713`.
- 작업 트리: `/workspace/workrail`, 기존 linked worktree의 `workrail` 브랜치. 기존 체크아웃과 사용자 변경을 보존한다.
- Windows nvm 기능별 연동 → Windows/WSL 환경 coordinator → Home/NodeRail/footer → 공유 버전/메뉴별 도움말 → 실제 배포 이름 → 통합 검증 순서.
- 제품 버전 1.0.0과 설치 identity·실행 파일명·프로필은 유지한다. 이 기록의 진행 상태를 제품 검증 완료로 해석하지 않는다.

## 시작 검증

Linux x64 / Node 24.22.1. 깨끗한 기준 작업 트리에서 Node 서비스·IPC 단위 테스트 38/38 및 repository harness 7개가 통과했다. 전체 앱 검사·Windows/WSL 실기는 시작 기준 검증에 포함하지 않았다.

## 진행

| 작업 | 상태 | 근거 |
| --- | --- | --- |
| Windows 기존 nvm | 구현·독립 검토 완료 | `5795819`, `85ab751`, `6386b42`, `dd87ad9`; 실제 Windows 인수는 별도 |
| 환경 선택·WSL nodenv | 구현·독립 검토 완료 | `7100aea`, `1b89681`; 실제 Windows/WSL 인수는 별도 |
| Home·NodeRail·footer | 구현·독립 검토 완료 | `3f0750a`, `b62466a`, `05d4dee`; runtime 버전은 공유 버전 작업에서 연결 |
| 공유 버전·도움말 | 구현·독립 검토 완료 | `8c3b6e7`; 구버전 공유 호환·메뉴별 읽기 상태 |
| 배포 이름 | 대기 | 외부 파일명과 설치 identity 구분 |
| 통합 검사·인계 | 대기 | verify:app·harness·독립 검토·원격 Windows 패키지 |

검증 결과·수정 판단·실기 한계는 완료 시 이 문서에 갱신한다. 로그는 artifacts 아래 보존하며 반복 확인 때문에 실패 증거를 지우지 않는다.

## 구현 중 확인한 제한

nvm-windows 2.0.1의 기본 버전과 선행 설치가 모두 없는 첫 설치는 CLI가 자동으로 기본 버전을 지정하며 해제 옵션이 없다. 승인된 설치/사용 분리 원칙에 따라 이 조건의 설치 기능만 이유와 함께 제한한다. 기존 기본 버전 또는 선행 설치가 있는 환경의 설치까지 제한하지 않는다. x86 선행 설치도 이 판정에 포함하되, WorkRail에서 전환할 x64 목록과 구분한다. 공식 코드 근거와 검사 결과는 아래에 기록했다.

## Windows nvm 완료 근거

공식 1.1.11·1.2.2·2.0.1 x64 배포 파일과 보조 파일을 검증하고 계열별 조회/설치/사용을 분리했다. 미러·실행 신뢰·정책 고정·경쟁 PATH의 영향을 기능별로 구분한다. 알 수 없는 실행 파일을 버전 조회 목적으로 실행하지 않는다.

독립 검토에서 PATH 후보 충돌, 2.x 인증서/정책 적용 범위, 1.1.11 비동기 fallback 수명, x86 선행 설치 및 정확한 버전 전환 명령을 보정했다. 1.1.11 fallback은 독점 파일 핸들로 비동기 시작을 차단하고 실제 전환 결과로 성공을 확인한다. 2.0.1의 정확 버전 전환은 `use X.Y.Z --no-install` 경로를 사용한다.

공식 근거: [1.1.11](https://github.com/nvm-windows/nvm/releases/tag/1.1.11), [2.0.1](https://github.com/nvm-windows/nvm/releases/tag/v2.0.1), [2.0.1 전환](https://github.com/nvm-windows/cli/blob/fe08afeed22f15b10f07f02df6fcfca0f7d5a77c/src/commands/use/version.go), [최초 설치 자동 활성화](https://github.com/nvm-windows/cli/blob/fe08afeed22f15b10f07f02df6fcfca0f7d5a77c/src/installer/activation.go).

검사: 최초 집중 81 통과·Windows 전용 1 미실행, 1차 보정 집중 77 통과·Windows 전용 2 미실행, 2차 보정 33 통과. 각 변경 후 typecheck 통과. 마지막 두 숫자는 변경 경로의 집중 검사이며 전체 검사 건수와 합산하지 않는다. 실제 Windows 레지스트리·UAC·junction·파일 공유 검사는 Linux에서 수행하지 못했다.

## 최종 검증에서 구분할 범위

| 영역 | 자동 검사로 확인할 계약 | 실제 대상 환경 확인 |
| --- | --- | --- |
| Windows nvm | 관리자 식별·기능 제한·명령 및 결과 검증 | 각 공식 버전의 레지스트리·UAC·실제 설치/전환 |
| WSL2 nodenv | 종료 환경 미실행·선택 잠금·사용자 변경·명령/취소·목록 분리 | 배포판 시작, 바이너리/소스 설치, 실제 프로세스 종료 |
| Home/NodeRail | 동일 환경 상태·목록 불명·빠른 전환·키보드 접근 | 다크/라이트·작은 창의 실제 렌더링 |
| 공유/도움말 | 구버전 메타데이터 부재·연결 대상 초기화·메뉴별 읽기 상태 | 인증된 새/구 호스트 연결 |
| 배포 | 파일명과 metadata/해시 참조·설치 identity 보존 | Windows packaged 신규 설치·이전 버전 업그레이드·자동 업데이트 |

이 표는 검증 범위의 구분이며 통과 기록이 아니다. 실제 결과는 실행 로그와 대상 SHA를 확인한 뒤 기록한다. Linux에서 실행한 WSL guest 스크립트 검사는 Windows의 WSL2 실행·프로세스 관리 실기를 대체하지 않는다.

## 환경 서비스 검증 기록

`7100aea`에서 환경 ID 저장·선택·시작 IPC와 Windows/WSL backend를 연결했다. 선택한 기본 Linux 사용자의 nodenv global만 바꾸고 프로젝트 `.node-version`은 수정하지 않는다. node-build가 없거나 정의·빌드 도구가 부족하면 해당 설치 기능만 사유와 함께 제한한다. 실패 작업의 출력은 사용자 프로필의 `node-operation-logs`에 보존한다.

Linux 집중 검사 29개 및 전체 단위 검사 450개 통과, 기존 Windows 전용 3개 미실행, typecheck와 하네스 7개 통과. 임시 fake nodenv/node-build를 사용하는 Linux guest 스크립트 검사이며 실제 WSL2 실행 성공을 뜻하지 않는다. 독립 검토의 수정 결과는 후속 기록에 포함한다.

WSL CLI에는 “실행 중일 때만 명령을 실행”하는 원자적 옵션이 없다. 게스트 실행 직전 등록·실행 상태를 다시 확인하고, 종료로 확인한 배포판에는 명시적 시작 전 내부 명령을 보내지 않는다. 다만 마지막 상태 확인 직후 외부에서 배포판을 종료하면 `wsl.exe`가 다시 시작할 수 있는 경합은 남는다. 같은 시점의 기본 사용자 변경도 OS 원자 연산으로 잠글 수 없으므로 사용자·root 재검증 및 명시적 사용자 인수로 대상 혼용을 방어한다.

WSL 조사 근거: [Microsoft 명령 설명](https://learn.microsoft.com/windows/wsl/basic-commands), [명령 실행 구현](https://github.com/microsoft/WSL/blob/3eb7a69960fe3d4b7d7e4612e3d7f4dcd1796a2d/src/windows/common/WslClient.cpp), [nodenv 명령](https://github.com/nodenv/nodenv#command-reference), [node-build 정의·설치 구현](https://github.com/nodenv/node-build/blob/d319138ee4045453d20dc326574aa709664e0a14/bin/node-build).

초기 독립 검토에서 설치 정의 경로 고정, catalog/상태 조회 동시성, 읽을 수 없는 설치 목록, rehash 실패의 미완료 표식, shims 초기화, 컴파일 로그 분류, 종료 불명 작업의 잠금 해제 근거를 보완 대상으로 확인했다. `1b89681`에서 7개 항목을 보정했고, 관련 36개 검사와 typecheck가 통과했다. 범위를 제한한 재검토에서 모든 항목 해결·신규 중요 결함 없음으로 승인했다.

종료 불명 작업의 예약 해제는 동일 배포판이 앞뒤 조회에서 비실행이고 중간 verbose 목록에서 `Stopped`·WSL2로 명시된 경우에만 허용한다. 실제 nodenv rehash를 강제 취소하면 도구 자체의 `.nodenv-shim` 잠금 파일이 남을 수 있으므로, 임시 도구 테스트의 재시도 성공을 실제 도구의 무조건 자동 복구로 해석하지 않는다. 이 앱이 다른 작업의 잠금 파일을 임의 삭제하지 않는다.

## 화면 구현 검증 기록

`3f0750a`에서 Home·NodeRail이 같은 환경 선택과 작업 상태를 사용하도록 연결했다. Home 상단 카드 높이, 하단 400px/360px 위젯, Node 최대 3개·참여자 최대 2명, footer의 가용 너비별 참여자 접기, 공통 14px 프레임을 적용했다. 기존 글래스 색·아이콘을 유지하고 Home 공유 배지에 PlanRail 클래스를 재사용했다. 라이트 테마에서 배지 글자가 흐려 보여 공통 글자색만 `#844736`으로 보정했고 다크 값은 보존했다.

UI 39개, 정렬 단위 검사 3개, sandboxed Electron 관련 검사 9개와 typecheck가 통과했다. `b62466a`에서는 실제 글자/아이콘 경계를 기준으로 표 헤더와 데이터의 중심을 측정했다. 다크 Windows fixture와 라이트 WSL fixture의 네 열 오차는 0.01px 미만이며 관련 Electron 검사 4개가 통과했다. 두 Electron 실행의 숫자는 중복 범위이므로 합산하지 않는다.

중간 검사에서 footer 500px의 실제 가용 폭과 맞지 않는 기대값, 좁은 간트에서 중복된 일정 추가 버튼 선택자가 드러났다. 첫 항목은 1280px 전원·500px 한 명·430px 전체 접힘으로 실제 동작을 검사하고, 두 번째는 기존 검사의 의도인 툴바 버튼으로 범위를 한정했다. 초안·선택 날짜·간트 양축 스크롤 유지 검사는 보존했다. 실패 로그와 캡처를 별도로 보관했다.

시각 검증은 Linux Electron의 일회성 프로필·DB와 합성 Windows/WSL 공유 상태를 사용했다. 실제 관리자 설치나 운영 DB를 사용하지 않았다. 실물 Windows/WSL 인수와 호스트/내 앱 버전 제공자는 이 검증 결과에 포함하지 않는다.

독립 검토에서 제목 표시줄 설정의 클릭 이벤트가 탭 인수로 전달되는 회귀, Windows의 `busy:null`인 종료 미확정 작업의 UI 잠금, 긴 참여자 버전의 footer 침범을 확인했다. `05d4dee`에서 세 경로를 수정했고 UI 52개·sandboxed Electron 4개·typecheck가 통과했다. 같은 revision의 거절 응답은 기존 미확정 상태를 덮지 않으며, 정상 읽기·관리 창 응답은 유지한다. 좁은 창의 긴 버전은 안전하게 축약하고 툴팁·목록에 전체 값을 보존한다. 범위를 제한한 재검토에서 세 항목 해결·신규 결함 없음으로 승인했다.

## 실행 버전·메뉴별 도움말 검증 기록

`8c3b6e7`에서 기존 Window 상태 응답의 선택적 `runtimeVersion`과 멤버 공유 상태의 선택적 `hostVersion`을 연결했다. 호스트 버전은 인증된 snapshot 200/304와 changes sync 응답 헤더로 전달하며 기존 protocol 1·JSON 스키마·ETag를 유지한다. 연결 대상·자격이 바뀌면 이전 값을 지우고, 부재·형식 오류는 동기화를 막지 않고 확인 불가로 표시한다. 업데이트 배포 버전을 재사용하지 않는다.

명시적 도움말 진입은 Home/PlanRail/NodeRail/공통 설정의 첫 글부터 시작하고 이후 같은 앱 세션에서 진입 메뉴별 글·검색어·스크롤을 복원한다. 전체 검색·관련 글로 다른 메뉴의 글을 열면 원래 진입 메뉴의 읽기 상태로 기억하며 실제 글의 소속 메뉴를 표시한다. 기존 인수 없는 호출의 역할 기반 PlanRail 진입과 오프라인 이미지·창 재사용·트레이 동반 동작은 유지한다.

단위 65개, UI 50개, native 98개, 관련 sandboxed Electron 8개와 typecheck·하네스 7개가 통과했다. 임시 TLS/DB 및 두 개발 Electron 앱에서 실제 승인·동기화와 `1.0.0-dev` 수신을 확인했다. Windows 패키지의 가상 다음 버전에서 실제 설치 버전과 runtimeVersion을 비교하는 assertion을 추가했으며 Windows lifecycle 실행은 원격 CI 범위다.

독립 검토는 명세 충족·중요 결함 없음으로 승인했다. 같은 글의 메뉴 전환 시 이미지 확대창, 이전 제목 표시줄 위치를 안내하는 문구, 인증되지 않은 원본 응답 헤더의 회귀 assertion은 경미한 개선으로 최종 통합 검토에 전달했다. Windows 설치 버전 assertion은 Task 6의 packaged CI에서 확인한다.
