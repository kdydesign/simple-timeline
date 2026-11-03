# Simple Timeline

오프라인 Windows 프로젝트 일정 관리 프로그램. Electron + React + SQLite.

현재 상태: Codex 하네스와 스테이지별 설계 경로를 구성한 상태. 앱 코드와 설치 파일은 아직 없다.

## Codex 프로젝트 시작

이 저장소 루트를 Codex 작업 디렉터리로 연다. [AGENTS.md](AGENTS.md)가 작업 진입점이다.
프로젝트의 운영·검증 설정은 [하네스 안내](docs/harness/README.md)를 참조한다.

필요 도구는 Node.js 24 LTS와 Git이다. 현재 npm 패키지 설치는 필요 없다.

```sh
node scripts/harness/run.mjs context
node scripts/harness/run.mjs verify
```

앱 테스트·빌드·실행 명령은 스테이지 4~5에서 추가한다.
GitHub Actions의 Repository harness가 Ubuntu·Windows에서 동일한 하네스 검사를 실행한다.
실패한 검사까지 포함한 보고서와 로그는 `artifacts/harness/`에 저장하며 CI 실행에도 첨부한다.

## 새 채팅에서 시작하기

1. 이 저장소의 최신 `main`을 가져온다.
2. [Codex 안내](AGENTS.md), [진행 상태](docs/wayfinder/STATUS.md), [진행 지도](docs/wayfinder/MAP.md)를 읽는다.
3. 해당 스테이지 문서와 직전 인수인계 문서를 읽고 한 스테이지만 진행한다.

스테이지 1 시작 문구:

```text
https://github.com/kdydesign/simple-timeline
Superpowers와 Wayfinder를 사용해 스테이지 1을 진행해줘.
먼저 AGENTS.md, README.md, docs/wayfinder/MAP.md, docs/wayfinder/STATUS.md,
docs/superpowers/specs/2026-11-03-simple-timeline-design.md,
docs/wayfinder/stages/01-domain.md를 읽어줘.
현재 단계는 도메인·날짜 규칙 설계이며 앱 구현은 시작하지 마.
확정된 내용은 다시 묻지 말고, 미결정 사항을 나와 확정한 뒤
결과와 다음 채팅용 인수인계를 저장소에 남겨줘.
```

새 채팅이 이전 채팅의 대화나 작업 폴더를 기억한다고 가정하지 않는다.
GitHub에 반영된 커밋과 문서가 다음 채팅의 기준이다.
