# Windows 설치 검증 — 스테이지 7 진행 기록

대상 정책은 [배포 정책](policy.md), 사용법은 [설치 안내](user-guide.md)를 따른다.
사용자는 Windows 11 x64·사용자별 설치·제거 후 DB 보존·서명 없는 비공개 CI 설치본을 선택했다.

## 현재 근거와 미검증 항목

| 검증 | 현재 상태 | 근거·경계 |
| --- | --- | --- |
| 기존 앱 회귀 | 로컬 통과 | unit 31×3TZ·UI 23·native 11·E2E 19, 타입·빌드. Task 1~8 재구현 없음 |
| ASAR/실행 파일/native preflight | 로컬 통과 | 5개 Node 테스트에서 binding 누락·다른 CPU·test entry·preload 누락을 RED→GREEN 검증 |
| Windows 설치 파일 생성 | CI 실행 대기 | 버전·x64·소스 SHA 이름과 SHA256 manifest 생성 구성 |
| unpacked 제품 앱 실제 SQLite | CI 실행 대기 | 테스트 진입점 없이 실제 main·정상 OS 프로필·재실행 검사 |
| NSIS 설치·오프라인·업데이트·제거 보존 | CI 실행 대기 | 격리된 Windows runner VM에서 실제 설치/방화벽 확인. Windows 11 지원 확인과 구분 |
| Windows 11 실기 설치·오프라인 | 미실행 | 완성 설치본을 전달한 뒤 사용자 결과 확인 필요 |
| Windows 11 100%/200%·Narrator | 미실행 | CSS viewport 상당 검사나 Server CI로 대체하지 않음 |
| 실제 디스크/권한/강제 종료 실패 | 미실행 | 운영 DB 금지. 기존 native 오류 회귀와 실제 Windows 실험을 구분 |

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
가상 다음 버전은 테스트 전용이며 배포 artifact에 포함하지 않는다. 앱·DB ID·경로·내용을 대조한다.
제거 후 DB SHA256이 같고 재설치 후 snapshot이 같은지 검사한다. 소유한 새 테스트 프로필만 마지막에 정리한다.
서버 runner의 OS/CPU/앱 버전/설치 SHA256·단계 결과는 `windows-validation.json`에 남긴다.

## 사용자 확인 절차

실제 Windows 11의 빌드 번호와 CPU, 설치 파일 SHA256, 네트워크 차단 방법을 기록한다.
안내서의 핵심 오프라인 시나리오와 업데이트·재설치·제거 후 보존, 100%/200% 배율·키보드·Narrator를 확인한다.
지원 환경에서 실행하지 못한 항목은 실패/미실행으로 남긴다. 설치본과 정확한 단계가 준비된 뒤 결과를 요청한다.
확인 전 스테이지 7과 전체 MVP를 완료 처리하지 않는다.
