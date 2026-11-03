# 스테이지 7 실행 기록 — Windows 설치 준비·검증 진행 중

기준 main: `5a502e25ad3e1a1baf988549d2cc71cb2ec54678`. 범위는 승인 계획 Task 9다.
사용자가 스테이지 7을 요청했다. 이전 offline 문서 초안은 named git stash로 보존한 뒤 최신 main으로 fast-forward했다.
Task 1~8은 다시 만들지 않는다. Windows CI는 통과했으나 Windows 11 실기 확인이 남아 있어 MVP 완료 상태가 아니다.

## 사용자 결정

Q1~Q3에서 Windows 11 x64, 사용자별 설치·제거 후 DB 보존, 서명 없는 비공개 CI 설치본을 선택했다.
[정책](../release/policy.md)에 기록했다. 기존 날짜·도메인·저장·화면 승인은 유지한다.
공개 release·인증서 구매/서명 서비스·다른 CPU/OS·자동 업데이트·수동 백업은 승인 범위 밖이다.

## 구현과 로컬 근거

- ASAR/native preflight: x64 PE exe와 ASAR 밖 SQLite binding, 제품 main/preload/renderer,
  테스트·DB 미포함, 패키지 버전과 source SHA를 확인한다.
- 실제 Windows 제품 앱: 테스트 main/API 없이 정상 OS AppData를 사용하고 기존 프로필이면 거부한다.
  새 GitHub-hosted VM에서만 NSIS 설치·수정·삭제·재실행·업데이트·제거 후 DB 보존·재설치를 확인한다.
- 설치본에는 app 버전·x64·소스 SHA를 붙이고 SHA256 manifest를 만든다.
  dirty tree와 이전 output이 있으면 source SHA를 잘못 붙이지 않도록 거부한다.
- 오프라인 probe는 실제 Electron net.fetch의 캐시를 우회하고, 연결을 닫은 뒤 exe outbound 규칙의 효과를 확인한다.
  Windows Server CI는 Windows 11 실기·표준 사용자 설치·실제 배율·Narrator를 대신하지 않는다.

기존 전체 baseline은 통과했다. 재개 후 소스 `036ee00`에서 로컬 `DISPLAY=:99 npm run verify:app`를
다시 실행해 2026-11-03 22:46 UTC에 종료 코드 0을 확인했다.
release 11개, unit 31개×3개 시간대, UI 23개, native 12개, E2E 19개와 타입·빌드를 통과했다.
보고서의 dirty=true는 이 인수인계 문서 작업을 포함하며 clean SHA 결과는 CI와 구분한다.
`node scripts/harness/run.mjs verify` 검사 7종·회귀 22개도 통과했다.
모든 앱/DB 테스트는 임시 프로필이다. 최종 Windows 근거는 아래와 검증 문서를 따른다.

## 실제 Windows CI 결과

