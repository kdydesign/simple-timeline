import { createHash, randomBytes } from 'node:crypto'
import { lstat, mkdir, open, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { NodeOperation } from '../../shared/node-management'

export interface MutationRecoveryDetails {
  phase?: string
  target?: { fingerprint: string; productCode: string; version: string; path: string }
  msiExitCode?: number | null
}
export interface MachineMutationLease {
  record(details: MutationRecoveryDetails): Promise<void>
  finish(outcome: 'complete' | 'unknown' | 'reboot-required'): Promise<void>
}
/** A persistent, per-boot machine reservation. No PID timeout/reuse heuristic can unlock it.
 * An orphan remains blocked for this entire boot, including when the UAC worker outlives main.
 * A new verified OS boot uses a new slot; old diagnostics are deliberately retained.
 */
export function createMachineMutationLock(directory: string, bootIdentity: string, ownerIdentity: { startedAt?: string; userSid?: string } = {}) {
  if (!bootIdentity) throw Error('Missing Windows boot identity')
  const path = join(directory, createHash('sha256').update(bootIdentity).digest('hex') + '.json')
  async function read() {
    try {
      const metadata = await lstat(path)
      if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 4096) throw Error('Invalid mutation record')
      return JSON.parse(await readFile(path, 'utf8')) as { token: string; phase: string }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      return { token: '', phase: 'unknown' }
    }
  }
  async function status(): Promise<'clear' | 'reboot-required' | 'operation-unknown'> {
    const record = await read()
    return !record ? 'clear' : record.phase === 'reboot-required' ? 'reboot-required' : 'operation-unknown'
  }
  return {
    status,
    async acquire(kind: NodeOperation['kind']): Promise<MachineMutationLease> {
      await mkdir(directory, { recursive: true })
      if (!(await lstat(directory)).isDirectory() || (await lstat(directory)).isSymbolicLink()) throw Error('operation-unknown')
      let record = { ownerIdentity, token: randomBytes(32).toString('hex'), phase: 'running', kind, ownerPid: process.pid, startedAt: new Date().toISOString() } as MutationRecoveryDetails & { token: string; phase: string; kind: string; ownerPid: number; startedAt: string; ownerIdentity: typeof ownerIdentity }
      let handle
      try { handle = await open(path, 'wx', 0o600) } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw Error(await status())
        throw Error('operation-unknown')
      }
      try { await handle.writeFile(JSON.stringify(record)); await handle.sync() } finally { await handle.close() }
      let finished = false
      async function recordDetails(details: MutationRecoveryDetails) {
        if (finished || (await read())?.token !== record.token) throw Error('operation-unknown')
        record = { ...record, ...details }
        const writer = await open(path, 'r+')
        try { await writer.truncate(0); await writer.writeFile(JSON.stringify(record)); await writer.sync() } finally { await writer.close() }
      }
      return {
        record: recordDetails,
        async finish(outcome) {
          if (finished) return
          const current = await read()
          if (current?.token !== record.token) throw Error('operation-unknown')
          await recordDetails({ phase: outcome })
          if (outcome === 'complete') {
            await writeFile(join(directory, record.token + '.history.json'), JSON.stringify(record), { flag: 'wx', mode: 0o600 })
            await unlink(path)
          }
          finished = true
        },
      }
    },
  }
}
