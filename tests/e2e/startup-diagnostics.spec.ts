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

test('failed document load records its numeric failure without reporting UI ready', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { resolve } = await import('node:path')
  const { createRequire } = await import('node:module')
  const { spawn } = await import('node:child_process')
  const profile = await mkdtemp(join(tmpdir(), 'simple-timeline-load-failure-'))
  const env: NodeJS.ProcessEnv = { ...process.env, SIMPLE_TIMELINE_TEST_PROFILE: profile, SIMPLE_TIMELINE_TEST_FAULT: 'missing-renderer' }
  delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(createRequire(resolve('package.json'))('electron'), [resolve('artifacts/test-app/main/index.cjs')], { env, stdio: 'ignore' })
  const exited = new Promise<void>(done => child.once('exit', () => done()))
  try {
    await expect.poll(async () => { try { return JSON.parse(await readFile(join(profile, 'startup-latest.json'), 'utf8')).failures?.['load-failed'] } catch { return undefined } }, {timeout: 5000}).toBe(-6)
    const report = JSON.parse(await readFile(join(profile, 'startup-latest.json'), 'utf8'))
    expect(report.stages['ui-ready']).toBeUndefined()
    expect(JSON.stringify(report)).not.toContain(profile)
  } finally {
    child.kill()
    await exited
    await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
})
