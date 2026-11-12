# Planrail 0.8.1 action glass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development for the installer/startup integration task; approved styling is already implemented inline.

**Goal:** 승인 시안의 붉은 유리 삭제 버튼, UPDATE 스타일, Windows 자동 실행과 수동 설치 종료 처리를0.8.1에 적용한다.
**Architecture:** renderer 스타일은 요청한 버튼으로 제한한다. 사용자별 자동 실행과 수동 설치 종료는 main/NSIS에서 관리하며 기존 앱 내 UPDATE의 입력 보호를 유지한다.
**Tech Stack:** 기존 React, CSS, Electron, Playwright.
**Spec:** 아래 스타일 승인 범위와 [자동 실행·설치 종료 확정 설계](../../design/windows-login-startup.md). 2026-11-12 전체 구현 승인.

## 승인 범위와 접근

편집 패널 삭제는 저장과 같은 크기·얕은 반사·얇은 보더, 붉은 반투명 바탕으로 변경한다. 프로젝트 목록과 공유 참여자의 휴지통에도 같은 색을 적용한다. 기존 강한 단색 및 파란 selected-sheen 혼합 대신 전용 붉은 반사를 사용한다. 다른 위험 안내·버튼으로 전역 확장하지 않는다.

UPDATE: border `1px solid #f92d2de0`, radius `5px`, padding `0px 6px`, font `9px/18px`, weight `700`, letter-spacing `.06em`, color `#d8e9f5`, background `#c42c2c6b`; enabled hover background `#cf2c2c8c`.

## Global Constraints

- 버전 0.8.1. appId·프로필·DB·기존 앱 내 UPDATE 정책 유지. 사용자별 자동 실행 및 설계에 명시한 수동 설치 종료 예외만 추가.
- 기존 버튼 크기·배치·삭제 확인·disabled·키보드 focus 유지. 임시 UPDATE 강제 노출은 제품에 넣지 않는다.
- 스킬의 일반 재승인 절차보다 사용자의 즉시 구현 승인과 저장소 main 커밋·push 지시를 우선한다.

## Review Focus

- 기존 `:root[data-theme="dark"]` 삭제 규칙보다 새 스타일이 실제 우선하는지 확인.
- 저장 버튼의 파란 sheen이 삭제에 섞이지 않는지 확인.
- disabled와 hover를 분리하고 기존 포커스 표시 유지.
- 목록 추가·승인 취소 등 다른 버튼 스타일 유지.
- 제품·lock 버전 일치, 기존 updater fixture는 그대로 유지.

### Task 1: 승인 스타일과 릴리스 반영

**Files:** `src/renderer/forest-crystal.css`, `src/renderer/components/ProjectList.tsx`, `package.json`, `package-lock.json`, `tests/release/installer.test.mjs`; 구현 기록 및 STATUS.
**Interfaces:** 기존 `.danger`, `.editor-actions`, `.project-list-row`, `.sharing-device-actions`, `.update-trigger`만 사용한다.

- [x] 실제 CSS 우선순위와 현재 화면 확인.
- [x] 범위가 제한된 공통 삭제 재질·enabled hover와 UPDATE 정확한 값 반영.
- [x] 버전과 기존 release 기대값을 0.8.1로 변경. 의존성 변경 없음.
- [x] 별도 임시 프로필 화면과 computed style로 기본·hover·disabled 확인. 단순 CSS 값을 반복하는 새 테스트는 추가하지 않는다.
- [x] `xvfb-run -a npm run verify:app`, `node scripts/harness/run.mjs verify`, `git diff --check` 통과 확인. 실제 Windows는 CI와 사용자 환경을 구분.
- [x] 독립 변경 검토, 결과 문서화, main 커밋·push.

### Task 2: Windows 자동 실행과 설치 종료 통합

**Files:** `src/main/bootstrap.ts`, `src/main/window.ts`, `src/main/tray.ts`, 새 main 자동 실행·설치 종료 helper, `scripts/release/installer.nsh`, 필요한 Windows helper 및 packaging 포함 설정, unit/Electron/release/Windows packaged 검사.
**Interfaces:** 기존 현재 사용자 설치·단일 인스턴스·트레이·`appMutationBarrier`·종료 정리 경로. 등록 이름 `Planrail`, 자동 실행 인자 `--planrail-autostart`, 수동 설치 종료 인자 `--planrail-install-exit`와 별도 정확한 대상 EXE 경로 인자. main만 처리하며 renderer의 범용 명령 실행 API는 추가하지 않는다.

- [x] 먼저 unit에서 로그인 등록 상태(미설정/ON/OFF/Windows 사용 중지), 실패 보고, 요청 경로 일치·cold helper 종료·다른 경로 거부 및 저장 배리어를 재현한다.
- [x] 현재 사용자 Run 등록을 설치본과 앱이 공유한다. 설치 첫 선택은 기본 체크, 기존 명시 OFF와 OS 사용 중지는 보존. 트레이에서 명시적으로 켰을 때만 재활성화. dev는 등록 금지. 사용자가 설정한 OFF도 재설치가 구분할 수 있도록 공통 선택 기록을 남긴다.
- [x] NSIS 디렉터리 다음 옵션 페이지 추가. 즉시 실행과 분리. silent/updated는 기존 상태 보존, 미등록은 켜지 않음. 실제 제거만 등록 정리, 업데이트 중 제거는 보존.
- [x] 자동 실행 인자일 때 최초 show 억제. 트레이 생성·DB 실패 및 renderer 시작 오류는 창 표시. Open/바로가기/두 번째 직접 실행은 표시; 중복 자동 실행은 기존 창을 강제로 열지 않는다.
- [x] 트레이 메뉴는 연결 상태 / 구분선 / About / 자동 실행 체크 / 구분선 / Open / Exit. 메뉴를 열 때 OS 상태를 재확인하고 설정 실패는 오류·실제 상태로 반영.
- [x] 지원 버전 수동 설치는 같은 설치 경로 앱에 정상 종료 요청. 요청용 실행이 단일 인스턴스 락을 새로 얻으면 DB·창을 열지 않고 종료. 초기화 중 요청도 유실하지 않는다. 새 입력·변경을 차단하고 수락된 저장·서비스·DB 정리 뒤 완전 종료; 미저장 초안은 확인 없이 폐기. 안전한 종료 실패 시 파일 교체 중단, 강제 종료 fallback 없음.
- [x] 대화형 수동 설치에서만 기존0.8.0 강제 종료 허용. 실행 파일명 일괄 종료 금지. 정확한 정규 경로·현재 사용자 SID·실행 버전·프로세스 신원을 검증하고 동일 핸들/생성 시각으로 PID 재사용을 막는다. 다른 경로·다른 사용자·알 수 없는 버전·silent/updated는 강제 종료 금지. 종료와 잔류 프로세스 확인 실패 시 설치 중단.
- [ ] 실제 Windows의 helper와 NSIS lifecycle 검증: 현재 사용자 설정/업데이트 보존/제거,0.8.0 실행 중 수동 설치,0.8.1+ 정상 종료, 데이터 보존. 시험은 일회성 CI 프로필만 사용. synthetic 테스트 버전 우회는 기존 test-only harness에 한정.
- [x] focused TDD·typecheck·관련 native/E2E 실행 후 상세 보고서 작성. root가 통합 `verify:app`·harness·검토·배포를 마무리.
