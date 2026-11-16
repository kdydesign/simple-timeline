# 알림 제어·멤버 접속 상태 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. 승인 설계를 기준으로 직접 실행하고 마지막에 독립 전체 검토를 받는다.

**Goal:** 업데이트 알림, 해당 PC의 전체 Windows 알림 끄기, 호스트 접속 멤버 표시, 처음부터 정확한 자동 실행 트레이 메뉴를 제공한다.

**Architecture:** main의 SQLite 정책과 종류별 처리 이력으로 무음·재개 경계를 관리한다. 공유 호스트는 인증된 정상 응답 완료만 메모리 접속 정보에 반영한다. 기존 업데이트·공유 전송과 UI의 제한된 IPC를 확장하며 별도 서버/heartbeat는 추가하지 않는다.

**Tech Stack:** 기존 Electron/React/SQLite/TypeScript/Vitest/Playwright. 새 의존성 없음.

**Spec:** [Q1~Q9 승인 설계](../../design/notification-controls-and-member-presence.md)

## Global Constraints

- 사용자 순서: 도움말 Windows 빌드 실패 수정·배포 검증 완료 후 이 기능 구현. 도움말0.8.2와 후속0.8.3 구분.
- 알림은 해당 PC만 제어. 개별 알림 설정·동기화·UPDATE·오류 안내는 유지. 무음 해제 첫 정상 조회까지 소급 억제.
- 업데이트 알림 키=hostId+정식 버전. OS 호출 전 이력 commit. 실패/결과 불명 자동 재전송 금지.
- 알림 클릭은 안내만 열고 자동 다운로드 금지. 미저장 입력과 모달 유지.
- 접속은 인증된 정상 sync/snapshot 응답 완료 후10초 이내, 단조 시각.1초 이내 만료 갱신. 권한/주소/호스트 세대 변경은 즉시 무효화.
- 트레이 우클릭은 최신 조회 완료 후 메뉴1회, 늦은 응답은 취소. 전체 알림 끄기는 자동 실행 아래.
- 사용자 상시 승인에 따라 main 직접 commit/push. 운영 DB·실제 OS 알림을 사용하는 자동 검사는 금지. sandbox 유지.

## Review Focus

1. 무음 전환과 지연 OS 실패 callback 경합: 억제된 이력을 failed로 복구하거나 재발송하지 않는다(Task1/2).
2. 무음 중 종료/단절 뒤 해제: 개인 후보는 같은 트랜잭션으로, 공유/업데이트는 첫 정상 수신까지 억제(Task1/2).
3. 오래된 업데이트 알림 클릭과 열린 모달: 최신 배포 확인, 입력 보호, 다운로드 없이 한 번만 안내(Task2).
4. 인증 응답 뒤 권한 변경/절전/시계 변경: 연결 수 과대 표시 방지(Task3).
5. 트레이 조회/쓰기와 연속 클릭/종료: 잘못된 체크·메뉴 재오픈 방지(Task4).

## Task 1: 영속 무음 정책·날짜/공유 알림 경계

**Files:** `src/main/db/notifications.ts`, `src/main/notifications/policy.ts`, `src/main/db/migrations.ts`, `src/main/db/reminders.ts`, `src/main/db/sharing/cache.ts`, `src/main/db/sharing/change-inbox.ts`, `src/main/reminders/engine.ts`, `src/main/sharing/service.ts`, `src/main/bootstrap.ts`, `tests/native/notification-controls.case.ts`, `tests/unit/reminder-engine.test.ts`.

**Interfaces:** `createNotificationStore(db)`의 `state()/setMuted(value,settle)/resumeShared(settle)/observeUpdate(status)/finishUpdate(key,state)`; 상태는 muted, generation, sharedResume, changesResume, updatesResume. `setMuted`와 로컬 날짜 후보 억제는 같은 SQLite 트랜잭션. ReminderStore에 `suppress(items)`와 suppressed 상태. 공유 캐시/수신함은 동기화 원자적 반영에서 재개 기준을 소비한다.

