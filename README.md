# Simple Timeline

오프라인 Windows 프로젝트 일정 관리 프로그램. Electron + React + SQLite.

현재 상태: 스테이지 7 완료. 사용자 기본 설치 인수 범위의 MVP를 마무리했다.
[승인 계획](docs/superpowers/plans/2026-11-03-simple-timeline-implementation.md),
[스테이지 7 인수인계](docs/wayfinder/handoffs/07-windows-release.md), [실행 기록](docs/implementation/stage-07.md)을 확인한다.
Electron·SQLite CRUD와 간트·달력, Windows x64 NSIS 빌드가 있다.
설치본·정확한 소스·해시·실행 결과는 [Windows 검증 기록](docs/release/windows-validation.md),
설치 방법은 [사용 안내](docs/release/user-guide.md)를 따른다. [HTML 목업](docs/design/mockups/stage-03.html)은 설계 자료다.
사용자는 설치본 해시·설치/실행·업데이트·제거/재설치의 데이터 보존을 확인했다.
상세 개선·오류 검증은 별도로 진행하며 미실행 항목을 통과로 표시하지 않았다.
[사용자 결과와 후속 범위](docs/release/user-acceptance.md)를 확인한다.

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
Windows 11의 상세 후속 검증에는 [실기 기록 양식](docs/release/manual-checklist.md)을 사용할 수 있다.

## 새 채팅에서 시작하기

1. 이 저장소의 최신 `main`을 가져온다. 검증 후 PR 없이 `main`에 직접 커밋·push한다.
2. [Codex 안내](AGENTS.md), [진행 상태](docs/wayfinder/STATUS.md), [진행 지도](docs/wayfinder/MAP.md)를 읽는다.
3. 현재 MVP 지도는 완료됐다. 새 개선·오류 요청은 별도 범위를 정하며 기존 스테이지를 자동 재개하지 않는다.

상세 개선·오류 후속 작업 시작 문구:

~~~text
저장소: https://github.com/kdydesign/simple-timeline
Superpowers와 Wayfinder로 MVP 이후의 상세 개선·오류 작업을 진행해줘.
최신 main의 AGENTS.md와 docs/wayfinder/handoffs/07-windows-release.md,
docs/release/user-acceptance.md, docs/release/windows-validation.md를 확인해줘.
node scripts/harness/run.mjs context에 활성 스테이지가 없으면 현재 지도 완료 상태야.
기본 설치 인수는 완료됐고 상세 개선·오류 검증은 별도 진행하기로 했어.
기존 승인 사항은 다시 묻지 말고 이번에 전달할 개선점/오류의 범위와 재현부터 정리해줘.
요청 범위만 작업하고 검증 후 PR 없이 main에 직접 커밋·push해줘.
~~~

새 채팅이 이전 채팅의 대화나 작업 폴더를 기억한다고 가정하지 않는다.
GitHub에 반영된 커밋과 문서가 다음 채팅의 기준이다.
