# 검증 안내

## 두 가지 진입점

```sh
node scripts/harness/run.mjs context
node scripts/harness/run.mjs verify
```

context는 읽기 전용이다. 진행 중인 단계·기존 담당자·상태·읽을 문서를 반환한다.
진행 중인 단계가 없으면 선행 단계가 끝난 미착수 단계를 제안한다.
`context 02-architecture`로 특정 단계를 요청할 수 있다. 차단·완료·미존재 단계는 오류다.
진행 중인 단계가 여러 개라면 임의로 고르지 않고 명시적 선택을 요구한다.
승인 대기 상태는 출력에 유지하며 명령 성공이 사용자의 승인을 뜻하지 않는다.

verify는 저장소 위치를 스크립트 경로에서 찾으므로 다른 작업 디렉터리에서도 절대 경로로 실행할 수 있다.
Node 24 이상과 Git이 필요하다. 별도 설치나 네트워크가 필요 없다.
로컬·CI에서 같은 명령을 실행한다.

| 검사 | 범위 |
| --- | --- |
| runtime / git-context | Node 버전, 실제 Git 커밋과 작업 트리 상태 |
| repository | 필수 문서·로컬 링크·단계 선행 관계·지도/상태 일관성·완료 인수인계 |
| working-tree / index / commit whitespace | 미스테이징·스테이징·최근 커밋의 공백 오류 |
| harness-tests | `scripts/harness/*.test.mjs` 전체 발견·실행. 테스트가 없거나 실패하면 검사 실패 |

Git 명령은 각각 30초 제한, 테스트는 Node test runner의 30초 timeout을 사용한다.
전체 CI 작업은 5분 제한이다. 동기 무한 루프 등 러너가 회수하지 못하는 경우는 CI 제한으로 종료한다.
CI는 커밋 부모를 읽도록 fetch-depth 2를 사용한다.
검증기는 모든 검사의 결과를 모으고 하나라도 실패하면 종료 코드 1을 반환한다.

## 결과 보존

- `artifacts/harness/latest.json`: 검사 범위, 시각, OS·Node 버전, HEAD, 작업 트리 dirty 상태, 검사별 결과.
- `artifacts/harness/latest.log`: 테스트별 결과·실패 스택과 검사 상세.
- 성공·실패 모두 파일을 남기고 CI가 OS·커밋별 artifact로 14일 보관한다.
- 로컬 latest 파일은 다음 실행에서 덮어쓴다. 필요한 근거는 첨부하거나 CI 실행 URL로 전달한다.
- dirty 보고서는 기록된 HEAD의 깨끗한 상태를 검증한 것이 아니다. 최종 커밋은 CI 결과와 대조한다.
- 보고서는 검증 당시의 스냅샷이다. 변경 후 다시 실행하며 오래된 PASS를 재사용하지 않는다.
- 실행 시작 때 latest를 `state: running, passed: false`로 바꾼다. 중단된 실행은 이전 PASS를 남기지 않는다.
  정상 종료한 검사는 `state: completed`이며, 실제 판정은 passed와 검사별 결과를 함께 확인한다.

## 자동으로 검사하는 것과 사람이 확인할 것

- Markdown 인라인 로컬 파일 링크만 검사한다. 코드 예시·앵커·참조형·HTML 링크와 외부 URL은 제외한다.
- 티켓 메타데이터는 첫 `##` 제목 이전에 둔다. 중복 필드는 오류다.
- closed 티켓은 인수인계의 결과·승인 사항·산출물 링크·검증·다음 작업이 채워져 있어야 한다.
  HTML 주석으로만 된 빈 양식은 통과하지 않는다. 문장의 진실성·승인 권한·산출물 품질은 검토자가 확인한다.
- STATUS 표·지도 색인·티켓 상태를 대조하지만 상세 문장의 의미는 사람이 검토한다.
- 현재 검증 범위는 `repository-harness-only`다. Electron·SQLite·UI·보안·Windows 설치 검증은 포함하지 않는다.

빠른 문서 검사만 필요하면 `node scripts/harness/check.mjs`, 테스트만 보면
`node --test --test-isolation=none scripts/harness/*.test.mjs`를 사용할 수 있다.
완료 보고 전에는 통합 verify를 실행한다.