- [x] RED: migration 보존, 기본 허용, 재실행 무음 유지, 실패 rollback, 개인/공유 날짜 후보 억제·지연 실패·새 날짜 재알림, 변경 cursor/개별 설정 보존·첫 수신 baseline 테스트.
- [x] 구현: migration6, 정책/store, 엔진과 수신함 연동. 무음 요청 직후 main 발송 잠금. DB 실패는 오류로 보존.
- [x] GREEN: `npm run test:native`, 관련 `npm run test:unit` 통과. 실행 로그는 `artifacts/notification-controls/`.

## Task 2: 업데이트 Windows 알림과 안전한 안내 열기

**Files:** `src/main/notifications/updates.ts`, `src/main/updates/service.ts`, `src/main/updates/ipc-core.ts`, `src/shared/updates.ts`, `src/preload/index.ts`, `src/renderer/components/UpdatePopover.tsx`, `src/renderer/state/useUpdates.ts`, `tests/unit/update-notifications.test.ts`, `tests/ui/update-ui.test.tsx`, `tests/e2e/notification-controls.spec.ts`.

**Interfaces:** 검증 완료한 `UpdateStatus`를 알림 정책에 전달. 업데이트 서비스에 `requestOpen()/acknowledgeOpen(token)`과 상태의 `openRequest/notificationError`를 추가. 클릭은 서비스 `check()` 후 요청, renderer는 모달 닫힌 뒤 한 번 소비. `createUpdateNotifications`는 공통 정책과 native sender를 사용.

- [x] RED: 같은 호스트/버전 중복, 재배포/재승인, 다른 높은 버전, 이력 실패, OS 실패, 무음·재개 baseline. 알림 클릭은 안내만/모달 보호/철회·최신·단절 동작.
- [x] 구현 후 GREEN: 관련 단위/UI 및 실제 격리 Electron 알림 모의 sender 시나리오 통과. 실제 OS는 Windows 실기로 분리.

## Task 3: 인증 응답 기반 접속 상태

**Files:** `src/main/sharing/presence.ts`, `src/main/sharing/host.ts`, `src/main/sharing/service.ts`, `src/shared/sharing.ts`, `src/renderer/components/SharingSettings.tsx`, 기존 스타일, `tests/unit/sharing-presence.test.ts`, `tests/native/sharing.case.ts`, `tests/ui/sharing.test.tsx`.

**Interfaces:** `createPresence({now,wallClock,changed})`의 `record(deviceId)/invalidate(id?)/snapshot(devices,active)/dispose()`. Host의 `onSyncComplete(deviceId)`는 finish 이벤트에서 세대·재인증 성공 시만 호출. SharingState에 선택적 `presence`(deviceId→connected/lastSeenAt)와 `connectedMembers`.

- [x] RED:200/304만 기록,401/403·실패·파일 다운로드 제외,10초 정확한 경계·1초 만료,동일 PC 중복/권한/IP/절전/세대/벽시계 변경.
- [x] 구현 후 GREEN: 단위·native·UI/두 프로필 E2E. 기존 승인 행 유지, 별도 보조 줄·연결 수 표시.

## Task 4: 트레이·출시 통합

**Files:** `src/main/tray.ts`, `src/main/bootstrap.ts`, `tests/unit/tray.test.ts`, 도움말 콘텐츠/이미지 메타데이터, `docs/release/user-guide.md`, 기존 설계·STATUS·구현 기록, package/lock0.8.3.

**Interfaces:** 트레이에 `notifications:{read,set}` 추가. read 결과 확정 후1회 menu 표시, 시작 preload, 직렬화된 토글, request generation으로 늦은 우클릭 결과 취소.

- [x] RED: 시작 상태 ON/OFF/실패, 지연 조회·다중 클릭·좌클릭/종료 무효화, 실제 체크·쓰기 실패 복원, 전체 무음 메뉴 순서.
- [x] 구현·GREEN: 관련 단위, 전체 verify:app, harness, diff·경로 검사, 실제 UI 캡처. 독립 전체 검토의 중요 문제를 재현 테스트로 보정.
- [ ] main commit/push, GitHub 양 OS 및 설치 CI 확인. Windows 실사용 배너·방해금지·회사PC는 미검증으로 구분.

## 실행 기록

