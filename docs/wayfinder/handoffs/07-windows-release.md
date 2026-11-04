# 스테이지 7 인수인계 — Windows 설치·오프라인 검증

- 상태: 완료. 2026-11-04 사용자 확인과 인수 범위 조정에 따라 기본 설치 인수 범위의 MVP를 마무리했다.
- 기준: 스테이지 6 최종 main `5a502e25ad3e1a1baf988549d2cc71cb2ec54678`에서 승인 Task 9만 실행했다.
- 현재 패키징 소스: `036ee001e664904eaf964677798451d9c52f6b57`.
- 원격 반영: 패키징·검증 소스는 PR 없이 main에 직접 commit·push했다.
  이 문서를 포함하는 최종 커밋은 종료 메시지에서 전달한다.

## 이번 단계의 목표와 실제 결과

사용자별 NSIS 설치본, ASAR 밖 SQLite native binding 검사, 정확한 버전·소스 SHA·SHA256 manifest,
실제 제품 앱의 설치·오프라인·업데이트·제거 보존 검증과 비공개 CI artifact를 구성했다.
앱의 화면·도메인·IPC·DB schema는 변경하지 않았다.
사용자가 각 설치본의 해시 일치·관리자 요청/보안 경고 없는 설치/실행·업데이트 후 데이터 유지·정상 제거·
제거 후 재설치/재실행의 데이터 유지를 보고했다. 상세 검증은 별도 진행하겠다는 사용자 결정으로 이번 MVP 인수를 마무리한다.

## 사용자가 승인한 사항

Windows 11 x64, 관리자 권한 없이 현재 사용자에게 설치, 제거 후 DB 보존,
서명 없는 비공개 GitHub CI 설치본을 선택했다. SmartScreen·알 수 없는 게시자 경고 가능성을 안내했다.
기존 승인 요구사항을 다시 묻지 않는다. PR 없이 검증 후 main 직접 commit·push하는 지시를 유지한다.
2026-11-04 사용자는 기본 설치·실행·제거 관련 검증만 진행했으며 상세 개선·오류 사항은 별도로 진행한다고 밝혔다.
이는 이번 MVP의 인수 범위 조정이다. 오프라인·날짜·저장 기능 요구나 구현을 변경하지 않는다.

## 에이전트가 정한 내부 구현 사항

고정 builder schema에 따라 one-click·perMachine=false를 사용한다. 앱은 자동 실행하지 않는다.
서명을 생략하되 exe metadata 편집은 유지한다. 가상 다음 버전은 별도의 UPDATE-TEST-ONLY artifact다.
dirty source나 이전 release output이 있으면 잘못된 SHA 귀속을 막기 위해 빌드를 거부한다.
실제 패키징 테스트는 기존 프로필이 없는 GitHub-hosted VM에서만 실행하며 제품 테스트 API를 추가하지 않는다.
방화벽은 제품 exe의 outbound만 차단하고 새 요청 실패를 확인한다. 전역 보안 기능을 끄지 않는다.

## 산출물

- [배포 정책](../../release/policy.md), [설치·사용 안내](../../release/user-guide.md)
- [Windows 검증 근거](../../release/windows-validation.md), [Windows 11 실기 기록](../../release/manual-checklist.md)
- [사용자 결과·인수 범위·후속 목록](../../release/user-acceptance.md)
- [실행·검토 판단](../../implementation/stage-07.md)
- [builder 설정](../../../electron-builder.yml), [빌드](../../../scripts/release/build-windows.mjs), [출처 검사](../../../scripts/release/source-identity.mjs)
- [ASAR 검사](../../../scripts/testing/packaged-smoke.mjs), [실제 설치 lifecycle](../../../tests/e2e/packaged.spec.ts)
- [Application CI](../../../.github/workflows/app.yml), [승인 계획](../../superpowers/plans/2026-11-03-simple-timeline-implementation.md)
- [티켓](../stages/07-windows-release.md), [상태](../STATUS.md), [지도](../MAP.md)

## 검증

