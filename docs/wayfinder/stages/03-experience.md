# 스테이지 3 — 화면·간트·달력 설계

id: 03-experience
parent: ../MAP.md
labels: wayfinder:grilling
status: open
assignee: null
blocked_by: 02-architecture

## Question

같은 데이터를 보여주는 두 모드의 화면·탐색·기간 배치 규칙을 확정한다.

## 선행 조건

직전 스테이지 완료·사용자 승인·인수인계 커밋이 필요하다.
설계 단계다. 앱 스캐폴딩·의존성 설치·제품 코드 작성은 하지 않는다.

## 논의 또는 수행 범위

- 데스크톱 화면 구조, 프로젝트·일정 생성/수정/삭제 진입점과 폼
- 간트의 월·일 눈금, 일 단위 좌표 계산, 그룹/일정 행, 일일 일정 클릭 영역
- 긴 기간의 가로 스크롤과 초기 위치, 빈 프로젝트, 연월 탐색 동작
- 월간 달력의 주 시작일·인접 월 날짜·주 경계 구간 분할·겹친 일정 배치
- 두 모드의 연월·색상·수정 반영, 키보드 조작, 저장 중·실패·빈 상태

## 산출물

- docs/design/experience.md: 화면과 상호작용 명세
- docs/design/visualization.md: 좌표·기간 구간·경계 사례

## 완료 기준

- 개발→QA→배포 흐름을 두 모드에서 설명할 수 있다.
- 주/월/연도 경계와 같은 날짜의 여러 일정도 접근 가능하다.
- 필요하면 사용자의 동의를 받아 버리는 목업을 만들고 본 구현과 구분한다.
- 화면 설계와 두 모드의 규칙을 사용자가 승인한다.
- docs/wayfinder/handoffs/03-experience.md에 인수인계를 작성한다.
- STATUS.md와 이 문서의 상태를 갱신하고 GitHub에서 확인 가능한 커밋을 남긴다.

## 해결 기록

아직 해결하지 않음. 완료 시 사용자 승인 내용·결과·근거·산출물 링크를 여기에 기록한다.
결정의 상세는 산출물 한 곳에 두고 여기에는 요약과 링크만 남긴다.

## 다음 채팅

```text
https://github.com/kdydesign/simple-timeline
Superpowers와 Wayfinder로 스테이지 4을 진행해줘.
최신 main에서 README.md, docs/wayfinder/MAP.md, docs/wayfinder/STATUS.md,
docs/superpowers/specs/2026-11-03-simple-timeline-design.md,
docs/wayfinder/handoffs/03-experience.md,
docs/wayfinder/stages/04-implementation-plan.md와 해당 문서의 선행 산출물을 먼저 읽어줘.
선행 단계 완료와 승인을 확인하고 이 스테이지만 진행해줘.
확정한 사항은 다시 묻지 말고, 결과·검증·미결정 사항·다음 채팅 문구를
저장소에 남기고 최신 커밋을 알려줘.
```
