# Startup Delay Diagnosis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox syntax for tracking.

**Goal:** 사용자 PC의 반복되는 검은 화면 지연을 파일 로딩·DOM·렌더링 단계로 분리한다. 원인 확인 전 성능 개선 완료로 표시하지 않는다.
**Architecture:** 기존 main 전용 startup recorder와 고정 renderer probe를 확장한다. Electron lifecycle 및 Performance API의 숫자만 기록하며 DB·preload API는 유지한다.
**Tech Stack:** 기존 Electron / TypeScript / Playwright, 의존성 추가 없음.
**Spec:** [후속 설계의 시작 성능 목표](../../design/post-mvp-improvements.md), 사용자 제공 0.2.0 실행 기록(일반 UI-ready 16,739ms, --disable-gpu 19,506ms).

## Global Constraints

- sandbox/contextIsolation 유지, 원본 DB 보존, 새 preload 권한 금지.
- GPU 비활성의 개선 근거가 없으므로 기본 렌더링 정책을 변경하지 않는다.
- 시간 기준을 명시하고 창 show 요청·브라우저 paint·사용자 실제 관측을 구분한다.
- 경로·일정 내용·임의 URL·오류 메시지는 진단 파일에 기록하지 않는다.

## Review Focus

- 로딩·renderer 실패 때도 마지막 도달 단계가 남아야 한다.
- 쓰기 실패·창 종료는 앱 실행 및 저장을 막지 않아야 한다.
- blocked 저장소는 ui-ready로 기록하지 않는다.
- 늦게 끝난 초기 파일 쓰기가 최신 진단을 덮어쓰지 않아야 한다.
- 진단용 렌더링 대기가 실제 앱 표시를 지연시키면 안 된다.

## Task 1: 로딩 단계 진단

**Files:** `src/main/startup.ts`, `src/main/window.ts`, `src/main/bootstrap.ts`, `tests/e2e/improvements.spec.ts`, `tests/e2e/startup-diagnostics.spec.ts`, 기존 구현 기록·사용 안내.
**Interfaces:** createWindow의 선택적 stage callback은 생성·load 요청·DOM 준비·첫 paint 준비를 전달한다. recorder는 기존 mark에 더해 renderer Performance 숫자/고정 resource 종류를 기록한다. UI-ready는 기존 의미를 보존한다.

- [x] E2E에서 세부 단계·navigation/resource/paint 숫자와 민감 정보 부재를 검사하고 기존 구현에서 실패를 확인한다.
- [x] main에 lifecycle·숫자만 추출하는 고정 probe·실패 코드 기록을 추가한다. load 실패 회귀도 실행한다.
- [x] 기존 전체 verify:app 및 harness verify, 독립 리뷰 후 보정한다.
- [x] 사용자 제공 일반/GPU-off 증거와 미확정 원인을 기존 구현 기록에 남긴다. 0.2.1 진단 빌드로 main commit/push 후 Windows CI를 확인한다.

실행 보정: Electron 45.2.1의 file:// Resource Timing 목록은 실제 실행에서 비어 있었다. main webRequest의 초기 파일 요청 종류·시간만 기록하고 관찰 완료/종료/60초 후 해제한다. src/renderer/main.tsx의 고정 module mark로 스크립트 다운로드와 평가 이후를 구분한다.
