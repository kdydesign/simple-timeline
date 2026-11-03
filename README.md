# Simple Timeline

오프라인 Windows 프로젝트 일정 관리 프로그램. Electron + React + SQLite.

현재 상태: 스테이지 4 구현 계획 승인 완료. 다음은 스테이지 5 기본 앱·저장·CRUD 구현이다.
[승인 계획](docs/superpowers/plans/2026-11-03-simple-timeline-implementation.md)과
[스테이지 4 인수인계](docs/wayfinder/handoffs/04-implementation-plan.md)를 확인한다.
앱 코드·의존성·설치 파일은 아직 없다. [HTML 목업](docs/design/mockups/stage-03.html)은 설계 자료다.

## Codex 프로젝트 시작

이 저장소 루트를 Codex 작업 디렉터리로 연다. [AGENTS.md](AGENTS.md)가 작업 진입점이다.
프로젝트의 운영·검증 설정은 [하네스 안내](docs/harness/README.md)를 참조한다.

필요 도구는 Node.js 24 LTS와 Git이다. 현재 npm 패키지 설치는 필요 없다.

```sh
node scripts/harness/run.mjs context
node scripts/harness/run.mjs verify
```

앱 테스트·빌드·실행 명령은 승인 계획에 따라 스테이지 5부터 추가한다. 계획 문서의 앱 명령은 아직 실행 가능한 명령이 아니다.
GitHub Actions의 Repository harness가 Ubuntu·Windows에서 동일한 하네스 검사를 실행한다.
실패한 검사까지 포함한 보고서와 로그는 `artifacts/harness/`에 저장하며 CI 실행에도 첨부한다.

## 새 채팅에서 시작하기

1. 이 저장소의 최신 `main`을 가져온다. 검증 후 PR 없이 `main`에 직접 커밋·push한다.
2. [Codex 안내](AGENTS.md), [진행 상태](docs/wayfinder/STATUS.md), [진행 지도](docs/wayfinder/MAP.md)를 읽는다.
3. 해당 스테이지 문서와 직전 인수인계 문서를 읽고 한 스테이지만 진행한다.

스테이지 5 시작 문구:

```text
저장소: https://github.com/kdydesign/simple-timeline
Superpowers와 Wayfinder로 스테이지 5만 진행해줘.
최신 main의 AGENTS.md를 읽고 node scripts/harness/run.mjs context 05-foundation-crud
결과의 문서와 docs/wayfinder/handoffs/04-implementation-plan.md,
docs/superpowers/plans/2026-11-03-simple-timeline-implementation.md,
docs/design/domain-rules.md, docs/design/architecture.md, docs/design/storage.md,
docs/design/experience.md, docs/design/visualization.md를 확인해줘.
기존 승인 사항은 다시 묻지 말고 승인 계획의 Task 1~5만 구현해줘.
운영 DB 대신 임시 테스트 프로필로 실제 Electron·SQLite 경로를 검증하고,
앱 명령과 CI를 함께 추가해줘. 목업 코드는 제품으로 재사용하지 마.
스테이지 6~7에는 착수하지 말고, 미실행 검증을 통과로 표시하지 마.
완료하면 검증 후 PR 없이 main에 직접 커밋·push하고,
다음 채팅용 인수인계와 최종 커밋을 알려줘.
```

새 채팅이 이전 채팅의 대화나 작업 폴더를 기억한다고 가정하지 않는다.
GitHub에 반영된 커밋과 문서가 다음 채팅의 기준이다.
