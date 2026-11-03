# 스테이지 7 — Windows 설치·오프라인 검증

id: 07-windows-release
parent: ../MAP.md
labels: wayfinder:task
status: in_progress
assignee: codex-stage07
blocked_by: 06-visualizations

## Question

Windows에 설치한 앱이 인터넷 없이 동작하고 사용자 데이터를 보존하는가?

## 선행 조건

직전 스테이지 완료·사용자 승인·인수인계 커밋이 필요하다.
승인된 구현 계획과 이번 채팅의 구현 요청을 확인하고 착수한다. Wayfinder 지도 Notes의 실행 예외를 따른다.

## 논의 또는 수행 범위

- Windows 지원 버전·CPU·설치 범위·배포 및 코드 서명 조건 확정
- 네이티브 SQLite 모듈 포함 설치 파일 생성, Windows 빌드 절차와 unpacked 실행 검증
- 최초 CI의 Windows x64 빌드 축을 최종 사용자 지원 범위로 오인하지 않음
- 설치→최초 실행→CRUD→두 모드→종료/재실행을 네트워크 없이 검증
- 업데이트/재설치 시 보존, 제거 시 데이터 정책을 설계에 맞춰 검증
- 클라우드 에이전트가 Windows를 실행할 수 없으면 실제 사용자 확인을 요청하고 결과 대기

## 구현 계획 연결

[스테이지 4 구현 계획](../../superpowers/plans/2026-11-03-simple-timeline-implementation.md)의 **Task 9**가 이 단계 범위다.
계획은 스테이지 4에서 사용자 전체 승인을 받았다. 이번 채팅의 해당 단계 실행 요청을 확인한 뒤 착수한다.
계획의 파일·인터페이스·검증 명령·종료 경계를 따른다.
명령과 자동 검증 코드를 구현했다. 실제 Windows CI·Windows 11 실기 결과는 검증 문서에서 실행/미실행을 구분한다.

## 산출물

- 설치 파일 또는 이를 재현하는 Windows 빌드 절차와 CI 설정
- docs/release/windows-validation.md: 실제 환경·버전·결과
- docs/release/user-guide.md: 설치·저장 위치·기본 사용법

## 완료 기준

- Windows 설치본에서 오프라인 핵심 시나리오가 실제 통과한다.
- 재실행·업데이트의 데이터 보존을 확인한다.
- 미실행 항목이 남으면 완료 처리하지 않고 blocked로 기록한다.
- 전체 MVP 완료 기준과 결과를 대조한다.
- docs/wayfinder/handoffs/07-windows-release.md에 인수인계를 작성한다.
- STATUS.md와 이 문서의 상태를 갱신하고 GitHub에서 확인 가능한 커밋을 남긴다.

## 해결 기록

아직 해결하지 않음. 완료 시 사용자 승인 내용·결과·근거·산출물 링크를 여기에 기록한다.
결정의 상세는 산출물 한 곳에 두고 여기에는 요약과 링크만 남긴다.

## 다음 채팅

Windows MVP 결과를 사용자와 확인하고 종료한다. Teams는 별도 설계 요청을 받아 새 지도로 시작한다.
