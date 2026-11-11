const { performance } = require('node:perf_hooks')
const started = performance.now(), startedAt = new Date().toISOString()
const elapsed = (since = started) => Math.round((performance.now() - since) * 100) / 100
const phase = (name, details = {}) => console.log('NATIVE_PHASE', JSON.stringify({ phase: name, at: new Date().toISOString(), elapsedMs: elapsed(), ...details }))
const { app } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
// Keep async native cases alive after a security-test BrowserWindow closes.
app.on('window-all-closed', () => {})
const results = [], modules = []
let readyMs = 0
phase('startup')
const profile = process.env.SIMPLE_TIMELINE_NATIVE_PROFILE
if (
  !profile ||
  !profile.startsWith(path.join(os.tmpdir(), 'simple-timeline-native-profile-'))
) {
  console.error('Isolated native profile required')
  app.exit(1)
}
app.setPath('userData', profile)
async function run() {
  if (!process.versions.electron) throw Error('Electron runtime required')
  const root = path.resolve('artifacts/native/tests/native')
  const discoveryStarted = performance.now()
  phase('discovery:start')
  const files = fs
    .readdirSync(root)
    .filter((f) => f.endsWith('.case.js'))
    .sort()
  const discoveryMs = elapsed(discoveryStarted)
  phase('discovery:complete', { durationMs: discoveryMs, files: files.length })
  let index = 0
  for (const file of files) {
    const moduleStarted = performance.now()
    phase('module:start', { file })
    const cases = require(path.join(root, file)).cases
    const moduleTiming = { file, durationMs: elapsed(moduleStarted), cases: cases.length }
    modules.push(moduleTiming)
    phase('module:complete', moduleTiming)
    for (const test of cases) {
      const caseStarted = performance.now(), identity = { index: ++index, file, name: test.name }
      phase('case:start', identity)
      const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'simple-timeline-native-'),
      )
      const cleanups = [], timing = { setupMs: elapsed(caseStarted), runMs: 0, cleanupMs: 0, totalMs: 0 }
      const runStarted = performance.now()
      try {
        await test.run({ tempDir, defer: (f) => cleanups.push(f), step: (name) => phase('case:step', { ...identity, step: name }) })
        timing.runMs = elapsed(runStarted)
        results.push({ ...identity, passed: true, timing })
        console.log('PASS', test.name, `(run ${timing.runMs} ms)`)
      } catch (e) {
        timing.runMs = elapsed(runStarted)
        results.push({
          ...identity,
          timing,
          passed: false,
          error: String(e.stack || e),
        })
        console.error('FAIL', test.name, e)
      } finally {
        const cleanupStarted = performance.now()
        phase('cleanup:start', identity)
        for (const f of cleanups.reverse()) {
          try {
            f()
          } catch (e) {
            results.push({ name: 'cleanup', caseName: test.name, file, passed: false, error: String(e) })
          }
        }
        fs.rmSync(tempDir, { recursive: true, force: true })
        timing.cleanupMs = elapsed(cleanupStarted)
        timing.totalMs = elapsed(caseStarted)
        phase('case:complete', { ...identity, ...timing })
      }
    }
  }
  const passed = results.length > 0 && results.every((r) => r.passed)
  const writeStarted = performance.now()
  phase('results:start', { cases: index })
  fs.writeFileSync(
    'artifacts/native/results.json',
    JSON.stringify(
      {
        passed,
        startedAt,
        finishedAt: new Date().toISOString(),
        timing: { readyMs, discoveryMs, totalMs: elapsed() },
        modules,
        runtime: process.versions.electron,
        abi: process.versions.modules,
        results,
      },
      null,
      2,
    ),
  )
  phase('complete', { passed, cases: index, resultWriteMs: elapsed(writeStarted) })
  app.exit(passed ? 0 : 1)
}
app
  .whenReady()
  .then(() => { readyMs = elapsed(); phase('ready', { readyMs }); return run() })
  .catch((e) => {
    phase('fatal', { error: String(e) })
    console.error(e)
    app.exit(1)
  })
