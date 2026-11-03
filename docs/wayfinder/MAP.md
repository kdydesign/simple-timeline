# Simple Timeline — 스테이지 지도

id: simple-timeline-mvp
labels: wayfinder:map
status: open

## Destination

오프라인 Windows 설치형 일정 관리 MVP에 필요한 결정을 순서대로 확정하고,
승인된 계획을 구현·검증하여 실제 Windows 설치본까지 인수인계한다.

## Notes

- 사용자 요청: Electron + React + SQLite, 스테이지마다 새로운 채팅을 사용한다.
- 스테이지 0은 설계 초안·지도와 Codex 작업 하네스를 구성한다. 제품 구현은 후속 단계에서 진행한다.
- Superpowers로 설계·계획·구현·검증을 진행하고 Wayfinder로 결정과 인수인계를 관리한다.
- 설계 단계는 사용자와 결정한다. 에이전트가 사용자 답을 대신하거나 미결정 사항을 승인으로 취급하지 않는다.
- 스테이지 1~3은 세부 설계, 4는 승인 설계에 따른 구현 계획이다.
- Wayfinder의 기본값은 결정 정리다. 사용자 요청에 맞춘 이 지도의 예외로
  스테이지 5~7에 승인 계획의 구현·검증도 포함한다. 미래 단계의 실행을 지금 시작하지 않는다.
- 한 채팅은 한 스테이지만 진행한다. 한 스테이지가 커지면 완료한 척하지 말고 하위 단계로 재분할한다.
- 같은 스테이지의 여러 세부 결정을 하나의 티켓 안에서 논의한다. 별도 티켓을 한 채팅에서 연속 해결하지 않는다.
- 이슈 트래커는 Wayfinder 기본 대안인 저장소 내 Markdown을 사용한다.
  운영 규칙은 `../agents/issue-tracker.md`, 진행 인덱스는 `STATUS.md`를 참조한다.
- 공식 자료 조사가 필요한 지점은 해당 단계에서 research 티켓으로 분리할 수 있다.
  현재는 외부 조사를 완료한 것으로 표시하지 않는다.
- 검증에 관한 보고는 실행한 환경·명령·결과를 근거로 한다.

## Decisions so far

- [스테이지 1 — 도메인·날짜 규칙 설계](stages/01-domain.md): 업무 날짜·입력 정리·기본 정렬·선택 연월 규칙과 경계 사례를 사용자 승인으로 확정했다.

- [스테이지 2 — Electron·SQLite 구조 설계](stages/02-architecture.md): 프로세스·IPC·SQLite 수명주기와 실패 시 보존 정책을 승인했으며 수동 백업·복원은 MVP에서 제외했다.

- [스테이지 3 — 화면·간트·달력 설계](stages/03-experience.md): 오른쪽 편집 패널·간트 탐색·월요일 달력·3줄과 더 보기·경계 계산을 목업과 문서로 확정했다.

- [스테이지 4 — 구현 계획 확정](stages/04-implementation-plan.md): 파일·인터페이스·검증 명령과 9개 작업을 승인했으며, 후속 5~7단계의 실행 범위를 연결했다.

- [스테이지 5 — 기본 앱·저장·CRUD 구현](stages/05-foundation-crud.md): 실제 Electron·SQLite CRUD·보존·오류 처리를 구현하고 독립 검토 수정과 두 OS 앱 CI를 통과했다.

- [스테이지 6 — 간트·달력 구현](stages/06-visualizations.md): 전체 범위 가상 간트·월간 달력·날짜 전체 목록을 CRUD와 통합하고 독립 검토 수정·극단 연도/1만 개 일정·두 OS 앱 CI를 검증했다.

지도 이전에 사용자가 선택한 요구사항·기술은
[전체 설계 기준](../superpowers/specs/2026-11-03-simple-timeline-design.md)에 기록한다.

## Not yet specified

- 날짜 범위와 일정 개수를 줄이는 제약은 추가하지 않았다. 1만 개 fixture의 관측은
  [스테이지 6 실행 기록](../implementation/stage-06.md)에 있다. 실제 사용자 Windows 성능이나 임의 규모의 보장은 없으며,
  제약 변경이 필요하면 사용자와 별도로 결정한다.

## Out of scope

MVP 수동 백업·복원·데이터 이동(사용자 선택; 재검토는 별도 범위 결정),
Teams 앱 구현, Microsoft 계정 연동, 사용자 간 공유, PC 간 동기화, 모바일,
작업 계층, 진행률, 의존성, 드래그 편집, 알림·자동화·외부 이슈 연동.
Teams는 Windows MVP 이후 별도 지도에서 앱 호스팅·데이터 연결·조직 정책을 설계한다.
