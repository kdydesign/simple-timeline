# 이 설계 지도의 로컬 Markdown 트래커

이 저장소는 Wayfinder의 로컬 Markdown 트래커를 사용한다.
GitHub 이슈·라벨·댓글을 생성하지 않는다. 문서는 Git 커밋으로 새 채팅에 전달한다.
아래 상태 전이는 지도에 등록된 단계 작업에 적용한다. 완료된 MVP의 일반 후속 요청은
[세션 절차](../harness/session.md)를 따르며 기존 단계를 자동으로 다시 열지 않는다.

## Wayfinding operations

- Map: `docs/wayfinder/MAP.md`.
- Child issues: `docs/wayfinder/stages/*.md`. `id`가 식별자, `parent`가 지도다.
- Labels: 각 파일의 `labels` 항목에 `wayfinder:grilling` 또는 `wayfinder:task` 등을 기록한다.
- Claim: 착수할 때 `assignee`를 현재 세션 식별자로, `status`를 `in_progress`로 기록하고 STATUS 표도 함께 `진행 중`으로 갱신한다. open은 assignee가 null이어야 한다.
- Blocking: `blocked_by`의 선행 티켓이 모두 `closed`인 경우에만 해제된다.
  로컬 Markdown에는 네이티브 의존성 기능이 없으므로 이 파일 필드를 사용한다.
- Frontier: `status: open`, `assignee: null`, 모든 선행 티켓이 `closed`인 파일.
- Resolution: 인수인계 양식의 결과·승인 사항·산출물 링크·검증·다음 작업을 채우고,
  해당 티켓의 `해결 기록`에 근거와 링크를 추가한 뒤 `status: closed`로 변경한다.
- Context pointer: 지도 `Decisions so far`에 완료한 티켓 제목 링크와 요약을 추가한다.
- `STATUS.md`는 사람이 보는 상태 인덱스다. 티켓 상태와 함께 갱신한다.
- 착수 후 중단·미승인·검증 대기는 `in_progress`를 유지하고 STATUS와 인수인계에 이유를 기록한다. 재개 시 이전 세션 claim을 확인한다.

트래커를 바꾸려면 사용자와 GitHub Issues 등의 목적지를 정하고 링크·상태를 함께 이관한다.
