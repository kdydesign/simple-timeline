# LAN App Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Approved members update from the LAN host with one UPDATE click, preserving data and dirty input.
**Architecture:** Main owns immutable ZIP imports/catalog, authenticated streaming and update state. Verified member files enter electron-updater through a temporary capability-protected loopback feed. Safe shutdown precedes NSIS handoff.
**Tech Stack:** Existing Electron45.2.1, React, TypeScript, SQLite, builder26.18.0; reviewed electron-updater6.8.11 plus bounded streaming ZIP/YAML libraries.
**Spec:** [Approved design](../../design/lan-app-updates.md).

## Global Constraints

- Q1–Q20 and the complete design were approved; implementation is explicitly requested. Continue without another scope approval.
- Windows11 x64, unsigned private CI, current-user NSIS, no elevation, stable appId/profile/install path.
- All approved devices independent of project ACL. Same stable version/source as host; newer than member. Reject validationUpdateOnly fixtures in production.
- Full downloads only; connection/reconnection and5min check; no startup blocking; click starts download.
- No renderer filesystem/network/credential authority. Preserve TLS SAN/pin/IP/credential checks and existing sync limits.
- Dirty deferral and restart require explicit install; clean initial download may install automatically. Never install on ordinary Exit; never force-kill the app.
- Withdrawal/replacement/revocation invalidates pending work upon observation. Verified offline install remains permitted only for ordinary network failure with unchanged local trust.
- Host keeps current plus candidate; member verified waits persist; successful healthy target startup cleans installer cache.
- Tests use temporary profiles only. Verify:app runs serially. No installer execution on this Linux development machine.

## Review Focus

- Authenticated status races with withdrawal/credential replacement: stale completion cannot install.
- ZIP path aliases, expansion limits and manifest mismatch: reject before atomic publication.
- Dirty forms beyond the primary editor, concurrent saving and failed teardown: never discard or spawn installer early.
- Ordinary Exit, restart after failed install, and no relaunch: no surprise installation or false success.
- Old member/new host protocol and long downloads: updater remains reachable without weakening sync limits.

## Task 1: Immutable bundles and release production

**Files:** `src/shared/updates.ts`, `src/main/updates/bundle.ts`, `src/main/updates/catalog.ts`, `scripts/release/update-bundle.mjs`, `scripts/release/build-windows.mjs`, `electron-builder.yml`, `.github/workflows/app.yml`, package manifests, `tests/unit/update-bundle.test.ts`, `tests/release/update-bundle.test.mjs`.
**Interfaces:** Export typed `UpdateManifest`, `UpdatePublication`, `UpdateState`, `UpdateApi`; catalog main-only import/publish/withdraw/status/read-file APIs. Atomic catalog stores revision, current/candidate, immutable version fingerprints. Later tasks consume these exported types; no paths or tokens in UpdateState.

- [ ] Write failing tests: valid ZIP imports; traversal/duplicate basename, forged hash/length, oversized expansion, fixture and same-version changed bytes reject; failed import preserves active release; published version/source must match host.
- [ ] Run `npm run test:unit -- tests/unit/update-bundle.test.ts`; record expected missing-function/behavior failure.
- [ ] Implement bounded streaming ZIP import and JSON-schema YAML parsing, atomic catalog with stream leases and cleanup; precise limits: ZIP/installer1GiB, total expansion2GiB, max16 entries, metadata1MiB. Disk errors fail closed. Use same root/version contract from design.
- [ ] Extend CI production artifact to include one update ZIP with latest.yml, EXE, blockmap, manifest and checksums. Retain --publish never with inert generic provider. Include schema/appId/arch/per-user/sourceSha and every required hash. Do not allow synthetic fixture in normal importer.
- [ ] Run focused tests then unit/release suites and typecheck. Commit task-specific files only; report public APIs and evidence for Task2.

## Task 2: Authenticated update service and safe installer

**Files:** `src/main/updates/{transport,service,feed,installer,ipc}.ts`, `src/main/sharing/{host,service}.ts`, `src/main/bootstrap.ts`, `src/main/ipc-core.ts`, `scripts/release/installer.nsh`, `src/preload/index.ts`, `src/shared/updates.ts`, `tests/unit/update-{transport,service,installer}.test.ts`.
**Interfaces:** Consume Task1 types/catalog. Expose `createUpdateService` with state/subscription, host import/publish/withdraw, member check/download/cancel/retry/install, sharing trust lifecycle and disposal. IPC is named `updates:command`/`updates:changed`; preload `window.timelineUpdates: UpdateApi` is optional for existing test fixtures.

