# Planrail LAN sharing implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Deliver the approved single-host LAN project sharing, member-local reminders, manual sync, status and tray/settings UI.
**Architecture:** Main owns local SQLite and a pinned HTTPS service. Members poll a filtered authoritative snapshot, cache it separately, and never write shared source data. A fixed preload capability connects role-aware UI to main; local CRUD remains independent of network failures.
**Tech Stack:** Existing Electron 45.2.1 / Node 24.22.1, React, SQLite, Radix/shadcn; @peculiar/x509 for per-profile certificates if its production bundle passes the transport tests. No runtime OpenSSL executable.
**Spec:** [Approved requirements and review](../../design/lan-project-sharing.md)

## Global Constraints

- Windows x64; no external server, cloud sync, Windows service, autostart, automatic sleep prevention or backup/restore feature.
- Host alone creates/edits/deletes shared data and participants; members edit their personal data and own shared reminders. Non-host participant names are preserved read-only.
- Source IP AND approved installation credential required; first connection compares full host-bound attempt fingerprint on both screens. No global TLS bypass; renderer sandbox/CSP unchanged.
- Dates YYYY-MM-DD, 0001–9999, inclusive ends. Preserve existing local numeric IDs and reminder delivery identities.
- 2-second normal polling, 5-second request timeout, reconnect 2/4/8/16/30 seconds, 7-second freshness bound, 5-second normal LAN propagation target. No count cap inferred from expected 6 PCs/10 projects/60 schedules.
- No automatic host/member switching or host migration. Explicit member disconnect removes cache/local shared alarms/credential after confirmation, preserves personal data.
- Status beside Planrail title; member sync immediately left of Gantt/calendar. Tray: status, separator, About, separator, Open, Exit. Status opens sharing settings for every role.
- Commit on main is already authorized; push only verified coherent work, no PR/force-push. Product implementation is now explicitly authorized. Keep a progress ledger and independent reviews.

## Review Focus

- Delayed network completion after disconnect/timeout cannot repopulate cache or turn green (Tasks 2–3).
- Personal save/drag and shared refresh failure must remain independent; no dirty input loss (Tasks 3–4).
- Pair approval/token delivery failure, revoked credential and address impersonation must never reveal data (Tasks 2–3).
- Same numeric local/remote IDs and host conversion must not misroute notification or reset deduplication (Tasks 1,3–4).
- Restart, resume, revoked target during reminder send and incompatible protocol preserve data and stop stale notifications (Tasks 1–3,5).

## File structure and contracts

Keep focused modules under src/main/sharing (identity, transport, host, client, service, ipc), src/main/db/sharing (schema/store/cache), src/shared/sharing.ts, src/domain/sharing.ts, renderer/state/useSharing.ts and components/SharingSettings.tsx. Tests follow current unit/native/UI/Electron suites.

Local Project/Schedule may gain optional `sharing: 'host' | 'member'` flags; absent means personal. Member display IDs are opaque namespaced strings; local IDs stay decimal. `sharedId(hostId,datasetId,remoteId)` and `parseSharedId(id)` are the ONLY encoding boundary. Extend source-aware sorting without feeding prefixes into BigInt. Network snapshots contain plain remote numeric IDs, projects and schedules WITHOUT reminder fields, credentials or recipient IPs.

`SharingApi` fixed methods: getState(), configureHost({address,port}), setHosting({enabled}), connect({address,port}), confirmHost({pairId,confirmed:true}), approve({pairId,confirmed:true}), saveDevice({id?,name,ip}), revokeDevice({id}), saveProject({id?,name,color,participants:[{name,deviceId}]}), saveReminder({id,reminder}), sync(), disconnect({confirmed:true}), acknowledgeSettings({token}), onChange(callback). All request arguments validated by main. No arbitrary URL/SQL/IPC. `getState` is public DTO only: role, role history restriction, host/bind address and port, hosting preference, connection status/message/lastCheckedAt, pending pair code/expiry, approved devices, local shared project recipient mappings, settings-request token. Secrets never cross preload.

Default configurable port 47831, selected IPv4 bind interface, no auto fallback to all interfaces; address changes preserve expected host trust. Pairing expires in 5 minutes, bounded attempts and request/body sizes with explicit errors, no truncation. Full SHA-256 confirmation fingerprints are displayed (not an invented six-digit protocol). A temporary client proof secret/key is bound to host certificate and the pairing attempt; only that requester can finish token delivery. New pending credentials become usable only when delivery is acknowledged. A fresh attempt invalidates uncompleted credentials safely.

## Task 1: Durable sharing data and domain boundaries

