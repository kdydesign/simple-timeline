# 0.8.0 호스트 배포 기반 앱 업데이트

2026-11-11. [승인 설계](../design/lan-app-updates.md)의 Q1~Q20·전체 구현 승인을 따른다. 기존 MVP 지도 완료 상태·사용자 자료·프로필·appId·설치 경로와 서명 없는 비공개 배포를 유지한다. 실제 Windows11 인수와 CI 실행은 로컬 소스 검증과 구분한다.

## 구현

- CI는 EXE·blockmap·latest.yml·manifest·각 payload 해시를 한 묶음으로 생성한다. `Planrail-LAN-UPDATE-<SHA>` Actions artifact는 이를 루트에 담아 GitHub가 만든 ZIP을 그대로 가져올 수 있다. 중첩 ZIP과 그 체크섬은 넣지 않는다. 정식 버전·앱·소스·사용자별 x64 설치·파일 크기와 SHA256/SHA512를 검증하며 test-only 묶음·경로 별칭·symlink·불완전 ZIP을 거부한다. 파일 단위 검증 뒤 원자적으로 현재/후보 catalog에 등록한다.
- 호스트는 공유 설정의 업데이트 배포에서 ZIP을 등록한 뒤 별도로 배포 시작한다. 실행 중 호스트와 버전·소스가 같아야 하며 공유 서버가 중지 상태이면 공개할 수 없다. 후보 등록 실패는 기존 배포를 보존한다. 배포 중지는 파일 삭제와 구분하며 보관본을 다시 공개할 수 있다.
- 승인된 멤버는 기존 TLS SAN·인증서 pin·호스트 ID·IP·설치 자격 검사를 그대로 사용하는 독립 업데이트 경로에서 상태와 파일을 받는다. 파일 경로는 `/v1/updates/<releaseId>/<fileId>`다. 기존 동기화5초·JSON 크기 제한과 분리한 bounded 스트리밍을 사용한다. 멤버별1개·전체5개 스트림, 매 chunk 승인 재검사, 불완전 파일 정리와 취소를 적용했다.
- 연결·재연결과 연결 중5분마다 상태 확인하며 클릭 전 다운로드하지 않는다. 새 버전이 있으면 Planrail 옆 작은 UPDATE 버튼과 진행 팝오버를 표시한다. 팝오버 닫기·Escape는 다운로드를 취소하지 않는다. 오프라인 미다운로드는 비활성, 검증된 대기는 신원이 유지될 때 명시적으로 설치할 수 있다. 인증된 중지·교체·승인 변경은 이전 세대를 동기식으로 무효화하며 관측 revision은 신뢰별로 영속 보관한다.
- 설치 직전 renderer가 주요 편집창·빠른 알림·공유 주소와 참여자 입력·임시 날짜 입력을 확인한다. 모든 입력과 포털 이벤트를 동기식으로 차단한 뒤 진행 중 저장을 기다리며 dirty/알 수 없는 상태/실패한 저장은 대기한다. 해제·unmount 뒤 늦은 가드 응답은 승인하지 않는다. 이미 대기한 파일은 정리 후에도 자동 설치하지 않고 ‘설치 후 재시작’이 필요하다. 다운로드 진행 IPC는 작은 titlebar/settings 구독으로 제한해 간트 전체를 매 chunk 다시 렌더하지 않는다.
- main은 mutation barrier로 새 변경을 막고 수락한 변경·공유·알림·DB 종료를 기다린다. 설치 전 원본과 updater cache를 다시 검증한다. 일부 종료 후 실패하면 편집 차단을 유지하고 일반 종료·재실행을 안내한다. 일반 Exit는 설치하지 않는다. 재시작 후 같은 구버전이면 실패한 인계를 표시하고, 실제 목표 버전·기존 DB·renderer가 정상 시작했을 때만 성공과 cache 정리를 기록한다.
- pinned electron-updater6.8.11에 한시적127.0.0.1 capability feed를 제공한다. renderer에는 파일 경로·URL·자격·설치 옵션을 노출하지 않는다. updater 로그는 끄고 별도 runtime 디버그 URL/path는 공식 민감 필드 등록으로 redact한다. 직접 사용자별 spawn만 허용하며 관리자 승격 fallback·shell·설치 경로 강제 변경을 사용하지 않는다. NSIS는 같은 설치 경로 프로세스가 안전하게 종료되기를 최대30초 기다리며 force-kill하지 않는다.

## 검증과 증거

Task1·2의 독립 검토와 수정은 기능별 커밋으로 보존했다. Task2 최종 로컬 unit210개·release21개·typecheck·build·harness가 통과했고, 이후 Task3가 UI/릴리스 계약과 실제 Electron 통합 검사를 추가했다. 최종 통합 명령·수치는 아래 검증 결과와 세션 보고서를 따른다.

