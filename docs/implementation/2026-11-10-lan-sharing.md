# Planrail 0.6.0 — 사내 LAN 공유 구현·검증

기준 설계: [승인된 공유 계약](../design/lan-project-sharing.md). 기존 Wayfinder MVP 지도는 완료 상태로 유지한다.
구현은 main의 SQLite/핀 HTTPS·별도 멤버 캐시, 고정 preload facade, 역할별 renderer/settings/tray와 격리 Electron 인수로 나누었다.
설계 승인과 자동 검증은 실제 Windows 11·회사 LAN 인수를 대신하지 않는다. 이 기록은 후속 구현의 근거이며 과거 MVP/0.5.0 인수 기록을 확대하지 않는다.

## 구현과 경계

- schema v3는 역할/이력·영속 hostId/datasetId, 승인 PC·프로젝트별 ACL·폐기 자격 해시, 멤버 캐시·자기 알림·전달 이력을 추가한다.
  v1/v2 자료·로컬 숫자 ID·기존 전달 identity를 유지한다. 수신 표시는 hostId/datasetId/원격 ID의 출처를 가진다.
- 호스트는 명시한 IPv4/포트에 HTTPS를 제공한다. 기본 TCP47831이며 all-interface 자동 fallback은 없다.
  per-profile 인증서는 JS 의존성으로 생성하며 runtime OpenSSL 실행 파일을 요구하지 않는다.
  최초 인증서 후보 수집은 별도 폐기 소켓에서 수행한다. 이후 요청은 정상 CA/이름/핀을 검증한다.
- 실제 소스 IPv4와 승인된 설치 자격을 함께 검사한다. 양쪽 전체64자리 SHA-256 지문 확인과 시도별 proof·수령 확인을 마쳐야 자격이 활성화된다.
  호스트 원본 snapshot에는 알림·자격·수신자 IP를 넣지 않는다. 폐기된 자격에는 자료 없이 검증 가능한 취소 결과만 제공한다.
- 비밀 파일은 OS 보호 vault로 암호화하고 SQLite에는 참조/해시만 둔다. Linux basic_text는 거부한다.
  연결 해제의 비밀 파일 삭제 실패는 비활성 삭제 의무로 영속화하여 재시도한다. renderer에는 비밀을 전달하지 않는다.
- 2초 폴링, 5초 요청 제한, 2/4/8/16/30초 재연결, 마지막 정상 확인 후7초 freshness를 적용한다.
  연결 세대·요청 유효성은 수신 commit·상태·알림 직전에 검사한다. 연결 해제/절전/종료 뒤 늦은 결과는 캐시를 되살리지 못한다.
- 개인 CRUD와 수신 조회의 오류/dirty draft를 분리한다. 공유 저장 확정 뒤 조회 실패는 일반 저장과 같은 stale 복구 경로를 사용한다.
  결과 불명이나 이미 commit한 생성을 자동 재실행하지 않는다. 읽기 재시도는 저장 명령을 반복하지 않는다.
- 참여자 이름은 호스트만 편집한다. 멤버 원본은 읽기 전용이며 개인 자료·자기 공유 알림만 수정한다.
  전체/개인/공유 필터는 목록·간트·달력에 적용된다. 개인 gesture 중 공유 geometry를 고정하며 실제 삭제/회수는 취소·즉시 제거한다.
- 트레이는 연결 상태 / 구분선 / About / 구분선 / Open / Exit다. 상태 클릭이 모든 역할의 설정 진입점이다.
  멤버 상태는 Planrail 옆, 수동 동기화는 간트/달력 왼쪽이다. 최초 pairing은 main 역할이 개인이어도 멤버 연결 의도를 빨강/비활성 sync로 표시한다.
  설정 초기/복귀/중첩 확인 포커스를 소유하며 기존 편집 draft를 보존한다.

## Task 5에서 확인·보정한 문제

1. 기존 Playwright Electron 기본 옵션은 `--no-sandbox`를 삽입했다. 일반/멤버/패키지 fixture에 `chromiumSandbox:true`를 지정하고 실제 main switch와 renderer preferences를 검사한다.
   이전 E2E 기록을 sandbox-on 증거로 재해석하지 않는다. 직접 실행하는 native suite는 별도 실행 경로다.
2. v3 공유 singleton이 없을 때 SQLite 초기화가 ready를 반환하여 bootstrap이 뒤에서 종료될 수 있었다.
   저장소가 repository를 노출하기 전에 공유 identity를 검증하고 DB_CORRUPT로 차단한다. 파일을 그대로 보존하며 ID를 재생성하지 않는다.
   저장 공간·IO·busy 오류 분류는 유지한다. native byte 보존과 실제 Electron blocked 화면을 검사한다.
3. 이미 처리한 오늘 알림도 schedule마다 새 권한 요청을 보냈다.60개 일정의 submitted/unknown/claimed/failed 이력을 재현해 불필요한120번 요청을 확인했다.
   선점 가능한 미처리 또는 명시적 실패 재시도만 네트워크 gate에 진입한다. 권한 확인 뒤 최신 source/날짜/이력을 다시 읽는 경계는 유지한다.
