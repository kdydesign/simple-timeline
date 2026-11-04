# 하네스·문서 재점검

## 2026-11-04 — 완료된 MVP의 문서 정합성

분석 기준 main: `22a6ae661b4a9e9f50562f2334849ec7f2c3766b`.
요청 범위는 문서와 에이전트 지침이다. 제품 코드·의존성·검사 스크립트·배포/CI 설정은 변경하지 않았다.
[agents-md](../../.agents/skills/agents-md/SKILL.md)와
[documentation-and-adrs](../../.agents/skills/documentation-and-adrs/SKILL.md)를 적용했다.
두 스킬 원본·출처·라이선스도 그대로 보존했다.

### 분석: 현재 구현·의도·제안 구분

실제 src와 tests, package scripts, Electron/Vite/Playwright 설정, 두 CI workflow를 설계·운영 문서와 대조했다.
승인된 업무 규칙과 MVP 인수 범위는 유지했다. 현재 구현은 코드, 의도는 승인 설계,
실행 증거는 해당 SHA·환경의 결과로 구분하며 후속 제안을 구현된 것으로 적지 않는다.

| 발견 | 근거 | 반영·판단 |
| --- | --- | --- |
| 완료된 MVP에 초기 단계 절차가 적용됨 | context는 selected null/frontier 빈 배열, 모든 티켓 closed. session은 스테이지 1 착수 예시 | AGENTS·session·STATUS·tracker에서 단계 작업과 일반 후속 요청 구분 |
| 운영 문서가 앱 없음·도구 선택/시각화 검증 예정으로 설명 | [초기 하네스 기록](../wayfinder/handoffs/00-harness.md)과 달리 src·Application CI·설치 인수 존재 | harness README는 현재 3개 검증 경로로 보정. 과거 기록은 아래 당시 시점으로 한정 |
| 설계가 이미 구현된 부분까지 미검증으로 안내 | [구현 기록](../implementation/)·tests와 design 문서 말미 | 승인 계약은 유지하고 현재 소스·실행 근거·실기 미검증으로 연결 |
| 문서 탐색·시작/종료 절차 중복 | README·AGENTS·session·STATUS의 같은 작업 안내 | AGENTS는 공통 계약, domain은 문서 지도, session은 절차, validation은 실행 상세로 정리 |
| 하네스가 명령/스킬까지 검사한다고 오해할 여지 | [check.mjs](../../scripts/harness/check.mjs)는 루트/docs의 일부 링크만 검사 | validation에 실제 검사 대상과 제외 범위를 명시, 이번에는 별도 읽기 전용 대조 수행 |
| 모든 CI artifact가 14일이라는 인상 | [harness.yml](../../.github/workflows/harness.yml)만 retention-days 14, [app.yml](../../.github/workflows/app.yml)은 미지정 | workflow별 보존 정책과 dirty/SHA·설치본 소스 구분 명시 |
| 개발 명령과 시험 프로필 혼동 가능 | [bootstrap](../../src/main/bootstrap.ts)의 기본 경로와 별도 [test main](../../tests/e2e/main.ts) | dev는 일반 DB, 자동 검사는 임시 프로필, packaged는 일회성 VM임을 구분 |
| IPC 예외 로그가 설계와 다름 | [dispatch](../../src/main/ipc-core.ts)는 toPublicError로 반환하며 로그 없음 | [구조 설계](../design/architecture.md)에 미구현 차이 표시. 코드 수정은 후속 |
| migration 사본 로그가 설계와 다름 | [lifecycle](../../src/main/db/lifecycle.ts)는 recovery 사본만 로그 출력 | [저장 설계](../design/storage.md)에 migration 로그 미구현 표시. 사본 생성·검증·보존 자체와 구분 |
| 업데이트 fixture의 증거 범위를 혼동할 여지 | [migrations](../../src/main/db/migrations.ts)는 schema 1뿐, 0.1.1도 같은 소스 | 설치 업데이트/데이터 보존과 시험용 schema migration 회귀를 구분 |

