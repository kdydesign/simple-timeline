import { afterEach, test, expect, vi } from 'vitest'
import { mkdtemp, readFile, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startupRecorder } from '../../src/main/startup'

vi.mock('node:fs/promises', async importOriginal => {
  const fs = await importOriginal<typeof import('node:fs/promises')>()
  return { ...fs, writeFile: vi.fn(fs.writeFile), rename: vi.fn(fs.rename) }
})

afterEach(() => vi.resetAllMocks())

// Wait for the real atomic publication before opening the destination on Windows.
function nextPublications(count = 1) {
  const realFs = vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  return new Promise<void>((resolve, reject) => {
    for (let i = 1; i <= count; i++) {
      vi.mocked(rename).mockImplementationOnce(async (source, target) => {
        try {
          const fs = await realFs
          await fs.rename(source, target)
          if (i === count) resolve()
        } catch (error) {
          reject(error)
          throw error
        }
      })
    }
  })
}

test('late renderer details preserve earlier milestones and failure codes in the last serialized report', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'simple-timeline-diagnostic-'))
  try {
    const recorder = startupRecorder(dir, '0.2.1')
    const published = nextPublications(3)
    recorder.mark('bootstrap')
    recorder.mark('load-failed', -6)
    recorder.mark('bootstrap')
    recorder.renderer({ clock: 'milliseconds-since-navigation-start', timeOrigin: 1, navigation: { responseEnd: 123 }, resources: [], paints: {}, moduleReady: null, uiReady: false })
    await published
    const result = JSON.parse(await readFile(join(dir, 'startup-latest.json'), 'utf8'))
    expect(result.renderer.navigation.responseEnd).toBe(123)
    expect(result.failures).toEqual({ 'load-failed': -6 })
    expect(result.stages.bootstrap).toBeGreaterThan(0)
    expect(result.stages['load-failed']).toBeGreaterThanOrEqual(result.stages.bootstrap)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('readers retain the complete previous report while a later write is incomplete', async () => {
  const fs = await import('node:fs/promises')
  const dir = await mkdtemp(join(tmpdir(), 'simple-timeline-atomic-'))
  const file = join(dir, 'startup-latest.json')
  const recorder = startupRecorder(dir, '0.2.1')
  let release!: () => void
  let began!: () => void
  const gate = new Promise<void>(r => { release = r })
  const started = new Promise<void>(r => { began = r })
  try {
    const first = nextPublications()
    recorder.mark('bootstrap')
    await first
    const realWrite = (await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')).writeFile
    vi.mocked(fs.writeFile).mockImplementationOnce(async (path, data, options) => {
      await realWrite(path, '', options)
      began()
      await gate
      await realWrite(path, data, options)
    })
    const updated = nextPublications()
    recorder.mark('ui-ready')
    await started
    try {
      const previous = JSON.parse(await readFile(file, 'utf8'))
      expect(previous.stages.bootstrap).toBeGreaterThan(0)
      expect(previous.stages['ui-ready']).toBeUndefined()
    } finally {
      release()
      await updated
    }
    const final = JSON.parse(await readFile(file, 'utf8'))
    expect(final.stages['ui-ready']).toBeGreaterThan(0)
  } finally {
    release()
    await rm(dir, { recursive: true, force: true })
  }
})