4. 최초 pairing 중 personal 역할 때문에 멤버 상태/sync가 숨겨졌다. 공개 DTO의 pending/connecting 의도로 표시만 보완하며 main 권한을 바꾸지 않는다.
5. 실제 연결 실패 screenshot에서 같은 오류가 두 줄 표시됐다. 같은 명령/상태 메시지는 한 번 표시하며 서로 다른 조치 메시지는 유지한다.
6. Task4의 두 React suspended-act 경고는 입력·초기 render·직접 focus를 비동기 act로 완료시켜 해결했다.
   테스트의 dirty 보존·포커스·명령 assertion은 유지하며 console을 숨기지 않았다.
7. 첫 pairing 중 설정을 다시 열면 아직 DB에 저장하지 않은 대상 주소/포트가 기본값으로 보였다.
   세대에 속한 임시 접속 대상을 공개 DTO에 유지하고 무효화 때 지운다. 역할/자격은 승인 절차가 commit하기 전에는 저장하지 않는다.
8. 수동 동기화 실패 뒤 자동 연결이 복구돼도 이전 오류가 남았다. sync 오류만 성공적인 자동 로컬 반영 뒤 지우며
   설정 검증/결과 불명 오류는 보존한다. 읽기 실패와 단순 연결 정상 DTO만으로는 오류를 지우지 않는다.
9. 기존 disk-full Electron fixture가 bootstrap 뒤 원래 repository만 바꿔 실제 IPC facade에는 오류를 주입하지 못했다.
   fixture가 실제 활성 facade에 오류를 주입하도록 보정했고 저장 공간/초안/재시도 assertion을 유지한다.

## 확정한 구현 판단과 비용

기존 controller 작업 원장의 `Ruling:` 판단을 임시 기록 정리 전에 옮긴다. 새 ADR이나 새 제품 승인이 아니다.

- 이미 승인된 구현 범위 안에서 깨끗한 main checkout을 사용하고 태스크를 순차 실행했다. cloud helper script를 쓸 수 없어 같은 brief/review package를 수동 생성했다. 제품 동작의 차이는 없다.
- 재승인은 명시적 연결 해제와 같은 hostId에 대한 새 양쪽 지문 확인을 거쳐야 새 인증서 핀을 수용한다. 활성 연결의 주소 수정은 기대한 핀을 바꾸지 않는다. 잘못된 키를 자동 신뢰하는 것보다 재연결 절차의 불편을 택했다.
- 역할 선택 전부터 로컬 config.hostId를 안정적인 installationId로 재사용한다. 식별자 존재만으로 호스트 권한을 주지 않는다. 공개 device DTO에는 승인 여부와 여러 대기 시도를 표시한다.
- 만료·중지·새 시도는 미완료 pending 자격만 폐기한다. 승인하지 않은 새 시도로 기존 활성 자격이나 프로젝트 ACL을 취소할 수 없게 한다.
- client의 ETag 입력은 stateless다. service가 수신 캐시 transaction commit 뒤에만 마지막 tag를 갱신하고 재시작은 full snapshot을 요청한다. 보내지 않은 조건에 대한304는 오류다. 추가 전송 비용보다 잃어버린 캐시의 영구304 상태를 피하는 것을 택했다.
- 개인 gesture 중 공유 수정/추가 geometry는 종료까지 미룬다. 확인된 삭제/권한 회수는 저장 없이 활성 미리보기를 취소하고 피드백 후 즉시 제거한다. 접근 제거와 오래된 좌표 저장 방지가 우선이며 알림/권한 확인은 미루지 않는다.
- 제한된 CPU 환경의 JSDOM worker 경합으로 실제5초 테스트 실패가 발생해 UI worker를1개로 제한했다. 파일별 격리와 개별 deadline은 유지하고 정상 명령으로 전체 통과를 확인했다.
- 순차 sandbox Electron68개에서 실제180초에64개 통과 뒤 전체 예산이 끝났다. E2E 전체만240초로 제한하고 다른 명령180초·개별 테스트·요청 deadline은 유지한다. 종료된 자식 프로세스가 남지 않은 것을 확인한 뒤 재실행했다.

## 실제 자동 인수 범위

[두 프로필 Electron 시험](../../tests/e2e/sharing.spec.ts)은 `/tmp/simple-timeline-*`만 사용한다.
호스트 `127.0.0.1`과 실제 소스 바인딩 `127.0.0.2` 사이에서 production HTTPS/client/host/pin/auth/SQLite/IPC를 실행한다.
선택 포트는 loopback 한 곳에만 bind한다. test main에서만 profile 기반 AES vault를 주입하며 OS keychain을 대체한다.
client의 선택적 localAddress는 main-only 옵션으로 기존 pinnedRequest에 전달한다. renderer IPC나 제품 환경변수 우회는 추가하지 않았다.

