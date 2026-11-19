# WorkRail 환경 선택·Home 개선 — 협의 초안

2026-11-19. 기준 코드: `3a343d7af246ec1ef4221cf518b51eb040027d90`.
상태: **설계 협의 중**. 아래 사용자 요구를 접수했으며, 제안·시안은 최종 승인 전이다. 제품 코드·설치 정책·배포 설정은 변경하지 않는다.

## 범위와 기록 기준

Superpowers brainstorming, Wayfinder grilling/domain-modeling, 저장소의 grill-with-docs·frontend-design·agents-md·documentation-and-adrs 절차를 사용한다. 기존 글래스 재질, 다크 Steel Blue/라이트 Forest Crystal 테마와 앱 아이콘을 유지한다. 이전 [통합 도구 설계](team-tool-expansion.md)의 nvm-windows 1.2.2 고정 구현을 대체할 후속 설계이며, 구현 완료나 전체 버전 호환을 의미하지 않는다.

## 16개 요구 추적

| 번호 | 사용자 요구 | 설계 방향 / 확인할 사항 |
| --- | --- | --- |
| 1 | 기존 nvm 우선, 설치 버전에 맞춰 연동 | 실제 관리자 종류·버전을 식별하고 계열별 기능을 확인한다. 자동 업그레이드하지 않는다. 미검증 버전의 실행 허용 기준은 추가 협의 |
| 2 | nvm을 기존 Node 설치로 오표기하지 않기, 옅은 초록 | 관리자 식별과 활성 Node 출처를 분리. `NVM 1.1.11 설치`처럼 실측 버전 표기. 식별 성공 배지는 옅은 초록, 작업 가능 여부는 별도 표시 |
| 3 | 알림 툴팁 정정 | 켜짐: `앱에서 일정 알림을 허용하고 있습니다.` / 무음: `앱의 모든 일정 알림을 끈 상태입니다.` / 불명: `알림 설정을 확인하지 못했습니다.` 개별 일정·OS 설정 설명은 도움말로 이동 |
| 4 | 호스트 footer에 연결 참여자 이름·버전 | `공유 제공 중 | 민수(버전 0.8.8) | 지연(버전 확인 불가)`. 승인된 현재 연결 기기만 표시. 공간 부족 시 `외 N명`으로 전체 목록 열기 제안 |
| 5 | Node 버전 숫자 폰트 통일 | 본문과 같은 font-family를 상속하고 크기·굵기로 강조. 숫자 정렬만 tabular-nums 사용 가능 |
| 6 | 세 메뉴 외곽 여백 통일 | 공통 콘텐츠 프레임: 좌우 14px, 메뉴 아래 14px, 하단 14px 시안. PlanRail footer는 프레임 바깥 공통 상태 영역. 최종 수치는 시안 확인 후 확정 |
| 7 | Home 공유 배지 통일 | PlanRail 공유 배지의 동일 컴포넌트/토큰 사용. 개인 배지와 구별 |
| 8 | Home 이동 버튼을 활성 메뉴 스타일로 | 두 CTA에 기존 selected-control/selected-border/selected-sheen 적용. 이동 버튼에 aria-pressed 같은 선택 의미를 붙이지 않음 |
| 9 | 메뉴별 도움말 | Home / PlanRail / NodeRail / 공통 설정. 현재 메뉴에 해당하는 도움말을 먼저 열고 다른 범주도 탐색 가능. NodeRail에 환경·관리자·전환 범위·분류 설명 포함 |
| 10 | Home PlanRail 상태 확대, 역할별 시안 | 호스트: 공유 상태·연결/등록 수·승인 대기·참여자 버전. 멤버: 연결 호스트 주소·연결/동기화 시각·호스트 앱 버전(확인 가능할 때). compact 위젯 유지 |
| 11 | Home Node 작업에 정상 시 설치 목록·바로 사용 | 선택 환경 표시. 정상: 설치 목록·사용 버튼 / 진행: 진행 상태 / 오류: 요약·상세 진입. 조회 실패를 빈 목록으로 표시하지 않음 |
| 12 | 공식 목록 분류 설명 | 현재는 LTS 코드명 또는 `일반`. `LTS · 코드명` / `비 LTS`로 명확화 제안. 과거 LTS 여부는 현재 보안 지원 여부와 다르며 Current·EOL 판정은 별도 근거 필요 |
| 13 | 상태 아이콘·툴팁, 작업 명확화 | 사용 중: 체크 원 / 설치됨: 보관함 / 미설치: 빈 원 / 확인 불가: 경고. 각 아이콘에 accessible name·키보드 툴팁. 작업은 각각 `사용 중`(비활성), `사용`, `설치`, `다시 확인`. 설치와 사용 전환은 구분 |
| 14 | Actions artifact 이름 WorkRail로 | 현재 upload-artifact의 설치본·LAN·검사용 3개 Planrail 접두어 변경. 테스트 전용 표시와 SHA 유지. ZIP 내부 계약·appId·기존 프로필 경로 등은 단순 이름 변경에 포함하지 않음 |
| 15 | 비활성 메뉴 flat, 활성만 글래스 | 기본 배경·테두리·그림자 제거(투명 테두리로 크기는 유지). 선택만 기존 파란 글래스. 키보드 focus 링 유지. 시안 제공 |
| 16 | WSL2 nodenv, 선택 환경의 기존 관리자 사용 | 환경 = Windows 또는 WSL 배포판+사용자. 관리자 adapter와 환경 실행 경로를 분리. Windows 목록·설정과 WSL 목록·설정을 섞지 않음 |

