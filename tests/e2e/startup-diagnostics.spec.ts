import { test, expect } from './fixture'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

test('startup report separates navigation, resource loading and first paint without recording content', async ({ desktop: d }) => {
  const report = async () => JSON.parse(await readFile(join(d.profile, 'startup-latest.json'), 'utf8'))
  await expect.poll(async () => { try { return (await report()).renderer?.paints?.['first-contentful-paint'] ?? 0 } catch { return 0 } }).toBeGreaterThan(0)
  const r = await report()
  expect(r.stages['window-created']).toBeGreaterThanOrEqual(r.stages['storage-ready'])
  expect(r.stages['load-requested']).toBeGreaterThanOrEqual(r.stages['window-created'])
  expect(r.stages['dom-ready']).toBeGreaterThanOrEqual(r.stages['load-requested'])
  expect(r.renderer.navigation.responseEnd).toBeGreaterThan(0)
  expect(r.renderer.navigation.domInteractive).toBeGreaterThanOrEqual(r.renderer.navigation.responseEnd)
  expect(r.renderer.moduleReady).toBeGreaterThan(0)
  expect(r.requests.some((v: {kind: string}) => v.kind === 'script')).toBe(true)
  expect(r.requests.some((v: {kind: string}) => v.kind === 'style')).toBe(true)
  expect(JSON.stringify(r)).not.toMatch(/file:|https?:|\.sqlite|simple-timeline-e2e-|\.js["?]|\.css["?]/)
  await test.info().attach('startup-detailed', { body: JSON.stringify(r, null, 2), contentType: 'application/json' })
})

for (const startupDelayMs of [0, 5500]) test(`failed document load records its numeric failure without reporting UI ready (bootstrap delay ${startupDelayMs}ms)`, async ({}, info) => {
  const { mkdtemp, rm, writeFile } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { resolve } = await import('node:path')
  const { createRequire } = await import('node:module')
  const { spawn } = await import('node:child_process')
  const profile = await mkdtemp(join(tmpdir(), 'simple-timeline-load-failure-'))
  const env: NodeJS.ProcessEnv = { ...process.env, SIMPLE_TIMELINE_TEST_PROFILE: profile, SIMPLE_TIMELINE_TEST_FAULT: 'missing-renderer' }
  delete env.ELECTRON_RUN_AS_NODE
  const entry = resolve('artifacts/test-app/main/index.cjs')
  const delayedEntry = join(profile, 'delayed-entry.cjs')
  if (startupDelayMs) {
    // A test-only launch gate keeps the real renderer/load instrumentation unchanged.
    // Set isolated userData before Electron readiness, even while bootstrap is held.
    await writeFile(delayedEntry, `require('electron').app.setPath('userData', process.env.SIMPLE_TIMELINE_TEST_PROFILE);setTimeout(() => require(${JSON.stringify(entry)}), ${startupDelayMs});`)
  }
  const launchedAt = Date.now()
  let loadRequestedObservedAt: number | undefined
  let stdout = '', stderr = '', spawnError: string | undefined
  const child = spawn(createRequire(resolve('package.json'))('electron'), [startupDelayMs ? delayedEntry : entry], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.on('data', chunk => { stdout = (stdout + String(chunk)).slice(-65536) })
  child.stderr.on('data', chunk => { stderr = (stderr + String(chunk)).slice(-65536) })
  child.once('error', error => { spawnError = error.message })
  // 'close' also follows a spawn error, which may never emit 'exit'.
  const closed = new Promise<void>(done => child.once('close', () => done()))
  const report = () => readFile(join(profile, 'startup-latest.json'), 'utf8').then(JSON.parse)
  try {
    // As in fixture.ts, allow up to 30s for Electron/app startup. The 5s error
    // assertion below begins only after this real load-requested boundary.
    await expect.poll(async () => {
      const stage = await report().then(r => r.stages?.['load-requested']).catch(() => undefined)
      if (stage === undefined && (spawnError || child.exitCode !== null || child.signalCode !== null)) {
        throw Error(`Electron stopped before load-requested: ${spawnError ?? child.exitCode ?? child.signalCode}`)
      }
      return stage
    }, {timeout: 30000, message: 'Electron must reach load-requested within the launch budget'}).toBeGreaterThanOrEqual(0)
    loadRequestedObservedAt = Date.now()
    await expect.poll(async () => { try { return (await report()).failures?.['load-failed'] } catch { return undefined } }, {timeout: 5000}).toBe(-6)
    const result = await report()
    expect(result.stages['load-requested']).toBeGreaterThanOrEqual(startupDelayMs)
    expect(result.stages['load-failed']).toBeGreaterThanOrEqual(result.stages['load-requested'])
    expect(result.stages['ui-ready']).toBeUndefined()
    expect(JSON.stringify(result)).not.toContain(profile)
  } finally {
    const lastReport = await report().catch((error: NodeJS.ErrnoException) => ({ unavailable: error.code ?? 'unreadable' }))
    const processState = { startupDelayMs, launchedAt, loadRequestedObservedAt, elapsedMs: Date.now() - launchedAt, pid: child.pid, exitCode: child.exitCode, signalCode: child.signalCode, spawnError }
    try {
      await info.attach('startup-load-failure-evidence', { body: JSON.stringify({ process: processState, report: lastReport }, null, 2), contentType: 'application/json' })
      await info.attach('electron-stderr', { body: stderr.replaceAll(profile, '<isolated-profile>'), contentType: 'text/plain' })
      await info.attach('electron-stdout', { body: stdout.replaceAll(profile, '<isolated-profile>'), contentType: 'text/plain' })
    } finally {
      child.kill()
      await closed
      await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    }
  }
})
