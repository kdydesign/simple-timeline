# 검증 안내

## 변경별 진입점

명령은 저장소 루트에서 실행한다. 앱 개발은 [.node-version](../../.node-version)과
[package.json](../../package.json)의 Node·npm을 사용한다. 하네스만 실행할 때는 Node 24 이상과 Git이면 된다.

| 변경·확인 대상 | 실행할 검사 | 통과가 뜻하는 범위 |
| --- | --- | --- |
| 문서·에이전트 지침 | `node scripts/harness/run.mjs verify` + 변경한 경로·명령의 실제 대상 확인 | 저장소 구조·참조·상태 일관성. 문장 내용의 진실성은 별도 대조 |
| 순수 날짜·정렬·시각화 계산 중 반복 확인 | `npm run test:unit -- tests/unit/date.test.ts --reporter=dot` (날짜 검사 예) | 지정 단위 검사. 제품 변경의 최종 통합 검사를 대체하지 않음 |
| 제품 코드 | `npm run verify:app` | 타입·release 정적 검사·3개 TZ unit·UI·build·Electron native·E2E |
| Windows 설치본 | clean Windows에서 `npm run dist:win`, 이어 `npm run dist:win:test-update`; CI의 `scripts/release/build-legacy.ps1`은 고정0.2.1 fixture 생성 | 실제 NSIS 산출물과 소스 SHA·해시. 설치 실행 성공은 별도 검사 |
| 패키지 설치 lifecycle | 일회성 Windows CI VM의 `npm run test:packaged` | 실제 제품 앱·설치·차단 후 오프라인 동작·업데이트·제거/재설치, 실제 updater 인계·자동 재실행(0.8.0 추가·실행 결과 별도) |
| 사용자 PC | [실기 양식](../release/manual-checklist.md) | 사용자가 실행·보고한 항목만. [기존 MVP 인수 범위](../release/user-acceptance.md) 유지 |

`npm test`·`npm run lint` 스크립트는 없다. 타입 검사는 `npm run typecheck`, 제품 빌드는 `npm run build`다.
Windows 명령은 [배포 정책](../release/policy.md)과 [Windows 검증 기록](../release/windows-validation.md)을 먼저 읽는다.
설치본 생성은 dirty checkout·기존 출력물을 거부한다. 출력은 보존·이동한 뒤 실행하며 강제로 덮어쓰지 않는다.
검증용 다음 버전은 같은 코드·같은 DB 스키마의 fixture이며 새 기능이나 스키마 업그레이드의 검증이 아니다.

## 문맥 조회와 저장소 검사

`node scripts/harness/run.mjs context`는 읽기 전용이다. 진행 중인 단계의 재개를 우선하고,
없으면 선행 단계가 끝난 열린 단계를 제안한다. 모두 완료되면 `selected: null`, `frontier: []`를 반환한다.
명시한 단계가 완료·차단·미존재이면 오류다. 진행 중인 단계가 여러 개면 선택을 요구한다.
단계·담당자·승인을 자동으로 바꾸지 않으며 명령 성공이 사용자 승인을 뜻하지 않는다.

`node scripts/harness/run.mjs verify`는 저장소 위치를 스크립트 경로에서 찾는다.
외부 의존성 설치나 네트워크 없이 로컬·CI에서 같은 검사를 실행한다.

| 검사 | 범위 |
| --- | --- |
| runtime / git-context | Node 버전, 실제 Git 커밋과 작업 트리 상태 |
| repository | 필수 문서, AGENTS 150줄 이내, 로컬 링크, 단계 의존 관계·지도/상태 일관성·완료 인수인계 |
| working-tree / index / commit whitespace | 미스테이징·스테이징·최근 커밋의 공백 오류 |
| harness-tests | `scripts/harness/*.test.mjs` 전체 발견·실행. 테스트 없음·실패도 검사 실패 |

총 7종 검사다. Git 명령별 30초, Node test runner 30초, 하네스 CI 전체 5분 제한이다.
검증기는 모든 검사 결과를 모으고 하나라도 실패하면 종료 코드 1을 반환한다.
CI는 commit 공백 검사를 위해 fetch-depth 2를 사용한다.
빠른 반복 검사는 `node scripts/harness/check.mjs`, 검사기 회귀만 실행할 때는
`node --test --test-isolation=none scripts/harness/*.test.mjs`다. 종료 전에는 통합 verify를 실행한다.

### 현재 자동화의 경계

