import { test, expect, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startupRecorder } from '../../src/main/startup'

vi.mock('node:fs/promises', async importOriginal => {
  const fs = await importOriginal<typeof import('node:fs/promises')>()
  return { ...fs, writeFile: vi.fn(fs.writeFile) }
})

test('late renderer details preserve earlier milestones and failure codes in the last serialized report', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'simple-timeline-diagnostic-'))
  try {
    const recorder = startupRecorder(dir, '0.2.1')
    recorder.mark('bootstrap')
    recorder.mark('load-failed', -6)
    recorder.mark('bootstrap')
    recorder.renderer({ clock: 'milliseconds-since-navigation-start', timeOrigin: 1, navigation: { responseEnd: 123 }, resources: [], paints: {}, moduleReady: null, uiReady: false })
    await expect.poll(async () => { try { return JSON.parse(await readFile(join(dir, 'startup-latest.json'), 'utf8')).renderer?.navigation.responseEnd } catch { return undefined } }).toBe(123)
    const result = JSON.parse(await readFile(join(dir, 'startup-latest.json'), 'utf8'))
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
  let writing = false
  const gate = new Promise<void>(r => { release = r })
  const started = new Promise<void>(r => { began = r })
  try {
    recorder.mark('bootstrap')
    await expect.poll(async () => { try { return JSON.parse(await readFile(file, 'utf8')).stages.bootstrap } catch { return undefined } }).toBeGreaterThan(0)
    const realWrite = (await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')).writeFile
    vi.mocked(fs.writeFile).mockImplementationOnce(async (path, data, options) => {
      await realWrite(path, '', options)
      writing = true
      began()
      await gate
      await realWrite(path, data, options)
    })
    recorder.mark('ui-ready')
    await started
    try {
      const previous = JSON.parse(await readFile(file, 'utf8'))
      expect(previous.stages.bootstrap).toBeGreaterThan(0)
      expect(previous.stages['ui-ready']).toBeUndefined()
    } finally { release() }
  } finally {
    release()
    if (writing) await expect.poll(async () => { try { return JSON.parse(await readFile(file, 'utf8')).stages['ui-ready'] } catch { return undefined } }).toBeGreaterThan(0)
    vi.restoreAllMocks()
    await rm(dir, { recursive: true, force: true })
  }
})
