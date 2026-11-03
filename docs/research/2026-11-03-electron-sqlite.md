# Electron·SQLite 공식 자료 조사

확인일: 2026-11-03. 스테이지 2의 구조 결정에 필요한 문서 조사다.
공식 문서와 프로젝트 소유 저장소의 문서를 HTTPS로 읽었다. 제품 코드·의존성·Electron 실행 환경은 만들지 않았다.
아래 사실은 문서상 확인이며 특정 Electron·드라이버 버전 조합의 Windows 실행 성공을 뜻하지 않는다.
설계의 선택·승인 상태는 [구조 설계](../design/architecture.md)와 [저장 설계](../design/storage.md)가 관리한다.

## 네이티브 드라이버와 패키징

- Electron은 일반 Node.js 바이너리와 ABI가 다를 수 있으므로 네이티브 모듈을 대상 Electron에 맞게 다시 빌드해야 한다.
  공식 절차는 `@electron/rebuild`이며 Electron Forge는 개발·배포 생성 시 이를 사용한다.
  대상 OS·CPU 아키텍처 호환성과 Electron 업데이트 후 재빌드도 확인해야 한다.
  Windows의 native module 로딩에는 `win_delay_load_hook`이 필요하다고 설명한다.
  출처: [Electron Native Node Modules](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules),
  [확인한 원문](https://github.com/electron/electron/blob/main/docs/tutorial/using-native-node-modules.md).
- better-sqlite3의 자체 Electron 안내도 electron-rebuild 사용과 native library unpack을 요구한다.
  Forge 사용 시 auto-unpack-natives 플러그인을 안내한다.
  출처: [better-sqlite3 troubleshooting](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/troubleshooting.md).
- ASAR는 읽기 전용이다. `.node` 파일은 unpack하여 함께 배포할 수 있으며 `app.asar.unpacked` 디렉터리도 배포해야 한다.
  변경되는 DB를 ASAR나 설치 자원 안에 두는 구조는 적합하지 않다.
  출처: [Electron ASAR Archives](https://www.electronjs.org/docs/latest/tutorial/asar-archives).
- 대안인 `node:sqlite`는 Node.js v22.5.0에 추가됐으며, 확인한 Node 공식 main 문서는 Stability 1.2, Release candidate로 표시한다.
  개발 PC의 Node에 API가 있다는 사실만으로 Electron에서 사용 가능하다고 판단할 수 없다.
  Electron은 자체 Node 버전을 종속성으로 지정한다. 채택하려면 선택한 Electron 릴리스의 내장 Node·빌드·API 지원을 별도 확인해야 한다.
  이 조사에서는 특정 Electron 릴리스의 `node:sqlite` 지원 여부를 확정하지 않았다.
  출처: [Node SQLite API](https://nodejs.org/api/sqlite.html),
  [Electron DEPS](https://github.com/electron/electron/blob/main/DEPS).

따라서 better-sqlite3에는 Electron용 공식 통합 경로가 있지만, 버전·OS·CPU·패키징 조합은 실제 빌드로 확인해야 한다.
이번 조사에서 패키징 도구나 라이브러리 버전을 설치·선정·실행 검증하지 않았다.

## Electron 권한과 앱 수명주기

- Electron 보안 지침은 renderer의 context isolation·sandbox 활성화, Node integration 비활성화,
  CSP 설정, 탐색·새 창 제한, IPC sender 검증을 권장한다. preload에서 raw IPC를 그대로 공개하지 말아야 한다.
  sender 검증 예시는 `senderFrame`의 허용 origin과 null 프레임을 고려한다.
  출처: [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security).
- `app.getPath('userData')`는 기본적으로 `appData` 아래 앱 이름에 따른 경로다.
  Windows의 `appData`는 사용자별 `%APPDATA%`를 사용한다. Chromium 내부 하위 디렉터리와 충돌하지 않도록 앱 전용 하위 폴더를 권장한다.
  앱 이름 변경이 기본 경로에 영향을 줄 수 있으므로 데이터 위치를 안정적으로 유지하는 설계가 필요하다.
  출처: [app.getPath](https://www.electronjs.org/docs/latest/api/app#appgetpathname).
- `app.requestSingleInstanceLock()`은 현재 인스턴스가 primary인지 boolean으로 반환한다.
  두 번째 실행을 종료하고 기존 창을 복원·집중하는 공식 예제가 있다.
  출처: [requestSingleInstanceLock](https://www.electronjs.org/docs/latest/api/app#apprequestsingleinstancelockadditionaldata).

## 제약·트랜잭션·버전

- SQLite 외래 키는 애플리케이션에서 연결마다 `PRAGMA foreign_keys = ON`으로 활성화해야 한다.
  `ON DELETE CASCADE`는 부모 행 삭제 시 종속 행 삭제를 수행한다.
  출처: [SQLite Foreign Key Support](https://sqlite.org/foreignkeys.html).
- better-sqlite3의 `transaction()`은 함수가 정상 반환하면 commit하고 예외를 던지면 rollback한다.
  async 함수는 transaction 함수로 사용할 수 없다. 트랜잭션 내부 예외를 삼키지 않아야 한다.
  출처: [better-sqlite3 transaction API](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md#transactionfunction---function).
- `PRAGMA user_version`은 앱이 읽고 쓰는 버전 정수이며 SQLite 자체는 그 값을 해석하지 않는다.
  앱이 단계별 마이그레이션·더 높은 버전 거부·실패 처리 정책을 직접 구현해야 한다.
  `integrity_check`는 외래 키 위반을 찾지 않으므로 `foreign_key_check`를 별도로 사용해야 한다.
  출처: [SQLite PRAGMA](https://sqlite.org/pragma.html).

## 백업·외부 파일·복원

- SQLite Online Backup API는 완료 시 일관된 DB snapshot을 생성한다. 실행 중 DB를 파일 복사만으로 백업하는 절차와 다르다.
  복사 중 다른 쓰기가 있으면 backup 단계가 재시작될 수 있다.
  출처: [SQLite Backup API](https://sqlite.org/backup.html).
- better-sqlite3의 `backup(destination)`은 Promise로 완료·실패를 알리고, 산출물은 일반 SQLite DB 파일이다.
  `readonly`로 후보 DB를 열 수 있다. `fileMustExist`는 일반 쓰기 연결에서 파일 누락 시 새 DB 생성을 막는 옵션이다.
  출처: [better-sqlite3 API](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md).
- SQLite는 열린 DB 파일을 unlink하거나 rename하는 행위의 동작이 정의되지 않고 바람직하지 않다고 경고한다.
  특히 Windows는 열린 파일의 unlink를 허용하지 않는다고 설명한다.
  파일 교체 방식의 복원이라면 관련 연결·작업을 모두 닫은 상태를 전제로 설계해야 한다.
  출처: [SQLite corruption risks — unlink/rename](https://sqlite.org/howtocorrupt.html#_unlinking_or_renaming_a_database_file_while_in_use).
- 따라서 외부 복원 파일을 곧바로 활성 DB에 덮어쓰는 것은 안전한 설계 근거가 없다.
  앱 정체성·지원 schema version·integrity·foreign keys·업무 규칙을 검증하고 원본을 보존하는 흐름은 이 앱에서 정할 정책이다.
  이 마지막 문장은 공식 API의 보장과 구분되는 설계 권고다.

## 후속 실제 검증

스테이지 4에서 버전·빌드 도구를 고정하고 스테이지 5~7에서 다음을 확인해야 한다.

- 선택한 Electron 버전·Windows CPU 대상의 better-sqlite3 로딩과 재빌드.
- 개발 실행과 설치 패키지 실행 양쪽의 native binding 경로·ASAR unpack 동작.
- 빈 DB 생성, 마이그레이션 성공·실패, 외래 키·연쇄 삭제 rollback.
- 실제 Windows 파일 잠금, 권한 거부, 디스크 부족, 손상 파일, 마이그레이션 중단에서 원본·사전 사본 보존.
- 설치·업데이트·재실행·오프라인 실행 후 저장 데이터 유지.

현재 앱 실행·ABI 재빌드·Windows 설치·오프라인 실행·백업/복원 실행 검증은 전부 미실행이다.
