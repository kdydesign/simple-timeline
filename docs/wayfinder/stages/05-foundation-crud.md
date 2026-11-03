# 스테이지 5 — 기본 앱·저장·CRUD 구현

id: 05-foundation-crud
parent: ../MAP.md
labels: wayfinder:task
status: closed
assignee: codex-2026-11-03-stage-05
blocked_by: 04-implementation-plan

## Question

승인된 계약으로 앱을 실행하고 프로젝트·일정을 안전하게 저장·수정할 수 있는가?

## 선행 조건

직전 스테이지 완료·사용자 승인·인수인계 커밋이 필요하다.
승인된 구현 계획과 이번 채팅의 구현 요청을 확인하고 착수한다. Wayfinder 지도 Notes의 실행 예외를 따른다.

## 논의 또는 수행 범위

- 순수 도메인·공유 계약·검증 기반, Electron + React 구성과 main/preload/renderer 분리
- SQLite 초기화·마이그레이션·프로젝트/일정 저장소와 IPC 연결
- 프로젝트와 일정 입력·수정·삭제·목록, 삭제 확인과 입력 검증
- 저장 실패·재실행 보존·DB 원본 보존·실제 Electron ABI 검증; 운영 DB 대신 임시 테스트 DB 사용
- 시각화 전의 검증용 목록으로 CRUD를 확인하되 영구 목록 모드를 추가하지 않음

## 구현 계획 연결

[스테이지 4 구현 계획](../../superpowers/plans/2026-11-03-simple-timeline-implementation.md)의 **Task 1~5**가 이 단계 범위다.
계획은 스테이지 4에서 사용자 전체 승인을 받았다. 이번 채팅의 해당 단계 실행 요청을 확인한 뒤 착수한다.
계획의 파일·인터페이스·검증 명령·종료 경계를 따른다.
Task 1~5의 앱 명령·테스트·CI를 구현하고 실제 실행했다. 설치본과 시각화 검증은 포함하지 않는다.

## 산출물

- 승인 계획에 따른 앱 코드·테스트·실행 안내
- 실행 명령과 실제 검증 결과

## 완료 기준

- 프로젝트·일정 CRUD가 UI→IPC→SQLite 경로로 동작한다.
- 프로젝트 삭제의 연쇄 삭제와 실패 처리를 실제 DB로 검증한다.
- 현재 환경에서 확인한 것과 Windows에서 아직 확인하지 못한 것을 나눠 기록한다.
- docs/wayfinder/handoffs/05-foundation-crud.md에 인수인계를 작성한다.
- STATUS.md와 이 문서의 상태를 갱신하고 GitHub에서 확인 가능한 커밋을 남긴다.

## 해결 기록

2026-11-03 사용자의 스테이지 5 실행 요청에 따라 Task 1~5를 구현했다.
순수 도메인·실제 SQLite CRUD/보존·안전한 IPC·React 편집/오류 처리를 연결하고,
독립 검토 중요 문제 5개의 회귀를 RED→GREEN으로 수정했다.
로컬 앱 전체 검증과 Ubuntu·Windows Application CI가 통과했다.
[실행 기록](../../implementation/stage-05.md)과 [인수인계](../handoffs/05-foundation-crud.md)에
근거·검증 한계·남은 작은 항목·다음 작업을 기록했다.
간트·달력·Windows 설치 파일은 만들지 않았다. 최종 문서 검증 후 main 직접 commit·push로 마무리한다.

## 다음 채팅

```text
저장소: https://github.com/kdydesign/simple-timeline
Superpowers와 Wayfinder로 스테이지 6만 진행해줘.
최신 main의 AGENTS.md를 읽고 node scripts/harness/run.mjs context 06-visualizations
결과의 문서와 docs/wayfinder/handoffs/05-foundation-crud.md,
docs/implementation/stage-05.md,
docs/superpowers/plans/2026-11-03-simple-timeline-implementation.md,
docs/design/domain-rules.md, docs/design/architecture.md, docs/design/storage.md,
docs/design/experience.md, docs/design/visualization.md를 확인해줘.
기존 승인 사항은 다시 묻지 말고 Task 1~5의 실제 코드를 이어서 Task 6~8만 구현해줘.
운영 DB 대신 임시 테스트 프로필을 쓰고 실제 앱·CI로 두 모드와 CRUD 통합을 검증해줘.
목업을 제품으로 재사용하지 말고 스테이지 7에는 착수하지 마.
완료하면 검증 후 PR 없이 main에 직접 커밋·push하고,
다음 채팅용 인수인계와 최종 커밋을 알려줘.
```
