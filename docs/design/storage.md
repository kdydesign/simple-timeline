# SQLite 저장 설계

작성일: 2026-11-03. 스테이지 2 사용자 승인 설계.
[도메인 규칙](domain-rules.md), [프로세스·IPC 계약](architecture.md)을 따른다.
이 문서는 구현 계약이며 DB 생성·드라이버 설치·Windows 앱 검증 결과가 아니다.

## 드라이버와 호환성

승인된 에이전트 제안: `better-sqlite3`를 main 전용으로 사용한다.
동기 API와 명시적 트랜잭션이 짧은 로컬 CRUD에 적합하다. `node:sqlite`는 Electron에 포함된 Node의
지원 상태에 결합되고, 비동기 드라이버는 이 MVP의 짧은 작업에 별도 복잡성을 더하므로 우선 선택하지 않는다.
이 드라이버 선택은 공식 자료 검토 후 문서 전체 승인으로 확정했으며 라이브러리 버전은 스테이지 4에서 고정한다.

Electron의 ABI와 일반 Node ABI는 다를 수 있다. Electron 버전·Windows CPU 대상별로
`@electron/rebuild` 또는 패키징 도구의 동등한 재빌드를 적용하고 네이티브 `.node` 파일을
asar 밖에 포함한다. 빌드 중 prebuilt 다운로드/컴파일이 필요할 수 있으나 설치된 앱 실행에는
인터넷이나 컴파일러를 요구하지 않는다. 대상별 prebuilt 존재를 추정하지 않는다.
스테이지 4에서 Electron·드라이버·패키징 도구 버전 및 네이티브 로딩 검사를 정하고,
스테이지 7에서 실제 Windows 설치본의 DB 열기·쓰기·재실행·오프라인 검증을 수행한다.
공식 근거는 [조사 문서](../research/2026-11-03-electron-sqlite.md)를 따른다.

## 논리 스키마와 불변식

아래는 에이전트가 정한 내부 표현이다. 실제 SQL/파일 배치는 스테이지 4~5에서 작성한다.
테이블은 STRICT를 사용한다. 이름 중복을 금지하는 UNIQUE는 두지 않는다.

| 테이블 | 필드·제약 |
| --- | --- |
| `projects` | `id INTEGER PRIMARY KEY AUTOINCREMENT`, `name TEXT NOT NULL`, `color TEXT NOT NULL`, `created_at TEXT NOT NULL`, `updated_at TEXT NOT NULL` |
| `project_participants` | `project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE`, `position INTEGER NOT NULL CHECK(position >= 0)`, `name TEXT NOT NULL`, `PRIMARY KEY(project_id, position)`, `UNIQUE(project_id, name)` (BINARY 비교) |
| `schedules` | `id INTEGER PRIMARY KEY AUTOINCREMENT`, `project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE`, `name TEXT NOT NULL`, `start_date TEXT NOT NULL`, `end_date TEXT NOT NULL`, `created_at TEXT NOT NULL`, `updated_at TEXT NOT NULL` |

참여자는 JSON 대신 자식 테이블로 저장한다. 목록 순서·이름 중복·프로젝트와의 연쇄 삭제를
DB 제약으로 표현할 수 있다. 전역 사람 테이블이나 계정·권한은 만들지 않는다.
생성·수정 시 참여자 전체 교체와 프로젝트 변경을 같은 트랜잭션에 넣는다.

- ID는 테이블별 생성 순서다. AUTOINCREMENT로 삭제한 ID를 재사용하지 않는다.
  main 내부는 BigInt 안전 정수 모드, IPC에서는 십진 문자열로 변환해 JavaScript 정밀도 손실을 막는다.
- 생성/수정 시각은 main이 UTC ISO 형식으로 부여한다. 시스템 시계가 되돌아가도 정렬은 ID를 기준으로 유지한다.
  update는 ID와 created_at을 변경하지 않는다.
- 프로젝트 조회는 `id ASC`. 일정 조회는 프로젝트별 `start_date, end_date, id ASC`.
  고정 길이 날짜는 BINARY 문자열 비교로 날짜순을 보장한다. ID 동률은 기본키상 발생하지 않는다.
- `schedules(project_id, start_date, end_date, id)` 인덱스를 둔다.
- main은 엄격한 그레고리력 검증과 이름 정리를 수행한다. DB CHECK에도 비어 있지 않은 정리된 이름,
  `#RRGGBB` 색상, 날짜의 고정 형식·0001~9999·월별 일수·윤년·`start_date <= end_date`를 둔다.
  SQLite 날짜 함수의 자동 보정에 의존하지 않는다. 실제 SQL 작성 시 이 계약을 경계 사례로 검증한다.
- JS trim과 SQLite 기본 trim은 의미가 다르므로 main의 정규화가 기준이다.
  DB CHECK가 main 검증 전체를 대신한다고 간주하지 않는다.
- 기간·간트 범위·선택 연월은 저장하지 않고 승인된 도메인 규칙으로 계산한다.

## 연결·트랜잭션

main만 연결 하나를 소유하며 모든 연결에서 트랜잭션 시작 전에 `PRAGMA foreign_keys = ON`을 설정·확인한다.
MVP는 rollback journal (`journal_mode=DELETE`)과 `synchronous=FULL`을 사용한다.
단일 인스턴스·단일 연결이므로 WAL의 동시 읽기 이점보다 수명주기 단순성을 우선한다.
저널 파일을 손상 찌꺼기로 추정해 삭제하지 않는다. `busy_timeout=3000` 후에는 실패를 반환한다.

