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
| 배포 이름 | 구현·독립 검토 완료 | `38d2c87`; 외부 파일명과 설치 identity 구분 |
| 통합 검사·인계 | 로컬 전체 검사·독립 검토 완료 | clean `91df811`; 원격 Windows 패키지는 해당 배포 SHA의 CI로 별도 판정 |

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

## 요구별 구현·검사 연결

아래는 코드와 회귀 검사의 대응이다. 전체 통과·실기 결과는 최종 검증 기록과 구분한다.

| 요구 | 구현 경로 | 집중 검사 |
| --- | --- | --- |
| 1 기존 nvm 기능별 지원 | `main/node-management/manager-support.ts`, `modern-manager.ts`, `windows.ts` | `node-management`, `node-windows-modern`, `node-windows-launch` |
| 2 관리자 종류·버전 표시 | `discovery.ts`, `renderer/workrail/NodeScreen.tsx` | `node-management`, `workrail`, `node-presentation` |
| 3 알림 툴팁 | `PlanRailStatus.tsx` | `workrail` UI·Electron |
| 4 연결 참여자·버전 | `SharingMembers.tsx`, `PlanRailStatus.tsx` | 좁은 footer·긴 버전·접속 상태 검사 |
| 5 숫자 폰트 | `workrail.css` | 실제 NodeRail 렌더링 |
| 6 공통 14px 외곽 | `workrail.css` | `workrail` Electron, 실제 레이아웃 측정 |
| 7 공유 배지 | `Home.tsx`, 공통 `.sharing-badge` | 다크·라이트 Home/PlanRail 비교 |
| 8 Home CTA | `Home.tsx`, `workrail.css` | `workrail` UI·Electron |
| 9 메뉴별 도움말 | `shared/help*.ts`, `main/help-window.ts`, `renderer/help/HelpApp.tsx` | `help-window`, `help-content`, `help` UI·Electron |
| 10 compact PlanRail 상태 | `SharingWidget.tsx`, `Home.tsx` | 호스트/멤버·버전 부재·참여자 제한 |
| 11 compact Node 작업 | `NodeVersionControls.tsx`, `Home.tsx`, `useNodeManagement.ts` | 빠른 사용·기능 제한·중복·종료 불명 잠금 |
| 12 분류 설명 | `nodePresentation.ts`, `NodeScreen.tsx` | `node-catalog-sort`, `node-presentation` |
| 13 상태 아이콘·작업 구분 | `NodeScreen.tsx`, `NodeVersionControls.tsx` | 정렬·아이콘 접근성·헤더/행 중심·독립 스크롤 |
| 14 배포 이름 | `electron-builder.yml`, `scripts/release`, `app.yml` | release 검사와 Windows packaged CI |
| 15 flat 비활성 메뉴 | `ToolDock.tsx`, `workrail.css` | `workrail` UI·Electron |
| 16 Windows/WSL2 환경 | `environments.ts`, `wsl*.ts`, `NodeEnvironment.tsx` | `node-environments`, `node-wsl`, `node-routing` |

Q1/Q2/Q4/Q7/Q8은 WSL 기본 사용자·global 전환·명시적 시작·소스 빌드·수동 도구 안내로, Q3은 기능별 gate로 연결했다. Q5/Q6/Q11은 compact 위젯·조건부 환경 선택·참여자 접기로, Q9/Q10은 배포 이름·메뉴별 읽기 상태로 연결했다. Q12의 전체 계약은 해당 경로와 통합 검사에서 함께 확인한다.

## 배포 파일명 검증 기록

`38d2c87`에서 Actions의 Windows 설치·LAN 업데이트·검증 전용 artifact 및 실제 설치 EXE·업데이트 ZIP 접두어를 WorkRail로 통일했다. 설정의 가져오기 안내와 배포 문서도 맞췄다. `Planrail.exe`, appId, 제품 1.0.0, 프로필·자동 실행 경로는 유지하며 과거 Planrail ZIP 가져오기 검사를 보존했다.

Release 33개, 업데이트 ZIP 가져오기 28개, 배포 설정 UI 2개, typecheck·하네스 7개가 통과했다. 생성 파일명에서 blockmap·metadata·manifest·해시 참조를 함께 검사했다. 실제 NSIS·Windows 설치 실행은 원격 CI 검증 범위다. Release 실행의 기존 `MODULE_TYPELESS_PACKAGE_JSON` 진단은 통과와 별도로 보존했다.

배포 변경의 독립 검토는 명세 충족·결함 없음으로 승인했다. 전체 검사 실행 전 개별 단계의 실패 로그와 캡처를 `artifacts/workrail-environments/pre-integration` 및 작업별 증거 폴더에 보존했다.

## 첫 통합 검사와 보완

깨끗한 `8877914`(Linux x64, Node 24.22.1)에서 전체 검사를 실행했다. 타입·release·3개 시간대 단위 검사는 통과했다(각 시간대 474 통과, 기존 Windows 전용 3 미실행). UI는 264 통과·5 실패로 중단됐다. 변경된 footer의 안쪽 문구를 선택하던 기존 assertion이 원인이며 실제 역할·연결 상태 확인은 보존해 수정한다. 이후 단계는 전체 보고서에서 미실행 상태로 유지했다.

추가 진단으로 빌드→native→Electron을 순차 실행했다. 빌드는 통과했고 native는 새 환경 API 3개의 정확한 공개 목록 assertion이 빠져 97/98, Electron은 공통 여백의 이전 기대값 때문에 115/116(4.1분)이었다. 전체 실패 보고서는 `artifacts/workrail-environments/integration-8877914-failed`, 후속 진단과 캡처는 `integration-8877914-remaining`에 보존했다. 이 결과를 전체 통과로 취급하지 않는다.

