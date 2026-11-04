# Simple Timeline

오프라인 Windows 프로젝트 일정 관리 프로그램. Electron + React + SQLite로 프로젝트·일정을 저장하고 간트·월간 달력으로 조회한다.

스테이지 1~7은 완료됐다. 사용자는 기본 설치·실행·업데이트·제거/재설치와 데이터 보존을 확인했으며,
상세 개선·오류 검증은 별도 후속 요청으로 분리했다. [사용자 인수 기록](docs/release/user-acceptance.md)의 범위와 한계를 따른다.

## 설치·사용

Windows 11 x64용 서명 없는 사용자별 NSIS 설치본을 비공개 GitHub Actions 산출물로 제공한다.
설치 방법은 [사용 안내](docs/release/user-guide.md), 정확한 다운로드·소스 SHA·해시는
[Windows 검증 기록](docs/release/windows-validation.md)을 확인한다.
검증용 0.1.1은 같은 소스의 업데이트 확인 fixture이며 새 기능 배포본이 아니다.
업데이트·제거 후에도 DB를 보존한다. 자동 업데이트·수동 백업/복원 기능은 없다.

## 개발 시작

저장소 루트에서 [.node-version](.node-version)의 Node 24.22.1과 npm을 사용한다.

```sh
npm ci
npm run dev
```

의존성 설치는 Electron·native 모듈 다운로드/준비 때문에 네트워크가 필요하며,
prebuilt가 없으면 대상 플랫폼의 C++ 빌드 도구가 필요하다. 제품의 오프라인 실행 요구와 구분한다.
일반 개발 실행도 사용자 앱 데이터의 `SimpleTimeline/data/timeline.sqlite3`를 사용한다.
시험 입력은 [프로필 격리 절차](docs/harness/validation.md)를 따른다.

```sh
npm run verify:app
npm run build
```

Linux headless 검사는 Xvfb를 준비해 `xvfb-run -a npm run verify:app`로 실행한다.
타입·release·3개 시간대 unit·UI·build·실제 Electron SQLite·E2E를 순서대로 검사한다. 제품 빌드 결과는 `out/`이다.
개별 명령·로그·Windows 패키징·실행 조건은 [검증 안내](docs/harness/validation.md)를 기준으로 한다.

## 구조와 문서

main이 SQLite·트랜잭션을 소유하고 제한된 preload API로 React와 연결한다.
날짜·간트·달력 계산은 [domain](src/domain/)과 [visualization](src/visualization/)의 순수 함수에 둔다.
권한·오류 계약은 [구조 설계](docs/design/architecture.md), 데이터 보존은 [저장 설계](docs/design/storage.md),
화면 탐색은 [화면 설계](docs/design/experience.md)를 따른다. [HTML 목업](docs/design/mockups/stage-03.html)은 과거 설계 자료다.
전체 문서와 실제 코드의 탐색 경로는 [문서 기준](docs/agents/domain.md)에 있다.

Codex 작업은 [AGENTS.md](AGENTS.md)에서 시작한다. Node 24 이상과 Git만으로 다음 하네스를 실행할 수 있다.

```sh
node scripts/harness/run.mjs context
node scripts/harness/run.mjs verify
```

완료된 지도의 context는 `selected: null`, `frontier: []`를 반환한다.
새 개선·오류 요청은 [세션 절차](docs/harness/session.md)에 따라 진행하며 기존 단계를 자동 재개하지 않는다.
[최종 인수인계](docs/wayfinder/handoffs/07-windows-release.md)는 MVP 종료 근거,
[하네스 재점검](docs/harness/review.md)은 현재 문서·운영 절차의 점검 기록이다.
