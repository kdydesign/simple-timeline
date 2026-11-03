# 스테이지 2 — Electron·SQLite 구조 설계

id: 02-architecture
parent: ../MAP.md
labels: wayfinder:grilling
status: open
assignee: null
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

아직 해결하지 않음. 완료 시 사용자 승인 내용·결과·근거·산출물 링크를 여기에 기록한다.
결정의 상세는 산출물 한 곳에 두고 여기에는 요약과 링크만 남긴다.

## 다음 채팅

```text
https://github.com/kdydesign/simple-timeline
Superpowers와 Wayfinder로 스테이지 3을 진행해줘.
최신 main에서 README.md, docs/wayfinder/MAP.md, docs/wayfinder/STATUS.md,
docs/superpowers/specs/2026-11-03-simple-timeline-design.md,
docs/wayfinder/handoffs/02-architecture.md,
docs/wayfinder/stages/03-experience.md와 해당 문서의 선행 산출물을 먼저 읽어줘.
선행 단계 완료와 승인을 확인하고 이 스테이지만 진행해줘.
확정한 사항은 다시 묻지 말고, 결과·검증·미결정 사항·다음 채팅 문구를
저장소에 남기고 최신 커밋을 알려줘.
```