프로젝트 삭제는 프로젝트 한 행 삭제와 FK cascade를 하나의 트랜잭션으로 commit한다.
하위 일정·참여자 일부만 삭제되는 성공은 없다. 대상이 없으면 NOT_FOUND다.
생성·수정·참여자 교체도 트랜잭션이며 실패하면 rollback한다. prepared statement만 사용한다.
getSnapshot은 한 읽기 트랜잭션에서 프로젝트·일정·참여자를 읽어 같은 시점의 결과를 반환한다.
외부 파일/사용자 응답 대기·긴 계산은 트랜잭션 안에 넣지 않는다.

## DB 수명주기

사용자는 Q3 선택을 정정하여 아래 권장 정책 전체를 선택했다.

- 고정 앱 정체성의 `app.getPath('userData')/data/timeline.sqlite3` 사용.
  설치 폴더·현재 작업 폴더에 저장하지 않는다. 정확한 app ID·제품명은 최초 배포 전 고정한다.
- `requestSingleInstanceLock`을 DB 열기 전에 획득한다. 두 번째 실행은 첫 창을 활성화하고 종료한다.
- 첫 실행은 DB 파일이 없을 때만 디렉터리·빈 schema를 만든다. 기존 DB 열기 실패와 빈 DB를 구분한다.
- 앱 재실행·일반 업데이트 시 userData와 DB 경로를 유지한다. 설치 파일에 쓰기 가능한 DB를 넣지 않는다.
  제거 시 데이터 삭제 옵션은 스테이지 7에서 명시적으로 결정하며 지금 삭제를 허용한 것으로 추정하지 않는다.
- 종료 시 진행 중 쓰기를 정리하고 연결을 닫는다. 비정상 종료 후 SQLite 저널 복구 결과를 확인한다.
- 기존 DB의 열기·검사·마이그레이션 실패 시 원본을 지우거나 빈 DB로 바꾸지 않는다.
  DB 사용을 차단하고 오류 원인·DB 경로·종료/재실행 안내를 제공한다.

## 마이그레이션·복구

승인된 에이전트 제안: `PRAGMA user_version`으로 스키마 버전을 관리한다.
지원 버전보다 높으면 `SCHEMA_TOO_NEW`로 차단한다. 더 낮으면 순서대로 버전별 트랜잭션을 수행하고
해당 변경과 user_version 갱신을 함께 commit한다. 실패하면 해당 버전을 rollback하고 시작을 중단한다.
마이그레이션 전체 실패 시 원본 유지 방식은 아래 사전 보존으로 보강한다.

시작 시 기존 DB의 무결성(`quick_check`)과 FK(`foreign_key_check`)를 확인한다.
업그레이드 전에는 쓰기를 받지 않는 상태에서 `backup(destination)`으로 일관된 사본을 만든다.
기존 파일을 덮어쓰지 않는 고유 이름(버전·UTC 시각·임의 접미사)의 앱 내부 migration-backups 경로를 사용한다.
Promise 완료를 기다린 후 사본을 readonly로 열어 무결성·FK·원본 user_version을 검증하고 닫는다.
사본 생성/검증 실패 시 마이그레이션하지 않는다. 생성 도중 중단된 파일은 성공 사본으로 취급하지 않는다.
보존 사본 경로와 대상 버전은 main 로그에 기록한다. 사본을 자동 정리하지 않는다.
이는 내부 업그레이드 안전장치이며 수동 백업·복원 기능이 아니다.
버전별 실패 시 원본에 이전 단계까지 commit된 변경이 있을 수 있으며, 실패 단계는 rollback한다.
어떤 경우에도 자동 교체하지 않고 사본과 현재 파일을 모두 보존한 채 편집을 차단한다.
실패한 원본·사본을 자동 삭제하지 않는다. 자동 복원·파괴적 초기화 버튼은 만들지 않는다.

## 사용자 백업 선택과 한계

사용자는 수동 백업·복원을 MVP에서 제외했다. 내보내기·가져오기·다른 PC 이동 기능도 추가하지 않는다.
사용자가 OS 수준에서 파일을 보존한다면 앱을 완전히 종료한 뒤 DB와 필요한 저널을 함께 다뤄야 한다.
앱 실행 중 DB 한 파일 복사를 일관된 백업으로 보장하지 않는다.
내부 마이그레이션 사본도 같은 디스크에 있으므로 디스크·PC 손실 복구나 상시 백업을 보장하지 않는다.
DB 파일은 평문이며 Windows 사용자 파일 권한을 따른다. 별도 암호화·비밀번호 기능은 추가하지 않는다.

## 검증과 남은 범위

후속 구현 검증: 첫 실행/빈 데이터, Unicode 이름 정리, 참여자 순서·중복, 윤년/최소·최대 날짜,
ID 정밀도·생성 순서, FK 거부, 삭제 중 실패 rollback, 잠금/용량/권한 오류, 재실행 보존,
마이그레이션 성공·실패·고버전 거부·원본 보존, 손상 시 빈 DB 대체 방지.
이는 실행한 테스트 목록이 아니다. Windows 네이티브 로딩·설치·업데이트·오프라인은 미검증이다.
