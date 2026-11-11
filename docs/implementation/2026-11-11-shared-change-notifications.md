# 공유 변경 알림 구현 기록

상태: 0.7.0 구현·로컬 전체 검증·최종 독립 검토 완료. 최종 커밋·원격 반영·CI 상태는 종료 메시지에서 확인한다. [승인 설계](../design/shared-change-notifications.md), [구현 계획](../superpowers/plans/2026-11-11-shared-change-notifications.md)을 따른다. 사용자는 Q13 설계 확정 후 별도 메시지로 구현을 요청했다. 자동 업데이트는 이번 범위에 포함하지 않는다.

## 구현 경계

호스트 commit→권한별 변경 기록→기존 polling→멤버 cache/inbox commit→Windows 알림의 순서다. 날짜 기반 알림을 대체하지 않는다. 외부 서비스·Windows 서비스·자동 앱 실행은 추가하지 않는다. 개인 자료 및 권한 밖 프로젝트는 알림에서도 제외한다.

## 진행 기록

- 저장 단계: 863f1ca, 검토 보정04bc18c. 업무/기록의 외부 트랜잭션, 권한 세대·불투명 cursor·30일 보관, 멤버 cache/inbox 및 수신 선호를 추가했다.
- 독립 검토가 신규 공유 응답 재수신 시 대기 알림 소실과 부분 권한 회수 안내의 실패 재시도 불가를 발견했다. 4개 회귀 RED→GREEN으로 보정했고 scoped 재검토에서 두 건 모두 해결을 확인했다.
- 이 단계 검증: native65/65, unit131/131, typecheck·diff 통과. 아직 통신·UI·전체 앱 검증 완료를 의미하지 않는다.

- 통신·전달 단계: 540ad07. 고정 TLS 변경 endpoint, 구버전404 호환, 수신 commit 이후 영속 선점·OS 전달, 멤버 수신 선호·명확한 실패 재시도·타입 지정 클릭 대상을 연결했다.
- 원본 이름 길이를 제한하지 않고 알림 표시만 정규화·축약했다. 긴 이름에서 공유 안내와 일정 변경 안내가 동일하게 잘리는 회귀를 발견하여 동작 설명 부분은 보존하도록 보정했다. 전송 이후 늦은 실패 응답과 OFF 중 완료된 클릭 권한 조회도 회귀 검사했다.
- 이 단계 검증: unit139/139, native70/70, typecheck, 실제 Electron 두 프로필 sharing/security E2E3/3 통과. 첫 E2E 실행은 DISPLAY 누락으로 창 생성에 실패했고 `DISPLAY=:92`로 재실행했다. Linux D-Bus 및 고의 해제한 IPC의 부정 검사 로그가 남으며 경고 없는 출력이라고 간주하지 않는다. Windows OS 전달은 이 결과에 포함하지 않는다.

- 통신·전달 독립 검토의 경미한 오류 안내 소실은20e593f로 보정했다. 같은 처리 중 발생한 오류를 유지하고 다음 정상 처리에서 해제하는 회귀5/5·typecheck 통과 후 scoped 재검토에서 해결을 확인했다.

- 화면 단계:8d37067. 멤버 전용 수신 스위치, 기준점·구버전 안내, 별도 실패/결과 불명 안내와 타입 지정 알림 이동을 추가했다. 전체UI154/154와 집중18/18·typecheck를 통과했으나 독립 검토에서 두 번의 조회 결과가 어긋날 때 오래된 일정으로 되돌아가는 경합을 발견했다. de76c03에서 마지막 조회를 기존 세대 검사·state 반영 경계로 옮겨 같은 자료로 화면과 편집기를 열게 보정했다. 집중UI45/45·typecheck가 통과했고 해당 테스트의 React async-act 경고도 해결했다.

- 최종 통합 확장에서 테스트의 Electron evaluate 콜백 인자 위치를 잘못 지정해 첫 실행이 timeout/worker 정리 실패했다. 테스트 도우미의 인자와 예외 전달을 수정했으며 제품 코드는 변경하지 않았다. 최종 통합 결과는 아래 검증 결과로 구분한다.

## 검증 범위

- 호스트 변경/기록 rollback, 여러 수정의 최종 요약, 최초 수신·재접속·30일 공백, 공유 대상 추가/회수·재공유·재승인.
- 멤버 수신/cache/inbox 원자성, 재시작/중복/unknown 정책, OFF→ON 기준점, 구버전 snapshot 호환과 손상 응답 거절.
- UI 수신 스위치·오류 안내·알림 클릭·미저장 보호·멤버 읽기 전용 및 두 격리 Electron 프로필 TLS 흐름.
- 전체 앱 검사·하네스·공백 검사와 실제 화면 확인. 통과 수·SHA·dirty 상태·시간·환경은 실행 결과로 갱신한다.

