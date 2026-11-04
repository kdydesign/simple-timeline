# 스테이지 7 — Windows 설치·오프라인 검증

id: 07-windows-release
parent: ../MAP.md
labels: wayfinder:task
status: closed
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

- 이번 MVP 사용자 인수는 기본 설치·실행·업데이트·제거·재설치와 데이터 보존 확인이다.
- Windows Server CI의 실제 설치·오프라인·업데이트·제거 보존 근거와 사용자 PC 결과를 구분한다.
- 2026-11-04 사용자 결정에 따라 상세 오프라인·사용성·접근성·물리 오류 검증은 별도 후속 작업으로 옮긴다.
  미실행을 통과로 간주하지 않으며 그 항목은 이번 인수의 차단 조건에서 제외한다.
- 전체 MVP 완료 기준과 결과를 대조한다.
- docs/wayfinder/handoffs/07-windows-release.md에 인수인계를 작성한다.
- STATUS.md와 이 문서의 상태를 갱신하고 GitHub에서 확인 가능한 커밋을 남긴다.

## 해결 기록

Windows 11 x64·사용자별 설치·제거 후 DB 보존·서명 없는 비공개 CI 배포는 사용자 확정이다.
소스 `036ee00`의 Windows Server CI에서 실제 NSIS 설치·오프라인 수정/삭제·재실행·업데이트·제거/재설치 보존과
두 OS 앱 회귀를 통과했다. 사용자는 2026-11-04 해시 일치·관리자 요청/보안 경고 없는 설치/실행,
업데이트와 제거 후 재설치의 데이터 보존·정상 제거를 보고했다.
상세 개선·오류 사항은 별도로 진행하겠다는 사용자 결정에 따라 이번 MVP 인수 범위로 완료한다.
정확한 사용자 관측·범위 조정·미확인 항목은 [사용자 인수 기록](../../release/user-acceptance.md),
설치본·CI 근거는 [검증 기록](../../release/windows-validation.md), 다음 작업은 [인수인계](../handoffs/07-windows-release.md)를 따른다.
사용자 PC의 오프라인 전체 시나리오·배율·Narrator·격리 오류 검증을 통과로 추정하지 않는다.

## 다음 채팅

이번 MVP는 종료한다. 상세 개선·오류 검증은 새 요청에서 범위를 정한다.
Teams는 별도 설계 요청을 받아 새 지도로 시작한다.
