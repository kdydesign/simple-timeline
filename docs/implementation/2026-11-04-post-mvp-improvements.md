# MVP 후속 개선 구현 기록

날짜: 2026-11-04. 기준 main: `8dc5ca7b17051b5d4f5052a1ab972f649ace180b`.
[승인 설계](../design/post-mvp-improvements.md), [구현 계획](../superpowers/plans/2026-11-04-post-mvp-improvements.md)을 따른다.
사용자는 설계 확정 후 구현을 요청했고 아이콘 B(남색 배경의 간결한 간트)를 선택했다.

## 구현과 내부 선택

- 라이트/다크·프로젝트별 접힘은 버전이 있는 localStorage 키에 보관한다. 읽기/쓰기 실패는 일정 편집을 막지 않는다.
  표시 설정이므로 SQLite 스키마·preload API를 확장하지 않았다. 최근 프로젝트는 실행 중 메모리만 사용한다.
- 기존 날짜 계산을 재사용한 월요일 시작 한국어 선택기, 양쪽 화면의 날짜 클릭 추가와 간트 들여쓰기·접힘을 구현했다.
- `오늘`은 현재 월과 오늘 위치로 이동한다. 범위 끝에서 중앙 정렬에 필요한 빈 화면 여백을 허용하되 유효 날짜를 추가하지 않는다.
- 공통 포인터 세션과 순수 날짜 계산으로 이동·양 끝 조절·미리보기·취소·한 번 저장을 처리한다.
  실제 끝만 손잡이를 표시하고, 기간·지원 연도·미저장 입력·기존 저장 오류 계약을 유지한다.
  간트는 가장자리 자동 탐색·임시 확장, 달력은 인접 월 드롭과 월 이동 버튼 위 650ms 대기를 사용한다.
- 전체 도구 모음은 스크롤 영역 밖에 두고, 월/일 눈금·요일은 조회 스크롤 안에서 고정한다.
  성공 토스트는 2초, 오류는 해결 전까지 유지한다.
- 현재 사용자용 NSIS 완료 화면과 기본 체크 실행 옵션, 아이콘 PNG/ICO를 적용했다.
  ICO는 선택한 이미지의 16/32/48/64/128/256px 표현이다. 이미지 생성 도구로 만든 B 시안을 사용했고 인코딩만 변환했다.
- 버전은 기존 MVP·업데이트 fixture와 구별하도록 0.2.0으로 올렸다. 의존성 버전과 DB schema 1은 유지한다.

## 시작 속도에서 확인한 경계

기존 창 표시는 저장소 초기화 뒤 `ready-to-show`까지 기다렸다. 첫 renderer/GPU paint와 창 표시를 분리해
창은 생성 직후 표시하도록 변경했다. DB 헤더·무결성·FK·마이그레이션 검사는 유지한다.
`startup-latest.json`에 bootstrap/app-ready/storage/window/renderer/snapshot/UI-ready 시간을 비동기로 순서대로 기록한다.
이 기록은 프로세스 생성 이후 시간이며 시작 메뉴 클릭 이전/프로세스 생성 전 대기를 측정하지 못한다.

사용자가 보고한 40초 지연은 해당 Windows PC에서 아직 재현·원인 확인하지 못했다.
Linux 자동화의 시작 시간은 그 PC의 3초/5초 목표 달성 증거가 아니다.

## 검증

검증 환경: Linux x64 / Node v24.22.1 / Electron 45.2.1, 일회성 native/E2E 프로필과 Xorg :98.
기준 SHA에 변경이 있는 작업 트리에서 `DISPLAY=:98 npm run verify:app`를 실행했다.
2026-11-04 05:11 UTC 시작 보고서의 7단계가 모두 통과했다.

| 검증 | 결과 |
| --- | --- |
| TypeScript·제품 빌드 | 통과 |
| 배포 정적 검사 | 14개 통과; PNG 패키지 포함 보정 뒤 installer 3개 재검사 통과 |
| 날짜·시각화 unit | UTC / Asia/Seoul / America/Los_Angeles 각각 36개 통과 |
| UI | 34개 통과 |
| Electron native | 13개 통과, sandbox/contextIsolation 유지 확인 포함 |
| Electron E2E | 33개 통과; 새 기능·저장 실패·응답 소실·월 탐색·취소·재실행 포함 |
| 저장소 하네스 | 7개 검사·22개 회귀 테스트 통과 |
| Windows 설치·사용자 PC | 이 로컬 환경에서는 미실행. 원격 CI 및 실기 결과와 별도 |

Linux 테스트 진입점의 정상 재실행 한 표본은 프로세스 시작 기준 창 표시 232ms, UI ready 483ms였다.
이 표본은 실제 설치본·시작 메뉴 클릭·사용자 Windows PC 측정이 아니며 성능 보장으로 사용하지 않는다.

독립 리뷰에서 재현한 다음 결함을 실패 테스트부터 보정했다.

- 드래그 commit 뒤 응답 소실: 재조회 시 깨끗한 패널을 최신 snapshot과 동기화해 이후 이름만 수정해도 날짜를 되돌리지 않는다.
- 간트 overscan 날짜의 Tab 포커스: 화면 안 날짜만 순차 포커스에 포함해 헤더가 별도 스크롤되지 않는다.
- 달력의 가려진 날짜 영역: 실제 hit-test 결과를 확인해 툴바·고정 요일 뒤로 가려진 셀에는 드롭하지 못한다.
- 별도 조작 검사에서 Escape 후 release click을 억제하고, 간트 헤더의 scrollbar gutter 폭을 행과 맞췄다.

