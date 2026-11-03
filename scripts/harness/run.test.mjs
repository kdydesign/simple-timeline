import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, completeFirst } from './test-fixture.mjs';
import { getContext, testOutcome } from './workflow.mjs';

test('fresh session gets an eligible ticket and the documents to read', (t) => {
  const { root } = fixture(t);
  const result = getContext(root);
  assert.equal(result.selected.id, '01-first');
  assert.ok(result.selected.read.includes('docs/wayfinder/stages/01-first.md'));
  assert.ok(result.selected.read.includes('AGENTS.md'));
});

test('requested blocked stage is not suggested as ready work', (t) => {
  const { root } = fixture(t);
  const result = getContext(root, '02-second');
  assert.equal(result.selected, null);
  assert.ok(result.errors.some((error) => error.includes('01-first')));
});

test('resume existing claim with its handoff before starting another stage', (t) => {
  const f = fixture(t);
  f.write('docs/wayfinder/stages/01-first.md', '# First\nid: 01-first\nparent: ../MAP.md\nlabels: wayfinder:grilling\nstatus: in_progress\nassignee: previous-session\nblocked_by: none\n');
  f.write('docs/wayfinder/STATUS.md', '| 1 | [first](stages/01-first.md) | 사용자 확인 대기 |\n| 2 | [second](stages/02-second.md) | 미착수 |\n');
  f.write('docs/wayfinder/handoffs/01-first.md', '# Pause\nWaiting for user input.');
  const result = getContext(f.root);
  assert.equal(result.selected.id, '01-first');
  assert.equal(result.selected.assignee, 'previous-session');
  assert.equal(result.selected.displayStatus, '사용자 확인 대기');
  assert.ok(result.selected.read.includes('docs/wayfinder/handoffs/01-first.md'));
});

test('next stage includes the completed prerequisite handoff', (t) => {
  const f = fixture(t);
  completeFirst(f);
  const result = getContext(f.root, '02-second');
  assert.equal(result.selected.id, '02-second');
  assert.ok(result.selected.read.includes('docs/wayfinder/handoffs/01-first.md'));
});

test('late asynchronous error fails even when individual assertions passed', () => {
  assert.equal(testOutcome({ success: false, counts: { passed: 1, failed: 0, cancelled: 0 } }), false);
});

test('skips and empty suites do not count as executed passing tests', () => {
  assert.equal(testOutcome({ success: true, counts: { passed: 0, failed: 0, cancelled: 0, skipped: 2, suites: 1 } }), false);
});

test('missing final summary is a failed verification', () => {
  assert.equal(testOutcome(undefined), false);
});

test('successful executed tests allow a passing verification', () => {
  assert.equal(testOutcome({ success: true, counts: { passed: 1, failed: 0, cancelled: 0 } }), true);
});
