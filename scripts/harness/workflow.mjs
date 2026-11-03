import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { run } from 'node:test';
import { inspect } from 'node:util';
import { inspectRepository } from './check.mjs';

export function testOutcome(summary) {
  return summary?.success === true && summary.counts?.passed > 0
    && summary.counts.failed === 0 && summary.counts.cancelled === 0;
}

export function getContext(root, requested) {
  const { errors, frontier, stages } = inspectRepository(root);
  const result = { errors, selected: null, frontier };
  if (errors.length) return result;
  const active = stages.filter((stage) => stage.status === 'in_progress');
  if (!requested && active.length > 1) {
    errors.push('Multiple active stages; choose one explicitly: ' + active.map((stage) => stage.id).join(', '));
    return result;
  }
  const id = requested ?? active[0]?.id ?? frontier[0];
  if (!id) return result;
  const stage = stages.find((item) => item.id === id);
  if (!stage || stage.status === 'closed') {
    errors.push(`Requested stage ${id} is unknown or already closed`);
    return result;
  }
  if (stage.status !== 'in_progress' && !frontier.includes(id)) {
    errors.push(`${id} is blocked by ${stage.dependencies.filter((dep) => stages.find((item) => item.id === dep)?.status !== 'closed').join(', ')}`);
    return result;
  }
  const read = ['AGENTS.md', 'docs/wayfinder/STATUS.md', 'docs/wayfinder/MAP.md', `docs/wayfinder/stages/${id}.md`];
  const handoffs = [...stage.dependencies, id].map((dep) => `docs/wayfinder/handoffs/${dep}.md`);
  if (!stage.dependencies.length) handoffs.unshift('docs/wayfinder/handoffs/00-planning.md', 'docs/wayfinder/handoffs/00-harness.md');
  read.push(...handoffs.filter((path) => existsSync(join(root, path))));
  result.selected = { id, title: stage.title, status: stage.status, displayStatus: stage.displayStatus,
    assignee: stage.assignee, read };
  return result;
}

function command(root, args) {
  return new Promise((done) => {
    const child = spawn('git', args, { cwd: root, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', failure;
    const timer = setTimeout(() => { failure = 'Command timed out after 30s'; child.kill(); }, 30000);
    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; });
    child.on('error', (error) => { failure = error.message; });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      done({ command: ['git', ...args], passed: code === 0 && !failure && !signal,
        exitCode: code, signal, stdout, stderr, error: failure });
    });
  });
}

export async function verify(root) {
  const startedAt = new Date().toISOString();
  const output = join(root, 'artifacts/harness');
  mkdirSync(output, { recursive: true });
  // An interrupted run must never leave the previous successful report as latest.
  writeFileSync(join(output, 'latest.json'), JSON.stringify({ schemaVersion: 1,
    scope: 'repository-harness-only', state: 'running', passed: false, startedAt }, null, 2) + '\n');
  writeFileSync(join(output, 'latest.log'), 'Verification started; final result pending.\n');
  const checks = [];
  const logs = [];
  checks.push({ name: 'runtime', passed: Number(process.versions.node.split('.')[0]) >= 24, detail: process.version });
  let context;
  try {
    context = getContext(root);
    // Multiple active sessions do not invalidate the repository itself.
    const { errors } = inspectRepository(root);
    checks.push({ name: 'repository', passed: !errors.length, errors });
  } catch (error) { checks.push({ name: 'repository', passed: false, errors: [error.message] }); }

  const head = await command(root, ['rev-parse', 'HEAD']);
  const status = await command(root, ['status', '--porcelain=v1']);
  checks.push({ name: 'git-context', passed: head.passed && status.passed, head, status });
  for (const [name, args] of [
    ['working-tree-whitespace', ['diff', '--check']],
    ['index-whitespace', ['diff', '--cached', '--check']],
    ['commit-whitespace', ['log', '-1', '-m', '--check', '--format=', 'HEAD']],
  ]) checks.push({ name, ...await command(root, args) });

  let summary, summarySuccess = true;
  try {
    const files = readdirSync(join(root, 'scripts/harness')).filter((file) => file.endsWith('.test.mjs'))
      .sort().map((file) => join(root, 'scripts/harness', file));
    if (!files.length) throw new Error('No harness tests discovered');
    for await (const event of run({ files, isolation: 'none', timeout: 30000 })) {
      if (event.type === 'test:pass') {
        if (event.data.skip || event.data.todo) logs.push(`SKIP ${event.data.name}`);
        else if (event.data.details?.type !== 'suite') logs.push(`PASS ${event.data.name}`);
      }
      if (event.type === 'test:fail') logs.push(`FAIL ${event.data.name}\n${inspect(event.data.details?.error, { depth: 5, colors: false })}`);
      if (['test:stdout', 'test:stderr', 'test:diagnostic'].includes(event.type)) logs.push(`${event.type}: ${event.data.message}`);
      if (event.type === 'test:summary') {
        summary = event.data;
        summarySuccess = summarySuccess && event.data.success === true;
      }
    }
    checks.push({ name: 'harness-tests', passed: testOutcome(summary) && summarySuccess,
      counts: summary?.counts, summarySuccess: summary?.success === true && summarySuccess });
  } catch (error) { checks.push({ name: 'harness-tests', passed: false, error: error.stack }); }

  const report = { schemaVersion: 1, scope: 'repository-harness-only', state: 'completed', startedAt, finishedAt: new Date().toISOString(),
    environment: { node: process.version, platform: process.platform, arch: process.arch },
    git: { head: head.stdout.trim(), dirty: status.stdout.length > 0, status: status.stdout },
    passed: checks.every((check) => check.passed), checks, context };
  writeFileSync(join(output, 'latest.json'), JSON.stringify(report, null, 2) + '\n');
  writeFileSync(join(output, 'latest.log'), logs.join('\n') + '\n' + JSON.stringify(checks, null, 2) + '\n');
  for (const check of checks) console.log(`${check.passed ? 'PASS' : 'FAIL'} ${check.name}`);
  console.log('Evidence: artifacts/harness/latest.json and latest.log (harness only)');
  return report.passed;
}