[check.mjs](../../scripts/harness/check.mjs)는 저장소 루트의 Markdown과 docs 아래 Markdown만 순회한다.
이 문서들의 인라인 로컬 파일 링크만 검사하며 `.agents/skills/` 내부는 순회하지 않는다.
코드 예시·앵커·참조형·HTML 링크·외부 URL, 백틱 경로·명령·식별자 존재는 검사하지 않는다.
따라서 지침·스킬 변경 시 링크와 명령을 별도로 대조해야 한다. 개선 제안은 [재점검 기록](review.md)에 둔다.

티켓 메타데이터는 첫 `##` 제목 앞에 두고 중복 필드를 금지한다.
closed 티켓은 인수인계의 결과·승인 사항·산출물 링크·검증·다음 작업이 채워져 있어야 한다.
빈 양식·주석만으로는 통과하지 않는다. STATUS·MAP·티켓 상태도 대조하지만 실제 승인 권한이나
내용의 충실도는 사람이 확인한다. `repository-harness-only` 통과는 앱 실행·보안·설치 검증이 아니다.

## 앱 실행 환경과 격리

새 개발 환경은 `npm ci`로 준비한다. Electron 다운로드와 native 준비에 네트워크가 필요하고,
prebuilt를 사용할 수 없으면 C++ 빌드 도구가 필요하다. 일반 Node와 Electron의 native 실행 환경을 혼용하지 않는다.
`npm run test:native`는 실제 Electron 런타임을 사용한다.

Linux headless는 GUI 라이브러리와 Xvfb가 필요하다. `xvfb-run -a npm run verify:app`를 사용하거나
이미 준비한 DISPLAY에서 실행한다. Electron sandbox는 유지한다. CI는 일회성 Linux VM에서
chrome-sandbox 소유권/권한을 준비한다. 환경이 sandbox 실행을 지원하지 않으면 원인과 미검증 범위를 기록한다.

일반 `npm run dev`와 제품 실행은 사용자 앱 데이터의 실제 DB를 사용한다. 시험 입력이 필요하면 별도 OS 사용자나
일회성 프로필로 격리한다. Linux의 개발 명령 확인은 다음처럼 새 디렉터리를 사용한다.

```sh
ST_DOC_PROFILE=$(mktemp -d)
XDG_CONFIG_HOME="$ST_DOC_PROFILE" npm run dev
```

headless에서는 준비된 DISPLAY가 추가로 필요하다. 이 예는 Linux용이며 Windows에 같은 환경변수를 적용하지 않는다.
자동 native/E2E 검사는 자체 임시 DB·Chromium 프로필을 사용한다. 오류 주입은 별도 test main에만 있고
제품 main에는 테스트용 프로필 override가 없다. 운영 DB 경로를 시험 경로로 넘기지 않는다.
패키지 검사 전에 실제0.2.1 fixture가 필요하다. CI는 `pwsh -File scripts/release/build-legacy.ps1`로 별도 임시 worktree에서 준비한다.
패키지 검사는 실제 AppData·방화벽을 다루므로 기존 프로필 없는 일회성 GitHub-hosted Windows VM에서만 실행한다.

앱 검사는 공유 artifact 디렉터리를 정리하므로 전체/개별 검사를 겹쳐 실행하지 않는다.
verify:app의 순서는 typecheck → test:release → test:tz → test:ui → build → test:native → test:e2e다.
각 명령은 180초 제한이며, `test:e2e`의 전체 suite만 240초다. 첫 실패에서 멈추고 나머지를 `not-run`으로 기록한다.
0.6.0의 순차 sandbox Electron 68개 회귀는 실제180초에64개 통과 뒤 종료된 근거로 전체 예산만 늘렸다.
개별 테스트·assertion·네트워크 요청 제한은 유지한다. [실행 기록](../implementation/2026-11-10-lan-sharing.md)을 따른다.
native 내부 Electron 실행 예산은120초다(상위 명령180초에 컴파일·프로필 정리 포함). Windows에서 이전 성공 단계가58.45초였고 이후 두 실행이 내부60초 제한으로 종료되어 전체 예산을 조정했다. 이 조정은 Windows 통과 근거가 아니며, 단계별 시간을 남긴 Windows 재실행으로 원인 가설을 검증해야 한다.
개별 검사로 실패를 재현·수정한 뒤 변경에 필요한 통합 검사를 마친다. 실패·skip을 성공으로 바꾸지 않는다.

## 결과와 CI 읽기

