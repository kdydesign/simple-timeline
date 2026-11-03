# Simple Timeline

오프라인 Windows 프로젝트 일정 관리 프로그램. Electron + React + SQLite.

현재 상태: 스테이지 1 도메인·날짜 규칙 설계 승인 완료. 다음은 스테이지 2 구조 설계다. 앱 코드와 설치 파일은 아직 없다.
[스테이지 1 인수인계](docs/wayfinder/handoffs/01-domain.md)와 [PR](https://github.com/kdydesign/simple-timeline/pull/1)을 확인한다.

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

1. 이 저장소의 최신 `main`을 가져온다. 스테이지 1 PR이 미병합이면 `docs/stage-01-domain` 브랜치에서 시작한다.
2. [Codex 안내](AGENTS.md), [진행 상태](docs/wayfinder/STATUS.md), [진행 지도](docs/wayfinder/MAP.md)를 읽는다.
3. 해당 스테이지 문서와 직전 인수인계 문서를 읽고 한 스테이지만 진행한다.

스테이지 2 시작 문구:

```text
저장소: https://github.com/kdydesign/simple-timeline
Superpowers와 Wayfinder로 스테이지 2만 진행해줘.
PR https://github.com/kdydesign/simple-timeline/pull/1 이 병합됐으면 최신 main에서,
아직 미병합이면 docs/stage-01-domain 브랜치에서 시작해줘. 자동 병합하지 마.
AGENTS.md를 읽고 node scripts/harness/run.mjs context 02-architecture 결과의 문서와
직전 인수인계 docs/wayfinder/handoffs/01-domain.md,
확정 설계 docs/design/domain-rules.md를 확인해줘.
선행 단계 완료와 승인을 확인하고 확정된 요구사항은 다시 묻지 마.
Electron·SQLite 구조만 나와 설계하고 앱 구현은 시작하지 마.
검증·GitHub 반영·다음 채팅용 인수인계를 남겨줘.
```

새 채팅이 이전 채팅의 대화나 작업 폴더를 기억한다고 가정하지 않는다.
GitHub에 반영된 커밋과 문서가 다음 채팅의 기준이다.