- [ ] Write failing behavior tests: valid pinned TLS request and >5sec stream; wrong pin/IP/token rejection; replacement/revocation invalidates in-flight attempt; offline trusted ready install; dirty/restarted ready never auto-installs; ordinary Exit never installs.
- [ ] Run focused tests and observe failures.
- [ ] Implement stable authenticated /v1/updates routes with metadata1MiB, handshake/headers5sec, stream idle30sec and total30min, max1 stream per device/max5 total. Reject redirects; stream hashes and bounded writes; mutation generations fence races. Existing JSON/sync deadlines stay unchanged.
- [ ] Wire current sharing credentials in main only. Keep update polling independent of snapshot compatibility, fire on successful connection and every300000ms; only one attempt; explicit failures/retry; staged state atomic persistence and stale-part cleanup.
- [ ] Implement ephemeral127.0.0.1 feed with256-bit capability, exact GET/HEAD route whitelist, no hostile Origin, bounded lifetime, no renderer URLs. Use electron-updater6.8.11 with approved options; validate cache bytes before install.
- [ ] Install coordinator obtains clean/frozen renderer acknowledgment and awaits all mutations/services/DB closure before handing off. Add non-killing NSIS gate with bounded wait/abort for current installation. Persist attempt outside installation and confirm actual version plus healthy storage/UI on next startup. Fail teardown closed; preserve current installation path.
- [ ] Add role-checked, sender-checked IPC and preload interface; global mutation guard during final install. Handle cancel/Exit/destruction and all error paths without hiding failure.
- [ ] Run focused tests, unit suite and typecheck. Commit task-specific files; report integration APIs for Task3.

## Task 3: Titlebar/host UI and end-to-end integration

**Files:** `src/renderer/components/{Titlebar,SharingSettings,UpdatePopover,UpdateDistribution}.tsx`, renderer update hook/styles/types and App wiring, UI/E2E tests, release version, `docs/implementation/2026-11-11-lan-app-updates.md`, existing user guide/policy/index/STATUS.
**Interfaces:** Consume Task2 UpdateApi/UpdateState; renderer registers dirty/frozen state for every editable popup and confirms ready through constrained IPC. Existing component callers without updater are compatible.

- [ ] Write failing UI tests: UPDATE only on available member release; offline disabled vs verified ready; click starts once; popover close leaves download running; cancel/retry explicit; dirty deferral and saved draft require Install and Restart; host ZIP import separate Publish; withdrawn pending hides/changes correctly.
- [ ] Run `npm run test:ui -- tests/ui/updates.test.tsx` and observe failures.
- [ ] Implement small rounded bordered UPDATE beside Planrail before connection icon, no-drag and keyboard operable; progress anchored popover with version/bytes/verification/error; host section in existing Sharing Settings. Retain existing dark design, other controls and workflows.
- [ ] Add isolated Electron integration coverage exercising actual IPC/UI and main service with controlled installer adapter, two-profile TLS and failed-install restart. Never execute installers in ordinary test suite. Extend disposable Windows packaged verification for real update-safe exit, relaunch and data retention.
- [ ] Bump feature to0.8.0 consistently, update documentation/acceptance instructions, explain first bootstrap manual install and Windows unverified boundaries.
- [ ] Run `xvfb-run -a npm run verify:app` then `node scripts/harness/run.mjs verify`; inspect complete evidence. Fix regressions with reproductions, never weaken assertions/deadlines.
- [ ] Obtain independent whole-change review, resolve material findings, verify changed paths, commit and push main under standing authorization. Report CI state separately from actual Windows11 acceptance.

## Preflight and execution

Task1 types/catalog feed Task2; Task2 API feeds Task3. Execute sequentially with fresh implementer/reviewer per task. Exact function members may be refined as code is read, but report exported signatures before downstream work. Full approved design governs over this plan. Standing main authorization permits this clean shared checkout; no destructive checkout/reset.
