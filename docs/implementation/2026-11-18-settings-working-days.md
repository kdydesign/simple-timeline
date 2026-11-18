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
