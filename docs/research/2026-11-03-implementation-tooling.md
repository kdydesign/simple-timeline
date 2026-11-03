# 구현 도구·버전·검증 경계 조사

확인일: 2026-11-03 UTC. 스테이지 4 구현 계획의 근거 자료다.
공식 프로젝트 문서·소스와 npm의 게시 메타데이터를 HTTPS 읽기로 확인했다.
제품 코드·스캐폴딩·의존성·lockfile을 만들거나 설치하지 않았다.
아래는 정확 버전 **후보**와 문서상 조합 검토이며, 계획 승인이나 실제 빌드·Windows 실행 성공을 대신하지 않는다.

## 추천 조합과 대안

에이전트 추천은 **electron-vite + electron-builder**다. electron-vite는 main/preload/renderer의 진입점과
빌드를 한 설정에서 분리하고, 공식 배포 안내가 electron-builder 및 네이티브 자원 unpack 구성을 설명한다.
작은 개인용 앱에 필요한 경계를 명시하기 쉽다. 이는 공식 문서의 유일한 권장 조합이라는 뜻이 아닌 프로젝트별 판단이다.

Electron Forge + Vite plugin도 유효한 대안이다. 공식 plugin README에서 main·preload별 Vite 빌드 설정을 확인했다.
Forge 계열 여러 패키지와 maker/plugin 구성을 추가하는 대신 이번 후보는 electron-vite와 builder 설정을 직접 관리한다.
Forge 8.0.1의 plugin 안정성을 ‘실험적’이라고 단정하지 않는다. Forge 웹 문서는 이 환경에서 403이었고
공식 저장소의 plugin README와 registry 메타데이터만 읽었다.