고정 헤더의 음수 inset 지적은 실제 Chromium에서 재현되지 않았다. scrollTop 300에서 main과 요일 헤더의
상단이 모두 62px였고 헤더 42px 전체가 보였다. main padding 보정값을 유지하고 전체 헤더 가시성 회귀를 추가했다.
아이콘 asset import는 bundler 진입점에서 해석하고 window 생성 함수에 경로를 전달해 native 검사에서도 동일 함수를 사용한다.
PNG를 실제 패키지 파일 목록에 포함하며, ICO 크기·선택된 경로·설치 schema도 검사한다.
첫 원격 CI(`9f89356`, [Application #41777913630](https://github.com/kdydesign/simple-timeline/actions/runs/41777913630))에서
Ubuntu 검사는 통과했고 Windows의 편집 패널과 배경을 함께 조작하는 E2E 4개가 실패했다.
1,024px 화면에서는 모달의 `inert`로 배경 slider가 접근성 트리에서 제외되고 1,280px에서는 다시 접근되는 것을
로컬 Chromium에서 재현했다. 해당 테스트 4개에 1,280×820 viewport와 배경이 활성 상태라는 전제 검사를 명시했다.
제품의 좁은 화면 모달 동작은 유지했다. 보정 뒤 Linux `verify:app` 7단계(E2E 33개 포함)와 하네스를 다시 통과했다.
원격 CI 재검증 URL·최종 소스 SHA는 완료 메시지에서 확인한다.

## 다음 확인

- 해당 커밋의 Windows CI 설치 artifact로 완료 화면·체크/해제 실행·B 아이콘·업데이트 데이터 보존 확인.
- 사용자 Windows PC의 정상 재실행 시간과 `startup-latest.json` 비교. 최초/복구/마이그레이션 별도 기록.
- 기존 MVP 인수 기록은 소급 변경하지 않는다. 이번 새 기능은 [사용 안내](../release/user-guide.md)를 기준으로 확인한다.


## 시작 지연 후속 진단 (0.2.1)

사용자 PC의 0.2.0 반복 실행 기록(2026-11-04 UTC):

| 단계(ms, Node uptime 기준) | 일반 실행 05:47 | `--disable-gpu` 실행 05:52 |
| --- | ---: | ---: |
| bootstrap | 49 | 31 |
| app-ready | 123 | 85 |
| storage-ready | 132 | 91 |
| window-shown | 315 | 205 |
| renderer-loaded | 16,645 | 19,432 |
| snapshot-served | 16,701 | 19,474 |
| ui-ready | 16,739 | 19,506 |

사용자 관측은 창까지 약 20초, 검은 화면 뒤 UI까지 추가 약 20초였다. show 이벤트는 실제 모니터 표시를 보장하지
않으며 위 uptime은 시작 메뉴 클릭부터의 전체 시간과 다르다. DB 준비는 9ms/6ms, 로딩 이후 snapshot·UI는
94ms/74ms로 측정됐다. GPU 비활성의 개선 근거가 없어 기본 하드웨어 가속 설정을 유지한다.
로컬 Linux 격리 프로필에서 일반/GPU-off 각 3회 실행은 전체 540~833ms였고 사용자 지연은 재현되지 않았다.

0.2.1은 원인 분리를 위한 **진단 보강판**이며 성능 수정 완료판이 아니다.
기존 파일에 schemaVersion 2로 생성·로드 요청·DOM 준비·첫 paint 준비와 로딩 실패 코드를 추가한다.
`requests`는 main의 초기 파일 요청 종류와 시작/완료 시간, `renderer`는 별도의 navigation 기준 시간·module 준비·
first-paint/first-contentful-paint를 기록한다. 시계가 다른 값은 직접 빼지 않는다. schema 1의 process-start 표현을
schema 2에서 실제 `process.uptime()`에 맞게 node-start로 명확히 했다.

Electron의 file:// Performance Resource Timing 목록이 비어 있는 것을 실제 프로세스에서 확인해 main webRequest로
보완했다. 이 앱에는 기존 webRequest 정책 listener가 없으며 관찰 종료·창 종료·60초 한도에서 listener를 해제한다.
향후 요청 정책을 추가할 때는 Electron의 이벤트당 단일 listener 제약에 맞춰 통합해야 한다.
파일명·URL·로컬 경로·일정 내용·오류 문구는 수집하지 않고 원격으로 전송하지 않는다. preload의 8개 API와 DB는 유지한다.

다음 확인: 0.2.1을 **옵션 없이** 정상 실행한 뒤 같은 startup-latest.json과 체감 시간을 비교한다.
파일 요청 자체가 느린지, 요청 전 renderer 시작인지, module 평가/paint인지 확인한 뒤 해당 원인만 수정한다.


통합 검사에서 JSON 재기록 중 읽기가 빈 파일을 보는 현상을 재현했다. 지연 쓰기를 강제로 주입하는 회귀 검사에서
같은 실패를 확인한 뒤 `.partial`에 완전히 쓴 후 rename하도록 보정했다. 기존 단계별 순차 기록과 쓰기 실패 격리는 유지한다.
독립 리뷰에서 중요한 구현 결함은 발견되지 않았다. 첫 쓰기 reject·renderer crash·blocked·관찰 중 종료에 대한
진단 전용 강제 주입 검사는 남아 있으며, 해당 분기의 코드 검토와 기존 앱 회귀 검사를 별도로 구분한다.

최종 로컬 검증: Linux x64 / Node24.22.1 / Electron45.2.1, 일회성 프로필에서 verify:app 7단계 통과.
배포14, unit38×3시간대, UI34, native13, E2E35개 통과. 하네스7개 검사·22개 회귀 통과.
Windows CI 결과·배포 소스 SHA는 완료 메시지에서 확인하며, 사용자 PC의 성능 목표 달성은 여전히 미검증이다.
