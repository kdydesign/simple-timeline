# 스테이지 6 — 간트·달력 구현

id: 06-visualizations
parent: ../MAP.md
labels: wayfinder:task
status: in_progress
assignee: codex-stage06
blocked_by: 05-foundation-crud

## Question

동일한 저장 데이터를 두 모드에서 정확하게 시각화하고 수정 결과를 반영하는가?

## 선행 조건

직전 스테이지 완료·사용자 승인·인수인계 커밋이 필요하다.
승인된 구현 계획과 이번 채팅의 구현 요청을 확인하고 착수한다. Wayfinder 지도 Notes의 실행 예외를 따른다.

## 논의 또는 수행 범위

- 순수 날짜 계산·전체 월 범위·간트 막대 위치·스크롤
- 월간 달력·여러 주/월에 걸친 기간 분할·겹친 일정 표시
- 모드 전환·연월 유지·일정 클릭 편집·수정 결과 동기화
- 빈 상태·일일 일정·윤년·연도 경계·긴 기간·다수 일정 검증
- viewport rebasing·키보드/포커스·날짜별 전체 더 보기·실패 경로의 실제 두 모드 통합

## 구현 계획 연결

[스테이지 4 구현 계획](../../superpowers/plans/2026-11-03-simple-timeline-implementation.md)의 **Task 6~8**가 이 단계 범위다.
계획은 스테이지 4에서 사용자 전체 승인을 받았다. 이번 채팅의 해당 단계 실행 요청을 확인한 뒤 착수한다.
계획의 파일·인터페이스·검증 명령·종료 경계를 따른다.
기반 앱 명령은 존재한다. 이 단계의 시각화 컴포넌트와 테스트는 아직 구현하지 않았다.

## 산출물

- 간트·달력 컴포넌트와 날짜 계산 코드
- 날짜 경계 테스트와 CRUD를 포함하는 통합 검증 결과

## 완료 기준

- 전체 설계의 핫픽스 예시를 두 모드에서 재현한다.
- 프로젝트 색상·일정명·기간이 두 모드에서 일치한다.
- 수정·삭제·재조회 결과가 두 모드에 반영된다.
- docs/wayfinder/handoffs/06-visualizations.md에 인수인계를 작성한다.
- STATUS.md와 이 문서의 상태를 갱신하고 GitHub에서 확인 가능한 커밋을 남긴다.

## 해결 기록

아직 해결하지 않음. 완료 시 사용자 승인 내용·결과·근거·산출물 링크를 여기에 기록한다.
결정의 상세는 산출물 한 곳에 두고 여기에는 요약과 링크만 남긴다.

## 다음 채팅

```text
https://github.com/kdydesign/simple-timeline
Superpowers와 Wayfinder로 스테이지 7을 진행해줘.
최신 main에서 README.md, docs/wayfinder/MAP.md, docs/wayfinder/STATUS.md,
docs/superpowers/specs/2026-11-03-simple-timeline-design.md,
docs/wayfinder/handoffs/06-visualizations.md,
docs/wayfinder/stages/07-windows-release.md와 해당 문서의 선행 산출물을 먼저 읽어줘.
선행 단계 완료와 승인을 확인하고 이 스테이지만 진행해줘.
확정한 사항은 다시 묻지 말고, 결과·검증·미결정 사항·다음 채팅 문구를
저장소에 남기고 최신 커밋을 알려줘.
```
