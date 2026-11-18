# WorkRail 화면·역할 전환·Node 복구 구현 기록

2026-11-18. **문서 선행 정리·제품 구현·독립 검토·로컬 전체 검증 완료**. 사용자가 Superpowers·Wayfinder·frontend-design·BrandKit으로 설계 반영을 시작하고 agents-md·documentation-and-adrs로 먼저 문서를 갱신하도록 요청했다.

## 기준과 범위

기준 커밋 `9b36b08`, 기존 `/workspace/workrail` worktree. [구현 계획](../superpowers/plans/2026-11-18-workrail-polish-and-recovery.md)을 따른다. 기존 승인된 디자인 결정은 다시 묻지 않는다. [화면](../design/workrail-screen-polish.md)·[역할](../design/sharing-role-switch.md)·[Node 제거](../design/node-conflict-removal.md)의 과거 설계 전용 제한과 이번 구현 요청을 구분한다. 기존 MVP 지도는 완료 상태를 유지한다.

## agents-md 점검

루트 AGENTS.md가 단일 저장소 지침이며 중복 CLAUDE/override 파일은 없다. quick checklist 11/12: 명령·setup·안전 경계·관련 문서 경로는 명시되어 있고 범용 지시 일부가 중복되지만 이번 개선을 막는 오지시는 없다. 기능별 설계 내용을 루트에 추가하지 않고 기존 domain 인덱스로 연결한다. 명령 존재 확인과 typecheck/harness 실제 실행을 구분해 아래 기록한다. 독립 관리 프로세스와 역할 전환의 세부 계약은 각 설계 문서에 유지한다.

## 설계·실행 판단

- 사용자 최신 ‘설계안 반영 시작’은 전체 개선 구현 지시로 해석한다. 이전 설계-only 문구를 현재 금지로 오인하지 않는다.
- 추가 ADR 체계를 만들지 않는다. 이 저장소의 `docs/design/` 결정 기록을 갱신하고 구현 경계를 본 파일에 연결한다.
- 색상·상단 B 메뉴·메뉴 E·앱 F는 확정값. 버전/설치 식별자는 별도 요청 없이 변경하지 않는다.
- 실제 Windows MSI/UAC/복구 바로가기와 Linux에서 가능한 단위·UI·빌드 검증의 차이를 최종 보고에 남긴다.

## 진행

- [x] 문서·명령·Git 상태 점검 및 구현 계획 작성
- [x] Task1 화면·메뉴·정렬
- [x] Task2 역할 전환·자료 보관
- [x] Task3 공식 MSI 제거·잠금
- [x] Task4 독립 관리·복구
- [x] Task5 API·설정·통합
- [x] Task6 아이콘·전체 검증·독립 검토
- [x] Task7 최종 기록

## 검증

첫 전체 `verify:app`은 clean `7f2c7bc57d6cea825c73b3728e7e5ea3f3365c77`에서 실행했다. 타입·release·3 TZ·UI·build를 통과했으나 native의 기존 bridge 허용 목록 1개가 새 역할 API를 누락하여 중단됐다. 보정 후 native 97개를 통과했다. 이후 첫 전체 E2E는 100개 통과/12개 실패였다. 숨겨진 NodeRail까지 선택하는 오래된 main 선택자 9개, 하단 도크 위치 기대 1개, 같은 API 목록 1개, 실제 날짜 팝업이 툴바 뒤에 가려지는 문제 1개를 확인했다. 화면/보안 검사 범위를 유지해 보정하고 날짜 팝업이 열린 편집기의 표시 순서를 올렸다. 보정한 12개 검사(이름이 바뀐 위치 검사는 별도 실행)를 모두 통과한 뒤 전체 검증을 다시 실행했다. Linux x64, Node 24.22.1, 사용자 권한 Xorg dummy `DISPLAY=:122`, Electron sandbox 유지. 보고서는 `artifacts/app/latest.json`, 단계별 로그는 같은 디렉터리에 남긴다. 최종 결과는 아래와 같다.

