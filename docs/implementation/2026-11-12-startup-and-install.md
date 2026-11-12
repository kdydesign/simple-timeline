# 0.8.1 버튼 재질·로그인 자동 실행·수동 설치 종료

2026-11-12. 사용자 승인 시안과 [확정 설계](../design/windows-login-startup.md)를 따른다. 구현과 독립 검토를 마쳤다. 아래 로컬 검증·Windows CI·실제 사용자 인수 상태를 구분한다.

## 승인 범위

- 편집 패널 삭제·프로젝트 목록 휴지통·공유 참여자 휴지통은 붉은 반투명 유리 재질과 얇은 보더로 통일. 기존 버튼 크기·동작·권한 유지.
- UPDATE는 사용자가 지정한9px 글꼴·5px 모서리·붉은 기본 바탕과 enabled hover `#cf2c2c8c`. 실제 새 버전 조건은 유지하며 강제 미리보기는 제품에 넣지 않음.
- 현재 사용자 로그인 자동 실행 선택, 첫 대화형 선택 기본 체크, 트레이 시작·트레이 메뉴 토글. 기존 선택과 OS 사용 중지 상태를 보존.
- 수동 설치는0.8.1 이상 앱에 종료 요청을 보내 미저장 입력을 버리고 수락한 저장을 마무리. 동일 경로·사용자로 확인된0.8.0에 한해 대화형 수동 설치에서 강제 종료 허용. 기존 앱 내 UPDATE의 미저장 보호 유지.

## 화면 확인

Linux sandbox Electron·격리 임시 프로필에서 기존 편집 삭제 버튼의 computed style이 `rgb(190,18,60)` 단색·gradient 없음인 것을 확인했다. 이전 `:root[data-theme="dark"]` 규칙의 우선순위가 높은 것이 원인이었다. 새 규칙은 해당 specificity에 맞추고, Save의 파란 sheen 대신 붉은 전용 gradient를 사용한다.

변경 후 세 삭제 위치 모두 바탕 `rgba(175,90,101,.18)`, 보더 `rgba(226,145,156,.48)`, 글자 `#f4b4bc`를 확인했다. 프로젝트 편집·목록·실제 참여자 등록 행의 화면을 캡처했다. UPDATE는 검사 중 DOM에 버튼만 추가해 렌더링했으며 다운로드·설치 API를 호출하지 않았다. 기본 `rgba(196,44,44,.42)`와 enabled hover `rgba(207,44,44,.55)`를 확인했다. 캡처와 임시 검사 스크립트는 `/tmp/planrail-actions-before/`, `/tmp/planrail-actions-after/`, `/tmp/planrail-action-preview.cjs`이며 제품 산출물에 포함하지 않는다. Windows 유리 배경·배율 확인과 구분한다.

## 검증 상태

- 스타일 변경 후 `npm run build:test`, `git diff --check` 통과.
- 버전0.8.1 반영 후 기존 release installer 검사6개 통과. 자동 실행·종료 변경 전 결과다.
- 자동 실행·설치 종료 구현 후 단위227개·release26개·typecheck 통과. sandbox Electron 집중15개(폼·로그인 실행·트레이·UPDATE) 통과,46.6초.
- Electron의 두 번째 실행 인자 재배열 때문에 최초 정상 종료 요청 검사가 실패했다. 단일 인스턴스 additionalData로 이미 검증한 경로를 전달하고 수신 측에서도 확인하도록 수정했다.
- 기존 종료 검사의 고정 시간 비교는674ms/700ms 경계에서 실패했다. 제품 timeout을 바꾸지 않고, 테스트 전용 저장 해제 신호로 저장 전 생존·완료 후 종료·DB 반영을 확인하도록 보정했다.
- 공식 체크섬으로 확인한 PowerShell7.4.6 Linux에서 새 스크립트4개 구문과 embedded C#2개 컴파일 통과. Windows5.1·레지스트리·프로세스 API 실행 검증으로 간주하지 않는다.
- 실제0.8.0은 소스 `bde6edf63b8f16f6be4943f864aca2e585339245`로 CI에서 별도 빌드한다. 버전 숫자만 낮춘 새 앱으로 대체하지 않는다. 일회성 Windows VM의 실제 NSIS 페이지·실행 중 교체·자동 실행 설정 보존·제거 검사는 CI 실행 대기다.
- 전체 `verify:app` 1차 통과: typecheck,release26개,3개 시간대의 단위227개씩,UI169개,제품 빌드,native70개,Electron93개(234.1초,skip/flaky0). 실행 기준은 `af86369` 위 dirty 작업 트리이며 Linux x64/Node24.22.1/sandbox 사용. 최종 검토의 경합 보정 뒤 관련 검증을 추가 기록한다.
- 회사 Windows11 로그인·시작 앱 정책·보안 프로그램 환경의 실기는 미검증이다.

## 검토 보정과 남은 범위

독립 검토에서 Windows 네이티브 경로 반환 API의 ANSI 선언을 발견해 명시적 Unicode W 호출로 보정했다. 실제 Windows 회귀 경로에는 이모지를 포함하고 네이티브 프로세스·파일 핸들이 같은 경로를 반환하는지 확인한다. 재검토를 통과했다.