## 현재 코드에서 확인한 사실

- `src/main/node-management/discovery.ts`의 기존 검증은 특정 nvm-windows 실행 파일을 전제로 한다. 이를 단순 제거하는 방식은 새 버전 지원 설계가 아니다.
- `src/renderer/workrail/Home.tsx`의 activeSource 분기와 manager 상태가 별개여서 관리자 미지원 상태와 기존 Node 출처 표시를 구분해야 한다.
- `PlanRailStatus.tsx`는 알림 정책에 관계없이 동일 툴팁을 사용한다.
- `SharingState`에는 devices, memberPresence, deviceVersions, pendingPairs가 있다. 등록 수는 연결 수가 아니며 version=null은 버전 확인 불가이다. 멤버에서 호스트 버전을 얻는 경로는 추가 확인 필요.
- `workrail.css`는 버전 숫자에 별도 monospace를 지정한다. Home 공유 배지는 별도 workrail-tag이다.
- `.github/workflows/app.yml`의 3개 artifact 표시 이름은 Planrail 접두어이다. 과거 Planrail 설치본 마이그레이션 테스트 이름은 역사적 제품명이다.

## 아키텍처 대안 — 제안

1. **모든 버전에 동일 명령 실행:** 구현은 짧지만 1.x/2.x의 설정·권한·전환 구조 차이를 숨긴다. 채택하지 않는 방향을 제안한다.
2. **환경 실행기 + 관리자별 adapter:** Windows/WSL 실행 경로와 nvm 1.x/nvm 2.x/nodenv 기능을 분리한다. 기존 설치 존중과 환경 확장에 적합하여 추천한다.
3. **WorkRail 관리형 설치만 허용:** 검증 범위는 좁지만 기존 도구를 쓰겠다는 사용자 요구를 충족하지 않는다.

환경 식별자와 검사 결과에 관리자 종류·버전·경로·사용자·마지막 검사 시각·기능별 가능/불가 이유를 포함한다. 오래된 조회 결과를 새 환경 결과로 재사용하지 않는다. 작업 시작 시 환경과 관리자를 고정하고, 실행 직전 재검증한다. 진행 중 환경 선택/동시 작업 정책은 후속 협의한다.

WSL 실행은 `wsl.exe`에 배포판과 사용자를 명시한다. Windows UAC 기반 처리와 Linux 권한을 혼용하지 않는다. 사용자가 입력한 배포판·경로를 shell 문자열에 그대로 연결하지 않는다. nodenv 실행 경로와 `NODENV_ROOT` 등 실제 설정을 확인한다. nodenv 설치 기능은 node-build 플러그인 유무·정의를 별도 확인하고, 배포 목록에 있는 버전이 해당 환경에서 설치 가능한지 구분한다. WSL에서는 Windows용 Node ZIP을 설치하지 않는다. WSL의 PATH에는 Windows 경로가 포함될 수 있으므로 Node가 발견되었다는 이유만으로 nodenv 정상으로 판정하지 않는다. 실제 Linux 실행 경로와 선택 사용자의 관리 경로를 확인한다.

nvm-windows 2.x는 사용자별 설치와 shim/link 모드를 지원하므로 1.x의 symlink·설정·권한 가정을 재사용하지 않는다. 프로젝트 파일을 인식하는 환경에서는 기본 버전과 프로젝트 실행 버전이 다를 수 있다. `nvm pin` 같은 프로젝트 파일 변경은 기본 버전 전환과 별도 기능이다.