**최종 결과:** clean `f356b717a6689208f7908287dd27f5001db655a9`의 `DISPLAY=:122 npm run verify:app` 7단계 전체 통과. 2026-11-18 22:55~23:05 KST. 타입·release 30개·UTC/뉴욕/서울 unit 각각 383개·UI 249개·build·Electron native 97개·E2E 112개. `artifacts/app/latest.json`은 `passed:true`, `dirty:false`, Linux x64 / Node 24.22.1을 기록한다. 이후 변경은 본 결과와 문서 체크리스트뿐이며 최종 문서 커밋은 별도 하네스로 확인한다. 테스트 제외·skip·무조건 재시도·제한 시간 증가는 없다.

사전 검사: TypeScript 통과, release 30개 통과, 전체 UI 249개 통과. Node adapter/잠금/제거 70개, 독립 관리 13개, 역할 전환 native 8개 및 기존 공유 회귀를 각각 확인했다. 실제 Electron Home/PlanRail/NodeRail 전환 1개와 Node 표현/배치 2개가 통과했다. Node 표현 검사는 Linux에서 읽기 전용 Windows 상태를 주입한 화면 검사이며 실제 Windows 설치/전환 성공을 뜻하지 않는다.

첫 app/native/E2E 실패 보고서는 `artifacts/workrail-review/failures/`에 보존했다. E2E에서는 재시도나 제한 시간 증가 없이 원인을 보정했다.

첫 전체 UI 실행은 과거 상단 배지를 찾던 기대 4개와 새 footer의 native title 1개가 실패했다. 배지 검사를 footer로 옮기고, footer 도움말을 기존 Radix tooltip으로 맞춘 뒤 전체 249개를 통과했다. 실패 로그 `/tmp/workrail-all-ui.log`와 수정 후 `/tmp/workrail-all-ui-corrected.log`를 보존했다. 화면 실행은 X 서버 부재, 테스트 엔트리의 package.json 부재로 각각 실패했다. Xorg를 준비하고 복구 메타데이터 부재가 주 앱 시작을 막지 않도록 수정했다. 버전을 확인하지 못한 복구 준비는 차단한다. 제한 시간 증가·테스트 제외·무조건 재시도는 하지 않았다.

## 구현 결과와 계약

- **화면:** B 상단 Home / PlanRail / NodeRail, 메뉴 E 모듈형, 앱 F WR 모노그램 PNG/ICO. 기존 차콜·스틸 블루 글래스를 유지한다. Home 두 카드 높이·버전 강조·작은 상태 위젯, Node 표의 4개 데이터 열 정렬/가운데 정렬/상단 로딩 선/독립 스크롤, PlanRail 하단 공유·무음 상태를 반영했다. Node 메뉴 이동 시 검색·필터·정렬을 유지한다. 상단 도구와 겹치는 편집 날짜 팝업의 클릭·중첩 월 선택·Escape 복귀도 보정했다.
- **설정:** 반복/날짜 휴일을 구획으로 나누고 업데이트 배포 정보를 요약표로 줄였다. 호스트 주소 저장/공유 버튼은 우측 작은 버튼이다. 미저장 편집과 진행 중 작업을 보호하고 양방향 역할 확인/실패 재시도를 제공한다.
- **역할:** SQLite schema 9의 영속 전환 기록. `switchRole({role,confirmed:true})`, `getDormantData()`가 프로젝트·일정·휴일을 반환한다. `roleTransition`과 `dormantAvailable`로 복구/조회 상태를 알린다. 보관 원본은 저장소 조회/쓰기/알림에서도 제외·보호한다. 공유 승인과 로컬 호스트 ID는 보존하고 수신 자료·자격·원격 신뢰는 정리한다. 업데이트 배포 철회와 역할 전환 전 busy 검사를 연결하며 자동 재개하지 않는다.
- **Node 제거:** 공식 MSI의 Windows Installer 소유권, 보호된 경로, 실행 파일 서명과 공식 버전별 SHA256을 대조한다. 캐시 MSI의 서명이 제거된 경우 서명·SHA256이 검증된 공식 원본 MSI의 ProductCode/PackageCode/component/x64를 대조한다. 로컬·도메인·Entra SID를 지원한다. 확인 토큰과 UAC 직전 재검증 후 표준 제거 UI로 진행하고, 취소·실패·재부팅 필요를 구분한다. nvm 설치는 별도 클릭이다.
- **독립 복구:** 개발 실행은 복사한 Electron/runtime·정적 renderer·전용 preload로 인계한다. 자산 해시·세션/PID·창 준비·복구 바로가기를 확인한다. 원본 Node·node_modules·개발 서버가 없어도 복구 진입점으로 실행할 수 있도록 구성했다. 활성 관리 창 다시 열기는 Node 설치 상태와 무관하게 제공한다. 실제 Windows 시작/복구 성공 여부는 아래 인수 범위다.
- **공통 잠금:** 모든 Node 변경은 동일 OS 부팅의 machine lease로 직렬화한다. 작업 소유자가 종료돼도 Windows 작업의 종료가 불명이면 재부팅 전까지 보존한다. 잠금을 얻지 못한 경쟁 앱은 자기 작업 불명과 구분하여 재검사로 회복한다. 기록은 메타데이터뿐이며 승격 실행 코드를 공유 쓰기 경로에 두지 않는다.
- **알림:** `ReminderState.muted`의 런타임 값으로 전체 무음을 표시한다. 조회 실패는 확인 불가이며 로컬/수신 공유 알림 엔진을 분리한다. 트레이 변경을 renderer에 즉시 통지한다.

