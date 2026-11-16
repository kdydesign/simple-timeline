# 0.8.3 알림 제어·접속 멤버 구현

사용자는 도움말 빌드 실패를 먼저 해결하고 도움말 완료 후 이 승인 설계를 구현하도록 요청했다. [승인 설계](../design/notification-controls-and-member-presence.md) Q1~Q9를 따른다. 로컬 전체 검증과 독립 검토를 완료했으며 실제 Windows 사용자 PC 인수와 자동 검증을 구분한다.

## 선행 도움말 완료

0.8.2의 실패는 제품 빌드가 아니라 Windows 도움말 업데이트 화면 E2E의 두 updater 발신 경합이었다. bfb78873b57455c9969da2f7cc265d3e4ee4c6c9에서 fixture 교체 시 기존 발신을 차단·종료하고 renderer 구독을 다시 시작했다. [Application 43800500478](https://github.com/kdydesign/simple-timeline/actions/runs/43800500478)은 Linux·Windows 앱 검사 및 실제 설치 lifecycle/산출물 업로드까지 성공했다.

## 변경

- SQLite migration6: 전역 무음 설정·변경 세대·재개 기준과 업데이트 알림 처리 이력을 보존한다. 기존 날짜 알림 이력에는 억제 flag를 추가하며 DB 실패를 기본값으로 대체하지 않는다.
- main은 저장된 전역 무음과 개별 설정을 함께 검사한다. 개인 날짜 후보는 무음 전환과 같은 transaction으로 정리하고 공유 캐시/변경 cursor는 계속 수신한다. 해제 후 첫 정상 수신까지의 소급 알림을 억제한다.
- 업데이트는 인증·검증한 최신 배포 조회 후 hostId/정식 버전의 durable 시도 기록을 먼저 남기고 Windows에 요청한다. 실패/결과 불명은 자동 재전송하지 않는다. 알림 클릭은 최신 상태를 조회한 뒤 token으로 팝오버만 열며 모달과 초안을 보호한다.
- 호스트 presence는 인증된200/304 응답 완료 callback에서 세대·권한을 재확인한다. 프로세스 메모리의 monotonic10초와 표시용 현지 시각을 분리한다. 승인 취소·삭제·IP 변경·중지·절전 시 무효화한다.
- 트레이는 자동 실행 상태를 비동기 사전 조회하고 우클릭 시 최신 조회 완료 후1회 표시한다. 중복 조회와 토글은 직렬화하며10초 실패 시 확인 불가 안내와 Open/Exit를 유지한다. 전체 무음 항목은 자동 실행 아래에 둔다.
- 도움말은 실제 제공되는 새 동작을 설명한다. 기존 MVP 단계 상태는 바꾸지 않는다.

## 검증

진행 로그: `artifacts/notification-controls/` (ignored). RED→GREEN: 실제 무음 중 공유 inbox 누적, 잘못된 트레이 즉시 메뉴 표시를 재현 후 보정했다. 정책/업데이트 모듈·presence 테스트를 추가했다. 최종 통합 결과는 아래와 같다.

미검증: 회사 PC의 실제 Windows 배너·알림 센터 클릭·방해 금지/보안 정책과 여러 실제 PC의 접속 상태. Linux의 격리 SQLite·인증 TLS·모의 native sender 결과를 Windows 사용자 인수로 확대하지 않는다.


## 최종 검토에서 보정한 경합

독립 검토의 Important2건은 재현 테스트 후 보정했다. UPDATE가 보이는 상태에서 팝오버를 닫아도 알림 이력 저장 오류를 표시하며, 실제 Electron에서 기존 `.brand span` 숨김 규칙까지 제거되는지 확인했다. 무음 해제 시 이전 세대의 업데이트 조회가 진행 중이면 그 완료 뒤 현재 세대 조회를1회 직렬 예약한다. 이전 응답을 새 기준으로 오인하거나 다음5분 확인까지 불필요하게 기다리지 않는다.

Minor1건은 기능에 영향을 주지 않는 접속 문구다. 실제 화면은 ‘연결 N대’, ‘아직 없음’을 사용하고 설계의 ‘연결된 멤버 N명’, ‘확인 기록 없음’으로의 문구 통일은 보류했다.

## Windows 사용자 확인 순서

1. 멤버도0.8.3 이상으로 올린다. 호스트만 업데이트하면 구버전 멤버에 새 알림/무음 메뉴가 생기지는 않는다.
2. 호스트 공유 설정에서 승인과 연결 배지를 구분한다. 멤버를 Exit로 완전히 종료하면 마지막 정상 통신 후10초 초과, 늦어도 다음1초 만료 검사에서 연결 수가 줄어드는지 확인한다. 트레이로 숨긴 멤버는 계속 연결 중이다.
3. 트레이 전체 알림 끄기를 체크하고 개인 날짜/공유 변경/새 업데이트 알림은 멈추지만 자료 수신·UPDATE는 유지되는지 확인한다. 다시 켠 뒤 과거 알림이 쌓여 나오지 않는지 확인한다.
4. 멤버보다 높은 정식 버전이 배포됐을 때 업데이트 Windows 알림을 클릭한다. 초안과 열린 확인창은 유지되고 안내만 열려야 하며 다운로드는 명시적으로 누른다. 같은 버전은 재실행/재배포로 반복하지 않는다.
5. Windows 시작 시 자동 실행의 실제 ON/OFF와 트레이 최초 체크를 대조한다. Windows에서 사용 중지한 상태도 존중한다. OS 배너/방해 금지/트레이 실기는 CI 성공만으로 통과 처리하지 않는다.


## 최종 로컬 결과

- `npm run verify:app`:7/7 통과. 타입·릴리스26·단위249×3시간대(UTC/America/Los_Angeles/Asia/Seoul)·UI176·제품 build·native78·Electron E2E99.
- 중요 검토2건은 각각 RED→GREEN 뒤 전체 suite를 재실행했다. 실제 Electron 오류 visibility도 재현 후 통과했다. 모의 updater·격리 TLS·SQLite 경계와 실제 화면 검증을 결합했다.
- `node scripts/harness/run.mjs verify`, `git diff --check`, 변경 문서 상대 경로 검사 통과. 작업 기준은 `bfb78873b57455c9969da2f7cc265d3e4ee4c6c9`+dirty이며 검증 보고서는 `artifacts/app/latest.json` 및 `artifacts/notification-controls/`에 있다.
- 새 버전0.8.3, 의존성/배포 정책 변경 없음. 일반 main commit/push 후 Windows/Linux CI와 설치본 생성의 최종 SHA·실행 URL은 종료 보고를 따른다. 회사 PC 실기는 위 별도 순서로 확인한다.
## Windows 설치 검사 후속 보정

- `1d499c7`의 Application run `43806292273`에서 Linux·Windows 앱 전체 검사와 설치본 생성은 통과했다. Windows 패키지 검사 3개 중 실제 0.8.0 수동 설치와 자동 업데이터 검사는 통과했고, 기존 Simple Timeline 업그레이드 검사는 DB 스키마 기대값 `5`와 실제 `6`의 불일치로 중단됐다.
- 원인은 `tests/e2e/packaged.spec.ts`의 이전 버전 고정값 누락이다. 현재 migration의 마지막 version과 설치된 DB 헤더의 실제 version을 비교하고, 검증 기록에는 실제 읽은 값을 남기도록 수정했다. 데이터·마이그레이션 코드는 변경하지 않았다. 기존 데이터 비교·오프라인·제거 후 보존 검사는 유지하며 새 커밋의 Windows CI에서 전체 시나리오를 다시 실행한다.
- 후속 로컬 검증: typecheck, Playwright packaged 테스트3개 로딩, native78/78 통과. Windows 실제 설치는 새 커밋 CI에서 재검증한다.
