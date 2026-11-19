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
| 환경 선택·WSL nodenv | 진행 중 | Task 1 계약에 이어 통합 |
| Home·NodeRail·footer | 대기 | 환경/기능 상태 소비 |
| 공유 버전·도움말 | 대기 | 구버전 공유 호환·메뉴별 읽기 상태 |
| 배포 이름 | 대기 | 외부 파일명과 설치 identity 구분 |
| 통합 검사·인계 | 대기 | verify:app·harness·독립 검토·원격 Windows 패키지 |

검증 결과·수정 판단·실기 한계는 완료 시 이 문서에 갱신한다. 로그는 artifacts 아래 보존하며 반복 확인 때문에 실패 증거를 지우지 않는다.

## 구현 중 확인한 제한

nvm-windows 2.0.1의 기존 기본 버전이 없는 첫 설치는 CLI가 자동으로 기본 버전을 지정하며 해제 옵션이 없다. 승인된 설치/사용 분리 원칙에 따라 이 조건의 설치 기능만 이유와 함께 제한한다. 기존 기본 버전이 있는 환경의 설치·전환까지 제한하지 않는다. 공식 코드 근거와 검사 결과는 Task1 완료 시 보강한다.

## Windows nvm 완료 근거

공식 1.1.11·1.2.2·2.0.1 x64 배포 파일과 보조 파일을 검증하고 계열별 조회/설치/사용을 분리했다. 미러·실행 신뢰·정책 고정·경쟁 PATH의 영향을 기능별로 구분한다. 알 수 없는 실행 파일을 버전 조회 목적으로 실행하지 않는다.

독립 검토에서 PATH 후보 충돌, 2.x 인증서/정책 적용 범위, 1.1.11 비동기 fallback 수명, x86 선행 설치 및 정확한 버전 전환 명령을 보정했다. 1.1.11 fallback은 독점 파일 핸들로 비동기 시작을 차단하고 실제 전환 결과로 성공을 확인한다. 2.0.1의 정확 버전 전환은 `use X.Y.Z --no-install` 경로를 사용한다.

공식 근거: [1.1.11](https://github.com/nvm-windows/nvm/releases/tag/1.1.11), [2.0.1](https://github.com/nvm-windows/nvm/releases/tag/v2.0.1), [2.0.1 전환](https://github.com/nvm-windows/cli/blob/fe08afeed22f15b10f07f02df6fcfca0f7d5a77c/src/commands/use/version.go), [최초 설치 자동 활성화](https://github.com/nvm-windows/cli/blob/fe08afeed22f15b10f07f02df6fcfca0f7d5a77c/src/installer/activation.go).

검사: 최초 집중 81 통과·Windows 전용 1 미실행, 1차 보정 집중 77 통과·Windows 전용 2 미실행, 2차 보정 33 통과. 각 변경 후 typecheck 통과. 마지막 두 숫자는 변경 경로의 집중 검사이며 전체 검사 건수와 합산하지 않는다. 실제 Windows 레지스트리·UAC·junction·파일 공유 검사는 Linux에서 수행하지 못했다.
