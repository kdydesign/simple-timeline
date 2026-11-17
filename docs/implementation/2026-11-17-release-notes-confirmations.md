# 0.8.5 릴리즈노트·확인창·도움말 진단

2026-11-17. 기준 `6fad3ca74a5f37452e0e276ba0c65a25b4d67fa1` + 이번 변경. [Q1~Q8 승인 설계](../design/release-notes-and-confirmations.md)와 [구현 계획/판단 기록](../superpowers/plans/2026-11-17-release-notes-confirmations.md)을 따른다. MVP 완료 지도는 유지한다.

## 구현

- 제목 표시줄의 릴리즈노트·도움말과 창 제어 사이 구분선, root border0. 패널 외곽선은 유지한다.
- `shared/release-content.ts`가0.8.0~0.8.5 Feat/Fix/Perf/Docs의 단일 원천이다. 릴리즈노트는 최초 클릭 때만 생성하고 독립 partition/preload/IPC로 읽기·창 제어만 허용한다. X는 숨김/재사용, 트레이로 함께 숨긴 창만 함께 복원한다. 마지막 버전·스크롤은 실행 중 기억한다.
- 일정 생성/수정·드래그·자기 알림과 프로젝트 목록 삭제는 검증 후 확인하고 저장한다. 취소는 입력 유지, 드래그는 원본 유지. 삭제 확인을 중첩하지 않는다. 확인 수락은 일회 처리하며 대상/현재 저장 가능 상태를 다시 확인한다. 미저장 초안 폐기는0.8.4의 확인 없는 동작을 유지한다.
- 설치된 Windows 앱의 taskbar app details에 기존 AppID·실제 EXE의 아이콘 인덱스0·공백 경로를 따옴표로 감싼 재실행 명령·Planrail 이름을 지정한다. dev/Linux에는 적용하지 않는다. 사용자 고정 항목·OS 캐시는 변경하지 않는다. Windows 검사는 새 바로가기의 target/IconLocation을 수집한다.
- 도움말 schema2는 기존20개 열기 기록과 main stages를 유지하고 최대40개 파일 요청·preload 구간·navigation·모듈 실행 시각을 추가한다. 숫자/유형만 허용하며 URL·파일명·검색어·일정 내용은 제외한다. 별도 도움말 session 관찰은 해당 webContents에만 적용하고 종료/완료/60초 제한에 해제한다. 실패한 진단 저장이 화면 로딩을 막지 않는다.

## 성능 해석과 남은 실기

사전 준비는 기존 주 화면 준비+1초를 유지한다. 릴리즈노트 사전 준비나 빈 창 선표시는 추가하지 않았다. **13초 지연 해결은 이번 작업의 완료 주장에 포함하지 않는다.** 회사 PC에서 새 버전의 `help-latest.json`과 `startup-latest.json`을 비교해야 한다. main/preload/navigation의 timeOrigin과 clock을 함께 읽고 다른 원점의 숫자를 그대로 빼지 않는다. preload 시작은 모듈 평가 시점이며 Electron이 preload를 읽기 전 구간은 포함하지 않는다. 지원되지 않은 navigation 항목은 누락으로 남긴다.

Windows 작업표시줄의 기존 고정 항목·실제 아이콘 캐시 표시, 회사 보안 프로그램 환경의 첫 열기 성능은 자동 CI와 별도 인수 항목이다.

## 검증 기록

로컬 전체 검사와 독립 검토 완료. 원격 CI는 이 변경의 최종 커밋에 연결된 Actions 결과와 종료 보고에서 확인한다. 최초 Electron 검사는 종료된 Xvfb의 남은 :98 소켓으로 시작에 실패했다. 살아 있는 :90 화면에서 sandbox를 유지해 다시 실행한다. 이를 제품 실패/성능 측정으로 해석하지 않는다.

## 독립 검토

새 문맥 gpt-6-astra/high가 전체 변경을 읽기 전용으로 검토했다. Critical0 / Important0 / Minor1. Minor는 목록 삭제 확인을 취소할 때 목록이 닫혀 원래 휴지통의 포커스를 복원하지 못하는 부분이다. 데이터 삭제 취소는 정상이며 키보드 사용자는 다시 Tab 탐색이 필요하다. 후속 접근성 보정으로 남긴다. 실제 회사 Windows 성능·고정 아이콘 표시와 최종 CI 결과는 검토 판정과 분리한다.

첫 전체 검사는 출시 버전 기대값0.8.4가 남아 실패해0.8.5로 맞췄다. 다음 실행은 UI195/196, 기존 공유 필터 다단계 시나리오가5.138초로5초 제한을 초과했다. 단독 재현은 같은 기대 동작을1.9초에 통과했다. 해당 기능 통합 검사 한 건만10초로 바꾸고 전체를 다시 실행한다. 실제 멈춤 감지는 이 한 건에서5초 늘며, 제품 성능 목표나 단언을 약화하지 않는다.

다음 전체 실행은 UI196개·native78개까지 통과했으며 Electron98/102개 통과였다. 일정 저장 장애 주입3건에 새 확인창 수락 단계가 누락됐고 기존 외형1건이 제거된 root border1px를 기대했다. 장애 메시지·초안 보존·중복 방지 단언을 유지한 채 수락 동작을 추가하고 외곽선 기대값을0px로 보정했다. 제품 코드는 이 보정에서 바꾸지 않았다.

## 최종 로컬 검증

- `DISPLAY=:90 CHROME_DEVEL_SANDBOX=/usr/lib/chromium/chrome-sandbox npm run verify:app`: 전체7단계 통과. 출시26개, 시간대3개 각각 단위273개, UI196개, native78개, Electron E2E102개. 타입·제품 빌드 통과.
- 실행 기준: `6fad3ca74a5f37452e0e276ba0c65a25b4d67fa1` + 변경, dirty=true, Linux x64/Node v24.22.1. 시작 2026-11-17T00:27:17.502Z, 종료 2026-11-17T00:35:03.999Z. `artifacts/app/latest.json`에 단계별 결과를 기록했다.
- `node scripts/harness/run.mjs verify`:7검사 통과. 변경 Markdown 상대 링크214개 누락0, `git diff --check` 통과.
- 실제 격리 Electron에서 제목 구분선/root border0·달력 날짜 변경 확인창·릴리즈노트 화면을 시각 확인했다. 12개 도움말 이미지를 현재 기능으로 재촬영했다. 보정 후 저장 실패/외형12개 별도 검사도 통과했다.
- Windows NSIS 설치·업데이트·바로가기 검사는 로컬 Linux에서 실행하지 않는다. push 후 Application의 Windows job과 Repository harness를 확인하며 성공 여부는 최종 SHA의 CI를 기준으로 한다. 회사 PC의13초 지연과 기존 고정 아이콘 표시는 별도 실기 항목으로 남는다.
