# Windows 설치 검증

현재 전달 기준은 아래 Planrail 0.3.0이다. 스테이지 7의 0.1.0 검증·사용자 인수는 뒤의 과거 기록으로 보존한다.
정책은 [배포 정책](policy.md), 사용법은 [설치 안내](user-guide.md)를 따른다.

## Planrail 0.3.0

확인일: 2026-11-05 (한국 시간). 설치본 소스: `56080cc2660287f596cee5f50ab61999676fd281`.
[Application CI](https://github.com/kdydesign/simple-timeline/actions/runs/41953558125)와
[Repository harness CI](https://github.com/kdydesign/simple-timeline/actions/runs/41953558080)는 Windows·Ubuntu 모두 성공했다.
이후 문서 커밋과 설치본 소스 SHA를 혼동하지 않는다. 새 설치본은 해당 실행의 manifest와 SHA로 식별한다.

| 검증 | 결과와 근거 범위 |
| --- | --- |
| 전체 앱 검사 | Windows clean 56080cc에서 7단계 PASS. 타입·release 15·unit 40×3TZ·UI 65·빌드·native 13·Electron 56. Windows 보고서의 시각은 11:13:37~11:15:41 KST(원본 UTC 02:13:37~02:15:41) |
| 실제 구버전 이름 변경 업그레이드 | 고정 소스 `5c41982ee23e1f0f76f1aa0875c5361bd94a865b`의 Simple Timeline 0.2.1을 별도 빌드·설치했다. 프로젝트/일정과 다크·접힘 설정을 만든 뒤 Planrail 0.3.0으로 설치 경로를 바꿔 업데이트해 snapshot·설정·기존 exe 제거·새 바로가기를 검사했다. |
| 사용자별 설치·오프라인 | Windows Server 2025의 일회성 VM에서 HKCU 설치 1개·HKLM 0개, 서명 NotSigned 확인. 실제 설치 exe의 outbound 차단 후 동작을 검사했다. 대화형 UAC·폴더 선택 화면 검증은 아니다. |
| 다음 버전·제거·재설치 | 같은 소스의 검증 전용 0.3.1로 업데이트 후 DB 보존·제거 후 DB hash·바로가기 제거·재설치 snapshot을 검사했다. 실제 schema migration 검증과 구분한다. |
| 사용자 Windows11 | 이번 0.3.0의 실기 인수는 미실행. 폴더 선택/권한 거부·완료 화면·트레이 위치·DPI/키보드/Narrator·시작 시간은 [수동 확인표](manual-checklist.md)를 따른다. 기존 MVP 인수 결과를 전용하지 않는다. |

packaged lifecycle 1개 검사는 약 1.2분에 통과했다. 원본 JSON을 그대로 보존한
[Windows 실행 증거](evidence/56080cc-windows-validation.json)의
`legacyUpgradeWithChangedDirectory`, `installed`, `offline`, `updated`, `uninstallPreserved`, `reinstalled`,
`uninstallShortcutsRemoved`, `pass`가 모두 true다. `runtime.version=0.3.1`은 검증 전용 업데이트 실행 시점이며 일반 설치본은 0.3.0이다.
CI의 관리자 방화벽 작업 권한과 최종 사용자 설치의 권한은 별개다.

| 용도 | 고정 산출물 |
| --- | --- |
| 일반 설치본 0.3.0 | [Planrail Windows x64 ZIP](https://github.com/kdydesign/simple-timeline/actions/runs/41953558125/artifacts/13381993939), `Planrail-0.3.0-win-x64-56080cc2660287f596cee5f50ab61999676fd281.exe` |
| 검증 전용 업데이트 0.3.1 | [UPDATE-TEST-ONLY ZIP](https://github.com/kdydesign/simple-timeline/actions/runs/41953558125/artifacts/13382697264). 일반 사용자 설치본이 아니다. |
| 자동 검사 원본 | [Windows 보고서 ZIP](https://github.com/kdydesign/simple-timeline/actions/runs/41953558125/artifacts/13382890574)의 `app/latest.json`, `packaged/results.json`, `packaged/output/*/windows-validation.json` |

GitHub 로그인·저장소 접근 권한이 필요하다. 조회 당시 위 artifact는 만료되지 않았으며 만료일은 2027-02-03 UTC다.
일반 설치본의 **exe SHA256**은 CI 결과에서 다음과 같이 확인했다. ZIP digest와 다르다.
이번 문서 점검에서는 보고서 ZIP을 내려받아 대조했으며 설치 exe를 다시 내려받아 해시를 계산하지는 않았다.

```text
cbc61b18ca7a45360e9244c8bb05a0e467e01124c5da3d805ae06c74796f761b
```

다운로드한 exe는 같은 ZIP의 `.sha256`·`release-manifest.json` 및 `Get-FileHash -Algorithm SHA256 <설치파일>`로 대조한다.
현재 Windows CI 순서는 `npm ci` → `npm run verify:app` → `npm run dist:win` →
`pwsh -File scripts/release/build-legacy.ps1` → `npm run dist:win:test-update` → `npm run test:packaged`다.
[workflow](../../.github/workflows/app.yml)·[고정 구버전 빌드](../../scripts/release/build-legacy.ps1)·
[실제 설치 검사](../../tests/e2e/packaged.spec.ts)를 근거로 하며, 비어 있는 프로필의 일회성 Windows VM에서만 실행한다.
Silent `/S /D=` 검사는 대화형 폴더 선택 화면이나 권한 없는 경로 선택을 검증하지 않는다.
네트워크를 차단한 최초 설치·최초 실행·신규 생성 전체의 사용자 PC 검증도 별도로 남아 있다.

## 과거 기록 — 스테이지 7 (0.1.0)

아래는 당시 소스·환경·사용자 보고의 기록이며 현재 0.3.0 설치본 안내나 실기 인수 결과가 아니다.

대상 정책은 [배포 정책](policy.md), 사용법은 [설치 안내](user-guide.md)를 따른다.
사용자는 Windows 11 x64·사용자별 설치·제거 후 DB 보존·서명 없는 비공개 CI 설치본을 선택했다.
2026-11-04 사용자가 기본 설치·실행·업데이트·제거·재설치의 데이터 보존을 확인했다.
이번 MVP의 사용자 인수는 이 범위로 마무리하고 상세 개선·오류 검증은 별도로 진행하기로 했다.
정확한 사용자 보고와 인수 범위 조정은 [MVP 설치 인수 기록](user-acceptance.md)에 남겼다.

### 현재 근거와 미검증 항목

| 검증 | 현재 상태 | 근거·경계 |
| --- | --- | --- |
| 기존 앱 회귀 | 로컬·Ubuntu/Windows CI 통과 | release 11·unit 31×3TZ·UI 23·native 12·E2E 19, 타입·빌드. Task 1~8 재구현 없음 |
| ASAR/실행 파일/native preflight | 로컬·Windows CI 통과 | 11개 Node 테스트. 고정 SQLite 13 loader의 prebuild 우선순위·unpack header·x64와 dirty SHA/기존 출력물 거부 포함 |
| Windows 설치 파일 생성 | CI 통과 | `036ee00`의 0.1.0과 가상 다음 버전 0.1.1 NSIS·manifest·비공개 artifact 생성 |
| unpacked 제품 앱 실제 SQLite | CI 통과 | 실제 제품 main·정상 OS 프로필·쓰기·재실행, 테스트 변수 무시와 packaged=true 확인 |
| NSIS 설치·오프라인·업데이트·제거 보존 | CI 통과 | Windows Server 2025의 일회성 VM에서 실제 설치·exe outbound 차단·수정/삭제·재실행·업데이트·제거 전후 DB hash·재설치 snapshot 확인. Windows 11 지원 확인과 구분 |
| 사용자 PC 기본 설치·실행·업데이트·제거·재설치 | 사용자 확인 통과 | 각 설치본 해시 일치, 관리자 요청/보안 경고 없음, 업데이트·제거 후 재설치에도 데이터 유지. 상세 빌드·계정 종류 미보고 |
| 사용자 PC 오프라인 전체 시나리오 | 미확인·후속 | 네트워크 차단 여부와 상세 CRUD/두 모드 결과는 이번 보고에 없음. CI와 구분 |
| Windows 11 100%/200%·Narrator | 미실행·후속 | 사용자 인수 범위 조정으로 별도 검증. CSS viewport 상당 검사나 Server CI로 대체하지 않음 |
| 실제 디스크/권한/강제 종료 실패 | 미실행·후속 | 사용자 인수 범위 조정으로 별도 검증. 기존 native 오류 회귀와 실제 Windows 실험을 구분 |

### 전달할 설치본과 고정 근거

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
오프라인 **최초 설치·최초 실행·신규 생성 전체**는 사용자 PC에서 미확인이다.
사용자가 이번 MVP의 상세 검증을 후속으로 분리했으며 이 항목을 통과로 처리하지 않는다.

### 자동 검증 방식

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

### 사용자 인수와 후속 확인 절차

기본 설치 인수는 [사용자 결과](user-acceptance.md)로 마무리했다. 아래 절차는 상세 후속 검증용이다.
후속 검증 시 실제 Windows 11의 빌드 번호와 CPU, 설치 파일 SHA256, 네트워크 차단 방법을 기록한다.
[실기 기록 양식](manual-checklist.md)의 핵심 오프라인 시나리오와 업데이트·재설치·제거 후 보존,
100%/200% 배율·키보드·Narrator를 확인한다. 먼저 위 두 ZIP을 받아 각 폴더에 풀고 해시를 확인한 뒤 네트워크를 끊는다.
실행 안내는 [사용 안내](user-guide.md)를 따른다.
지원 환경에서 실행하지 못한 항목은 실패/미실행으로 남긴다.
스테이지 7 완료는 사용자 확인과 명시적 인수 범위 조정에 근거하며 위 상세 검증 전체 통과를 의미하지 않는다.
