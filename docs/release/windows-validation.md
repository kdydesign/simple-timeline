# Windows 설치 검증 — 스테이지 7 진행 기록

대상 정책은 [배포 정책](policy.md), 사용법은 [설치 안내](user-guide.md)를 따른다.
사용자는 Windows 11 x64·사용자별 설치·제거 후 DB 보존·서명 없는 비공개 CI 설치본을 선택했다.

## 현재 근거와 미검증 항목

| 검증 | 현재 상태 | 근거·경계 |
| --- | --- | --- |
| 기존 앱 회귀 | 로컬·Ubuntu/Windows CI 통과 | release 11·unit 31×3TZ·UI 23·native 12·E2E 19, 타입·빌드. Task 1~8 재구현 없음 |
| ASAR/실행 파일/native preflight | 로컬·Windows CI 통과 | 11개 Node 테스트. 고정 SQLite 13 loader의 prebuild 우선순위·unpack header·x64와 dirty SHA/기존 출력물 거부 포함 |
| Windows 설치 파일 생성 | CI 통과 | `036ee00`의 0.1.0과 가상 다음 버전 0.1.1 NSIS·manifest·비공개 artifact 생성 |
| unpacked 제품 앱 실제 SQLite | CI 통과 | 실제 제품 main·정상 OS 프로필·쓰기·재실행, 테스트 변수 무시와 packaged=true 확인 |
| NSIS 설치·오프라인·업데이트·제거 보존 | CI 통과 | Windows Server 2025의 일회성 VM에서 실제 설치·exe outbound 차단·수정/삭제·재실행·업데이트·제거 전후 DB hash·재설치 snapshot 확인. Windows 11 지원 확인과 구분 |
| Windows 11 실기 설치·오프라인 | 미실행 | 완성 설치본을 전달한 뒤 사용자 결과 확인 필요 |
| Windows 11 100%/200%·Narrator | 미실행 | CSS viewport 상당 검사나 Server CI로 대체하지 않음 |
| 실제 디스크/권한/강제 종료 실패 | 미실행 | 운영 DB 금지. 기존 native 오류 회귀와 실제 Windows 실험을 구분 |

## 전달할 설치본과 고정 근거

