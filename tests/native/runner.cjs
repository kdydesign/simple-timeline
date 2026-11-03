const { app } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const results = []
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
  const files = fs
    .readdirSync(root)
    .filter((f) => f.endsWith('.case.js'))
    .sort()
  for (const file of files) {
    for (const test of require(path.join(root, file)).cases) {
      const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'simple-timeline-native-'),
      )
      const cleanups = []
      try {
        await test.run({ tempDir, defer: (f) => cleanups.push(f) })
        results.push({ name: test.name, passed: true })
        console.log('PASS', test.name)
      } catch (e) {
        results.push({
          name: test.name,
          passed: false,
          error: String(e.stack || e),
        })
        console.error('FAIL', test.name, e)
      } finally {
        for (const f of cleanups.reverse()) {
          try {
            f()
          } catch (e) {
            results.push({ name: 'cleanup', passed: false, error: String(e) })
          }
        }
        fs.rmSync(tempDir, { recursive: true, force: true })
      }
    }
  }
  const passed = results.length > 0 && results.every((r) => r.passed)
  fs.writeFileSync(
    'artifacts/native/results.json',
    JSON.stringify(
      {
        passed,
        runtime: process.versions.electron,
        abi: process.versions.modules,
        results,
      },
      null,
      2,
    ),
  )
  app.exit(passed ? 0 : 1)
}
app
  .whenReady()
  .then(run)
  .catch((e) => {
    console.error(e)
    app.exit(1)
  })