Task3 TDD는 UPDATE 역할·오프라인·진행·명시적 취소/재시도·dirty 보호·호스트 등록/공개 구분의 UI 테스트5개가 먼저 실패한 뒤 구현했다. 다운로드 IPC 진행 중 취소와 release 뒤 늦은 저장 완료 가드의 회귀를 추가해 실패→통과를 확인했다. 빠른 알림·날짜 draft·진행 저장 검사를 포함한 초기 UI9개가 통과했다. 최종 회귀에서 저장 오버레이의 imperative inert 정리가 설치 freeze를 제거하는 문제와 늦게 도착한 초기 상태 조회 실패가 최신 이벤트 상태를 가리는 문제도 실패→통과로 수정했다. update UI10개와 기존 공유 알림19개를 함께 실행해29개가 통과했다. 직접 가져오기 artifact 회귀는 전용 artifact 부재로 실패한 뒤 flat payload 설정으로 통과했다.

실제 Electron2개 임시 프로필의 pinned TLS/catalog/service/고정 preload IPC/renderer 가드/설치 coordinator 통합 테스트가 통과했다. 미저장 일정 보존 → 저장 후 명시적 설치 → 임시 SQLite 종료 → 제어된 installer 실패 → 구버전 재실행 시 대기·오류·자료 보존 → 호스트 배포 중지 반영을 검증했다. 실제 화면에서 legacy CSS가 UPDATE와 팝오버를 숨기는 두 문제를 재현해 수정했다. `artifacts/e2e/output/`의 `update-dirty-wait.png`는 Linux/Xvfb 화면 근거이며 Windows 배율·native 설치 화면 근거가 아니다.

Windows packaged 검사는 기존 수동 설치 lifecycle과 별도로 `packaged.update.spec.ts`·test-only harness를 준비했다. 정식 앱 ASAR에는 포함하지 않으며, 격리 Windows CI에서만 privileged main inspector로 정확한 production installer adapter를 불러 실제 updater loopback/cache/NSIS를 사용한다. synthetic next-version 설치 파일의 catalog 우회는 이 harness에만 있다. 실제 production bootstrap의 will-quit가 서비스·DB를 정리할 때 첫 이벤트를 취소하고, 이후 취소되지 않은 이벤트까지 기다린 뒤 검증·인계한다. 새 버전의 새로운 startup timestamp·UI 준비·새 프로세스·read-only SQLite 보존을 확인한다. 자동 재실행한 앱은 강제 종료하거나 열린 DB를 지우지 않고 일회성 VM 폐기에 맡긴다. 기존 full service/인증/dirty/재시작 경로와 Windows adapter/실제 설치 검증을 층별로 구분한다.

## 실행하지 않은 범위

이 Linux 개발 환경에서는 EXE/NSIS를 실행하지 않았다. 실제 Windows packaged updater 테스트는 **구현·타입/번들 검증만 완료, 실행 미검증**이다. 이후 Windows CI 결과도 Windows11 사용자 PC 인수와 별개다. 현재 사용자 권한·기본/사용자 지정/legacy 경로·CIM 가시성·보안 프로그램 잠금·설치 실패/자동 재실행·알림/설정/연결 자격 보존·사내망 장시간 전송·구버전 호환 실기는 미검증으로 남는다. 사용자 첫 도입에는 호스트와 멤버 모두0.8.0 이상 수동 설치가 필요하며,0.7.0에서 자동 bootstrap을 제공한다고 안내하지 않는다.

## 최종 검증 기록

최종 브랜치 검토의 I1·M1·M2를 한 차례 보정했다. renderer는 명시적 release와 main의 편집 차단 해제를 모두 확인해야 잠금을 푼다. cache 재검증·시도 기록 실패처럼 teardown 전 복구 가능한 오류는 편집을 재개하고, clean acknowledgment 뒤 이른 `editingBlocked:false`만으로는 해제하지 않는다. 일부 teardown 실패는 계속 차단한다. 취소는 선택한 publication을 동기식으로 유지하면서 전송만 무효화하며, 파일 정리를 기다리는 동안 관측한 배포 중지·교체·신뢰 변경을 뒤늦은 취소 완료가 덮어쓰지 않는다. catalog의 버전·소스 불일치는 형식화한 오류로 service에 전달해 기존 호스트 불일치 안내를 표시하고 거부한 공개 요청은 현재 배포를 보존한다.

