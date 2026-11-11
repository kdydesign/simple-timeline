# 문서 기준과 탐색 경로

이 프로젝트는 단일 도메인 문맥을 사용한다. 현재 구현과 승인된 설계가 다르면 둘을 나란히 기록한다.
코드가 존재한다는 이유로 요구사항이 바뀐 것으로, 설계가 승인됐다는 이유로 구현·검증된 것으로 간주하지 않는다.

| 확인할 내용 | 기준과 읽을 문서 |
| --- | --- |
| 현재 작업 상태·인수 범위 | [STATUS](../wayfinder/STATUS.md), [MVP 사용자 인수](../release/user-acceptance.md) |
| 최신 화면 재질·디자인 | [0.6.9 참여자·알림 컨트롤](../implementation/2026-11-11-sharing-participants.md), [0.6.8 목록·알림 간편 편집](../implementation/2026-11-11-quick-actions.md), [0.6.7 저장 진행·필드 오류·공유 설정](../implementation/2026-11-11-form-experience.md), [0.6.5~0.6.6 다크 전용·간트 탐색·트랙 경계 구현 기록](../implementation/2026-11-11-dark-navigation.md), [Forest Crystal 승인 설계](../design/forest-crystal.md), [0.6.4 딥 그레이·스틸 블루](../implementation/2026-11-11-steel-blue.md), [0.6.3 행 밀도·알림 스위치](../implementation/2026-11-10-compact-rows.md), [0.6.2 투과·P 아이콘](../implementation/2026-11-10-glass-correction.md). 기존 C안 배치와 기능을 유지하며 색상·재질은 이 설계를 우선 |
| 용어·전체 요구사항 | [CONTEXT](../../CONTEXT.md)는 용어만, [전체 설계](../superpowers/specs/2026-11-03-simple-timeline-design.md)는 요구사항 인덱스 |
| Planrail 후속 변경 | [확정 설계](../design/planrail-improvements.md), [구현·검증 기록](../implementation/2026-11-05-planrail.md). 명시된 이름·탐색·트레이·화면 변경은 이전 후속 설계보다 우선 |
| 일정 알림·간트 계층 개선 | [확정 설계](../design/reminders-and-hierarchy.md). Q15 전체 승인. [구현·검증](../implementation/2026-11-05-reminders.md), 실제 Windows 알림 실기는 미검증 |
| 달력 미리보기·창 동작 후속 협의 | [승인 설계](../design/calendar-preview-and-desktop-polish.md), [구현·검증](../implementation/2026-11-10-desktop-polish.md). Q1~Q9와 전체 구현 승인, Windows 실기 한계는 실행 기록 참조 |
| 이전 MVP 후속 변경 | [개선·오류 대응 확정 설계](../design/post-mvp-improvements.md). 명시된 변경 항목에서는 기존 MVP 설계보다 우선하며, [구현·검증 기록](../implementation/2026-11-04-post-mvp-improvements.md)과 구분 |
| 승인된 업무 규칙 | [도메인·날짜](../design/domain-rules.md), 실제 계산은 [domain](../../src/domain/) |
| 승인된 권한·저장 계약 | [구조](../design/architecture.md), [저장](../design/storage.md); 현재 코드는 [main](../../src/main/), [preload](../../src/preload/), [API 타입](../../src/shared/api.ts) |
| 승인된 화면·날짜 배치 | 기능 배치는 [Planrail 화면](../design/planrail-improvements.md), 재질은 [Forest Crystal](../design/forest-crystal.md)이 우선. [C안](../design/flat-glass-redesign.md)·[MVP 화면](../design/experience.md)·[시각화](../design/visualization.md)는 대체되지 않은 계약과 당시 결정 근거. 실제 코드는 [renderer](../../src/renderer/)·[계산 함수](../../src/visualization/) |
| 공통 UI·스타일 수정 | [renderer 구성](../design/architecture.md#renderer-공통-ui와-스타일). 소속 프로젝트 Select·날짜 선택기·포털·테마의 실제 연결과 회귀 경로 |
| 도구·명령·검증 범위 | [package.json](../../package.json), [CI](../../.github/workflows/), [검증 안내](../harness/validation.md) |
| 사내 프로젝트 공유·동기화 | [설계·검토](../design/lan-project-sharing.md). Q1~Q27·후속 참여자 권한·UI 위치 확정. 보안·상태·알림 계약 검토 보정 완료. 트레이 상태 클릭으로 공유 설정 진입·필터별 간트 기간 확정. 0.6.0 [구현·검증 기록](../implementation/2026-11-10-lan-sharing.md), 실제 Windows·사내망 인수는 별도 |
| 설치·사용·보존 정책 | [배포 정책](../release/policy.md), [사용 안내](../release/user-guide.md) |
| 당시 실행 증거 | [구현 기록](../implementation/), [Windows 검증](../release/windows-validation.md), [단계 인수인계](../wayfinder/handoffs/)의 SHA·환경·한계 |
| 문서 점검·개선 제안 | [하네스 재점검](../harness/review.md). 제안은 구현·승인 상태와 분리 |

결정의 상세는 기존 설계 문서 한 곳에 두고 지도·상태·인수인계에는 요약과 링크를 남긴다.
스테이지별 계획·조사·인수인계는 당시의 근거이며 현재 운영 절차는 [세션 안내](../harness/session.md)를 따른다.
새로운 중대한 설계 결정을 기록해야 할 때만 `docs/adr/`를 만든다. 실제 대안·선택·이유의 근거를 기록하며,
기존 승인 문서의 결정을 새 ADR 체계로 중복 이관하지 않는다.