[소스 036ee00의 Application CI](https://github.com/kdydesign/simple-timeline/actions/runs/41732699780)는
두 OS 앱 회귀와 Windows 설치 lifecycle을 통과했다.
Windows Server 2025 build 26100 x64에서 실제 설치·exe outbound 차단·오프라인 수정/삭제·재실행,
0.1.0→검증 전용 0.1.1 업데이트·제거 후 DB hash 유지·재설치 snapshot 유지가 통과했다.
정확한 exe 이름·SHA256·다운로드·복사한 실제 결과 JSON은 [Windows 검증 근거](../../release/windows-validation.md)에 고정했다.
[Repository harness CI](https://github.com/kdydesign/simple-timeline/actions/runs/41732699802)는 통과했다.
로컬 `DISPLAY=:99 npm run verify:app`도 소스 036ee00·문서 dirty 작업 트리에서 통과했다.
release 11·unit 31×3TZ·UI 23·native 12·E2E 19·타입·빌드다.
하네스 검증과 로컬·CI 앱 회귀, 설치 파일 생성, 실제 제품 실행, 지원 Windows 실기 결과를 구분한다.
이전 실패의 원인과 실제 도달 단계는 실행 기록에 남겼으며 이후 성공을 추정하지 않았다.
문서 커밋 `47000d6`의 [Application CI](https://github.com/kdydesign/simple-timeline/actions/runs/41734369335)와
[Repository harness CI](https://github.com/kdydesign/simple-timeline/actions/runs/41734369140)도 통과했다.
사용자는 앞서 고정해 전달한 036ee00 설치본을 확인했으며 새 문서 커밋의 설치본을 확인한 것으로 바꾸지 않는다.
이번 종료 변경은 사용자 결과·범위·진행 문서만 수정한다. 하네스 검증의 최종 결과와 커밋 SHA는 종료 메시지에서 전달한다.

## 미결정·차단·주의 사항

제품 정책의 미결정 사항과 이번 인수 범위의 차단 사항은 없다.
Windows 정확한 빌드·계정 종류·네트워크 차단 여부·오프라인 최초 실행/신규 생성 전체·100%/200%·Narrator·
격리된 물리 오류 경로는 미보고/미실행이다. 사용자 결정으로 상세 후속 작업에 남겼다.
Windows Server 관리자 CI나 native 오류 주입 검사가 이를 대신하지 않는다.
기본 설치 인수 완료를 상세 검증 전체 통과나 모든 Windows 11 환경의 동작 보장으로 해석하지 않는다.

독립 검토는 한 번 완료했고 중요한 cache probe·출처 검사는 RED→GREEN으로 수정했다.
방화벽 cleanup 실패 시 최종 JSON/프로필 정리가 중단될 수 있는 작은 보완은 남겼다.
기존 약 15px 간트 gutter·migration 사본 로그·도구 advisory도 유지한다.
전체 판단·보류·검토 제외 범위는 실행 기록을 따른다. Task 1~8 재감사나 임의 규모 성능 보장은 없다.
공개 release·코드 서명·다른 OS/CPU·자동 업데이트·수동 백업은 승인 범위 밖이다.

## 다음 단계와 시작 문구

현재 MVP 지도는 마무리했다. 상세 개선·오류 검증은 새 요청에서 별도 범위를 정한다.
추가 설치 확인이나 스테이지 7 재개를 기본 조건으로 요구하지 않는다.

~~~text
저장소: https://github.com/kdydesign/simple-timeline
Superpowers와 Wayfinder로 MVP 이후의 상세 개선·오류 작업을 진행해줘.
최신 main의 AGENTS.md를 읽고 node scripts/harness/run.mjs context로 현재 상태를 확인해줘.
현재 지도는 완료됐으니 context에 활성 스테이지가 없더라도 스테이지 7을 재개하지 마.
docs/wayfinder/handoffs/07-windows-release.md, docs/release/user-acceptance.md,
docs/release/windows-validation.md, docs/implementation/stage-07.md를 확인해줘.
기본 설치 인수는 완료됐고 상세 개선·오류 검증은 별도 진행하기로 했어.
기존 승인 정책은 다시 묻지 말고 이번에 전달할 개선점/오류의 범위와 재현부터 정리해줘.
검증하지 않은 항목은 통과로 추정하지 마. 요청 범위만 작업하고 검증 후 PR 없이 main에 직접 commit·push해줘.
~~~
