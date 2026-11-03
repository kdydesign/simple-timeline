# 스테이지 3 인수인계 — 화면·간트·달력

- 상태: 사용자 설계 승인 완료. 스테이지 4 이후는 미착수.
- 기준 브랜치와 소스 커밋: 최신 main `a773f88a9ca3747ed712dd1985eea095a6b71ba4`에서 문서 작업.
- 원격 반영: 종료 기록을 포함해 최종 검증 후 main에 직접 커밋·일반 push한다.
  최종 SHA·push 성공·CI 결과는 채팅 종료 메시지에서 보고한다. 자기 커밋 SHA를 미리 기록하지 않는다.

## 이번 단계의 목표와 실제 결과

AGENTS.md, `context 03-experience`의 지정 문서와 스테이지 1·2 승인 설계를 확인했다.
사용자와 화면·간트·달력 표현을 선택하고 문서와 독립 HTML 목업으로 정리했다.
builder check는 중요한 미해결 질문이 없다고 판단했고, 날짜·좌표의 주요 사례는 별도 계산으로 대조했다.
제품 코드·프레임워크·의존성·DB·앱 테스트·설치 파일을 추가하지 않았다.
목업은 사용자가 별도로 동의한 버리는 설계 자료이며 구현 출발점으로 전용하지 않는다.

## 사용자가 승인한 사항

2026-11-03 `1a 2a 3a 4a`로 목업 사용, 넓은 조회·오른쪽 편집 패널, 월요일 시작,
3줄과 날짜별 더 보기를 선택했다. 후속 Q5~Q7에는 권장 탐색·월 경계·편집 동작을 선택했다.
작성된 문서와 목업을 제시하고 확인을 요청한 뒤 ‘설계 승인, 스테이지 3 마무리’로 전체 승인을 받았다.
결정의 상세는 [화면 설계](../../design/experience.md)·[시각화 설계](../../design/visualization.md)에만 둔다.
스테이지 1·2의 업무·날짜·IPC·DB 계약은 바꾸지 않았다. 후속 구현 승인을 대신하지 않는다.

## 에이전트가 정한 내부 구현 사항

기본 간트 모드, 좁은 창의 overlay, 중복 이름 ID 표시, 포커스·오류 처리,
순번 기반 좌표·가상 렌더링 계약·주별 결정적 줄 배치를 구체화했고 문서 전체 승인에 포함됐다.
픽셀 수치·알고리즘의 상세는 승인 설계를 따른다. 특정 가상화 라이브러리·실제 파일 구조는 선택하지 않았다.
Superpowers writing-plans를 확인했으나 구현 계획 작성은 저장소의 스테이지 4에 남겨둔다.
목업은 별도 패키지 설치 없이 기존 Chromium·playwright-core로 열어 캡처했다.

## 산출물

- [화면·상호작용 설계](../../design/experience.md)
- [간트·달력 좌표·경계 사례](../../design/visualization.md)
- [독립 HTML 목업](../../design/mockups/stage-03.html)
- [전체 설계 참조](../../superpowers/specs/2026-11-03-simple-timeline-design.md)
- [티켓](../stages/03-experience.md), [상태](../STATUS.md), [지도](../MAP.md), [다음 채팅 진입점](../../../README.md)

## 검증

Linux x64, Node v24.22.1에서 문서 작성·수정 후 `node scripts/harness/run.mjs verify`를 실행했다.
검사 7종·하네스 회귀 22개가 통과했다. 기준 HEAD는 `a773f88`이며 dirty 문서 작업 트리의 결과다.
종료 문서 최종 검증과 커밋 후 clean 상태의 같은 검증 결과는 종료 메시지에서 확정한다.
보고서는 `artifacts/harness/latest.json`·`latest.log`에 남으며 다음 실행에서 덮어쓴다.
CI는 [GitHub Actions](https://github.com/kdydesign/simple-timeline/actions)에서 최종 SHA와 대조한다.
검증 범위는 `repository-harness-only`다. 앱 동작·보안·날짜 함수·UI 통합 테스트 결과가 아니다.

목업은 loopback HTTP로 제공해 Chromium 1440×940에서 간트·달력 캡처를 육안 확인했다.
모드 전환과 더 보기 클릭 후 5개 예시 일정의 전체 목록이 표시되는 것을 확인했다.
직접 file URL은 환경 브라우저 정책으로 차단되어 로컬 HTTP 경로로 확인했다.
캡처는 무시 경로 `artifacts/stage-03/`에만 있으며 다음 환경에서 남아 있다고 가정하지 않는다.
연도 최댓값 순번·전체 논리 폭, 개발/QA/배포 좌표·기간, 4/5/6주 사례는 Python 표준 날짜 계산과 일치했다.
이는 문서 수치 대조이며 아직 없는 제품 함수의 실행 검증을 뜻하지 않는다.

## 미결정·차단·주의 사항

스테이지 3에서 사용자 확인이 필요한 미결정은 없다. 날짜 범위·일정 개수를 줄이는 제약을 추가하지 않았다.
약 1억 px의 논리 범위를 실제 거대 DOM 너비로 구현하면 안 된다. 선택 연월·전체 범위·보이는 구간을 구분한다.
가상화·키보드 포커스·긴 이름·보조기술·좁은 창/확대·대량 데이터 성능은 후속 실제 검증 대상이다.
목업의 저장·삭제·월 탐색 버튼과 날짜는 고정 예시다. 해당 기능이 구현·검증됐다고 추정하지 않는다.
Electron·SQLite·실제 저장 실패·Windows 설치/업데이트·오프라인·재실행 데이터 보존은 미검증이다.
스테이지 4에서 라이브러리 버전·파일·작업·검증 명령을 계획하고, 제품 구현은 스테이지 5 이후다.

## 다음 단계와 시작 문구

다음은 [스테이지 4 — 구현 계획 확정](../stages/04-implementation-plan.md)이다.
권장 스킬: Superpowers using-superpowers·writing-plans, Wayfinder entry-wayfinder·grilling·domain-modeling.
승인 설계를 다시 질문하지 말고 구현 계획에 필요한 새 결정만 구분한다.

```text
저장소: https://github.com/kdydesign/simple-timeline
Superpowers와 Wayfinder로 스테이지 4만 진행해줘.
최신 main의 AGENTS.md를 읽고 node scripts/harness/run.mjs context 04-implementation-plan
결과의 문서와 docs/wayfinder/handoffs/03-experience.md,
docs/design/domain-rules.md, docs/design/architecture.md, docs/design/storage.md,
docs/design/experience.md, docs/design/visualization.md를 확인해줘.
승인된 요구사항·도메인·저장·화면 설계는 다시 묻지 마.
승인 설계를 파일·작업·검증 명령 수준의 구현 계획으로 나와 확정하고 앱 구현은 시작하지 마.
목업은 설계 자료이며 제품 코드로 재사용하지 마.
완료하면 검증 후 PR 없이 main에 직접 커밋·push하고,
다음 채팅용 인수인계와 최종 커밋을 알려줘.
```
