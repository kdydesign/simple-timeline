# 진행 상태

현재: 스테이지 7 Windows 설치·오프라인 검증(Task 9) 진행 중.
다음: 미확정 배포 정책 확인 후 설치본 생성·실제 Windows 검증.
[실행 기록](../implementation/stage-06.md)과 [인수인계](handoffs/06-visualizations.md)를 참조한다.
실제 Electron·SQLite CRUD·간트·달력과 앱 CI가 있다. Windows 설치 파일은 아직 없다.
최종 문서 commit·push 및 CI 결과와 SHA는 종료 메시지에서 확인한다.

프로젝트 설정과 실행 명령: [Codex 하네스](../harness/README.md).
새 세션은 루트 [AGENTS.md](../../AGENTS.md)에서 시작한다.
이번 하네스 설정의 기록: [설정 인수인계](handoffs/00-harness.md).
이후 실행 도구·검증 보완: [하네스 재점검 기록](../harness/review.md).

| 스테이지 | 이름 | 상태 |
| --- | --- | --- |
| 1 | [도메인·날짜 규칙 설계](stages/01-domain.md) | 완료 |
| 2 | [Electron·SQLite 구조 설계](stages/02-architecture.md) | 완료 |
| 3 | [화면·간트·달력 설계](stages/03-experience.md) | 완료 |
| 4 | [구현 계획 확정](stages/04-implementation-plan.md) | 완료 |
| 5 | [기본 앱·저장·CRUD 구현](stages/05-foundation-crud.md) | 완료 |
| 6 | [간트·달력 구현](stages/06-visualizations.md) | 완료 |
| 7 | [Windows 설치·오프라인 검증](stages/07-windows-release.md) | 진행 중 |

상태: 미착수 → 진행 중 → 사용자 확인 대기 → 완료. 진행 불가이면 차단됨.
완료는 완료 기준 충족·필요한 승인·인수인계·저장소 반영까지 확인한 경우다.
아직 원격에 반영하지 못했다면 로컬 완료와 GitHub 반영 여부를 별도로 기록한다.

## 다음 실행 규칙

1. 최신 커밋과 선행 문서를 확인한다. 과거 채팅을 기억한다고 가정하지 않는다.
2. 해당 티켓의 assignee에 현재 세션 식별자를 기록하고 진행 중으로 표시한다.
3. 사용자 확정사항·에이전트 제안·미결정 사항을 구분한다.
4. 승인 또는 Windows 검증이 필요한 항목은 완료로 추정하지 않는다.
5. 한 스테이지만 끝내고 인수인계 후 멈춘다. 다음 스테이지는 새 채팅에서 시작한다.
6. 상태 문서에는 결과 요약과 문서 링크만 남긴다. 결정의 상세를 중복 저장하지 않는다.
