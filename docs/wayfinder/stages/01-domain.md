# 스테이지 1 — 도메인·날짜 규칙 설계

id: 01-domain
parent: ../MAP.md
labels: wayfinder:grilling
status: open
assignee: null
blocked_by: none

## Question

프로젝트·일정·참여자의 의미와 날짜 처리 규칙을 실제 사례로 확정한다.

## 선행 조건

전체 설계 기준을 읽고 사용자 확정사항과 제안을 구분한다.
설계 단계다. 앱 스캐폴딩·의존성 설치·제품 코드 작성은 하지 않는다.

## 논의 또는 수행 범위

- 종료일을 포함하는 기간 계산, 시작일 이후 종료일 검증, 실제 달력 날짜 검증
- 필수값 공백·이름 중복·참여자 이름 목록의 처리
- 일정 없는 프로젝트·전체 일정 없음·단일 일정·윤년·연도 경계
- 프로젝트·일정 기본 정렬, 간트 전체 범위와 선택 연월의 의미

## 산출물

- docs/design/domain-rules.md: 사용자와 확정한 규칙 및 사례 표
- 필요한 경우 CONTEXT.md 용어 갱신

## 완료 기준

- 2026-11-01~12-22이면 간트가 11월·12월을 포함한다.
- 같은 날짜·역전 기간·윤년·빈 데이터에 대한 기대 결과를 명시한다.
- 업무 규칙에 대해 사용자의 승인을 기록한다.
- docs/wayfinder/handoffs/01-domain.md에 인수인계를 작성한다.
- STATUS.md와 이 문서의 상태를 갱신하고 GitHub에서 확인 가능한 커밋을 남긴다.

## 해결 기록

아직 해결하지 않음. 완료 시 사용자 승인 내용·결과·근거·산출물 링크를 여기에 기록한다.
결정의 상세는 산출물 한 곳에 두고 여기에는 요약과 링크만 남긴다.

## 다음 채팅

```text
https://github.com/kdydesign/simple-timeline
Superpowers와 Wayfinder로 스테이지 2을 진행해줘.
최신 main에서 README.md, docs/wayfinder/MAP.md, docs/wayfinder/STATUS.md,
docs/superpowers/specs/2026-11-03-simple-timeline-design.md,
docs/wayfinder/handoffs/01-domain.md,
docs/wayfinder/stages/02-architecture.md와 해당 문서의 선행 산출물을 먼저 읽어줘.
선행 단계 완료와 승인을 확인하고 이 스테이지만 진행해줘.
확정한 사항은 다시 묻지 말고, 결과·검증·미결정 사항·다음 채팅 문구를
저장소에 남기고 최신 커밋을 알려줘.
```
