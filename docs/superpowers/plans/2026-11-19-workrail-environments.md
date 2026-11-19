# WorkRail 환경 연동·통합 화면 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 승인된 16개 개선을 기존 설치·일정·업데이트 호환성을 보존하며 제품에 반영한다.
**Architecture:** Windows 관리자별 연동을 확장한 뒤 Windows/WSL 환경 실행·선택을 서비스에서 통합한다. renderer는 환경·기능 상태만 소비하고 공유/도움말/배포 계약은 각각 분리해 변경한다.
**Tech Stack:** 기존 Electron, TypeScript, React, SQLite, PowerShell/WSL CLI, Vitest, Playwright, electron-builder.
**Spec:** [Q12 확정 설계](../../design/workrail-environments-and-home.md).

## Global Constraints

- 기존 nvm 우선. 최신 설치를 강제하지 않고 조회·설치·사용 기능을 각각 검증한다. 실행 파일 신뢰·설정 검증을 우회하지 않는다.
- Windows nvm 1.x/2.x와 WSL2 nodenv를 구분한다. WSL은 배포판 기본 사용자만 관리하고 nodenv/node-build/빌드 도구는 자동 설치하지 않는다.
- WSL은 명시적 `환경 시작` 전 내부 명령 0회. 소스 컴파일은 필요한 경우 지원하며 사용자 프로젝트 .node-version을 수정하지 않는다.
- 단일 환경 자동 선택, 복수 환경 마지막 선택 복원/최초 선택. 실행 중 작업의 환경 변경 금지. 목록 조회 실패를 빈 목록으로 표시하지 않는다.
- 기존 글래스 재질·아이콘 유지. 공통 외곽 14px, Home 위젯 400px/360px 상한, Node 최대 3개·참여자 최대 2명.
- 내부 appId·실행 파일명·프로필·자동 실행 경로 유지. artifact 및 배포 EXE/ZIP 이름만 WorkRail로 통일하고 metadata 참조를 일치시킨다.
- 실제 운영 DB를 사용하지 않으며 Electron sandbox를 끄지 않는다. artifact를 공유하는 앱 검사는 순차 실행한다. 테스트 제외·무조건 재시도·임의 timeout 증가는 금지한다.
- 제품 구현은 이번 사용자 요청으로 승인됐다. 기본 제품 버전 1.0.0은 임의 증가하지 않는다. main push는 저장소 상시 승인 범위에서 전체 검증 후 수행한다.

## Review Focus

- nvm 1.1.11을 standalone Node로 잘못 표시하거나 2.x 설정/권한에 1.x 가정을 적용하지 않도록 Task 1에서 fixture별 탐지·실행 테스트.
- 종료 WSL 및 지연된 환경 응답으로 다른 대상에 작업하지 않도록 Task 2에서 명령 호출 횟수·대상 ID·세대 검사.
- Home 빠른 사용과 NodeRail 작업이 중복 실행되거나 확인 실패를 성공으로 표시하지 않도록 Task 2/3에서 결과 검증·공유 busy 상태 검사.
- 구버전 공유 상대가 추가 필드 때문에 동기화를 거부하지 않도록 Task 4에서 기존 snapshot 유지·선택적 메타데이터 유무 양쪽 검사.
- EXE 이름 변경으로 업데이트 metadata나 설치 identity가 어긋나지 않도록 Task 5/6에서 패키지 참조와 실제 Windows 업데이트 확인.

## Task 1: Windows 기존 nvm 기능별 연동

**Files:** `src/shared/node-management.ts`, `src/main/node-management/discovery.ts`, `windows.ts`, `service.ts`; 새 `manager-support.ts` 등 책임별 모듈; `tests/unit/node-management.test.ts`, `node-windows-launch.test.ts`, `node-elevation-windows.test.ts` 및 관리자별 신규 테스트.
**Interfaces:** 기존 WindowsNodeAdapter/discoverWindowsNode는 유지·확장한다. manager에 선택적 `kind: 'nvm-windows'|'nodenv'`, state에 선택적 `capabilities: Record<'list'|'install'|'use',{available:boolean;reason:string|null}>`를 추가한다. 설치 정보에는 검증된 관리자 버전/계열·실행 검증 근거를 담아 변경 직전까지 전달한다. 기존 1.2.2 신규 설치·MSI 제거 계약은 보존한다.
- [x] 기존 공식 1.1.11/1.2.2, 2.x, 손상/불명 실행 파일·설정의 식별과 기능별 제한 테스트를 작성하고 실패를 확인한다.
- [x] 공식 배포 근거로 파일 신뢰 검증과 관리자별 명령/설정 adapter를 구현한다. 1.1.11과 2.0.1의 실제 명령·구조를 확인하며 버전 문자열만 신뢰하지 않는다.
- [x] service의 기능별 gate·정확한 오류/출처 표시를 연결하고 제거 기능과 nvm 존재를 혼동하지 않게 한다.
- [x] `npm run test:unit -- tests/unit/node-management.test.ts tests/unit/node-windows-launch.test.ts tests/unit/node-elevation-windows.test.ts --reporter=dot` 및 신규 관리자 테스트, `npm run typecheck`를 실행한다.
- [x] 관련 파일만 커밋하고 검증·지원 한계를 보고한다.