출처: [electron-vite 개발 구성](https://electron-vite.org/guide/dev),
[배포 안내](https://electron-vite.org/guide/distribution),
[Forge Vite plugin 공식 README](https://github.com/electron/forge/blob/v8.0.1/packages/plugin/vite/README.md).
대안 확인 버전은 [Forge CLI 8.0.1](https://registry.npmjs.org/@electron-forge/cli/8.0.1),
[Vite plugin 8.0.1](https://registry.npmjs.org/@electron-forge/plugin-vite/8.0.1)이며 2026-09-29 게시, Node >=22.13.0이다.

## 정확 버전 후보와 게시일

각 링크는 해당 버전의 registry 메타데이터다. 게시일은 패키지 루트 JSON의 `time[version]`으로 대조했다.
모든 후보는 확인일 이전에 게시된 stable이며, 조사 시점 `latest` 태그(단, Node types는 24 계열)를 사용했다.
후속 설치에서는 직접 의존성에 정확 버전과 생성된 lockfile을 기록하고 `npm ci`로 재현해야 한다.

| 패키지 | 버전 | UTC 게시일 | 주요 engines/peer 검토 |
| --- | --- | --- | --- |
| [electron](https://registry.npmjs.org/electron/45.2.1) | 45.2.1 | 2026-10-31 | 설치 도구 Node >=22.12.0 |
| [react](https://registry.npmjs.org/react/19.3.1) | 19.3.1 | 2026-10-14 | react-dom과 같은 버전 |
| [react-dom](https://registry.npmjs.org/react-dom/19.3.1) | 19.3.1 | 2026-10-14 | peer react ^19.3.1 |
| [better-sqlite3](https://registry.npmjs.org/better-sqlite3/13.0.3) | 13.0.3 | 2026-08-05 | Node >=22. Electron ABI 호환은 별도 재빌드·실행 확인 |
| [typescript](https://registry.npmjs.org/typescript/7.0.2) | 7.0.2 | 2026-07-08 | Node >=16.20.0 |
| [vite](https://registry.npmjs.org/vite/8.3.5) | 8.3.5 | 2026-10-21 | Node ^20.19.0 또는 >=22.12.0 |
| [electron-vite](https://registry.npmjs.org/electron-vite/6.0.0) | 6.0.0 | 2026-10-14 | Vite ^6/^7/^8, Node ^20.19 또는 >=22.12; @swc/core peer는 optional |
| [@vitejs/plugin-react](https://registry.npmjs.org/@vitejs/plugin-react/6.2.1) | 6.2.1 | 2026-11-02 | Vite ^8.0.0; React compiler 관련 peers는 optional |
| [electron-builder](https://registry.npmjs.org/electron-builder/26.18.0) | 26.18.0 | 2026-10-20 | registry engines Node >=14.0.0. 전이 native 도구의 더 높은 조건도 충족해야 함 |
| [@electron/rebuild](https://registry.npmjs.org/@electron/rebuild/4.2.1) | 4.2.1 | 2026-10-06 | Node >=22.12.0 |
| [vitest](https://registry.npmjs.org/vitest/5.1.0) | 5.1.0 | 2026-11-02 | Node ^22.12/^24 또는 >=26, Vite ^6.4/^7/^8 |
| [@playwright/test](https://registry.npmjs.org/@playwright/test/1.64.1) | 1.64.1 | 2026-10-14 | Node >=20 |
| [playwright](https://registry.npmjs.org/playwright/1.64.1) | 1.64.1 | 2026-10-14 | Node >=20. Electron 자동화 import의 직접 의존성으로 명시 |
| [@testing-library/react](https://registry.npmjs.org/@testing-library/react/16.3.3) | 16.3.3 | 2026-08-27 | React/DOM/types ^18 또는 ^19, @testing-library/dom ^10 |
| [@testing-library/dom](https://registry.npmjs.org/@testing-library/dom/10.4.2) | 10.4.2 | 2026-09-13 | Node >=18; RTL의 필수 peer 직접 선언 |
| [@testing-library/user-event](https://registry.npmjs.org/@testing-library/user-event/14.6.8) | 14.6.8 | 2026-10-13 | Node >=12, DOM >=7.21.4 |
| [@testing-library/jest-dom](https://registry.npmjs.org/@testing-library/jest-dom/7.0.1) | 7.0.1 | 2026-08-09 | Node >=22, DOM >=10 <11, Vitest >=0.32 optional |
| [jsdom](https://registry.npmjs.org/jsdom/30.1.3) | 30.1.3 | 2026-10-15 | Node ^22.22.2 / ^24.15.0 / >=26 |
| [@types/node](https://registry.npmjs.org/@types/node/24.19.2) | 24.19.2 | 2026-10-09 | 내장/개발 Node와 같은 24 계열. 최신 26 계열 대신 선택 |
| [@types/react](https://registry.npmjs.org/@types/react/19.3.0) | 19.3.0 | 2026-09-09 | React 19 계열 |
| [@types/react-dom](https://registry.npmjs.org/@types/react-dom/19.3.0) | 19.3.0 | 2026-09-09 | peer @types/react ^19.3.0 |
| [@types/better-sqlite3](https://registry.npmjs.org/@types/better-sqlite3/9.6.0) | 9.6.0 | 2026-08-01 | 실행 버전과의 API 타입 정합성은 구현 시 typecheck로 확인 |

React/react-dom/better-sqlite3는 runtime dependencies, 나머지는 개발·빌드·검증용 후보로 분류한다.
추가 상태 관리·날짜·간트·달력·가상화 라이브러리를 반드시 설치해야 하는 근거는 없다.
크로스 플랫폼 환경변수는 Node launcher에서 전달할 수 있어 cross-env도 필수로 선택하지 않는다.

Node v24.22.1의 공개 바이너리는 [공식 SHASUMS](https://nodejs.org/download/release/v24.22.1/SHASUMS256.txt)에서 확인했다.
이 Node 버전은 표의 engines와 주요 peer 범위를 만족한다. 전이 의존성 해결·타입 검사·빌드는 실행하지 않았다.

## Electron 지원 정책과 Node/ABI 분리

Electron 공식 지원은 최신 3개 stable major와 각 계열의 최신 minor다.
조사 시점 npm latest는 45.2.1이다. 후속 구현에서도 지원·보안 수정 상황을 재확인하며,
이 표를 이유로 오래된 patch를 영구 고정하지 않는다. 업데이트가 필요하면 이유·검증을 계획과 lockfile에 기록한다.
출처: [Electron 버전 지원 정책](https://www.electronjs.org/docs/latest/tutorial/electron-timelines).

[공식 release JSON](https://releases.electronjs.org/releases.json)의 45.2.1 항목에서 확인한 값:

- Electron release date: 2026-10-30. npm 패키지는 다음 UTC 날짜에 게시됐다.
- 내장 Node: 24.22.1, Chromium: 156.0.8078.75, modules ABI: 150.
- 이 환경에서 실행한 일반 Node: 24.22.1, modules ABI: 137.

동일한 Node 버전 문자열이어도 ABI는 다르다. 일반 Node에서 native addon을 연 성공은 Electron 성공이 아니다.
[Electron native modules](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules)와
[better-sqlite3 자체 안내](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/troubleshooting.md)는
대상 Electron 재빌드와 native library unpack을 설명한다.

DB 테스트를 Electron 전용 runner로 실행하고 일반 Node의 Vitest 테스트에서 addon을 import하지 않는 계획이 적절하다.
두 런타임 모두에서 실제 DB를 테스트하려면 별도 설치 트리 또는 CI job으로 native 바이너리를 분리해야 한다.
하나의 node_modules를 런타임 사이에서 반복 덮어쓰면서 동시 검증하지 않는다.
이는 사양에서 도출한 제안이며 이 조사에서 runner를 작성하거나 실행하지 않았다.

## 빌드·sandbox·CSP

- electron-vite의 [의존성 처리](https://electron-vite.org/guide/dependency-handling)는 native addon을
  main에서 external로 유지하고 sandboxed preload에서는 의존성 externalization을 끄고 bundle하도록 설명한다.
- [Electron ESM 사양](https://www.electronjs.org/docs/latest/tutorial/esm)은 sandboxed preload의 ESM import를 지원하지 않는다.
  preload를 단일 CommonJS `.cjs` bundle로 만들고 공유 코드를 bundle하는 후보가 이에 맞는다.
  dynamic import/공유 chunk 문제를 해결하려고 sandbox를 끄지 않는다.
- electron-vite 6.0.0의 [태그된 설정 소스](https://github.com/alex8088/electron-vite/blob/v6.0.0/src/config.ts)에도
  `build.externalizeDeps`와 isolated entry 설명이 있다. 구현할 때 고정 버전의 타입과 대조한다.
- [Electron security](https://www.electronjs.org/docs/latest/tutorial/security)의 CSP·context isolation·
  Node integration 비활성화·sender 검증 원칙을 유지한다. 개발 HMR의 허용 범위를 배포 CSP로 복사하지 않는다.
  설치된 앱은 로컬 UI만 사용하고 원격 CDN에 의존하지 않아야 한다.

## builder 고정 버전과 Windows native 검증

[builder 공식 README](https://github.com/electron-userland/electron-builder/blob/master/README.md)는
`electron-builder install-app-deps`를 postinstall에 두는 native 재빌드 경로를 안내한다.
다만 main README는 이미 v27 설명을 포함하므로 그 문서만으로 v26의 모든 기본값을 단정하지 않는다.

[app-builder-lib 26.18.0](https://registry.npmjs.org/app-builder-lib/26.18.0)의 배포 tarball에서
`out/configuration.d.ts`와 `out/options/PlatformSpecificBuildOptions.d.ts`를 메모리로 읽어 다음을 확인했다.
파일을 디스크에 추출·설치·실행하지 않았다.

- `npmRebuild` 기본값 true.
- `nativeRebuilder`는 `legacy | sequential | parallel`, 기본값 sequential. 타입 주석은 @electron/rebuild 사용을 설명한다.
- `asar` 기본값 true. native module 자동 unpack 탐지와 명시적 `asarUnpack` 패턴을 설명한다.

계획에는 better-sqlite3 명시적 unpack과 패키지 안 `.node` 파일의 실재·로드 검증을 둬야 한다.
`npmRebuild: false`인 템플릿 예를 근거 없이 복사하지 않는다. 대상 Electron/OS/CPU의 prebuilt 존재는 미확인이다.
Windows 빌드 후보는 Windows runner에서 native 재빌드·패키징한다.
이는 개발 CI 실행 위치의 제안이며 제품의 지원 Windows 버전·CPU·서명 조건을 확정하지 않는다.
그 사용자 결정은 스테이지 7에 남겨둔다.

## Playwright와 실제 Windows 검증의 한계

[Playwright Electron API](https://playwright.dev/docs/api/class-electron)는 Electron 자동화를 experimental로 표시하고
v21+ 지원을 설명한다. `_electron`을 `playwright`에서 import하는 공식 예제가 있다.
inspection fuse를 비활성화한 배포물은 launch가 timeout될 수 있으며 native dialog는 일반 page dialog interception으로 가로채지 않는다.

따라서 Electron 45 지원 가능성의 문서 근거는 있으나 이 조합의 실행 성공은 보장하지 않는다.
jsdom bridge fake, 개발 Electron의 UI→IPC→SQLite, Windows 배포물의 실제 확인을 구분한다.
inspection 가능한 테스트 빌드의 성공을 최종 배포물 검증 성공으로 대체하지 않는다.

## 가상 렌더링 판단

거대한 논리 폭을 DOM 폭으로 두지 않고 보이는 날짜·행만 viewport 근처 좌표로 옮기는 안은
[승인된 시각화 계약](../design/visualization.md)에서 도출한 구현 판단이다.
추가 가상화 라이브러리 채택을 필수로 만드는 공식 API 제약은 확인되지 않았다.
직접 구간 계산·viewport rebasing·vertical window를 선택해도 포커스 유지·스크롤 전체 범위·
연월 직접 이동을 실제 브라우저에서 검증해야 한다. 라이브러리 미사용이 성능을 보장한다는 근거는 없다.

## 미검증

수행한 것은 HTTP 문서/메타데이터/타입 선언 읽기와 로컬 Node 버전·ABI 확인뿐이다.
의존성 해결, npm install/ci, TypeScript compile, Electron 실행, native rebuild, SQLite 테스트,
UI/E2E, Windows 패키지/설치/오프라인/업데이트는 모두 미실행이다.
