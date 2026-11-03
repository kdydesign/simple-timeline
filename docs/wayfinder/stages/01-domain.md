# 스테이지 1 — 도메인·날짜 규칙 설계

id: 01-domain
parent: ../MAP.md
labels: wayfinder:grilling
status: closed
assignee: codex-stage-01-domain-2026-11-03
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

사용자는 2026-11-03 다섯 추천안을 선택했고 문서 확인 요청에 ‘구현 진행해’라고 답해 설계를 승인했다.
[도메인·날짜 규칙](../../design/domain-rules.md)에 규칙·사례·승인 근거를 기록했다.
설계 검토에서 중요한 추가 질문은 없었고 저장소 하네스 검사를 통과했다.
설계 커밋 `23af2c427d65905896433649bd91266f8c3a8363`은 GitHub 작업 브랜치에 반영됐다.
[스테이지 1 인수인계](../handoffs/01-domain.md),
[GitHub PR](https://github.com/kdydesign/simple-timeline/pull/1)을 참조한다.
제품 구현과 자동 병합은 수행하지 않는다. 최종 커밋과 CI 결과는 종료 메시지로 전달한다.

## 다음 채팅

```text
저장소: https://github.com/kdydesign/simple-timeline
Superpowers와 Wayfinder로 스테이지 2만 진행해줘.
최신 main에서 시작하고, 검증 후 PR 없이 main에 직접 커밋·push해줘.
AGENTS.md를 읽고 node scripts/harness/run.mjs context 02-architecture 결과의 문서와
직전 인수인계 docs/wayfinder/handoffs/01-domain.md,
확정 설계 docs/design/domain-rules.md를 확인해줘.
선행 단계 완료와 승인을 확인하고 확정된 요구사항은 다시 묻지 마.
Electron·SQLite 구조만 나와 설계하고 앱 구현은 시작하지 마.
검증·GitHub 반영·다음 채팅용 인수인계를 남겨줘.
```