## Task 2: 환경 선택 서비스와 WSL nodenv 연동

**Files:** 새 `src/main/node-management/environments.ts`, `wsl.ts` 등; `src/shared/node-management.ts`, `service.ts`, `ipc-core.ts`, `ipc.ts`, `src/preload/index.ts`, `src/main/bootstrap.ts`, 필요 시 node-maintenance routing; `tests/unit/node-environments.test.ts`, `node-wsl.test.ts`, `node-management-ipc.test.ts`.
**Interfaces:** `NodeEnvironment {id,label,kind:'windows'|'wsl2',distro?:string,user?:string,running:boolean}`. state의 선택적 `environments:{status:'loading'|'ready'|'error',items:NodeEnvironment[],selectedId:string|null,error:NodeManagementError|null}`. API `selectEnvironment(id:string)`, `startEnvironment()`, `cancelOperation()`를 추가한다. `getState`는 탐지·선택 복원 후 상태를 반환한다. 명령은 renderer 경로 입력을 받지 않고 발견한 ID를 검증한다. NodeOperation phase에 컴파일을 나타낼 수 있게 확장한다.
- [x] 단일 자동 선택/최초 복수 미선택/저장 선택 복원/대상 삭제/탐지 실패/중복 작업/지연 응답 테스트를 작성하고 실패를 확인한다.
- [x] WSL 목록·실행 상태만 조회한 뒤 선택된 실행 중 환경만 내부 검사한다. 종료 환경은 startEnvironment 전 내부 실행 0회를 검증한다. 기본 사용자·도구 경로와 Windows PATH 혼입을 구분한다. `catalog.ts`의 기존 Windows x64 전용 필터가 WSL 목록을 누락시키지 않도록 대상별 공식 목록 처리와 node-build 정의의 교집합을 연결한다. 기존 Windows parser 호출·테스트의 기본 동작은 보존한다.
- [x] nodenv versions/global 및 node-build install을 기본 사용자로 수행한다. 읽기·설치·전환 기능 제한, 바이너리/소스 빌드, 도구 없음 안내, 정확한 대상 취소·진행 로그·결과 재확인을 구현한다.
- [x] Windows 서비스와 함께 환경 coordinator에 연결하고 선택을 userData 아래 원자적 저장한다. 설치/사용 작업 중 전환을 막고 선택/명령 세대로 오래된 결과를 무시한다. 기존 복구 창은 Windows 전용 경로를 유지한다.
- [x] IPC/preload/bootstrap 연결 후 관련 unit 테스트와 typecheck를 실행한다. Windows/WSL 실제 실행을 하지 못한 범위는 구분한다.
- [x] 관련 파일만 커밋하고 후속 UI에 정확한 인터페이스를 보고한다.

## Task 3: Home·NodeRail·footer·메뉴 스타일

**Files:** `src/renderer/workrail/{Home,NodeScreen,NodeRecovery,PlanRailStatus,ToolDock}.tsx`, `useNodeManagement.ts`, `nodePresentation.ts`, `workrail.css`, `forest-crystal.css`, 필요 시 전용 widget/environment 컴포넌트; `tests/ui/workrail*.test.tsx`, `tests/unit/node-catalog-sort.test.ts`, 관련 E2E.
**Interfaces:** Task 1/2의 manager/capabilities/environments/API를 소비한다. 공유 상태는 기존 memberPresence/deviceVersions 사용, Task 4의 선택적 hostVersion은 없으면 확인 불가. Node 상태와 작업은 Home/NodeRail에서 단일 hook을 공유한다.
- [x] 기능 제한·목록 불명·WSL 시작 전·최초 환경 선택·위젯 빠른 사용/중복 방지와 footer on/muted/unknown 테스트를 작성하고 실패를 확인한다.
- [x] 승인 시안과 같은 compact 위젯, 동일 높이 상단 카드, 14px 프레임, 실제 공유 배지, 선택 CTA·flat 메뉴·본문 폰트를 구현한다.
- [x] 환경명과 필요할 때만 환경 변경 창, 종료 WSL 시작, 현재 대상·기능 제한·작업 진행/취소를 연결한다. 작업 중 환경 변경 금지.
- [x] LTS·코드명/비 LTS 설명, 상태 아이콘+키보드 툴팁, 설치/사용/사용 중/다시 확인 구분, 기존 정렬·표 진행·패널 높이를 유지한다.
- [x] Home 노드 최대3/참여자 최대2와 전체 목록, footer 실제 연결 참여자+버전/외 N명, 상태별 알림 툴팁을 구현한다.
- [x] 관련 UI·단위 검사 및 typecheck 후 격리 프로필로 다크/라이트·작은 창 시각 검증을 수행하고 커밋한다.

