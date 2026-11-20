# Home 및 첫 PlanRail 진입 실험 재현

기준은 `3271e63ab9eef8faa90469f9808193534f2c8081`이다. 후보는 같은 소스에 이 디렉터리의 `candidate.patch`를 적용한 버전이다. 두 버전의 메인 번들 SHA-256은 일치한다. 원시값에는 메인 및 renderer 번들의 SHA-256이 있다. [기준·후보 패치](candidate.patch) · [96회 측정값과 중앙값·범위](raw.json)

## 조건

- Linux x64 6.18.57, AMD EPYC 9V74, cgroup CPU 4코어·메모리 32 GiB, Xvfb 1440×1000, 앱 내부 1440×890, 배율 100%, UTC, Electron 45.2.1, Node 24.22.1. Chromium sandbox를 활성화했다. Windows 설치본의 150% 배율은 별도 확인 대상이다.
- 일정 수별로 하나의 테스트 프로필을 만들고 SQLite 백업을 복제했다. 각 측정은 기존 데이터가 있는 새 임시 프로필과 새 Electron 프로세스를 사용했다. OS 파일 캐시는 유지했다. 2026-11-20 UTC에 앱의 선택일과 첫 일정 시작일·종료일을 맞췄다. 대상은 1번 일정 ‘측정 일정’이다. 1만 건 조건의 9,998개 일정은 다음 달 15일에 모아 두었다. 스크립트는 재실행 당일의 UTC 날짜를 사용하고 Home에서 날짜를 확인한다.
- 각 일정 수에서 버전별 24회다. 홀수 회차는 기준→후보, 짝수 회차는 후보→기준이며 같은 방식으로 일정 수 순서도 교대했다. fixture 준비·sandbox 확인용 사전 실행은 통계에서 제외했다. 시간 측정 실행에는 DevTools, CDP, CPU 프로파일러 또는 추적을 연결하지 않았다.
- Home 준비는 기존 `startup-latest.json`의 `ui-ready` 값이며 메인 Node 프로세스 시작 기준이다. 제품의 20ms 주기 준비 확인을 포함한다. 이 파일을 확인한 뒤에만 입력 드라이버가 동작한다. 첫 진입은 renderer의 신뢰된 PlanRail 메뉴 클릭 이벤트부터 대상 막대를 실제로 클릭해 편집 패널에 동일한 일정 이름이 있고 화면 공간을 차지하는 순간까지다. 메뉴 왕복은 편집기를 닫은 다음 Home 클릭부터 PlanRail을 다시 클릭해 같은 막대 중앙의 hit-test가 성공하는 순간까지다. 이 두 구간은 renderer의 `performance.now()` 차이다. [입력 및 관측 코드](drive.cjs)

## 재현

저장소 루트에서 두 임시 checkout을 만든다. 각 checkout은 저장소에서 지정한 Node, npm 의존성 및 Electron native 모듈을 사용해야 한다. 샌드박스가 동작하는 Linux 세션에서 아래와 같이 실행한다. Xvfb를 쓰면 `DISPLAY`가 1440×1000 화면을 가리키도록 설정한다. 기존 출력은 덮어쓰지 않는다.

```sh
evidence="$PWD/docs/harness/evidence/home-planrail"
experiment=$(mktemp -d)
git worktree add --detach "$experiment/before" 3271e63
git worktree add --detach "$experiment/after" 3271e63
git -C "$experiment/after" apply "$evidence/candidate.patch"
(cd "$experiment/before" && npm ci && npm run build:test)
(cd "$experiment/after" && npm ci && npm run build:test)
python3 "$evidence/measure.py" "$experiment/before" "$experiment/after" "$experiment/raw.json" --pairs 24
node "$evidence/count-index.cjs" "$experiment/before" "$experiment/after" "$experiment/count-3.json" 3
node "$evidence/count-index.cjs" "$experiment/before" "$experiment/after" "$experiment/count-10000.json" 10000
```

인덱스 진단은 별도 소스 복사본을 빌드한다. `WeakMap`으로 실제 스냅샷 참조에 번호를 부여해 참조별 호출 횟수와 인덱스 생성 시간을 기록한다. 3건과 1만 건 모두 왕복까지 서로 다른 두 입력이 관찰됐고, 입력별 호출은 기준 2회·후보 1회였다. 1만 건에서 첫 입력의 개별 호출은 기준 8.8·7.0ms, 후보 9.9ms였고, 두 번째 입력은 기준 7.5·7.9ms, 후보 12.7ms였다. 후보의 두 번째 입력은 첫 PlanRail 진입까지 관찰됐다. 버전별 진단 1회에서 두 입력에 쓴 시간은 31.2→22.6ms였다. 이 합계는 사용자 경로의 96회 시간 비교와 별도로 집계했다. [3건 진단](index-counts.json) · [1만 건 진단](index-counts-10000.json) · [진단 코드](count-index.cjs)
