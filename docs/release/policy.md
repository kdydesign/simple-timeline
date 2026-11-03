# Windows 배포 정책 — 스테이지 7

사용자는 이번 채팅 Q1~Q3에 다음을 선택했다. 기존 도메인·저장·화면 승인을 변경하지 않는다.

- 대상: Windows 11 x64. Windows Server CI는 자동 검증 환경이며 Windows 11 실기 확인을 대신하지 않는다.
- 설치: 현재 사용자용 NSIS. 관리자 권한을 요구하지 않는다. 고정 appId는 `com.kdydesign.simpletimeline`이다.
- 데이터: 사용자 AppData의 `SimpleTimeline/data/timeline.sqlite3`. 업데이트·재설치와 제거 후에도 보존한다.
- 서명·배포: 서명 없이 비공개 GitHub Actions 산출물로 제공한다. 공개 GitHub Release를 만들지 않는다.
  알 수 없는 게시자/SmartScreen 경고 가능성을 안내했다. 자동 업데이트·원격 업데이트 확인은 추가하지 않는다.

에이전트의 구체화: one-click의 사용자별 설치를 사용해 전체 사용자 선택 화면을 만들지 않는다.
설치 직후 자동 실행은 끈다. 기본 설치 위치는 사용자 로컬 AppData의 Programs 아래이며,
설치 파일·앱 버전·CPU·소스 SHA·설치 파일 SHA256을 산출물에 기록한다.
실제 설치/오프라인/업데이트/제거 검증이 남으면 완료로 표시하지 않는다.