최종 독립 검토에서는 IPC 거절 응답의 revision과 종료 불명 UI 잠금, 환경/Windows 검사 실패 후 Main의 종료·업데이트 예약 유지, 설치가 사라진 nodenv 기본 버전의 표시를 보완 대상으로 확인했다. 위 검사 보정과 함께 한 차례 통합 수정·재검토를 진행한다. 같은 글의 메뉴 이동 때 확대창 초기화, 도움말의 상태 위치, 인증되지 않은 원본 응답 헤더 검사, WSL 대기 문구도 함께 정리한다.

`c89f15f`에서 통합 검토의 8개 항목과 native/Electron 검사 불일치를 수정했다. 명령 거절을 authoritative 상태와 구분하고 응답 순서를 보존하며, Windows 종료 미확정 예약은 별도 근거 없이 해제하지 않는다. nodenv 설정 기본값과 실제 사용 가능한 버전을 구분했다. 집중 단위 122개·UI 65개, typecheck·제품 빌드·새 빌드의 native 98개·여백 Electron 1개가 통과했다. 최종 fixture 타입 보정 후 routing 6개도 다시 통과했다. 범위를 제한한 재검토와 전체 검사는 이어서 수행한다.

깨끗한 `0f5aa1c`에서 `verify:app`의 7단계와 하네스가 모두 통과했다. 각 시간대 단위 479 통과·기존 Windows 전용 3 미실행, UI 272개, native 98개, Electron 116개(약 4분, 실패·재시도 없음)를 확인했다. 증거는 `artifacts/workrail-environments/aggregate-0f5aa1c`에 보존했다. 이 SHA는 아래 재검토 보정 전 결과다.

범위를 제한한 재검토에서는 기존 8개 지적과 진단 검사 2개가 해결됐음을 확인했다. 이어 환경 선택의 비동기 저장 도중 잠금을 관찰하면 표시 대상과 backend가 달라질 수 있는 경합, 확인된 `reboot-required` 종료 결과에도 종료 불명 예약이 남는 전이를 발견했다. 표시·저장·실행 대상의 일치 및 종료 가능 여부에 영향을 주므로 같은 승인 범위 안에서 두 전이만 추가 보정한다. 재부팅 전 Node 변경 제한과 실제 실행 수명에 따른 앱 종료 차단은 구분한다.

`b57ad49`에서 선택 저장과 기존 검사를 직렬화하고 저장 중 추가 검사·명령이 이전 backend로 진행하지 않게 했다. 선택 ID와 실제 backend 일치도 변경 직전에 확인한다. 검증된 최종 `reboot-required`는 작업 수명 예약을 해제하되 Windows Node 변경 제한은 유지한다. 세 가지 실패 재현 후 관련 단위 63개와 4개 tsconfig 타입 검사가 통과했다. 저장 실패 및 지연 저장 중 조회·명령·선택·실제 guest 사용 경로를 포함했다.

## 최종 로컬 검증·배포 판정

추가 전이 두 건의 독립 재검토는 해결·신규 결함 없음으로 승인했다. clean `91df8119596e36b00ce65cc31c48267f494c6813`, Linux x64, Node 24.22.1에서 `verify:app` 7단계와 하네스 7개가 모두 통과했다. 시작 2026-11-19 13:38:17 KST, 완료 13:46:08 KST. Release 33개, 단위 각 482개(UTC·America/New_York·Asia/Seoul, 각 기존 Windows 전용 3 미실행), UI 272개, native 98개, Electron 116개(재시도·실패·미실행 없음)다. 후속 기록 커밋은 문서만 변경한다.

근거: `artifacts/workrail-environments/aggregate-91df811`의 app/latest.json은 `state: completed`, `passed: true`, `dirty: false`이며 SHA·OS·단계별 결과를 포함한다. 초기 실패와 중간 통과 기록은 같은 상위 폴더에 따로 보존했다. 전체 분기 검토와 두 번의 제한된 수정 검토에서 남은 중요 결함은 없다. 루트 AGENTS.md 66줄과 실행 명령은 유효하며 완료 MVP 지도는 보존했다.

원격 실행은 [Application](https://github.com/kdydesign/simple-timeline/actions/workflows/app.yml)과 [Repository harness](https://github.com/kdydesign/simple-timeline/actions/workflows/harness.yml)에서 **동일 배포 SHA**로 확인한다. Windows `test:packaged` 성공 및 WorkRail 설치/LAN/검증 전용 artifact 생성까지 확인해야 설치 검증 완료다. 이 문서의 로컬 기록만으로 원격 실행 성공이나 실제 Windows nvm·WSL 인수를 선언하지 않는다. 원격 결과는 실행 URL·artifact ID와 함께 별도 인계한다.

실제 Windows nvm 1.1.11·1.2.2·2.0.1 설치/전환·UAC와 WSL2의 실제 다운로드·컴파일·취소·한글 OS 상태 조회는 사용자 환경 인수가 남는다. Windows 패키지 CI는 WorkRail 설치·데이터·업데이트를 검사하며 이 관리자 실기를 대신하지 않는다. nvm2.0.1 빈 환경 첫 설치 제한, WSL 외부 종료 경합, 실제 nodenv 재해시 잠금의 수동 복구 범위는 위 기록과 사용자 도움말에 명시했다.
