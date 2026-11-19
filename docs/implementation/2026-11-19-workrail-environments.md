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
| Home·NodeRail·footer | 진행 중 | 환경/기능 상태 소비 |
| 공유 버전·도움말 | 대기 | 구버전 공유 호환·메뉴별 읽기 상태 |
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
