# 프로젝트 스킬 가져오기 검토 — 2026-11-04

범위는 두 스킬의 프로젝트 로컬 복사다. 원본 지침은 검토 자료로 읽었으며 이번 작업에 적용하지 않았다.
MVP 코드, 루트 AGENTS.md, 기존 프로젝트 문서·설정·의존성·하네스는 수정하지 않았다.
이 검토와 각 UPSTREAM.json만 가져오기 메타데이터로 새로 작성했다.

## 출처와 무결성

| 스킬 | 원본 저장소 | 고정한 main 커밋 | 라이선스 |
| --- | --- | --- | --- |
| agents-md | https://github.com/mblode/agent-skills | `391508702523088f564fecfdd95ce76304efb117` | MIT, Copyright (c) 2026 Matthew Blode |
| documentation-and-adrs | https://github.com/addyosmani/agent-skills | `301b02b12bff98e4688e6984af6556802322bbde` | MIT, Copyright (c) 2025 Addy Osmani |

각 저장소의 `skills/<스킬 이름>/` 전체와 저장소 루트 라이선스를 복사했다.
라이선스 파일명과 저작권 문구를 보존했다. 원본 파일 12개 모두 Git blob SHA-1·크기와 대조했고,
복사 전후 바이트 일치 및 SHA256도 확인했다. 원본을 요약·재작성하거나 줄바꿈을 바꾸지 않았다.
각 [agents-md manifest](agents-md/UPSTREAM.json)와
[documentation-and-adrs manifest](documentation-and-adrs/UPSTREAM.json)에 파일별 원본 경로·Git blob·SHA256을 기록했다.
대상 두 폴더는 존재하지 않았으며 기존 파일 덮어쓰기는 없었다.

## 명령과 프로젝트 지침 검토

두 스킬의 전체 파일과 명령 예제를 읽었다. 이 범위에서 정보 유출, 원격 코드를 받아 즉시 실행하는 명령,
자격 증명 탈취, 보안 기능 해제 지시는 발견하지 못했다. 두 원본 스킬 폴더에는 실행 스크립트나 실행 파일이 없다.
이는 정적 검토 결과이며 모든 도구 버전에서의 실제 동작이나 절대적인 안전성을 보증하는 것은 아니다.

- `agents-md/references/project-setup.md`에는 `npx skills add <owner>/<repo>` 예제가 있다.
  `references/root-content-guidance.md`에도 `npx vitest` 예제가 있다. 이번 사용자의 CLI·npm/npx 금지가 우선이며 실행하지 않았다.
- `agents-md`는 기존 지침의 삭제·축약·이동, CLAUDE.md 정리, 사용자 홈의 Claude/Codex 설정 확인·변경,
  drift check/CI 추가를 제안한다. 루트 AGENTS.md의 한국어 소통·검증·main 직접 반영·범위 제한을
  일반적인 중복 규칙으로 오판해 지울 수 있으므로 그대로 적용하면 충돌한다. 이번에는 어느 지침도 변경하지 않았다.
- `agents-md`의 `claude -p`, `codex exec`, `agent -p` 및 repo eval 예제는 외부 에이전트를 실행하고 모델 비용을 쓸 수 있다.
  사용자 홈 파일 조회, 에이전트 CLI, 평가 시나리오 실행도 하지 않았다. Claude/Cursor 버전별 로딩 주장은 이 환경에서 실측하지 않았다.
- `documentation-and-adrs`의 README 예제에는 `npm install`, `npm test`, `npm run lint`, `.env` 복사가 나온다.
  이 프로젝트의 실제 명령과 다른 범용 예제다. 특히 `test`·`lint`는 현재 package.json에 없고,
  `npm install`은 postinstall을 통해 다운로드·native 재빌드를 수행하므로 이번에 실행하지 않았다.
- ADR 기본 경로 `docs/decisions/`는 이 프로젝트의 `docs/adr/`와 다르다. 해당 스킬 자체가 기존 관례 우선을 명시하므로
  향후 적용할 때도 기존 `docs/agents/domain.md`의 관례를 따른다. 새 ADR이나 문서 체계를 만들지 않았다.
