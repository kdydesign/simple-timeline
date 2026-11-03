import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

export function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'timeline-harness-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path, text) => {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  };
  const stage = (id, dependency, status = 'open') => write(
    `docs/wayfinder/stages/${id}.md`,
    `# ${id}\nid: ${id}\nparent: ../MAP.md\nlabels: wayfinder:grilling\nstatus: ${status}\nassignee: null\nblocked_by: ${dependency}\n`,
  );
  for (const path of ['AGENTS.md', 'README.md', 'CONTEXT.md', 'docs/wayfinder/MAP.md']) {
    write(path, '# Fixture\n');
  }
  write('docs/wayfinder/STATUS.md', '| 1 | [첫 단계](stages/01-first.md) | 미착수 |\n| 2 | [두 번째](stages/02-second.md) | 미착수 |\n');
  stage('01-first', 'none');
  stage('02-second', '01-first');
  return { root, write, stage };
}

export function completeFirst(f) {
  f.stage('01-first', 'none', 'closed');
  f.write('docs/wayfinder/handoffs/01-first.md', `# Handoff
## 이번 단계의 목표와 실제 결과
Rules are confirmed.
## 사용자가 승인한 사항
The user approved the rules in this session.
## 산출물
[Rules](../../../README.md)
## 검증
Repository checks passed on the current tree.
## 다음 단계와 시작 문구
Proceed with stage 2 using its ticket.
`);
  f.write('docs/wayfinder/STATUS.md', '| 1 | [first](stages/01-first.md) | 완료 |\n| 2 | [second](stages/02-second.md) | 미착수 |\n');
  f.write('docs/wayfinder/MAP.md', '## Decisions so far\n\n- [First](stages/01-first.md): rules confirmed\n');
}
