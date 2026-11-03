# Codex 하네스

## 목적과 적용 범위

사용자는 이 저장소를 Codex 프로젝트로, 하네스 엔지니어링을 기반으로 진행하도록 요청했다.
새 세션이 현재 단계를 복구하고 작은 변경을 수행한 뒤 결과를 검증할 수 있는 기반이다.
이번 설정은 저장소 운영 설정이며 기존 스테이지 1~7을 착수·완료한 것이 아니다.

## 구성 판단

문서만 추가하면 잘못된 링크·의존 관계를 자동 발견하기 어렵다.
처음부터 전체 앱·모니터링·다중 에이전트 체계를 구성하면 미확정 설계를 선점한다.
따라서 짧은 AGENTS 안내, 기존 문서 지도, 의존성 없는 Node.js 검사, 동일 명령의 CI로 시작한다.
이는 에이전트가 선택한 최소 운영 구성이다. Electron 빌드 도구·SQLite 드라이버 선택은 기존 단계에 남긴다.

| 역할 | 기준 |
| --- | --- |
| 자동 진입 안내 | [AGENTS.md](../../AGENTS.md) |
| 현재 단계 | [STATUS](../wayfinder/STATUS.md) |
| 결정 지도 | [MAP](../wayfinder/MAP.md) |
| 작업 단위와 선행 관계 | [로컬 티켓 규칙](../agents/issue-tracker.md) |
| 새 채팅 시작·종료 | [세션 절차](session.md) |
| 실제 검사 명령과 한계 | [검증 안내](validation.md) |

## 실행 환경

저장소 루트를 작업 디렉터리로 사용한다. Node.js 24 LTS와 Git을 준비한다.
현재 하네스는 외부 npm 의존성이 없어 설치 명령이나 네트워크 없이 실행된다.
개발 도구·패키지를 다운로드하는 개발 환경과 완성 앱의 오프라인 사용 요구는 구분한다.

```sh
node scripts/harness/check.mjs
node --test scripts/harness/check.test.mjs
git diff --check
```

CI는 Ubuntu·Windows에서 같은 하네스 명령을 실행한다.
CI 결과는 실행된 GitHub Actions에서 확인하며, 파일을 작성한 사실만으로 통과라고 말하지 않는다.

## 코드가 생기면 확장할 것

스테이지 4~5에서 실제 폴더와 의존성이 확정되면 lint·typecheck·단위/통합 테스트·빌드 명령을 연결한다.
프로세스·도메인 간 import 제약은 실제 모듈 구조를 대상으로 검사한다.
UI 실행·스크린샷·오류 로그와 임시 DB를 통한 재현 경로도 그때 추가한다.
설정 파일만으로 검증하지 않은 아키텍처를 강제한다고 주장하지 않는다.
자동 일정 작업, Codex 모델·권한 변경, 별도 계정·서버 설정은 포함하지 않는다.

## Codex 화면 설정과의 구분

AGENTS.md는 저장소를 열어 작업하는 Codex의 프로젝트 지침이다.
이 커밋이 ChatGPT/Codex 화면에서 프로젝트 생성·환경 등록까지 수행하는 것은 아니다.
새 작업은 이 GitHub 저장소를 연결하거나 복제한 루트에서 시작한다.
현재 제공된 도구에는 Codex UI의 재사용 환경 등록 기능이 없다.
전역 설정이나 샌드박스·승인 정책을 저장소 파일로 우회하지 않는다.

## 근거

2026-11-03 공식 자료를 확인했다. 아래 원칙을 이 프로젝트 규모에 맞게 적용했다.

- [OpenAI Harness engineering](https://openai.com/index/harness-engineering/): 짧은 진입 안내, 저장소에 남기는 지식, 실행 가능한 피드백 루프.
- [Codex AGENTS.md 안내](https://developers.openai.com/codex/guides/agents-md/): 저장소 루트와 하위 디렉터리의 작업 지침 탐색.
