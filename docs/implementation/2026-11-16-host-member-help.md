# 0.8.2 호스트·멤버 도움말

2026-11-16. [승인 설계](../design/host-member-help.md)의 H1~H8 이후 사용자가 별도로 구현을 요청했다. 기준 소스 `c214891661caafd790a09fde6bbba3c7486769a8`. 기존 MVP 단계는 완료로 유지하고 당시 알림 제어·접속 멤버 표시 설계는 구현 보류였다. 이후 사용자의 순차 구현 요청과 도움말 CI 성공 후 [0.8.3 후속](2026-11-16-notification-controls-and-presence.md)에서 진행한다.

## 구현 범위

- 최상단 최소화 바로 왼쪽 물음표. 읽기 전용 도움말 창 하나를 기본1120×800, 모니터 작업 영역 안에 생성한다. 다시 누르면 기존 창을 앞으로 가져온다.
- 별도 renderer/preload, sandbox·contextIsolation 유지. 도움말 IPC는 해당 창·메인 프레임·고정 전체 URL을 검사한다. 주 창 데이터·공유·업데이트 API를 노출하지 않으며 외부 탐색·새 창·권한 요청을 막는다.
- 오프라인 한국어14개 항목: 시작하기, 호스트 사용법, 멤버 사용법, 문제 해결. 제목·본문 검색, 일치 문맥·결과 없음·검색 지우기, 관련 항목 이동. 역할별 첫 화면과 실행 중 마지막 항목·검색어·본문 위치를 기억한다.
- 실제 앱의 격리 테스트 프로필에서 촬영한8개 이미지, 번호 강조·대체 설명, 관계 그림. 이미지 확대/축소50~300%, 화면 맞춤, 휠·드래그·방향키 이동, Escape 닫기·포커스 복귀. 누락 이미지도 본문 설명은 읽을 수 있다.
- 창별 최소화는 독립. 주 창 트레이 숨김·복원에 연동하되 이미 닫힌 도움말을 새로 열지 않는다. 종료 확인 취소는 두 창과 주 창 입력을 보존하고, 종료/설치 확정 때 도움말도 닫는다. 도움말 검색은 설치를 막는 미저장 입력이 아니다.
- 별도 도움말 진입점을 지연 로딩한다. 빌드에서 항목ID·관련 링크·이미지 경로·버전 메타데이터를 검증한다. `package.json`/lockfile을0.8.2로 맞췄으며 의존성·DB 스키마·공유 프로토콜 변경은 없다.

## 주요 코드와 자산

- [창 관리](../../src/main/help-window.ts), [bootstrap 연동](../../src/main/bootstrap.ts), [전용 API](../../src/shared/help.ts), [전용 preload](../../src/preload/help.ts).
- [콘텐츠](../../src/shared/help-content.ts), [도움말 UI](../../src/renderer/help/HelpApp.tsx), [이미지 보기](../../src/renderer/help/ImageViewer.tsx), [스타일](../../src/renderer/help/help.css), [촬영 근거](../../src/renderer/help/images/capture.json).
- [구현 계획과 기록](../superpowers/plans/2026-11-16-host-member-help.md). 입력·단계별 절차는 기존 [사용 안내](../release/user-guide.md)와 대조했다.

촬영은 실제 renderer와 격리 SQLite·테스트 전송 계층을 사용한다. 참여자/주소 입력은 가상 IP192.168.0.10/.20, 실제 동기화 테스트는 두 격리 프로필의 loopback TLS다. 후자의 주소/인증 정보를 이미지에 넣지 않는다. 업데이트 예시는 실행할 수 없는 가상0.9.0 패키지이며 실제 설치하지 않는다. 최초6개 이미지의 앱 버전은0.8.1이고 제품 UI 변경 없이 버전만0.8.2로 올렸으며 주소 화면2개는0.8.2로 촬영했다. 두 촬영 범위는 메타데이터에 구분했다.

## 검토·보정

독립 전체 검토에서 치명적 문제는 없었고 중요한 트레이 생명주기 문제3건을 수정했다. 늦게 로드된 도움말은 비활성 표시로 주 창 포커스를 보존하며, 트레이 복원 요청은 한 번만 소비한다. 숨김 상태의 도움말 오류는 다음 명시적 열기 때 안내한다. 두 재현 단위 테스트에서 실패를 확인한 뒤 통과시켰다.

실제 Electron 재열기 검사는 이미지가 로드되기 전 읽기 위치가 작은 값으로 제한되는 문제를 발견했다. PNG 원본 크기를 명시해 처음부터 이미지 공간을 확보하고 동일 테스트를 통과시켰다. UI의 포커스 복귀는 animation frame 이후이므로 테스트도 실제 복귀를 기다린다.

