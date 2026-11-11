import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import path from 'node:path'
import os from 'node:os'

async function runFixture({ failCleanup = false } = {}) {
  const source = readFileSync('tests/native/runner.cjs', 'utf8')
  let clock = 0, report, finish
  const logs = [], exited = new Promise(resolve => { finish = resolve })
  const profile = path.join(os.tmpdir(), 'simple-timeline-native-profile-diagnostic')
  const app = { on() {}, setPath(name, value) { assert.equal(name, 'userData'); assert.equal(value, profile) }, whenReady: async () => { clock += 13 }, exit: finish }
  const fs = {
    readdirSync() { clock += 2; return ['fixture.case.js'] },
    mkdtempSync(prefix) { clock += 3; return prefix + 'isolated' },
    rmSync() { clock += 11 },
    writeFileSync(_file, text) { report = JSON.parse(text) },
  }
  const fixture = { name: 'diagnostic fixture', run({ defer, step }) { clock += 7; step('fixture operation'); defer(() => { clock += 5; if (failCleanup) throw Error('cleanup failed') }) } }
  const require = name => {
    if (name === 'electron') return { app }
    if (name === 'node:fs') return fs
    if (name === 'node:path') return path
    if (name === 'node:os') return os
    if (name === 'node:perf_hooks') return { performance: { now: () => clock } }
    if (name.endsWith('fixture.case.js')) { clock += 17; return { cases: [fixture] } }
    throw Error('Unexpected require: ' + name)
  }
  runInNewContext(source, { require, process: { versions: { electron: 'fixture', modules: 'fixture' }, env: { SIMPLE_TIMELINE_NATIVE_PROFILE: profile } }, console: { log: (...args) => logs.push(args.join(' ')), error: (...args) => logs.push(args.join(' ')) } })
  const exitCode = await exited
  return { exitCode, report, logs, phases: logs.filter(line => line.startsWith('NATIVE_PHASE ')).map(line => JSON.parse(line.slice('NATIVE_PHASE '.length))) }
}

test('native diagnostics identify active startup/module/case/cleanup boundaries and separate their costs', async () => {
  const { exitCode, report, phases } = await runFixture()
  assert.equal(exitCode, 0)
  assert.deepEqual(phases.map(value => value.phase), ['startup', 'ready', 'discovery:start', 'discovery:complete', 'module:start', 'module:complete', 'case:start', 'case:step', 'cleanup:start', 'case:complete', 'results:start', 'complete'])
  assert.equal(phases.find(value => value.phase === 'case:step').step, 'fixture operation')
  assert.equal(phases.find(value => value.phase === 'case:step').name, 'diagnostic fixture')
  assert.equal(phases.find(value => value.phase === 'case:step').elapsedMs, 42)
  assert.equal(report.timing.readyMs, 13)
  assert.equal(report.timing.discoveryMs, 2)
  assert.equal(report.modules[0].durationMs, 17)
  assert.equal(report.results[0].timing.setupMs, 3)
  assert.equal(report.results[0].timing.runMs, 7)
  assert.equal(report.results[0].timing.cleanupMs, 16)
  assert.equal(report.results[0].timing.totalMs, 26)
  assert.equal(phases.find(value => value.phase === 'cleanup:start').name, 'diagnostic fixture')
  assert.ok(phases.every(value => Number.isFinite(value.elapsedMs)))
})

test('timed native cleanup failures remain failures and retain the active case identity', async () => {
  const { exitCode, report, phases } = await runFixture({ failCleanup: true })
  assert.equal(exitCode, 1)
  assert.equal(report.passed, false)
  assert.ok(report.results.some(result => result.passed === false && result.error.includes('cleanup failed')))
  assert.equal(phases.find(value => value.phase === 'case:complete')?.name, 'diagnostic fixture')
})

function runWrapperFixture() {
  const source = readFileSync('scripts/testing/run-native.mjs', 'utf8')
    .replace(/^import .*\n/gm, '')
    .replace('const require = createRequire(import.meta.url)', '')
  let clock = 0, options, exitCode
  const written = {}, removed = []
  const active = { phase: 'case:step', name: 'slow fixture', step: 'host stop', elapsedMs: 299900 }
  const stop = new Error('fixture exit')
  try {
    runInNewContext(source, {
      require: () => 'electron-fixture',
      performance: { now: () => clock },
      mkdirSync() {}, rmSync(file) { removed.push(file); clock += 5 },
      mkdtempSync: () => path.join(os.tmpdir(), 'simple-timeline-native-profile-fixture'),
      writeFileSync(file, content) { written[file] = content },
      readFileSync() { throw Error('Must not accept a timed-out result') }, existsSync: () => false,
      tmpdir: os.tmpdir, join: path.join,
      process: { env: { ELECTRON_RUN_AS_NODE: '1' }, exit(code) { exitCode = code; throw stop } },
      console: { log() {}, error() {} },
      spawnSync(_binary, _args, input) {
        options = input; clock += 300000
        return { stdout: 'NATIVE_PHASE ' + JSON.stringify(active) + '\n', stderr: 'timeout stderr', status: null, signal: 'SIGTERM', error: Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }) }
      },
    })
  } catch (error) { if (error !== stop) throw error }
  return { options, exitCode, written, removed, active }
}

test('native aggregate timeout retains last phase, logs, failure and isolated profile cleanup', () => {
  const { options, exitCode, written, removed, active } = runWrapperFixture()
  assert.equal(options.timeout, 300000)
  assert.equal(options.env.ELECTRON_RUN_AS_NODE, undefined)
  assert.equal(exitCode, 1)
  const diagnostic = JSON.parse(written['artifacts/native/runner.json'])
  assert.equal(diagnostic.errorCode, 'ETIMEDOUT')
  assert.equal(diagnostic.processMs, 300000)
  assert.equal(diagnostic.profileCleanupMs, 5)
  assert.deepEqual(diagnostic.lastPhase, active)
  assert.match(written['artifacts/native/latest.log'], /timeout stderr/)
  assert.ok(removed.includes(options.env.SIMPLE_TIMELINE_NATIVE_PROFILE))
})

test('application runner allocates only the native parent command 360 seconds', () => {
  const source = readFileSync('scripts/testing/verify-app.mjs', 'utf8').replace(/^import .*\n/gm, '')
  const budgets = {}
  runInNewContext(source, {
    process: { env: { npm_execpath: 'npm-fixture' }, execPath: 'node-fixture', platform: 'fixture', arch: 'fixture', version: 'fixture' },
    mkdirSync() {}, writeFileSync() {}, console: { log() {}, error() {} },
    spawnSync(command, args, options) {
      if (command === 'node-fixture') budgets[args[2]] = options.timeout
      return { status: 0, stdout: '', stderr: '' }
    },
  })
  assert.deepEqual(budgets, { typecheck: 180000, 'test:release': 180000, 'test:tz': 180000, 'test:ui': 180000, build: 180000, 'test:native': 360000, 'test:e2e': 240000 })
})