| 근거 | 내용·보존 |
| --- | --- |
| `artifacts/harness/latest.json`, `latest.log` | scope·시각·OS·Node·HEAD·dirty·검사 결과와 상세 로그. [Repository harness](../../.github/workflows/harness.yml)는 Ubuntu/Windows, 5분 제한, artifact 14일 보관 |
| `artifacts/app/latest.json`, 명령별 `.log` | `application-tests`의 SHA·dirty·완료/실패/미실행. 로그 이름은 스크립트의 콜론을 하이픈으로 바꾼 이름 |
| `artifacts/native/`, `artifacts/e2e/` | native `results.json`의 케이스 실행·정리 시간, `latest.log`의 시작 단계, `runner.json`의 프로세스·프로필 정리 시간과 마지막 관측 단계(제한 초과 포함). E2E JSON·프로세스 로그·화면·성능 fixture 결과 |
| `artifacts/packaged/`, `release/`, `artifacts/windows-update/`, `artifacts/windows-legacy/` | Windows lifecycle 결과·정식 설치본·검증 전용 업데이트 fixture |

[Application CI](../../.github/workflows/app.yml)는 Ubuntu/Windows, 작업별 45분 제한으로 앱 검사를 실행한다.
Windows에서만 현재·검증 전용 다음 버전·고정된 실제0.2.1 설치본을 만들고 패키지 검사를 실행한다. 로그는 실패해도 업로드하며 설치본은 성공한 경우만 제공한다.
`test:packaged`는 test-only updater harness를 별도 `artifacts/packaged-harness`에 번들한 뒤 기존 lifecycle과 `packaged.update.spec.ts`를 순서대로 실행한다. 새 검사는 실제 production adapter·bootstrap 종료·NSIS·자동 재실행·read-only 자료 보존을 검증하며, 자동 재실행한 앱은 강제 종료하지 않고 일회성 VM 폐기에 맡긴다. 이 harness는 app.asar에 포함되지 않으며 production catalog가 test-only 파일을 거부하는 계약도 유지한다. 실행하지 않은 Windows 검사는 통과로 기록하지 않는다.
이 workflow는 retention-days를 지정하지 않아 저장소/조직 기본 보관 설정을 따른다. 모두 14일이라고 가정하지 않는다.
두 workflow 모두 push·pull_request·수동 실행을 받으며 문서만 변경해도 Application의 설치본 생성까지 실행한다.

latest는 다음 실행에서 덮어쓴다. 실행 시작에 running/false로 바뀌며 중단 시 이전 PASS를 재사용하지 않는다.
completed와 passed, 개별 검사 결과를 함께 읽는다. dirty 보고서는 깨끗한 HEAD의 결과가 아니므로
필요한 근거는 실행 SHA·환경·CI URL과 함께 문서에 남긴다. 문서 커밋 SHA와 사용자가 검증한 설치본 소스 SHA를 구분한다.

## 변경 시 검토할 실패 경로

- 권한·IPC: 발신자/main frame·URL·입력 검증, 고정 preload API, SQL 바인딩을 확인한다.
  [보안 검사](../../tests/e2e/security.spec.ts)와 [IPC 단위 검사](../../tests/unit/ipc.test.ts)를 참조한다.
- 날짜·배치: 하루짜리·윤년·월/주/연도 경계·0001/9999년과 포함 일수를 확인한다.
  [시각화 계약](../design/visualization.md)과 3개 TZ unit 결과를 대조한다.
- 저장·실패: commit 후 성공, FK 원자 삭제, 입력/마지막 정상 데이터 보존, 결과 불명 create의 자동 재전송 방지를 확인한다.
  [DB 검사](../../tests/native/)와 [실패 E2E](../../tests/e2e/failures.spec.ts)를 참조한다.
- 가상화·포커스: 화면 밖 행 제거 시 BODY로 포커스를 잃지 않고, 숨긴 overflow의 native scroll이 좌표를 바꾸지 않는지 확인한다.
  [검토 회귀](../../tests/e2e/review.spec.ts)를 따른다. 모달을 연 채 창을 좁혀도 최상위 모달을 inert 배경 밖에 두고 Escape/복귀를 확인한다.
- 공통 UI: shadcn/Radix 변경은 [구성 지도](../design/architecture.md#renderer-공통-ui와-스타일)와
  [UI 회귀](../../tests/ui/planrail-design.test.tsx)·[실제 Electron 회귀](../../tests/e2e/planrail-design.spec.ts)를 대조한다.
  중첩 Select/날짜 팝오버의 포커스·Escape, 7개 툴팁의 실제 위치, 확인창 중 제목 표시줄 클릭을 포함한다.
  Linux에 창 관리자가 없으면 native 최소화/최대화 상태 검사는 환경 한계로 표시하지만 실제 명령 전달과 숨김/복원은 검사한다.
- 범위·근거: 자동화 viewport·실패 주입을 실제 Windows 배율/Narrator·물리 장애 결과로 확대하지 않는다.
  대량 fixture 수치는 해당 환경의 관측이며 사용자 PC 성능 보장이나 SLA가 아니다.
