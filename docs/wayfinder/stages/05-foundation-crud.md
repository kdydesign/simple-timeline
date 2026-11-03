# 스테이지 5 — 기본 앱·저장·CRUD 구현

id: 05-foundation-crud
parent: ../MAP.md
labels: wayfinder:task
status: open
assignee: null
blocked_by: 04-implementation-plan

## Question

승인된 계약으로 앱을 실행하고 프로젝트·일정을 안전하게 저장·수정할 수 있는가?

## 선행 조건

직전 스테이지 완료·사용자 승인·인수인계 커밋이 필요하다.
승인된 구현 계획과 이번 채팅의 구현 요청을 확인하고 착수한다. Wayfinder 지도 Notes의 실행 예외를 따른다.

## 논의 또는 수행 범위

- Electron + React 기반 구성, main/preload/renderer 분리
- SQLite 초기화·마이그레이션·프로젝트/일정 저장소와 IPC 연결
- 프로젝트와 일정 입력·수정·삭제·목록, 삭제 확인과 입력 검증
- 저장 실패·재실행 보존 검증; 운영 DB 대신 임시 테스트 DB 사용

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

아직 해결하지 않음. 완료 시 사용자 승인 내용·결과·근거·산출물 링크를 여기에 기록한다.
결정의 상세는 산출물 한 곳에 두고 여기에는 요약과 링크만 남긴다.

## 다음 채팅

```text
https://github.com/kdydesign/simple-timeline
Superpowers와 Wayfinder로 스테이지 6을 진행해줘.
최신 main에서 README.md, docs/wayfinder/MAP.md, docs/wayfinder/STATUS.md,
docs/superpowers/specs/2026-11-03-simple-timeline-design.md,
docs/wayfinder/handoffs/05-foundation-crud.md,
docs/wayfinder/stages/06-visualizations.md와 해당 문서의 선행 산출물을 먼저 읽어줘.
선행 단계 완료와 승인을 확인하고 이 스테이지만 진행해줘.
확정한 사항은 다시 묻지 말고, 결과·검증·미결정 사항·다음 채팅 문구를
저장소에 남기고 최신 커밋을 알려줘.
```
