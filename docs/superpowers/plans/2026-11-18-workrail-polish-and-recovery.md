# WorkRail 화면·역할 전환·Node 복구 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. 독립 작업은 명시된 파일 소유권 아래 병렬 처리하고 통합 검증은 순차 실행한다.

**Goal:** 승인된 상단 메뉴·아이콘·화면 개선, 호스트/멤버 역할 전환과 공식 MSI Node 충돌 복구를 실제 앱에 반영한다.

**Architecture:** 기존 Electron main/preload/renderer 경계를 유지한다. 역할 전환은 저장소의 원본 보관과 수신 자료 정리를 구분하고, Node 제거는 재검증한 공식 MSI 대상으로만 Windows 표준 UI를 실행한다. 개발 실행은 정적 독립 관리 프로세스에서 이어간다.

**Tech Stack:** Electron45, React19, TypeScript7, SQLite/better-sqlite3, Vitest, Playwright, Windows Installer.

**Spec:** [화면·아이콘](../../design/workrail-screen-polish.md), [역할 전환](../../design/sharing-role-switch.md), [Node 충돌 복구](../../design/node-conflict-removal.md).

## Global Constraints

- 2026-11-18 사용자가 문서 정리 후 구현 시작을 요청했다. 기존 설계 단계의 코드 수정 금지는 이번 구현 요청 범위에서 해제됐다.
- Home / PlanRail / NodeRail, B 상단 메뉴, 메뉴 E 모듈형·앱 F WR 모노그램. 기존 차콜·스틸 블루 글래스 유지.
- 기존 Node 제거는 공식 MSI·단일 대상·Windows 표준 UI·직전 재검증. 임의 폴더/PATH 삭제·전역 npm 자동 이관·다른 프로세스 강제 종료 없음.
- 개발 관리 창은 시스템 Node와 개발 서버 없이 재실행 가능. 작업 소유권 불명은 fail closed.
- 개인 자료 보존, 이전 호스트 원본 별도 조회·읽기 전용, 현재 일정·알림에서 제외. 수신 자료/자격 정리 후 재승인. 공유/업데이트 자동 재개 없음.
- sandbox 유지, 운영 DB 사용 금지, 전체 앱/산출물 경로 공유 검사는 순차 실행. 실패 로그 보존, 테스트 제외·임의 timeout 증가 없음.
- 버전·설치 식별자·프로필 경로는 임의 변경하지 않는다. 환경 게시와 배포는 수행하지 않는다.

## Review Focus

1. 역할 변경 중 재시작·자격 삭제 실패: 완료 표시·이전 서버 자동 재개가 없어야 한다. Task2에서 실패 주입 검사.
2. 보관 자료의 다른 CRUD/알림 진입점: 화면에서 숨긴 것만으로 권한을 보장하지 않는다. Task2 native repository 검사.
3. 제거 대상이 확인 후 교체되거나 위조된 등록: 실행하지 않는다. Task3 MSI 식별 검사.
4. 개발 부모 종료·UAC helper 생존: 잠금이 자동 해제되지 않고 복구 창으로 이어진다. Task4 프로세스/잠금 검사.
5. 상태 조회 실패·메뉴 이동·좁은 창: 가짜 정상 배지 없이 입력/정렬을 보존한다. Task1/5 UI 및 Task6 E2E 검사.

### Task 1: 화면·메뉴·정렬

**Files:** `src/renderer/workrail/{ToolDock,Home,NodeScreen,nodePresentation}.tsx` 또는 기존 `.ts`, `src/renderer/workrail.css`, 신규 `src/renderer/workrail/ToolIcon.tsx`, `tests/ui/workrail.test.tsx`, `tests/unit/node-presentation.test.ts`.
**Interfaces:** 기존 Home/NodeScreen props 보존. `ToolIcon({tool:'home'|'planrail'|'node',size?:number})`. Node 정렬 순수 함수는 `sortNodeCatalog(rows, {column,direction})`를 제공하며 Node/npm 숫자 비교·불명 값 후순위.
- [x] 현재 UI 검사에 최신 라벨·Node 제목/로딩 문구 제거·정렬/상태 보존 실패 사례 추가, `npm run test:ui -- tests/ui/workrail.test.tsx`에서 RED 확인.
- [x] 상단 배치·글래스·카드 높이·얇은 로딩선·독립 스크롤·정렬·위젯과 E 아이콘 반영. 메뉴 마운트 수명은 Task5에서 통합.
- [x] UI/정렬 단위 검사 GREEN 확인, 변경 파일만 커밋.

### Task 2: 공유 역할 전환과 원본 보관

**Files:** `src/shared/sharing.ts`, `src/main/db/sharing/*`, `src/main/sharing/{service,repository,ipc-core}.ts`, 관련 schema/migration·알림 조회, `tests/native/sharing*.case.ts`, `tests/unit/sharing*.test.ts`.
**Interfaces:** `switchRole({role:'host'|'member',confirmed:true}):Promise<Result<SharingState>>`, `getDormantData():Promise<Result<{projects:Project[];schedules:Schedule[]}>>`. 기존 역할 enum 유지. 상태에 전환/보관 정보 추가, 정확한 필드는 구현 기록에 남긴다. UI/preload 통합은 Task5 소유.
- [x] 보관 원본 제외·쓰기 거부·승인 유지·수신 삭제·재시작 실패 사례를 먼저 추가하고 RED 확인.
- [x] 로컬 호스트와 원격 멤버 설정 분리, 영속 전환 단계·자격 정리·generation 경계 구현. 기존 호스트 ID 유지.
- [x] 공유/업데이트 제공 중지 연계가 필요한 index 호출 계약을 Task5 담당에게 전달. native/unit GREEN 후 커밋.

