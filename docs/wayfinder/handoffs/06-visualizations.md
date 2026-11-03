# 스테이지 6 인수인계 — 간트·달력

- 상태: 구현·독립 검토 수정·로컬·Ubuntu/Windows 앱 CI 검증 완료. 스테이지 7은 미착수.
- 기준: main `ad4126c32d6d52f15632873b5e965ba4dc77adf6`에서 승인 Task 6~8 실행.
- 원격 반영: 구현·검토 수정 `e930cd4`까지 PR 없이 main에 직접 commit·push했다.
  이 문서를 포함하는 최종 SHA·원격·최종 CI는 종료 메시지에서 전달한다.

## 이번 단계의 목표와 실제 결과

전체 월 범위의 가상 간트, 월간 달력·3줄/날짜별 전체 목록, 모드·선택 월·편집 입력·scroll anchor와
실제 SQLite CRUD/실패 경로를 통합했다. 극단 연도와 10000개 fixture에서 접근·렌더량을 검증했다.
목업을 재사용하거나 renderer 권한·IPC·DB schema를 늘리지 않았다. 설치 파일은 아직 없다.

## 사용자가 승인한 사항

‘스태이지 6 진행해’로 기존 승인 계획 Task 6~8 실행을 요청했다.
기존 도메인·날짜·저장·화면을 재질문하지 않았다. PR 없는 main 직접 반영 지시를 따랐다.
Windows 지원 환경·배포·서명·제거 정책을 이번 요청으로 승인한 것으로 해석하지 않는다.

## 에이전트가 정한 내부 구현 사항

[실행 기록의 조정과 비용](../../implementation/stage-06.md)을 따른다.
Segment는 원 날짜와 조각 좌표를 별도로 표현한다. 간트/날짜 목록은 viewport 단위로 그리며
키보드로 모든 항목에 접근한다. 업무 날짜·개수 제한은 추가하지 않았다.

## 산출물

- [실행·검토·검증 기록](../../implementation/stage-06.md)
- [간트](../../../src/renderer/components/GanttView.tsx), [달력](../../../src/renderer/components/CalendarView.tsx), [날짜 목록](../../../src/renderer/components/DayScheduleList.tsx)
- [간트 계산](../../../src/visualization/gantt.ts), [달력 배치](../../../src/visualization/calendar.ts), [viewport](../../../src/visualization/viewport.ts)
- [두 모드 E2E](../../../tests/e2e/timeline.spec.ts), [대량/연도](../../../tests/e2e/scale.spec.ts), [실패](../../../tests/e2e/failures.spec.ts), [키보드](../../../tests/e2e/keyboard.spec.ts), [검토 회귀](../../../tests/e2e/review.spec.ts)
- [승인 계획](../../superpowers/plans/2026-11-03-simple-timeline-implementation.md), [티켓](../stages/06-visualizations.md), [상태](../STATUS.md), [지도](../MAP.md)

## 검증

Linux x64·Node 24.22.1·Electron 45.2.1·ABI 150에서 `DISPLAY=:99 npm run verify:app`:
unit 31개×UTC/New_York/Seoul, UI 23개, native 11개, E2E 19개와 타입·production/test build 통과.
모든 DB/Chromium profile은 임시 경로다. `node scripts/harness/run.mjs verify` 7종·회귀 22개도 통과.
로컬 마지막 검증은 `6a61c4c` 기준 dirty 작업 트리였고 검토 수정은 `e930cd4`에 포함했다.
[검토 수정 앱 CI](https://github.com/kdydesign/simple-timeline/actions/runs/41632370013)는 `e930cd4`의 두 OS 모두 통과했다.

1280×800의 핫픽스/10000개 데이터와 640×400의 200% 확대 상당 레이아웃·키보드 CRUD를 실행했다.
관측 시간·CPU·메모리는 실행 기록의 환경/측정 경계를 따른다. 일반 PC SLA나 실제 Windows 배율 검증은 아니다.
보고서·이미지·성능 JSON은 CI artifact에 남으며 로컬 latest는 덮어써진다. 앱 CI는 설치본 검증이 아니다.

최종 문서 반영 직전 로컬 환경이 offline이 되어 GitHub API로 문서를 반영했다.
최종 clean SHA의 앱/하네스 검증은 CI로 확인하고 종료 메시지에서 전달한다.
기존 workspace의 미커밋 README·문서 초안과 scratch는 원격 최종본과 다를 수 있다.
복구 후 변경을 무조건 버리지 말고 대조하거나 최신 main의 새 checkout을 쓴다.

## 미결정·차단·주의 사항

스테이지 6의 미결정·차단 항목은 없다. 검토 중요 3개와 추가 재현 상태 안내 2개는
각각 RED→GREEN 및 전체 suite로 수정했다. 상세 판단은 실행 기록에 있다.
작은 개선: 간트 header/body scrollbar gutter 폭 차이 약 15px로 End의 마지막 막대가 일부 잘릴 수 있다.
원 기간과 이름 버튼 접근은 유지된다. 스테이지 5의 migration 사본 로그와 빌드 도구 advisory도 이전 기록을 따른다.

실제 Windows 설치·오프라인·업데이트·제거·물리 오류·보조기술은 미검증이며 스테이지 7 대상이다.
Task 1~8을 다시 만들지 말고 실제 인터페이스·실행 기록을 이어서 Task 9만 진행한다.

## 다음 단계와 시작 문구

다음은 [스테이지 7 — Windows 설치·오프라인 검증](../stages/07-windows-release.md)이다.

~~~text
저장소: https://github.com/kdydesign/simple-timeline
Superpowers와 Wayfinder로 스테이지 7만 진행해줘.
최신 main의 AGENTS.md를 읽고 node scripts/harness/run.mjs context 07-windows-release
결과의 문서와 docs/wayfinder/handoffs/06-visualizations.md,
docs/implementation/stage-06.md,
docs/superpowers/plans/2026-11-03-simple-timeline-implementation.md,
docs/design/domain-rules.md, docs/design/architecture.md, docs/design/storage.md,
docs/design/experience.md, docs/design/visualization.md를 확인해줘.
기존 승인 사항은 다시 묻지 말고 Task 1~8의 실제 코드를 이어서 Task 9만 진행해줘.
아직 미확정인 Windows 지원 OS/CPU·설치 범위·서명/배포·제거 정책은 나와 확정해줘.
운영 DB 대신 격리된 프로필을 쓰고 실제 Windows 설치·오프라인·업데이트 보존을 검증해줘.
실행할 수 없는 검증은 완료로 추정하지 말고 필요한 사용자 확인과 결과를 기록해줘.
완료하면 검증 후 PR 없이 main에 직접 커밋·push하고 최종 결과·인수인계·커밋을 알려줘.
~~~
