# Codex 작업 안내

## 프로젝트

오프라인 Windows 일정 관리 프로그램. Electron + React + SQLite.
사용자와 한국어로 소통한다. Teams·공유·모바일은 현재 MVP 범위 밖이다.

## 시작 순서

1. 저장소 루트에서 `git status --short --branch`를 확인한다. 기존 변경을 보존한다.
2. [현재 상태](docs/wayfinder/STATUS.md)와 [진행 지도](docs/wayfinder/MAP.md)를 읽는다.
3. 요청받은 스테이지 문서와 직전 인수인계를 읽는다. 문서 위치는 [README](README.md)에 있다.
4. 필요한 부분만 [전체 설계](docs/superpowers/specs/2026-11-03-simple-timeline-design.md)와
   [용어](CONTEXT.md)에서 찾아본다. 모든 문서를 한꺼번에 읽지 않는다.
5. `node scripts/harness/run.mjs context`로 재개할 단계·담당자·읽을 문서를 확인한다.
   특정 단계는 `context 01-domain`처럼 지정한다. 이 명령은 단계나 승인을 자동 변경하지 않는다.

## 작업 원칙

- 한 채팅에서는 요청받은 한 스테이지만 진행한다. 범위가 바뀌면 상태와 인수인계도 갱신한다.
- 사용자가 정한 요구사항, 에이전트 제안, 미결정 사항을 구분한다.
- 이미 승인받은 사항을 다시 묻지 않는다. 새로운 제품 결정을 임의 승인하지 않는다.
- 설계·계획·구현 시 Superpowers, 스테이지 결정·인수인계 시 Wayfinder를 적용한다.
  플러그인을 사용할 수 없으면 그 사실을 밝히고 저장소의 절차로 이어간다.
- 설계 단계에서 제품 코드·프레임워크·의존성을 미리 만들지 않는다.
  사용자가 별도로 요청한 프로젝트 하네스 설정은 제품 구현 단계와 구분한다.
- 과거 채팅의 기억보다 버전 관리된 문서·실제 코드·검증 결과를 기준으로 판단한다.

## 검증과 종료

- 변경 후 `node scripts/harness/run.mjs verify`를 실행한다. 로컬과 CI가 같은 명령을 사용한다.
  결과는 `artifacts/harness/latest.json`과 `latest.log`에 남는다. [검증 안내](docs/harness/validation.md)를 따른다.
- 제품 변경은 `npm run verify:app`도 실행한다. Linux headless는 Xvfb 환경에서 실행한다.
  `npm ci`는 Electron 다운로드·native 재빌드를 수행하며, DB 테스트는 Electron 런타임과 임시 프로필을 사용한다.
  앱 보고서는 `artifacts/app/`, native/E2E 로그는 각 하위 artifact에 남는다. 하네스 검증과 실제 앱 검증을 구분한다.
- 실패하면 원인을 확인하고 수정한 뒤 해당 검사를 재실행한다. 실패를 숨기거나 검사를 비활성화하지 않는다.
- Windows 설치·오프라인 실행은 실제 Windows에서 검증해야 한다.
- 종료 시 [인수인계 양식](docs/wayfinder/handoffs/TEMPLATE.md)에 결과·근거·미검증 항목을 기록한다.
- 티켓·STATUS·지도는 함께 갱신한다. 미승인·미검증 작업을 완료 처리하지 않는다.
- 인수인계에는 결과·승인 사항·산출물 링크·검증·다음 작업을 채운다. 빈 양식은 완료 근거가 아니다.
- 요청 범위의 변경만 커밋한다. 사용자의 상시 지시에 따라 검증 후 `main`에 직접 커밋·push하고 성공 여부를 보고한다.
  PR 생성·PR 승인 요청을 기본 절차로 사용하지 않는다. 자동 merge, 강제 push, 사용자 변경 폐기는 하지 않는다.
  원격이 앞서 있으면 최신 변경을 확인·통합하고 다시 검증한 뒤 일반 push한다.

## Agent skills

- 이슈 트래커: [로컬 Markdown 티켓 규칙](docs/agents/issue-tracker.md).
- 도메인 문서: [용어와 설계의 구분](docs/agents/domain.md).
- 프로젝트 운영: [하네스 안내](docs/harness/README.md), [새 세션 절차](docs/harness/session.md).

## Code Review Rules

- renderer에서 임의 파일·DB·Node.js 접근을 노출하거나 검증 없는 IPC를 추가하는지 확인한다.
- 날짜 계산이 시간대에 따라 달라지거나 하루짜리·월 경계 일정을 누락하는지 확인한다.
- 저장 실패를 성공으로 표시하거나 프로젝트 삭제 시 하위 일정이 부분 삭제되는지 확인한다.
- 사용자 요구사항과 다른 범위 확대, 증거 없는 완료 선언을 지적한다.
