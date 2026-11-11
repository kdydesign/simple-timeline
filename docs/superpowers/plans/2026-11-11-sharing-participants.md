# 참여자 관리·알림 컨트롤 구현 계획

> 실행: Superpowers executing-plans로 현재 세션에서 순차 구현한다.

**Goal:** 참여자 이름/IP 입력 오류와 삭제 누락을 해결하고 알림 컨트롤을 작게 세로 정렬한다.
**Architecture:** React 필드 검증과 main 검증을 함께 유지한다. 호스트 전용 deleteDevice는 SQLite transaction으로 승인·모든 ACL을 회수하고 목록에서 제거한다. 이전 승인 자격을 회수로 인식할 최소 내부 기록은 논리 삭제로 보존한다.
**Tech Stack:** 기존 Electron·React·SQLite·Radix Switch. 의존성 추가 없음.
**Spec:** 사용자 5개 요청과 후속 ‘공유 권한도 제거·확인 후 삭제’ 확정. [공유 기준](../../design/lan-project-sharing.md)의 프로젝트/일정 보존·회수 계약을 유지한다.

## 제약·선택

- 호스트만 참여자를 삭제한다. 승인 취소는 기존 등록 정보를 남긴다. 삭제는 영향 프로젝트와 확인창을 거치며 전체 프로젝트/일정을 지우지 않는다.
- 삭제를 승인 취소된 PC에만 제한하는 대안 대신 승인 여부와 관계없이 삭제·회수를 한 transaction으로 처리한다(사용자 선택).
- 이름 placeholder, IPv4 형식·활성 IP 중복 오류는 해당 필드 하단에 표시한다. 기존 도메인 검증을 재사용한다.
- 등록 항목은 이름/IP 입력 → 상태·작업 행, 신규 입력은 구분선과 추가 여백으로 분리한다. 기존 딥 그레이/스틸 블루 토큰·13px 글꼴을 유지한다.
- 알림만 32×18px 스위치·12px thumb, 종 아이콘 → 스위치 → 텍스트 순서의 2행으로 한다. 공유 설정 스위치 크기는 유지한다.

## 검토 중점

삭제 실패 rollback, 재시작 후 숨김/재등록, 삭제 후 구 자격의 회수 응답, 잘못된 IP/중복 IP의 필드 오류, 빠른 알림·편집 양쪽 키보드 조작을 확인한다.

## 작업

- [x] 1. UI 오류/삭제 확인, native 삭제·rollback·역할 경계 테스트를 먼저 추가하고 실패를 확인한다.
- [x] 2. sharing store/migrations/service/ipc/preload/shared API에 deleteDevice를 연결한다. 삭제된 행은 listDevices에서 제외하고 revoked 인증 기록을 보존한다. 대기 승인도 제거한다.
- [x] 3. DeviceForm을 별도 컴포넌트로 분리해 필드 오류·접근성 연결·placeholder·삭제 동작·간격을 적용한다. ReminderFields/CSS의 알림 스위치만 축소한다.
- [x] 4. UI/native/Electron 실제 화면을 확인하고 verify:app·harness verify를 순차 실행한다.
- [x] 5. 기존 설계·사용 안내와 실행 기록을 보정하고 요청 변경만 main에 커밋·push한다.