- Pre-flight: Task1 정책/세대가 Task2 알림 이력·Task4 트레이 설정의 공통 원천. Task3은 기존 sync와 Task1의 공유 재개 경계를 함께 사용하지만 상태 저장소는 분리한다.
- Ruling: 이미 전체 설계와 구현 순서가 승인됐으므로 구현 방법의 재승인을 묻지 않는다. 기존 main 작업 지침과 ignored artifacts 로그를 사용한다.
- Ruling:0.8.2 도움말 배포를 먼저 검증하고 후속은0.8.3으로 구분한다. 잘못된 버전 정책이면 배포 번호를 조정해야 하지만 데이터/권한에는 영향이 없다.

### 구현 전 코드 대조 메모

- 도움말 CI 수정: `bfb7887`, Application `43800500478` 확인 대기. 기존/fixture 두 updater 발신 경합을 gate+dispose로 제거하고 fresh renderer 구독으로 revision 재설정. 로컬 RED→GREEN 및 verify:app7/7 통과. 후속 제품 코드는 아직 시작하지 않았다.
- 정책 구현은 migration6의 singleton 설정과 업데이트 알림 이력, 기존 reminder delivery에 `suppressed` flag를 추가하는 방식으로 기존 FK/전송 상태를 보존한다. `state()`는 flag를 별도 suppressed 상태로 반환하고 issues/retry/늦은 finish에서 제외한다. 변경 수신함은 기존 cancelled 상태를 활용해 전역 무음이 개별 enabled를 덮지 않게 한다.
- 무음 설정 transaction에서 개인 due 후보 억제·발송 대기 취소·shared/changes/updates 재개 플래그와 generation을 원자적으로 갱신한다. 날짜 엔진은 매 후보에 최신 정책을 검사한다. 공유 정상 수신/업데이트 정상 조회는 시작 당시 정책 generation을 전달해 늦은 이전 세대 응답이 재개 기준을 잘못 소비하지 않게 한다.
- 기존 `bootstrap`은 DB ready 뒤 엔진을 시작하므로 정책 초기화는 그 앞에 둔다. SQLite read 실패는 초기화 차단/지속 오류로 드러내고 기본 false로 덮지 않는다. native sender의 `Notification.show()`는 동기 호출이며 이 직전 정책 검사 이후 await를 넣지 않는다.
- `UpdatePopover`는 UPDATE 클릭 즉시 download를 실행하므로 알림 클릭에 재사용하지 않는다. 새 openRequest token은 모달이 사라질 때까지 보류한 뒤 안내만 열고 acknowledge한다. 최신 상태에 버전이 없으면 일반 안내를 제공하며 stale payload로 다운로드하지 않는다.
- `createSharingHost`의 response finish callback에서 세대·재인증 후 presence 기록. service의 save/revoke/delete/invalidate/suspend에서 즉시 무효화. 메모리 monotonic deadline과 표시용 ISO wall time은 구분한다.
- 기존 테스트에 schema version5 상수가 있으므로 migration6 도입 시 실제 목표 버전으로 갱신하되 원본/백업/권한 보존 검사는 유지한다. 도움말 콘텐츠/참여자 스크린샷도0.8.3 실제 동작으로 갱신해야 한다.


### 구현·검증 진행

- Task1: migration6·무음/세대·개인 억제·공유 수신 기준을 연결했다. native78/78, 관련 엔진 단위 검사 통과. 실제 inbox 누적1건→0건 RED→GREEN. 지연 OS 실패가 무음 세대를 넘어 재시도 이력을 되살리지 않는 회귀 포함.
- Task2: hostId/버전 기록과 OS sender, 최신 상태 requestOpen/ack, 모달 보류 구현. UI16/16, 실제 두 프로필 업데이트 E2E에서 알림 클릭은 다운로드하지 않음·재실행 중복 없음 확인.
- Task3: 인증 응답 finish만 기록, monotonic10초·1초 만료·무효화 구현. presence 단위 및 실제 HTTPS23/23, 두 프로필 Electron 연결 수/배지 검증 통과.
- Task4: 트레이 사전/최신 조회·직렬화·실패/타임아웃·무음 메뉴 구현. 관련 unit25/25, typecheck, harness 통과. 전체 회귀 및 독립 최종 검토를 시작한다.
- Ruling: scripts의 별도 작업 디렉터리 대신 이 계획 파일을 계속 작업 ledger로, artifacts/notification-controls를 로그 위치로 사용한다. 기존 세션 기록을 보존하고 실측 경로를 한 곳에 연결한다. 코드 동작에는 영향이 없고 자동 task bookkeeping을 수동 기록으로 대신한다.
- 도움말 선행 CI 43800500478 최종 성공 확인. 최신 캡처는 실제 renderer+격리 SQLite+가상 자료이며 Windows 실제 OS 알림 화면이 아니다.


