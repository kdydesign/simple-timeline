import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const require = createRequire(import.meta.url)
mkdirSync('artifacts/native', { recursive: true })
rmSync('artifacts/native/results.json', { force: true })
const electron = require('electron')
const profile = mkdtempSync(join(tmpdir(), 'simple-timeline-native-profile-'))
const env = { ...process.env, SIMPLE_TIMELINE_NATIVE_PROFILE: profile }
delete env.ELECTRON_RUN_AS_NODE
const r = spawnSync(electron, ['tests/native/runner.cjs'], {
  env,
  encoding: 'utf8',
  timeout: 60000,
  maxBuffer: 4 * 1024 * 1024,
})
rmSync(profile, {
  recursive: true,
  force: true,
  maxRetries: 10,
  retryDelay: 100,
})
writeFileSync(
  'artifacts/native/latest.log',
  (r.stdout || '') + (r.stderr || ''),
)
console.log(r.stdout || '')
if (r.error || r.status !== 0) {
  console.error(
    r.error || r.stderr || `Electron exited ${r.status} ${r.signal}`,
  )
  process.exit(1)
}
