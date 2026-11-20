# WorkRail 성능 기준선 — 2026-11-20

기준 소스는 `200e0ca9b11a8a6f06e2bc8abface26315465294`, WorkRail 1.0.0이다. 측정 시 tracked 작업 트리는 깨끗했다. 이번 작업은 기준선과 원인 후보를 기록한다. 개선 적용 및 변경 전후 비교는 실행하지 않았다.

## 측정 조건

- Linux x64 6.18.57, CPU 할당량 4코어, 메모리 한도 16 GiB, Xvfb 1600×1200. 앱 뷰포트 1280×800, UTC. Electron 45.2.1, Chromium 156.0.8078.75, Node 24.22.1. Electron sandbox를 유지했다.
- `npm ci --no-audit --no-fund`와 `npm run build:test`를 실행했다. 제품 renderer와 기존 Electron 테스트 진입점으로 생성한 빌드를 사용했다. 로컬 테스트 프로필은 실행마다 새로 만들고 삭제했다.
- 기존 `hotfix` fixture는 프로젝트 2개와 일정 3건이다. `scale`은 프로젝트 1개와 일정 10,000건이다. 그중 9,998건은 2026-12-15에 집중되어 있고, 나머지는 지원 범위 양 끝에 있다. 이는 일반 업무 데이터의 분포가 아니라 기존 스트레스 케이스다.
- 각 fixture로 새 앱 프로세스를 세 번 실행했다. 수평 스크롤은 휠 30번, 수직 스크롤은 대량 fixture에서 휠 30번, 드래그는 포인터 이동 30번 후 Escape 취소다. 입력 사이에 16ms를 기다렸으며 실제 이벤트 템포는 자동화와 렌더링 부하에 따라 달라졌다. 측정 숫자는 이 조건의 기준선이다.
- 기준선에는 CDP 누적 시간 차이와 Long Tasks API, `requestAnimationFrame` 콜백 간격, MutationObserver를 사용했다. 별도 실행에서 Main·Renderer V8 샘플과 Electron `contentTracing`으로 원인을 확인했다. 두 측정은 부하가 다르므로 서로의 수치를 합산하지 않는다. Perfetto v59.1로 바이너리 트레이스를 Chrome JSON으로 변환하고 Renderer의 각 시작·종료 마크 사이를 집계했다.
- rAF 간격은 앱 메인 스레드가 콜백을 실행한 간격이다. 모니터 FPS나 GPU 프레임 드롭 수를 뜻하지 않는다. DOM 변경 수는 실제 속성 기록과 노드 추가·삭제 수이며 React 컴포넌트 렌더 횟수와 다르다.

## 측정 결과

### Gantt의 렌더링과 입력

아래 범위는 기준선 3회에 걸친 관측이다. 스타일·레이아웃과 JS는 조작 구간 동안의 **누적 시간**이다. rAF p95는 각 실행 안에서 계산한 값의 범위다.

| 조작 | JS 누적 | 스타일 재계산 + 레이아웃 누적 | rAF p95 | DOM 변화 |
| --- | ---: | ---: | ---: | --- |
| 일정 3건, 가로 스크롤 | 66–82ms | 68–86ms | 약 33ms | 속성 3,230회 |
| 일정 10,000건, 가로 스크롤 | 116–172ms | 136–186ms | 33–67ms | 속성 8,058회, 노드 68개 추가·106개 제거 |
| 일정 10,000건, 세로 스크롤 | 104–116ms | 44–57ms | 24–33ms | 속성 181회, 노드 57개 추가·68개 제거 |
| 일정 3건, 드래그 미리보기 | 56–98ms | 16–25ms | 약 33ms | 속성 215회 |
| 일정 10,000건, 드래그 미리보기 | 108–189ms | 48–96ms | 약 33ms | 속성 1,738–2,846회 |

