# 공유 변경 Windows 알림 Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans. 단계별 TDD·검토를 수행한다. 사용자는 승인 설계의 구현을 명시적으로 요청했으며 추가 계획 승인으로 멈추지 않는다.

**Goal:** 호스트의 공유 자료 변경을 권한 있는 멤버의 Windows 알림으로 전달한다.
**Architecture:** 같은 SQLite 트랜잭션의 변경 기록, 기존2초 polling의 새 endpoint, 원자적 멤버 inbox와 별도 OS 전송 이력. 기존 v1 snapshot·날짜 알림 유지.
**Tech Stack:** 기존 Electron45·React19·better-sqlite3·TypeScript. 신규 외부 서비스/의존성 없음.
**Spec:** [승인 설계](../../design/shared-change-notifications.md), Q1~Q13.

## Global Constraints

- 공유 자료는 호스트만 변경. 개인/다른 수신자의 기록·이름·횟수 노출 금지.
- 최근30일 기록. 기본 ON, OFF→ON 기준점 재설정. 최초 요약·재접속 프로젝트별 요약·공유 종료 공통 안내.
- 캐시/순번/inbox 원자성, claim-before-send·unknown 자동 재시도 금지. 날짜 알림과 독립.
- 기존2초 동기화, 응답/요청 제한·sandbox·고정 IPC 유지. 기존 v1 snapshot 호환.
- 실제 Windows 알림은 Linux 자동 검사와 별도 미검증 항목으로 기록.
- main 작업·검증 후 직접 push는 AGENTS.md와 상시 승인에 따른다. 앱 테스트를 동시에 실행하지 않는다.

## Review Focus

1. 중첩 저장에서 참여자 목록을 지웠다 다시 만드는 중간 상태를 공유 회수로 기록하지 않음(Task1).
2. 같은 dataset의 재승인/재공유에서 과거 권한 세대 기록을 새 권한으로 노출하지 않음(Task1·2).
3. 수신 commit 후 OS claim 전 연결 끊김·재실행에서도 대기 변경 누락/중복 방지(Task1·2).
4. 정상 지원 확인 후 손상 응답을 구버전으로 간주하여 조용히 누락하지 않음(Task2).
5. 알림 클릭과 미저장 입력·숨겨진 필터·원격 삭제 경합에서 초안/권한 보호(Task3).

## Task 1: 변경 기록·요약·멤버 inbox

Files: create `src/shared/change-notifications.ts`, `src/domain/change-notifications.ts`, `src/main/db/sharing/changes.ts`, `src/main/db/sharing/change-inbox.ts`, `src/main/db/sharing/change-schema.ts`; modify `src/main/db/migrations.ts`, `src/main/db/repository.ts`, `src/main/db/sharing/store.ts`, lifecycle schema checking as needed; test `tests/native/change-notifications.case.ts` (자동 발견), `tests/unit/change-notifications.test.ts`.

Interfaces:
- `ChangeTarget`: `{kind:'schedule';id:string;projectId:string}|{kind:'project';id:string}|{kind:'list'}`. Wire IDs are remote; inbox converts to existing shared IDs.
- `ChangeNotice`: `{id:string;projectId:string|null;title:string;body:string;target:ChangeTarget}`.
- `ChangeEnvelope`: `{version:1;snapshot:WireSnapshot;cursor:string;mode:'initial'|'delta'|'reset';notices:ChangeNotice[]}`; strict domain validator validates snapshot membership/notice limits/targets.
- Host `SharingStore.getChangeSnapshot(deviceId:string,cursor:string|null,reconnecting:boolean):ChangeEnvelope`. Current ACL + event recipient/grant generation filtering, consistent DB read. Cursor must be recipient/installation bound, not global sequence leak.
- `createChangeInbox(db)` returns `settings():{enabled:boolean;baselining:boolean}`, `setEnabled(enabled:boolean)`, `cursor():string|null`, `apply(envelope:ChangeEnvelope):void` (cache+cursor+notices atomic), `revoke():void` (cache purge+one generic notice), `reset():void` (host state cleared, preference kept), `recover():void`, `pending():ChangeNotice[]`, `claim(id:string,retry?:boolean):boolean`, `finish(id:string,state:'submitted'|'failed'|'unknown'):void`, `issues():{failed:number;unknown:number}`, `retry():void`. Pending windows retain earliest unclaimed baseline for authorized reaggregation; failed/unknown/submitted are never implicitly retried.
- Implementer may refine signatures when needed by spec; record exact exported interface in report before integration.

