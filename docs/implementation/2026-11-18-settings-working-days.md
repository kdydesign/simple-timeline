# 0.8.8 설정 탭·개인 휴일·워킹데이

2026-11-18. [Q10 승인 설계](../design/settings-and-working-days.md), [구현 계획](../superpowers/plans/2026-11-18-settings-working-days.md). 기준 커밋19e31b8에서 구현했다. 로컬 검증 결과와 한계는 아래에 보존하며, 최종 제품 소스의 원격 CI 결과는 마지막 항목에 구분한다.

## 변경과 데이터 경계

- 제목 표시줄 설정 아이콘·구분선, 기본/공유 탭. 일반 진입은 기본, 승인 알림은 공유 탭. 트레이 상태는 표시 전용이다.
- 호스트 기본 탭은 배포·공통·개인 휴일, 멤버는 개인·수신 공통 조회, 개인 전용은 개인 휴일이다. 숨긴 탭도 마운트해 초안을 유지하고 닫을 때 폐기한다.
- SQLite migration8은 독립 `personal_holidays` singleton을 만든다. 기본 토·일, 기존 공통 원본·수신 캐시·프로젝트·승인 자격을 유지한다. 같은 출처 기간 겹침은 검증하고 원자적으로 저장한다.
- 로컬 IPC `savePersonalHolidays`만 개인 표를 갱신한다. LAN 두 휴일 엔드포인트는 기존 공통 원본만 읽으므로 개인 변경이 응답·ETag·공유 변경 이벤트를 바꾸지 않는다.
- 표시용 합집합은 저장·전송하지 않는다. 반복 요일을 합치고 이름은 출처별로 유지한다. 워킹데이는 주 단위 산술과 최대2,000개 이름 있는 날짜의 집합으로 계산한다. 날짜0001~9999를 모두 순회하지 않는다.
- 개발 멤버 플래그는 unpackaged development에만 적용한다. `PlanrailDev/member` 프로필과 updater 캐시를 운영과 분리한다. 실제 설치 인계·Windows 자동 실행 등록은 제공하지 않는다.

## 도움말 검토

기존26개 항목을 점검하고 설정·개인 휴일2개를 추가했다. 시작하기, 프로젝트/일정, 간트 이동/배율/드래그, 달력, 날짜 알림, 창/트레이, 설치/UPDATE, 오류, 도움말/릴리즈노트, 호스트/멤버 연결·승인·권한·버전·접속 상태·동기화·알림·배포·연결 해제·문제 해결을 대조했다.
설정 진입, 배포 위치, 개인 휴일 비공개·보존, 출처 표시, PC별 워킹데이 차이를 보정했다. 기존 확인창·초안 폐기·알림 제한·Windows 환경 한계를 유지한다.
14개 이미지는 가상 데이터와 일회성 SQLite 프로필을 사용하는 실제 Electron renderer에서 촬영했다. `src/renderer/help/images/capture.json`에 source SHA·dirty·버전·명령을 남겼다. unpackaged 런타임은0.0이며 소스 버전0.8.8과 구분한다.

## 검증 결과

