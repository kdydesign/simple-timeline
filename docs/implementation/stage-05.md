# 스테이지 5 실행·검증 기록

기준 main: `4c59dc0916810385521d7167f86649cc68339d6d`. 실행 범위는
[승인 계획](../superpowers/plans/2026-11-03-simple-timeline-implementation.md)의 Task 1~5다.
구현·검증은 Superpowers executing-plans/TDD, 상태·인수인계는 Wayfinder로 진행했다.
다음 단계의 간트·달력과 설치 파일은 구현하지 않았다.

## 실제 산출물과 경계

- `src/domain`, `src/shared`: 시간대 없는 날짜·정규화·정렬과 8개 API의 DTO 계약.
- `src/main/db`: STRICT 스키마·FK·원자 CRUD·버전·무결성·마이그레이션 사본·재실행 보존.
- `src/main`, `src/preload`: 단일 인스턴스·sandbox·발신자/입력 검사·오류 정제·닫기 보호.
- `src/renderer`: CRUD 검증용 목록, 프로젝트/일정 패널, 삭제·미저장 확인, 저장/실패/결과 불명 상태.
- `tests`, `scripts/testing`, Application CI: 임시 DB와 Chromium 프로필로 실제 Electron 경로 검증.

목업 코드는 복사하지 않았다. renderer에 Node·DB·파일·범용 IPC 권한을 추가하지 않았다.
source는 개발 앱이며 NSIS 설치본·Windows 지원 환경·서명·배포 조건은 스테이지 7에서 결정한다.

## 실행 방법·보고서

Node 24.22.1에서 `npm ci` 후 `npm run dev`, 또는 `npm run build`를 사용한다.
설치 시 Electron 바이너리 다운로드와 native 재빌드에 네트워크/플랫폼 빌드 도구가 필요할 수 있다.
Linux headless 검증은 Xvfb가 필요하며, 이번 환경은 Debian 13의 Xvfb를 scratch에 풀어 `DISPLAY=:99`로 실행했다.
제품이나 테스트의 sandbox를 끄지 않았다. Ubuntu CI는 임시 runner의 Electron helper만 root:root·4755로 준비한다.

```sh
npm run verify:app
node scripts/harness/run.mjs verify
```

앱 검증 순서: typecheck → 3개 TZ unit → UI → build → native → E2E.
native 보안 검사가 실제 preload/HTML 산출물을 사용하므로 build가 먼저다.
`artifacts/app/latest.json`은 `application-tests`, `artifacts/harness/latest.json`은 `repository-harness-only`다.
두 보고서는 SHA·dirty 여부·실행 환경을 기록하며 다음 실행에서 덮어쓴다.
검사 미실행/timeout/테스트 미발견을 성공으로 바꾸지 않는다.
상세 로그는 app/native/e2e artifact와 GitHub Actions에 남는다.

## TDD와 독립 검토

도메인·DB·IPC·UI의 테스트를 먼저 실행해 미구현 동작 실패를 확인한 뒤 구현했다.
독립 검토 범위는 `4c59dc0..40686d8`이며, 중요 문제 다섯 가지를 받아 아래 회귀를 각각 RED→GREEN으로 확인했다.
수정 후 전체 앱 검증과 하네스를 재실행했다. 재검토 에이전트를 반복 호출하지 않았다.

| 검토에서 확인한 문제 | 실제 회귀와 수정 결과 |
| --- | --- |
| readonly 검사 때문에 복구 가능한 hot journal이 시작을 차단 | 실제 Electron writer를 트랜잭션 중 강제 종료. 인식된 DB의 원본 DB/저널을 먼저 보존한 뒤 SQLite 복구를 허용. 마지막 commit 데이터만 남고 보존 실패 시 원본 바이트가 유지됨 |
| 좁은 편집 모달 밖의 재조회 버튼에 키보드로 접근 불가 | 오류·재조회 컨트롤을 활성 모달 안으로 이동. 결과 불명 입력을 버리지 않고 조회 가능 |
| 640×400에서 저장 버튼이 화면 밖 | overlay를 viewport 높이의 스크롤 영역으로 제한. 실제 Electron에서 버튼 위치·키보드 제출 확인 |
| 긴 이름 삭제 확인창의 버튼이 화면 밖 | 전체 이름을 유지하면서 확인창 높이를 제한하고 스크롤 제공. 3600자 이름으로 실제 화면 검증 |
| 프로필 폴더 생성 실패가 콘솔만 남기고 종료 | main의 초기 실패 안내 경로 추가. 실제 실패 실행에서 정제 오류 알림 호출·비정상 종료·기존 파일 보존 확인 |

복구 전 원본은 `userData/recovery-backups/<시각-UUID>/`에 DB와 해당 SQLite 보조 파일을 보관한다.
알 수 없는 앱 식별자·손상 파일을 새 DB로 대체하지 않는다. 이것은 내부 안전장치이며 수동 백업/복원 기능이 아니다.

## 검증 결과와 CI 이력