## Windows 실기 인수 항목

Linux의 가짜 OS sender 검증은 실제 Windows 배너·알림 센터 전달을 증명하지 않는다. 다음 항목은 실제 Windows PC에서 확인해야 한다.

1. 호스트/멤버 업데이트 후 정상 승인 연결, 멤버 설정 ‘공유 변경 알림’ ON 확인. 최초 공유 요약은 한 건인지 확인.
2. 호스트 일정 추가·이름/기간 변경·삭제·새 프로젝트 공유 후 멤버의 최신 화면과 Windows 알림을 확인. 다른 PC에만 공유한 프로젝트는 나오지 않아야 한다.
3. 멤버 트레이 상태에서 알림 클릭으로 창을 복원하고, 미저장 편집이 있으면 버리기 취소로 입력이 유지되는지 확인.
4. OFF 중 변경은 재활성화 후 소급하지 않아야 한다. 네트워크 재접속 시 프로젝트별 요약, 권한 회수 시 이름 없는 종료 안내와 캐시 제거를 확인.
5. Windows 알림 허용/방해 금지/잠금 화면 조건을 구분해 기록. 알림 표시 실패가 데이터 저장 실패로 안내되지 않아야 한다.

현재 실기 결과: **미검증**.


## 최종 자동 검증

검증 대상은 `de76c034f1b4b4697e23e9ed4f3310fd8c187fe6` + 당시 미커밋0.7.0 버전·설치 schema 기대값·통합 E2E 변경(dirty=true)이다. 문서 정리를 제외한 제품 코드는 이 실행 뒤 변경하지 않았다. Linux x64, Node24.22.1, Electron45.2.1, DISPLAY=:92, 격리 프로필과 Chromium sandbox를 사용했다.

`DISPLAY=:92 npm run verify:app`: 2026-11-11 09:40:09~09:45:44 UTC **7/7 PASS**.

| 검사 | 결과 |
| --- | --- |
| typecheck | 네 TS 프로젝트 PASS |
| release 정적 검사 | 15/15 |
| 시간대별 단위 검사 | 세 TZ 각각140/140 |
| UI | 155/155 |
| 제품 build | PASS |
| 실제 Electron/SQLite native | 70/70 |
| Electron E2E | 86/86, 192.7초, skip/flaky0 |

전체 E2E에는 두 실제 Electron 프로필의 pinned TLS, 신규 공유/이름 변경, 수동 수신 중복 억제, 재실행, 권한 회수, 수신OFF/ON 기준점, 날짜 알림 유지, OS 콜백에서 초안 취소·달력 모드 유지·읽기 전용 일정 이동이 포함된다. 최종 확장 단독 실행도2/2 통과했다. 로그의 Linux D-Bus·의도적으로 해제한 IPC 부정 검사·NO_COLOR/FORCE_COLOR 경고는 보존하며 Windows 검증 성공으로 해석하지 않는다.

전체 보고서는 `artifacts/app/latest.json`, 보존 복사본은 `artifacts/shared-change-notifications/verify-app.json`이다. native/E2E 결과도 같은 보존 폴더에 복사했다. 실제 화면은 `artifacts/e2e/output/sharing-two-isolated-Elect-03b03-arms-through-restart-revoke/`의 `dark-change-notification-settings.png`와 `dark-change-click-readonly-calendar.png`를 열어 확인했다. 작은 수신 스위치·설명·읽기 전용 일정·달력 모드의 표시와 배치가 확인되었다. `screenshots.json`에는 실행 SHA·dirty·프로필·실행 환경을 기록한다. 이 artifact는 로컬 실행 근거이며 Git 저장 파일은 아니다.

schema v5 설치 기대값과 제품 버전0.7.0을 갱신했다. Windows 설치·실제 배너·알림 센터·방해 금지·회사 LAN 실기는 이 Linux 실행에서 하지 않았으며 위 실기 인수 항목이 남는다.


`node scripts/harness/run.mjs verify`:7/7 PASS, `git diff --check`:PASS. 최종 독립 검토는 원자성·권한·재접속·전송 선점·알림 클릭·마이그레이션·구버전 호환을 대조해 Critical/Important0건으로 반영 가능 판정했다. 경미한 유지보수 사항은 inbox가 일부 안내 문구로 신규 공유 종류를 판별한다는 점이다. 현재 생산/소비가 공통 helper를 사용하고 긴 이름·본문 축약 회귀로 보호되며, 향후 메시지 종류 필드를 분리할 여지는 남긴다. 이 검토로 Windows 실기 미검증 상태가 바뀌지는 않는다.
