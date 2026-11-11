# Deep Gray / Steel Blue · 0.6.4

기준 `1125800` clean main. [승인 설계](../design/forest-crystal.md#064-deep-gray--steel-blue)와
[계획](../superpowers/plans/2026-11-11-steel-blue.md)에 따른다.

## 변경과 근거

- 외곽24px 둥근 모서리와 두꺼운 반사 가상 요소를 제거했다. root는 사각형·1px 경계로 전체 창을 채운다.
- 사용자 JSON의58/44/70% 투명도를 배경 alpha로 적용하고 패널 CSS blur를2px로 낮췄다.
  딥 그레이와 스틸 블루 조작부를 기존 재질 파일에 반영했다. 팝오버/확인창은 가독성용 별도 재질을 유지한다.
- Windows Acrylic 선택은 유지한다. 미지원 OS의 불투명 바탕만 녹색에서 중립 회색으로 바꿨다.
- P 아이콘의 여백·반사 디테일을 줄이고 선을 굵게 했다. Windows 창/트레이도 ICO 경로를 받게 수정했다.
  기존 앱 ID·DB·날짜·공유·알림·레이아웃 기능은 바꾸지 않았다. 설치본 버전은0.6.4다.

## 검증 기록

검증 환경: Linux x64, Node24.22.1, Electron45.2.1, Xorg`:95`, 격리 프로필·sandbox 유지.
`artifacts/steel-blue/`에 로그·실제 화면·아이콘 비교를 보존한다.

- RED: root가24px인 실제 Electron 실패와 Windows ICO 연결이 없는 release 검사 실패를 확인했다.
- 화면 관련 E2E7개 통과: 사각형/경계·alpha·블러·파란 버튼·팝오버·막대 합성 대비·두 테마.
- 독립 리뷰에서 새 Windows ICO가 설치본 `files` 목록에 없음을 발견했다. 누락을 재현하는 release 검사를 먼저 실패시킨 뒤
  `resources/icon.ico` 패키징을 추가하고 release4개 통과를 확인했다. 다른 Critical/Important 지적과 Minor 지적은 없다.
- 첫 전체 검증은 기존 `calendar.test.tsx`의 모드 전환/초안 보존 검사1개가5초 제한을 넘어 중단됐다.
  변경된 CSS/main은 해당 JSDOM 동작 경로에 없으며 별도 파일 재실행은7/7 통과했다. 테스트 제한·제품 동작은 수정하지 않았다.
  작업 부하의 영향 가능성은 있지만 원인을 확정하지 않았고 전체 재검증 결과를 별도로 기록한다.
- 두 번째 전체 검증은 Asia/Seoul의 `sharing-network.test.ts` 연속120회 요청을 포함한 검사1개가5초 제한을 넘었다.
  동일 시간대의 해당 파일 재실행은20/20 통과했다. 공유 코드·검사 제한 변경 없이 실패 증거를 보존했다.
- 세 번째 실행도 다른 시간대(America/New_York)의 같은 연속 요청 검사가5초를 넘었다.
  단일 파일에서 재현되지 않아 검증 프로세스의 CPU affinity를1개로 제한해 Vitest 병렬도를 낮췄다.
  실행 명령은 `taskset -c 0 env DISPLAY=:95 npm run verify:app`이며 검사 항목·5초 제한·저장소의 테스트 설정은 그대로다.
- CPU affinity1개 실행은 타입/release/3TZ/UI/빌드/native를 통과했으나 Electron E2E가63개 통과 후 전체240초 예산에 걸렸다.
  CPU 전체 제한을 해제하고 Vitest가 제공하는 `VITEST_MAX_WORKERS=1`만 지정해 검사 병렬도와 앱 CPU를 분리했다.
  최종 명령은 `VITEST_MAX_WORKERS=1 DISPLAY=:95 npm run verify:app`이다. 테스트 수·assertion·제한 시간은 변경하지 않았다. 같은 조건을 기본 검사와 CI에도 적용하도록
  `vitest.config.mts`의 maxWorkers를1로 고정했다. 파일별 격리는 유지하며 UI 설정과 같은 방식이다.
  제품 코드가 아닌 검증 환경 보정이며 최종 실행의 환경변수와 같은 유효 설정이다.
- Vitest 작업자1·Electron 전체 CPU 실행은6단계와 E2E75개를 통과했다. 나머지1개는 이전 다크 글자색
  `#ECF6F1`을 기대하는 기존 검사였으므로 승인된 `#F1F2F3`으로 기대값을 갱신하고 해당 회귀 통과를 확인했다.
- 기본 명령 재실행은6단계와 E2E75개를 통과했으나 기존 토스트 검사에서2초 타이머가3초 wall-clock 대기 안에 처리되지 않았다.
  제품 타이머는 그대로 두고 테스트만 Playwright clock으로1999ms 표시/2000ms 비표시를 검사하도록 변경했다.
  시계를 정지한 채 검사하므로 더 긴 제품 타이머를 재시도 대기로 통과시키지 않는다. 해당 검사 통과를 확인했다.
- 다음 실행은6단계·E2E75개가 통과했고 트레이 숨김 클릭의CDP 완료 응답 대기만30초에 걸렸다.
  실제 숨김을 main에서 먼저 확인하고 복원한 뒤 실제 클릭의 완료도 확인하는 순서로 테스트를 보정했다.
  클릭 실패를 무시하지 않으며 제품 닫기 코드는 변경하지 않았다. 동일 검사 연속3회 통과를 확인했다.
- 최종 `DISPLAY=:95 npm run verify:app`: 2026-11-11 01:16:37~01:21:05 UTC, HEAD `1125800` + 이번 변경(dirty),7단계 모두 통과.
  release15, unit112×3TZ, UI116, native41, Electron E2E76개가 통과했다. 추가 환경변수·CPU affinity 제한 없이 실행했다.
- 최종 하네스 verify7/7, `git diff --check` 통과. clean checkout의 CI 결과는 종료 메시지의 최종 SHA와 Actions 링크를 따른다.

Windows Acrylic 실제 바탕화면 합성·OS 모서리 처리·150% 배율 작업 표시줄/트레이와 회사 PC 성능은 미검증이다.
Linux 실제 앱 화면과 body에 배경을 넣은 `synthetic-dark.png`는 구분하며 후자는 Windows 실기 증거가 아니다.