- ADR 템플릿의 PostgreSQL/Prisma 선택·SQLite 제외는 다중 사용자 웹 앱의 예시다.
  승인된 Electron·로컬 SQLite 요구를 변경하는 결정으로 취급하지 않았다.
- 문서 스킬의 CLAUDE.md/rules 권고와 agents-md의 AGENTS.md 중심 권고는 그대로 확장하면 중복 지침을 만들 수 있다.
  현재 루트 AGENTS.md와 사용자 지시가 우선이며 별도 지침 파일이나 설정을 생성하지 않았다.

## 내부 참조와 별도 스킬 참조

`agents-md/SKILL.md`가 요구하는 참조 7개와 평가 데이터 `evals/evals.json`을 모두 포함했다.
참조 문서의 스킬 내부 상대경로와 Markdown 로컬 링크도 검사했다.
`documentation-and-adrs`의 원본 폴더에는 SKILL.md 외 파일과 내부 참조 의존성이 없다.
문서에 등장하는 `docs/decisions/` 등은 향후 프로젝트 산출물 예시이며 가져오기에서 누락된 파일이 아니다.

`agents-md/references/project-setup.md`의 `references/enforcement-ladder.md`는 문장에 명시된 **다른 스킬
codebase-architecture의 참조**다. agents-md 내부 파일로 잘못 판정하지 않았다.
같은 고정 커밋의 원본 트리에서 존재를 확인했고 [원본 참조](https://github.com/mblode/agent-skills/blob/391508702523088f564fecfdd95ce76304efb117/skills/codebase-architecture/references/enforcement-ladder.md)를 남긴다.
이와 함께 언급된 agent-skills-creator·ghostwriter·cadence-advise는 관련/선택 스킬이며 이번 두 스킬 설치에 포함하지 않았다.
향후 그 별도 기능을 사용할 때는 해당 스킬의 설치 여부와 지침을 별도로 확인해야 한다.

## 검증 결과

- YAML을 안전한 파서로 읽어 두 SKILL.md의 `name`·`description`을 확인했다.
  이름은 폴더와 같고 소문자·하이픈 형식 및 64자 제한을 충족한다.
  설명은 각각 256자·290자로 비어 있지 않고 1024자 제한을 충족한다.
- 원본 파일 12개와 라이선스·저작권 보존, manifest의 전체 파일 목록, Git blob·SHA256·크기·바이트 일치를 확인했다.
- agents-md 내부 참조 대상 8개, documentation-and-adrs 내부 참조 대상 0개다. 필요한 내부 파일 누락은 없다.
  위의 다른 스킬 참조 1개는 별도로 구분했다.
- `evals/evals.json`은 JSON 구조·skill_name·4개 평가 항목을 정적으로 확인했다. 평가 자체는 실행하지 않았다.
- 심볼릭 링크·실행 스크립트·설치 hook을 추가하지 않았다. 설치 CLI, npm/npx, 원본/복사 스킬 스크립트는 실행하지 않았다.
- 저장소 검증은 기존 `node scripts/harness/run.mjs verify`를 사용한다. 동작 검증·앱 빌드는 이번 범위에 포함하지 않는다.

## 추가 파일 목록

```text
.agents/skills/
├── IMPORT-REVIEW.md                         # 새 검토 기록
├── agents-md/
│   ├── SKILL.md                            # 원본
│   ├── LICENSE.md                          # 원본 저장소 루트
│   ├── UPSTREAM.json                       # 새 출처·파일별 해시
│   ├── evals/evals.json                     # 원본
│   └── references/
│       ├── project-setup.md                 # 원본
│       ├── quality-criteria.md              # 원본
│       ├── quick-checklist.md               # 원본
│       ├── refactor-workflow.md             # 원본
│       ├── repo-evals.md                    # 원본
│       ├── root-content-guidance.md         # 원본
│       └── templates.md                     # 원본
└── documentation-and-adrs/
    ├── SKILL.md                            # 원본
    ├── LICENSE                             # 원본 저장소 루트
    └── UPSTREAM.json                       # 새 출처·파일별 해시
```
