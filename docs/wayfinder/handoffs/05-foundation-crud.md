# 스테이지 5 인수인계 — 기본 앱·저장·CRUD

- 상태: 구현·로컬·Ubuntu/Windows 앱 CI 검증 완료. 스테이지 6~7은 미착수.
- 기준: main `4c59dc0916810385521d7167f86649cc68339d6d`에서 Task 1~5 실행.
- 원격 반영: 코드와 검토 수정은 `7b66353`까지 main에 직접 commit·push했다.
  종료 문서 포함 최종 SHA·원격 확인·최종 CI는 채팅 종료 메시지에서 전달한다.

## 이번 단계의 목표와 실제 결과

승인 계획의 Task 1~5를 직접 구현하고 마지막에 독립 검토를 받았다.
순수 도메인·공유 계약, 실제 SQLite CRUD/연쇄 삭제, DB 수명주기·보존, Electron 격리·IPC,
React 편집 패널·단일 snapshot·저장 실패·삭제/미저장 확인·닫기 보호를 구현했다.
목업을 제품 코드로 재사용하지 않았다. 현재 조회 영역은 계획이 허용한 CRUD 검증용 목록이다.
간트·달력·가상 범위·모드 전환과 Windows 설치 파일은 아직 구현하지 않았다.

## 사용자가 승인한 사항

사용자는 스테이지 4 계획을 승인한 뒤 ‘스테이지 5 진행해’로 이번 구현을 요청했다.
기존 요구사항·도메인·날짜·저장·화면 설계를 다시 묻거나 변경하지 않았다.
상시 지시인 PR 없는 main 직접 commit·push를 따랐다. 추가 제품 기능을 승인한 것으로 해석하지 않는다.
스테이지 6~7 실행은 다음 해당 단계 요청을 확인한다.

## 에이전트가 정한 내부 구현 사항

실제 파일·타입·테스트 도구는 승인 계획을 따르고, 실행에서 필요한 조정은
[실행 기록의 조정과 비용](../../implementation/stage-05.md)에 기록했다.
주요 차이는 `.mts` config, Electron의 명시적 다운로드, native 검증 전 build,
임시 Linux CI sandbox helper 준비, hot-journal 복구 전 원본 쌍 보존이다.
독립 검토의 중요 문제 5개는 각각 RED→GREEN으로 수정하고 전체 suite를 다시 통과시켰다.
작은 개선 2개와 빌드 도구 advisory는 숨기지 않고 남겼다.

## 산출물

- [실행·검증·검토·조정 기록](../../implementation/stage-05.md)
- [앱 개발·검증 방법](../../../README.md)
- [앱 소스](../../../src/main/bootstrap.ts), [저장소](../../../src/main/db/repository.ts), [React 앱](../../../src/renderer/App.tsx)
- [native 회귀](../../../tests/native/lifecycle.case.ts), [실제 CRUD E2E](../../../tests/e2e/crud.spec.ts), [앱 CI](../../../.github/workflows/app.yml)
- [승인 계획](../../superpowers/plans/2026-11-03-simple-timeline-implementation.md)
- [티켓](../stages/05-foundation-crud.md), [상태](../STATUS.md), [지도](../MAP.md)

## 검증

Linux x64·Node 24.22.1·Electron 45.2.1·ABI 150에서 `DISPLAY=:99 npm run verify:app`를 실행했다.
unit 23개를 UTC/New_York/Seoul에서 각각 실행했고 UI 9개·native 11개·E2E 8개,
타입 검사·production/test build가 통과했다. 모든 DB·Chromium 프로필은 임시 경로에 격리했다.
`node scripts/harness/run.mjs verify` 검사 7종·회귀 22개도 통과했다.
초기 최종 수정 검증은 `40686d8` 기준 dirty 작업 트리였고 수정은 `8f8fc22`에 포함했다.
종료 기록 작성 후 clean 최종 SHA에서 같은 검증을 실행하고 종료 메시지에서 확정한다.
보고서는 `artifacts/app/`, `artifacts/native/`, `artifacts/e2e/`, `artifacts/harness/`이며 덮어써진다.

`8f8fc22`의 [첫 앱 CI](https://github.com/kdydesign/simple-timeline/actions/runs/41607761653)는
Ubuntu sandbox helper 설정과 Windows 보안 테스트의 이벤트 등록 경합으로 실패했다.
각각 원인을 확인해 검사를 끄지 않고 보완했다.
`7b66353`의 [앱 CI](https://github.com/kdydesign/simple-timeline/actions/runs/41608614371)는
Ubuntu·Windows 모두 통과했다. 최종 문서 커밋의 CI 결과는 종료 메시지에서 별도로 대조한다.
실제 Windows 설치·업데이트·오프라인·물리 디스크 오류·보조기술은 스테이지 7에 남아 있다.

## 미결정·차단·주의 사항

스테이지 5의 미결정·차단 항목은 없다. 작은 개선과 후속 Windows 설치 검증은 아래와 같이 구분한다.
남겨둔 작은 개선: 일정 추가 취소 시 호출 버튼으로의 포커스 복귀 일부, 마이그레이션 사본 경로/대상 버전 로그.
`npm audit`의 빌드 도구 의존 경로 moderate 15개(high/critical 0)는 실행 기록의 advisory와 판단을 참조한다.
자동 제안의 builder 20.x 강제 다운그레이드는 적용하지 않았다. 패키징 도구 검토 때 다시 확인한다.
저장 실패를 성공으로 처리하거나 결과 불명 create를 자동 재전송하지 않는다.
운영 DB를 테스트·손상 실험에 사용하지 않는다. hot journal은 인식된 DB의 원본 쌍을 보존한 뒤 SQLite가 복구한다.
Task 1~5 코드를 다시 만들지 않는다. 실제 인터페이스와 실행 기록을 읽고 Task 6~8에 연결한다.

## 다음 단계와 시작 문구

다음은 [스테이지 6 — 간트·달력 구현](../stages/06-visualizations.md)이다.
권장 스킬: Superpowers using-superpowers·executing-plans 또는 선택한 subagent-driven-development·test-driven-development·verification-before-completion,
Wayfinder entry-wayfinder와 지도 Notes의 실행 예외.

```text
저장소: https://github.com/kdydesign/simple-timeline
Superpowers와 Wayfinder로 스테이지 6만 진행해줘.
최신 main의 AGENTS.md를 읽고 node scripts/harness/run.mjs context 06-visualizations
결과의 문서와 docs/wayfinder/handoffs/05-foundation-crud.md,
docs/implementation/stage-05.md,
docs/superpowers/plans/2026-11-03-simple-timeline-implementation.md,
docs/design/domain-rules.md, docs/design/architecture.md, docs/design/storage.md,
docs/design/experience.md, docs/design/visualization.md를 확인해줘.
기존 승인 사항은 다시 묻지 말고 Task 1~5의 실제 코드를 이어서 Task 6~8만 구현해줘.
운영 DB 대신 임시 테스트 프로필을 쓰고 실제 앱·CI로 두 모드와 CRUD 통합을 검증해줘.
목업을 제품으로 재사용하지 말고 스테이지 7에는 착수하지 마.
완료하면 검증 후 PR 없이 main에 직접 커밋·push하고,
다음 채팅용 인수인계와 최종 커밋을 알려줘.
```
