import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { fixture, completeFirst } from './test-fixture.mjs';
import { checkRepository } from './check.mjs';


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
  completeFirst({ stage, write });
  write('docs/wayfinder/STATUS.md', '| 1 | [첫 단계](stages/01-first.md) | 완료 |\n| 2 | [두 번째](stages/02-second.md) | 미착수 |\n');
  write('docs/wayfinder/MAP.md', '## Decisions so far\n\n- [첫 단계](stages/01-first.md): 완료\n');
  result = checkRepository(root);
  assert.deepEqual(result, { errors: [], frontier: ['02-second'] });
});

test('closed stage missing from the decisions index cannot be handed off as complete', (t) => {
  const { root, stage, write } = fixture(t);
  stage('01-first', 'none', 'closed');
  write('docs/wayfinder/handoffs/01-first.md', '# Finished\nEvidence.\n');
  write('docs/wayfinder/STATUS.md', '| 1 | [첫 단계](stages/01-first.md) | 완료 |\n| 2 | [두 번째](stages/02-second.md) | 미착수 |\n');
  const result = checkRepository(root);
  assert.ok(result.errors.some((error) => /MAP.md.*01-first/.test(error)));
});

test('an open stage with an assignee is rejected instead of disappearing from the frontier', (t) => {
  const { root, write } = fixture(t);
  write('docs/wayfinder/stages/01-first.md', '# First\nid: 01-first\nparent: ../MAP.md\nlabels: wayfinder:grilling\nstatus: open\nassignee: session\nblocked_by: none\n');
  assert.ok(checkRepository(root).errors.some((error) => /01-first.*assignee/.test(error)));
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


test('empty handoff cannot unlock the next stage', (t) => {
  const f = fixture(t);
  completeFirst(f);
  f.write('docs/wayfinder/handoffs/01-first.md', '# Handoff\n');
  const result = checkRepository(f.root);
  assert.ok(result.errors.some((error) => error.includes('handoff')));
  assert.deepEqual(result.frontier, []);
});