## Task 4: 호스트 실행 버전과 메뉴별 도움말

**Files:** `src/shared/sharing.ts`, `src/main/sharing/{host,transport,service}.ts`; `src/shared/{help,help-content}.ts`, `src/main/{help-window,window-ipc}.ts`, preload·renderer 도움말 진입 및 관련 unit/native/UI 테스트.
**Interfaces:** `SharingState.hostVersion?: string|null`은 인증된 현재 호스트의 실행 버전이다. 기존 snapshot shape/protocol 유지, 선택적 응답 메타데이터 사용. 도움말은 `HelpSection = 'home'|'planrail'|'noderail'|'settings'` 전달 및 섹션별 읽기 상태를 지원한다.
- [x] 구버전 응답에 버전 없음/유효값/잘못된 값/연결 대상 교체 테스트, 메뉴별 첫 진입/읽기 위치/검색 복원 테스트의 실패를 확인한다.
- [x] 호스트 실행 버전 전달·클라이언트 검증/초기화를 연결한다. 배포 manifest 버전은 재사용하지 않는다.
- [x] 도움말 목차·열기 IPC·읽기 상태·전체 검색 메뉴 라벨을 연결한다. 기존 창 재사용·오프라인 자산·관련 글 링크를 보존하고 1.2.2 고정 호환 설명을 수정한다.
- [x] 해당 unit/UI/native 검사와 typecheck를 실행하고 커밋한다.

## Task 5: 배포 산출물 이름 WorkRail 통일

**Files:** `.github/workflows/app.yml`, `electron-builder.yml`, `scripts/release/{update-bundle,build-windows}.mjs`, `tests/release/{package,update-bundle,source,installer}.test.mjs`, 배포 안내 문서.
**Interfaces:** installer/update ZIP은 WorkRail 접두어, 기존 버전/SHA/unsigned/test-only 의미 유지. appId/executableName/UPDATE_APP_ID·기존 프로필·레거시 테스트는 유지한다.
- [ ] 새로운 파일명 및 blockmap/latest.yml/manifest/hash 참조 일치와 내부 identity 보존을 검사하는 release 테스트 실패를 확인한다.
- [ ] artifact/EXE/업데이트 ZIP 및 파생 metadata 참조를 함께 수정하고 문서를 맞춘다. artifact 구성 파일은 임의 재배치하지 않는다.
- [ ] `npm run test:release`를 실행하고 커밋한다. 실제 Windows 설치/업데이트 검증은 Task 6 CI에서 확인한다.

## Task 6: 통합 검증·검토·인계

**Files:** 위 작업에서 드러난 통합 수정, `docs/implementation/2026-11-19-workrail-environments.md`, `docs/wayfinder/STATUS.md`, `docs/agents/domain.md` 및 필요한 사용자 도움말/검증 문서.
- [ ] 요구 1~16과 Q1~Q12의 코드·검증 대응을 재확인한다. 누락은 담당 영역으로 수정하고 회귀 검사를 수행한다.
- [ ] `xvfb-run -a npm run verify:app`와 `node scripts/harness/run.mjs verify`를 순차 실행하고 로그·SHA·dirty·미검증 범위를 기록한다.
- [ ] 전체 변경의 독립 코드 검토를 받고 중요한 결함을 해결한다. 제품 버전은 임의 증가하지 않는다.
- [ ] 문서를 현재 구현으로 갱신하고 검증된 범위를 커밋·main push한다. 원격 Application/Repository harness 결과와 Windows 실제 packaged 검사 및 artifact 생성까지 확인한다.
- [ ] WSL/사용자 PC 실기를 직접 수행하지 못했다면 자동 테스트 결과와 구분하여 최종 보고한다.