소스 `036ee001e664904eaf964677798451d9c52f6b57`의
[Application CI](https://github.com/kdydesign/simple-timeline/actions/runs/41732699780)는 Ubuntu·Windows 모두 통과했다.
[하네스 CI](https://github.com/kdydesign/simple-timeline/actions/runs/41732699802)도 통과했다.
Windows Server 2025 Datacenter build 26100 x64·runneradmin·PowerShell 7.6.9에서
0.1.0/가상 0.1.1 NSIS를 만들고 실제 제품 unpacked SQLite CRUD·재실행,
HKCU 1/HKLM 0·서명 없음, 설치본 실행·exe outbound 차단 후 통신 실패·오프라인 수정/삭제·재실행,
업데이트 동일 ID/내용/경로·제거 DB SHA256 유지·재설치 snapshot 유지를 통과했다.
제품 프로필 override나 테스트 진입점을 추가하지 않았다. 실제 packaged lifecycle 1개는 1.9분이었다.
원본 Windows artifact에서 JSON을 내려받아 [결과 사본](../release/evidence/036ee00-windows-validation.json)과 대조했다.
파일 이름·해시·비공개 다운로드·만료는 [검증 문서](../release/windows-validation.md)에 고정했다.
문서 후속 커밋 SHA와 설치본 소스 SHA를 혼동하지 않는다.

## 실패와 수정

1. 기존 긴 draft UI 테스트는 문자별 입력의 반복 렌더링 때문에 5초 timeout을 냈고 다음 테스트까지 오염시켰다.
   붙여넣기와 전체 값 assertion으로 원래 focus/dirty 계약을 유지했다. timeout 증가·skip은 없다.
2. Windows CI `531ef96`은 ASAR member list의 역슬래시로 제품 main을 찾지 못해 installer 전 실패했다.
   정규화 assertion을 실제 RED→GREEN으로 확인했다. 처음 회귀 작성의 import setup 오류는 valid RED로 세지 않았다.
3. Windows CI `b05837c`은 목록 검사를 지나 실제 main 추출에서 같은 라이브러리의 native separator 요구로 실패했다.
   getNode가 dirname 결과를 native separator로 분리하는 실제 source를 확인해 extractFile에 join한 경로를 넘겼다.
   Windows positive-fixture RED의 GREEN은 실제 Windows CI로 재확인해야 한다.
4. 독립 reviewer는 캐시된 응답 때문에 올바른 방화벽 차단도 온라인으로 보이는 문제를 재현했다.
   같은 helper를 사용하는 실제 Electron 회귀에서 warm cache→서버 종료 후 true!==false RED를 확인하고,
   no-store·고유 URL·response 취소로 GREEN을 확인했다.
5. release provenance는 실제 Git fixture에서 clean SHA·dirty 거부·기존 output 거부를 RED→GREEN으로 검증했다.
6. `1726864`의 Windows CI는 NSIS 빌드 뒤 기존 `build/Release` 경로를 가정한 checker에서 멈췄다.
   고정 버전 better-sqlite3 13.0.3의 loader는 `prebuilds/win32-x64.node`를 우선한다.
   실제 ASAR fixture를 이 구조와 unpack header로 바꾸고 RED→GREEN을 확인했다.
   선택된 binding의 ASAR 밖 위치·x64 PE를 검사하며 Debug/Release fallback과 packed binding 거부도 포함한다.
   release 테스트는 총 11개다. 파일 검사와 실제 SQLite 실행의 근거는 구분한다.
7. `4fccac0`의 Windows CI는 두 버전 NSIS 빌드, 실제 unpacked SQLite CRUD·재실행,
   NSIS 설치까지 진행했다. 이후 PowerShell 7 부모 환경에서 `powershell.exe`가 보안 모듈을 로드하지 못했다.
   CI 보조 스크립트 호출을 runner와 같은 `pwsh.exe`로 맞추고 OS·PowerShell·방화벽 진단을 기록했다.
   앱·설치본에 PowerShell 의존성을 추가한 것이 아니다. 이 시점의 설치 후 오프라인·업데이트는 통과로 세지 않았다.

## 독립 검토와 남은 게이트

`5a502e2..531ef96`를 독립 reviewer가 읽기 전용으로 검토했다. 검토는 한 번만 했다.
중요 cache probe와 추가로 확인한 source/output 귀속은 테스트로 고쳤다. 실제 NSIS CI는 이후 소스 036ee00에서 통과했다.
작은 보완: 방화벽 cleanup 실패 시 최종 JSON 저장/프로필 정리가 중단될 수 있다. CI/Playwright 로그는 남고 릴리스 게이트는 실패하나 진단 완전성을 다듬을 여지가 있다.
이미 승인된 정책을 미확정으로 표시한 STATUS 문구는 필수 진행 메타데이터 갱신에서 바로잡았다.
기존 15px 간트 gutter와 migration 사본 로그, 빌드 도구 advisory는 이전 기록을 따른다.

검토 판단의 범위: Windows Server의 관리자 CI는 Windows 11 표준 사용자의 무승격 설치 근거가 아니다.
현재 자동화는 샘플 생성 뒤 네트워크를 차단하므로 오프라인 최초 설치·최초 실행·신규 생성 전체를 증명하지 않는다.
물리 잠금·ACL·용량 부족·강제 종료·손상·고버전·migration 실패는 실제 Windows 실험 결과가 필요하다.
기존 native/주입 회귀와 CSS viewport 검사를 물리 오류·실제 배율·Narrator 결과로 대체하지 않는다.
Task 1~8은 전체 회귀를 실행했지만 독립 전체 재감사는 하지 않았다. 임의 데이터 규모나 사용자 PC 성능 보장은 없다.
uninstaller 프로세스 완료와 exe 제거 사이의 race는 아직 재현되지 않았으며 실제 uninstall/reinstall 검사가 게이트다.
공개 배포·코드 서명·다른 OS/CPU·자동 업데이트·수동 백업은 승인 범위 밖이다.

Windows 11의 실제 설치·오프라인 최초 실행/신규 생성·업데이트·제거·100%/200%·Narrator와
격리된 실제 오류 시나리오 결과가 미실행이면 스테이지 7은 진행 중/차단 상태다.
완성 설치본·해시·정확한 절차를 전달한 뒤 필요한 사용자 결과를 요청한다. 실행하지 않은 검증은 완료로 추정하지 않는다.