소스: `036ee001e664904eaf964677798451d9c52f6b57`.
[Application CI](https://github.com/kdydesign/simple-timeline/actions/runs/41732699780)는 두 OS 모두 통과했다.
[Repository harness CI](https://github.com/kdydesign/simple-timeline/actions/runs/41732699802)도 통과했다.
문서 후속 커밋과 설치본 소스 SHA는 다를 수 있다. 아래 파일은 이 소스로 고정하며 이후 artifact와 섞지 않는다.

| 용도 | 파일·다운로드 |
| --- | --- |
| 일반 검증 설치본 0.1.0 | [비공개 ZIP](https://github.com/kdydesign/simple-timeline/actions/runs/41732699780/artifacts/13276824087), `SimpleTimeline-0.1.0-win-x64-036ee001e664904eaf964677798451d9c52f6b57.exe` |
| 업데이트 확인 전용 0.1.1 | [UPDATE-TEST-ONLY ZIP](https://github.com/kdydesign/simple-timeline/actions/runs/41732699780/artifacts/13276514499), `SimpleTimeline-0.1.1-win-x64-036ee001e664904eaf964677798451d9c52f6b57.exe` |
| 자동 검증 원본 | [Windows 보고서 ZIP](https://github.com/kdydesign/simple-timeline/actions/runs/41732699780/artifacts/13278505524)의 `packaged/output/*/windows-validation.json` 및 `packaged/results.json` |

GitHub 로그인과 저장소 접근 권한이 필요하다. 현재 artifact 만료는 2027-02-01 UTC이며 만료 후에는 새 검증 빌드가 필요하다.
각 ZIP의 `.sha256`·`release-manifest.json`과 다음 **exe 파일**의 SHA256을 대조한다. ZIP digest와 다르다.

```text
0.1.0: f92c90f9732aa9b84432132b7f807a1adf37f9c8cc98e3ba90da69393b582e3c
0.1.1: 4cd4690de40a087c77aca495a34c119535515b415ef6deafa4b12d7f766318ee
```

[복사한 실제 CI 결과](evidence/036ee00-windows-validation.json)는
`installed/offline/updated/uninstallPreserved/reinstalled/pass=true`다.
실행 환경은 Windows Server 2025 Datacenter 10.0.26100 x64·runneradmin·PowerShell 7.6.9,
Electron native ABI 150이며 세 방화벽 profile은 enabled였다. 서명 `NotSigned`, HKCU 설치 1개·HKLM 0개를 확인했다.
SQLite 13의 `prebuilds/win32-x64.node`가 ASAR 밖에 있고 실제 앱에서 로드·쓰기·재실행됐다.
패키징 lifecycle 1개는 1.9분에 통과했다. CI의 방화벽 작업 권한과 최종 사용자의 설치 권한은 구분한다.

현재 자동화는 unpacked 상태에서 데이터를 만든 뒤 installed exe의 네트워크를 차단한다.
오프라인 **최초 설치·최초 실행·신규 생성 전체**는 아래 Windows 11 실기로 확인해야 한다.

## 자동 검증 방식

`npm ci` → `npm run verify:app` → `npm run dist:win` →
`npm run dist:win:test-update` → `npm run test:packaged` 순서다.
Node preflight는 ASAR의 제품 entry/preload/renderer, 테스트·DB 미포함과 외부 x64 PE native binding을 검사한다.
실제 SQLite 로드·쓰기·재실행은 패키징된 제품 실행 결과로 판단한다.

packaged 테스트는 새 GitHub-hosted Windows VM과 비어 있는 OS 사용자 프로필에서만 실행한다.
일반 개발 PC의 기존 `%APPDATA%\SimpleTimeline`이 있으면 실행을 거부한다.
프로덕션 main에 프로필 override를 추가하지 않고 OS AppData를 그대로 쓰며 테스트 변수 무시도 확인한다.
인터넷 연결의 정상 probe 뒤 해당 exe의 outbound 방화벽 규칙을 적용하고 실패 probe를 확인한다.
방화벽이 꺼져 있거나 차단이 확인되지 않으면 오프라인 통과로 보이지 않고 실패한다.

0.1.0 설치본과 동일 소스의 가상 다음 버전 설치본으로 실제 NSIS 업데이트를 확인한다.
가상 다음 버전은 테스트 전용이며 일반 배포 artifact에 포함하지 않는다. Windows 11 수동 업데이트 검증이 필요할 때만 별도의 UPDATE-TEST-ONLY 비공개 artifact를 쓴다. 앱·DB ID·경로·내용을 대조한다.
두 버전은 같은 schema이므로 이 통과를 미래 schema migration 전체의 보장으로 해석하지 않는다.
제거 후 DB SHA256이 같고 재설치 후 snapshot이 같은지 검사한다. 소유한 새 테스트 프로필만 마지막에 정리한다.
서버 runner의 OS/CPU/앱 버전/설치 SHA256·단계 결과는 `windows-validation.json`에 남긴다.

## 사용자 확인 절차

실제 Windows 11의 빌드 번호와 CPU, 설치 파일 SHA256, 네트워크 차단 방법을 기록한다.
[실기 기록 양식](manual-checklist.md)의 핵심 오프라인 시나리오와 업데이트·재설치·제거 후 보존,
100%/200% 배율·키보드·Narrator를 확인한다. 먼저 위 두 ZIP을 받아 각 폴더에 풀고 해시를 확인한 뒤 네트워크를 끊는다.
실행 안내는 [사용 안내](user-guide.md)를 따른다.
지원 환경에서 실행하지 못한 항목은 실패/미실행으로 남긴다. 설치본과 정확한 단계가 준비된 뒤 결과를 요청한다.
확인 전 스테이지 7과 전체 MVP를 완료 처리하지 않는다.