도움말 이미지 14개를 격리된 실제 Electron 캡처로 갱신했다. `src/renderer/help/images/capture.json`에 소스 SHA·dirty·플랫폼·시나리오를 보존한다. WorkRail/Node 화면의 Windows 상태 주입 캡처는 UI 배치 근거이며 Windows 동작 검증이 아니다.

## 독립 검토와 보정

두 독립 검토에서 로컬 알림에 멤버 캐시가 섞이는 연결, 관리 창 busy 종료 보호 누락, 비소유 잠금 경쟁의 영구 대기, 관리 창 다시 열기 누락, Entra SID 제한을 확인해 보정했다. `app.setPath`의 폴더 부재는 문서상 주의점이지만 실제 Electron 45 Linux 즉시 실패는 재현되지 않았다. 폴더 생성은 시작 절차 보강이며 기존 실패를 해결했다고 주장하지 않는다. 공식 MSI 캐시 서명 문제는 검증된 원본 패키지 대조로 보완했다.

## Windows 인수·원격 확인 한계

실제 Windows 공식 MSI 제거 UI·UAC 취소/승인·재부팅·ACL·서명 및 Windows Installer COM 대응, 복사된 Electron의 시작/바로가기 재실행은 아직 미검증이다. 모의 adapter와 Linux subprocess 잠금 검사가 이를 대체하지 않는다. 일회성 Windows VM에서 다음 순서로 인수한다.

1. 공식 MSI Node + nvm 없음: 단일 대상 표시·확인 취소·UAC 취소·정상 제거와 재검사.
2. 다른 MSI/ZIP/nvm/위조 등록/변경된 경로는 자동 제거를 허용하지 않는지 확인.
3. 개발 실행에서 복구 창 준비 후 기존 개발 창 종료 및 Node 제거. 바로가기로 재진입해 nvm 설치, Node 설치·사용을 각각 실행.
4. 3010/1641 재부팅 상태, 작업 도중 부모 종료, 동시에 열린 다른 WorkRail과 잠금 경쟁, 재부팅 후 재검사.
5. 호스트↔멤버 전환·실패 재시작·보관 자료 조회·승인 재사용/재승인 및 개인 자료 보존.

`gh run list`의 원격 Actions API 요청은 이 환경에서 `Forbidden`으로 거부됐다. 이전 CI 성공을 이번 변경의 성공으로 간주하지 않는다. 저장소 AGENTS.md의 기존 지시에 따라 검증 후 main에 일반 push하며 실제 push 결과는 최종 응답에서 확인한다. Git push는 환경 게시나 사용자 PC 배포가 아니다. 환경 게시·GitHub Release·사용자 PC 배포는 수행하지 않는다. 원격 CI는 API 제한으로 확인되지 않았으며 로컬 성공과 구분한다.

## 2026-11-19 후속 검증

