import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync, mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
const require = createRequire(import.meta.url)
const started = performance.now()
const elapsed = since => Math.round((performance.now() - since) * 100) / 100
// Suite allocation; individual assertions and protocol deadlines remain unchanged.
const timeoutMs = 120000
mkdirSync('artifacts/native', { recursive: true })
rmSync('artifacts/native/results.json', { force: true })
const electron = require('electron')
const profile = mkdtempSync(join(tmpdir(), 'simple-timeline-native-profile-'))
const env = { ...process.env, SIMPLE_TIMELINE_NATIVE_PROFILE: profile }
delete env.ELECTRON_RUN_AS_NODE
const preparationMs = elapsed(started)
const processStarted = performance.now()
const r = spawnSync(electron, ['tests/native/runner.cjs'], {
  env,
  encoding: 'utf8',
  timeout: timeoutMs,
  maxBuffer: 4 * 1024 * 1024,
})
const processMs = elapsed(processStarted)
const cleanupStarted = performance.now()
let cleanupError
try {
  rmSync(profile, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  })
} catch (error) { cleanupError = error }
const profileCleanupMs = elapsed(cleanupStarted)
let lastPhase = { phase: 'process:start' }
for (const line of (r.stdout || '').split('\n')) {
  if (!line.startsWith('NATIVE_PHASE ')) continue
  try { lastPhase = JSON.parse(line.slice('NATIVE_PHASE '.length)) } catch { /* A killed process can leave a partial line. */ }
}
const diagnostic = {
  timeoutMs, preparationMs, processMs, profileCleanupMs, totalMs: elapsed(started),
  exitCode: r.status, signal: r.signal, errorCode: r.error?.code ?? null,
  cleanupError: cleanupError ? String(cleanupError) : null, lastPhase,
}
writeFileSync('artifacts/native/runner.json', JSON.stringify(diagnostic, null, 2))
writeFileSync(
  'artifacts/native/latest.log',
  (r.stdout || '') + (r.stderr || ''),
)
console.log(r.stdout || '')
console.log('NATIVE_RUNNER', JSON.stringify(diagnostic))
if (r.error || r.status !== 0 || cleanupError) {
  console.error(
    r.error || cleanupError || r.stderr || `Electron exited ${r.status} ${r.signal}`,
  )
  process.exit(1)
}

// A clean Electron exit is insufficient if it quit before completing the case loop.
const resultFile='artifacts/native/results.json'
if(!existsSync(resultFile)||!JSON.parse(readFileSync(resultFile,'utf8')).passed){
  console.error('Native runner did not write a successful completed result')
  process.exit(1)
}