대량 fixture에서도 초기 화면에 간트 행 **14개**, 날짜 버튼 **98개**만 생성됐다. 행·날짜를 현재 창 주변만 그리는 가상화는 작동한다. 가로 이동은 세로보다 속성 변경이 많았고 별도 트레이스에서도 가로 `UpdateLayoutTree` 누적 122ms, 세로 25ms로 관찰됐다. 날짜와 주말 하이라이트, 막대 위치 등 가로 좌표에 의존하는 DOM이 함께 갱신된다. 이 중 어느 갱신이 생략 가능한지는 아직 확인하지 않았다. [가로·세로 가상화와 렌더 경로](../../src/renderer/components/GanttView.tsx#L313)

- 일반 기준선 3회에서는 각 조작에서 Long Tasks API가 보고한 50ms 이상 작업이 없었다. 별도 계측에서만 대량 드래그 중 `RunTask` **91.99ms**가 1회 나왔고, 그 안의 `UpdateLayoutTree`는 **76.68ms**였다. 같은 트레이스에서 가로·세로 조작의 50ms 이상 `RunTask`는 없었다. 스타일 재계산이 그 사례를 지배했다는 증거이며, 같은 지연이 항상 발생한다는 뜻은 아니다.
- 대량 renderer CPU 프로파일에서 `getBoundingClientRect` 72.03ms, `toOrdinal` 53.64ms, `removeChild` 38.71ms가 샘플 자기 시간으로 관찰됐다. 프로파일은 스크롤·드래그·편집 열기·조회까지 포함한다. 네이티브 프레임 합계와 GC 샘플을 제품 함수의 비용으로 합치지 않았다.

### Main–Renderer IPC와 CPU

| API | 일정 3건 | 일정 10,000건 |
| --- | ---: | ---: |
| `getStatus` 왕복 중앙값 범위 | 0.3–0.4ms | 0.6–2.6ms |
| `getSnapshot` 왕복 중앙값 범위 | 0.7–0.8ms | 72.75–120.25ms |
| `getSnapshot` 왕복 p95 범위 | 1.0–1.4ms | 90.1–232.1ms |
| `getSnapshot` 응답 데이터 JSON UTF-8 크기 | 1,077B | 2,527,975B |
| 별도 계측의 `getSnapshot` 메인 핸들러 중앙값 | 0.32ms | 30.72ms |

각 실행에서 워밍업 1회 후 API를 20번 순차 호출했다. 왕복은 renderer에서 API 호출부터 응답까지 측정했다. JSON 크기는 자료량 비교용이며 실제 IPC 메시지의 전송 바이트와 다를 수 있다. 별도 트레이스에서 메인에서의 `timeline:snapshot` 핸들러 시간에 SQLite 트랜잭션, DTO 구성, 공유 저장소 결합 경로가 포함된다. 왕복과 메인 구간의 차이를 직렬화 비용 하나로 귀속할 수 없다.

Main의 대량 CPU 샘플에는 `dispatch`, 일정 DTO 변환, `compareIds` 및 `sortSnapshot`이 나타났다. 코드에서 SQLite 조회 후 모든 행을 변환하고 로컬·공유 결과를 결합해 정렬하는 경로와 일치한다. 드래그 미리보기·휠·편집 열기만 들어 있는 트레이스 구간에서 `getSnapshot`과 `getStatus` 호출은 각각 0회였다. 저장 성공 시 상태와 스냅샷을 다시 조회하는 경로는 미리보기와 별개다. [SQLite 조회](../../src/main/db/repository.ts#L126) · [공유 데이터 결합](../../src/main/sharing/repository.ts#L17) · [저장 후 조회](../../src/renderer/state/useTimeline.ts#L106)

저장까지 하는 별도 실행에서 확인창의 ‘변경’을 누른 뒤 날짜가 바뀐 일정 막대가 보이고 저장 덮개가 사라질 때까지 측정했다. fixture마다 같은 앱 프로세스에서 세 번 측정한 범위는 3건 **317–374ms**, 10,000건 **398–576ms**다. 자동 클릭·확인창 전환·조회·화면 반영이 포함된다. 저장 덮개는 저장 확인 상태에서 180ms 뒤 해제하도록 구현돼 있어 전체를 DB 지연으로 해석할 수 없다. 처음 대량 확인 프로브는 대상이 화면에 남는다는 조건 때문에 7초 안에 확인하지 못했다. 화면 안에서 막대를 옮기는 조작으로 재측정했으며 첫 실패는 원시 기록에 보존했다. [저장 덮개](../../src/renderer/components/SavingOverlay.tsx#L9)

### JavaScript Heap, DOM과 리스너

Home → PlanRail → 프로젝트 편집기 열기 → 닫기를 한 주기로 했다. 워밍업 2회 후, 조작·조회가 끝난 시점부터 8회와 16회에서 같은 화면 상태로 돌아와 이전과 같은 강제 GC 및 CDP 카운터를 사용했다. 첫 열은 조작·조회 이전의 워밍업 시점이므로 워밍업→8회 차이에 조회와 탐색의 영향도 포함한다.

| fixture | 워밍업 후 | 8회 추가 | 16회 추가 |
| --- | --- | --- | --- |
| 3건, JS 힙 | 5.81 MiB | 6.73–6.74 MiB | 6.92–6.95 MiB |
| 3건, DOM / JS 리스너 | 674 / 353 | 697 / 366 | 697 / 366 |
| 10,000건, JS 힙 | 15.09–15.11 MiB | 16.06–16.09 MiB | 16.15–16.18 MiB |
| 10,000건, DOM / JS 리스너 | 992 / 414 | 1,012–1,026 / 427 | 1,012–1,026 / 427 |

별도 3건 실행에서는 조회·스크롤을 빼고 편집기 주기만 32회 반복했다. GC 후 JS 힙은 **5.80 → 6.44 → 6.57 MiB**였다. DOM/리스너는 **674/353**으로 유지됐다. 0·16·32회 힙 스냅샷 모두에서 `detachedness=2` 노드는 0개였다. 스냅샷의 전체 자기 크기 순증 약 720KB 중 `code` 범주는 약 756KB 증가했고, 일부 다른 범주는 감소했다. 이 경로에서 편집기 DOM이나 리스너가 반복마다 누적되는 증거는 없다. 코드 범주 증가가 계속되는지와 다른 메뉴의 누수 여부는 판단할 수 없다.

소스에서 Gantt의 전역 포인터·키보드 리스너는 cleanup에서 제거되고, ResizeObserver도 해제된다. 공유 상태 구독은 preload가 반환한 해제 함수로 정리한다. PlanRail은 도구를 바꿔도 화면 상태 보존을 위해 일부 화면을 계속 마운트하므로 숨겨진 화면 몫이 남을 수 있다. 이 점과 DOM 유지 자체를 누수로 판정하지 않는다. [간트 이벤트 정리](../../src/renderer/state/useGanttNavigation.ts#L84) · [Gantt 크기 관찰](../../src/renderer/components/GanttView.tsx#L156) · [공유 구독 정리](../../src/renderer/state/useSharing.ts#L21)

## 개선 후보와 검증 기준

| 우선순위 | 검증할 개선 | 예상 부작용과 회귀 확인 |
| --- | --- | --- |
| 1. 가로 스크롤·드래그 | 날짜 창과 휴일 파생값을 날짜 범위가 바뀌는 경우로 좁히고, 고빈도 이동의 화면 반영을 프레임 단위로 묶어 동일한 조작에서 스타일·DOM 변경·rAF 분포가 줄어드는지 확인한다. | 마지막 입력이 누락되면 일정 미리보기와 실제 날짜가 달라질 수 있다. 픽셀 단위 hover·Ctrl+휠 확대·Escape·경계 자동 스크롤·키보드 포커스를 검사한다. |
| 2. 대량 스냅샷 | 정렬과 DTO 구성 비용을 먼저 분리 측정한다. 이후 저장 후 전체 조회를 유지할지, 변경된 개체와 리비전으로 갱신할지 비교한다. | 증분 갱신은 LAN 공유 권한 회수, 일정 삭제, 동시 변경, 저장 응답 유실의 동작을 바꿀 수 있다. 기존 전체 조회가 제공하는 일관성·실패 복구를 인수 기준으로 유지한다. |
| 3. 힙·리스너 | 같은 프로필에서 증가가 지속되는 메뉴 전환을 찾아 그 경로만 더 긴 반복 및 보유 경로로 확인한다. | 숨겨진 화면을 무조건 해제하면 스크롤 위치, 편집 상태, TermRail 세션을 잃을 수 있다. 누수 여부를 판단하기 전에 메뉴별 수명 계약을 확인한다. |

이 후보들은 측정에 근거한 제안이다. 채택한 구조 변경이 없어 ADR은 별도로 작성하지 않았다.

## 미측정 또는 판정 보류

- 회사 Windows 150% 배율, 배포 설치본, GPU 합성·실제 프레임 표시 시간, 보안 프로그램 개입은 미측정이다. 이 기준선으로 과거 Windows 시작·도움말 지연의 원인을 설명할 수 없다.
- 대량 프로필의 첫 시작은 fixture 삽입을 포함하므로 일반 사용자 시작 시간으로 비교하지 않았다. Home과 PlanRail 이외의 메뉴 장기 반복, Main·GPU 프로세스의 장기 메모리, 실제 LAN 호스트·멤버 지연도 미측정이다.
- React 커밋별 렌더 횟수와 보유 경로별 참조 원인은 별도 계측이 필요하다. 장기 릭의 존재 여부는 보류한다.
- 코드 변경 후 같은 조건에서의 전후 비교는 미실행이다.

## 재현과 원시 근거

기준 커밋을 체크아웃하고 테스트 빌드와 Xvfb를 준비한 뒤 저장소 루트에서 함께 전달한 측정 스크립트를 실행한다. `BASELINE_DIR`에는 내려받은 증거 압축을 푼 디렉터리, `DISPLAY`에는 실제로 실행 중인 가상 디스플레이를 지정한다.

```bash
npm ci --no-audit --no-fund
npm run build:test
for seed in hotfix scale; do
  for run in 1 2 3; do
    node "$BASELINE_DIR/capture.cjs" "$seed" "$run" baseline
  done
  node "$BASELINE_DIR/capture.cjs" "$seed" trace trace
  node "$BASELINE_DIR/capture.cjs" "$seed" confirmed commit
  trace_processor_shell convert json "$BASELINE_DIR/$seed-trace-trace.pftrace" "$BASELINE_DIR/$seed-trace-trace.json"
done
node "$BASELINE_DIR/capture.cjs" hotfix retained heap
python3 "$BASELINE_DIR/summarize.py"
python3 "$BASELINE_DIR/heap-summary.py"
```

결과는 `*-metrics.json`, `*-main.cpuprofile`, `*-renderer.cpuprofile`, `*.pftrace`, `*.heapsnapshot`에 저장된다. `summary.json`은 숫자 반복별 집계이며 p95는 정렬 후 `floor(0.95 × (n − 1))` 위치의 관측값이다. `static-inventory.json`은 저장소의 파일·의존성 목록으로, 기존 출력·소스도 포함하므로 실제 런타임 병목이나 배포 번들의 크기로 사용하지 않았다.

[Electron 실행 후속 분석](electron-runtime-performance-2026-11-20.md)은 PostRail을 포함한 코드에서 기존 DB로 다시 시작하는 구간, Home의 렌더러 작업과 트레이 상주 비용을 별도 측정했다.