- Domain RED→GREEN: 합산/중복/전 요일/윤일/전체 날짜 범위. UI RED→GREEN: 설정 진입·두 초안·워킹데이 반영. IPC/개인 저장·개발 프로필도 RED→GREEN.
- UI 계약 회귀57개 통과. 숨긴 탭 오류 중복 표시와 이전 테스트의 탭 위치·포커스 기대를 수정했다.
- 실제 Electron 화면: 설정 탭·붉은 선택, 월 목록 포털, 공통/개인 출처 tooltip, 일정 워킹데이, 도움말 이미지 촬영 확인.
- 첫 native 재검사에서는 새 API를 포함하지 않은 이전 out/preload를 읽어 security검사가 실패했다. build:test가 아닌 제품 build 후 다시 검사한다. 검사를 건너뛰지 않는다.
- 독립 최종 검토의 Important4건을 재현·수정했다. 설정 상태 조회 실패 시 제목 설정 버튼을 비활성화하고 화면 inert 잠금을 막았다. 승인 요청은 한 번만 소비하여 일반 재진입을 기본 탭으로 돌린다. 승인 취소는 DB의 취소 상태를 확인하므로 오프라인 재시작/절전 복귀에도 공통 기본 토·일을 되살리지 않는다. 정상 인증된 동기화 후에만 취소 상태를 해제한다. 보안 E2E의 정확한 API 허용 목록에 새 개인 휴일 명령을 추가했다.
- 수정 회귀 UI15/15, 실제 Electron E2E8/8 통과. 월 목록은 Radix가 스크롤 컨트롤을 배치한 뒤 실제 클릭 중심점이 노출되는지 기다려 검사한다. 기존 단발 hit test가 배치 도중 검사한 실패를 동작 우회 없이 보정했다.
- 실제 `npm run dev:member`를 임시 XDG_CONFIG_HOME에서 실행했다. 분리 DB 생성, 운영 SimpleTimeline 경로 미생성, 기본 멤버 선택과 자동 승인되지 않은 개인 역할을 확인하고 임시 프로필/프로세스를 정리했다.
- 최종 순차 검사에서 typecheck·test:release·test:tz(294건×3개 시간대)·test:ui(207건)·제품 build·test:native(89건)가 통과했다. 전체 Electron E2E는104/106 통과했고 calendar-preview·reminders의 테스트 프로세스 종료 대기에서 실패했다. 실패한 verify:app 보고서를 성공으로 덮어쓰지 않는다.
- 원인 분리: 해당 파일2회 반복은11/12 통과했고, 실패는 다른 사례의 Electron launch timeout이었다. 최소 Electron 앱20회는 모두 통과했다. 동일 DEBUG=pw:api 조건에서 기준19e31b8 archive와 현재 코드로 각각18회 반복하여 모두 통과했다. 원인을 확정하지 못했으므로 제품 종료 코드를 추측으로 수정하거나 간헐 실패가 해결됐다고 주장하지 않는다.
- Ruling: 중요 검토4건과 기능 회귀는 모두 통과했고 위 실패는 기능 assertion이 아닌 프로세스 수명 단계다. 이 증거와 실패 기록을 보존한 상태로 통합 커밋하고, 격리된 Linux/Windows CI의 전체 검사로 추가 검증한다. 비용은 로컬 verify:app 전체 성공을 주장할 수 없고 CI 실패 시 후속 수정이 필요하다는 것이다.
- 보존 로그: `/workspace/output/settings-verify-final.log`, `settings-exit-reproduction.log`, `settings-baseline-exits.log`, `settings-current-exits-debug.log`, `settings-electron-probe.log`. 앱 전체 보고서는 `artifacts/app/latest.json`에 base SHA·dirty·failed 상태를 유지한다.

## 남은 실기 범위

Windows 설치 호스트+dev:member 동시 실행, 회사 LAN/IP/방화벽/DPAPI, OS 유리 효과·배율과 Windows 알림은 Linux 화면 검사로 대체하지 않는다. 시작·도움말 최초13초 지연은 이번 변경 범위 밖이다.


## 검토에서 분리한 후속 개선

- 개발 멤버의 실제 업데이트 설치는 차단하지만, UI는 일반 설치 오류·재시도 안내를 사용한다. 개발 전용 안내와 버튼 구분은 이번 변경에서 보류했다.
- 휴일 두 표의 요일 합집합 규칙은 도움말에 설명했다. 설정 영역에 추가 설명 한 문장을 넣는 문구 개선은 보류했다.
- 이미지 촬영의 임시 버전 참조는 촬영 후 제거했으며, 변경은 상호 의존하는 API·UI·도움말을 하나의 기능 커밋으로 묶는다. 중간 단계별 커밋 대신 RED→GREEN과 검증 기록을 보존한다.


## 최종 제품 소스의 원격 CI (2026-11-18 확인)

제품 소스: `8a11bed1dacf158bc847832d4c26aa3642b93f5f` (0.8.8). 이후 문서 보정 커밋과 설치본 소스를 구분한다.