**Files:** create src/shared/sharing.ts, src/domain/sharing.ts, src/main/db/sharing/{schema,store,cache}.ts, tests/native/sharing.case.ts, tests/unit/sharing.test.ts; modify migrations.ts, types.ts, sort.ts, relevant migration assertions.
**Interfaces:** `addSharing(db)` migration 3; `createSharingStore(db)` returning config, device/ACL CRUD, atomic shared-project save/conversion, filtered wire snapshot, member cache apply/read/clear, local reminder update and shared ReminderStore adapter. Export inferred SharingStore type. `sharedId`/`parseSharedId`; `WireSnapshot` and public SharingApi types as above. Keep repository base behavior unchanged; Task 3 installs an access-controlled facade in actual app IPC.
- [ ] Write failing native cases: original conversion preserves IDs and delivery records; bad participant/IP rolls back; filtered snapshot strips personal/reminders/IP; full resync preserves surviving member reminder settings/history; deletion cascades only removed shared targets; dataset mismatch refuses overwrite; duplicate IP/device and role changes rejected. Unit cases cover ID collision, IPv4 normalization and malformed payload rejection.
- [ ] Run `npm run test:unit -- tests/unit/sharing.test.ts` and prepared-DISPLAY `npm run test:native` (RED; missing module assertions may initially be compile failures).
- [ ] Implement strict schema migration and store. HostId/datasetId persist, generated once for new metadata; never replace failed identity. Config distinguishes current role and history. Device records preserve revoked credential hashes. Atomic saveProject uses existing local ID and updates participant display names/access rows together. Cache lives in separate tables; UPSERT surviving keys, delete absent keys and their private alarms only. Shared reminder adapter implements existing ReminderStore interface using text namespaced keys.
- [ ] Run unit/native checks GREEN, `npm run typecheck`; update migration-version tests only for actual new schema. Self-review and commit.

## Task 2: Pinned HTTPS transport and first pairing

**Files:** create src/main/sharing/{identity,transport,host,client}.ts and tests/unit/sharing-network.test.ts; dependencies package.json/lock if required. Pure Node adapters injectable for protected secret persistence; Electron safeStorage binding belongs Task 3.
**Interfaces:** `createHostIdentity(hostId)` produces certificate/private key and stable TLS server name; `discoverHost(address,port)` returns candidate certificate without sending credentials/data; `createSharingHost({identity,store,onChange})` exposes start(address,port), stop(), pending(), approve(pairId), dispose(); `SharingClient` wraps beginPair/confirmPair/poll/close using supplied identity/credential persistence. Types defined/exported locally and consumed Task 3. Store methods from Task 1 are authoritative.
- [ ] Add failing real-loopback HTTPS tests for no data before BOTH approvals, wrong token/IP/cert, full fingerprint mismatch, expired pair, duplicate/failed token delivery, revoked credential explicit reply, private-project exclusion, 304/etag handling, wrong protocol/dataset, timeout/oversized response. Use synthetic test identity and isolated memory/temp adapters only.
- [ ] Run targeted unit test RED; install exact compatible certificate dependency with no external executable assumptions. Implement TLS 1.2+; candidate discovery has no HTTP data and no general agent reuse, normal requests use specific trust anchor/server identity + fingerprint verification. Pair fingerprint binds host cert, request nonce and client proof; issuance requires same proven requester. Limits: 1MiB request, 16MiB snapshot response, 16 pending attempts, expiry 5 minutes, bounded request rate, explicit failure not silent truncation.
- [ ] Every data request authenticates actual socket source IP and active credential; no member write endpoints. Only authenticated revoked-token replies permit purge. Build recipient snapshot+ETag from one coherent store read; no global private activity revision. Exact HTTP error codes are internal but public status remains informative Korean text.
- [ ] Run tests GREEN including real trusted cert and changed-cert rejection; typecheck/production bundle compatibility. Self-review and commit.

## Task 3: Main service, IPC, lifecycle and reminders

**Files:** create src/main/sharing/{service,ipc,secrets}.ts, tests/unit/sharing-service.test.ts, tests/native/sharing-integration.case.ts; modify bootstrap.ts, ipc.ts/ipc-core.ts integration, preload/index.ts, global.d.ts and sharing/reminder types as needed.
**Interfaces:** `createSharingService({storage,profile,changed,clock?,transport?})` supplies public API handlers, combined snapshot/local mutation authorization, state, settings request, suspend/resume/dispose and member reminder snapshot/store. Electron binding protects secrets through safeStorage async APIs. Network service errors do not change local StorageState. Fixed `sharing:command`/`sharing:changed` channels and bounded whitelist.
- [ ] Tests RED for normal poll/manual forced fetch serialization, timeout/backoff/freshness, delayed response after disconnect/credential change/resume, local CRUD while disconnected, no participant mutation from non-host, dirty reminder save after cache delete, same IDs and member-only alarm changes.
- [ ] Implement service with main-owned generation checks before DB commit/status/notifications. Preserve config desired hosting state across orderly shutdown. No network before explicit setup; bind only selected interface, failures visible. Host address edits keep pin. Revocation purges immediately on valid reply. Disconnect removes caches/local shared alarms/credential and keeps minimum host/role history.
- [ ] Integrate repository facade: local snapshots decorated with host sharing flags plus separate member cache; direct local shared IDs rejected by existing write API. Non-host createProject requires empty participants and updateProject must preserve stored participants. Host saveProject validates full ACL before atomic conversion. Personal and network states independent.
- [ ] Run a separate member reminder engine using cached shared schedules and local store. Require fresh authorized sync before each delivery evaluation; keep personal engine independent. Recheck generation/existence before delivery and protect uncertain delivery claims. Resume refreshes before shared alarms. Combine notification state and source-aware click IDs without altering host/local delivery identities. Quit stops all services before DB closes.
- [ ] Run targeted GREEN, native suite, typecheck. Self-review and commit.

