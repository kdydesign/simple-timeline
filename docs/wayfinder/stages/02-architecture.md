# 스테이지 2 — Electron·SQLite 구조 설계

id: 02-architecture
parent: ../MAP.md
labels: wayfinder:grilling
status: closed
assignee: codex-2026-11-03-stage-02
blocked_by: 01-domain

## Question

오프라인 저장과 Electron 프로세스 경계를 어떤 계약으로 구현할지 확정한다.

## 선행 조건

직전 스테이지 완료·사용자 승인·인수인계 커밋이 필요하다.
설계 단계다. 앱 스캐폴딩·의존성 설치·제품 코드 작성은 하지 않는다.

## 논의 또는 수행 범위

- main/preload/renderer 책임, 제한된 IPC 목록·입력·반환·오류 계약
- SQLite 드라이버의 Electron ABI 및 Windows 패키징 호환성
- 테이블·관계·참여자 저장 형식·날짜 제약·외래 키·연쇄 삭제 트랜잭션
- 사용자별 DB 경로, 마이그레이션, 재실행·업데이트 시 보존, 단일 인스턴스 정책
- 저장 실패·DB 초기화 실패·손상 시 데이터 보존과 사용자 안내
- 수동 백업·복원 MVP 포함 여부와 포함하지 않을 때의 한계

## 산출물

- docs/design/architecture.md: 프로세스·IPC·오류 계약
- docs/design/storage.md: 스키마·마이그레이션·DB 수명주기

## 완료 기준

- React가 SQLite나 임의 파일 접근 권한을 갖지 않는다.
- 프로젝트 삭제와 하위 일정 삭제는 부분 성공 없이 처리한다.
- DB 위치·실패 처리·업데이트 보존 방침을 확정한다.
- 미확인 호환성은 공식 자료 또는 작은 검증으로 확인하고 출처·결과를 남긴다.
- docs/wayfinder/handoffs/02-architecture.md에 인수인계를 작성한다.
- STATUS.md와 이 문서의 상태를 갱신하고 GitHub에서 확인 가능한 커밋을 남긴다.

## 해결 기록

2026-11-03 사용자와 구조·저장 방침을 결정하고 작성한 설계 전체를 승인받았다.
[프로세스·IPC 계약](../../design/architecture.md), [SQLite 저장 설계](../../design/storage.md),
[공식 자료 조사](../../research/2026-11-03-electron-sqlite.md)를 남겼다.
main 소유·사용자별 DB 보존·단일 인스턴스·실패 시 원본 보존을 선택했고 수동 백업·복원은 MVP에서 제외했다.
결정 상세·검증 한계·다음 단계는 [인수인계](../handoffs/02-architecture.md)를 따른다.
제품 구현과 스테이지 3 이후는 시작하지 않았다. 검증 후 main 직접 commit·push로 반영한다.

## 다음 채팅

```text
저장소: https://github.com/kdydesign/simple-timeline
Superpowers와 Wayfinder로 스테이지 3만 진행해줘.
최신 main의 AGENTS.md를 읽고 node scripts/harness/run.mjs context 03-experience
결과의 문서와 docs/wayfinder/handoffs/02-architecture.md,
docs/design/domain-rules.md, docs/design/architecture.md, docs/design/storage.md를 확인해줘.
승인된 요구사항·도메인·저장 구조는 다시 묻지 마.
화면·간트·달력 설계만 나와 확정하고 앱 구현은 시작하지 마.
완료하면 검증 후 PR 없이 main에 직접 커밋·push하고,
다음 채팅용 인수인계와 최종 커밋을 알려줘.
```