- [x] Write behavior tests before code: initial N/zero, no-op/color/reminder excluded, repeated edits/reversion/add-delete, conversion/recipient addition/removal, rollback, revoked/regrant privacy, retention gap, cache/inbox rollback, off/on offline baseline, restart/claim/unknown/deleted source.
- [x] Run RED then implement schema v5 with original preservation, transaction wrapper on all relevant mutation paths. Compare committed business fields, not updated_at. Nesting guard prevents internal repository operations logging temporary ACL changes. Historical v1-v4 migration tests remain possible.
- [x] Run unit and native tests sequentially with isolated profiles. Expected PASS. Test fixture version assertions update only where target schema intentionally advances.
- [x] Review Task1 and record actual interfaces/verification in ledger before Task2.

## Task 2: TLS 동기화·전달 엔진·main 통합

Files: create `src/main/sharing/change-delivery.ts`; modify host.ts/client.ts/service.ts/sync.ts/bootstrap.ts; tests unit sharing-network/sync and delivery; native service tests.

Interfaces: consume Task1 envelope/inbox. Add optional poll `{cursor?:string|null;reconnecting?:boolean}` and returned snapshot `changes?:ChangeEnvelope;changesSupported?:boolean`. Service state exposes `changeNotifications:{enabled,baselining,supported:boolean|null,failed,unknown,storageError,openRequest:{token:string;target:ChangeTarget}|null}`. Main service options accept existing `ReminderSender` as `changeSender`, `onChangeClick?:()=>void`. Expose `setChangeNotifications({enabled})`, `retryChangeNotifications()`, `acknowledgeChange({token})`.

- [x] RED tests for new endpoint authenticated recipient only, old-host404 fallback, no fallback on malformed supported response, same ETag/event difference, late-response epoch, fail-before-cache commit, repeated polling/restart dedupe, OS unknown/failure/retry/revocation.
- [x] New `POST /v1/changes/sync` with `{cursor,reconnecting}` retains protocol1 header and existing v1 snapshot. Client probes it and falls back only explicit404 before support established. Existing old client still uses snapshot. Bind requests to authenticated device; identity validation remains strict.
- [x] Share sync serialization/deadline/backoff; apply full envelope atomically. Feed current/reconnecting context from controller. Revoked endpoint outcomes purge and enqueue generic notice, ordinary network failures never do.
- [x] Delivery engine processes one committed notice at a time, rechecks enabled/epoch/current access and freshness; claim before sender; recover unknown; explicit definite-failure retry only. Dispose/fence before DB close. Click checks current IDs/access and forwards typed target, showing window.
- [x] Existing date reminder sender path unchanged; test injectable change sender distinct from date sender. Expected all targeted unit/native tests PASS.
- [x] Review and ledger actual interfaces before Task3.

## Task 3: 수신 스위치·오류 안내·알림 클릭

Files: modify `src/shared/sharing.ts`, `src/main/sharing/ipc-core.ts`, `src/preload/index.ts`, `src/renderer/components/SharingSettings.tsx`, `src/renderer/App.tsx`, state hook as needed; tests UI and fixed-bridge native/E2E allowlists.

- [x] RED member-only switch default ON, disabled during save, failed save preserves value, baseline/unsupported messages, no date reminder side effect; typed click schedule/project/list preserving dirty input, mode and current access.
- [x] Add only fixed methods defined in Task2 with strict shapes and role guards. No raw invoke/DB/network in renderer. Member sharing settings switch uses existing small Switch.
- [x] Persistent change-delivery failure/unknown/storage notice and explicit retry separate from date alarm ‘today’ retry. Use sharing state event for typed open request; read latest snapshot before navigation and use existing request/confirmation path. Project targets open visible project via list/scroll without entering forbidden editor; deleted targets fall back current list.
- [x] Expected UI/security tests PASS; inspect real Electron settings and click navigation.
- [x] Review and ledger before Task4.

## Task 4: 회귀·릴리스·문서

Files: extend `tests/e2e/sharing.spec.ts` or new dedicated change-notifications spec/isolated fixtures; update package version to0.7.0, lock root version, release version and packaged schema expectations; docs existing storage/architecture/guide/STATUS and implementation evidence.

- [x] Two actual TLS profiles test initial summary, host schedule/date/name changes+batch, recipient restriction, preference off/on, restart, revoke and click using injectable OS sender. Preserve existing polling/timing/permissions assertions.
- [x] Run `npm run verify:app`, `node scripts/harness/run.mjs verify`, `git diff --check` sequentially; Expected all PASS. Record SHA+dirty+environment/time/scope and real screenshots.
- [x] Independent final review against approved spec; fix significant findings with RED→GREEN tests. Record any remaining limitations honestly.
- 최종 반영 절차: 요청 범위만 main에 커밋·일반 push한 뒤 원격 SHA와 CI 상태를 종료 메시지에 기록한다. PR을 만들지 않으며 실기 없이 Windows 실제 알림 성공을 주장하지 않는다.
