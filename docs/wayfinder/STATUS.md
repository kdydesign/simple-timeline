# 진행 상태

현재: 스테이지 7 완료. 기본 설치 인수 범위의 MVP를 마무리했다.
후속: [개선·오류 대응 설계](../design/post-mvp-improvements.md)를 사용자와 확정하고 문서에 반영했다.
제품 구현은 미착수다. 다음 작업은 이 확정 설계에 따른 기술 설계·구현 계획이며, 기존 MVP 단계는 완료 상태를 유지한다.
[실행 기록](../implementation/stage-07.md)과 [인수인계](handoffs/07-windows-release.md)를 참조한다.
실제 Electron·SQLite CRUD·간트·달력과 Windows NSIS 빌드가 있다.
[Windows 검증 기록](../release/windows-validation.md)에서 실제 설치 lifecycle과 미실행 실기 항목을 구분한다.
Windows Server CI의 설치·오프라인·업데이트·제거 후 보존은 통과했다.
사용자 기본 설치·실행·업데이트·제거/재설치와 데이터 보존 확인 및 상세 검증 분리는
[사용자 인수 기록](../release/user-acceptance.md)을 따른다. 상세 미확인 항목을 통과로 표시하지 않았다.
최종 문서 commit·push 및 CI 결과와 SHA는 종료 메시지에서 확인한다.

프로젝트 설정과 실행 명령: [Codex 하네스](../harness/README.md).
새 세션은 루트 [AGENTS.md](../../AGENTS.md)에서 시작한다.
초기 하네스 설정의 기록: [설정 인수인계](handoffs/00-harness.md).
MVP 이후 성능·코드 보정: [리팩토링 실행 기록](../implementation/2026-11-04-refactoring.md).
현재 운영 문서·검증의 점검 결과: [하네스 재점검 기록](../harness/review.md).

| 스테이지 | 이름 | 상태 |
| --- | --- | --- |
| 1 | [도메인·날짜 규칙 설계](stages/01-domain.md) | 완료 |
| 2 | [Electron·SQLite 구조 설계](stages/02-architecture.md) | 완료 |
| 3 | [화면·간트·달력 설계](stages/03-experience.md) | 완료 |
| 4 | [구현 계획 확정](stages/04-implementation-plan.md) | 완료 |
| 5 | [기본 앱·저장·CRUD 구현](stages/05-foundation-crud.md) | 완료 |
| 6 | [간트·달력 구현](stages/06-visualizations.md) | 완료 |
| 7 | [Windows 설치·오프라인 검증](stages/07-windows-release.md) | 완료 |

상태: 미착수 → 진행 중 → 사용자 확인 대기 → 완료. 진행 불가이면 차단됨.
완료는 완료 기준 충족·필요한 승인·인수인계·저장소 반영까지 확인한 경우다.
아직 원격에 반영하지 못했다면 로컬 완료와 GitHub 반영 여부를 별도로 기록한다.

## 다음 실행 규칙

`node scripts/harness/run.mjs context`의 `selected: null`, `frontier: []`는 완료된 지도의 정상 결과다.
후속 요청은 [세션 절차](../harness/session.md)에 따라 진행하고, 이 지도의 완료 상태를 자동으로 바꾸지 않는다.
새 작업의 상세는 관련 문서에 기록하며 이 상태 인덱스에는 필요한 요약과 링크만 둔다.