[화면 결정](../design/workrail-screen-polish.md)과 [개발 복구 창 인계](../design/node-conflict-removal.md)를 제품 커밋 `467be88`에 반영했다. Linux x64·Node 24.22.1·clean 상태에서 앱 전체 7단계와 하네스 7개를 통과했다. 릴리스 검사 30개, 세 시간대 단위 검사 각 387개, UI 251개, 네이티브 98개, Electron E2E 114개가 통과했다. Windows Installer COM 검사는 Windows에서 실행한다.

실제 Electron 아카이브를 복구 디렉터리에 복사한 뒤 원본 바이트와 비교하고 변조 거부를 확인했다. 같은 복구 창의 뒤늦은 준비 응답은 원래 세션으로만 인계된다. 화면 검사는 600·800·1440px의 메뉴 아래 간격, 달력과 표 헤더의 재질, 호버·키보드 정렬을 확인했다. Windows 작업 표시줄·트레이의 실표시 및 개발 실행에서 UAC를 거친 실제 제거는 사용자 PC에서 추가 확인할 항목이다.

## 2026-11-19 설치본의 Node 버전 설치 오류 후속

사용자는 설치본에서 기존 Node 제거·nvm 설치 완료 후 버전 설치의 UAC를 승인했지만 무결성 오류가 표시됐다고 확인했다. 공식 설치본에서 추출한 `nvm.exe` SHA-256은 앱의 고정값과 일치했다. 기존 실행 코드는 설정 읽기, 선택적 AutoRun 조회, 임시 파일 준비의 예외를 1610으로 합쳐 사용자 PC의 실패 단계를 특정할 수 없었다.

`01094fb`는 레지스트리의 키·값 부재와 빈 AutoRun을 정상 처리하고, 설정 검증·레지스트리 읽기·등록된 AutoRun·임시 파일 준비 오류를 구분한다. Linux PowerShell 7.4.6에서 Get-ItemPropertyValue가 누락 속성에 대해 SilentlyContinue에도 예외를 내는 동작을 재현했고, PowerShell 레지스트리 제공자의 누락 값 오류 경로도 검토했다. 이는 해당 사용자 PC의 레지스트리 재현 결과를 뜻하지 않는다. Windows PowerShell 5.1 호환성을 읽기 전용으로 검토했으며 실제 Windows 임시 HKCU 키에서 다섯 상태를 검증할 회귀 테스트를 추가했다.

clean `01094fbb69a2323cc34097800aa2cf7edac7da39`, Linux x64·Node 24.22.1에서 앱 전체 7단계와 하네스 7개가 통과했다. 단위 검사는 세 시간대별 388개, UI 251개, 네이티브 98개, E2E 114개가 통과했다. Windows 전용 COM·레지스트리 검사 2개는 플랫폼 조건에 따라 미실행이었다. 실제 Windows UAC 이후 Node 설치·사용 성공과 원격 CI 결과는 미검증이다. GitHub Actions API 조회는 Forbidden으로 차단됐다.

## 2026-11-19 Windows CI 달력 드래그 검사 보정

`3aa0297`의 Application 실행 `44339719783`에서 Windows E2E의 달력 다음 달 드래그 검사 1개가 실패했다. Windows 타입·릴리스·세 시간대 단위 390개·UI·빌드·네이티브 검사는 통과했으며, AutoRun Windows 레지스트리 회귀 검사도 세 시간대에서 실행됐다. E2E는 113개가 통과했다.

진단 artifact의 화면은 1024×728이었다. 12월 18일 일정 막대가 달력 스크롤 영역 아래에 가려진 상태에서 raw pointer 좌표를 사용해 드래그가 시작되지 않았다. 같은 창 크기로 Linux Electron에서도 실패를 재현했다. 출발 일정과 목적 날짜에 Playwright trial click으로 화면 안 위치·고정 헤더 가림·클릭 가능 여부를 확인한 뒤 좌표를 구하도록 변경했다. 목적 날짜의 중앙에 놓고 기존 날짜 저장 결과까지 확인한다.

수정 전 재현 실패와 수정 후 같은 작은 창에서 통과를 확인했다. 로컬 관련 E2E 파일 10개와 저장소 검사를 실행한다. 제품 코드 변경 없이 테스트 입력 경로를 보정했으며 제한 시간·재시도 횟수는 유지했다. 수정 커밋의 원격 결과는 Application·Repository harness 실행을 기준으로 확인한다.