## Task 4: Settings, combined views, manual sync and tray

**Files:** create renderer/state/useSharing.ts, components/SharingSettings.tsx (split role/device/project forms if needed), tests/ui/sharing.test.tsx; modify App.tsx, EditorPanel.tsx, ProjectList.tsx, Toolbar.tsx, Titlebar.tsx, Icon.tsx, useTimeline.ts/useEditor.ts, shared sort/preferences, main/tray.ts/bootstrap.ts, styles and tray/UI tests.
**Interfaces:** hook exposes SharingApi state/public methods and independent cached snapshot refresh, no network-derived local error phase. Settings token opens an accessible modal keeping existing drafts. Shared project editor uses saveProject; member schedule detail only calls saveReminder. Snapshot flags/source IDs from Task 1 are consistent across views.
- [ ] Tests RED: non-host participants read-only and preserved; member shared no write/drag but own alarm edit; mixed same IDs; toolbar sync directly left of mode buttons; title status beside Planrail; manual sync success only on applied data; filter affects list/calendar/Gantt range and preserves navigation expansion; settings via tray request keeps dirty personal draft.
- [ ] Build role-appropriate sharing settings using current shadcn controls: first role, LAN address/port, hosting start/stop, participants name/IP common devices, pairing code + approvals, revoke and confirmed disconnect, visible connection errors. Offer host creation/conversion from project editor; no separate new collaboration workflow.
- [ ] Hook background snapshot updates without blocking personal mutations or overwriting dirty input. Shared schedule readonly text refresh independent from alarm draft; new personal schedule selection excludes shared member projects. Pause visual re-layout during personal drag, not revocation/alarms. Existing numeric local IDs/preferences retain behavior.
- [ ] Implement titlebar state icon (green normal/red unavailable); sync icon in toolbar; keyboard explanations and no programmatic ghost tooltip. Tray uses native status icon and menu order status/separator/About/separator/Open/Exit, status opens settings, Open restores, Exit existing guarded full exit. Host status reflects hosting, personal status unconfigured.
- [ ] Run UI/unit/native checks GREEN; update previous tests that assumed participant editing available without a host role to use explicit host setup or assert new readonly contract. Do not weaken unrelated tests. Commit.

## Task 5: End-to-end validation, release and handoff

**Files:** tests/e2e/sharing.spec.ts and test fixtures; docs/implementation/2026-11-10-lan-sharing.md, design/domain/current guide updates, package version/lock (0.6.0), release expectations as required.
- [ ] Add isolated two/three Electron profile tests with loopback distinct source IPs or approved test transport injection only through test bootstrap (no production auth bypass). Pair, share, member read-only, manual refresh, revoke, reconnect, private alarms, restart, and UI locations. Real transport auth stays covered by Task 2 loopback tests.
- [ ] Run `npm run verify:app` with sandbox-capable display, harness verify, scoped source/link checks. Screenshot light/dark settings and title/toolbar; never launch against real profile. Fix meaningful regressions with failing test first.
- [ ] Fresh whole-change review of spec, code and evidence. Fix Critical/Important findings with reproducer tests; record factual limits, no LAN/Windows manual success claims without evidence.
- [ ] Version 0.6.0, document setup/port/firewall and differences from offline test. Preserve offline regression, no firewall disabling. Commit and push main; inspect Windows/Linux GitHub Actions exact SHA. Report final commit, download run, remaining real-company-PC validation.

## Execution rulings

User explicitly asked to implement after completed design and review; no new approval or execution-method question is needed. Use sequential fresh implementers/reviewers under SDD for the large scope. Existing main checkout is clean and direct-main workflow is explicitly authorized by AGENTS.md. Skill helper scripts are not exposed by the cloud skill provider; use equivalent plan brief extraction, review packages and ledger under ignored artifacts/lan-sharing-work instead. No product work is skipped because helper transport is unavailable.
