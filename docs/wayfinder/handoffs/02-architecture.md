# 스테이지 2 인수인계 — Electron·SQLite 구조

- 상태: 사용자 설계 승인 완료. 후속 스테이지는 미착수.
- 기준: 최신 main `38e6375c282c6b4b0a2bca53f1f5ee276cb18ff3`에서 직접 문서 작업.
- 원격 반영: 이 종료 기록을 포함해 최종 검증 후 main 직접 커밋·일반 push한다.
  최종 SHA·push 성공·CI 결과는 채팅 종료 메시지와 GitHub Actions에서 확인한다.
  문서에 자기 커밋 SHA를 미리 기록하지 않는다.

## 이번 단계의 목표와 실제 결과

AGENTS.md와 `context 02-architecture`의 문서, 스테이지 1 승인 규칙·인수인계를 확인했다.
Electron 권한 경계·IPC·오류 계약과 SQLite 스키마·DB 수명주기를 설계하고 사용자와 확정했다.
공식 문서 조사를 남겼고 별도 builder check에서 계획 전에 필요한 중요한 미해결 질문이 없다는 결과를 받았다.
제품 코드·프레임워크·의존성·DB·앱 테스트·설치 파일은 만들지 않았다.

## 사용자가 승인한 사항

2026-11-03 main이 SQLite를 소유하는 안을 선택하고 수동 백업·복원은 MVP에서 제외했다.
Q3의 ‘변경할 정책’ 선택은 입력 실수라고 정정하며 권장 정책 전체 적용을 지시했다.
작성된 문서 확인 요청에는 ‘설계 승인, 스테이지 2 마무리’를 선택했다.
승인 상세는 [구조](../../design/architecture.md)와 [저장](../../design/storage.md)에만 둔다.
이 승인은 앱 구현·스테이지 3~7의 선행 승인을 대신하지 않는다.

## 에이전트가 정한 내부 구현 사항

better-sqlite3·참여자 자식 테이블·64비트 정수 ID/문자열 DTO·생성 순서·시각 형식·journal·IPC와 오류 형식,
버전별 마이그레이션 및 내부 보존 사본을 제안했고 문서 전체 승인에 포함됐다.
수동 백업 제외와 내부 업그레이드 안전장치는 구분했다.
구체 버전·패키징 도구·파일 배치·실제 SQL은 스테이지 4~5의 몫이다.
Superpowers writing-plans를 확인했으나 구현 계획 작성은 저장소의 스테이지 4까지 유보했다.

## 산출물

- [Electron·IPC 계약](../../design/architecture.md)
- [SQLite 저장·수명주기](../../design/storage.md)
- [공식 자료 조사와 검증 한계](../../research/2026-11-03-electron-sqlite.md)
- [전체 설계 참조](../../superpowers/specs/2026-11-03-simple-timeline-design.md)
- [티켓](../stages/02-architecture.md), [상태](../STATUS.md), [지도](../MAP.md), [다음 채팅 진입점](../../../README.md)

## 검증

Linux x64, Node v24.22.1에서 초안 및 종료 기록 작성 후 `node scripts/harness/run.mjs verify`를 실행했다.
검사 7종·하네스 회귀 22개가 통과했다. 기준 HEAD는 `38e6375`이며 dirty 문서 작업 트리의 결과다.
커밋 직전 최종 문서에 같은 명령을 적용하고, 커밋 후 clean 상태에서도 재실행한다.
최종 결과와 SHA는 종료 메시지에서 보고한다. 보고서는 `artifacts/harness/latest.json`·`latest.log`에 있으며 덮어써진다.
CI는 [GitHub Actions](https://github.com/kdydesign/simple-timeline/actions)에서 최종 SHA와 대조한다.
검증 범위는 `repository-harness-only`다. 공식 자료 확인은 ABI/패키징 통합 경로의 근거이며
특정 버전·Windows CPU·설치본에서 실행 성공을 뜻하지 않는다.
Electron 실행·SQLite 네이티브 로딩·보안·마이그레이션·오류 주입·Windows 설치/업데이트·오프라인·재실행 보존은 미검증이다.

## 미결정·차단·주의 사항

스테이지 2에서 사용자 확인이 필요한 미결정은 없다.
실제 버전 조합과 Windows 대상별 호환성은 후속 구현 검증으로 확인해야 한다.
기본 색상 값·화면/오류 안내의 구체 배치는 스테이지 3, 구현 계획은 스테이지 4,
Windows 지원 버전·CPU·설치/제거 시 보존 동작은 스테이지 7에 남겨둔다.
수동 백업·복원이 없으므로 PC/디스크 손실의 앱 내 복구는 보장하지 않는다.
단계 1 날짜 범위를 임의 축소하지 않는다. 제품 구현을 시작한 것으로 추정하지 않는다.

## 다음 단계와 시작 문구

다음은 [스테이지 3 — 화면·간트·달력 설계](../stages/03-experience.md)다.
권장 스킬: Superpowers using-superpowers·brainstorming, Wayfinder entry-wayfinder·grilling·domain-modeling.

```text
저장소: https://github.com/kdydesign/simple-timeline
Superpowers와 Wayfinder로 스테이지 3만 진행해줘.
최신 main의 AGENTS.md를 읽고 node scripts/harness/run.mjs context 03-experience
결과의 문서와 docs/wayfinder/handoffs/02-architecture.md,
docs/design/domain-rules.md, docs/design/architecture.md, docs/design/storage.md를 확인해줘.
승인된 요구사항·도메인·저장 구조는 다시 묻지 마.
화면·간트·달력 설계만 나와 확정하고 앱 구현은 시작하지 마.
완료하면 검증 후 PR 없이 main에 직접 커밋·push하고,
다음 채팅용 인수인계와 최종 커밋을 알려줘.
```