### Task 3: 공식 MSI 제거와 공통 작업 잠금

**Files:** `src/main/node-management/*`, `src/shared/node-management.ts`, `tests/unit/node*.test.ts`.
**Interfaces:** Node 상태에 제거 가능 여부/대상 표시/재부팅 필요·복구 상태 추가. `removeStandalone({confirmed:true,...confirmationIdentity})`는 renderer 임의 명령/경로를 받지 않는다. Windows adapter가 MSI 탐색·재검증·표준 제거 및 잠금을 소유. 구체 API를 Task4/5와 공유.
- [x] 단일 공식 MSI/모호한 대상/확인 후 변경/UAC 취소/3010·1641/작업 불명에 대한 RED 검사.
- [x] Windows Installer 등록/파일 대응·서명·권한 경계, 표준 UI 제거·결과 재검사·영속 잠금 구현. 상태 불명과 재부팅 필요는 자동 다음 작업 금지.
- [x] 단위/IPC GREEN 검사 후 커밋. Windows 실기와 모의 adapter 검증을 구분.

### Task 4: 독립 관리 창·복구 진입

**Files:** 신규 `src/main/node-maintenance/*`, 정적 관리 renderer/preload, `electron.vite.config.mts`, `tests/unit/node-maintenance.test.ts`, 관련 release 검사.
**Interfaces:** `createNodeMaintenanceController(...).open():Promise<MaintenanceReady>`는 정적 자산·Electron runtime 복사 및 준비 검증 후 별도 프로세스로 인계. Task3의 Node 서비스/공통 잠금을 재사용, PlanRail DB를 열지 않는다.
- [x] 실행 환경 정리·준비 실패·소유권/재실행·부모 종료 경계 RED 검사.
- [x] Node 없는 복구 바로가기, 격리 프로필, 정적 화면에서 제거→nvm 설치→Node 설치/사용을 각각 클릭하는 흐름 구현.
- [x] 빌드/계약 검사 GREEN, Windows 실제 런타임 복사·UAC 인수는 미검증이면 명시.

### Task 5: 상태 API·설정·제품 통합

**Files:** `src/renderer/App.tsx`, `src/renderer/components/{SharingSettings,HolidaySettings,UpdateDistribution}.tsx`, `src/renderer/sharing/*`, `src/main/bootstrap.ts`, `src/preload/index.ts`, `src/shared/reminder-api.ts`, 알림 controller, 설정 CSS, `tests/ui/*`, `tests/unit/*`.
**Interfaces:** ReminderState에 `muted:boolean|null`(알 수 없음 null); 기존 onChange 통지 사용. 공유/Node API는 Task2/3 결과를 preload allowlist에 연결. 별도 `PlanRailStatus` 읽기 전용 footer와 dormant 조회 창.
- [x] 무음 정책·역할 확인·멤버 공통 휴일 readonly·미저장 가드·조회 실패·메뉴 상태 보존 RED 검사.
- [x] Home 역할 패널·PlanRail footer로 배지 이동, 알림 색상/심벌, 설정 밀도와 휴일 구분·작은 우측 버튼 구현.
- [x] 역할 전환·Node 제거/관리 창 계약 연결, update/quit 보호 확인. UI/unit GREEN 검사.

### Task 6: F 앱 아이콘·통합 검증

**Files:** `resources/*`, 아이콘 생성 스크립트/renderer 브랜드 자산, 관련 release/UI/E2E 검사와 도움말.
**Interfaces:** 기존 앱 ID/파일명 유지, 선택한 F WR 모노그램의 최종 PNG/ICO를 동일 경로로 제공.
- [x] BrandKit 선택 보드를 기준으로 투명 아이콘 자산 제작, 메뉴 E와 글래스 화면을 함께 시각 검토.
- [x] 테스트의 이전 UI 이름·역할 고정 기대를 승인된 동작으로 갱신하되 검사 범위 축소 금지.
- [x] `npm run verify:app`을 단독 실행하고 실패 원인 수정. `node scripts/harness/run.mjs verify` 실행. 독립 코드 검토 및 필요한 보정.

### Task 7: 문서·인수 기록

**Files:** `docs/implementation/2026-11-18-workrail-polish-and-recovery.md`, 관련 설계·STATUS·domain 인덱스.
- [x] 승인/구현/Windows 미검증을 나눠 기록, 검사 SHA·dirty·로그 경로 보존.
- [x] 변경 범위만 커밋하고 원격 반영은 세션의 기존 게시 금지 및 명시적 Git 지시를 구분한다. 환경 게시/사용자 PC 배포 없음.

## 실행 기록

계획 작성 후 사용자 구현 요청에 따라 바로 진행한다. 실행 방식 재승인 대신 본 세션에서 통합을 담당하고 파일 영역이 독립된 backend 작업을 분담한다. 진행은 구현 기록의 체크리스트에 보존한다.

완료: clean `f356b71`의 전체 앱 검사 7단계 통과. 상세 수치·실패 보정·Windows 미검증 경계는 [구현 기록](../../implementation/2026-11-18-workrail-polish-and-recovery.md)을 따른다. 원격 반영은 저장소의 기존 main 직접 반영 지시를 따르며 환경 게시/배포는 수행하지 않는다.
