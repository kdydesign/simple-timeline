import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createMachineMutationLock } from '../../src/main/node-management/mutation-lock'

describe('persistent machine mutation lease', () => {
  it('serializes distinct instances and never releases an orphan merely because the app exited', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'workrail-lock-test-'))
    try {
      const first = createMachineMutationLock(directory, 'boot-one')
      const second = createMachineMutationLock(directory, 'boot-one')
      const lease = await first.acquire('remove-standalone')
      await expect(second.acquire('install-manager')).rejects.toThrow('operation-unknown')
      expect(await createMachineMutationLock(directory, 'boot-one').status()).toBe('operation-unknown')
      await lease.finish('unknown')
      await expect(second.acquire('use')).rejects.toThrow('operation-unknown')
      expect(await createMachineMutationLock(directory, 'boot-two').status()).toBe('clear')
      await (await createMachineMutationLock(directory, 'boot-two').acquire('install-manager')).finish('complete')
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
  it('releases only definite completion and retains reboot requirements across service reconstruction', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'workrail-lock-test-'))
    try {
      const lock = createMachineMutationLock(directory, 'boot-one')
      await (await lock.acquire('install')).finish('complete')
      expect(await lock.status()).toBe('clear')
      await (await lock.acquire('remove-standalone')).finish('reboot-required')
      expect(await createMachineMutationLock(directory, 'boot-one').status()).toBe('reboot-required')
      await expect(createMachineMutationLock(directory, 'boot-one').acquire('use')).rejects.toThrow('reboot-required')
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
  it('allows exactly one simultaneous process-independent reservation', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'workrail-lock-test-'))
    try {
      const results = await Promise.allSettled(Array.from({ length: 12 }, () => createMachineMutationLock(directory, 'same-boot').acquire('install')))
      expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
      expect(results.filter(result => result.status === 'rejected')).toHaveLength(11)
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
})

it('retains minimum recovery evidence without persisting confirmation authority', async () => {
  const { readdir, readFile } = await import('node:fs/promises')
  const directory = await mkdtemp(join(tmpdir(), 'workrail-lock-test-'))
  try {
    const lease = await createMachineMutationLock(directory, 'boot-record').acquire('remove-standalone')
    await lease.record({ phase: 'waiting', target: { fingerprint: 'f'.repeat(64), productCode: '{01234567-89AB-CDEF-0123-456789ABCDEF}', version: '24.22.3', path: 'C:\\Program Files\\nodejs\\node.exe' } })
    await lease.record({ phase: 'verifying', msiExitCode: 3010 })
    await lease.finish('reboot-required')
    const record = JSON.parse(await readFile(join(directory, (await readdir(directory))[0]), 'utf8'))
    expect(record).toMatchObject({ kind: 'remove-standalone', phase: 'reboot-required', msiExitCode: 3010, target: { version: '24.22.3' }, ownerPid: process.pid })
    expect(record).not.toHaveProperty('confirmationId')
  } finally { await rm(directory, { recursive: true, force: true }) }
})

it('blocks a second process after the owner exits while its independent worker remains alive', async () => {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const { pathToFileURL } = await import('node:url')
  const directory = await mkdtemp(join(tmpdir(), 'workrail-lock-process-test-'))
  let workerPid: number | undefined
  try {
    const moduleUrl = pathToFileURL(join(process.cwd(), 'src/main/node-management/mutation-lock.ts')).href
    const script = `
      import { createMachineMutationLock } from ${JSON.stringify(moduleUrl)};
      import { spawn } from 'node:child_process';
      await createMachineMutationLock(${JSON.stringify(directory)}, 'shared-boot').acquire('remove-standalone');
      const worker = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], { detached: true, stdio: 'ignore' });
      worker.unref();
      console.log(worker.pid);
    `
    const result = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', script])
    workerPid = Number(result.stdout.trim())
    expect(Number.isInteger(workerPid) && workerPid > 0).toBe(true)
    process.kill(workerPid, 0)
    await expect(createMachineMutationLock(directory, 'shared-boot').acquire('install-manager')).rejects.toThrow('operation-unknown')
  } finally {
    if (workerPid) { try { process.kill(workerPid, 'SIGTERM') } catch { /* only this test's child */ } }
    await rm(directory, { recursive: true, force: true })
  }
})
