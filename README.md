# Simple Timeline

오프라인 Windows 프로젝트 일정 관리 프로그램. Electron + React + SQLite.

현재 상태: 스테이지 7 Windows 설치·오프라인 검증 진행 중. Windows 11 실기 확인이 남아 있다.
[승인 계획](docs/superpowers/plans/2026-11-03-simple-timeline-implementation.md),
[스테이지 7 인수인계](docs/wayfinder/handoffs/07-windows-release.md), [실행 기록](docs/implementation/stage-07.md)을 확인한다.
Electron·SQLite CRUD와 간트·달력, Windows x64 NSIS 빌드가 있다.
설치본·정확한 소스·해시·실행 결과는 [Windows 검증 기록](docs/release/windows-validation.md),
설치 방법은 [사용 안내](docs/release/user-guide.md)를 따른다. [HTML 목업](docs/design/mockups/stage-03.html)은 설계 자료다.

## Codex 프로젝트 시작

이 저장소 루트를 Codex 작업 디렉터리로 연다. [AGENTS.md](AGENTS.md)가 작업 진입점이다.
프로젝트의 운영·검증 설정은 [하네스 안내](docs/harness/README.md)를 참조한다.

하네스만 실행하려면 Node.js 24 이상과 Git이 필요하다. 앱 개발은 `.node-version`의 Node 24.22.1과 npm을 사용한다.

```sh
node scripts/harness/run.mjs context
node scripts/harness/run.mjs verify
```

하네스는 npm 설치 없이 실행되며, GitHub Actions의 Repository harness가 Ubuntu·Windows에서 검사한다.
앱은 별도 Application workflow에서 아래와 같은 명령으로 검증한다.

## 앱 개발·검증

```sh
npm ci
npm run dev
```

설치는 Electron 바이너리와 네이티브 모듈을 다운로드/재빌드하므로 네트워크가 필요하다.
완성 앱의 오프라인 실행 요구와 개발 도구 설치는 구분한다. prebuilt를 사용할 수 없으면 대상 플랫폼의 C++ 빌드 도구가 필요하다.
기본 저장 위치는 사용자 앱 데이터의 `SimpleTimeline/data/timeline.sqlite3`이며, 일반 실행은 이 경로를 사용한다.
자동 초기화·수동 백업/복원 기능은 없다.

```sh
npm run verify:app
npm run build
```

Linux headless는 GUI 라이브러리·Xvfb를 준비하고 `xvfb-run -a npm run verify:app`로 실행한다.
앱 검증은 타입 검사 → release 검사 → 3개 TZ의 unit → UI → build → 실제 Electron native DB → E2E 순서다.
테스트는 매번 임시 DB·Chromium 프로필을 만들며 운영 DB를 사용하지 않는다. sandbox를 끄지 않는다.
`artifacts/app/latest.json`, `artifacts/native/`, `artifacts/e2e/`에서 결과·로그를 확인한다.
빌드 산출물은 `out/`이다. 간트는 전체 일정 범위를 일당 28px로 조회하고 월간 달력은 3줄과 날짜별 전체 목록을 제공한다.
가로 손잡이는 좌우 하루·PageUp/Down 화면 폭·Home/End 처음/끝 이동을 지원한다.
간트 이름 버튼과 날짜 전체 목록에서는 위아래 키로 화면 밖 항목에도 접근한다.
10000개 fixture의 지연·프로세스 CPU/메모리와 화면 이미지는 E2E artifact에 남는다. 성능 SLA는 아니다.

Windows x64의 clean checkout에서 `npm run dist:win`으로 서명 없는 사용자별 설치본을 만든다.
이전 `release/` 출력물이 있으면 보존·이동한 뒤 실행한다. 소스 SHA 귀속을 위해 dirty checkout은 거부한다.
`npm run dist:win:test-update`는 가상 다음 버전의 검증 전용 파일이며 일반 배포본이 아니다.
`npm run test:packaged`는 방화벽과 실제 AppData를 쓰므로 기존 프로필이 없는 일회성 GitHub-hosted Windows VM에서만 실행한다.
Windows 11 일반 PC 검증은 [실기 기록 양식](docs/release/manual-checklist.md)을 따른다.

## 새 채팅에서 시작하기

1. 이 저장소의 최신 `main`을 가져온다. 검증 후 PR 없이 `main`에 직접 커밋·push한다.
2. [Codex 안내](AGENTS.md), [진행 상태](docs/wayfinder/STATUS.md), [진행 지도](docs/wayfinder/MAP.md)를 읽는다.
3. 해당 스테이지 문서와 직전 인수인계 문서를 읽고 한 스테이지만 진행한다.

스테이지 7 재개 문구:

~~~text
저장소: https://github.com/kdydesign/simple-timeline
Superpowers와 Wayfinder로 스테이지 7의 남은 Windows 11 실기 검증을 이어가줘.
최신 main의 AGENTS.md를 읽고 node scripts/harness/run.mjs context 07-windows-release
결과의 문서와 docs/wayfinder/handoffs/07-windows-release.md,
docs/release/windows-validation.md, docs/release/manual-checklist.md,
docs/implementation/stage-07.md를 확인해줘.
Windows 11 x64·사용자별 설치·제거 후 DB 보존·서명 없는 비공개 CI 정책은 확정됐으니 다시 묻지 마.
Task 1~8을 다시 만들지 말고 전달한 설치 파일의 소스 SHA·SHA256과 실제 사용자 결과를 대조해줘.
실행할 수 없는 검증은 완료로 추정하지 말고 필요한 사용자 확인과 결과를 기록해줘.
완료하면 검증 후 PR 없이 main에 직접 커밋·push하고 최종 결과·인수인계·커밋을 알려줘.
~~~

새 채팅이 이전 채팅의 대화나 작업 폴더를 기억한다고 가정하지 않는다.
GitHub에 반영된 커밋과 문서가 다음 채팅의 기준이다.