### 최종 독립 검토 및 보정

- Important1: UPDATE 팝오버가 닫히면 이력 오류가 숨음. `shows a persistent notification storage error even while an available UPDATE popup is closed`에서 RED를 확인하고 외부 지속 안내로 이동했다.
- Important2: 무음 해제 때 진행 중인 이전 세대 업데이트 확인에 합류해 새 기준 조회가5분 지연됨. `unmute force check queues one current-generation request behind an in-flight old-generation check`에서 reads1≠2 RED를 확인하고 직렬 force check를1회 예약하도록 보정했다.
- Final: minor (deferred): 접속 표시의 ‘연결 N대’·‘아직 없음’ 문구는 설계의 ‘연결된 멤버 N명’·‘확인 기록 없음’과 다르다. 기능/판정에는 영향이 없으며 현재 화면 표현을 유지한다.
- Final: Ruling: reviewer가 보류한 전체 검증/Windows CI는 실행 결과를 확인한 뒤 종료한다. 회사 PC의 Windows 배너·알림 센터·절전과 구버전 실제 PC 조합은 자동 검증으로 대체하지 않고 실기 미검증으로 남긴다. 비용은 실제 환경별 OS 정책 차이를 사용자가 확인해야 한다는 점이다.
- Build 보정: 캡처용 unpackaged Electron의 app.getVersion()은0.0을 반환했다. 도움말 build gate가 이를 발견했다. metadata.version은 촬영 소스 package 버전, runtimeVersion은 실제 fixture 반환값으로 분리해 검증 근거를 정확히 기록한다.

- Important1의 실제 Electron 확인에서 기존 `.brand span { display:none }`이 새 오류 span을 숨기는 것을 추가 재현했다(E2E98/99, 해당 오류 visibility 실패). 제목 표시줄 오류에 명시적 display와 읽기 가능한 최대 너비/줄높이를 적용한다. 해당 회귀는 모의 DB INSERT 실패를 실제 IPC/renderer에 전달하며 닫힌 팝오버에서도 표시되는지 검사한다.

- Task1~Task4: complete locally. verify:app7/7, unit249×3TZ/UI176/native78/E2E99, production build/release26 pass. Windows CI는 main 반영 후 확인한다.
- Final: fixed Important1 — closed-popup UI 및 actual Electron notification-error visibility RED→GREEN; full suite7/7.
- Final: fixed Important2 — force check queues current-generation request RED→GREEN; full suite7/7.
- Ruling: 새 정책을 별도 policy facade로 감싸지 않고 main 전용 NotificationStore를 발신기/공유 service에서 사용했다. 같은 DB transaction 경계를 직접 유지하고 불필요한 계층을 줄였다. 비용은 정책 호출 위치가 여러 main 모듈에 분산된다는 점이며 통합 회귀로 검증한다.
## Windows CI 후속

- `1d499c7`을 main에 commit/push했다. Repository harness 양 OS, Application 양 OS verify:app, Windows 설치본 생성 통과. Application `43806292273` packaged 검사에서 이전 스키마 고정값5 때문에 실제6과 불일치 RED. `packaged.spec.ts`의 기대값을 최종 migration version으로 연결하고 증거는 실제 읽은 version으로 기록한다. 제품 코드는 유지하고 수정 후 전체 Windows 설치 검사를 재실행한다.
- 후속 로컬 검증: typecheck, Playwright packaged 테스트3개 로딩, native78/78 통과. Windows 실제 설치는 새 커밋 CI에서 재검증한다.
