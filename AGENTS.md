# Codex 작업 안내

## 프로젝트

Planrail — 오프라인 Windows 일정 관리 프로그램. Electron + React + SQLite.
사용자와 한국어로 소통한다. Teams·공유·모바일은 현재 MVP 범위 밖이다.

## 시작 순서

1. 저장소 루트에서 `git status --short --branch`로 기존 변경을 확인·보존한다.
2. `node scripts/harness/run.mjs context`와 [현재 상태](docs/wayfinder/STATUS.md)를 확인한다.
   `selected: null`, `frontier: []`이고 지도가 완료 상태이면 새 요청의 범위로 진행한다. 완료 단계를 자동 재개하지 않는다.
3. [문서 기준과 탐색 경로](docs/agents/domain.md)에서 요청과 관련된 설계·코드·검증 기록만 읽는다.
   단계 작업이면 해당 티켓·선행 인수인계도 읽고 [로컬 트래커 규칙](docs/agents/issue-tracker.md)을 적용한다.

## 작업 원칙

- 요청한 범위만 수행한다. 단계 작업은 해당 단계에서 멈추고, MVP 후속 작업은 기존 완료 상태를 유지한다.
- 현재 구현, 승인된 설계, 개선 제안을 구분한다. 불일치는 근거와 함께 기록하며 코드나 승인 내용을 임의로 맞추지 않는다.
- 이미 승인받은 사항을 다시 묻지 않는다. 새로운 제품 결정을 임의 승인하지 않는다.
- 설계·계획·구현 시 Superpowers, 스테이지 결정·인수인계 시 Wayfinder를 적용한다.
  플러그인을 사용할 수 없으면 그 사실을 밝히고 저장소의 절차로 이어간다.
- 설계·문서만 요청받으면 제품 코드·의존성·배포 설정을 변경하지 않는다.
- 날짜는 시간대 없는 `YYYY-MM-DD`, 0001~9999년, 양 끝 포함이다. renderer에 Node·파일·DB 권한을 노출하지 않는다.
- 저장 commit 전 성공 표시, 실패 DB의 삭제·빈 DB 대체, 운영 DB를 사용하는 자동 테스트를 금지한다.
- 사용자 요청과 이 저장소의 승인 범위·문서 관례를 외부 스킬의 일반 템플릿보다 우선한다.

## 실행·검증 명령

모두 저장소 루트에서 실행한다. 앱 도구는 [.node-version](.node-version)의 Node와 npm을 사용한다.
처음에는 `npm ci`가 필요하며 Electron 다운로드·native 준비 때문에 네트워크와 대상 빌드 도구가 필요할 수 있다.
하네스만 실행할 때는 Node 24 이상과 Git이면 된다.

| 목적 | 명령 |
| --- | --- |
| 개발 실행 / 제품 빌드 | `npm run dev` / `npm run build` |
| 타입 / 날짜 단위 검사 | `npm run typecheck` / `npm run test:unit -- tests/unit/date.test.ts --reporter=dot` |
| 저장소 완료 검사 | `node scripts/harness/run.mjs verify` |
| 앱 전체 검사 | `npm run verify:app` (Linux headless: `xvfb-run -a npm run verify:app`) |
| Windows x64 설치본 | `npm run dist:win` (clean checkout, 기존 출력 없는 Windows 환경) |

`npm run dev`는 일반 사용자 DB를 사용한다. 일회성 확인은 [프로필 격리 절차](docs/harness/validation.md)를 따른다.
Electron sandbox를 끄지 않는다. 앱 검사를 겹쳐 실행하면 artifact 정리가 충돌하므로 순차 실행한다.
패키지 검사는 실제 AppData·방화벽을 사용하므로 기존 프로필 없는 일회성 Windows CI VM에서만 실행한다.

## 완료 기준

- 문서 변경도 하네스 verify를 통과해야 한다. 제품 변경은 verify:app도 실행한다.
  실패를 숨기거나 검사를 비활성화하지 않는다. 경로·명령 수정 시 실제 대상과 실행 가능성도 확인한다.
- [검증 안내](docs/harness/validation.md)에 따라 보고서의 SHA·dirty 상태·환경·검사 범위를 확인한다.
  실행하지 못한 검사는 미검증으로 남긴다. Windows CI와 사용자 PC 인수 결과를 구분한다.
- 결과·근거·남은 일을 관련 기존 문서에 기록한다. 단계 종료라면 인수인계·티켓·STATUS·MAP도 함께 갱신한다.
  일반 후속 작업의 절차는 [세션 안내](docs/harness/session.md)를 따른다.
- 요청 범위의 변경만 커밋한다. 사용자의 상시 지시에 따라 검증 후 `main`에 직접 커밋·push하고 성공 여부를 보고한다.
  PR 생성·PR 승인 요청을 기본 절차로 사용하지 않는다. 자동 merge, 강제 push, 사용자 변경 폐기는 하지 않는다.
  원격이 앞서 있으면 최신 변경을 확인·통합하고 다시 검증한 뒤 일반 push한다.

## 문서·지침 유지

- 지침 점검은 [agents-md](.agents/skills/agents-md/SKILL.md), 문서·결정 기록은 [documentation-and-adrs](.agents/skills/documentation-and-adrs/SKILL.md)를 적용한다.
- 명령·경로·검증 범위가 바뀌면 해당 기준 문서와 이 진입점을 함께 보정한다. 상세 검토 사례는 [검증 안내](docs/harness/validation.md)에 둔다.
- 과거 실행 기록은 당시 SHA·환경의 증거로 보존한다. 승인된 결정 이유를 추정해 새 ADR로 복제하지 않는다.