CONTEXT는 용어 사전 역할과 구현이 일치해 변경하지 않았다. 당시 승인 이유·대안은 기존 설계에 있으므로
새 ADR로 중복 생성하지 않았다. 과거 계획의 체크박스·시험 결과·사용자 보고를 새 실행 결과로 덮어쓰지 않았다.

### AGENTS 점검과 반영

[49개 정밀 기준](../../.agents/skills/agents-md/references/quality-criteria.md)을 적용했다.
점검 대상 프로젝트 진입 파일은 루트 AGENTS 하나다. 프로젝트의 CLAUDE/override 파일과
이 환경의 홈 Claude/Codex 지침은 없었다. 다른 에이전트 제품의 실제 로더 동작은 이번에 실행하지 않았다.

| 기준 | 반영 전 | 반영 후 | 연결된 변경 |
| --- | --- | --- | --- |
| A 실행 명령 | 6/11 | 11/11 | dev/build/typecheck/설치본·대상 단위 검사, root·환경·격리 안내 |
| B 프로젝트 함정 | 9/10 | 10/10 | 가상화/모달 상세는 validation으로 이동, 공통 데이터·권한 경계는 root에 유지 |
| C 적용 조건·관례 | 6/10 | 10/10 | 단계/일반 작업 조건, 사용자 범위·저장소 관례와 외부 스킬 우선관계 명시 |
| D 정보 밀도 | 6/9 | 8/9 | 시작·종료 중복 축소, 상세 절차·리뷰 경로 분리 |
| E 현재성·검증 | 4/6 | 6/6 | 핵심 명령 실행, 경로 대조와 명령 변경 시 함께 보정하는 유지 규칙 |
| 합계 | **31/46 (67.4%, C)** | **45/46 (97.8%, A)** | root 58→62줄, 하네스의 150줄 제한 이내 |

N/A는 6번(DB 별도 CLI 없음), 27번(단일 앱, workspace 경계 없음), 49번(개인 override 없음)이다.
반영 전 미충족 번호는 1·3·4·5·11·21·28·29·31·32·39·40·41·45·48이다.
41번의 사용자 선호/운영 정책 분리는 반영 후에도 미충족으로 남겼다. 한국어 소통과 main 직접 반영은
명시된 프로젝트 운영 요청이므로 root에서 제거하지 않았다. 점수는 문서 점검이며 제품 품질이나 로더 인증이 아니다.

### 보정: 실제 실행과 경로 대조

2026-11-04 Linux x64, Node 24.22.1, Xvfb DISPLAY :99에서 확인했다.
기존 의존성을 사용했으며 npm ci·재설치·가져온 스킬의 스크립트는 실행하지 않았다.