빌드의 다중 preload 진입점은 각각 독립 번들로 생성한다. Node로 Vite 설정을 읽는 기존 release 검사도 유지하도록 설정의 TS 확장자 import를 명시했다. 제품 preload에서 로컬 분할 모듈 require는 생기지 않는다.

현재 목차 항목을 재선택할 때 화면과 저장된 스크롤 위치가 달라지는 검토 의견은 읽기 위치 보존 계약에 영향을 주므로 수정 대상으로 재분류했다. 별도 UI 재현 테스트가 실패하는 것을 확인한 뒤 현재 항목 재선택도 화면과 저장 위치를 함께 상단으로 맞췄다. 알려진 검토 잔여 결함은 없다.

전체 검사에서 기존 ASAR 패키지 테스트가 미완료 임시 파일을 읽는 간헐적 실패를 발견했다. 고정된 `@electron/asar`의 `createPackageWithOptions`가 파일 쓰기 스트림의 완료 전에 반환하는 것을 확인하고, 테스트 fixture에서 `finished(archiveStream)`을 기다리도록 보정했다. 제품 패키지 검사와 실패 조건은 그대로 유지한다.

## 검증

Linux x64·Node24.22.1·Electron45.2.1, Xvfb와 sandbox를 유지한 환경에서 `npm run verify:app`의7개 검사 모두 통과했다. 기준 SHA `c214891661caafd790a09fde6bbba3c7486769a8` 위 작업 트리(dirty=true)의 결과이며 Windows 설치본 검사와는 구분한다.

- 타입 검사, release26개, 3개 시간대 각각 단위243개, UI173개, 제품 빌드, native70개, 실제 Electron E2E99개 통과.
- 도움말 관련 단위8개·UI4개, 두 창 lifecycle2개, 가상 화면/멤버 역할 검사가 포함된다. 기본/좁은 도움말 화면도 직접 확인했다. E2E 테스트 실행기의 버전 표시는0.0이며 제품은 패키지의 실제 버전을 사용한다.
- 전체 검사의 release 단계 이후 보정한 ASAR fixture는 `npm run test:release`를 별도로 재실행해26개 통과를 확인했다. 다른 제품 코드는 전체 검사 후 변경하지 않았다.
- `node scripts/harness/run.mjs verify`, `git diff --check` 통과. 설계·계획·구현 기록의 상대 링크21개 모두 존재한다.
- 로그: `artifacts/help-implementation/`, 전체 보고서: `artifacts/app/latest.json`, 실제 화면: `artifacts/help-implementation/help-host.png`, `help-compact.png`.

실제 Windows의100/150/200% 배율·다중 모니터·Narrator·도움말을 연 상태의 설치 종료, 회사 PC 시작 시간은 미검증이다. Linux Electron 검사를 Windows 실기 인수로 간주하지 않는다.

## Windows CI 촬영 테스트 경합 보정

`eadf5e4`의 [Application 실행](https://github.com/kdydesign/simple-timeline/actions/runs/43793211986)은 Linux 전체 통과, Windows는 제품 build/native까지 통과했으나 E2E99개 중 도움말 업데이트 화면 촬영1개가 실패해 설치본 생성이 생략됐다.

원인은 촬영 fixture가 IPC handler만 교체하고 bootstrap 업데이트 서비스의 상태 발신을 남겨 둔 것이다. Windows에서 기존 서비스의 늦은 상태가 촬영용 배포 상태를 덮어 `배포 중지`가 비활성화됐다. 실제 renderer의 revision 역행 방지는 유지한다.

bootstrap에 기존 업데이트 서비스 생성 함수를 기본값으로 하는 주입점을 두고, 테스트 진입점에서만 원래 발신을 차단하고 서비스를 dispose한 뒤 fixture를 연결한다. 촬영 전 renderer 재로드로 교체 전 revision 구독도 초기화한다. 폐기한 발신자의 늦은 실제 상태를 명시적으로 전달하는 회귀 시나리오가 로컬에서 동일하게 실패한 뒤 수정 후 통과했다. 기존 실제 업데이트 IPC 시나리오도 통과했다. 로그: `artifacts/help-ci-fix/red.log`, `green.log`. 제품 업데이트 서비스·보안·설치 정책은 변경하지 않았다.

보정 작업 트리의 `verify:app`7개 검사 모두 통과(typecheck/release26/단위243×3TZ/UI173/build/native70/E2E99). 하네스·diff 검사 통과. Windows 재검증은 수정 커밋의 CI 결과를 따른다.

최종 확인: `bfb7887`의 [Application 43800500478](https://github.com/kdydesign/simple-timeline/actions/runs/43800500478)에서 Linux·Windows 전체 앱 검사, Windows 정식 설치본 생성, 실제 NSIS 수명주기 검사와 배포 산출물 업로드가 모두 성공했다. 최초 Windows 실패는 해결됐으며 회사 PC의 배율·다중 모니터·Narrator 확인은 여전히 별도다.