최종 검토에서 수동 설치와 앱 내 UPDATE가 동시에 종료 준비를 하면 UPDATE 실패의 잠금 해제가 수동 설치의 쓰기 차단까지 풀 수 있는 경합을 재현했다. 수동 설치에 영구 종료 차단을 추가해 다른 작업의 rollback이 해제하지 못하도록 보정했다. 실제 두 coordinator를 함께 사용하는 순서별 회귀(UPDATE 준비 중/UPDATE가 먼저 차단), 수락한 저장의 완료, 종료 실패·재시도, 일반 UPDATE 복구를 포함한 단위50개와 타입 검사를 통과했다. 최종 범위 재검토에서 F1 해결과 새 문제 없음이 확인됐다.

미검증/후속 검사는 회사 PC의 실제 로그아웃·로그인, 보안 정책·AppLocker/ConstrainedLanguage 조합, 실제 다른 Windows 사용자 프로세스다. 같은 경로의 실행 중0.8.0에 대한 무인/updated 거부, 미지원 버전 거부, 미등록 legacy→current 무인 전환의 추가 Windows 회귀는 검토에서 nonblocking 보강 항목으로 남겼다. 현재 분기는 대화형 수동 설치·정확한0.8.0만 강제 종료하며, Preserve는 미등록 자동 실행을 새로 만들지 않는다. 단순 소스 검토와 실제 Windows 실행 증거를 구분한다.

최종 재실행 첫 시도에서는 UTC 공유 네트워크3개가 기한 초과하고 시간대 runner60초 제한으로 중단됐다. 하네스 검사가 일부 겹친 실행이었다. 제품 변경 없이 해당 네트워크 파일22개를 단독 재현하자7.02초에 모두 통과했다. 리소스 경합 가능성을 확인하되 근본 원인을 단정하지 않으며, 기한을 늘리거나 검사를 제외하지 않고 전체 검증을 단독 재실행한다. 실패 기록은 `/tmp/planrail081-tz-timeout.log`와 `.json`에 보존했다.

다음 단독 전체 실행은3개 시간대 검사를 통과했으나 기존 공유 변경 알림 UI의 확인창 대기1개가 실패했다(나머지168개 통과). 관련 renderer 알림 로직은 이번에 수정하지 않았다. 해당 파일19개를 단독 재현하자11.43초에 모두 통과했다. 실패 로그 `/tmp/planrail081-ui-intermittent.log`를 보존했으며, 실패 자체를 제외하거나 assertion/timeout을 바꾸지 않고 전체 검증을 다시 실행한다.

추가 재실행은3개 시간대230개씩 통과했으나 다른 기존 공유 알림 UI 사례가5초를 넘었다. 앞선 서울 시간대 전송 사례도10초 제한에서11.45초로 실패한 기록이 있다(`/tmp/planrail081-transport-timeout.log`). 전체 명령 반복 대신 동일 최종 코드의 UI·build·native·Electron을 별도로 순차 확인하고 깨끗한 CI에서 전체 명령을 검증한다. 마지막 로컬 `verify:app` 자체를 통과로 표기하지 않는다.

최종 코드의 개별 순차 확인: UI169개(100.86초),제품 build,native70개(14.48초) 통과.3개 시간대 단위230개씩은 직전 전체 실행에서 통과했고, 타입·release26개도 통과했다. Electron 전체 결과는 아래에 기록하고 Windows CI 결과는 후속 반영한다.

최종 개별 순차 Electron93개도235.32초에 모두 통과했다(skip/flaky0). 최종 소스에 대해 typecheck,release26개,3개 시간대 단위230개씩,UI169개,build,native70개,Electron93개를 각각 확인했다. 다만 마지막 로컬 통합 wrapper의 간헐적 실패는 위 기록대로 유지하며, Windows 설치 및 깨끗한 Linux/Windows 통합 결과는 CI 대기다.

## 커밋·CI

제품 커밋 `bb3da63f21847c0a53f3e01b6ad038c3f4e986b4`를 main에 반영했다. [Repository harness43135614569](https://github.com/kdydesign/simple-timeline/actions/runs/43135614569)는 Linux·Windows 모두 통과. [Application43135614492](https://github.com/kdydesign/simple-timeline/actions/runs/43135614492)의 Linux job130910118041은 깨끗한 checkout에서 `verify:app`7단계 전체 통과(01:36:30~01:42:20UTC). 로컬 간헐 실패 기록과 구분하며 Windows 결과는 이어 기록한다.

Windows job130910118385는 타입·release·3TZ·UI·build·native를 모두 통과했다. Electron은 assertion 실패 없이82개 통과 후 전체240초 제한의 `ETIMEDOUT`/`SIGTERM`으로 중단됐다. artifact13907582301의 `app/latest.json`에서 clean `bb3da63`,win32 x64,Node24.22.1을 확인했다.93개 순차 검사에 맞춰 전체 E2E 예산만360초로 보정한다. 개별 테스트·요청 deadline과 assertion은 그대로다. Linux 전체 통과와 분리해 기록하며 새 CI에서 Windows 설치 단계까지 검증한다.

예산 보정 커밋 `c6d3dd2`의 CI43137023832는 runtime 실행 전 release 검사에서 중단됐다. 기존 `tests/release/native-runner.test.mjs`의 E2E240초 기대값을 함께 갱신하지 않은 누락이었다. 예산 기대값·테스트 명칭을 보정하고 release26개 전체를 재검증한다. 제품 동작 변경은 없다.
