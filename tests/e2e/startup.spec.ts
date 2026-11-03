import { test, expect } from '@playwright/test'
import { existsSync } from 'node:fs'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
const require = createRequire(resolve('package.json'))
test('profile-root failures are explained and preserve the occupied path', async () => {
  const root = await mkdtemp(join(tmpdir(), 'simple-timeline-startup-')),
    profile = join(root, 'occupied')
  await writeFile(profile, 'preserve this file')
  try {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      SIMPLE_TIMELINE_TEST_PROFILE: profile,
      SIMPLE_TIMELINE_TEST_FAULT: 'startup',
    }
    delete env.ELECTRON_RUN_AS_NODE
    const child = spawn(
      require('electron'),
      [resolve('artifacts/test-app/main/index.cjs')],
      { env, stdio: 'ignore' },
    )
    const code = await new Promise<number | null>((done, reject) => {
      const timer = setTimeout(() => {
        child.kill()
        reject(Error('Startup explanation timeout'))
      }, 15000)
      child.once('error', reject)
      child.once('exit', (code) => {
        clearTimeout(timer)
        done(code)
      })
    })
    expect(code).toBe(1)
    expect(existsSync(join(root, 'startup-error.json'))).toBe(true)
    const report = JSON.parse(
      await readFile(join(root, 'startup-error.json'), 'utf8'),
    )
    expect(report).toMatchObject({ code: 'STORAGE_IO' })
    expect(report.message.length).toBeGreaterThan(0)
    expect(await readFile(profile, 'utf8')).toBe('preserve this file')
  } finally {
    await rm(root, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    })
  }
})
