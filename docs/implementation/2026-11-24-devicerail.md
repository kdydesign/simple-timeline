# WorkRail 1.2.0 · DeviceRail

장비 표·상세는 A안, Home의 즐겨찾는 장비 위젯은 B안으로 합의했다. 장비, 제품 서비스 검사, 매크로의 기준과 여덟 가지 인수 시나리오는 [확정 설계](../design/device-monitor.md)를 따른다. [구현 계획](../superpowers/plans/2026-11-24-devicerail.md) · [사용 안내](../release/user-guide.md#devicerail에서-장비-확인하기)

## 데이터와 실행 경계

- 사용자가 등록한 장비와 그 장비의 매크로 정의는 프로필의 `devicerail.sqlite`에 함께 저장한다. 각 축의 관측과 매크로 실행 결과는 세션 메모리에 두며 Home과 DeviceRail은 같은 관측을 표시한다. [저장소](../../src/main/devicerail/store.ts) · [상태 검사](../../src/main/devicerail/monitor.ts)
- 장비의 SSH 포트와 제품 검사 URL·포트는 따로 설정한다. HTTP(S)는 200~299, TCP는 포트 접속 성공이 정상 기준이다. 주기적인 SSH 검사는 로그인 전에 끝난다.
- 대화형 작업은 TermRail에서 열고 매크로는 장비 상세에서 대상을 확인한 뒤 실행한다. 매크로의 종료 상태를 받기 전에 연결이 끊어지면 결과가 불확실하며 자동 재전송하지 않는다.

## 확인 범위

Linux x64, Node 24.22.1, 기준 커밋 `3a0d945`의 변경된 작업 트리에서 도움말 문서 ID, 검색, 관련 글, 버전별 릴리즈노트를 검사했다. 도움말·릴리즈노트 단위 검사 19개와 해당 창 UI 검사 13개가 통과했다. [도움말 검사](../../tests/unit/help-content.test.ts) · [릴리즈노트 검사](../../tests/unit/release-content.test.ts)

저장·서비스·상태 검사와 IPC 검사 28개가 통과했다. 절전 시 실행 중이던 검사를 취소하고 복귀 시 새 검사 결과만 반영하는 경로도 재현했다. 일회성 저장소와 로컬 SSH·HTTP(S)·TCP 응답으로 축별 결과, TLS 인증서 거부와 읽을 수 없는 DB 보존을 확인했다. [장비 저장](../../tests/unit/device-store.test.ts) · [서비스 수명](../../tests/unit/device-service.test.ts) · [축별 관측](../../tests/unit/device-monitor.test.ts)

SSH 매크로 검사 6개가 통과했다. Linux 셸에서 두 번째 줄이 실패하면 다음 줄이 실행되지 않는지, 작업 디렉터리가 같은 실행 안에서 유지되는지 확인했다. [IPC 검사](../../tests/unit/device-rail-ipc.test.ts) · [SSH 매크로 검사](../../tests/unit/device-macros.test.ts)

일회성 Electron 프로필에서 장비와 매크로를 등록하고, SSH 가능·HTTP 503 불가를 확인한 뒤 HTTP 204로 복구했다. Home에서 즐겨찾기를 눌러 장비 상세와 TermRail 임시 탭을 여는 E2E 1개가 통과했다. 두 화면은 같은 실행에서 촬영했다. [검사 시나리오](../../tests/e2e/devicerail.spec.ts) · [장비 표와 상세](../../src/renderer/help/images/device-status.png) · [Home 위젯](../../src/renderer/help/images/device-favorites.png) · [촬영 기록](../../src/renderer/help/images/capture.json)

같은 Linux 변경 트리에서 `npm run verify:app` 7단계와 저장소 하네스 7개가 통과했다. UI 테스트 390개와 실제 Electron E2E 132개가 통과했고, E2E 재시도는 없었다. [검증 명령과 보고서](../harness/validation.md)

Windows 설치·업데이트와 실사용 장비에서의 인수 결과는 각각 해당 버전의 CI 실행과 사용자 확인으로 기록한다.

## Windows 설치 검증 후속 조치

첫 원격 검사에서 Windows·Linux 앱 검사와 0.8.0 마이그레이션, 자동 업데이트·재실행은 통과했다. 오프라인 앱을 닫고 구 아이콘 참조를 넣은 뒤 다음 버전 설치본을 수동 업그레이드할 때 설치 프로세스가 접근 위반(`0xC0000005`)으로 종료됐다. Windows 이벤트 1000은 비어 있어 해당 명령의 충돌 모듈을 특정할 수 없었다. [실패 실행](https://github.com/kdydesign/simple-timeline/actions/runs/45423926215)

설치 프로세스에 Shell COM을 로드하던 시작 메뉴 아이콘 갱신을 설치 시 한 번 실행하는 별도 STA 프로세스로 옮겼다. 빌드 머신의 .NET Framework 컴파일러로 도구를 만들고 설치 중에만 임시 폴더에 푼다. 설치 경로와 앱 ID가 맞는 바로가기의 아이콘만 변경하며, Windows 셸 오류가 설치 프로세스까지 종료시키는 경로를 없앴다. 같은 패키지 검사가 사용자 설명과 아이콘, 설치 버전, DB 보존을 확인한다. 다시 실패하면 정리 직전 등록 정보와 바로가기 상태도 수집한다. [아이콘 갱신](../../scripts/release/RepairStartIcon.cs) · [실제 설치 검사](../../tests/e2e/packaged.spec.ts)

## 장비 이상 알림 · 1.2.0

장비 편집기의 종 스위치를 켠 경우에만 SSH와 제품 서비스를 각각 판정한다. 같은 장비에서 두 항목이 같은 회차에 연속 실패 기준에 도달하면 Windows 알림 한 건으로 묶는다. SQLite에 검사 항목별 실패 횟수와 발송 기록을 저장해 트레이 무음과 재시작을 거쳐도 같은 장애를 추적한다. 기존 장비는 알림 꺼짐으로 연다. [승인 설계](../superpowers/specs/2026-11-25-devicerail-alerts-design.md) · [저장소 검증](../../tests/unit/device-store.test.ts) · [장비별 검사 회차](../../tests/unit/device-monitor.test.ts)

일회성 프로필과 로컬 SSH·HTTP 서비스로 검사하며, 자동 테스트에서는 Windows 알림 발송기를 대체해 발송 횟수·제목·본문을 확인한다. Windows 알림 센터에 표시되는 배너는 사용자의 알림 설정에 따른다. [서비스 통합 검사](../../tests/unit/device-service.test.ts) · [장비 등록 화면과 발송 검사](../../tests/e2e/devicerail.spec.ts)

2026-11-25 Linux x64, Node 24.22.1에서 변경 작업본의 `verify:app` 7단계가 통과했다. UI 391개와 Electron E2E 132개가 통과했고 E2E 재시도는 없었다. 절전·종료 직전 다른 검사가 진행 중이어도 이미 확인한 복구를 유지하는 회귀 검사도 포함한다.

첫 원격 Linux 실행에서 두 TermRail 터미널의 로그인 버튼 중 하나만 나타난 시점에 두 번째 버튼을 클릭해 UI 검사가 중단됐다. 각 창이 호스트 키를 확인한 후 왼쪽·오른쪽 순서로 로그인 단계에 진입시키고, 대상 창의 버튼이 나타나면 그 세션만 시작하는지 검사한다. 수정 후 해당 파일의 테스트 11개와 타입 검사가 통과했다. [실패한 검사](https://github.com/kdydesign/simple-timeline/actions/runs/45519482553/job/138887413415) · [세션별 로그인 검사](../../tests/ui/terminal-pane.test.tsx)
