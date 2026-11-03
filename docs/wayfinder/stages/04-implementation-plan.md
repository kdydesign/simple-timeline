# 스테이지 4 — 구현 계획 확정

id: 04-implementation-plan
parent: ../MAP.md
labels: wayfinder:grilling
status: closed
assignee: codex-2026-11-03-stage-04
blocked_by: 03-experience

## Question

승인된 설계를 검증 가능한 구현 작업으로 어떻게 나눌지 확정한다.

## 선행 조건

직전 스테이지 완료·사용자 승인·인수인계 커밋이 필요하다.
설계 단계다. 앱 스캐폴딩·의존성 설치·제품 코드 작성은 하지 않는다.

## 논의 또는 수행 범위

- 이전 설계 승인이 있는지 확인하고 미승인 부분은 구현 전 해소
- Superpowers writing-plans를 사용한 파일·작업·검증 명령 수준 계획
- 기본 앱·DB·CRUD → 두 시각화 → Windows 배포 순서와 각 완료 기준
- 날짜 함수·실제 DB·IPC·UI 통합 검증, Windows 전용 검증의 실행 위치
- 구현 라이브러리 버전·네이티브 모듈 빌드·CI·테스트 픽스처

## 산출물

- docs/superpowers/plans/ 아래 구현 계획
- 계획을 바탕으로 stages/05~07 범위를 구체화

## 완료 기준

- 계획의 모든 작업이 승인된 요구사항 또는 필요한 기반 작업으로 연결된다.
- 클라우드 검증과 실제 Windows 검증이 명확히 구분된다.
- 필요하면 5~7단계를 더 작은 후속 단계로 나누고 새 채팅 문구도 갱신한다.
- 사용자가 구현 계획을 승인한다.
- docs/wayfinder/handoffs/04-implementation-plan.md에 인수인계를 작성한다.
- STATUS.md와 이 문서의 상태를 갱신하고 GitHub에서 확인 가능한 커밋을 남긴다.

## 해결 기록

2026-11-03 [구현 계획](../../superpowers/plans/2026-11-03-simple-timeline-implementation.md)과
[도구·버전 조사](../../research/2026-11-03-implementation-tooling.md)를 작성했다.
승인 설계 대조·자체 검토·독립 검토 후 사용자가 ‘계획 승인, 스테이지 4 마무리’로 전체 승인했다.
후속 5~7단계에 Task 1~9 범위와 검증 경계를 연결했다. 실제 앱 명령은 아직 구현되지 않았다.
[인수인계](../handoffs/04-implementation-plan.md)에 결과·근거·미검증 항목·다음 채팅 문구를 기록한다.
제품 코드·의존성·앱 테스트를 추가하지 않았다. 최종 검증 후 main 직접 commit·push로 반영한다.

## 다음 채팅

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
