import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { checkRepository } from './check.mjs';

function fixture(t) {
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

test('valid map exposes only unclaimed stages whose dependencies are closed', (t) => {
  const { root } = fixture(t);
  assert.deepEqual(checkRepository(root), { errors: [], frontier: ['01-first'] });
});

test('missing entry point is an actionable error', (t) => {
  const { root } = fixture(t);
  rmSync(join(root, 'AGENTS.md'));
  assert.ok(checkRepository(root).errors.some((error) => error.includes('AGENTS.md')));
});

test('broken local file links fail while code examples and external links are skipped', (t) => {
  const { root, write } = fixture(t);
  write('README.md', '# Guide\n```md\n[example](missing-example.md)\n```\n`[inline](missing-inline.md)`\n[web](https://example.com)\n[heading](#guide)\n[broken](missing-real.md)\n');
  const { errors } = checkRepository(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /README.md.*missing-real.md/);
});

test('unknown dependency is rejected', (t) => {
  const { root, stage } = fixture(t);
  stage('02-second', 'missing-stage');
  assert.ok(checkRepository(root).errors.some((error) => /missing-stage/.test(error)));
});

test('circular dependencies are rejected', (t) => {
  const { root, stage } = fixture(t);
  stage('01-first', '02-second');
  assert.ok(checkRepository(root).errors.some((error) => /cycle/.test(error)));
});

test('claiming a blocked stage is rejected', (t) => {
  const { root, stage } = fixture(t);
  stage('02-second', '01-first', 'in_progress');
  assert.ok(checkRepository(root).errors.some((error) => /02-second.*01-first/.test(error)));
});

test('closed stage needs a handoff and matching status index', (t) => {
  const { root, stage, write } = fixture(t);
  stage('01-first', 'none', 'closed');
  let result = checkRepository(root);
  assert.ok(result.errors.some((error) => /handoff/.test(error)));
  assert.ok(result.errors.some((error) => /STATUS.md/.test(error)));
  write('docs/wayfinder/handoffs/01-first.md', '# Finished\nActual outcome and evidence.\n');
  write('docs/wayfinder/STATUS.md', '| 1 | [첫 단계](stages/01-first.md) | 완료 |\n| 2 | [두 번째](stages/02-second.md) | 미착수 |\n');
  result = checkRepository(root);
  assert.deepEqual(result, { errors: [], frontier: ['02-second'] });
});

test('invalid status cannot silently remove a stage from the frontier', (t) => {
  const { root, stage } = fixture(t);
  stage('01-first', 'none', 'done');
  assert.ok(checkRepository(root).errors.some((error) => /01-first.*status/.test(error)));
});

test('contradictory duplicate status rows are rejected', (t) => {
  const { root, write } = fixture(t);
  write('docs/wayfinder/STATUS.md', '| 1 | [first](stages/01-first.md) | 완료 |\n| 1 | [first](stages/01-first.md) | 미착수 |\n| 2 | [second](stages/02-second.md) | 미착수 |\n');
  assert.ok(checkRepository(root).errors.some((error) => /STATUS.md.*duplicate/.test(error)));
});

test('fenced metadata example cannot override a real blocked claim', (t) => {
  const { root, write } = fixture(t);
  write('docs/wayfinder/stages/02-second.md', '# Second\nid: 02-second\nparent: ../MAP.md\nlabels: wayfinder:grilling\nstatus: in_progress\nassignee: session\nblocked_by: 01-first\n\n## Example\n```text\nstatus: open\nblocked_by: none\n```\n');
  assert.ok(checkRepository(root).errors.some((error) => /02-second.*01-first/.test(error)));
});

test('single-quoted link titles do not hide broken local file targets', (t) => {
  const { root, write } = fixture(t);
  write('README.md', "[broken](missing-real.md 'title')\n");
  assert.ok(checkRepository(root).errors.some((error) => /missing-real.md/.test(error)));
});
