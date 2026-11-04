# Codex 하네스

이 저장소의 하네스는 **문맥 탐색 → 요청 범위의 변경 → 실행 검증 → 근거 기록**을 연결한다.
완료된 MVP의 새 작업도 같은 흐름으로 진행하며, 단계 완료 여부와 검사 통과 여부를 구분한다.

## 진입점

| 목적 | 읽을 문서 |
| --- | --- |
| 공통 작업 규칙·핵심 명령 | [AGENTS.md](../../AGENTS.md) |
| 상태·승인 결정 | [STATUS](../wayfinder/STATUS.md), [MAP](../wayfinder/MAP.md) |
| 필요한 설계·실제 코드 찾기 | [문서 기준](../agents/domain.md) |
| 시작·종료와 단계/후속 작업 구분 | [세션 절차](session.md) |
| 실행 환경·검사 범위·결과 읽기 | [검증 안내](validation.md) |
| 문서 드리프트·보완 제안·검증 기록 | [재점검 기록](review.md) |

## 세 가지 검증 경로

| 경로 | 진입점·범위 | 근거 |
| --- | --- | --- |
| 저장소 | `node scripts/harness/run.mjs verify`: 문서 구조·링크·단계 상태와 검사기 회귀 | [Repository harness CI](../../.github/workflows/harness.yml), `artifacts/harness/` |
| 앱 | `npm run verify:app`: 타입·release 정적 검사·날짜/TZ·UI·build·Electron SQLite·E2E | [Application CI](../../.github/workflows/app.yml), `artifacts/app/` 등 |
| 설치·인수 | Windows 실제 NSIS lifecycle과 사용자 PC 확인 | [Windows 실행 기록](../release/windows-validation.md), [사용자 인수](../release/user-acceptance.md) |

하네스만 실행할 때는 Node 24 이상과 Git이면 되며 npm 의존성 설치·네트워크가 필요 없다.
앱 개발 도구의 다운로드와 제품의 오프라인 실행 요구는 별개다.
저장소 파일은 Codex 서비스의 프로젝트 생성·전역 환경 등록·샌드박스 정책을 변경하지 않는다.

## 유지 원칙

초기 하네스는 미확정 제품 설계를 선점하지 않도록 짧은 진입 안내와 의존성 없는 Node 검사로 시작했다.
현재는 앱·설치 검사가 별도 경로로 연결되어 있다. 각 검사의 한계를 문서에 남기고,
반복되는 실패는 안내 문구만 늘리기보다 재현·검사·로그 중 어느 부분이 부족한지 확인한다.
코드·검사기·CI 수정이 작업 범위 밖이면 차이와 제안을 [재점검 기록](review.md)에 남긴다.

근거는 2026-11-03 확인한 [OpenAI Harness engineering](https://openai.com/index/harness-engineering/)의
짧은 진입 안내·저장소 지식·실행 가능한 피드백과 [AGENTS.md 안내](https://developers.openai.com/codex/guides/agents-md/)다.