Windows 1.x, 2.x, WSL nodenv 각각 조회/설치/전환/취소/실패를 검증해야 하며, 모든 과거·미래 버전 지원은 보장하지 않는다. 실제 실행 파일 신뢰·설정 검증과 호환 기능 판정을 구분하고, 검증되지 않은 버전 처리 정책은 미결로 남긴다.

## 질문 기록

- **Q1 확정:** 선택한 WSL 사용자의 기본 버전만 변경한다. 프로젝트 `.node-version`은 수정하지 않는다. 화면에 기본 버전임을 표시하고 프로젝트/셸 우선순위를 설명한다.
- **Q2 확정:** 종료된 WSL 배포판은 선택만으로 실행하지 않는다. 사용자가 `환경 시작` 버튼을 누른 뒤 조회한다. 시작 전에는 버전 확인 전 상태이며, 지난 결과를 현재 상태처럼 표시하지 않는다.
- **Q3 확정:** 기존 nvm을 기능별로 확인하고 가능한 기능을 제공한다. 최신 버전 설치를 강제하지 않고, 조회·설치·전환 중 확인하지 못한 기능만 제한 이유를 표시한다. 실행 파일·설정 신뢰 검증은 유지한다.
- Q4 대기: nodenv 설치에서 바이너리 미제공 시 소스 컴파일도 지원할지. 초기 범위를 바이너리 설치로 제한하는 안을 추천하되 실제 플러그인에서 강제 가능한지 구현 전 검증한다.
- **Q5 수정 요청:** Home의 PlanRail 상태와 Node 작업 정보 구성은 유지하되 작은 위젯 크기로 줄인다. 오늘의 일정 공유 배지는 실제 PlanRail 배경과 일치시킨다. 수정 시안 확인 전이며 메뉴 등 전체 승인으로 확대 해석하지 않는다.
- 후속 협의: 미검증 관리자 버전의 지원 경계, 복수 사용자/복수 관리자 선택, 작업 중 환경 전환, footer 넘침 처리, Home 시안 승인. node-build의 바이너리 미제공 시 소스 빌드 허용 여부·사전 도구·취소 처리도 협의한다.

## 공식 자료 조사

2026-11-19 공식 문서·소스 조사이며 지원 실기 검증과 구분한다.