- [Application 실행 44218578815](https://github.com/kdydesign/simple-timeline/actions/runs/44218578815): Linux job `134514489721`, Windows job `134514489983` 모두 success. 각각 전체 `verify:app`을 통과했다.
- Windows job은 현재 NSIS 설치본, 고정 소스의 실제 0.2.1·0.8.0 설치본, 검증용 다음 버전 설치본 빌드와 실제 NSIS lifecycle 검사·artifact 업로드까지 success다. 배포용 파일은 [Windows 검증 기록](../release/windows-validation.md#planrail-088)에 고정한다.
- [Repository harness 실행 44218578827](https://github.com/kdydesign/simple-timeline/actions/runs/44218578827): 같은 소스의 Windows·Linux 모두 success.

위 CI 성공은 로컬 `verify:app`의 104/106 실패 기록을 대체하지 않으며 간헐적 launch/종료 지연의 원인 해결을 뜻하지 않는다. 회사 Windows에서 설치 호스트와 개발 멤버의 동시 실행, 실제 LAN·보안 정책·OS 외형·알림 인수는 여전히 미검증이다. 최초 도움말 지연도 해결됐다고 보고하지 않는다.

## 설정 스타일 후속 보정 (2026-11-18)

사용자가 지정한 7개 스타일 변경을 반영했다. 기준은 `fd22140ece94342e404db6c00991367b6495de3c` 위의 작업 트리이며 버전·기능·API·데이터는 변경하지 않는다. Superpowers의 명확한 소규모 요청 경로와 frontend-design을 적용해 기존 다크 그레이·유리 재질, 서체·색상은 유지하고 간격과 아이콘만 보정했다.

| 항목 | 반영 위치·값 |
| --- | --- |
| 제목 표시줄 | `forest-crystal.css`의 `.titlebar`에 `margin-top: 4px` |
| 설정 아이콘 | 기존 의존성 `lucide-react`의 `Settings`, 기존 `.icon` 크기·1.6 선 굵기·currentColor 유지 |
| 확인창 덮개 | `planrail.css`의 `.confirm-overlay`에 `inset: 52px 0 0` |
| 업데이트 배포 | `.update-distribution`의 `border-top: 0px !important` |
| 설정 섹션 | `display: grid`, `gap: 2px`, `border-top: 1px solid var(--border)`, `padding-top: 4px` |
| 휴일 섹션 | 이미 있는 `section.holiday-settings`에 `margin-top: 18px`. 연속 섹션의 기존 18px padding override를 제거해 공통·개인 모두 4px padding 적용 |
| 설정 설명 문구 | Radix 자동 생성 ID 대신 `.sharing-settings-description`을 붙이고 설정 범위에서 `margin: 0 0` |

실제 Linux Electron을 일회성 SQLite 프로필·sandbox 유지 상태로 열어 변경 전후 화면을 비교했다. 호스트 기본 설정의 공통·개인 휴일 모두 계산된 margin/padding/gap이 18/4/2px이고, 배포 상단 선 0px·설명 상하 margin 0px·제목 margin 4px·overlay inset 52px도 확인했다. 증거는 `/workspace/output/settings-style/`의 `before.png`, `after.png`, 각 JSON에 있다. 초기 캡처 도구의 임시 프로필 이름이 테스트 진입점의 허용 접두사와 맞지 않아 창 생성 대기를 넘겼으며, 도구의 접두사만 수정한 뒤 양쪽 촬영을 완료했다.

화면의 업데이트 배포 오류 문구는 변경 전후 모두 같은 격리 fixture에 표시된 상태로, 이번 스타일 보정의 업데이트 기능 성공 근거가 아니다. Windows 설치 화면·OS 투과 효과는 미검증이다. CI 금지 요청을 유지하여 push·원격 workflow 실행은 하지 않는다. 로컬 전체 검사 결과는 아래에 기록한다.

로컬 검증 결과:

- 최초 `verify:app`은 타입·release·3개 시간대 날짜 검사를 통과했지만 UI 205/207로 중단됐다. `improvements.test.tsx`의 테마 복원·날짜 선택기 2건이 5초 제한을 넘었으며 뒤의 build/native/E2E는 미실행이었다. `/workspace/output/settings-style/verify-first.json`, `ui-first.log`에 원래 실패를 보존했다.
- 같은 파일을 현재 작업 트리와 기준 커밋의 별도 archive에서 각각 실행해 5/5 통과했다. 현재 5.17초·기준 5.54초의 파일 전체 실행이며 최초 2건의 시간 초과 원인은 확정하지 못했다. 제품 동작·테스트·제한 시간은 추가 수정하지 않았다.
- 동일 작업 트리에서 `DISPLAY=:121 npm run verify:app` 재실행은 7단계 모두 PASS: 타입, release 26, 날짜 294×3 시간대, UI 207, 제품 build, native 89, Electron E2E 106. 결과는 `artifacts/app/latest.json`의 기준 SHA `fd22140...`, dirty=true, Linux x64·Node 24.22.1에 해당한다. 전체 로그는 `/workspace/output/settings-style/verify-retry.log`다. 재통과를 간헐 지연 원인 해결로 확대하지 않는다.
- 문서 하네스·공백 검사도 통과했다. 새 의존성·제품 버전·CI 설정은 변경하지 않았고, 원격 CI와 push는 실행하지 않았다.

## 스타일 push 이후 CI 실패 보정 (2026-11-18)

이후 사용자가 push와 새 설치 파일 생성을 명시적으로 요청했다. 소스 `7754487`의 [Application 44237307859](https://github.com/kdydesign/simple-timeline/actions/runs/44237307859)는 Windows에서 서로 다른 E2E 실패로 두 번 중단되어 설치본과 LAN-UPDATE를 생성하지 못했다. Linux 및 Repository harness는 통과했다.

- 첫 Windows job `134576426841`: `sharing.spec.ts`의 최초 연결에서 7초 안에 `connected`가 되지 않고 `connecting`에 머물렀다. 105/106 통과. 같은 로컬 시나리오도 3회 중 1회 실패했다.
- 두 번째 Windows job `134587782522`: 공유 테스트는 통과했지만 `help-assets.spec.ts`의 캡처 후 fixture 정리에서 Electron `close` 이벤트 10초 대기가 실패했다. 105/106 통과. 제품 build와 native 검사까지는 두 번 모두 통과했다.

테스트 전용 계측으로 자격 수령/저장 완료(`ready`)와 첫 snapshot 사이에 실제로 2초 폴링 간격이 있음을 확인했다. 두 단계를 합쳐 하나의 7초 제한으로 기다리던 최초 연결 검사를 자격 수령 완료(`pendingPair === null`)와 첫 동기화 완료로 나눴다. 각 assertion의 7초, 제품의 요청 5초·폴링 2초, 연결 후 변경 전파 검증은 유지한다. 최초 실패에서 개별 요청이 얼마나 걸렸는지는 당시 로그가 없어 확정하지 않는다.

종료 helper는 `app.exit()`를 먼저 호출하고 디버거 연결 해제를 Playwright의 stderr 종료 문구 감지에 의존했다. 실제 Electron의 해당 문구만 가리는 회귀 검사에서 동일한 10초 timeout을 재현했다. fixture에만 강제 종료 정책을 설치한 뒤 `app.close()`가 종료 요청과 inspector 해제를 함께 소유하도록 변경했다. 요청 오류를 무시하지 않고 종료 이벤트와 함께 await한다. 원래 Windows 실패에서 문구가 누락됐는지까지 확인된 것은 아니며, 보정 전 일반 캡처 반복 30개는 통과했다.

제품 Exit·저장 완료 대기·사용자 데이터·프로덕션 코드는 변경하지 않는다. 종료 fixture 검사는 미저장 입력, 중복 dispose, 이미 종료된 프로세스, stderr 문구 누락을 검증한다. 회귀 검사는 보정 전 FAIL, 보정 후 종료 검사 3/3 PASS를 확인했다. 임시 계측은 제거했다. 원본 CI artifact와 진단 로그는 `/workspace/output/ci-stability/` 및 앞선 CI 실행에 보존한다. 전체 검증·새 설치본 결과는 최종 실행 기록을 따른다.

보정 후 공유·도움말 캡처·종료 fixture를 각각 3회 반복한 24개 E2E가 모두 통과했다(`focused-green.log`, 2.7분). 테스트 외 제품 소스·의존성·workflow·버전은 그대로다.

최종 로컬 `DISPLAY=:121 npm run verify:app`은 7단계 모두 통과했다. 기준 SHA `775448756f5b68aa98b196f107f7fadd8357d0de`, dirty=true, Linux x64·Node 24.22.1, 2026-11-18 05:36:11~05:46:44 UTC의 작업 트리 검증이다. E2E는 107 passed, 0 failed/skipped/flaky(342.99초)이며 `verify-app.log`와 `artifacts/app/latest.json`에 근거를 남겼다. 원격 Windows 설치 검증은 push 후 별도로 확인한다.

`c5fa387`의 [Application 44246651776](https://github.com/kdydesign/simple-timeline/actions/runs/44246651776)에서 Linux 7단계 및 양 OS 하네스는 통과했다. Windows는 앞선 공유/캡처 검사를 통과했지만, `help.spec.ts`에서 실제 Exit로 도움말 창이 닫힌 직후 teardown이 실행되어 inspector가 이미 닫혔다는 오류로 106/107에서 중단됐다. Windows wrapper 프로세스 종료보다 inspector 종료가 먼저 관측되는 경합이다. 설치본 생성은 다시 미실행이었다.

이를 재현하기 위해 helper의 최초 생존 확인 직후 실제 Electron을 종료하고 inspector 요청을 실패시키는 회귀 검사를 추가했다. 보정 전 FAIL을 확인했고, 보정 후에는 요청 실패 여부와 별개로 기존 10초 안에 실제 프로세스 종료가 확인돼야만 정리 성공으로 처리한다. 프로세스가 계속 살아 있으면 timeout과 원래 요청 오류를 함께 보고한다. 살아 있는 프로세스에서 요청만 실패시키는 반대 경로도 검사했다. 종료 5개·도움말 2개가 모두 통과했다(`concurrent-red.log`, `concurrent-green.log`). 이번 보완도 fixture와 테스트만 수정하며 제품 종료 정책은 바꾸지 않는다.

동시 종료 보완 후 `npm run typecheck`와 `DISPLAY=:121 npm run test:e2e` 전체 109개가 통과했다(6.2분, `typecheck-final.log`, `e2e-final.log`). 기준은 `c5fa387` 위의 dirty 작업 트리다. 제품 코드는 동일하므로 직전 7단계 검증을 보존하고 변경된 fixture의 전체 E2E·타입·하네스를 다시 검증했다. 최종 Windows 설치본은 이 후속 커밋 CI의 결과를 따른다.

`fcb7cb7`의 [Application 44249372249](https://github.com/kdydesign/simple-timeline/actions/runs/44249372249)에서는 Linux의 포커스/툴팁 테스트 본문 이후 teardown이 다시 10초를 초과했다(108/109). inspector 기반 정리는 일반 캡처 반복에서 재현되지 않더라도 여전히 CI 종료를 보장하지 못했다. 이 결과도 앞선 통과 기록을 대체하지 않는다.

최종 정리 방식은 앱/inspector 응답을 사용하는 대신, fixture가 직접 생성한 ChildProcess의 PID만 대상으로 프로세스 트리를 폐기한다. pinned Playwright의 자체 process launcher와 동일하게 POSIX의 detached 프로세스 그룹에는 SIGKILL, Windows의 cmd.exe wrapper와 자식에는 `taskkill.exe /pid <owned PID> /T /F`를 사용한다. 실행 파일명 검색이나 전체 Electron 종료는 없으며 Node의 실제 exit를 10초 안에 확인한 뒤 일회성 프로필을 삭제한다. 제품 main·설치 프로그램의 종료 정책에는 포함되지 않는다.

새 회귀 검사는 inspector 호출을 사용할 수 없는 실제 Electron을 대상으로 하며, 기존 helper에서 FAIL을 확인했다(`disposal-red.log`). 보정 후 미저장 fixture 정리·중복 dispose·이미 정상 종료됨·inspector 불가·별도 Electron 생존 및 기존 포커스/도움말 검사 9개가 통과했다(`disposal-green.log`, 19.1초). 이전의 stderr 문구/inspector 경합 테스트는 이 폐기 경로에서 더 이상 사용하지 않아 해당 경계 검사로 대체했다. 제품 Exit를 가리지 않도록 `help.spec.ts`도 도움말 창뿐 아니라 실제 앱 프로세스 종료까지 teardown 전에 검증한다. 기존 tray·installer Exit 검사 역시 그대로 유지한다.

프로세스 트리 정리 보완 후 타입 검사는 통과했다. 첫 전체 E2E는 106/108 통과였으며, 날짜 탐색과 빠른 알림 화면 캡처에서 각각 본문 45초 timeout이 발생했다(`disposal-e2e.log`). 이 실행에서는 teardown timeout이 없었지만 전체 통과로 기록하지 않는다. 해당 구간의 다른 테스트도 평소보다 느렸으며 환경 지연의 원인은 확정하지 못했다. 원본 실패 artifact는 `disposal-e2e-artifacts/`에 보존했다. 소스·제한 시간을 바꾸지 않고 실패가 포함된 두 파일을 각각 3회 실행한 15개 검사는 모두 통과했다(47.2초, `disposal-targets.log`). 하네스·공백 검사도 통과했다. 새 커밋의 원격 전체 검증과 로컬 전체 재확인을 이어간다.

앞선 `fcb7cb7` 실행의 Windows job `134616004337`은 전체 앱 검사, 설치본 빌드, 실제 NSIS lifecycle 검증 및 업로드까지 success로 완료됐다. Windows 설치 artifact `14404317187`와 LAN-UPDATE artifact `14404605965`가 생성됐다(0.8.8). 같은 실행의 Linux 실패는 그대로 남으며, Windows 성공을 전체 workflow 성공으로 해석하지 않는다.
