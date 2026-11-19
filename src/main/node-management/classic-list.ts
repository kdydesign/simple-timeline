import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { win32 } from 'node:path'
import { promisify } from 'node:util'
import { isNodeVersion } from '../../shared/node-management'
import type { NvmInstallation } from './discovery'
import { classicDigests, usesOfficialNodeZip } from './manager-support'
import { isSafeNvmPath, samePath } from './windows-probe'

const exec = promisify(execFile)
export function classicListContains(output: string, version: string) {
  return isNodeVersion(version) && output.split(/\r?\n/).some(line => {
    const row = /^\s*(?:\*\s+)?(\d+\.\d+\.\d+)(?: \(Currently using (?:32|64)-bit executable\))?\s*$/.exec(line)
    return row?.[1] === version
  })
}

export async function recognizesClassicVersion(installation: NvmInstallation, version: string, system: string,
  readBoundedFile: (path: string, limit: number) => Promise<Buffer>) {
  if (installation.family !== 'classic' || !usesOfficialNodeZip(installation.version) || !isNodeVersion(version)
    || classicDigests[installation.version] !== installation.executableDigest
    || ![installation.home, installation.root, installation.symlink, installation.exe].every(isSafeNvmPath)
    || !samePath(installation.exe, win32.join(installation.home, 'nvm.exe'))) return false
  const settingsPath = win32.join(installation.home, 'settings.txt')
  for (const path of [installation.root, installation.exe, settingsPath]) {
    if (!samePath(await realpath(path), path)) return false
  }
  if (!(await lstat(installation.root)).isDirectory()) return false
  const [executable, settings] = await Promise.all([
    readBoundedFile(installation.exe, 32 * 1024 * 1024), readBoundedFile(settingsPath, 64 * 1024),
  ])
  const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
  if (hash(executable) !== classicDigests[installation.version] || hash(settings) !== installation.settingsDigest) return false

  // Run the exact bytes that were checked. The classic CLI reads NVM_HOME/settings.txt
  // and may look for node on PATH while formatting the active marker.
  const configuredTemp = tmpdir()
  if (!isSafeNvmPath(configuredTemp)) return false
  const temp = await realpath(configuredTemp)
  if (!isSafeNvmPath(temp) || !(await lstat(temp)).isDirectory()) return false
  const stage = await mkdtemp(win32.join(temp, 'workrail-nvm-list-'))
  try {
    const exe = win32.join(stage, 'nvm.exe')
    await writeFile(exe, executable, { flag: 'wx' })
    await writeFile(win32.join(stage, 'settings.txt'), settings, { flag: 'wx' })
    const { stdout } = await exec(exe, ['list'], {
      cwd: stage, windowsHide: true, shell: false, timeout: 8000, maxBuffer: 256 * 1024,
      env: { SystemRoot: win32.dirname(system), Path: stage, NVM_HOME: stage, NVM_SYMLINK: installation.symlink, NoDefaultCurrentDirectoryInExePath: '1' },
    })
    return classicListContains(stdout, version)
  } finally { await rm(stage, { recursive: true, force: true }) }
}