로컬 Linux x64, Node 24.22.1 / Electron 45.2.1 / ABI 150에서 수정 후 전체 검증이 통과했다.
unit 23개를 UTC·America/New_York·Asia/Seoul에서 각각 실행했고 UI 9개, native 11개, E2E 8개가 통과했다.
E2E는 실제 UI→IPC→SQLite CRUD·재실행 ID 보존·연쇄 삭제·두 번째 프로세스·응답 실패·보안 경계·작은 화면·시작 실패를 검증한다.
하네스 7종과 회귀 22개도 통과했다. 최초 전체 수정 검증은 `40686d8` 기준 dirty 작업 트리였으며,
그 수정은 `8f8fc22`에 커밋됐다. clean 최종 결과와 최종 SHA는 종료 메시지에서 대조한다.

- `8f8fc22` [Application CI](https://github.com/kdydesign/simple-timeline/actions/runs/41607761653):
  Ubuntu는 native 실행 전 sandbox helper 설정으로 실패했다. Windows는 unit/UI/build/native와 E2E 7개가 통과했고
  보안 탐색 테스트의 이벤트 등록/이동 순서 경합으로 1개가 timeout됐다. 이 실패를 숨기지 않고 각각 수정했다.
- 같은 SHA의 [Repository harness](https://github.com/kdydesign/simple-timeline/actions/runs/41607761728)는 두 OS 모두 통과했다.
- `7b66353`에서 임시 CI helper 설정과 보안 테스트 순서를 보완했다. [Application 재검증](https://github.com/kdydesign/simple-timeline/actions/runs/41608614371)는 Ubuntu·Windows 두 앱 작업 모두 성공했다. 최종 문서 커밋의 CI는 종료 메시지에서 추가 확인한다.

Windows CI의 개발 앱 검증은 실제 Windows 설치·업데이트·오프라인 배포 검증을 뜻하지 않는다.
실제 설치·보조기술·물리 디스크 실패·최종 배포물의 검증은 여전히 스테이지 7에 남아 있다.

## 실행 중 정한 조정과 비용

1. cloud 스킬 helper 스크립트가 설치되지 않아 동등한 ledger/실패·성공 근거를 수동 관리했다. 검증 게이트는 유지하며 자동화 방식만 다르다.
2. Electron 45의 지연 다운로드 때문에 postinstall에서 바이너리를 명시적으로 준비한다. 설치 시 다운로드가 추가되며 앱 실행의 오프라인 요구는 유지한다.
3. CJS 앱 안의 ESM 설정 파일은 `.mts`를 쓴다. config 경로만 달라지고 main/preload는 CJS다.
4. native 검증 전 build를 실행한다. 검증 순서가 바뀌지만 같은 검사들을 실행한다.
5. 복구 가능한 저널은 원본 쌍 보존 후 SQLite가 복구한다. 비정상 종료 복구 시 추가 디스크 공간을 쓴다.
6. Ubuntu CI의 sandbox helper를 임시 runner에서만 준비한다. 범위가 제한된 root 설정이 필요하며 sandbox 자체는 유지한다.
7. 간트/달력·극단 범위 렌더링은 Task 6~8, 설치/업데이트/물리 Windows 검증은 Task 9에 남긴다. 그 기능의 완료를 주장하지 않는다.
8. CRUD 목록은 Task 5의 임시 검증 화면이며 영구 모드를 추가하지 않는다. 시각화는 후속 단계 전까지 사용할 수 없다.
9. 수동 백업·공유/동기화·검색·드래그 편집은 승인된 범위 밖으로 유지한다. 이 기능은 제공하지 않는다.
10. 시작 안내 문서를 실제 명령으로 갱신하고, Windows 성공은 실제 CI 완료 후에만 판단한다. 오래된 문서나 Linux 결과를 Windows 증거로 대체하지 않는다.
11. 자동 audit-force 변경 대신 승인된 builder를 유지한다. 아래 실제 빌드 도구 advisory를 남기며 스테이지 7에서 재검토한다.

## 남겨둔 작은 항목과 알려진 도구 advisory

- 일정 추가 버튼에서 편집을 취소할 때 포커스가 호출 버튼 대신 프로젝트 추가로 돌아갈 수 있다. 기능은 키보드로 접근 가능하나 복귀 위치를 다듬을 여지가 있다.
- 마이그레이션 사본의 최종 경로·대상 버전 로그가 빠져 있다. 사본은 보관되지만 진단 편의 보완이 남아 있다.
- `npm audit`에서 high/critical 0, moderate 15를 확인했다. 원인은 빌드 도구 의존성의
  [minimatch globparts amplification DoS](https://github.com/advisories/GHSA-g3hv-75wg-m249)와 그 의존 경로다.
  사용자 renderer 입력으로 빌드 glob을 실행하는 경로는 없다. 자동 제안은 builder 20.x로의 큰 다운그레이드여서 적용하지 않았다.
  패키징 도구 재검토 시 다룰 알려진 제한이며, 취약점이 없다고 주장하지 않는다.
