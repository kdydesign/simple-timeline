# WorkRail 화면·역할 전환·Node 복구 구현 기록

2026-11-18. **문서 선행 정리 완료, 제품 구현 진행 중**. 사용자가 Superpowers·Wayfinder·frontend-design·BrandKit으로 설계 반영을 시작하고 agents-md·documentation-and-adrs로 먼저 문서를 갱신하도록 요청했다.

## 기준과 범위

기준 커밋 `9b36b08`, 기존 `/workspace/workrail` worktree. [구현 계획](../superpowers/plans/2026-11-18-workrail-polish-and-recovery.md)을 따른다. 기존 승인된 디자인 결정은 다시 묻지 않는다. [화면](../design/workrail-screen-polish.md)·[역할](../design/sharing-role-switch.md)·[Node 제거](../design/node-conflict-removal.md)의 과거 설계 전용 제한과 이번 구현 요청을 구분한다. 기존 MVP 지도는 완료 상태를 유지한다.

## agents-md 점검

루트 AGENTS.md가 단일 저장소 지침이며 중복 CLAUDE/override 파일은 없다. quick checklist 11/12: 명령·setup·안전 경계·관련 문서 경로는 명시되어 있고 범용 지시 일부가 중복되지만 이번 개선을 막는 오지시는 없다. 기능별 설계 내용을 루트에 추가하지 않고 기존 domain 인덱스로 연결한다. 명령 존재 확인과 typecheck/harness 실제 실행을 구분해 아래 기록한다. 독립 관리 프로세스와 역할 전환의 세부 계약은 각 설계 문서에 유지한다.

## 설계·실행 판단

- 사용자 최신 ‘설계안 반영 시작’은 전체 개선 구현 지시로 해석한다. 이전 설계-only 문구를 현재 금지로 오인하지 않는다.
- 추가 ADR 체계를 만들지 않는다. 이 저장소의 `docs/design/` 결정 기록을 갱신하고 구현 경계를 본 파일에 연결한다.
- 색상·상단 B 메뉴·메뉴 E·앱 F는 확정값. 버전/설치 식별자는 별도 요청 없이 변경하지 않는다.
- 실제 Windows MSI/UAC/복구 바로가기와 Linux에서 가능한 단위·UI·빌드 검증의 차이를 최종 보고에 남긴다.

## 진행

- [x] 문서·명령·Git 상태 점검 및 구현 계획 작성
- [ ] Task1 화면·메뉴·정렬
- [ ] Task2 역할 전환·자료 보관
- [ ] Task3 공식 MSI 제거·잠금
- [ ] Task4 독립 관리·복구
- [ ] Task5 API·설정·통합
- [ ] Task6 아이콘·전체 검증·독립 검토
- [ ] Task7 최종 기록

## 검증

실행 결과는 완료 후 기록한다. 아직 제품 개선 검증을 통과한 것으로 간주하지 않는다.