| 검사 | 결과·근거 |
| --- | --- |
| context | 종료 코드 0, errors 빈 배열·selected null·frontier 빈 배열. 완료 지도 상태 유지 |
| 저장소 verify | 7종 검사와 회귀 22개 통과. 문서 수정 트리는 dirty이며 최종 커밋 증거와 구분 |
| verify:app | 7개 단계 모두 통과. release 11, unit 31×UTC/New_York/Seoul, UI 23, native 12, E2E 19. 타입·제품/시험 build 포함 |
| 실행 SHA | 앱 보고서 시작 기준 22a6ae6, dirty=false, 01:18:46~01:19:39 UTC. 이후 문서만 변경; 제품·시험 코드 동일 |
| 개발 실행 | 새 XDG_CONFIG_HOME에서 npm run dev 시작, 개발 서버 HTTP 200, 임시 DB schema 1/application_id 1398033486 확인 후 종료 |
| 개별 단위 명령 | AGENTS에 적은 날짜 파일 + reporter=dot 명령으로 13개 통과 |
| 경로·명령 | 루트/docs/두 스킬의 Markdown 56개, 로컬 링크 389개 대상 확인. npm 스크립트 14종을 package scripts와 대조; lint는 없는 명령임을 명시한 예시 |
| 기존 clean CI | [22a6ae6 Application](https://github.com/kdydesign/simple-timeline/actions/runs/41751758540)와 [Repository harness](https://github.com/kdydesign/simple-timeline/actions/runs/41751758520) 모두 success 확인. 이번 문서 커밋 CI와 구분 |

로컬 상세는 artifacts/harness/latest.json·latest.log, artifacts/app/latest.json·명령별 로그,
artifacts/app/dev-smoke.json·dev-smoke.log에 있다. 로컬 산출물은 Git에 넣지 않으며 다음 실행에서 덮어쓸 수 있다.
외부 URL 76개는 공개 HTTP 응답 또는 인증된 GitHub API로 대상 존재를 확인했다.
기존 설치 artifact 3개도 메타데이터상 만료되지 않았다. 이번에 설치 파일을 다시 내려받아 해시를 재검증한 것은 아니다.
외부 문서의 fragment 위치·본문 변경까지 보증하는 검사는 아니며, 과거 조사의 버전별 근거와 조회 시점을 유지한다.

### 미검증과 후속 제안 — 이번에는 구현하지 않음

- Windows 패키징·설치 lifecycle은 이 Linux 작업에서 재실행하지 않았다. 명령·조건·기존 Windows CI 결과를 대조했다.
  사용자 PC의 상세 오프라인·DPI·Narrator·물리 장애는 [기존 후속 범위](../release/user-acceptance.md)를 유지한다.
- 신규 환경의 npm ci·native 재설치는 미실행이다. 현재 설치된 도구의 실행과 기존 clean CI를 근거로 사용했다.
- **제품 코드 제안:** IPC 예외 기록과 migration 사본 경로·대상 버전 기록의 설계 차이를 해소할 필요가 있다.
  기존 간트 gutter·도구 advisory·방화벽 cleanup 보완은 [스테이지 7 기록](../implementation/stage-07.md)을 유지하며 이번에 수정하지 않았다.
- **하네스 제안:** 명령·백틱 경로·API 식별자·스킬 내부 참조의 drift 검사를 CI에 연결할 수 있다.
  현재 검사에는 없으며 사용자 범위가 문서뿐이므로 스크립트/CI는 추가하지 않았다. 템플릿·없는 명령 예시·생성 경로의 구분이 필요하다.
- **CI 제안:** 문서 전용 push에도 설치본을 다시 만드는 현재 정책의 비용을 검토할 수 있다.
  필터를 도입한다면 설치 산출물에 포함되는 사용 안내 등 영향 문서를 누락하지 않아야 한다. 배포 설정은 그대로 유지했다.

다음 작업은 이 기록의 후속 항목 중 요청받은 범위를 정해 시작한다. MVP 단계나 기존 승인을 다시 열 필요는 없다.

## 과거 기록 — 2026-11-03 초기 하네스

당시에는 스테이지 1 미착수·앱 코드 없음 상태였으며 문서·상태·검사기만 검증했다.
현재 상태 설명이 아니다. [초기 인수인계](../wayfinder/handoffs/00-harness.md)와
[당시 재점검 원문](https://github.com/kdydesign/simple-timeline/blob/22a6ae661b4a9e9f50562f2334849ec7f2c3766b/docs/harness/review.md)에 상세가 있다.

당시 수정은 완료 티켓의 MAP 색인 누락, open 티켓의 잘못된 claim, 커밋된 공백 오류의 검출이었다.
context로 재개·차단·읽을 문서를 제공하고, verify로 공통 실행·SHA/dirty·성공/실패 보고서를 남겼다.
완료 인수인계의 필수 내용을 검사하며, 검사 성공이 사용자 승인이나 문장 진실성을 증명하지 않음을 구분했다.

회귀 22개와 통합 verify를 실행했고 임시 저장소의 정상·assertion 실패·뒤늦은 예외·모두 skip 실행에서
종료 코드와 JSON 판정, 실패 메시지 보존을 확인했다. 강제 중단은 latest running/false로 남았으며
실제 프로젝트 소스나 단계 상태를 바꾸지 않는 복사본에서 재현했다. 이 결과는 당시 검사기의 증거로 보존한다.
