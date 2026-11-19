# 하네스·문서 재점검

## 2026-11-19 — Windows ZIP·아이콘·TermRail 통합 설계 검토

검토 기준은 main의 `f739280`과 승인된 TermRail 시안 `549d756`이다. 기존 레이아웃 전체 교체, 매번 로그인 입력, WSL2의 nodenv 경로는 앞선 결정과 일치한다.

| 대상 | 검토 결과 | 구현 단계의 증거 |
| --- | --- | --- |
| Windows ZIP | 설치 완료 판정과 재검사가 classic 전용 CLI 조회에 의존한다. 2.x 프록시의 정책 출처와 신규 관리자 신뢰 판정도 설계에 필요하다. | 지원 대상으로 확인한 각 관리자에서 설치 직후 목록, 기존 활성 버전 보존, 수동 전환, 사내 설정을 확인한다. [ZIP 설계](../design/windows-node-zip-all-versions.md) |
| 아이콘 | 24px 이상 92% 축소, 16·20px 소형 원본 사용을 사용자가 선택했다. | 일반·소형 원본에서 만든 ICO 프레임과 동일 경로 업그레이드 후 셸 표시를 확인한다. [아이콘 설계](../design/windows-node-zip-all-versions.md#앱-아이콘-내부-로고-축소-기준) |
| TermRail | 트레이 숨김은 연결 유지, 별도 창 ×는 연결을 유지해 메인 탭으로 복귀한다. 복원 대상 검증 순서는 문서와 시안 사이에 차이가 있다. | 실제 SSH에서 세션 이동과 레이아웃 교체를 각각 검사한다. SSH 엔진과 호스트 키 최초 확인·변경 처리 방식은 후속 기술 검토 대상이다. [TermRail 설계](../design/ssh-terminal-menu.md) |


## 2026-11-19 — WorkRail 환경 개선 구현 중간 점검

agents-md quick audit는 **12/12, 루트 66줄 유지**다. 기존 실행·검증 명령이 package.json에 있고 루트 문서 링크 누락이 없음을 다시 확인했다. 새 환경·UI 계약은 루트 지침에 늘어놓지 않고 [구현 기록](../implementation/2026-11-19-workrail-environments.md)과 domain 인덱스로 연결한다. TypeScript·단위·UI 및 격리된 Electron 검사는 각 작업 기록을 따르며, 운영 프로필을 사용하는 dev 실행은 명령 검증 목적으로 수행하지 않는다. Windows 배포 검사와 전체 통합 검사는 해당 단계에서 별도로 기록한다.

Wayfinder domain-modeling에 따라 CONTEXT의 Node 환경을 Windows/WSL2 기본 사용자 범위로 명확히 하고, 용어 설명에서 구현 진행 상태를 제거했다. 현재 구현·미검증 범위는 구현 기록에 둔다. 기존 승인 설계에 대안과 결정 이유가 있으므로 같은 결정을 중복 ADR로 만들지 않는다.

## 2026-11-19 — WorkRail 16개 개선 설계 재검토

기준: 문서 HEAD `958719b`, 제품 기준 `3a343d7`. 두 커밋 사이 src/scripts/workflow/electron-builder/package.json에는 변경이 없음을 확인했다. 이번 범위는 16개 개선과 후속 위젯·공유 배지·환경 선택 요청의 통합 설계 및 문서 정리이며, 과거 제품 구현을 재적용하지 않는다.

agents-md quick audit: **12/12 유지**, 루트 **66줄 유지**, 수정 전/후 동일. 핵심 명령·설치 준비·운영 DB/일회성 프로필·권한·검증 범위·사용자 우선순위·문서 분리가 현재 작업에 유효하다. 링크 11개와 npm script 7개가 존재한다. 제품 dev 실행은 운영 프로필을 쓸 수 있으므로 명령 확인 목적으로 실행하지 않았다. 스크립트 존재 확인이 실제 Windows 실행 검증을 뜻하지 않는다.

저장소 지침은 루트 AGENTS.md 하나이며 적용되는 상위 `/AGENTS.md`, `/workspace/AGENTS.md`, 사용자 홈 `.codex/AGENTS.md`·`.claude/CLAUDE.md`는 없다. `/workspace/simple-timeline/AGENTS.md`는 별도 체크아웃으로 현재 저장소의 상위 지침이 아니다. 설치된 클라이언트의 별도 로더 동작은 검증하지 않았다. 설계 세부사항을 루트에 추가하지 않고 domain 인덱스·STATUS로 연결했다. CI 설정·새 검사 스크립트·스킬 원문은 변경하지 않는다.

documentation-and-adrs 검토 결과:

- [통합 설계](../design/workrail-environments-and-home.md)에 확정 결정과 설계자 제안, 현재 구현과 검토 시안을 분리했다. Q3 확정이 요구 표에 미결로 남아 있던 부분을 보정했다.
- 공식 자료 조사에 따른 Q4 추천 변경 이유와 사용자의 최종 소스 컴파일 지원 선택을 기록했다. 새 Q7~Q11 결정도 이유·영향과 연결했다.
- 호스트 실행 버전 수신 경로 부재, 도움말 메뉴 진입/기억 방식, 배포 표시 이름/실제 파일명/내부 정체성의 차이를 코드와 대조했다.
- 새 기능의 의미를 반복하는 ADR 디렉터리를 추가하지 않는다. 기존 docs/design 관례 안에서 대안·선택·결과를 기록하고 과거 기록은 삭제하지 않는다.
- 구현 인수 기준에 Windows/WSL 실기·구버전 공유/업데이트 호환을 명시했다. 문서 검사와 제품 검증을 구분한다.

독립 builder check는 중요한 추가 제품 결정 질문이 없다고 판단했다. 이후 사용자가 Q12에서 통합 설계·수정 시안을 확정했다. 구현 시작 승인은 포함하지 않는다. 검증: Linux x64 / Node 24.22.1, HEAD `958719b` + 이번 문서 변경(dirty)에서 하네스 7개가 PASS였다. 점검한 문서 6개의 로컬 링크 대상 누락은 0개다. 결과는 `artifacts/harness/latest.json`·`latest.log`에 남는다. 제품 앱·Windows/WSL 실기는 이번 문서 작업에서 실행하지 않았다.

## 2026-11-18 — AGENTS.md 빠른 점검과 CI 실행 제한

기준: main `d23e8a4b29aa62cbb0dce8e217b451238cd16243`. 사용자는 `agents-md`로 지침 분석·갱신을 요청하고 CI 실행을 금지했다. [스킬](../../.agents/skills/agents-md/SKILL.md)의 quick 12개 항목을 적용했다. 제품·배포·workflow·스킬 원문은 변경하지 않는다.

Audit Progress:
- [x] Step 1: 저장소·상위·사용자 경로의 지침 파일 탐색
- [x] Step 2: Quick audit 선택 (루트 63줄, 전면 재작성 불필요)
- [x] Step 3: 코드·manifest·workflow·참조 문서와 대조해 채점
- [x] Step 4: 수정 전 10/12점과 구체적인 발견을 사용자에게 보고
- [x] Step 5: 최소 수정안 제시 (사용자의 갱신 요청 범위에서 진행)
- [x] Step 6: 링크·명령·지침 우선순위·로컬 하네스 검증
- [x] Step 7: 변경 적용 및 같은 기준으로 재평가

| Quick 항목 | 전 | 후 | 근거 |
| --- | --- | --- | --- |
| 1. 핵심 명령 | 1 | 1 | dev/build/typecheck/날짜 테스트/verify 명령 존재. dev:member를 명령표에도 연결 |
| 2. manifest와 일치 | 1 | 1 | 기재 npm script 7개 모두 package.json에 존재 |
| 3. 환경·설치 준비 | 1 | 1 | Node 기준 파일·npm ci·native 준비 명시 |
| 4. 저장소 특유 주의점 | 1 | 1 | 운영 DB, 지속 개발 프로필, artifact 검사 충돌 |
| 5. 대안 제시 | 1 | 1 | 일회성 프로필·순차 검사·플랫폼별 검증 문서 연결 |
| 6. 구현에 영향을 주는 계약 | 1 | 1 | 날짜·권한·트랜잭션·데이터 보존 유지 |
| 7. 매번 필요한 정보 | 0 | 1 | 루트의 0.6.0 도입 이력·중복 완료 상태를 현재 문서 링크로 정리 |
| 8. 프레임워크 문서 덤프 없음 | 1 | 1 | 튜토리얼·템플릿 없음 |
| 9. 살아 있는 경로·명령 | 1 | 1 | 루트 링크 11개와 명령 대상 확인 |
| 10. 상세는 필요할 때 읽기 | 0 | 1 | 이미 검증 안내에 있는 명령별 timeout 숫자를 루트에서 제거하고 연결 |
| 11. 조건에 맞는 실행 규칙 | 1 | 1 | 기존 사용자 우선 원칙을 유지하고 CI 금지 시 로컬까지만 진행하도록 구체화 |
| 12. 기본 동작·타 지침과 충돌 없음 | 1 | 1 | 공통 문서는 AGENTS 하나. 스킬의 일반 템플릿보다 사용자·저장소 범위를 우선 |
| 합계 | **10/12** | **12/12** | 문서 품질에 대한 수동 평가이며 제품 테스트 점수가 아님 |

루트는 **63→66줄**이다. 버전 이력은 STATUS, 시간 제한은 기존 검증 안내를 기준으로 읽는다. CI 제한은 새 사례에 맞춰 한 항목만 추가했다. 기존 데이터 보호·sandbox·단일 단계 범위·Windows 인수 한계를 삭제하지 않았다.

저장소 내부에는 루트 AGENTS.md만 있고 AGENTS.override/CLAUDE/CLAUDE.local 및 Claude/Cursor 별도 규칙 파일은 발견되지 않았다. `/workspace/AGENTS.md`, `/AGENTS.md`, 사용자 홈의 `.codex/AGENTS.md`·`.claude/CLAUDE.md`도 없었다. `/workspace/output/settings-baseline/AGENTS.md`는 이전 검증용 사본으로 이 저장소의 상위 지침이 아니다. 다른 클라이언트의 실제 지침 로더 동작은 이번 검사로 검증하지 않았다.

프로젝트 스킬과 루트의 겹침은 문서 점검·질문·설계 절차의 진입 링크 수준이다. 스킬 절차를 루트에 복제하지 않았으며, 일반 스킬이 제안하는 새 CI drift gate는 이번 지침 갱신 범위를 넘어 추가하지 않았다.

검증: 루트 링크 11개·npm script 7개 정적 대조와 로컬 하네스 7개 검사는 PASS. `npm run test:unit -- tests/unit/date.test.ts --reporter=dot`는 13/13 PASS다. 앱 dev/build/전체 검사와 Windows 설치 검사는 이번 문서 수정에서 실행하지 않는다. dev는 운영 DB 또는 지속 테스트 프로필을 쓰므로 단순 명령 점검을 위해 실행하지 않았다.
CI 금지에 따라 workflow dispatch/rerun 및 push를 하지 않는다. 로컬 커밋은 가능하며, 이 제한이 없는 후속 작업의 기존 main push 정책은 유지한다.

## 2026-11-18 — 0.8.8 문서·결정 기록 정합성

분석 기준: main `8a11bed1dacf158bc847832d4c26aa3642b93f5f` (제품 0.8.8).
[documentation-and-adrs](../../.agents/skills/documentation-and-adrs/SKILL.md)를 적용해 코드·승인 설계·최종 CI를 대조했다. 이번 변경은 Markdown 문서에 한정한다. 제품·테스트 코드, 의존성, 배포/CI, 스킬 원문, 루트 AGENTS와 완료된 MVP 지도는 변경하지 않는다.

| 발견 | 반영 |
| --- | --- |
| README의 현재 구현 링크가 0.3.0, STATUS 최신 항목이 0.8.7 | 0.8.8 구현 기록과 설정 설계를 연결하고 과거 후속 항목을 이력으로 구분 |
| 저장 계약은 schema v6까지, 라이트 기본값과 닫기 선택창을 현재 동작으로 설명 | v7·v8 테이블, 개인 표의 검증·보존·비공개, 다크 고정, 트레이 숨김/실제 종료를 코드 기준으로 보정 |
| 구조 문서에 이전 설정 진입·창 높이·창 IPC 명령·툴팁 범위가 남음 | 제목 설정 진입과 역할별 탭, 1707×890 DIP, help/release-notes 명령과 현재 확인창 경계를 명시 |
| 개인/공통 표 합산과 로컬 IPC가 기준 문서에 누락 | 도메인·저장·구조에 출처별 검증 제한, 합산 워킹데이, 개인 LAN 비공개와 dev:member 프로필 경계를 연결 |
| 구현 기록·계획·Windows 전달 기준에 최종 0.8.8 CI가 빠짐 | 같은 SHA의 Application/Repository harness 양 OS 성공, 설치 artifact ID·digest를 기록. 로컬 전체 실패는 그대로 보존 |
| 토요일 해제 후에도 휴일이 남는 이유가 사용 안내에 불명확 | 두 표의 합집합과 날짜별 등록 제한을 설명 |

새 제품 결정을 만들지 않았으므로 별도 ADR 체계는 추가하지 않았다. 승인 설계의 Q1~Q10과 대안 비교가 결정 근거이며, 현재 연결은 기준 문서, 실제 결과는 구현·Windows 검증 기록에서 관리한다. 기존 설계 당시 코드 확인과 실패 기록을 삭제하지 않는다.

검증: 기준 SHA 위의 문서 변경 작업 트리에서 `node scripts/harness/run.mjs verify` 7개 검사 모두 PASS. 추가한 로컬 링크·절 앵커 65개에 누락이 없고, 변경 12개 파일이 모두 Markdown임을 확인했다. `dev:member` 명령과 제품 버전은 package.json과 대조했다. 제품 전체 검사는 이번 문서 작업에서 재실행하지 않으며, 위 제품 SHA의 성공 CI와 이번 문서 검사 결과를 구분한다.
남은 한계: 회사 Windows 실기, 최초 도움말 지연, 로컬 Electron 간헐 수명 실패 원인은 해결로 표시하지 않는다. 기존 migration 사본 경로·IPC 원시 예외 로그의 설계/구현 차이도 후속 코드 항목으로 유지한다.

## 2026-11-05 — Planrail 후속 문서 정합성

분석 기준 main: `56080cc2660287f596cee5f50ab61999676fd281`.
[agents-md](../../.agents/skills/agents-md/SKILL.md)와
[documentation-and-adrs](../../.agents/skills/documentation-and-adrs/SKILL.md)를 적용했다.
문서·에이전트 지침과 CI 원본 증거 사본만 변경했다. 제품·테스트 코드, 의존성, 빌드/배포/CI 설정,
가져온 스킬 원문은 수정하지 않았고 스킬에 포함된 스크립트도 실행하지 않았다.

### 분석과 반영

| 발견 | 실제 근거 | 보정 |
| --- | --- | --- |
| 구조 문서가 닫기를 보호 종료로만 설명 | main의 close guard는 트레이가 있으면 hide, 실제 quit만 저장 대기·확인 | [구조](../design/architecture.md)에 창 숨김/실제 종료/트레이 실패 경로를 구분 |
| 선택 연월과 영속 설정의 설명이 현재 상태와 다름 | App의 selectedDate·별도 표시 월, usePreferences의 localStorage | 구조·[저장](../design/storage.md)에 SQLite·화면 설정·메모리 상태의 경계를 명시 |
| shadcn 사용 범위가 포괄적으로만 적힘 | EditorPanel→앱 Select→shadcn Select→Radix, 날짜 격자는 calendarGrid | 구조 문서에 사용처와 수정 파일 지도 추가. 공식 예제 외형과 앱 토큰, 날짜 선택기와 shadcn Calendar를 구분 |
| 화면 탐색 링크가 이전 C안 문서부터 안내 | Planrail 설계가 화면·날짜·트레이의 후속 기준 | [문서 지도](../agents/domain.md)에 최신 설계와 공통 UI 연결. AGENTS는 이름만 Planrail로 갱신하고 상세는 링크 문서에 유지 |
| 구현 기록과 계획에 원격 검증 완료 근거가 빠짐 | 56080cc의 Application/Repository harness 두 OS 성공 | [구현 기록](../implementation/2026-11-05-planrail.md)·계획·STATUS에 완료 상태와 실기 미검증 경계를 연결 |
| 설치 안내의 검증 경로가 0.1.0 전달 기록으로 이어짐 | 실제 0.3.0 artifact와 Windows 원본 보고서 존재 | [Windows 기록](../release/windows-validation.md)에 0.3.0 고정 SHA·다운로드·해시·증거를 추가. 0.1.0 본문은 당시 기록으로 보존 |
| 모달·중첩 선택기의 검증 주의점이 빠짐 | 기존 Planrail Electron 회귀의 포커스/툴팁/창 버튼 검사 | [검증 안내](validation.md)에 실제 회귀 경로와 Linux 창 관리자 한계를 연결 |

새 제품 결정을 만들지 않았으므로 별도 ADR은 추가하지 않았다. 승인 이유는 기존 설계에 두고,
권한·종료·UI 연결은 구조, 영속화는 저장, 설치본과 원본 실행 증거는 Windows 기록에서 관리한다.
기존 IPC 예외 로그·migration 사본 로그의 설계/구현 차이는 코드 대조 후 미구현 상태로 유지했다.

### AGENTS 빠른 점검

루트 AGENTS 하나만 발견했다. 프로젝트 override/CLAUDE 파일과 이 환경의 상위·홈 지침은 없었다.
프로젝트 스킬 5개의 역할·절차를 대조했으며 루트에는 공통 계약만 남긴다.
외부 스킬의 일반 템플릿보다 사용자 범위·저장소 승인이 우선한다는 기존 규칙이 중복 절차의 우선관계를 정한다.

| 파일 | 기준 | 반영 전 | 반영 후 | 변경 |
| --- | --- | --- | --- | --- |
| AGENTS.md | [12개 빠른 기준](../../.agents/skills/agents-md/references/quick-checklist.md), N/A 없음 | 12/12 Pass, 62줄 | 12/12 Pass, 62줄 | 프로젝트 표시명만 갱신. 명령·공통 안전 계약·탐색 경로는 유지 |

명령·환경·프로젝트 함정·수정 방향(1~5), 구현 관례·정보 밀도·상세 분리(6~10),
적용 조건·우선관계(11~12)를 확인했다. 점수는 문서 기준 충족 여부이며 제품 품질이나 다른 에이전트 로더 인증이 아니다.
실제 Claude/Cursor 로더는 실행하지 않았다.

### 보정과 검증

이번 로컬 실행은 Linux x64·Node 24.22.1, 기준 56080cc + 문서 dirty 상태다.
제품 소스는 같은 SHA와 동일하다. 기존 의존성을 사용했으며 npm ci·native 재설치는 실행하지 않았다.

| 검사 | 결과·경계 |
| --- | --- |
| context / 하네스 verify | selected=null·frontier=[]·errors 없음, verify 7종 PASS. MVP 완료 지도 유지 |
| 타입·제품 빌드 | `npm run build` PASS. 포함된 `npm run typecheck` 4개 TS 설정과 Electron main/preload/renderer 빌드 확인 |
| 문서의 날짜 단위 명령 | `npm run test:unit -- tests/unit/date.test.ts --reporter=dot`: 13개 PASS |
| 개발 명령 | 임시 XDG_CONFIG_HOME·DISPLAY=:94에서 `npm run dev` 실행. HTTP 200·임시 DB schema 1/application_id 1398033486 확인 후 해당 프로세스 그룹 종료. 운영 프로필 미사용 |
| 경로·명령 | Markdown 67개·로컬 링크 대상 523개·변경 문서 앵커·현재 npm 명령 9종 대조 PASS. 스킬 예제·과거 명령과 현재 실행 명령은 구분 |
| 기존 원격 실행 | 56080cc Application/Repository harness의 Windows·Ubuntu 성공 및 artifact SHA 대조. 새 문서 커밋 CI와 구분 |
| 원본 증거 보존 | Windows 보고서 ZIP에서 `windows-validation.json`을 [증거 파일](../release/evidence/56080cc-windows-validation.json)로 바이트 그대로 복사·대조. exe 재다운로드·로컬 해시 재계산은 미실행 |

개발 smoke는 명령·서버·DB 초기화 확인이며 새 UI 시각 검사는 아니다. 컨테이너의 D-Bus 부재 경고는 기록했으며
화면 조작·트레이·Windows 실기 통과로 확대하지 않는다. 전체 앱 검사는 로컬에서 다시 반복하지 않았고
기존 56080cc의 clean CI 결과와 이번 문서 범위에 맞는 명령 검증을 구분한다.
로컬 점검 결과는 `artifacts/docs/2026-11-05/`에 보존한다.

미검증: Windows11 대화형 설치·권한 거부·DPI·트레이 위치·시작 시간, Claude/Cursor 로더,
문서 외부 URL 전체의 본문/fragment 재검증. 현재 CI·artifact는 인증된 GitHub 도구로 확인했다.
기존 [하네스 개선 제안](#미검증과-후속-제안--이번에는-구현하지-않음)의 명령/식별자 drift 검사와
문서 전용 CI 비용 개선은 이번에도 제안이며 검사 스크립트·workflow를 변경하지 않았다.

## 2026-11-04 — 완료된 MVP의 문서 정합성

분석 기준 main: `22a6ae661b4a9e9f50562f2334849ec7f2c3766b`.
요청 범위는 문서와 에이전트 지침이다. 제품 코드·의존성·검사 스크립트·배포/CI 설정은 변경하지 않았다.
[agents-md](../../.agents/skills/agents-md/SKILL.md)와
[documentation-and-adrs](../../.agents/skills/documentation-and-adrs/SKILL.md)를 적용했다.
두 스킬 원본·출처·라이선스도 그대로 보존했다.

### 분석: 현재 구현·의도·제안 구분

실제 src와 tests, package scripts, Electron/Vite/Playwright 설정, 두 CI workflow를 설계·운영 문서와 대조했다.
승인된 업무 규칙과 MVP 인수 범위는 유지했다. 현재 구현은 코드, 의도는 승인 설계,
실행 증거는 해당 SHA·환경의 결과로 구분하며 후속 제안을 구현된 것으로 적지 않는다.

| 발견 | 근거 | 반영·판단 |
| --- | --- | --- |
| 완료된 MVP에 초기 단계 절차가 적용됨 | context는 selected null/frontier 빈 배열, 모든 티켓 closed. session은 스테이지 1 착수 예시 | AGENTS·session·STATUS·tracker에서 단계 작업과 일반 후속 요청 구분 |
| 운영 문서가 앱 없음·도구 선택/시각화 검증 예정으로 설명 | [초기 하네스 기록](../wayfinder/handoffs/00-harness.md)과 달리 src·Application CI·설치 인수 존재 | harness README는 현재 3개 검증 경로로 보정. 과거 기록은 아래 당시 시점으로 한정 |
| 설계가 이미 구현된 부분까지 미검증으로 안내 | [구현 기록](../implementation/)·tests와 design 문서 말미 | 승인 계약은 유지하고 현재 소스·실행 근거·실기 미검증으로 연결 |
| 문서 탐색·시작/종료 절차 중복 | README·AGENTS·session·STATUS의 같은 작업 안내 | AGENTS는 공통 계약, domain은 문서 지도, session은 절차, validation은 실행 상세로 정리 |
| 하네스가 명령/스킬까지 검사한다고 오해할 여지 | [check.mjs](../../scripts/harness/check.mjs)는 루트/docs의 일부 링크만 검사 | validation에 실제 검사 대상과 제외 범위를 명시, 이번에는 별도 읽기 전용 대조 수행 |
| 모든 CI artifact가 14일이라는 인상 | [harness.yml](../../.github/workflows/harness.yml)만 retention-days 14, [app.yml](../../.github/workflows/app.yml)은 미지정 | workflow별 보존 정책과 dirty/SHA·설치본 소스 구분 명시 |
| 개발 명령과 시험 프로필 혼동 가능 | [bootstrap](../../src/main/bootstrap.ts)의 기본 경로와 별도 [test main](../../tests/e2e/main.ts) | dev는 일반 DB, 자동 검사는 임시 프로필, packaged는 일회성 VM임을 구분 |
| IPC 예외 로그가 설계와 다름 | [dispatch](../../src/main/ipc-core.ts)는 toPublicError로 반환하며 로그 없음 | [구조 설계](../design/architecture.md)에 미구현 차이 표시. 코드 수정은 후속 |
| migration 사본 로그가 설계와 다름 | [lifecycle](../../src/main/db/lifecycle.ts)는 recovery 사본만 로그 출력 | [저장 설계](../design/storage.md)에 migration 로그 미구현 표시. 사본 생성·검증·보존 자체와 구분 |
| 업데이트 fixture의 증거 범위를 혼동할 여지 | [migrations](../../src/main/db/migrations.ts)는 schema 1뿐, 0.1.1도 같은 소스 | 설치 업데이트/데이터 보존과 시험용 schema migration 회귀를 구분 |

CONTEXT는 용어 사전 역할과 구현이 일치해 변경하지 않았다. 당시 승인 이유·대안은 기존 설계에 있으므로
새 ADR로 중복 생성하지 않았다. 과거 계획의 체크박스·시험 결과·사용자 보고를 새 실행 결과로 덮어쓰지 않았다.

### AGENTS 점검과 반영

[49개 정밀 기준](../../.agents/skills/agents-md/references/quality-criteria.md)을 적용했다.
점검 대상 프로젝트 진입 파일은 루트 AGENTS 하나다. 프로젝트의 CLAUDE/override 파일과
이 환경의 홈 Claude/Codex 지침은 없었다. 다른 에이전트 제품의 실제 로더 동작은 이번에 실행하지 않았다.

| 기준 | 반영 전 | 반영 후 | 연결된 변경 |
| --- | --- | --- | --- |
| A 실행 명령 | 6/11 | 11/11 | dev/build/typecheck/설치본·대상 단위 검사, root·환경·격리 안내 |
| B 프로젝트 함정 | 9/10 | 10/10 | 가상화/모달 상세는 validation으로 이동, 공통 데이터·권한 경계는 root에 유지 |
| C 적용 조건·관례 | 6/10 | 10/10 | 단계/일반 작업 조건, 사용자 범위·저장소 관례와 외부 스킬 우선관계 명시 |
| D 정보 밀도 | 6/9 | 8/9 | 시작·종료 중복 축소, 상세 절차·리뷰 경로 분리 |
| E 현재성·검증 | 4/6 | 6/6 | 핵심 명령 실행, 경로 대조와 명령 변경 시 함께 보정하는 유지 규칙 |
| 합계 | **31/46 (67.4%, C)** | **45/46 (97.8%, A)** | root 58→62줄, 하네스의 150줄 제한 이내 |

N/A는 6번(DB 별도 CLI 없음), 27번(단일 앱, workspace 경계 없음), 49번(개인 override 없음)이다.
반영 전 미충족 번호는 1·3·4·5·11·21·28·29·31·32·39·40·41·45·48이다.
41번의 사용자 선호/운영 정책 분리는 반영 후에도 미충족으로 남겼다. 한국어 소통과 main 직접 반영은
명시된 프로젝트 운영 요청이므로 root에서 제거하지 않았다. 점수는 문서 점검이며 제품 품질이나 로더 인증이 아니다.

### 보정: 실제 실행과 경로 대조

2026-11-04 Linux x64, Node 24.22.1, Xvfb DISPLAY :99에서 확인했다.
기존 의존성을 사용했으며 npm ci·재설치·가져온 스킬의 스크립트는 실행하지 않았다.

| 검사 | 결과·근거 |
| --- | --- |
| context | 종료 코드 0, errors 빈 배열·selected null·frontier 빈 배열. 완료 지도 상태 유지 |
| 저장소 verify | 7종 검사와 회귀 22개 통과. 문서 수정 트리는 dirty이며 최종 커밋 증거와 구분 |
| verify:app | 7개 단계 모두 통과. release 11, unit 31×UTC/New_York/Seoul, UI 23, native 12, E2E 19. 타입·제품/시험 build 포함 |
| 실행 SHA | 앱 보고서 시작 기준 22a6ae6, dirty=false, 01:18:46~01:19:39 UTC. 이후 문서만 변경; 제품·시험 코드 동일 |
| 개발 실행 | 새 XDG_CONFIG_HOME에서 npm run dev 시작, 개발 서버 HTTP 200, 임시 DB schema 1/application_id 1398033486 확인 후 종료 |
| 개별 단위 명령 | AGENTS에 적은 날짜 파일 + reporter=dot 명령으로 13개 통과 |
| 경로·명령 | 루트/docs/두 스킬의 Markdown 56개, 로컬 링크 389개 대상 확인. npm 스크립트 14종을 package scripts와 대조; lint는 없는 명령임을 명시한 예시 |
| 기존 clean CI | [22a6ae6 Application](https://github.com/kdydesign/simple-timeline/actions/runs/41751758540)와 [Repository harness](https://github.com/kdydesign/simple-timeline/actions/runs/41751758520) 모두 success 확인. 이번 문서 커밋 CI와 구분 |

로컬 상세는 artifacts/harness/latest.json·latest.log, artifacts/app/latest.json·명령별 로그,
artifacts/app/dev-smoke.json·dev-smoke.log에 있다. 로컬 산출물은 Git에 넣지 않으며 다음 실행에서 덮어쓸 수 있다.
외부 URL 76개는 공개 HTTP 응답 또는 인증된 GitHub API로 대상 존재를 확인했다.
기존 설치 artifact 3개도 메타데이터상 만료되지 않았다. 이번에 설치 파일을 다시 내려받아 해시를 재검증한 것은 아니다.
외부 문서의 fragment 위치·본문 변경까지 보증하는 검사는 아니며, 과거 조사의 버전별 근거와 조회 시점을 유지한다.

### 미검증과 후속 제안 — 이번에는 구현하지 않음

- Windows 패키징·설치 lifecycle은 이 Linux 작업에서 재실행하지 않았다. 명령·조건·기존 Windows CI 결과를 대조했다.
  사용자 PC의 상세 오프라인·DPI·Narrator·물리 장애는 [기존 후속 범위](../release/user-acceptance.md)를 유지한다.
- 신규 환경의 npm ci·native 재설치는 미실행이다. 현재 설치된 도구의 실행과 기존 clean CI를 근거로 사용했다.
- **제품 코드 제안:** IPC 예외 기록과 migration 사본 경로·대상 버전 기록의 설계 차이를 해소할 필요가 있다.
  기존 간트 gutter·도구 advisory·방화벽 cleanup 보완은 [스테이지 7 기록](../implementation/stage-07.md)을 유지하며 이번에 수정하지 않았다.
- **하네스 제안:** 명령·백틱 경로·API 식별자·스킬 내부 참조의 drift 검사를 CI에 연결할 수 있다.
  현재 검사에는 없으며 사용자 범위가 문서뿐이므로 스크립트/CI는 추가하지 않았다. 템플릿·없는 명령 예시·생성 경로의 구분이 필요하다.
- **CI 제안:** 문서 전용 push에도 설치본을 다시 만드는 현재 정책의 비용을 검토할 수 있다.
  필터를 도입한다면 설치 산출물에 포함되는 사용 안내 등 영향 문서를 누락하지 않아야 한다. 배포 설정은 그대로 유지했다.

다음 작업은 이 기록의 후속 항목 중 요청받은 범위를 정해 시작한다. MVP 단계나 기존 승인을 다시 열 필요는 없다.

## 과거 기록 — 2026-11-03 초기 하네스

당시에는 스테이지 1 미착수·앱 코드 없음 상태였으며 문서·상태·검사기만 검증했다.
현재 상태 설명이 아니다. [초기 인수인계](../wayfinder/handoffs/00-harness.md)와
[당시 재점검 원문](https://github.com/kdydesign/simple-timeline/blob/22a6ae661b4a9e9f50562f2334849ec7f2c3766b/docs/harness/review.md)에 상세가 있다.

당시 수정은 완료 티켓의 MAP 색인 누락, open 티켓의 잘못된 claim, 커밋된 공백 오류의 검출이었다.
context로 재개·차단·읽을 문서를 제공하고, verify로 공통 실행·SHA/dirty·성공/실패 보고서를 남겼다.
완료 인수인계의 필수 내용을 검사하며, 검사 성공이 사용자 승인이나 문장 진실성을 증명하지 않음을 구분했다.

회귀 22개와 통합 verify를 실행했고 임시 저장소의 정상·assertion 실패·뒤늦은 예외·모두 skip 실행에서
종료 코드와 JSON 판정, 실패 메시지 보존을 확인했다. 강제 중단은 latest running/false로 남았으며
실제 프로젝트 소스나 단계 상태를 바꾸지 않는 복사본에서 재현했다. 이 결과는 당시 검사기의 증거로 보존한다.
