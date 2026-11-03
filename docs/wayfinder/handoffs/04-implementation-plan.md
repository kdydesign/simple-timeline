# 스테이지 4 인수인계 — 구현 계획

- 상태: 사용자 계획 승인 완료. 스테이지 5 이후는 미착수.
- 기준 브랜치와 소스 커밋: 최신 main `c9c922efb89a359a6ed6745f5a3985d2d83d0df0`에서 문서 작업.
- 원격 반영: 종료 기록과 최종 검증 후 main에 직접 커밋·일반 push한다.
  최종 SHA·push 성공·CI 결과는 채팅 종료 메시지에서 전달한다. 자기 커밋 SHA를 미리 쓰지 않는다.

## 이번 단계의 목표와 실제 결과

AGENTS.md와 `context 04-implementation-plan` 지정 문서, 스테이지 1~3의 승인 설계를 확인했다.
기본 앱·DB·CRUD → 간트·달력 → 실제 Windows 검증을 9개 작업으로 나누고 파일·인터페이스·검증 명령을 기록했다.
요구사항별 소유 작업과 실패 경로 테스트를 자체 대조했고, 독립 검토에서도 중요한 누락/순서 모순은 발견되지 않았다.
후속 5~7단계에 계획 범위를 연결하고 다음 채팅 진입점을 갱신했다.
제품 코드·스캐폴딩·의존성 설치·lockfile·DB·앱 테스트·설치 파일은 만들지 않았다.

## 사용자가 승인한 사항

2026-11-03 작성된 계획과 주요 기술 제안·단계별 범위를 제시하고 전체 확인을 요청했다.
사용자는 ‘계획 승인, 스테이지 4 마무리’를 선택했다.
상세는 [승인 계획](../../superpowers/plans/2026-11-03-simple-timeline-implementation.md)에만 둔다.
이는 현재 채팅에서 스테이지 5 구현을 시작하라는 뜻이 아니다. 다음 채팅의 단계 실행 요청을 확인한다.
기존 요구사항·도메인·IPC·저장·화면·시각화 설계는 바꾸지 않았다.

## 에이전트가 정한 내부 구현 사항

TypeScript·electron-vite/builder·정확 버전·프로필 정체성·파일 배치·테스트 분리·작업 순서를 제안하고 전체 승인을 받았다.
특히 일반 Node와 Electron의 네이티브 ABI를 혼합하지 않도록 DB 테스트를 Electron 전용 runner로 계획했다.
테스트 진입점은 production과 분리하고 임시 프로필만 주입하며, renderer의 승인 API를 확장하지 않는다.
추가 날짜·상태·가상화 라이브러리 없이 승인 계산과 작은 viewport 함수를 쓰기로 계획했다.
각 작업은 RED 확인→구현→검증→커밋을 따르며 아직 어떤 실행 체크박스도 완료하지 않았다.
실제 구현 실행 방식은 다음 채팅에서 Superpowers 절차에 따라 정한다.

## 산출물

- [구현 계획 — Task 1~9](../../superpowers/plans/2026-11-03-simple-timeline-implementation.md)
- [도구·버전·검증 경계 조사](../../research/2026-11-03-implementation-tooling.md)
- [기본 앱·CRUD 범위](../stages/05-foundation-crud.md), [시각화 범위](../stages/06-visualizations.md), [Windows 범위](../stages/07-windows-release.md)
- [전체 설계 참조](../../superpowers/specs/2026-11-03-simple-timeline-design.md)
- [완료 티켓](../stages/04-implementation-plan.md), [상태](../STATUS.md), [지도](../MAP.md), [다음 채팅 진입점](../../../README.md)

## 검증

Linux x64, Node v24.22.1에서 작성·수정 후 `node scripts/harness/run.mjs verify`를 실행했다.
검사 7종과 하네스 회귀 22개가 통과했다. 기준 HEAD는 `c9c922e`이며 dirty 문서 작업 트리 결과다.
종료 기록 작성 후 최종 문서와 커밋 후 clean 상태를 다시 검증하고 그 결과를 종료 메시지에서 확정한다.
보고서 `artifacts/harness/latest.json`·`latest.log`는 다음 실행에서 덮어쓴다.
CI는 [GitHub Actions](https://github.com/kdydesign/simple-timeline/actions)에서 최종 SHA와 대조한다.
검증 범위는 `repository-harness-only`다. 문서의 npm 앱 명령·테스트·CI 작업은 미래 구현 대상이다.

공식 문서·registry 메타데이터·배포 타입으로 버전의 존재·게시일·주요 engines/peer와 통합 경로를 조사했다.
대표 Electron/TypeScript/electron-vite 메타데이터는 주 에이전트도 재조회했다.
일반 Node와 Electron의 버전 문자열이 같아도 ABI가 다른 점을 기록했다.
버전의 실제 설치·전이 의존성 해결·typecheck·native rebuild·앱 빌드·DB/UI/E2E·Windows 실행은 미검증이다.

## 미결정·차단·주의 사항

스테이지 4에서 사용자 확인이 필요한 미결정은 없다. 계획 승인과 실제 기능 완료를 구분한다.
스테이지 5는 Task 1~5, 스테이지 6은 Task 6~8, 스테이지 7은 Task 9다.
후속 작업이 한 채팅에 담기지 않으면 완료 작업·남은 검증을 기록하고 해당 스테이지를 진행 중으로 유지한다.
정확 버전은 조사일 기준이며 후속 시작 시 보안 지원·설치 가능 여부를 확인한다. 불일치는 숨기지 말고 원인·변경 이유·검증을 남긴다.
Windows x64는 최초 CI 축일 뿐 최종 제품 지원 OS/CPU 확정이 아니다.
지원 환경·설치 범위·서명·배포·제거 정책은 스테이지 7에서 사용자와 결정한다.
Playwright Electron 지원은 experimental이고 native dialog/최종 배포물 검증에는 한계가 있다.
설치·오프라인·업데이트·실제 보조기술을 CI 빌드 성공이나 테스트용 앱 성공으로 대체하지 않는다.
목업을 제품 코드로 재사용하지 않는다. 테스트·오류 주입은 운영 DB가 아닌 임시 프로필에서만 한다.

## 다음 단계와 시작 문구

다음은 [스테이지 5 — 기본 앱·저장·CRUD 구현](../stages/05-foundation-crud.md)이다.
권장 스킬: Superpowers using-superpowers·executing-plans 또는 선택한 subagent-driven-development·test-driven-development·verification-before-completion,
Wayfinder entry-wayfinder와 지도 Notes의 실행 예외. 계획과 승인 설계 둘 다 읽고 기존 결정을 다시 묻지 않는다.

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
