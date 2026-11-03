# 스테이지 1 인수인계 — 도메인·날짜 규칙

- 상태: 승인·설계 완료. 후속 스테이지는 미착수.
- 기준: main `4c2c6f4ba60b4b54ed066b21cc2b91e2a5f4d500`에서 작업 브랜치 `docs/stage-01-domain` 생성.
- 원격 반영: 승인 설계 커밋 `23af2c427d65905896433649bd91266f8c3a8363` push 성공.
  [스테이지 1 PR](https://github.com/kdydesign/simple-timeline/pull/1)로 전달한다. 자동 병합하지 않는다.
- 이 인수인계를 포함하는 최종 커밋 SHA·원격 확인·CI 실행 URL은 채팅 종료 메시지에서 전달한다.

## 이번 단계의 목표와 실제 결과

하네스 `context 01-domain`의 지정 문서와 필요한 설계를 읽고 사용자의 미결정 규칙을 확정했다.
[규칙과 사례 표](../../design/domain-rules.md)를 작성하고 용어 사전·전체 설계의 참조·티켓·상태·지도를 함께 갱신했다.
설계 검토 에이전트는 구현 계획 전에 추가로 물어야 할 중요한 질문이 없다고 판단했다.
제품 코드·프레임워크·의존성·DB·앱 테스트·설치 파일은 추가하지 않았다.

## 사용자가 승인한 사항

2026-11-03 다섯 질문에 모두 추천안을 선택했다. 날짜·이름·참여자·정렬·선택 연월의 상세는
[승인 설계](../../design/domain-rules.md)에만 둔다.
작성된 문서 확인 요청에 ‘구현 진행해’라고 답했다. 이를 문서 승인과 현재 단계 마무리 진행으로 반영했다.
기존의 ‘이번 단계만’ 지시를 유지하며 스테이지 2~7의 설계·계획·구현 승인을 대신하지 않는다.

## 에이전트가 정한 내부 구현 사항

제품 구현 결정을 내리지 않았다. 문서 정리·사례 선정·작업 브랜치 이름을 정했다.
식별자 형식·동률 비교 방식·생성 순서 저장·날짜 계산 알고리즘은 승인 업무 규칙을 만족하도록 후속 단계에서 정한다.
Superpowers writing-plans 절차도 확인했으나 전체 앱 구현 계획은 저장소가 지정한 스테이지 4까지 유보한다.

## 산출물

- [도메인·날짜 규칙과 사례](../../design/domain-rules.md)
- [용어 사전](../../../CONTEXT.md)
- [전체 설계의 연결](../../superpowers/specs/2026-11-03-simple-timeline-design.md)
- [완료 티켓](../stages/01-domain.md), [진행 상태](../STATUS.md), [진행 지도](../MAP.md)
- [다음 채팅 진입점](../../../README.md)

## 검증

Linux x64, Node v24.22.1에서 `node scripts/harness/run.mjs verify`를 실행했다.
설계 커밋 전 검사 7종과 하네스 회귀 22개가 통과했다. 이 결과는 dirty 작업 트리의 검증이었다.
종료 기록 작성 후에도 같은 명령을 재실행하고, 최종 커밋의 clean 상태 검증과 GitHub CI 결과를 종료 메시지에서 별도로 전달한다.
보고서 위치는 `artifacts/harness/latest.json`, `latest.log`이며 다음 실행에서 덮어쓴다.
설계 커밋 `23af2c427d65905896433649bd91266f8c3a8363`의
[PR CI 실행](https://github.com/kdydesign/simple-timeline/actions/runs/41592861568)은
Ubuntu·Windows 두 하네스 작업 모두 성공했다. 이는 종료 기록 추가 전 커밋의 결과다.
최종 CI는 [GitHub Actions](https://github.com/kdydesign/simple-timeline/actions)에서 최종 SHA와 대조한다.

검사 범위는 `repository-harness-only`다. 문서의 사례 표는 구현 후 검증 기준이며 실행한 앱 테스트가 아니다.
Electron·SQLite·UI·앱 빌드·Windows 설치·오프라인 실행·재실행 데이터 보존은 검증하지 않았다.
Windows CI 하네스 성공도 Windows 앱 검증을 뜻하지 않는다.

## 미결정·차단·주의 사항

스테이지 1 업무 규칙에 미결정 사항은 없다. 후속 저장·화면 설계에 맡긴 항목은 승인 설계의 위임 범위를 따른다.
스테이지 2는 미착수이며 SQLite·IPC·DB 수명주기·백업 방침 등을 사용자와 정해야 한다.
서기 0001~9999년은 날짜 유효 범위다. 극단적으로 긴 간트의 성능·축 밀도는 스테이지 3에서 검토하되
임의로 날짜 허용 범위를 축소하거나 표시 제한을 승인된 규칙으로 추정하지 않는다.
PR이 미병합인 동안 최신 main만 읽으면 이 단계의 결과가 없다. 브랜치와 커밋을 먼저 확인한다.

## 다음 단계와 시작 문구

다음은 [스테이지 2 — Electron·SQLite 구조 설계](../stages/02-architecture.md)다.
권장 스킬: Superpowers using-superpowers·brainstorming, Wayfinder entry-wayfinder·domain-modeling·grilling.
스테이지 1 규칙을 재질문하지 말고 후속 구조 결정만 논의한다.

```text
저장소: https://github.com/kdydesign/simple-timeline
Superpowers와 Wayfinder로 스테이지 2만 진행해줘.
PR https://github.com/kdydesign/simple-timeline/pull/1 이 병합됐으면 최신 main에서,
아직 미병합이면 docs/stage-01-domain 브랜치에서 시작해줘. 자동 병합하지 마.
AGENTS.md를 읽고 node scripts/harness/run.mjs context 02-architecture 결과의 문서와
docs/wayfinder/handoffs/01-domain.md, docs/design/domain-rules.md를 확인해줘.
선행 단계 완료와 승인을 확인하고 확정된 요구사항은 다시 묻지 마.
Electron·SQLite 구조만 나와 설계하고 앱 구현은 시작하지 마.
검증·GitHub 반영·다음 채팅용 인수인계를 남겨줘.
```
