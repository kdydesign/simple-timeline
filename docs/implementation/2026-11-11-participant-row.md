# 0.6.10 참여자 한 줄 배치

## 범위와 변경

사용자가 요청한 이름·IP·수정·승인 취소·삭제의 한 줄 배치와 승인 배지를 반영했다. [화면 기준](../design/forest-crystal.md)의 기존 재질을 재사용하고, 상태는 승인/승인 대기/승인 취소로 구분한다. 입력별 오류·placeholder·미저장 보호와 삭제 확인, 서버 권한·데이터 구조는 유지한다. 신규 공유 변경 알림은 이번 제품 변경에서 제외하며 별도 설계한다.

## 검증

기준 HEAD 58b0776c8646cec8ccf71aeccb5ccbc310613019 + 이번 변경 dirty. Linux x64, Node24.22.1, Electron45.2.1, 격리 프로필과 sandbox 유지.

- 실제 Electron 참여자 흐름 1개 통과(5.0초). 기존 검증·삭제·알림 컨트롤 흐름 포함. 최초 실행은 이전 DISPLAY=:93의 X 서버가 없어 실패했고, Xorg :92 준비 후 통과했다.
- `artifacts/participant-row/participants.png`: 이름/IP·배지·작업 버튼이 한 줄이고 신규 등록 영역이 구분되는 것을 직접 확인했다.
- 첫 전체 검증은 앞6단계 통과, Electron85/86 통과 후 기존 공유 시나리오의 `settings(host)`에서 실패했다. `electronApplication.evaluate`로 들어온 `openSharingSettings`가 better-sqlite3 `findCredential`의 `rowFactory` 호출 중 DB를 재진입하여 `This database connection is busy executing a query`를 발생시킨 스택을 확보했다. 실패 증거는 `artifacts/participant-row/verify-first.json`, `e2e-first.log`에 보존한다.
- 제품 변경 없이 해당 공유 파일 단독 실행은2개 모두 통과(25.1초). 테스트 도구의 직접 main 호출을 `setImmediate`로 정상 이벤트 루프에 예약하도록 `tests/e2e/sharing-fixture.ts`를 보정했다. 제품 DB/네트워크 코드, 테스트 제한·assertion·sandbox는 변경하지 않았다. `sharing-isolated.log`는 보정 전 단독 실행 기록이다.
- 보정 후 `DISPLAY=:92 npm run verify:app`: **7/7 통과**. UTC 2026-11-11T07:55:57.674Z ~ 2026-11-11T08:01:20.262Z. 타입·release15·unit118×3TZ·UI136·build·native44·Electron86. 제품 코드와 테스트 helper는 이 실행 이후 변경하지 않았다.
- 최종 보고서는 `artifacts/participant-row/verified-app.json`, 로그는 `verify-app-second.log`. 하네스7종과 `git diff --check`도 통과했다. 실패 실행과 최종 통과를 구분해 보존한다.
- 실제 Windows 설치·150% 배율·회사망은 이번 실행에서 미검증이다. Linux 화면을 Windows 실기로 간주하지 않는다.
