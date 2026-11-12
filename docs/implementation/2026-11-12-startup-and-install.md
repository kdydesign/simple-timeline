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

`73ed583`의 [Application43137367288](https://github.com/kdydesign/simple-timeline/actions/runs/43137367288)는 Linux 및 Windows `verify:app` 전체를 통과했다(Windows job130915813755,01:53:14~02:00:44UTC). 이어지는 실제 NSIS 컴파일에서 옵션 페이지의 top-level 함수가 플러그인/기본 변수 초기화 전에 확장되어 `StdUtils::TestParameter` plugin-not-found로 실패했다. 설치 산출물은 아직 제공하지 않았으며 함수 정의를 builder 초기화 뒤의 확장 지점으로 이동해 검증한다.

NSIS 함수/변수 정의를 `customHeader`로 지연했다. builder26.18.0의 비동기 header 생성에서 custom include가 pluginDir보다 먼저 나올 수 있는 순서와 common.nsh의 실행 파일 정의 시점을 확인했다. `node --use-env-proxy scripts/testing/nsis-compile-smoke.mjs`는 pinned NSIS3.0.4.1/resources3.4.1과 실제 builder 설치·제거 템플릿으로 원본 RED 및 수정 GREEN을 확인한다. Linux 컴파일 전용이며 생성 EXE는 실행하지 않는다. Windows 설치 실행은 후속 CI에서 확인한다.

`f4059c0`의 [Application43140123393](https://github.com/kdydesign/simple-timeline/actions/runs/43140123393)에서 Linux 전체 검사와 별도 Windows/Linux 하네스는 통과했다. Windows는 첫6단계 및 Electron92개 통과 후 기존 UPDATE 회귀의 설치 인계 기록 assertion이 실패했다(`updates.spec.ts:22`, 기대 shutdown/handoff-failed, 실제 빈 배열). 설치 빌드 단계에는 도달하지 않았다. 실패 artifact13909771742를 보존하고 설치 전 실패 원인을 조사한다.

실제 원인은 UPDATE의 `onInstalling`이 파일 기록보다 먼저 renderer 쓰기 차단 상태를 알리는 데 있었다. 기존 검사는 이 중간 배너를 완료 신호로 사용했다. 테스트 fixture의 실제 record 단계를 보류하자 같은 빈 trace assertion 실패를 결정적으로 재현(RED4.5초)했다. 중간 상태도 검증한 뒤 record를 해제하고 기존 install Promise의 완료·정확한 최종 상태/오류/trace를 확인하도록 테스트2개 파일만 수정했다. dirty 입력·재시작·데이터 보존 assertion은 유지. sandbox Electron 집중1개 GREEN5.6초, 타입·diff 검사 통과; 독립 범위 검토도 통과했다. 제품 timeout·종료 로직 변경은 없다.

`a3820a6`의 [Application43141933177](https://github.com/kdydesign/simple-timeline/actions/runs/43141933177)는 Windows/Linux 전체 앱 검사와 Windows 설치본4종 빌드를 통과했다. 실제 package 설치·오프라인·업데이트·DB 보존(57.9초), 기존 자동 UPDATE·재실행(19.3초)도 통과했다. 새 startup 검사는 Windows PowerShell5.1의 `Get-ExecutionPolicy`가 상위 PowerShell7 모듈 경로를 상속받아 Microsoft.PowerShell.Security를 불러오지 못하면서 시작 전 중단됐다. artifact13910153533에 결과를 보존했다. 정책을 바꾸지 않고 자식 엔진의 기본 모듈 경로를 사용하도록 보정한다.

WindowsPS 자식의 PSModulePath만 대소문자 무관하게 제거하고, 묶음 helper는 첫 cmdlet 전에 해당 엔진의 `$PSHOME/Modules`로 모듈 탐색을 제한했다. NSIS도 로컬 프로세스의 이 변수만 정리해 기존0.8.0 제거 프로그램에 PS7 경로가 전달되지 않게 했다. ExecutionPolicy·AppLocker/CLM 및 Windows 전역 환경은 그대로다. 실제 runtime 자식 환경 전달을 포함한 집중6개·타입·release6개·PowerShell구문4개/C#컴파일2개·NSIS설치/제거 컴파일 통과. Windows검사에는 실제5.1 버전·모듈 preflight와 의도적으로 PS7 경로를 주입한 helper 회귀를 추가했다.

`9072302`의 [Application43144903705](https://github.com/kdydesign/simple-timeline/actions/runs/43144903705)는 양 OS 전체 앱 검사·설치본 빌드·기본 설치/UPDATE 검사를 통과했다. startup artifact13912690614에서 실제 WindowsPS5.1.26100.33648·ANSI1252·기본 모듈 로드·PS7경로 주입 회귀와 다른 경로 프로세스 보존까지 통과한 것을 확인했다. 이후 네이티브 경로 검사에서 handle 정규 경로를 원시 GetFullPath 문자열과 비교한 assertion이 실패했다. 제품은 양쪽 경로를 정규화해 비교하고 있어 검사 기준을 독립적인 Node native realpath와 대조하며 보정한다. 강제 종료 단계 전 실패이며 전체 startup lifecycle 통과로 간주하지 않는다.

네이티브 경로 검사는 Node `realpathSync.native`를 독립 기준으로 사용하고, 파일 핸들·프로세스 핸들 양쪽 결과의 정확한 일치·이모지 보존·SID/생성시각 거부를 유지했다. 원시/Node/Windows 경로를 ASCII-safe 진단으로 먼저 기록한다. 이전 artifact에는 실제 네이티브 값이 없어 특정 junction이 원인이었다고 단정하지 않는다. 추가로 pinned MUI Finish.nsh에서 완료 페이지의 실행 체크박스가 중첩 nsDialogs의 동적 컨트롤임을 확인해, 테스트 드라이버의 고정1204 번호 가정을 실제 체크박스 탐색·해제 확인으로 교체했다. 제품 코드는 변경하지 않았다.

`68265ba`의 [Application43148139405](https://github.com/kdydesign/simple-timeline/actions/runs/43148139405)에서 양 OS 앱 전체·모든 설치본 빌드·기본 설치/자동 UPDATE 검사는 통과했다. 추가된 경로 진단이 실제 원인을 확정했다: Playwright `instance.process().pid`는 Windows에서 Electron이 아닌 `C:\Windows\System32\cmd.exe` 실행 래퍼를 가리켰다. 파일 정규 경로의 이모지 검사는 통과했고 프로세스 비교만 실패했다. Electron main에서 직접 조회한 PID로 native 검사를 수행하며, 다른 경로/잘못된SID·생성시각 검사 뒤에도 main 응답으로 생존을 확인하도록 보정한다. 제품의 프로세스 탐색은 자체 Windows API를 사용하므로 이번 PID 가정 문제는 테스트에 한정된다.

`cb30cf7`의 [Application43150331226](https://github.com/kdydesign/simple-timeline/actions/runs/43150331226)는 앱 전체·빌드·기본 설치 검사를 통과했다. artifact13914855452에서 실제 Electron PID7140(launcher5720), Node/파일핸들/프로세스핸들 경로 일치, Unicode·SID·생성시각 거부·실제 main 생존까지 확인했다. 첫 ACL-denied 설치 화면 검사는120초 뒤 `Planrail 설치:설치:True`에서 중단됐으며, 잔류 설치 프로세스 때문에 정리 EBUSY와 다음 UPDATE 설치 실패가 연쇄 발생했다. 설치 UI 상태 진단·실패 정리를 보강해 원인을 확인하며 전체 설치 검증 완료로 표시하지 않는다.

Windows의 BM_CLICK은 비활성 대화상자에서 실패할 수 있어, 테스트 드라이버를 활성화 가능한 실제 버튼의 소유 대화상자로 보내는 WM_COMMAND/BN_CLICKED로 보정했다. 이전 artifact에 창 상태가 없어 그 원인으로 단정하지 않는다. 실패 때 소유 설치 프로세스/창/컨트롤/입력 이력·화면을 먼저 저장하고 일회성 VM에서 해당 설치 트리만5초 범위로 정리한다. 테스트 finally는 원래 오류를 보존하고 정리 실패를 별도 기록한다. ACL 거부 assertion·120초 기한·제품 종료 조건은 유지하며 독립 범위 검토를 통과했다.

`26ef5f6`의 [Application43153912893](https://github.com/kdydesign/simple-timeline/actions/runs/43153912893)는 양 OS 앱 전체·빌드·기본 설치·자동 UPDATE를 통과했다. artifact13916395607의 설치 화면 진단으로 실패 원인을 확인했다: 예상한 권한 거부 안내가 정상 표시됐지만 OK 버튼 ID가2였고 드라이버는1만 찾았다. 또한 페이지 전환 중 queued 입력이 중복되어 옵션 페이지를 지나친 이력이 있었다. 설치 종료 보호 자체는 정상 작동했으며, 테스트 실패 정리는 오류 없이 완료돼 다음 UPDATE 검사는 통과했다. 단일 OK 모달 처리와 안정된 페이지별 한 번의 입력으로 검사 도구를 보정한다.

드라이버는 실제 보이는 내부 페이지 HWND별로 안정된 컨트롤 스냅샷2개를 확인한 뒤 한 번만 진행하며, 제목/버튼 문구 변화로 재입력하지 않는다. 소유 모달의 유일한 활성 OK/확인 버튼은 컨트롤 번호와 무관하게 처리한다. 동기식 SendMessageTimeout으로 큐 중복을 막고, 실제 시작 옵션을 확인하기 전 설치를 진행하지 않는다. `pwsh -NoProfile -File scripts/testing/windows-installer-ui-state.test.ps1`로 실제 결정 클래스를 재현해 RED12실패→GREEN17확인을 기록했다. PowerShell구문4개/C#컴파일2개·diff 검사를 통과했고 제품·ACL 거부 조건·시간 제한은 변경하지 않았다.

`20640d8`의 [Application43157196698](https://github.com/kdydesign/simple-timeline/actions/runs/43157196698)는 양 OS 앱 전체·빌드·기본 설치·자동 UPDATE를 통과했다. artifact13916872948에서 실제 옵션 페이지의 기본 체크와 ACL 거부 시 설치 중단·원본 보존까지 확인했다. 다음 실행 중0.8.0 교체는 UI timeout 없이 종료 확인 오류(exit2)로 중단됐다. 현재 NSIS가 helper의 구체적인 오류를 일반 안내로 대체하므로 정확한 종료 단계 원인은 미확정이다. helper 오류와32비트 WindowsPS 읽기 전용 진단을 확보하며, 프로세스 경로·SID·버전·핸들 검증을 완화하지 않는다.

종료 확인 helper의 실패 단계·줄번호와 기존 캡처된 오류를 설치 실패 안내에 추가했다. 실제 설치기와 같은32비트 WindowsPS 및64비트 엔진에서 PE버전·CIM경로·네이티브 핸들 정보를 읽기만 하는 CI 진단도 추가했다. 이 변경은 실패 원인 확보용이며 종료 권한·동작·기한을 변경하지 않는다.
