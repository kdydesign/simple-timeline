# 스테이지 3 — 화면·간트·달력 설계

id: 03-experience
parent: ../MAP.md
labels: wayfinder:grilling
status: closed
assignee: codex-2026-11-03-stage-03
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

2026-11-03 사용자가 화면 구성·월요일 시작·3줄 더 보기와 탐색·월 경계·편집 동작을 선택했다.
목업 확인과 builder check 후 ‘설계 승인, 스테이지 3 마무리’로 문서 전체를 승인했다.
[화면·상호작용](../../design/experience.md), [간트·달력 계약](../../design/visualization.md),
[설계용 목업](../../design/mockups/stage-03.html)을 작성했다.
검증·한계·다음 작업은 [인수인계](../handoffs/03-experience.md)를 따른다.
제품 구현·스테이지 4 이후는 시작하지 않았다. 최종 검증 후 main 직접 commit·push한다.

## 다음 채팅

```text
저장소: https://github.com/kdydesign/simple-timeline
Superpowers와 Wayfinder로 스테이지 4만 진행해줘.
최신 main의 AGENTS.md를 읽고 node scripts/harness/run.mjs context 04-implementation-plan
결과의 문서와 docs/wayfinder/handoffs/03-experience.md,
docs/design/domain-rules.md, docs/design/architecture.md, docs/design/storage.md,
docs/design/experience.md, docs/design/visualization.md를 확인해줘.
승인된 요구사항·도메인·저장·화면 설계는 다시 묻지 마.
승인 설계를 파일·작업·검증 명령 수준의 구현 계획으로 나와 확정하고 앱 구현은 시작하지 마.
목업은 설계 자료이며 제품 코드로 재사용하지 마.
완료하면 검증 후 PR 없이 main에 직접 커밋·push하고,
다음 채팅용 인수인계와 최종 커밋을 알려줘.
```
