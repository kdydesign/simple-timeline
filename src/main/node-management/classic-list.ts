import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { win32 } from 'node:path'
import { promisify } from 'node:util'
import { isNodeVersion } from '../../shared/node-management'
import type { NvmInstallation } from './discovery'
import { isSafeNvmPath, samePath } from './windows-probe'

const exec = promisify(execFile)
const classicRow = /^\s*(?:\*\s+)?(\d+\.\d+\.\d+)(?: \(Currently using (?:32|64)-bit executable\))?\s*$/
export function parseClassicList(output: string): string[] | null {
  const rows = output.trim().split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  if (rows.length === 1 && rows[0] === 'No installations recognized.') return []
  const versions = rows.map(line => classicRow.exec(line)?.[1])
  return versions.length && versions.every(isNodeVersion) ? versions : null
}

export function parseModernList(output: string): string[] | null {
  const rows = output.trim().split(/\r?\n/).map(row => row.trim()).filter(Boolean)
  if (rows.length === 1 && rows[0] === 'No versions installed.') return []
  const versions = rows.map(line => /^(?:\*\s+)?(\d+\.\d+\.\d+)(?:\s+\(default\))?$/.exec(line)?.[1])
  return versions.length && versions.every(isNodeVersion) ? versions : null
}

export async function readClassicList(installation: NvmInstallation, system: string,
  readBoundedFile: (path: string, limit: number) => Promise<Buffer>, verifiedManagerVersion: string | undefined) {
  if (installation.family !== 'classic'
    || verifiedManagerVersion !== installation.version
    || ![installation.home, installation.root, installation.symlink, installation.exe].every(isSafeNvmPath)
    || !samePath(installation.exe, win32.join(installation.home, 'nvm.exe'))) return null
  const settingsPath = win32.join(installation.home, 'settings.txt')
  for (const path of [installation.root, installation.exe, settingsPath]) {
    if (!samePath(await realpath(path), path)) return null
  }
  if (!(await lstat(installation.root)).isDirectory()) return null
  const [executable, settings] = await Promise.all([
    readBoundedFile(installation.exe, 32 * 1024 * 1024), readBoundedFile(settingsPath, 64 * 1024),
  ])
  const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
  if (hash(executable) !== installation.executableDigest || hash(settings) !== installation.settingsDigest) return null

  // Run the exact bytes that were checked. The classic CLI reads NVM_HOME/settings.txt
  // and may look for node on PATH while formatting the active marker.
  const configuredTemp = tmpdir()
  if (!isSafeNvmPath(configuredTemp)) return null
  const temp = await realpath(configuredTemp)
  if (!isSafeNvmPath(temp) || !(await lstat(temp)).isDirectory()) return null
  const stage = await mkdtemp(win32.join(temp, 'workrail-nvm-list-'))
  try {
    const exe = win32.join(stage, 'nvm.exe')
    await writeFile(exe, executable, { flag: 'wx' })
    await writeFile(win32.join(stage, 'settings.txt'), settings, { flag: 'wx' })
    const { stdout } = await exec(exe, ['list'], {
      cwd: stage, windowsHide: true, shell: false, timeout: 8000, maxBuffer: 256 * 1024,
      env: { SystemRoot: win32.dirname(system), Path: stage, NVM_HOME: stage, NVM_SYMLINK: installation.symlink, NoDefaultCurrentDirectoryInExePath: '1' },
    })
    return parseClassicList(stdout)
  } finally { await rm(stage, { recursive: true, force: true }) }
}