전체 지문 일치와 양쪽 승인, 호스트 프로젝트 변환, 같은 숫자 ID의 개인/공유 분리, 멤버 읽기 전용·자기 알림,
필터·수동 동기화 위치/완료, 초록/빨강, 호스트 stop/start·재연결, 양쪽 재시작, 승인 취소·연결 해제 후 개인 보존을 확인한다.
실제 Electron 키보드 Enter/Escape로 중첩 취소와 호출자 포커스 복귀도 확인한다. 기존 CRUD/오프라인·닫기 lifecycle 회귀는 전체 suite에 포함된다.
보안 E2E는 기존8개 업무 API와 별도14개 공유 facade, malformed 입력, Node/raw IPC 부재, child-frame의 양쪽 facade 부재를 검사한다.

실제 Electron screenshot은 light/dark의 host/member 전체 지문 설정, 연결 정상/실패 설정·제목·도구 모음을 기록한다.
`screenshots.json`은 파일별 public DTO·테마·화면 크기·프로필 이름·Electron/앱 버전·sandbox와 실행 HEAD/dirty/scope를 기록한다.
호스트 main의 commit 직후 timestamp부터 멤버의 정상 폴링 UI 반영 관측까지의 한 차례 시간도 기록한다.
최종 관측은1889ms였다. 이는 로컬 두 프로세스의 관측이며6대 회사망의5초 목표 달성 근거가 아니다.
실행 metadata의 app.getVersion은 test entry 특성상0.0이다. 설치본0.6.0을 실행한 증거로 해석하지 않는다. package/lock0.6.0은 별도 release 검사로 확인했다.

## 검증 기록과 전달

최종 `DISPLAY=:94 npm run verify:app`은2026-11-10 09:27:26~09:32:34 UTC에7/7 단계를 통과했다.
타입·production build, release15/15, UTC/New_York/Seoul별 unit104/104, UI100/100, native41/41, Electron E2E68/68(2.3분)이다.
UI 로그에는 React suspended-act 경고가 없다. Node의 NO_COLOR/FORCE_COLOR 안내와 Linux DBus 진단은 숨기지 않았다.
실행 환경은 Linux x64, Node24.22.1, Electron45.2.1/ABI150,
기존 Xorg `DISPLAY=:94`, UID1000, sandbox enabled, 격리 프로필이다. 앱 명령은 순차 실행한다.
`verify:app`은 명령별180초, E2E 전체만240초다. 순차 sandbox Electron68개 회귀가 실제180초에64개 통과 뒤 aggregate timeout으로 종료돼 전체 예산만 늘렸다.
개별 테스트·assertion·5초 요청 제한은 유지한다. 실패한 testcase를 timeout 증가로 넘긴 것이 아니다.
최종 screenshot12개와 metadata는 `artifacts/lan-sharing-acceptance/screenshots`에 별도 보존했다.
개별 RED/GREEN 및 전체 로그는 ignored `artifacts/lan-sharing-acceptance/logs/task-5-*`, 앱/harness 구조화 증거는 `artifacts/app/latest.json`·`artifacts/harness/latest.json`에 있다.
문서 최종 보정 뒤 하네스 verify7/7과 whitespace 검사를 통과했고, 완성된 Wayfinder의 selected:null/frontier:[]도 확인했다.
`src` 및 production main/preload에서 test profile/vault/controller marker가 없는 것을 확인했다.
별도 보존한 `artifacts/lan-sharing-acceptance`는 임시 작업 원장 정리 뒤에도 남는 로컬 evidence다.
이 문서를 기록하는 source tree는 기준 commit `78041573e072e3d84bf4951e071c892495e8b375` 위의 dirty 작업이었다. 결과의 HEAD/dirty 필드를 source identity로 읽는다.

Windows/Linux GitHub Actions는 controller의 최종 push 뒤 정확한 SHA로 별도 확인한다. 이 작업은 push나 Windows 빌드를 실행하지 않는다.
정식 기대 버전은 package/lock 모두0.6.0이다. 설치본·manifest·SHA256·artifact 형식은 기존 [배포 정책](../release/policy.md)·[사용 안내](../release/user-guide.md)를 따른다.
기존 appId·프로필 경로·비승격 per-user NSIS·제거 후 보존·오프라인 개인 사용은 유지한다.

## 남은 실제 Windows 11·회사 PC 인수

- 정확한 installer SHA/manifest를 기록하고 실제 사용자 safeStorage/DPAPI, 회사 방화벽·등록 소스 IP, 주소 변경과 TLS 신원을 확인한다.
- 실제 트레이 상태 bitmap·배율/테마, 지문 비교 가독성·키보드·Narrator, Windows 알림과 자기 알림 privacy를 확인한다.
- 호스트 종료·재실행·절전/복귀, 멤버 재시작·reconnect·취소/접근 제거, 늦은 전송과 폐기 알림 경계를 확인한다.
- 예상6대/10프로젝트/60일정의 정상 변경이5초 이내 전파되는지 실제 회사망에서 측정한다. count cap은 추가하지 않았다.
- 개인 오프라인 CRUD·데이터 보존과0.6.0 schema v3 upgrade를 확인하며 방화벽을 끄거나 운영 DB를 오류 시험에 쓰지 않는다.

자동 localhost 시험을 실제 LAN 통과, Linux 시험 vault를 DPAPI 통과, Windows Server CI를 Windows11 실기 통과로 표시하지 않는다.