이 보정은 기준 `66199045d2837c381536b82d197f446a175fcf50` + 수정 작업 트리, Linux x64·Node24.22.1에서 RED→GREEN을 확인했다. 실제 coordinator·service·renderer 가드를 연결한 cache/시도 기록 실패2개가 원본에서는 잠금을 유지해 실패했고, 수정 후 편집·inert가 복구됐다. 부분 teardown과 명시적 release 없는 조기 해제 방지도 통과했다. 취소 중 stage/ready 삭제를 지연한 배포 중지·교체·신뢰 변경4개, 호스트 버전·소스 불일치2개도 원본 실패→수정 통과를 확인했다. 최종 focused service/installer/catalog 단위67개·업데이트 UI14개·typecheck·저장소 하네스22개가 통과했다. 전체 `verify:app`은 이번 보정에서 재실행하지 않았으며 아래240초 aggregate 실패와 분할87개 결과를 대체하지 않는다. 정확한 최종 SHA의 전체 CI와 Windows 실기 검증은 후속 실행으로 남긴다.

최종 전체 실행은 Linux x64·Node24.22.1, HEAD `48256763d2d27281201033c096187808c5e60d81` + Task3 dirty tree에서 수행했다. 타입·release22·3개 시간대 각각 unit210·UI165·제품 build·native70은 통과했다. `verify:app`의 순차 Electron E2E는87개 중72개 통과 후 전체240초 제한으로 중단됐다. 새 update 테스트에 도달하기 전이며 개별 실패는 없었다. **전체 verify:app 통과로 기록하지 않는다.** 전체 제한과 개별 제한은 변경하지 않았다.

남은15개를 별도로 실행해14개가 통과했고 기존 sharing E2E의 `uncheck()`가 클릭 직후 상태를 요구해 실패했다. 공유 변경 알림 스위치는 영속 IPC 성공 뒤에만 checked 상태를 바꾼다. 기존 UI의 pending-save 계약 검사를 단독 실행해 이 동작을 확인했다. E2E를 클릭 → 화면 checked 상태 대기 → 기존 영속 상태 poll로 보정했으며, 실패를 감추는 retry나 시간 제한 완화는 추가하지 않았다. 최종 공유+업데이트3개가45.1초에 통과했다(공유36.8초, 손상 공유 메타데이터2.4초, 업데이트4.9초). 따라서87개 개별 경로는 분할 실행에서 통과 근거를 갖지만,240초 전체 실행은 통과하지 못했다. 전체 단일 실행 성공과 분할 경로 검증을 구분하고, 최종 SHA의 Windows/Linux CI는 후속 실행으로 남긴다. 중간 전체 검사에서 버전 상승 후 release 테스트의0.7.0 고정 기대값 실패를0.8.0으로 갱신했다. 다음 전체 UI 실행에서는 기존 `shared-change-notifications.test.tsx`의 “preserves new input typed while the accepted notification is still reading its target” 한 개가5000ms 제한으로 실패했다(나머지163개 통과). 해당 검사는 수정 없이 단독 실행과 관련29개 묶음 실행에서 통과했다. 제한·assertion을 완화하지 않았으며 최종 전체 실행 결과와 별도로 이 실패를 보존한다.

독립 검토는 기능별3회, 전체 브랜치 검토, 최종3건 보정 재검토를 마쳤다. 소스 최종 커밋 `903e87bd506e278e258e6e19bfb3a6083338fde5`에서 미해결 코드 지적은 없다. 최종 보정의 단위67개·UI14개·typecheck·harness22개가 통과했다. 이후 원격 CI 결과와 실제 Windows11 인수는 이 로컬 결과와 구분한다.

### Windows CI 공유 E2E의 좁은 화면 검사 보정

Windows CI에서 알림으로 일정 편집창을 연 뒤 배경 ‘달력’ 버튼을 찾던 기존 공유 검사가 실패했다. 기준 `24439a489ace18184dd300486cc931abe39c4638`에서 멤버 viewport만1024×768로 지정하고 원래 assertion을 유지해 Linux/Xvfb에서도 같은 실패를 재현했다(23.8초). 진단값은 `innerWidth=1024`, 편집창 `aria-modal=true`, 배경 도구막대 `inert=true`·`aria-hidden=true`였다.1100px 미만의 정상 모달 동작을 테스트가 비모달 화면처럼 조회한 것이 원인이다.

테스트만 보정했다. 알림·미저장 입력 보존·읽기 전용 검사는 유지하고, 좁은 모달과 접근성에서 제외된 배경을 명시적으로 확인한다. 편집창 캡처 뒤 정상 ‘편집 닫기’로 닫은 다음 기존 달력 모드·전체 필터의 `aria-pressed=true` assertion을 수행한다. 숨은 컨트롤 클릭·강제 클릭·재시도·timeout 완화·제품 코드 변경은 없다. 이 좁은 viewport 경로를 모든 플랫폼에서 실행해 회귀를 방지한다. focused 공유 E2E2개가35.5초에 통과했다(32.6초·1.8초). 이 보정의 Windows CI 재실행과 패키지 설치 결과는 별도 확인하며 Linux 재현을 Windows 실기 인수로 확대하지 않는다.