| 대상 | 확인된 사실 | 근거 |
| --- | --- | --- |
| nvm-windows 1.1.11 / 1.2.2 | version/list/current/install/use의 기본 형태는 공통. 진단 명령 등 차이 존재 | [1.1.11](https://github.com/nvm-windows/nvm/blob/1.1.11/README.md#usage), [1.2.2](https://github.com/nvm-windows/nvm/blob/1.2.2/README.md#usage) |
| nvm-windows 2.0.1 | stable 릴리스. 사용자별 설치, `--version`, 구조화된 조회, shim/link 모드. 빈 목록 응답 등은 JSON이라고 단정하지 않음 | [릴리스](https://github.com/nvm-windows/nvm/releases/tag/v2.0.1), [목록 구현](https://github.com/nvm-windows/cli/blob/fe08afeed22f15b10f07f02df6fcfca0f7d5a77c/src/commands/list/installs.go), [전환 구현](https://github.com/nvm-windows/cli/blob/fe08afeed22f15b10f07f02df6fcfca0f7d5a77c/src/commands/use/root.go) |
| nodenv | NODENV_VERSION → 프로젝트 .node-version → 사용자 기본 버전 순. 외부 프로세스로 이미 열린 셸의 환경변수를 바꿀 수 없음 | [공식 명령 설명](https://github.com/nodenv/nodenv#command-reference) |
| node-build | nodenv install 제공. 정의 목록과 공식 배포 목록이 다를 수 있음. 바이너리가 없으면 소스 빌드 가능 | [공식 README](https://github.com/nodenv/node-build#basic-usage) |
| WSL | 배포판·사용자 지정 실행, 기본 Windows PATH 혼입 가능 | [명령](https://learn.microsoft.com/windows/wsl/basic-commands), [interop 설정](https://learn.microsoft.com/windows/wsl/wsl-config#interop-settings) |

Q4의 기술적 한계: 조사한 [node-build 소스](https://github.com/nodenv/node-build/blob/d319138ee4045453d20dc326574aa709664e0a14/bin/node-build)에는 바이너리 전용 공개 옵션이 확인되지 않았다. 적합한 바이너리 정의가 없을 때 소스 빌드 경로로 진행한다. 바이너리 다운로드 실패 후 자동 컴파일 재시도와는 다르다. 바이너리 전용 정책을 선택하면 소스 빌드 진입을 확실히 차단하는 연동 방법을 먼저 검증해야 하며, 보장할 수 없는 조합은 설치하지 않고 이유를 표시해야 한다. 검증된 커스텀 정의 사용 등은 기술 후보일 뿐 확정하지 않는다.

## 시안과 수용 기준

[직접 눌러보는 시안](mockups/workrail-environments-home.html): 호스트/멤버, Windows/WSL, 정상/오류, Home/PlanRail/NodeRail 전환을 비교한다. 모든 데이터는 예시이며 실제 설치나 설정 변경을 하지 않는다. 기본 버전 전환·명시적 환경 시작은 Q1/Q2 선택을 따른다.

정적 미리보기: [호스트 Home](mockups/workrail-home-host-v2.png) · [멤버 Home / WSL](mockups/workrail-home-member-v2.png) · [NodeRail](mockups/workrail-node-environment-preview.png). 정적 화면의 환경은 실행 중으로 가정한다. 아이콘 툴팁은 시안에서 title로 표시하며 실제 제품은 기존 접근 가능한 Tooltip 컴포넌트로 구현해야 한다.

- Home의 오늘 일정/내 개발 환경 카드 높이를 맞추고 기존 compact 상태 위젯 방향을 유지한다.
- 다크는 기존 Steel Blue 토큰, 라이트는 기존 Forest Crystal 토큰을 사용한다. 새 폰트·아이콘 정체성 변경은 이번 범위에 없다.
- 연결/알림/Node 상태는 색만으로 구분하지 않는다. 툴팁은 포인터와 키보드 모두 접근 가능해야 한다.
- footer 연결 기기 이름은 표시명이며 실제 사용자 계정이라고 단정하지 않는다. 긴 이름·버전 불명·0명·다수 연결을 검증한다.
- nodenv global 성공과 프로젝트에서 실제 실행되는 Node가 동일하다고 단정하지 않는다.
- 데이터 조회 실패, 미설치, 관리자 미지원, 충돌, 작업 실패를 서로 다른 상태로 다룬다.

## 문서 유지와 검증

agents-md의 기존 진입점·명령·문서 분리 원칙에 따라 루트 지침은 확대하지 않고 domain 인덱스와 STATUS에 이번 설계를 연결한다. 최종 결정 후 기존 설계와 달라지는 정책을 이 문서에 승인 기록으로 남긴다. 기존 ADR 디렉터리가 없으므로 동일 결정을 별도 ADR로 중복 생성하지 않는다.

현재 문서는 요구 추적과 미결 결정을 담은 초안이다. 제품 테스트·Windows/WSL 실기는 수행하지 않았으며 구현 완료 증거로 사용하지 않는다.

중간 검토: 독립 공식 자료 검토에서 nvm 2.x shim/link·프로젝트 설정, WSL의 Windows PATH 혼입, node-build 소스 빌드 범위 누락을 지적받아 보완했다. Chromium sandbox를 유지한 정적 시안 렌더링에서 이미지 로드·메뉴/역할/환경/테마 전환·WSL 시작 표현을 확인했다. 1280px 다크 및 800px 라이트에서 가로 넘침과 JS 오류가 없었다. 제품 연동 검증은 아니다. 문서 변경의 하네스 verify 7개 검사를 통과했다.


### Home 수정 시안 v2

사용자는 하단 두 패널의 구성을 유지하면서 작은 위젯처럼 보여 달라고 요청했다. 위젯 너비를 PlanRail 상태 최대 400px, Node 작업 최대 360px로 제한하고 왼쪽부터 나란히 배치한다. 내부 패딩은 13px/14px, 행 간격은 5px로 줄이며 내용 길이에 따라 높이는 자연스럽게 늘어난다. 좁은 화면에서는 세로 배치한다. 오늘의 일정과 내 개발 환경의 동일 높이는 유지한다.

공유 배지의 이전 파란 스타일은 잘못된 시안이었다. `src/renderer/forest-crystal.css`의 실제 `.sharing-badge`를 직접 재사용한다. 배경 `#ab75632b`, 테두리 `#dc9b7d8c`, 글자 `#f4d4c2`, 반경 4px, 폰트 10px/행 높이 16px, 좌우 패딩 4px로 제품 PlanRail과 일치시킨다. 제품 코드 변경은 없다.

수정 시안 검토: 1280px 화면에서 호스트 위젯 콘텐츠 높이 191px/183px, 멤버·WSL 위젯 193px/211px를 확인했다(테두리 제외). 800·600·390px에서 가로 넘침과 브라우저 JS 오류가 없었다. 공유 배지의 계산된 배경·테두리·폰트가 실제 `.sharing-badge` 규칙과 일치함을 확인했다.
